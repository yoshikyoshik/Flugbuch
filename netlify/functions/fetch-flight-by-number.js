// netlify/functions/fetch-flight-by-number.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'GoFlightLabs API-Schlüssel ist nicht konfiguriert.' }) };
    }

    const { flight_iata, date } = event.queryStringParameters;
    if (!flight_iata || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    const today = new Date().toISOString().slice(0, 10);
    let apiEndpoint = '';

    // KORRIGIERTE LOGIK BASIEREND AUF DEINER RECHERCHE:
    if (date < today) {
        // Datum liegt in der Vergangenheit -> /v1/historical/flights
        apiEndpoint = `https://api.goflightlabs.com/v1/historical/flights?access_key=${API_KEY}&flight_iata=${flight_iata}&date=${date}`;
    } else {
        // Datum ist heute oder in der Zukunft -> /v1/flights (der Standard-Endpunkt)
        apiEndpoint = `https://api.goflightlabs.com/v1/flights?access_key=${API_KEY}&flight_iata=${flight_iata}&date=${date}`;
    }
    
    try {
        const response = await fetch(apiEndpoint); 
        const responseBody = await response.text(); 

        if (!response.ok) {
            // Leitet den API-Fehler (z.B. "Datum außerhalb des Bereichs") an das Frontend weiter
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody);
        
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};