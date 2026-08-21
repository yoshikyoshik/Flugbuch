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
            // MODUS A: Suche per Flugnummer
            // ==========================================
            const cleanFlightNum = flight_number.replace(/\s+/g, '').toUpperCase();
            faUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${cleanFlightNum}`;
            if (date) {
                faUrl += `?start=${date}T00:00:00Z&end=${date}T23:59:59Z`;
            }
        } else if (dep && arr) {
            // ==========================================
            // MODUS B: Suche per Strecke
            // ==========================================
            faUrl = `https://aeroapi.flightaware.com/aeroapi/airports/${dep.toUpperCase()}/flights/to/${arr.toUpperCase()}`;
            if (date) {
                faUrl += `?start=${date}T00:00:00Z&end=${date}T23:59:59Z`;
            }
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
        
        // 🚀 BUGHUNT FIX: Der Staubsauger!
        // Wir holen restlos alle Arrays ab, die FlightAware liefern könnte.
        let rawFlights = [
            ...(data.flights || []),
            ...(data.scheduled_flights || []),
            ...(data.scheduled_departures || []),
            ...(data.departures || []),
            ...(data.scheduled_arrivals || []),
            ...(data.arrivals || [])
        ];
        
        // ==========================================
        // PANZER-CODE: Mapping der unterschiedlichen Feldnamen
        // ==========================================
        let flights = rawFlights.map(f => {
            const ident = f.ident_iata || f.ident_icao || f.ident || f.flight_number || "Unbekannt";
            const operator = f.operator_iata || f.operator_icao || f.operator || f.airline_icao || "UNK";
            const depTime = f.scheduled_out || f.actual_out || f.estimated_out;
            const arrTime = f.scheduled_in || f.actual_in || f.estimated_in;
            
            return {
                ...f,
                flight_number: ident,
                airline_icao: operator,
                dep_time_iso: depTime,
                arr_time_iso: arrTime,
                dep_time_ts: depTime ? Math.floor(new Date(depTime).getTime() / 1000) : null,
                arr_time_ts: arrTime ? Math.floor(new Date(arrTime).getTime() / 1000) : null,
                aircraft_registration: f.registration || null,
                aircraft_type: f.aircraft_type || null
            };
        });

        // 🚀 DUPLIKATE FILTERN
        // Verhindert, dass ein Flug doppelt auftaucht, wenn er in "scheduled" und "departures" steht.
        const uniqueFlights = [];
        const seenIds = new Set();
        for (const flight of flights) {
            const uniqueId = flight.fa_flight_id || flight.flight_number;
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