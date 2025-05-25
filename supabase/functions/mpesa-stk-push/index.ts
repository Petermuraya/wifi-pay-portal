
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const { paymentId, phoneNumber, amount } = await req.json()

    console.log('Processing STK Push for payment:', paymentId)

    // Get M-Pesa access token
    const tokenResponse = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${Deno.env.get('MPESA_CONSUMER_KEY')}:${Deno.env.get('MPESA_CONSUMER_SECRET')}`)}`,
      },
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to get M-Pesa access token')
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Generate timestamp in the correct format: YYYYMMDDHHMMSS
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`
    
    // Generate password
    const businessShortCode = Deno.env.get('MPESA_BUSINESS_SHORT_CODE')
    const passkey = Deno.env.get('MPESA_PASSKEY')
    const password = btoa(`${businessShortCode}${passkey}${timestamp}`)

    // Format phone number (ensure it starts with 254)
    let formattedPhone = phoneNumber.replace(/\s/g, '')
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1)
    } else if (formattedPhone.startsWith('7')) {
      formattedPhone = '254' + formattedPhone
    }

    // STK Push payload
    const stkPushPayload = {
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: formattedPhone,
      PartyB: businessShortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`,
      AccountReference: paymentId,
      TransactionDesc: "Internet Access Payment"
    }

    console.log('Sending STK Push request:', stkPushPayload)

    // Send STK Push request
    const stkResponse = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stkPushPayload),
    })

    const stkData = await stkResponse.json()
    console.log('STK Push response:', stkData)

    if (stkData.ResponseCode === "0") {
      // Update payment with checkout request ID
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          mpesa_checkout_request_id: stkData.CheckoutRequestID,
          status: 'pending'
        })
        .eq('id', paymentId)

      if (updateError) {
        console.error('Error updating payment:', updateError)
        throw updateError
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'STK Push sent successfully',
          checkoutRequestId: stkData.CheckoutRequestID
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    } else {
      console.error('STK Push failed:', stkData)
      
      // Update payment status to failed
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('id', paymentId)

      return new Response(
        JSON.stringify({
          success: false,
          message: stkData.errorMessage || 'STK Push failed',
          error: stkData
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

  } catch (error) {
    console.error('STK Push error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
