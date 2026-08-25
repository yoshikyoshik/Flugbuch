export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    
    // Standard Header für eine saubere Kommunikation
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
        const faUrl = `https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(airportCode)}/flights/${encodeURIComponent(type)}?max_pages=1`;
        
        const res = await fetch(faUrl, { headers: faHeaders });
        
        if (!res.ok) {
           throw new Error(`FlightAware API error: ${res.status}`);
        }

        // 🛡️ SICHERHEIT: Falls FlightAware (z.B. bei kleinen Flughäfen) komplett leere Daten schickt
        const rawText = await res.text();
        if (!rawText || rawText.trim() === "") {
            return new Response(JSON.stringify([]), { status: 200, headers });
        }

        const data = JSON.parse(rawText);
        const flights = data.arrivals || data.departures || [];

        // 🧹 AUFRÄUMEN: Bulletproof-Datenverarbeitung
        const cleanFlights = flights.map(f => {
            
            // Flughäfen (Erkennt IATA, ICAO oder reinen Text)
            let orig = "N/A";
            if (f.origin && f.origin !== "null") {
                orig = typeof f.origin === 'object' ? (f.origin.code_iata || f.origin.code_icao || "N/A") : f.origin;
            }

            let dest = "N/A";
            if (f.destination && f.destination !== "null") {
                dest = typeof f.destination === 'object' ? (f.destination.code_iata || f.destination.code_icao || "N/A") : f.destination;
            }

            // Flugzeugtyp
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
                aircraft_type: acType
            };
        });

        // Alles lief perfekt, wir schicken die sauberen Daten zur App!
        return new Response(JSON.stringify(cleanFlights), { status: 200, headers });

    } catch (error) {
        console.error("Airport Fetch Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
}