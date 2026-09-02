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

  console.log(`Empfange Event: ${stripeEvent.type}`);

  if (stripeEvent.type === 'checkout.session.completed' || stripeEvent.type === 'invoice.payment_succeeded') {
    
    // ==========================================
    // 🌱 CO2-Kompensation (Einmalzahlung)
    // ==========================================
    if (stripeEvent.type === 'checkout.session.completed') {
        const sessionObj = stripeEvent.data.object;
        
        // Wir prüfen unsere Metadaten aus dem Checkout-Skript
        if (sessionObj.metadata && sessionObj.metadata.type === 'co2_offset') {
            const flightId = sessionObj.metadata.flight_id;
            const co2Kg = sessionObj.metadata.co2_kg;
            const userId = sessionObj.metadata.user_id;

            console.log(`✅ CO2-Zahlung erhalten! Flug: ${flightId}, Menge: ${co2Kg}kg`);

            // 1. Carbonmark Menge berechnen (Tonnen)
            let tonnes = (parseFloat(co2Kg) / 1000).toFixed(3);
            if (parseFloat(tonnes) <= 0) tonnes = "0.001"; // Sicherheits-Minimum

            let certUrl = null;

            // 2. Zertifikat bei Carbonmark kaufen
            try {
                console.log(`🌱 Kaufe ${tonnes}t CO2 bei Carbonmark für Flug ${flightId}...`);
                
                const carbonmarkRes = await fetch('https://api.carbonmark.com/api/retirements', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.CARBONMARK_API_KEY}`
                    },
                    body: JSON.stringify({
                        quantity: tonnes,
                        beneficiaryName: sessionObj.customer_details?.name || "AvioSphere Pilot", 
                        retirementMessage: "Flugkompensation via AvioSphere"
                    })
                });

                const data = await carbonmarkRes.json();

                if (!carbonmarkRes.ok) throw new Error(JSON.stringify(data));

                // Link zur öffentlichen Urkunde sichern
                certUrl = data.certificateUrl || data.receiptUrl || `https://www.carbonmark.com/retirements/${data.id}`;
                console.log("✅ Carbonmark Zertifikat erfolgreich generiert!");

            } catch (error) {
                console.error("❌ Fehler beim Carbonmark-Kauf:", error);
            }

            // 3. ECHTES SUPABASE UPDATE FÜR DEN FLUG (Kompensiert + Urkunden-Link)
            const updatePayload = { co2_compensated: true };
            if (certUrl) {
                updatePayload.co2_certificate_url = certUrl;
            }

            const { error } = await supabaseAdmin
                .from('flights')
                .update(updatePayload)
                .eq('flight_id', flightId)
                .eq('user_id', userId);

            if (error) {
                console.error("Fehler beim Supabase Update (CO2):", error);
                return { statusCode: 500, body: 'Database Error' };
            }

            console.log('✅ Supabase Update erfolgreich (CO2)!');
            return { statusCode: 200, body: 'Received CO2 Offset' }; 
        }
    }

    // ==========================================
    // 🌟 BESTEHEND: PRO-Abo Logik
    // ==========================================
    let session, subscriptionId, customerId, userId;

    if (stripeEvent.type === 'checkout.session.completed') {
        session = stripeEvent.data.object;
        subscriptionId = session.subscription;
        customerId = session.customer;
        userId = session.client_reference_id; 
    } else {
        const invoice = stripeEvent.data.object;
        subscriptionId = invoice.subscription;
        customerId = invoice.customer;
    }

    if (subscriptionId && typeof subscriptionId === 'string') {
        try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            let periodEnd = subscription.current_period_end;
            
            if (!periodEnd) {
                console.warn("ACHTUNG: Kein current_period_end von Stripe erhalten! Nutze Fallback (30 Tage).");
                periodEnd = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
            }

            if (!userId && subscription.metadata && subscription.metadata.supabase_user_id) {
                userId = subscription.metadata.supabase_user_id;
            }

            if (userId) {
                console.log(`Update Supabase User ${userId}: PRO bis ${periodEnd}`);
                
                const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                  user_metadata: {
                    subscription_status: 'pro',
                    subscription_source: 'stripe',
                    subscription_end: periodEnd, 
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId
                  }
                });

                if (error) console.error('Supabase Update Error:', error);
                else console.log('Supabase Update erfolgreich!');
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