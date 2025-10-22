/**
// netlify/functions/fetch-airport-details.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    const { iata_code } = event.queryStringParameters;
    if (!iata_code) {
        return { statusCode: 400, body: JSON.stringify({ message: 'IATA-Code ist erforderlich.' }) };
    }

    // Der von dir gefundene Endpunkt
    const API_ENDPOINT = `https://api.goflightlabs.com/v1/airports?access_key=${API_KEY}&iata_code=${iata_code}`;
	// const API_ENDPOINT = `https://www.goflightlabs.com/airports?access_key=${API_KEY}&iata_code=${iata_code}`;
	// const apiEndpoint = `https://www.goflightlabs.com/flight?access_key=${API_KEY}&flight_number=${flight_number}&date=${date}`;

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
*/

// netlify/functions/fetch-airport-details.js
const fetch = require('node-fetch'); // Behalte node-fetch bei, da es für die Stabilität sorgt

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // KORREKTUR: Der Parameter heißt 'code', nicht 'iata_code'
    const { code } = event.queryStringParameters;
    if (!code) {
        return { statusCode: 400, body: JSON.stringify({ message: 'IATA-Code (code) ist erforderlich.' }) };
    }

    // KORREKTUR: Verwende 'www.goflightlabs.com' und den '/airports'-Endpunkt
    const apiEndpoint = `https://www.goflightlabs.com/airports?access_key=${API_KEY}&iata_code=${code}`;
    
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