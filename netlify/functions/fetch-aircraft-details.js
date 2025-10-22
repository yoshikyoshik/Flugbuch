// netlify/functions/fetch-aircraft-details.js
// KEIN 'require('node-fetch')'. Wir verwenden die globale fetch-Funktion.

exports.handler = async function(event, context) {
    // Wir verwenden den API_NINJAS_KEY
    const API_KEY = process.env.API_NINJAS_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Ninjas API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // Wir erwarten 'model' als Parameter
    const { model } = event.queryStringParameters;
    if (!model) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "model" ist erforderlich.' }) };
    }

    const API_ENDPOINT = `https://api.api-ninjas.com/v1/aircraft?model=${encodeURIComponent(model)}`;

    try {
        const response = await fetch(API_ENDPOINT, {
            headers: { 'X-Api-Key': API_KEY }
        }); 
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
