// netlify/functions/fetch-flight-by-number.js
// KEIN 'require('node-fetch')' mehr hier. Wir verwenden die Standard-fetch-Funktion.

/*
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
// KEIN 'require('node-fetch')'. Wir verwenden die globale fetch-Funktion.

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    const { flight_number, date } = event.queryStringParameters;
    if (!flight_number || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    // KORREKTER ENDPUNKT: /v2/flight mit den neuen Parametern
    // Wir suchen sicherheitshalber 3 Tage (gestern, heute, morgen), falls der Flug verspätet ist,
    // aber GoFlightLabs v2 erlaubt nur einen Datumsbereich, wenn man auch 'search_by' nutzt.
    // Wir verwenden stattdessen 'date_from' und 'date_to' mit demselben Datum.
    const apiEndpoint = `https://www.goflightlabs.com/flight?access_key=${API_KEY}&search_by=number&flight_number=${flight_number}&date_from=${date}&date_to=${date}`;

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