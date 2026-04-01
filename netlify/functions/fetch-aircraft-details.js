// netlify/functions/fetch-aircraft-details.js
// KEIN 'require('node-fetch')'. Wir verwenden die globale fetch-Funktion.

exports.handler = async function(event, context) {
    const API_KEY = process.env.API_NINJAS_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Ninjas API-Schlüssel ist nicht konfiguriert.' }) };
    }

    const { model } = event.queryStringParameters;
    if (!model) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "model" ist erforderlich.' }) };
    }

    // 🚀 BUGHUNT FIX 1: Dein fantastischer Wildcard-Parameter!
    const API_ENDPOINT = `https://api.api-ninjas.com/v1/aircraft?manufacturer=&model=${encodeURIComponent(model)}`;

    try {
        const response = await fetch(API_ENDPOINT, {
            headers: { 'X-Api-Key': API_KEY }
        }); 
        const responseBody = await response.text(); 
        if (!response.ok) {
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody);

        // 🚀 BUGHUNT FIX 2: Wir senden das VOLLE ARRAY zurück, weil deine geniale ui.js das so erwartet!
        if (Array.isArray(data) && data.length > 0) {
            return {
                statusCode: 200,
                headers: { 
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data) // <-- HIER: KEIN [0] MEHR! Wir senden die ganze Liste!
            };
        } else {
            return {
                statusCode: 404,
                headers: { 
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ message: "Keine Daten zu diesem Flugzeugtyp gefunden." })
            };
        }

    } catch (error) {
        return { statusCode: 500, body: `Server Fehler: ${error.message}` };
    }
};
