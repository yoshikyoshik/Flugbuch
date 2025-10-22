// netlify/functions/fetch-flight-by-number.js
exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'GoFlightLabs API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // NEU: Wir holen uns jetzt auch das Datum
    const { flight_iata, date } = event.queryStringParameters;
    
    // NEU: Wir prüfen jetzt auf beide Parameter
    if (!flight_iata || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    // NEU: Wir verwenden den /history/flights Endpunkt und übergeben das Datum
    const API_ENDPOINT = `https://api.goflightlabs.com/history/flights?access_key=${API_KEY}&flight_iata=${flight_iata}&date=${date}`;

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
        return { statusCode: 500, body: JSON.stringify({ message: 'Interner Serverfehler.' }) };
    }
};