
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_KEY = "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";

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

    // Create system prompt with package information
    const packageInfo = packages?.map(pkg => 
      `${pkg.name}: KSh ${pkg.price} for ${pkg.duration_minutes} minutes`
    ).join('\n') || '';

    const systemPrompt = `You are a helpful WiFi customer service assistant for Premium WiFi Services. Your role is to help customers:

1. Purchase WiFi packages
2. Get reconnection codes for existing payments
3. Answer questions about available packages

Available WiFi Packages:
${packageInfo}

Guidelines:
- Be friendly and professional
- Keep responses concise but helpful
- For package purchases, collect phone number for M-Pesa payment
- For reconnections, ask for their phone number to find existing payments
- Always mention that payments are processed via M-Pesa
- If asked about technical issues, direct them to support

Customer's MAC Address: ${macAddress}
${phoneNumber ? `Customer's Phone: ${phoneNumber}` : 'No phone number provided yet'}

Current conversation context: You are helping a customer who wants to access WiFi.`;

    // Prepare messages for Groq
    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: message }
    ];

    // Call Groq API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!groqResponse.ok) {
      throw new Error(`Groq API error: ${groqResponse.statusText}`);
    }

    const groqData = await groqResponse.json();
    const assistantMessage = groqData.choices[0].message.content;

    // Store user message
    await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: message
      });

    // Store assistant response
    await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: assistantMessage
      });

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
