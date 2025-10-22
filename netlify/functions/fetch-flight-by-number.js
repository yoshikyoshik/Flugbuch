// netlify/functions/fetch-flight-by-number.js
exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'GoFlightLabs API-Schlüssel ist nicht konfiguriert.' }) };
    }

    const { flight_iata, date } = event.queryStringParameters;
    if (!flight_iata || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    // --- NEUE LOGIK ZUR ENDPUNKT-AUSWAHL ---
    
    // Heutiges Datum im YYYY-MM-DD-Format für einen sauberen Vergleich
    const today = new Date().toISOString().slice(0, 10);
    let apiEndpoint = '';

    if (date < today) {
        // Datum liegt in der Vergangenheit -> /history/flights
        apiEndpoint = `https://api.goflightlabs.com/history/flights?access_key=${API_KEY}&flight_iata=${flight_iata}&date=${date}`;
    } else {
        // Datum ist heute oder in der Zukunft -> /futures/flights
        apiEndpoint = `https://api.goflightlabs.com/futures/flights?access_key=${API_KEY}&flight_iata=${flight_iata}&date=${date}`;
    }
    
    // --- ENDE NEUE LOGIK ---

    try {
        const response = await fetch(apiEndpoint);
        const responseBody = await response.text(); // Zuerst als Text lesen

        if (!response.ok) {
            // API hat einen Fehler gemeldet (z.B. 404, 422)
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody); // Jetzt sicher als JSON parsen
        
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};
