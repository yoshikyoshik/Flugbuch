// netlify/functions/fetch-flight-by-number.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'GoFlightLabs API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // KORREKTUR: Verwende 'flight_number' statt 'flight_iata'
    const { flight_number, date } = event.queryStringParameters;
    
    if (!flight_number || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    // KORREKTUR: Verwende den von dir gefundenen /flight Endpunkt
    const API_ENDPOINT = `https://api.goflightlabs.com/v1/flight?access_key=${API_KEY}&flight_number=${flight_number}&date=${date}`;
	//const API_ENDPOINT = `https://api.goflightlabs.com/flight?access_key=${API_KEY}&flight_number=${flight_number}&date=${date}`;
    
    try {
        const response = await fetch(apiEndpoint); 
        const responseBody = await response.text(); 

        if (!response.ok) {
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