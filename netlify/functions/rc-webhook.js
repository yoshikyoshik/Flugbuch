// netlify/functions/rc-webhook.js
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  console.log("RevenueCat Webhook aufgerufen!");

  // 1. Nur POST erlauben
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 2. Sicherheits-Check (Tolerant: Mit oder ohne "Bearer ")
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || "";
  const secret = process.env.RC_WEBHOOK_SECRET;

  // Wir prüfen, ob das Geheimnis im Header ENTHALTEN ist. 
  // Das erlaubt "Bearer DEIN_CODE" oder einfach nur "DEIN_CODE".
  if (!secret || !authHeader.includes(secret)) {
    console.error(`Unauthorized: Header war '${authHeader}', erwartet wurde Teil von '${secret}'`);
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    const body = JSON.parse(event.body);
    const { event: rcEvent } = body;

    if (!rcEvent) {
      console.error("Keine Event-Daten im Body gefunden");
      return { statusCode: 400, body: 'No event data' };
    }

    const userId = rcEvent.app_user_id;
    const type = rcEvent.type;

    console.log(`RevenueCat Event: ${type} für User ${userId}`);

    // --- FALL A: TEST EVENT (Damit du den "Test"-Button nutzen kannst) ---
    if (type === 'TEST') {
        console.log("Test-Event empfangen. Verbindung steht!");
        return { statusCode: 200, body: 'Test Successful' };
    }

    // --- FALL B: ABO ABGELAUFEN (EXPIRATION) ---
    // Auch auf 'PRODUCT_CHANGE' achten (Downgrade)
    if (type === 'EXPIRATION' || type === 'CANCELLATION') {
        
        console.log(`Setze User ${userId} auf FREE (Grund: ${type})`);

        // Wir prüfen vorsichtshalber, ob die User-ID eine UUID ist (Supabase ID)
        if (userId && userId.length > 10) { 
            const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
              user_metadata: {
                subscription_status: 'free',
                subscription_end: null,
                // Optional: Source auf null setzen, damit Web wieder "frei" ist
                // subscription_source: null 
              }
            });

            if (error) {
                console.error('Supabase Update Error:', error);
                return { statusCode: 500, body: 'Db Update Failed' };
            }
            console.log("Supabase Update erfolgreich: FREE");
        } else {
             console.warn("Ignoriere Event: Keine gültige Supabase User ID:", userId);
        }
    } 
    
    // --- FALL C: VERLÄNGERUNG / KAUF (RENEWAL / INITIAL_PURCHASE) ---
    else if (type === 'RENEWAL' || type === 'INITIAL_PURCHASE') {
        console.log(`Verlängerung/Kauf für User ${userId}`);
        
        const newExpiry = rcEvent.expiration_at_ms 
            ? Math.floor(rcEvent.expiration_at_ms / 1000) 
            : null;

        if (userId && userId.length > 10) {
            await supabaseAdmin.auth.admin.updateUserById(userId, {
                user_metadata: {
                    subscription_status: 'pro',
                    subscription_source: 'google_play', // Wir wissen, es kommt von RC
                    subscription_end: newExpiry
                }
            });
            console.log("Supabase Update erfolgreich: PRO");
        }
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error("Webhook Error:", err);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }
};