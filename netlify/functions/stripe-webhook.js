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

            // 2. Zertifikat bei Carbonmark kaufen (Der offizielle 3-Schritte-Flow)
            try {
                console.log(`🌱 Starte Carbonmark-Kauf für ${tonnes}t (Flug ${flightId})...`);
                
                // --- SCHRITT 1: Preis-ID abrufen (Wir nutzen das Beispielprojekt ICR-112) ---
                const priceRes = await fetch('https://v1.api.carbonmark.com/prices?projectIds=ICR-112', {
                    method: 'GET',
                    headers: { "Accept": "application/json" }
                });
                const prices = await priceRes.json();
                if (!prices || prices.length === 0) throw new Error("Kein Preis-Listing bei Carbonmark gefunden.");
                
                // Wir nehmen die erste verfügbare Listing-ID
                const sourceId = prices[0].sourceId; 
                console.log(`✅ Schritt 1: Price Source ID gefunden (${sourceId})`);

                // --- SCHRITT 2: Angebot (Quote) generieren ---
                const quoteRes = await fetch('https://v1.api.carbonmark.com/quotes', {
                    method: 'POST',
                    headers: {
                        "Accept": "application/json",
                        "Authorization": `Bearer ${process.env.CARBONMARK_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        asset_price_source_id: sourceId,
                        quantity_tonnes: Number(tonnes) // Doku erfordert eine Zahl
                    })
                });
                const quoteData = await quoteRes.json();
                if (!quoteRes.ok) throw new Error("Quote API Fehler: " + JSON.stringify(quoteData));
                
                const quoteUuid = quoteData.uuid;
                console.log(`✅ Schritt 2: Quote generiert (UUID: ${quoteUuid})`);

                // --- SCHRITT 3: Kauf (Order) verbindlich abschicken ---
                const orderRes = await fetch('https://v1.api.carbonmark.com/orders', {
                    method: 'POST',
                    headers: {
                        "Accept": "application/json",
                        "Authorization": `Bearer ${process.env.CARBONMARK_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        quote_uuid: quoteUuid,
                        beneficiary_name: sessionObj.customer_details?.name || "AvioSphere Pilot",
                        retirement_message: "Flugkompensation via AvioSphere"
                    })
                });
                const orderData = await orderRes.json();
                if (!orderRes.ok) throw new Error("Order API Fehler: " + JSON.stringify(orderData));

                console.log(`✅ Schritt 3: Order erfolgreich eingereicht! Status: ${orderData.status}`);

                // Da die Blockchain ein paar Sekunden braucht, ist der Status initial meist "SUBMITTED".
                // Carbonmark liefert später eine `view_retirement_url`. Für den Moment speichern 
                // wir einen Fallback-Link auf deren Plattform, damit dein Frontend grün wird!
                const certUrl = orderData.view_retirement_url || `https://app.carbonmark.com/retirements`;

                // 3. ECHTES SUPABASE UPDATE (Nur wenn der API-Kauf geklappt hat!)
                const { error } = await supabaseAdmin
                    .from('flights')
                    .update({ 
                        co2_compensated: true,
                        co2_certificate_url: certUrl
                    })
                    .eq('flight_id', flightId)
                    .eq('user_id', userId);

                if (error) {
                    console.error("❌ Fehler beim Supabase Update (CO2):", error);
                    return { statusCode: 500, body: 'Database Error' };
                }

                console.log('✅ Supabase Update erfolgreich (CO2)! Flug ist jetzt grün.');
                return { statusCode: 200, body: 'Received CO2 Offset' }; 

            } catch (error) {
                console.error("❌ Fehler beim Carbonmark-Kauf:", error.message);
                return { statusCode: 500, body: 'Carbonmark API Error' };
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