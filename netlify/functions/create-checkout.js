const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // ✅ CORS HEADER
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // ✅ PREFLIGHT
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    // ✅ NEU: 'returnUrl' auslesen
    const { priceId, userId, userEmail, returnUrl } = JSON.parse(event.body);
    
    // ✅ NEU: Basis-URL bestimmen
    // Wenn 'returnUrl' da ist (App), nimm sie als Basis. Sonst Web-URL.
    // Wir hängen dann success/cancel Parameter an.
    
    const baseUrl = returnUrl || process.env.APP_URL;
    
    // Wenn es ein App-Link ist (aviosphere://), brauchen wir keine langen Pfade, 
    // Parameter reichen.
    const successUrl = returnUrl 
        ? `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&payment=success`
        : `${process.env.APP_URL}?session_id={CHECKOUT_SESSION_ID}&payment=success`;

    const cancelUrl = returnUrl
        ? `${returnUrl}?payment=cancelled`
        : `${process.env.APP_URL}?payment=cancelled`;

	
	const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      // Erlaubt Gutscheine
      allow_promotion_codes: true,
      
      // ✅ STEUER-AUTOMATIK
      automatic_tax: {
        enabled: true,
      },

      // ✅ KORREKTUR: Statt 'customer_update' nutzen wir das hier:
      // Das sorgt dafür, dass Stripe die Adresse abfragt, wenn nötig (für Steuer),
      // ohne dass eine Customer-ID zwingend vorher existieren muss.
      billing_address_collection: 'auto',

      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: userEmail,
      client_reference_id: userId,
      
      subscription_data: {
        metadata: {
          supabase_user_id: userId
        }
      },
      success_url: successUrl, // ✅ Neue Variable nutzen
      cancel_url: cancelUrl,   // ✅ Neue Variable nutzen
    });

    return {
      statusCode: 200,
      headers, 
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error) {
    console.error('Stripe Error:', error);
    return {
      statusCode: 500,
      headers, 
      body: JSON.stringify({ error: error.message }),
    };
  }
};