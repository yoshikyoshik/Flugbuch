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
        let isRouteSearch = false;

        if (flight_number) {
            // ==========================================
            // MODUS A: Suche per Flugnummer (Autopilot / Live Widget)
            // ==========================================
            const cleanFlightNum = flight_number.replace(/\s+/g, '').toUpperCase();
            let startDate = date ? `${date}T00:00:00Z` : "";
            let endDate = date ? `${date}T23:59:59Z` : "";
            faUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${cleanFlightNum}`;
            if (date) {
                faUrl += `?start=${startDate}&end=${endDate}`;
            }
        } else if (dep && arr) {
            // ==========================================
            // MODUS B: Suche per Strecke (Lupe im Formular)
            // ==========================================
            isRouteSearch = true;
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
        let flights = [];

        // ==========================================
        // DATEN-NORMALISIERUNG (Für das Frontend)
        // ==========================================
        if (isRouteSearch) {
            flights = data.scheduled_flights || [];
            // FlightAware /schedules liefert andere Feldnamen als /flights. Wir biegen das für das Frontend gerade!
            flights = flights.map(f => ({
                flight_number: f.ident,
                airline_icao: f.operator,
                dep_time_iso: f.scheduled_out,
                arr_time_iso: f.scheduled_in,
                dep_time_ts: f.scheduled_out ? Math.floor(new Date(f.scheduled_out).getTime() / 1000) : null,
                arr_time_ts: f.scheduled_in ? Math.floor(new Date(f.scheduled_in).getTime() / 1000) : null,
                aircraft_type: f.aircraft_type
            }));
        } else {
            flights = data.flights || [];
            flights = flights.map(f => {
                const depTime = f.actual_out || f.estimated_out || f.scheduled_out;
                const arrTime = f.actual_in || f.estimated_in || f.scheduled_in;
                return {
                    ...f,
                    flight_number: f.ident,
                    airline_icao: f.operator,
                    dep_time_iso: depTime,
                    arr_time_iso: arrTime,
                    dep_time_ts: depTime ? Math.floor(new Date(depTime).getTime() / 1000) : null,
                    arr_time_ts: arrTime ? Math.floor(new Date(arrTime).getTime() / 1000) : null,
                    aircraft_registration: f.registration
                };
            });
        }

        return new Response(JSON.stringify(flights), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Backend Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}