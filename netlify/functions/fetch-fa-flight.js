// netlify/functions/fetch-fa-flight.js
export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    if (!API_KEY) {
        return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 500 });
    }

    const url = new URL(request.url);
    const flight_number = url.searchParams.get("flight_number");
    const dep = url.searchParams.get("dep");
    const arr = url.searchParams.get("arr");
    const date = url.searchParams.get("date"); // Erwartet YYYY-MM-DD

    try {
        let faUrl = "";

        if (flight_number) {
            // ==========================================
            // MODUS A: Suche per Flugnummer (Autopilot)
            // ==========================================
            const cleanFlightNum = flight_number.replace(/\s+/g, '').toUpperCase();
            faUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${cleanFlightNum}`;
            if (date) {
                faUrl += `?start=${date}T00:00:00Z&end=${date}T23:59:59Z`;
            }
        } else if (dep && arr) {
            // ==========================================
            // MODUS B: Suche per Strecke (Lupe)
            // ==========================================
            // 🚀 BUGHUNT FIX: Den GANZEN Tag suchen (00:00:00 bis 23:59:59), statt ein 0-Sekunden-Fenster!
            const startDate = `${date}T00:00:00Z`;
            const endDate = `${date}T23:59:59Z`;
            faUrl = `https://aeroapi.flightaware.com/aeroapi/schedules/${startDate}/${endDate}?origin=${dep.toUpperCase()}&destination=${arr.toUpperCase()}&max_pages=5`;
        } else {
            return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
        }

        const faRes = await fetch(faUrl, {
            headers: { 'x-apikey': API_KEY, 'Accept': 'application/json' }
        });

        if (!faRes.ok) {
            return new Response(JSON.stringify({ error: "FlightAware Error", status: faRes.status }), { status: faRes.status });
        }

        const data = await faRes.json();
        
        // 🚀 BUGHUNT FIX 1: "scheduled" aus dem JSON des Nutzers hinzugefügt!
        let rawFlights = [];
        if (Array.isArray(data)) {
            rawFlights = data;
        } else {
            rawFlights = [
                ...(data.scheduled || []),  // <-- Das ist der Gamechanger!
                ...(data.flights || []),
                ...(data.scheduled_flights || []),
                ...(data.schedules || []),
                ...(data.departures || [])
            ];
        }
        
        // ==========================================
        // PANZER-CODE: Maßgeschneidert auf das neue JSON!
        // ==========================================
        let flights = rawFlights.map(f => {
            // 1. FLUGNUMMER: Preferiere 'actual_ident_iata' (Der echte ausführende Flug, blockt Codeshares ab)
            const ident = f.actual_ident_iata || f.ident_iata || f.ident || f.flight_number || "Unbekannt";
            
            // 2. AIRLINE: Im Schedules-Endpoint fehlt 'operator'. Wir schneiden den ICAO/IATA-Code aus der Flugnummer!
            let operator = f.operator || f.operator_icao || f.operator_iata || f.airline_icao;
            if (!operator) {
                const baseIdent = f.actual_ident_icao || f.ident_icao || f.ident || "";
                const match = baseIdent.match(/^[A-Za-z]+/); // Holt die Buchstaben raus (z.B. "VLG" aus "VLG1885")
                operator = match ? match[0] : "UNK";
            }
            
            // 3. FLUGHÄFEN: FlightAware liefert bei /schedules die IATA separat in 'origin_iata'
            const depIata = f.origin_iata || (f.origin && f.origin.code_iata) || (typeof f.origin === 'string' && f.origin.length === 3 ? f.origin : "UNK");
            const arrIata = f.destination_iata || (f.destination && f.destination.code_iata) || (typeof f.destination === 'string' && f.destination.length === 3 ? f.destination : "UNK");

            // 4. ZEITEN
            const depTime = f.scheduled_out || f.actual_out || f.estimated_out || f.departure_time;
            const arrTime = f.scheduled_in || f.actual_in || f.estimated_in || f.arrival_time;
            
            const aircraftType = (f.aircraft_type && typeof f.aircraft_type === 'object') ? f.aircraft_type.type : (f.aircraft_type || null);

            return {
                ...f, 
                flight_number: ident,
                airline_icao: operator,
                dep_iata: depIata,         
                arr_iata: arrIata,         
                dep_time_iso: depTime,
                arr_time_iso: arrTime,
                dep_time_ts: depTime ? Math.floor(new Date(depTime).getTime() / 1000) : null,
                arr_time_ts: arrTime ? Math.floor(new Date(arrTime).getTime() / 1000) : null,
                // 🚀 BUGHUNT FIX: Gates und Terminals exakt für das UI-Widget übersetzen!
                dep_terminal: f.terminal_origin || null,
                dep_gate: f.gate_origin || null,
                arr_terminal: f.terminal_destination || null,
                arr_gate: f.gate_destination || null,
                aircraft_registration: f.registration || null,
                aircraft_type: aircraftType
            };
        });

        // 🚀 BUGHUNT FIX 2: CODESHARES ZUSAMMENFASSEN
        // Eliminiert die 4 doppelten Einträge aus deinem JSON und behält nur den echten (z.B. VY1885)
        const uniqueFlights = [];
        const seenIds = new Set();
        for (const flight of flights) {
            const uniqueId = flight.flight_number !== "Unbekannt" ? flight.flight_number : Math.random().toString();
            
            if (!seenIds.has(uniqueId)) {
                seenIds.add(uniqueId);
                uniqueFlights.push(flight);
            }
        }

        // Chronologisch nach Abflugzeit sortieren
        uniqueFlights.sort((a, b) => {
            if (!a.dep_time_ts) return 1;
            if (!b.dep_time_ts) return -1;
            return a.dep_time_ts - b.dep_time_ts;
        });

        return new Response(JSON.stringify(uniqueFlights), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Backend Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}