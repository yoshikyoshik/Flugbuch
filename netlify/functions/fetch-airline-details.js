// netlify/functions/fetch-airline-details.js
// KEIN 'require('node-fetch')'

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // Wir erwarten den IATA-Code der Airline
    const { iata_code } = event.queryStringParameters;
    if (!iata_code) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "iata_code" ist erforderlich.' }) };
    }

    // Der korrekte Endpunkt (www) und Parameter (iata_code)
    const apiEndpoint = `https://www.goflightlabs.com/airlines?access_key=${API_KEY}&iata_code=${iata_code}`;

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