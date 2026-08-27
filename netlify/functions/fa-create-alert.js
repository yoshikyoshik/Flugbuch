export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    const WEBHOOK_URL = process.env.WEBHOOK_URL;

    // 1. CORS Preflight für Browser-Anfragen abfangen
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            }
        });
    }

    if (request.method !== 'POST') {
        console.warn(`⚠️ Falsche Methode: ${request.method}`);
        return new Response('Bitte POST verwenden', { status: 405 });
    }

    if (!API_KEY) {
        console.error("❌ FLIGHTAWARE_API_KEY fehlt in den Netlify Environment Variables!");
        return new Response(JSON.stringify({ error: "API-Key fehlt" }), { status: 500 });
    }

    try {
        const bodyText = await request.text();
        console.log("📥 fa-create-alert empfangen:", bodyText);

        const body = bodyText ? JSON.parse(bodyText) : {};
        const fa_flight_id = body.fa_flight_id;

        if (!fa_flight_id) {
            console.error("❌ Keine fa_flight_id im Request-Body übergeben!");
            return new Response(JSON.stringify({ error: "fa_flight_id fehlt" }), { status: 400 });
        }

        console.log(`✈️ Registriere Alert bei FlightAware für ID: ${fa_flight_id}...`);

        // Offizieller AeroAPI v4 Payload laut Dokumentation
        const alertPayload = {
            ident: fa_flight_id,
            events: {
                departure: true, // Beinhaltet Abflug, Gate-Wechsel & Delays
                arrival: true,   // Beinhaltet Landung & En-Route Updates
                cancelled: true,
                diverted: true
            }
        };

        // Falls eine individuelle target_url definiert ist, mitsenden
        if (WEBHOOK_URL) {
            alertPayload.target_url = WEBHOOK_URL;
        }

        const faResponse = await fetch('https://aeroapi.flightaware.com/aeroapi/alerts', {
            method: 'POST',
            headers: {
                'x-apikey': API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(alertPayload)
        });

        const rawResText = await faResponse.text();
        console.log(`📡 FlightAware Antwort-Status: ${faResponse.status}, Body: ${rawResText}`);

        if (!faResponse.ok) {
            throw new Error(`FlightAware Fehler (${faResponse.status}): ${rawResText}`);
        }

        let result = {};
        if (rawResText && rawResText.trim() !== "") {
            try { result = JSON.parse(rawResText); } catch(e) {}
        }

        console.log(`✅ Alert für ${fa_flight_id} erfolgreich registriert!`);
        return new Response(JSON.stringify({ success: true, alert: result }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("❌ Fehler in fa-create-alert:", error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}