// netlify/functions/fetch-airport.js
// DIESE FUNKTION NUTZT JETZT FR24 FÜR DIE AUTOCOMPLETE-SUCHE

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

    // 2. Dies ist der korrekte FR24-Endpunkt für die Autocomplete-Suche
    const API_ENDPOINT = `https://api.flightradar24.com/common/v1/search.json?query=${encodeURIComponent(query)}&limit=10&type=airport`;

    try {
        const response = await fetch(API_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                // WICHTIG: Dieselbe Autorisierung wie bei deiner anderen FR24-Funktion
                'Authorization': `Bearer ${TOKEN}` 
            }
        }); 
        
        const data = await response.json(); 

        if (!response.ok) {
            console.error("FR24 API Fehler:", data);
            return { statusCode: response.status, body: JSON.stringify(data) };
        }

        // 3. Die FR24-Suche gibt {"results": [...]}. 
        // Wir senden das ganze Objekt zurück, das Frontend kümmert sich um das Auspacken.
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