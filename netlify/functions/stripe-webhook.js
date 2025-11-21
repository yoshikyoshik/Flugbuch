const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Log zur Diagnose
  console.log(`Empfange Event: ${stripeEvent.type}`);

  if (stripeEvent.type === 'checkout.session.completed' || stripeEvent.type === 'invoice.payment_succeeded') {
    let session, subscriptionId, customerId, userId;

    // Daten normalisieren je nach Event-Typ
    if (stripeEvent.type === 'checkout.session.completed') {
        session = stripeEvent.data.object;
        subscriptionId = session.subscription;
        customerId = session.customer;
        userId = session.client_reference_id; // UserID kommt hier direkt mit
    } else {
        // invoice.payment_succeeded
        const invoice = stripeEvent.data.object;
        subscriptionId = invoice.subscription;
        customerId = invoice.customer;
        // Bei Invoice haben wir die UserID nicht direkt, wir suchen sie später über CustomerID oder Metadata
        // Für den Moment verlassen wir uns auf den Checkout-Flow für das Update
    }

    if (subscriptionId && typeof subscriptionId === 'string') {
        try {
            // Abo-Details holen
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            // ✅ FIX: Fallback, falls current_period_end fehlt
            let periodEnd = subscription.current_period_end;
            
            if (!periodEnd) {
                console.warn("ACHTUNG: Kein current_period_end von Stripe erhalten! Nutze Fallback (30 Tage).");
                // Fallback: Jetzt + 30 Tage (in Sekunden)
                periodEnd = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
            }

            // Wenn wir im Invoice-Event sind, haben wir keine userId. 
            // Wir versuchen sie aus den Subscription-Metadaten zu lesen (die wir im Checkout gesetzt haben)
            if (!userId && subscription.metadata && subscription.metadata.supabase_user_id) {
                userId = subscription.metadata.supabase_user_id;
            }

            if (userId) {
                console.log(`Update Supabase User ${userId}: PRO bis ${periodEnd}`);
                
                const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                  user_metadata: {
                    subscription_status: 'pro',
                    subscription_end: periodEnd, // Jetzt garantiert eine Zahl!
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId
                  }
                });

                if (error) {
                    console.error('Supabase Update Error:', error);
                } else {
                    console.log('Supabase Update erfolgreich!');
                }
            } else {
                console.log('Keine UserID gefunden - Überspringe Supabase Update.');
            }

        } catch (err) {
            console.error('Fehler beim Abrufen der Subscription:', err);
        }
    }
  }

  return { statusCode: 200, body: 'Received' };
};