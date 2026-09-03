import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 1. CORS-Header definieren (Zwingend für die Android App)
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export default async function handler(request, context) {
    // 2. Preflight-Requests (OPTIONS) von Android sofort durchwinken
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
        // 3. Das neue Feld 'isNative' auslesen
        const { flightId, co2Kg, userId, userEmail, isNative } = await request.json();

        if (!flightId || !co2Kg || !userId) {
            return new Response(JSON.stringify({ error: "Fehlende Parameter" }), { 
                status: 400, 
                headers: corsHeaders // Header immer mitsenden!
            });
        }

        const amountInCents = Math.max(100, Math.round(co2Kg * 3));

        // 4. URL Logik: App (Deep-Link) vs. Web (HTTPS)
        const baseUrl = process.env.URL || 'https://aviosphere.com';
        
        const successUrl = isNative 
            ? `aviosphere://return?co2_success=true&flight=${flightId}` // <-- HIER DIE FLUG-ID ANGEHÄNGT!
            : `${baseUrl}?co2_success=true&flight=${flightId}`;
            
        const cancelUrl = isNative 
            ? `aviosphere://return` 
            : `${baseUrl}`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: userEmail,
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: '🌱 CO₂-Kompensation (AvioSphere)',
                        description: `Klimaneutraler Ausgleich für ${co2Kg} kg CO₂`,
                    },
                    unit_amount: amountInCents,
                },
                quantity: 1,
            }],
            metadata: {
                type: 'co2_offset',
                flight_id: flightId.toString(),
                user_id: userId,
                co2_kg: co2Kg.toString()
            },
            // Die dynamisch ermittelten URLs einsetzen
            success_url: successUrl,
            cancel_url: cancelUrl
        });

        // 5. Erfolgsantwort mit angehängten CORS-Headern
        return new Response(JSON.stringify({ url: session.url }), {
            status: 200,
            headers: { 
                ...corsHeaders, 
                'Content-Type': 'application/json' 
            }
        });

    } catch (error) {
        console.error("Stripe CO2 Checkout Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, 
            headers: corsHeaders 
        });
    }
}