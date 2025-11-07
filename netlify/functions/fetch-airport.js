// netlify/functions/fetch-airport.js
// KORRIGIERT: Fügt den fehlenden 'Accept-Version'-Header hinzu

const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const TOKEN = process.env.FLIGHTRADAR24_TOKEN; 
    if (!TOKEN) {
        console.log("FEHLER: FR24-Token ist nicht konfiguriert.");
        return { statusCode: 500, body: JSON.stringify({ message: 'FR24-Token ist nicht konfiguriert.' }) };
    }

    const { query } = event.queryStringParameters;
    if (!query || query.length < 3) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Mindestens 3 Zeichen erforderlich.' }) };
    }

    const API_ENDPOINT = `https://fr24api.flightradar24.com/api/search/airports?query=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(API_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${TOKEN}`,
                'Accept-Version': 'v1' // ✅ HIER IST DER FEHLENDE HEADER
            }
        }); 
        
        const data = await response.json(); 

        if (!response.ok) {
            console.error("FR24 API Fehler:", data);
            return { statusCode: response.status, body: JSON.stringify(data) };
        }

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