// netlify/functions/fetch-flight-by-number.js

/**
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
	// const apiEndpoint = `https://api.goflightlabs.com/v1/flight?access_key=${API_KEY}&flight_number=${flight_number}&date=${date}`;
    
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
*/

// netlify/functions/fetch-flight-by-number.js
// netlify/functions/fetch-flight-by-number.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // --- DEBUGGING ---
    console.log("Netlify Function 'fetch-flight-by-number' aufgerufen.");
    console.log("Empfangene Query-Parameter:", event.queryStringParameters);
    // --- ENDE DEBUGGING ---

    const TOKEN = process.env.FLIGHTRADAR24_TOKEN; 
    if (!TOKEN) {
        console.log("FEHLER: FR24-Token ist nicht konfiguriert.");
        return { statusCode: 500, body: JSON.stringify({ message: 'FR24-Token ist nicht konfiguriert.' }) };
    }

    const { flight_number, date } = event.queryStringParameters;
    if (!flight_number || !date) {
        console.log("FEHLER: Flugnummer oder Datum fehlen.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    const dateFrom = `${date}T00:00:00Z`;
    const dateTo = `${date}T23:59:59Z`;

    const API_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    
    // --- DEBUGGING ---
    console.log(`Rufe FR24-API auf: ${API_ENDPOINT}`);
    // --- ENDE DEBUGGING ---

    try {
        const response = await fetch(API_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        }); 
        
        const responseBody = await response.text(); 
        
        // --- DEBUGGING ---
        console.log(`Antwort-Status von FR24: ${response.status}`);
        console.log(`Antwort-Body von FR24 (als Text): ${responseBody}`);
        // --- ENDE DEBUGGING ---

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
        console.log(`FEHLER im catch-Block: ${error.message}`);
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};