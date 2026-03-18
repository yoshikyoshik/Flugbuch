// Kein require('node-fetch') mehr nötig! Moderne Netlify-Node.js Versionen haben das eingebaut.

exports.handler = async function(event, context) {
    // Parameter aus der URL lesen
    const { dep_iata, flight_iata } = event.queryStringParameters;

    if (!dep_iata || !flight_iata) {
        return { statusCode: 400, body: JSON.stringify({ error: "Fehlende Parameter" }) };
    }

    // 1. API Key Check
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: "API Key fehlt in Netlify Environment Variables!" }) };
    }
    
    const url = `https://app.goflightlabs.com/flights-schedules?access_key=${API_KEY}&iataCode=${dep_iata}&type=departure`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        // 2. Hat GoFlightLabs einen Fehler gemeldet? (z.B. Limit erreicht, Key falsch)
        if (data.success === false || data.error) {
            return { 
                statusCode: 500, 
                body: JSON.stringify({ error: "GoFlightLabs API Fehler", details: data.error }) 
            };
        }

        // 3. Prüfen, ob wir wirklich eine Liste von Flügen haben
        if (data && data.data && Array.isArray(data.data)) {
            
            const cleanTarget = flight_iata.replace(/\s+/g, '').toUpperCase();
            
            // Flug suchen
            const matchedFlight = data.data.find(f => {
                if (!f.flight_iata && !f.flight_number) return false;
                const apiFlightIata = (f.flight_iata || "").replace(/\s+/g, '').toUpperCase();
                const apiFlightNumber = (f.flight_number || "").replace(/\s+/g, '').toUpperCase();
                return apiFlightIata === cleanTarget || apiFlightNumber === cleanTarget;
            });

            if (matchedFlight) {
                // Treffer!
                return {
                    statusCode: 200,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(matchedFlight)
                };
            } else {
                return { statusCode: 404, body: JSON.stringify({ error: `Flug ${cleanTarget} in den heutigen Abflügen ab ${dep_iata} nicht gefunden.` }) };
            }
        }
        
        // 4. Wenn die API etwas ganz anderes antwortet
        return { statusCode: 500, body: JSON.stringify({ error: "Unerwartetes API-Format", raw_data: data }) };
        
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Server-Crash: " + error.message }) };
    }
};