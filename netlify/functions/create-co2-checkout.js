import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(request, context) {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { flightId, co2Kg, userId, userEmail } = await request.json();

        if (!flightId || !co2Kg || !userId) {
            return new Response(JSON.stringify({ error: "Fehlende Parameter" }), { status: 400 });
        }

        // 1. Backend-Preisberechnung (Sicherheit!)
        // 0,03 € pro kg = 3 Cent. Mindestens 100 Cent (1,00 €).
        const amountInCents = Math.max(100, Math.round(co2Kg * 3));

        // 2. Basis-URL für Return-Links ermitteln
        // Localhost fürs Testen, ansonsten deine echte Domain
        const baseUrl = process.env.URL || 'https://aviosphere.com';

        // 3. Einmalige Stripe-Checkout-Session generieren
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'paypal'], // Stripe erlaubt hier viele Optionen
            customer_email: userEmail,
            mode: 'payment', // WICHTIG: Einmalzahlung, kein Abo!
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
            // WICHTIG: Diese Metadaten brauchen wir im nächsten Schritt für den Webhook!
            metadata: {
                type: 'co2_offset',
                flight_id: flightId.toString(),
                user_id: userId,
                co2_kg: co2Kg.toString()
            },
            // Wenn der User erfolgreich zahlt, hängen wir Parameter an die URL
            success_url: `${baseUrl}?co2_success=true&flight=${flightId}`,
            cancel_url: `${baseUrl}`
        });

        return new Response(JSON.stringify({ url: session.url }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("Stripe CO2 Checkout Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}