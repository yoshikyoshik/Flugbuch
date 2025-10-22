// netlify/functions/fetch-flight-by-number.js

/**
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'GoFlightLabs API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // Wir verwenden die Parameter, die du in der Doku gefunden hast
    const { flight_number, date } = event.queryStringParameters;
    
    if (!flight_number || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    // KORREKTER ENDPUNKT: /v1/flight, wie von dir recherchiert
    const apiEndpoint = `https://api.goflightlabs.com/v1/flight?access_key=${API_KEY}&flight_number=${flight_number}&date=${date}`;
    
    try {
        // KORREKTE VARIABLE: apiEndpoint (kleingeschrieben)
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
*/

// netlify/functions/fetch-flight-by-number.js
// KEIN 'require('node-fetch')' mehr hier. Wir verwenden die Standard-fetch-Funktion.

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'GoFlightLabs API-Schlüssel ist nicht konfiguriert.' }) };
    }

    const { flight_number, date } = event.queryStringParameters;
    if (!flight_number || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    // KORREKTER ENDPUNKT: 'www.goflightlabs.com/flight', wie von dir im Browser getestet.
    const apiEndpoint = `https://www.goflightlabs.com/flight?access_key=${API_KEY}&flight_number=${flight_number}&date=${date}`;
    
    try {
        // Verwendet die globale fetch-Implementierung von Netlify
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