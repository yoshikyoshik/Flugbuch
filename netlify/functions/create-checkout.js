const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { priceId, userId, userEmail } = JSON.parse(event.body);

    // 1. Session erstellen
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // Paypal etc. kann man hier hinzufügen
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: userEmail, // Füllt Email bei Stripe vor
      client_reference_id: userId, // WICHTIG: Damit wissen wir später, wer bezahlt hat!
      subscription_data: {
        metadata: {
          supabase_user_id: userId // Doppelte Sicherheit
        }
      },
      success_url: `${process.env.APP_URL}?session_id={CHECKOUT_SESSION_ID}&payment=success`,
      cancel_url: `${process.env.APP_URL}?payment=cancelled`,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error) {
    console.error('Stripe Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};