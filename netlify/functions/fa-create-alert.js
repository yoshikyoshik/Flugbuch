export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    const WEBHOOK_URL = process.env.WEBHOOK_URL;
    
    if (!API_KEY || !WEBHOOK_URL) {
        return new Response(JSON.stringify({ error: "Fehlende API-Keys oder Webhook-URL" }), { status: 500 });
    }

    if (request.method !== 'POST') {
        return new Response('Bitte POST verwenden', { status: 405 });
    }

    try {
        const { fa_flight_id } = await request.json();

        if (!fa_flight_id) {
            return new Response(JSON.stringify({ error: "fa_flight_id fehlt" }), { status: 400 });
        }

        // 🚀 BUGHUNT FIX: FlightAware verlangt zwingend den Schlüssel "ident", 
        // auch wenn wir ihm eine extrem präzise fa_flight_id übergeben!
        const alertPayload = {
            ident: fa_flight_id,
            events: {
                arrival: true,
                departure: true,
                cancelled: true,
                delay: true,
                diverted: true,
                gate_departure: true,
                gate_arrival: true
            },
            destinations: [
                {
                    destination_type: "webhook",
                    target: WEBHOOK_URL
                }
            ]
        };

        const faResponse = await fetch('https://aeroapi.flightaware.com/aeroapi/alerts', {
            method: 'POST',
            headers: {
                'x-apikey': API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(alertPayload)
        });

        if (!faResponse.ok) {
            const errText = await faResponse.text();
            throw new Error(`FlightAware Fehler: ${faResponse.status} - ${errText}`);
        }

        // 🚀 BUGHUNT FIX: FlightAware schickt bei Erfolg oft eine leere Antwort.
        // Wir lesen sie als einfachen Text und parsen nur, wenn wirklich etwas drin steht!
        const rawText = await faResponse.text();
        let result = {};
        
        if (rawText && rawText.trim() !== "") {
            try {
                result = JSON.parse(rawText);
            } catch (parseError) {
                console.warn("⚠️ Konnte FlightAware-Antwort nicht als JSON lesen, aber Alert wurde gesetzt.");
            }
        }

        console.log(`✅ Alert für ${fa_flight_id} erfolgreich bei FlightAware registriert!`);

        return new Response(JSON.stringify({ success: true, alert: result }), { status: 200 });

    } catch (error) {
        console.error("❌ Fehler beim Erstellen des Alerts:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}