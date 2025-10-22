
// netlify/functions/fetch-airport-details.js
// const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // KORREKTUR: Wir erwarten den Parameter 'code', den das Frontend sendet.
    const { code } = event.queryStringParameters;
    if (!code) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "code" ist erforderlich.' }) };
    }

    // KORREKTUR: Verwende 'www.goflightlabs.com', den '/airports'-Endpunkt
    // und sende den Parameter, den die API erwartet (basierend auf der Doku ist 'iata_code' der richtige Filtername)
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



/**
// netlify/functions/fetch-airport-details.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // KORREKTUR: Wir erwarten den Parameter 'code', den das Frontend sendet.
    const { code } = event.queryStringParameters;
    if (!code) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "code" ist erforderlich.' }) };
    }

    // KORREKTUR: Verwende 'www.goflightlabs.com', den '/airports'-Endpunkt
    // und sende den Parameter, den die API erwartet (basierend auf der Doku ist 'iata_code' der richtige Filtername)
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
*/