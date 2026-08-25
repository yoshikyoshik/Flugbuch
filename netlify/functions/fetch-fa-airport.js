export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    if (!API_KEY) {
        return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 500 });
    }

    const url = new URL(request.url);
    const airportCode = url.searchParams.get("airport"); // Z.B. "BER"
    const type = url.searchParams.get("type") || "arrivals"; // "arrivals" oder "departures"

    if (!airportCode) {
        return new Response(JSON.stringify({ error: "Missing airport code" }), { status: 400 });
    }

    const headers = { 'x-apikey': API_KEY, 'Accept': 'application/json' };

    try {
        // FlightAware API v4 Endpunkt für Flughafen-Aktivität
        const faUrl = `https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(airportCode)}/flights/${encodeURIComponent(type)}?max_pages=1`;
        
        const res = await fetch(faUrl, { headers });
        
        if (!res.ok) {
           throw new Error(`FlightAware API error: ${res.status}`);
        }

        const data = await res.json();
        const flights = data.arrivals || data.departures || [];

        // Wir bereinigen die Daten leicht fürs Frontend
        const cleanFlights = flights.map(f => {
            return {
                ident: f.ident,
                flight_number: f.flight_number || f.ident,
                origin: f.origin ? f.origin.code_iata : "UNK",
                destination: f.destination ? f.destination.code_iata : "UNK",
                scheduled_time: f.scheduled_on || f.scheduled_in || f.scheduled_out,
                estimated_time: f.estimated_on || f.estimated_in || f.estimated_out,
                actual_time: f.actual_on || f.actual_in || f.actual_out,
                status: f.status,
                aircraft_type: (f.aircraft_type && f.aircraft_type.type) ? f.aircraft_type.type : "UNK"
            };
        });

        return new Response(JSON.stringify(cleanFlights), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Airport Fetch Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}