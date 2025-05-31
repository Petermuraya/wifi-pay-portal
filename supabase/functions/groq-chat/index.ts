
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || "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";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const { message, conversationId, macAddress, phoneNumber } = await req.json()

    console.log('Received request:', { message, conversationId, macAddress, phoneNumber });

    // Get available packages for context
    const { data: packages } = await supabase
      .from('access_packages')
      .select('*')
      .eq('is_active', true)
      .order('price');

    // Get conversation history
    const { data: messages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at');

    // Build conversation context
    const conversationHistory = messages?.map(msg => ({
      role: msg.role,
      content: msg.content
    })) || [];

    // Check for M-Pesa payment intent
    const paymentIntent = detectPaymentIntent(message, conversationHistory);
    
    // Check for reconnection code intent
    const reconnectionIntent = detectReconnectionIntent(message);

    // Create system prompt with package information and smart capabilities
    const packageInfo = packages?.map(pkg => 
      `${pkg.name}: KSh ${pkg.price} for ${pkg.duration_minutes} minutes`
    ).join('\n') || '';

    const systemPrompt = `You are an intelligent WiFi customer service assistant for Premium WiFi Services. You can help customers with:

1. **WiFi Package Purchases & M-Pesa Payments**
2. **Reconnection using existing codes**
3. **Technical support and questions**

Available WiFi Packages:
${packageInfo}

INTELLIGENT CAPABILITIES:
- When a customer provides a phone number and wants to purchase a package, automatically initiate M-Pesa STK push
- When a customer provides a 6-digit code, check if it's a reconnection code
- Remember previous conversations and context
- Be proactive in suggesting solutions

PAYMENT PROCESSING:
- If customer shows payment intent with phone number, guide them through M-Pesa payment
- Explain the STK push process clearly
- Provide payment status updates

RECONNECTION CODES:
- 6-digit codes are typically reconnection codes
- Guide customers through the reconnection process
- Verify code validity

Customer's MAC Address: ${macAddress}
${phoneNumber ? `Customer's Phone: ${phoneNumber}` : 'No phone number provided yet'}

Be conversational, helpful, and proactive. If you detect payment or reconnection intent, guide them accordingly.`;

    // Prepare messages for Groq
    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: message }
    ];

    console.log('Sending to Groq:', { 
      model: 'llama-3.1-8b-instant',
      messagesCount: groqMessages.length,
      paymentIntent,
      reconnectionIntent
    });

    // Call Groq API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 500,
        stream: false
      }),
    });

    console.log('Groq response status:', groqResponse.status);

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error response:', errorText);
      throw new Error(`Groq API error: ${groqResponse.status} - ${errorText}`);
    }

    const groqData = await groqResponse.json();
    console.log('Groq response data:', groqData);

    if (!groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
      throw new Error('Invalid response structure from Groq API');
    }

    let assistantMessage = groqData.choices[0].message.content;

    // Handle smart payment processing
    if (paymentIntent.detected && paymentIntent.phoneNumber && paymentIntent.packageId) {
      try {
        const paymentResult = await processPayment(supabase, {
          phoneNumber: paymentIntent.phoneNumber,
          packageId: paymentIntent.packageId,
          macAddress
        });
        
        assistantMessage += `\n\n💳 I've initiated your M-Pesa payment of KSh ${paymentResult.amount}. Please check your phone for the payment prompt and enter your M-Pesa PIN to complete the transaction.`;
      } catch (error) {
        console.error('Payment processing error:', error);
        assistantMessage += `\n\n❌ I encountered an issue processing your payment. Please try again or contact support.`;
      }
    }

    // Handle smart reconnection
    if (reconnectionIntent.detected && reconnectionIntent.code) {
      try {
        const reconnectionResult = await processReconnection(supabase, {
          code: reconnectionIntent.code,
          macAddress
        });
        
        if (reconnectionResult.success) {
          assistantMessage += `\n\n✅ Reconnection successful! Your internet access has been restored using code ${reconnectionIntent.code}.`;
        } else {
          assistantMessage += `\n\n❌ Invalid or expired reconnection code. Please check the code or make a new payment.`;
        }
      } catch (error) {
        console.error('Reconnection error:', error);
        assistantMessage += `\n\n❌ I encountered an issue with the reconnection code. Please try again or contact support.`;
      }
    }

    // Store user message
    const { error: userMessageError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: message
      });

    if (userMessageError) {
      console.error('Error storing user message:', userMessageError);
    }

    // Store assistant response
    const { error: assistantMessageError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: assistantMessage
      });

    if (assistantMessageError) {
      console.error('Error storing assistant message:', assistantMessageError);
    }

    return new Response(
      JSON.stringify({ 
        message: assistantMessage,
        success: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Groq chat error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        message: "I'm sorry, I'm having trouble right now. Please try again or contact support."
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

// Smart intent detection functions
function detectPaymentIntent(message: string, history: any[]) {
  const phoneRegex = /(?:0|\+254|254)?[7][0-9]{8}/g;
  const paymentKeywords = ['buy', 'purchase', 'pay', 'package', 'internet', 'wifi', 'access'];
  
  const phoneMatch = message.match(phoneRegex);
  const hasPaymentKeywords = paymentKeywords.some(keyword => 
    message.toLowerCase().includes(keyword)
  );
  
  // Look for package references
  let packageId = null;
  if (message.includes('20') || message.includes('1 hour')) packageId = '1-hour';
  if (message.includes('50') || message.includes('3 hour')) packageId = '3-hour';
  if (message.includes('100') || message.includes('day')) packageId = 'day';
  
  return {
    detected: phoneMatch && (hasPaymentKeywords || packageId),
    phoneNumber: phoneMatch ? phoneMatch[0] : null,
    packageId
  };
}

function detectReconnectionIntent(message: string) {
  const codeRegex = /\b\d{6}\b/g;
  const reconnectionKeywords = ['reconnect', 'code', 'access'];
  
  const codeMatch = message.match(codeRegex);
  const hasReconnectionKeywords = reconnectionKeywords.some(keyword => 
    message.toLowerCase().includes(keyword)
  );
  
  return {
    detected: codeMatch && (hasReconnectionKeywords || codeMatch.length === 1),
    code: codeMatch ? codeMatch[0] : null
  };
}

// Smart payment processing
async function processPayment(supabase: any, { phoneNumber, packageId, macAddress }: any) {
  // Get package details
  const { data: packages } = await supabase
    .from('access_packages')
    .select('*')
    .eq('is_active', true);
  
  const selectedPackage = packages?.find((pkg: any) => {
    if (packageId === '1-hour') return pkg.duration_minutes === 60;
    if (packageId === '3-hour') return pkg.duration_minutes === 180;
    if (packageId === 'day') return pkg.duration_minutes === 1440;
    return pkg.price === 20; // Default to cheapest
  }) || packages?.[0];
  
  if (!selectedPackage) throw new Error('No packages available');
  
  // Create session
  const { data: session, error: sessionError } = await supabase
    .from("user_sessions")
    .insert({
      mac_address: macAddress,
      phone_number: phoneNumber,
      expires_at: new Date(Date.now() + selectedPackage.duration_minutes * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (sessionError) throw sessionError;

  // Create payment
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      session_id: session.id,
      phone_number: phoneNumber,
      amount: selectedPackage.price,
      status: "pending",
    })
    .select()
    .single();

  if (paymentError) throw paymentError;

  // Initiate STK Push
  const { error: stkError } = await supabase.functions.invoke('mpesa-stk-push', {
    body: {
      paymentId: payment.id,
      phoneNumber: phoneNumber,
      amount: selectedPackage.price
    }
  });

  if (stkError) throw stkError;
  
  return { amount: selectedPackage.price, paymentId: payment.id };
}

// Smart reconnection processing
async function processReconnection(supabase: any, { code, macAddress }: any) {
  // Find payment with reconnection code
  const { data: payment, error } = await supabase
    .from("payments")
    .select("*, user_sessions(*)")
    .eq("reconnection_code", code)
    .eq("reconnection_code_used", false)
    .eq("status", "completed")
    .single();

  if (error || !payment) return { success: false };
  
  // Verify MAC address matches
  if (payment.user_sessions?.mac_address !== macAddress) {
    return { success: false };
  }

  // Mark code as used
  await supabase
    .from("payments")
    .update({ reconnection_code_used: true })
    .eq("id", payment.id);

  // Activate session
  await supabase
    .from("user_sessions")
    .update({ 
      status: "active",
      updated_at: new Date().toISOString()
    })
    .eq("id", payment.session_id);

  // Call RADIUS auth
  await supabase.functions.invoke('radius-auth', {
    body: { 
      action: 'authorize', 
      sessionId: payment.session_id, 
      macAddress 
    }
  });

  return { success: true };
}
