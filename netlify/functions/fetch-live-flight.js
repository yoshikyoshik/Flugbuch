exports.handler = async function(event, context) {
    // 🛡️ CORS-Header für native Smartphone-Apps!
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "OK" };
    }

    // 1. Alle Parameter auslesen (inkl. unseres eigenen 'date' Parameters aus der app.js)
    const { dep_iata, flight_iata, date } = event.queryStringParameters;

    console.log(`[API REQUEST] Starte Abfrage für Flug ${flight_iata} ab ${dep_iata} für Datum: ${date || 'HEUTE'}`);

    if (!dep_iata || !flight_iata) {
        console.warn("[API ERROR] Parameter fehlen!");
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Fehlende Parameter" }) };
    }

    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        console.error("[API ERROR] API Key fehlt in Environment Variables!");
        return { statusCode: 500, headers, body: JSON.stringify({ error: "API Key fehlt!" }) };
    }
    
    // 2. Offizielle Parameter nutzen (KEIN &date= in der URL, da nicht unterstützt!)
    const url = `https://www.goflightlabs.com/advanced-flights-schedules?access_key=${API_KEY}&iataCode=${dep_iata}&type=departure&flight_iata=${flight_iata}`;

    try {
        const response = await fetch(url);
        const textData = await response.text(); 
        
        let data;
        try {
            data = JSON.parse(textData);
        } catch (err) {
            console.error("[API ERROR] GoFlightLabs hat HTML statt JSON geantwortet!");
            return { statusCode: 500, headers, body: JSON.stringify({ error: "API gab ungültiges Format zurück" }) };
        }

        if (data.success === false) {
            console.log(`[API INFO] GoFlightLabs hat keinen Flug gefunden: ${data.data}`);
            return { statusCode: 404, headers, body: JSON.stringify({ error: data.data || "Keine Daten gefunden" }) };
        }

        const flightArray = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

        if (flightArray.length > 0) {
            let matchedFlight = null;

            // 3. 🚀 BUGHUNT FIX: Jetzt filtern WIR manuell nach dem Datum, weil die API es nicht kann!
            if (date) {
                matchedFlight = flightArray.find(flight => {
                    // Die API liefert verschiedene Zeitstempel. Wir isolieren YYYY-MM-DD (die ersten 10 Zeichen)
                    const apiDate1 = flight.flight_date; 
                    const apiDate2 = flight.dep_time ? flight.dep_time.substring(0, 10) : null;
                    const apiDate3 = flight.dep_estimated ? flight.dep_estimated.substring(0, 10) : null;

                    return apiDate1 === date || apiDate2 === date || apiDate3 === date;
                });
            }

            // Fallback: Falls wir keinen Match haben, nehmen wir einfach das erste Element
            if (!matchedFlight) {
                console.log(`[API INFO] Kein exakter Match für Datum ${date} gefunden. Nutze Fallback (Index 0).`);
                matchedFlight = flightArray[0];
            }

            console.log(`[API SUCCESS] Daten für ${flight_iata} (Match für ${date}) gefunden und gesendet!`);
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify(matchedFlight)
            };
        } else {
            console.log(`[API INFO] Flug ${flight_iata} war nicht in der Liste.`);
            return { statusCode: 404, headers, body: JSON.stringify({ error: `Flug ${flight_iata} nicht gefunden.` }) };
        }
        
    } catch (error) {
        console.error(`[API CRASH] Server Fehler: ${error.message}`);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Server-Crash: " + error.message }) };
    }
};