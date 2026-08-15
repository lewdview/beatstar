import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || Deno.env.get('STRIPE_SECRET_KEY_TEST');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!stripeSecretKey) {
    return new Response(JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get('stripe-signature');
  const bodyText = await req.text();

  let event: Stripe.Event;

  try {
    if (webhookSecret && signature) {
      event = await stripe.webhooks.constructEventAsync(bodyText, signature, webhookSecret);
    } else {
      // Fallback for testing without signature verification if webhook secret is not yet set
      console.warn('⚠️ STRIPE_WEBHOOK_SECRET not provided or signature missing — parsing raw payload');
      event = JSON.parse(bodyText) as Stripe.Event;
    }
  } catch (err: any) {
    console.error('❌ Stripe Webhook Signature Verification Failed:', err.message);
    return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const svc = createClient(supabaseUrl, supabaseServiceKey);

  console.log(`🔔 Received Stripe Webhook Event: ${event.type} [${event.id}]`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const sessionId = session.id;
        const userId = session.client_reference_id || session.metadata?.userId;
        const packCategory = session.metadata?.packCategory || 'taste';
        const packSize = session.metadata?.packSize || 'single';

        console.log(`💳 Checkout Completed: Session=${sessionId}, User=${userId}, Pack=${packCategory}/${packSize}`);

        if (!userId) {
          console.warn('⚠️ No userId associated with checkout session:', sessionId);
          break;
        }

        // Check if already fulfilled
        const { data: existingOrder } = await svc
          .from('stripe_orders')
          .select('*')
          .eq('stripe_session_id', sessionId)
          .single();

        if (existingOrder && existingOrder.status === 'completed') {
          console.log(`✅ Order ${sessionId} was already fulfilled. Skipping.`);
          break;
        }

        // Mint cards via vault-engine internal call
        const { data: mintResult, error: mintError } = await svc.functions.invoke('vault-engine', {
          body: {
            action: 'verifyStripeSession',
            payload: { sessionId, category: packCategory, size: packSize }
          },
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
          }
        });

        if (mintError || !mintResult?.success) {
          console.error('❌ Failed to mint cards on webhook checkout completion:', mintError || mintResult);
        } else {
          console.log(`🎉 Successfully minted cards for Stripe Order ${sessionId}`);
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled Stripe event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (handlerErr: any) {
    console.error('❌ Error handling webhook event:', handlerErr.message);
    return new Response(JSON.stringify({ error: handlerErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
