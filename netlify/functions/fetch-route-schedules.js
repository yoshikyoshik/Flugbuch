// netlify/functions/fetch-route-schedules.js

exports.handler = async function(event, context) {
    // 🛡️ NEU: CORS-Header für native Smartphone-Apps!
    const headers = {
        "Access-Control-Allow-Origin": "*", // Erlaubt JEDER App (auch localhost auf dem Handy) den Zugriff
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };

    // Erlaube sogenannte "Preflight"-Anfragen (die Browser vor dem echten Request machen)
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "OK" };
    }

    // 1. Parameter auslesen (z.B. ?dep=FRA&arr=JFK)
    const depIata = event.queryStringParameters.dep;
    const arrIata = event.queryStringParameters.arr;

    if (!depIata || !arrIata) {
        return { 
            statusCode: 400, 
            headers, // <-- HIER HINZUGEFÜGT
            body: JSON.stringify({ error: "Start oder Ziel fehlt." }) 
        };
    }

    // 2. Deine API-URL für die Abflüge des heutigen Tages aufbauen
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    const url = `https://www.goflightlabs.com/advanced-flights-schedules?access_key=${API_KEY}&iataCode=${depIata}&type=departure`;

    try {
        // 3. API abfragen
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.data) {
            // 4. DER TRICK: Wir filtern direkt im Backend nach dem Zielort UND filtern Codeshares raus!
            const flightList = Array.isArray(data) ? data : (data.response || data.data || []);
            
            const filteredFlights = flightList.filter(flight => {
                if (!flight.arr_iata) return false;
                
                // 🛑 NEU: Codeshares herausfiltern (Wenn es ein Codeshare-Feld gibt, ist es nicht der Originalflug)
                if (flight.cs_flight_iata || flight.cs_flight_number) {
                    return false;
                }

                // Exakter Abgleich des Ziel-IATA-Codes
                return flight.arr_iata.toUpperCase() === arrIata.toUpperCase();
            });
            
            // 5. Nur die passenden Flüge an die App zurücksenden
            return { 
                statusCode: 200, 
                headers, 
                body: JSON.stringify(filteredFlights) 
            };
        } else {
            return { 
                statusCode: 200, 
                headers, // <-- HIER HINZUGEFÜGT
                body: JSON.stringify([]) 
            };
        }
    } catch (error) {
        console.error("API Fehler:", error);
        return { 
            statusCode: 500, 
            headers, // <-- HIER HINZUGEFÜGT
            body: JSON.stringify({ error: "Fehler beim Abrufen der Fahrpläne." }) 
        };
    }
};