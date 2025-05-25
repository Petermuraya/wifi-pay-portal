
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

    const { action, packageId, quantity = 1, adminKey } = await req.json()

    // Verify admin access
    if (adminKey !== Deno.env.get('ADMIN_SECRET_KEY')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      )
    }

    if (action === 'generate') {
      const vouchers = []
      
      for (let i = 0; i < quantity; i++) {
        const voucherCode = generateVoucherCode()
        
        const { data: voucher, error } = await supabase
          .from('vouchers')
          .insert({
            code: voucherCode,
            package_id: packageId,
            status: 'unused',
            created_at: new Date().toISOString()
          })
          .select()
          .single()

        if (error) throw error
        vouchers.push(voucher)
      }

      console.log('Generated vouchers:', vouchers.length)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          vouchers: vouchers,
          message: `Generated ${vouchers.length} voucher(s)` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'redeem') {
      const { voucherCode, macAddress } = await req.json()
      
      // Find unused voucher
      const { data: voucher, error: voucherError } = await supabase
        .from('vouchers')
        .select('*, access_packages(*)')
        .eq('code', voucherCode)
        .eq('status', 'unused')
        .single()

      if (voucherError || !voucher) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid or already used voucher code' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Create user session
      const { data: session, error: sessionError } = await supabase
        .from('user_sessions')
        .insert({
          mac_address: macAddress,
          phone_number: 'voucher-user',
          expires_at: new Date(Date.now() + voucher.access_packages.duration_minutes * 60 * 1000).toISOString(),
          status: 'active'
        })
        .select()
        .single()

      if (sessionError) throw sessionError

      // Mark voucher as used
      await supabase
        .from('vouchers')
        .update({ 
          status: 'used',
          used_at: new Date().toISOString(),
          session_id: session.id
        })
        .eq('id', voucher.id)

      // Activate session
      await supabase.functions.invoke('session-manager', {
        body: { 
          action: 'activate', 
          sessionId: session.id, 
          macAddress: macAddress 
        }
      })

      console.log('Voucher redeemed:', voucherCode)
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          session: session,
          package: voucher.access_packages,
          message: 'Voucher redeemed successfully' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action')

  } catch (error) {
    console.error('Voucher error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

function generateVoucherCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
