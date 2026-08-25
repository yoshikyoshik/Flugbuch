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
        const type1 = type === 'arrivals' ? 'arrivals' : 'departures';
        const type2 = type === 'arrivals' ? 'scheduled_arrivals' : 'scheduled_departures';

        // 🚀 BUGHUNT FIX 1: Absolute, zeitzonenunabhängige UTC-Zeitfenster (-4h bis +8h)
        const nowMs = Date.now();
        const startMs = nowMs - (4 * 60 * 60 * 1000);
        const endMs = nowMs + (8 * 60 * 60 * 1000);

        const startTime = new Date(startMs).toISOString().split('.')[0] + 'Z';
        const endTime = new Date(endMs).toISOString().split('.')[0] + 'Z';

        const faUrl1 = `https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(airportCode)}/flights/${type1}?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&max_pages=1`;
        const faUrl2 = `https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(airportCode)}/flights/${type2}?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&max_pages=1`;
        
        const [res1, res2] = await Promise.all([
            fetch(faUrl1, { headers: faHeaders }),
            fetch(faUrl2, { headers: faHeaders })
        ]);

        if (!res1.ok) throw new Error(`API Fehler 1: ${res1.status}`);
        if (!res2.ok) throw new Error(`API Fehler 2: ${res2.status}`);

        const data1 = await res1.json();
        const data2 = await res2.json();

        const flights1 = data1[type1] || [];
        const flights2 = data2[type2] || [];

        const allFlights = [...flights1, ...flights2];
        
        const uniqueFlights = [];
        const seen = new Set();
        for (const f of allFlights) {
            const id = f.fa_flight_id || f.ident;
            if (!seen.has(id)) {
                seen.add(id);
                uniqueFlights.push(f);
            }
        }

        const cleanFlights = uniqueFlights.map(f => {
            let orig = "N/A";
            if (f.origin && f.origin !== "null") orig = typeof f.origin === 'object' ? (f.origin.code_iata || f.origin.code_icao || "N/A") : f.origin;

            let dest = "N/A";
            if (f.destination && f.destination !== "null") dest = typeof f.destination === 'object' ? (f.destination.code_iata || f.destination.code_icao || "N/A") : f.destination;

            let acType = "N/A";
            if (f.aircraft_type && f.aircraft_type !== "null") acType = typeof f.aircraft_type === 'object' ? (f.aircraft_type.type || "N/A") : f.aircraft_type;

            // 🚀 BUGHUNT FIX 1: Smarte Flugnummern-Generierung (Mit führenden Nullen!)
            let finalFlightNumber = f.flight_number || f.ident || "Privatflug";
            
            if (f.ident && f.ident.match(/^[A-Z]{3}\d+/)) {
                const icaoCode = f.ident.substring(0, 3);
                
                // Das präzise Airline-Wörterbuch
                const icaoToIata = {
                    'DLH': 'LH', 'EWG': 'EW', 'SXD': 'XQ', 'SXS': 'XQ', 'SWR': 'LX', 
                    'RYR': 'FR', 'EZY': 'U2', 'CFG': 'DE', 'SDR': 'SR', 'AUA': 'OS', 'KLM': 'KL'
                };
                
                if (icaoToIata[icaoCode]) {
                    let numStr = f.flight_number ? String(f.flight_number) : f.ident.substring(3);
                    
                    // Führende Nullen auffüllen, um dem Flughafen-Standard (LH069) zu entsprechen
                    if (numStr.length === 1) numStr = "00" + numStr;
                    else if (numStr.length === 2) numStr = "0" + numStr;
                    
                    finalFlightNumber = icaoToIata[icaoCode] + numStr;
                } else {
                    finalFlightNumber = f.ident; 
                }
            } else if (f.ident && f.flight_number) {
                 if (f.operator && f.operator.match(/^[A-Z]{3}/)) {
                     finalFlightNumber = f.operator.substring(0,2) + f.flight_number;
                 }
            }

            // 🚀 BUGHUNT FIX 2: GETRENNTE ZEIT-LOGIK FÜR ANKUNFT UND ABFLUG!
            // Wir wissen über die Such-URL (type), in welchem Tab der Nutzer gerade ist.
            const isDeparture = type === 'departures';
            
            let sTime, eTime, aTime;

            if (isDeparture) {
                // ABFLÜGE: Wir greifen exklusiv auf "out" (Gate-Abflug) und "off" (Runway-Abflug) zu!
                sTime = f.scheduled_out || f.scheduled_off || null;
                eTime = f.estimated_out || f.estimated_off || null;
                aTime = f.actual_out || f.actual_off || null;
            } else {
                // ANKÜNFTE: Wir greifen exklusiv auf "in" (Gate-Ankunft) und "on" (Runway-Landung) zu!
                sTime = f.scheduled_in || f.scheduled_on || null;
                eTime = f.estimated_in || f.estimated_on || null;
                aTime = f.actual_in || f.actual_on || null;
            }

            return {
                ident: f.ident,
                flight_number: finalFlightNumber,
                origin: orig,
                destination: dest,
                
                // Exakt die Zeiten übergeben, die für diesen Tab relevant sind
                scheduled_time: sTime,
                estimated_time: eTime,
                actual_time: aTime,
                
                status: f.status,
                aircraft_type: acType,
                dep_terminal: f.terminal_origin || null,
                dep_gate: f.gate_origin || null,
                arr_terminal: f.terminal_destination || null,
                arr_gate: f.gate_destination || null,
                baggage_claim: f.baggage_claim || null
            };
        });

        // Chronologisch sortieren (Absteigend)
        cleanFlights.sort((a, b) => {
            const timeA = new Date(a.scheduled_time || a.actual_time || a.estimated_time || 0).getTime();
            const timeB = new Date(b.scheduled_time || b.actual_time || b.estimated_time || 0).getTime();
            return timeB - timeA; 
        });

        return new Response(JSON.stringify(cleanFlights), { status: 200, headers });

    } catch (error) {
        console.error("Airport Fetch Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
}