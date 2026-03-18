const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // Parameter aus der App annehmen (z.B. ?dep_iata=FRA&flight_iata=LH400)
    const { dep_iata, flight_iata } = event.queryStringParameters;

    if (!dep_iata || !flight_iata) {
        return { statusCode: 400, body: JSON.stringify({ error: "Fehlende Parameter" }) };
    }

    // Deinen GoFlightLabs API Key holst du aus den Umgebungsvariablen in Netlify!
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    
    // Die offizielle GoFlightLabs URL für Schedules
    const url = `https://app.goflightlabs.com/flights-schedules?access_key=${API_KEY}&iataCode=${dep_iata}&type=departure`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        // Prüfen, ob die API geantwortet hat und ein Array (data) liefert
        if (data && data.data && Array.isArray(data.data)) {
            
            // Flugnummer bereinigen (Leerzeichen entfernen, alles groß) -> "LH400"
            const cleanTarget = flight_iata.replace(/\s+/g, '').toUpperCase();
            
            // Den Array durchsuchen
            const matchedFlight = data.data.find(f => {
                if (!f.flight_iata && !f.flight_number) return false;
                const apiFlightIata = (f.flight_iata || "").replace(/\s+/g, '').toUpperCase();
                const apiFlightNumber = (f.flight_number || "").replace(/\s+/g, '').toUpperCase();
                
                // Manchmal schickt die API nur die Nummer ohne Airline-Code, wir prüfen beides zur Sicherheit
                return apiFlightIata === cleanTarget || apiFlightNumber === cleanTarget;
            });

            if (matchedFlight) {
                // Treffer! Wir senden nur diesen einen Flug an die App zurück
                return {
                    statusCode: 200,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(matchedFlight)
                };
            } else {
                return { statusCode: 404, body: JSON.stringify({ error: "Flug in den Abflügen nicht gefunden" }) };
            }
        }
        
        return { statusCode: 500, body: JSON.stringify({ error: "Ungültige API Antwort" }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};