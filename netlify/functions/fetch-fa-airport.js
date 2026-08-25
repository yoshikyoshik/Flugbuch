export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    
    const headers = { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
    };

    if (!API_KEY) {
        return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 500, headers });
    }

    const url = new URL(request.url);
    const airportCode = url.searchParams.get("airport");
    const type = url.searchParams.get("type") || "arrivals";

    if (!airportCode) {
        return new Response(JSON.stringify({ error: "Missing airport code" }), { status: 400, headers });
    }

    const faHeaders = { 'x-apikey': API_KEY, 'Accept': 'application/json' };

    try {
        // 🚀 SCHRITT 2: DER INTELLIGENTE ZEITFILTER (-2h bis +6h)
        const now = new Date();
        
        // 🛡️ BUGHUNT FIX: Millisekunden abschneiden (.split('.')[0] + 'Z'), sonst stürzt FlightAware ab!
        const startTime = new Date(now.getTime() - (2 * 60 * 60 * 1000)).toISOString().split('.')[0] + 'Z';
        const endTime = new Date(now.getTime() + (6 * 60 * 60 * 1000)).toISOString().split('.')[0] + 'Z';

        // API URL (Wir müssen die Zeitstempel mit encodeURIComponent absichern, da sie Doppelpunkte enthalten!)
        const faUrl = `https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(airportCode)}/flights/${encodeURIComponent(type)}?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&limit=50&max_pages=1`;
        
        const res = await fetch(faUrl, { headers: faHeaders });
        
        if (!res.ok) {
           throw new Error(`FlightAware API error: ${res.status}`);
        }

        const rawText = await res.text();
        if (!rawText || rawText.trim() === "") {
            return new Response(JSON.stringify([]), { status: 200, headers });
        }

        const data = JSON.parse(rawText);
        const flights = data.arrivals || data.departures || [];

        // 🧹 AUFRÄUMEN: Bulletproof-Datenverarbeitung
        const cleanFlights = flights.map(f => {
            let orig = "N/A";
            if (f.origin && f.origin !== "null") {
                orig = typeof f.origin === 'object' ? (f.origin.code_iata || f.origin.code_icao || "N/A") : f.origin;
            }

            let dest = "N/A";
            if (f.destination && f.destination !== "null") {
                dest = typeof f.destination === 'object' ? (f.destination.code_iata || f.destination.code_icao || "N/A") : f.destination;
            }

            let acType = "N/A";
            if (f.aircraft_type && f.aircraft_type !== "null") {
                acType = typeof f.aircraft_type === 'object' ? (f.aircraft_type.type || "N/A") : f.aircraft_type;
            }

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
                // 🪗 SCHRITT 3: Gate- und Terminal-Daten für das Akkordeon
                dep_terminal: f.terminal_origin || null,
                dep_gate: f.gate_origin || null,
                arr_terminal: f.terminal_destination || null,
                arr_gate: f.gate_destination || null,
                baggage_claim: f.baggage_claim || null
            };
        });

        return new Response(JSON.stringify(cleanFlights), { status: 200, headers });

    } catch (error) {
        console.error("Airport Fetch Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
}