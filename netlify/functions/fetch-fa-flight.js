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
            // 🚀 BUGHUNT FIX: Wir gehen ZURÜCK zum Endpunkt, der die 5 "Unbekannt" Flüge geliefert hat!
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
        
        // FlightAware liefert die Daten je nach Endpunkt als direktes Array oder verschachtelt
        let rawFlights = [];
        if (Array.isArray(data)) {
            rawFlights = data;
        } else {
            // Der absolute Staubsauger für alle FlightAware-Endpunkte
            rawFlights = [
                ...(data.flights || []),
                ...(data.scheduled_flights || []),
                ...(data.schedules || []),
                ...(data.scheduled_departures || []),
                ...(data.departures || []),
                ...(data.scheduled_arrivals || []),
                ...(data.arrivals || [])
            ];
        }
        
        // ==========================================
        // PANZER-CODE: Alles exakt für ui.js übersetzen!
        // ==========================================
        let flights = rawFlights.map(f => {
            // Flugnummer
            const ident = f.ident || f.ident_iata || f.ident_icao || f.fa_flight_id || f.flight_number || "Unbekannt";
            // Airline
            const operator = f.operator || f.operator_iata || f.operator_icao || f.airline || f.airline_icao || "UNK";
            
            // Abflug/Ankunft (Zwingend für den Autopiloten!)
            const depIata = (f.origin && f.origin.code_iata) ? f.origin.code_iata : (typeof f.origin === 'string' ? f.origin : (f.origin_iata || ""));
            const arrIata = (f.destination && f.destination.code_iata) ? f.destination.code_iata : (typeof f.destination === 'string' ? f.destination : (f.destination_iata || ""));

            // Flugzeiten
            const depTime = f.scheduled_out || f.actual_out || f.estimated_out || f.departure_time;
            const arrTime = f.scheduled_in || f.actual_in || f.estimated_in || f.arrival_time;
            
            // Flugzeugtyp
            const aircraftType = (f.aircraft_type && typeof f.aircraft_type === 'object') ? f.aircraft_type.type : (f.aircraft_type || null);

            return {
                ...f, // Alle Original-Daten erhalten!
                flight_number: ident,
                airline_icao: operator,
                dep_iata: depIata,         
                arr_iata: arrIata,         
                dep_time_iso: depTime,
                arr_time_iso: arrTime,
                dep_time_ts: depTime ? Math.floor(new Date(depTime).getTime() / 1000) : null,
                arr_time_ts: arrTime ? Math.floor(new Date(arrTime).getTime() / 1000) : null,
                aircraft_registration: f.registration || null,
                aircraft_type: aircraftType
            };
        });

        // 🚀 DUPLIKATE FILTERN
        const uniqueFlights = [];
        const seenIds = new Set();
        for (const flight of flights) {
            // "Unbekannt" darf NICHT blockiert werden, falls die API zickt
            const uniqueId = (flight.flight_number !== "Unbekannt") ? flight.flight_number : Math.random().toString();
            
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