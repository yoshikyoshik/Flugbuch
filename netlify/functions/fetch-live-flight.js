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

    const { dep_iata, flight_iata } = event.queryStringParameters;

    // 🕵️‍♂️ NEU: Monitoring! Das taucht ab jetzt in deinem Netlify-Log auf!
    console.log(`[API REQUEST] Starte Abfrage für Flug ${flight_iata} ab ${dep_iata}`);

    if (!dep_iata || !flight_iata) {
        console.warn("[API ERROR] Parameter fehlen!");
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Fehlende Parameter" }) };
    }

    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        console.error("[API ERROR] API Key fehlt in Environment Variables!");
        return { statusCode: 500, headers, body: JSON.stringify({ error: "API Key fehlt!" }) };
    }
    
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
            console.log(`[API SUCCESS] Daten für ${flight_iata} gefunden und an App gesendet!`);
            return {
                statusCode: 200,
                headers: headers, // 🚀 WICHTIG: Hier stecken die Erlaubnis-Header drin!
                body: JSON.stringify(flightArray[0])
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