
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Groq chat function...')
    
    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY not found in environment')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "AI service configuration error",
          message: "I'm having trouble connecting to the AI service. Please try again later."
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const requestBody = await req.json().catch(() => ({}))
    const { message, conversationId, macAddress, phoneNumber, username } = requestBody

    console.log('Received request:', { message, conversationId, macAddress, phoneNumber, username })

    if (!message || !conversationId || !macAddress) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Missing required parameters",
          message: "Please provide all required information."
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    // Get available packages for context
    const { data: packages, error: packagesError } = await supabase
      .from('access_packages')
      .select('*')
      .eq('is_active', true)
      .order('price');

    console.log('Fetched packages:', packages?.length || 0, 'packages')

    // Get conversation history (last 10 messages)
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at')
      .limit(10);

    console.log('Fetched conversation history:', messages?.length || 0, 'messages')

    // Build conversation context
    const conversationHistory = messages?.map(msg => ({
      role: msg.role,
      content: msg.content
    })) || [];

    // Create enhanced system prompt with package information and payment integration
    const packageInfo = packages?.map(pkg => 
      `${pkg.name}: KSh ${pkg.price} for ${pkg.duration_minutes} minutes (ID: ${pkg.id})`
    ).join('\n') || 'No packages available';

    const systemPrompt = `You are a helpful WiFi customer service assistant for Premium WiFi Services. You help customers with:

1. **WiFi Package Selection & M-Pesa Payments**
2. **Reconnection using existing codes**
3. **Technical support and troubleshooting**
4. **General inquiries about our services**

Available WiFi Packages:
${packageInfo}

Customer Information:
- MAC Address: ${macAddress}
- Phone Number: ${phoneNumber || 'Not provided yet'}
- Username: ${username || 'Guest'}

IMPORTANT INSTRUCTIONS:
- When a customer wants to purchase a package, guide them through the process step by step
- If they don't have a phone number yet, ask for their M-Pesa phone number
- For payments, explain that they will receive an STK push notification on their phone
- Always be helpful, friendly, and provide clear instructions
- Keep responses concise but informative
- If asked about reconnection codes, explain they get one after successful payment
- For technical issues, provide step-by-step troubleshooting

Be conversational and helpful. Always end responses with a question or call to action to keep the conversation flowing.`;

    // Prepare messages for Groq
    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: message }
    ];

    console.log('Sending to Groq API with', groqMessages.length, 'messages')

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
        max_tokens: 800,
        stream: false
      }),
    });

    console.log('Groq response status:', groqResponse.status)

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text().catch(() => 'Unknown error');
      console.error('Groq API error:', groqResponse.status, errorText);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `AI service error: ${groqResponse.status}`,
          message: "I'm having trouble processing your request right now. Please try again in a moment."
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    const groqData = await groqResponse.json().catch(() => null);
    
    if (!groqData || !groqData.choices || !groqData.choices[0] || !groqData.choices[0].message) {
      console.error('Invalid Groq response structure:', groqData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid AI response',
          message: "I'm having trouble generating a response. Please try rephrasing your question."
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    const assistantMessage = groqData.choices[0].message.content;
    console.log('Generated assistant message length:', assistantMessage?.length || 0)

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

    console.log('Chat function completed successfully')

    return new Response(
      JSON.stringify({ 
        message: assistantMessage,
        success: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Groq chat function error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error',
        message: "I'm sorry, I'm having trouble right now. Please try again or contact support if the issue persists."
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  }
})
