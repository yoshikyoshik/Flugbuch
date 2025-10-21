// netlify/functions/fetch-flight-by-number.js
exports.handler = async function(event, context) {
    const API_KEY = process.env.API_NINJAS_KEY;
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist auf dem Server nicht konfiguriert.' }) };
    }

    const { flight_iata, date } = event.queryStringParameters;
    if (!flight_iata || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    const API_ENDPOINT = `https://api.api-ninjas.com/v1/flights?flight_iata=${flight_iata}&date=${date}`;

    try {
        const response = await fetch(API_ENDPOINT, { headers: { 'X-Api-Key': API_KEY } });
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