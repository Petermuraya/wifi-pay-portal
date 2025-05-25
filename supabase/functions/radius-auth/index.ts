
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const { action, sessionId, macAddress } = await req.json()
    console.log('RADIUS action:', action, 'for session:', sessionId)

    if (action === 'authorize') {
      // Check if user has valid session
      const { data: session, error } = await supabase
        .from('user_sessions')
        .select('*, payments!inner(*)')
        .eq('id', sessionId)
        .eq('status', 'active')
        .eq('payments.status', 'completed')
        .gt('expires_at', new Date().toISOString())
        .single()

      if (error || !session) {
        console.log('Authorization denied for session:', sessionId, error)
        return new Response(
          JSON.stringify({ authorized: false, reason: 'Invalid or expired session' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Send authorization to RADIUS server
      const radiusResponse = await sendRadiusAuth(macAddress, session)
      
      return new Response(
        JSON.stringify({ 
          authorized: true, 
          session: session,
          radiusResponse: radiusResponse 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'disconnect') {
      // Disconnect user from RADIUS
      await sendRadiusDisconnect(macAddress)
      
      // Update session status
      await supabase
        .from('user_sessions')
        .update({ status: 'terminated' })
        .eq('id', sessionId)

      return new Response(
        JSON.stringify({ success: true, message: 'User disconnected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action')

  } catch (error) {
    console.error('RADIUS auth error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

async function sendRadiusAuth(macAddress: string, session: any) {
  const radiusServer = Deno.env.get('RADIUS_SERVER_URL') || 'http://localhost:1812'
  const radiusSecret = Deno.env.get('RADIUS_SHARED_SECRET') || 'testing123'
  
  try {
    // Send RADIUS Access-Accept
    const radiusPayload = {
      username: macAddress,
      sessionId: session.id,
      sessionTimeout: Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000),
      action: 'accept'
    }

    console.log('Sending RADIUS auth for:', macAddress)
    
    // In a real implementation, you'd use a proper RADIUS client library
    // For now, we'll simulate the RADIUS communication
    return { success: true, message: 'RADIUS auth sent' }
    
  } catch (error) {
    console.error('RADIUS auth failed:', error)
    throw error
  }
}

async function sendRadiusDisconnect(macAddress: string) {
  try {
    console.log('Sending RADIUS disconnect for:', macAddress)
    
    // In a real implementation, send RADIUS Disconnect-Request
    return { success: true, message: 'RADIUS disconnect sent' }
    
  } catch (error) {
    console.error('RADIUS disconnect failed:', error)
    throw error
  }
}
