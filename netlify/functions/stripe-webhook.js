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
        
        if (sessionObj.metadata && sessionObj.metadata.type === 'co2_offset') {
            const flightId = sessionObj.metadata.flight_id;
            const co2Kg = sessionObj.metadata.co2_kg;
            const userId = sessionObj.metadata.user_id;

            console.log(`✅ CO2-Zahlung erhalten! Flug: ${flightId}, Menge: ${co2Kg}kg`);

            // 🚨 DER SCHUTZSCHILD: Verhindert doppelte Käufe bei Stripe-Retrys!
            const { data: existingFlight } = await supabaseAdmin
                .from('flights')
                .select('co2_compensated')
                .eq('flight_id', flightId)
                .eq('user_id', userId)
                .single();

            if (existingFlight && existingFlight.co2_compensated) {
                console.log(`🛡️ Schutzschild aktiv: Flug ${flightId} ist bereits kompensiert! (Ignoriere Retry)`);
                return { statusCode: 200, body: 'Already compensated' };
            }

            let tonnes = (parseFloat(co2Kg) / 1000).toFixed(3);
            if (parseFloat(tonnes) <= 0) tonnes = "0.001"; 

            try {
                console.log(`🌱 Starte Carbonmark-Kauf für ${tonnes}t (Flug ${flightId})...`);
                
                const priceRes = await fetch('https://v20.api.carbonmark.com/prices', { headers: { "Accept": "application/json" } });
                const prices = await priceRes.json();
                
                const requiredTonnes = Number(tonnes);
                const validListing = prices.find(p => p.supply >= requiredTonnes);
                if (!validListing) throw new Error(`Kein Projekt mit >= ${requiredTonnes}t auf Lager gefunden.`);
                
                const sourceId = validListing.sourceId; 
                
                const quoteRes = await fetch('https://v20.api.carbonmark.com/quotes', {
                    method: 'POST',
                    headers: { "Accept": "application/json", "Authorization": `Bearer ${process.env.CARBONMARK_API_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ asset_price_source_id: sourceId, quantity_tonnes: requiredTonnes })
                });
                const quoteData = await quoteRes.json();
                const quoteUuid = quoteData.uuid;

                const orderRes = await fetch('https://v20.api.carbonmark.com/orders', {
                    method: 'POST',
                    headers: { "Accept": "application/json", "Authorization": `Bearer ${process.env.CARBONMARK_API_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ quote_uuid: quoteUuid, beneficiary_name: sessionObj.customer_details?.name || "AvioSphere Pilot", retirement_message: "Flugkompensation via AvioSphere" })
                });
                const orderData = await orderRes.json();

                // --- SCHRITT 4: Auf die Blockchain warten (TIME-OUT SICHER!) ---
                let certUrl = null;
                let attempts = 0;
                const maxAttempts = 3; // Max 3x2s = 6 Sekunden. So rennt Stripe nicht in den Timeout!

                while (attempts < maxAttempts && !certUrl) {
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    const checkRes = await fetch(`https://v20.api.carbonmark.com/orders?quote_uuid=${quoteUuid}`, {
                        headers: { "Accept": "application/json", "Authorization": `Bearer ${process.env.CARBONMARK_API_KEY}` }
                    });
                    const checkData = await checkRes.json();
                    const orderObj = Array.isArray(checkData) ? checkData[0] : checkData;
                    
                    if (checkRes.ok && orderObj) {
                        console.log(`ℹ️ Order-Status: ${orderObj.status}`);
                        
                        // 🚀 DER LINK-HACK: Wenn die API den Link noch nicht hat, bauen wir ihn aus dem Hash!
                        if (orderObj.status === 'COMPLETED' || orderObj.transaction_hash) {
                            certUrl = orderObj.view_retirement_url || orderObj.on_chain_explorer_url;
                            
                            if (!certUrl && orderObj.transaction_hash) {
                                console.log("🔧 Baue Polygonscan-Link manuell aus TxHash...");
                                certUrl = `https://polygonscan.com/tx/${orderObj.transaction_hash}`;
                            }

                            if (certUrl) break;
                        }
                    }
                }

                if (!certUrl) {
                     console.warn("⚠️ Fallback auf Portfolio.");
                     certUrl = `https://app.carbonmark.com/portfolio`; 
                }

                const { error } = await supabaseAdmin
                    .from('flights')
                    .update({ co2_compensated: true, co2_certificate_url: certUrl })
                    .eq('flight_id', flightId)
                    .eq('user_id', userId);

                if (error) throw error;
                console.log('✅ Supabase Update erfolgreich (CO2)!');
                return { statusCode: 200, body: 'Received CO2 Offset' }; 

            } catch (error) {
                console.error("❌ Fehler Carbonmark:", error.message);
                return { statusCode: 500, body: 'Error' }; // Stripe darf Retry machen, aber unser Schutzschild fängt es auf!
            }
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