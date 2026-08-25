export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

    if (!API_KEY) {
        return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 500, headers });
    }

    const url = new URL(request.url);
    const airportCode = url.searchParams.get("airport");
    const type = url.searchParams.get("type") || "arrivals"; // "arrivals" oder "departures"

    if (!airportCode) {
        return new Response(JSON.stringify({ error: "Missing airport code" }), { status: 400, headers });
    }

    const faHeaders = { 'x-apikey': API_KEY, 'Accept': 'application/json' };

    try {
        // 🚀 BUGHUNT FIX 1: FlightAware trennt strikt in Vergangenheit/Gegenwart und Zukunft!
        // Wir holen uns einfach BEIDE Listen, um ein perfektes Radar zu bauen.
        const type1 = type === 'arrivals' ? 'arrivals' : 'departures';
        const type2 = type === 'arrivals' ? 'scheduled_arrivals' : 'scheduled_departures';

        // 🚀 BUGHUNT FIX 2: Zeitfenster (-4 Stunden bis +8 Stunden)
        // Millisekunden sauber abgeschnitten, damit der FlightAware Server nicht abstürzt. KEIN "limit"-Parameter!
        const now = new Date();
        const startTime = new Date(now.getTime() - (4 * 60 * 60 * 1000)).toISOString().split('.')[0] + 'Z';
        const endTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)).toISOString().split('.')[0] + 'Z';

        const faUrl1 = `https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(airportCode)}/flights/${type1}?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&max_pages=1`;
        const faUrl2 = `https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(airportCode)}/flights/${type2}?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&max_pages=1`;
        
        // Beide API-Calls parallel abfeuern (geht extrem schnell)
        const [res1, res2] = await Promise.all([
            fetch(faUrl1, { headers: faHeaders }),
            fetch(faUrl2, { headers: faHeaders })
        ]);

        if (!res1.ok) throw new Error(`API Fehler 1: ${res1.status}`);
        if (!res2.ok) throw new Error(`API Fehler 2: ${res2.status}`);

        const data1 = await res1.json();
        const data2 = await res2.json();

        // Flug-Arrays aus den FlightAware-Antworten extrahieren
        const flights1 = data1[type1] || [];
        const flights2 = data2[type2] || [];

        // 🚀 BUGHUNT FIX 3: Beide Welten (Vergangenheit & Zukunft) verschmelzen
        const allFlights = [...flights1, ...flights2];
        
        // Doppelte Einträge filtern (falls FlightAware bei Überschneidungen doppelt liefert)
        const uniqueFlights = [];
        const seen = new Set();
        for (const f of allFlights) {
            const id = f.fa_flight_id || f.ident;
            if (!seen.has(id)) {
                seen.add(id);
                uniqueFlights.push(f);
            }
        }

        // Daten säubern
        const cleanFlights = uniqueFlights.map(f => {
            let orig = "N/A";
            if (f.origin && f.origin !== "null") orig = typeof f.origin === 'object' ? (f.origin.code_iata || f.origin.code_icao || "N/A") : f.origin;

            let dest = "N/A";
            if (f.destination && f.destination !== "null") dest = typeof f.destination === 'object' ? (f.destination.code_iata || f.destination.code_icao || "N/A") : f.destination;

            let acType = "N/A";
            if (f.aircraft_type && f.aircraft_type !== "null") acType = typeof f.aircraft_type === 'object' ? (f.aircraft_type.type || "N/A") : f.aircraft_type;

            return {
                ident: f.ident,
                flight_number: f.flight_number || f.ident || "Privatflug",
                origin: orig,
                destination: dest,
                scheduled_time: f.scheduled_on || f.scheduled_in || f.scheduled_out,
                estimated_time: f.estimated_on || f.estimated_in || f.estimated_out,
                actual_time: f.actual_on || f.actual_in || f.actual_out,
                status: f.status,
                aircraft_type: acType,
                dep_terminal: f.terminal_origin || null,
                dep_gate: f.gate_origin || null,
                arr_terminal: f.terminal_destination || null,
                arr_gate: f.gate_destination || null,
                baggage_claim: f.baggage_claim || null
            };
        });

        // Chronologisch sortieren (Absteigend, damit der aktuellste/späteste Flug oben steht)
        cleanFlights.sort((a, b) => {
            const timeA = new Date(a.actual_time || a.estimated_time || a.scheduled_time || 0).getTime();
            const timeB = new Date(b.actual_time || b.estimated_time || b.scheduled_time || 0).getTime();
            return timeB - timeA; 
        });

        return new Response(JSON.stringify(cleanFlights), { status: 200, headers });

    } catch (error) {
        console.error("Airport Fetch Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
}