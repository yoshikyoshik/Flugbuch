// netlify/functions/fetch-flight-by-number.js
exports.handler = async function(event, context) {
    const API_KEY = process.env.AVIATIONSTACK_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'AviationStack API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // NEU: Wir holen uns jetzt auch das Datum aus der Anfrage
    const { flight_iata, date } = event.queryStringParameters;
    if (!flight_iata || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    // NEU: Der korrekte Endpunkt mit dem flight_date Parameter
    const API_ENDPOINT = `http://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${flight_iata}&flight_date=${date}`;

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