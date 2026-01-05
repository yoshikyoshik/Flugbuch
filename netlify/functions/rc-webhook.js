// netlify/functions/rc-webhook.js
const { createClient } = require('@supabase/supabase-js');

// Init Supabase Admin Client
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  // 1. Nur POST erlauben
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 2. Sicherheits-Check (Authorization Header prüfen)
  // Du legst in RevenueCat einen Header fest, z.B. "Authorization: Bearer GEHEIMES_PASSWORT"
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  const expectedSecret = `Bearer ${process.env.RC_WEBHOOK_SECRET}`;

  if (authHeader !== expectedSecret) {
    console.error("Unauthorized RevenueCat Webhook Access");
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    const body = JSON.parse(event.body);
    const { event: rcEvent } = body;

    if (!rcEvent) {
      return { statusCode: 400, body: 'No event data' };
    }

    // Die User-ID, mit der du dich in der App eingeloggt hast (Purchases.logIn)
    const userId = rcEvent.app_user_id;
    const type = rcEvent.type;

    console.log(`RevenueCat Event: ${type} für User ${userId}`);

    // Wir interessieren uns vor allem für das Ende eines Abos
    // EXPIRATION = Abo ist normal abgelaufen
    // CANCELLATION = Kann auch bedeuten, dass es gekündigt wurde, aber noch läuft (Vorsicht!)
    // Wir reagieren hier hart auf EXPIRATION.
    
    if (type === 'EXPIRATION') {
        
        // Prüfung: Ist das Abo wirklich vorbei? 
        // Manchmal kommen Events verzögert. Wir setzen es auf FREE.
        
        console.log(`Setze User ${userId} auf FREE (Status: expired)`);

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            subscription_status: 'free',
            subscription_end: null,
            // Wir lassen die Source drin, damit wir wissen, woher er kam, 
            // oder setzen sie auf null, wenn du ganz sauber sein willst:
            // subscription_source: null 
          }
        });

        if (error) {
            console.error('Supabase Update Error:', error);
            return { statusCode: 500, body: 'Db Update Failed' };
        }
    } 
    
    // Optional: RENEWAL (Verlängerung)
    // Falls sich das Abo automatisch verlängert, ohne dass die App offen ist
    else if (type === 'RENEWAL') {
        console.log(`Verlängerung für User ${userId}`);
        
        // Das neue Ablaufdatum berechnen (RevenueCat liefert expiration_at_ms)
        const newExpiry = rcEvent.expiration_at_ms 
            ? Math.floor(rcEvent.expiration_at_ms / 1000) 
            : null;

        await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
                subscription_status: 'pro',
                subscription_end: newExpiry
            }
        });
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error("Webhook Error:", err);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }
};