const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // ✅ CORS HEADER DEFINIEREN
  const headers = {
    'Access-Control-Allow-Origin': '*', // Erlaubt Zugriff von überall (auch App)
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // ✅ PREFLIGHT REQUEST (OPTIONS) BEHANDELN
  // Der Browser fragt vorher: "Darf ich?" - Wir sagen "Ja!"
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const { customerId } = JSON.parse(event.body);
    
    if (!customerId) throw new Error("Keine Customer ID vorhanden");

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.APP_URL,
    });

    return {
      statusCode: 200,
      headers, // ✅ WICHTIG: Header auch bei Erfolg mitsenden
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error) {
    return { 
      statusCode: 500, 
      headers, // ✅ WICHTIG: Header auch bei Fehler mitsenden
      body: JSON.stringify({ error: error.message }) 
    };
  }
};