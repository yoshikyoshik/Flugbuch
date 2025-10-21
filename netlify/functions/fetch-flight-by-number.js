// netlify/functions/fetch-flight-by-number.js
exports.handler = async function(event, context) {
    // NEU: Der richtige API-Schlüssel wird gelesen
    const API_KEY = process.env.AVIATIONSTACK_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'AviationStack API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // Der Parameter von der App bleibt 'flight_iata'
    const { flight_iata, date } = event.queryStringParameters;
    if (!flight_iata) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer ist erforderlich.' }) };
    }

    // NEU: Der korrekte Endpunkt von AviationStack
    // Hinweis: Der kostenlose Plan erfordert HTTP, nicht HTTPS. Das ist okay, da der Aufruf sicher vom Netlify-Server aus erfolgt.
    const API_ENDPOINT = `http://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${flight_iata}`;

    try {
        const response = await fetch(API_ENDPOINT);
        if (!response.ok) {
            const errorBody = await response.text();
            return { statusCode: response.status, body: `Fehler von externer API: ${errorBody}` };
        }
        const data = await response.json();
        
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: 'Interner Serverfehler' }) };
    }
};