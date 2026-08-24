export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    if (!API_KEY) {
        return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 500 });
    }

    const url = new URL(request.url);
    const fa_flight_id = url.searchParams.get("fa_flight_id");

    if (!fa_flight_id) {
        return new Response(JSON.stringify({ error: "Missing ID" }), { status: 400 });
    }

    const headers = { 'x-apikey': API_KEY, 'Accept': 'application/json' };

    try {
        // 1. Versuch: Der schnelle Live/Recent Endpunkt
        let trackUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(fa_flight_id)}/track`;
        let response = await fetch(trackUrl, { headers });

        // 2. Versuch: Wenn 404 (Not Found) oder leer, schalte den History-Turbo ein!
        if (!response.ok || response.status === 404) {
            console.log(`⚠️ Live-Track nicht gefunden. Schalte auf History-Track um für ${fa_flight_id}...`);
            trackUrl = `https://aeroapi.flightaware.com/aeroapi/history/flights/${encodeURIComponent(fa_flight_id)}/track`;
            response = await fetch(trackUrl, { headers });
        }

        if (response.ok) {
            const data = await response.json();
            return new Response(JSON.stringify(data), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        } else {
            return new Response(JSON.stringify({ error: "Track not found in Live or History" }), { status: response.status });
        }

    } catch (error) {
        console.error("Track Fetch Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}