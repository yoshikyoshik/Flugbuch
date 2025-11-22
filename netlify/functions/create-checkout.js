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
    const { priceId, userId, userEmail } = JSON.parse(event.body);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
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
      success_url: `${process.env.APP_URL}?session_id={CHECKOUT_SESSION_ID}&payment=success`,
      cancel_url: `${process.env.APP_URL}?payment=cancelled`,
    });

    return {
      statusCode: 200,
      headers, // ✅ Header mitsenden
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error) {
    console.error('Stripe Error:', error);
    return {
      statusCode: 500,
      headers, // ✅ Header mitsenden
      body: JSON.stringify({ error: error.message }),
    };
  }
};