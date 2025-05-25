
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
    console.log('Session manager action:', action)

    if (action === 'activate') {
      // Activate session after successful payment
      const { data: session, error } = await supabase
        .from('user_sessions')
        .update({ 
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .select()
        .single()

      if (error) throw error

      // Send authorization to RADIUS
      const radiusAuth = await supabase.functions.invoke('radius-auth', {
        body: { action: 'authorize', sessionId, macAddress }
      })

      console.log('Session activated:', sessionId)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          session: session,
          message: 'Session activated successfully' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'deactivate') {
      // Deactivate session
      const { error } = await supabase
        .from('user_sessions')
        .update({ 
          status: 'terminated',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)

      if (error) throw error

      // Disconnect from RADIUS
      await supabase.functions.invoke('radius-auth', {
        body: { action: 'disconnect', sessionId, macAddress }
      })

      console.log('Session deactivated:', sessionId)
      
      return new Response(
        JSON.stringify({ success: true, message: 'Session deactivated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'check-expired') {
      // Check and terminate expired sessions
      const { data: expiredSessions, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('status', 'active')
        .lt('expires_at', new Date().toISOString())

      if (error) throw error

      for (const session of expiredSessions || []) {
        // Terminate expired session
        await supabase
          .from('user_sessions')
          .update({ status: 'expired' })
          .eq('id', session.id)

        // Disconnect from RADIUS
        await supabase.functions.invoke('radius-auth', {
          body: { 
            action: 'disconnect', 
            sessionId: session.id, 
            macAddress: session.mac_address 
          }
        })
      }

      console.log('Expired sessions processed:', expiredSessions?.length || 0)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          expiredCount: expiredSessions?.length || 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action')

  } catch (error) {
    console.error('Session manager error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
