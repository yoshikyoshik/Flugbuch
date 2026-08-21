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
    const date = url.searchParams.get("date");

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
            // Der einzige Endpunkt, der ALLE geplanten Flüge eines Tages liefert!
            faUrl = `https://aeroapi.flightaware.com/aeroapi/schedules/${dep.toUpperCase()}/${arr.toUpperCase()}`;
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
        
        // FlightAware liefert je nach Endpunkt "flights" oder "scheduled_flights"
        let rawFlights = data.scheduled_flights || data.flights || [];
        
        // ==========================================
        // 🚀 PANZER-CODE: Mapping der unterschiedlichen Feldnamen
        // ==========================================
        let flights = rawFlights.map(f => {
            // Alle FlightAware Namensvarianten abfangen
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

        return new Response(JSON.stringify(flights), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Backend Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}