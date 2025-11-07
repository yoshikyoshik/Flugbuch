// netlify/functions/fetch-airport.js
// DIESE FUNKTION NUTZT JETZT DEN KORREKTEN FR24-SUCH-ENDPUNKT

const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const TOKEN = process.env.FLIGHTRADAR24_TOKEN; 
    if (!TOKEN) {
        console.log("FEHLER: FR24-Token ist nicht konfiguriert.");
        return { statusCode: 500, body: JSON.stringify({ message: 'FR24-Token ist nicht konfiguriert.' }) };
    }

    // 1. Wir erwarten den "?query=..." Parameter vom Frontend
    const { query } = event.queryStringParameters;
    if (!query || query.length < 3) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Mindestens 3 Zeichen erforderlich.' }) };
    }

    // 2. ✅ KORREKTER FR24-Endpunkt für die Autocomplete-Suche
    const API_ENDPOINT = `https://fr24api.flightradar24.com/api/search/airports?query=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(API_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${TOKEN}` 
            }
        }); 
        
        const data = await response.json(); 

        if (!response.ok) {
            console.error("FR24 API Fehler:", data);
            return { statusCode: response.status, body: JSON.stringify(data) };
        }

        // 3. Die FR24-Suche gibt {"results": [...]}. 
        // Wir senden das ganze Objekt zurück.
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data) 
        };
    } catch (error) {
        console.error(`Interner Serverfehler in fetch-airport: ${error.message}`);
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};