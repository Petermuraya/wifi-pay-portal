
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const callbackData = await req.json()
    console.log('M-Pesa callback received:', JSON.stringify(callbackData, null, 2))

    const stkCallback = callbackData.Body.stkCallback
    const checkoutRequestId = stkCallback.CheckoutRequestID
    const resultCode = stkCallback.ResultCode
    const resultDesc = stkCallback.ResultDesc

    console.log(`Processing callback for CheckoutRequestID: ${checkoutRequestId}, ResultCode: ${resultCode}`)

    // Find the payment by checkout request ID
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('mpesa_checkout_request_id', checkoutRequestId)
      .single()

    if (fetchError || !payment) {
      console.error('Payment not found for checkout request ID:', checkoutRequestId)
      return new Response('Payment not found', { status: 404 })
    }

    let updateData: any = {}

    if (resultCode === 0) {
      // Payment successful
      const callbackMetadata = stkCallback.CallbackMetadata?.Item || []
      
      // Extract transaction details
      const amountItem = callbackMetadata.find((item: any) => item.Name === 'Amount')
      const receiptItem = callbackMetadata.find((item: any) => item.Name === 'MpesaReceiptNumber')
      const transactionDateItem = callbackMetadata.find((item: any) => item.Name === 'TransactionDate')
      const phoneNumberItem = callbackMetadata.find((item: any) => item.Name === 'PhoneNumber')

      updateData = {
        status: 'completed',
        mpesa_receipt_number: receiptItem?.Value || null,
        updated_at: new Date().toISOString()
      }

      console.log('Payment successful:', {
        paymentId: payment.id,
        amount: amountItem?.Value,
        receipt: receiptItem?.Value,
        phone: phoneNumberItem?.Value
      })

      // Also update the user session to active
      if (payment.session_id) {
        const { error: sessionError } = await supabase
          .from('user_sessions')
          .update({ 
            status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('id', payment.session_id)

        if (sessionError) {
          console.error('Error updating session:', sessionError)
        }
      }

    } else {
      // Payment failed or cancelled
      updateData = {
        status: 'failed',
        updated_at: new Date().toISOString()
      }

      console.log('Payment failed:', {
        paymentId: payment.id,
        resultCode,
        resultDesc
      })
    }

    // Update payment status
    const { error: updateError } = await supabase
      .from('payments')
      .update(updateData)
      .eq('id', payment.id)

    if (updateError) {
      console.error('Error updating payment:', updateError)
      throw updateError
    }

    console.log('Payment updated successfully:', payment.id)

    return new Response(
      JSON.stringify({ message: 'Callback processed successfully' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Callback processing error:', error)
    return new Response(
      JSON.stringify({
        message: 'Callback processing failed',
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
