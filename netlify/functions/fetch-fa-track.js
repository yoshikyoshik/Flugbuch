const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // Erlaubt Anfragen aus dem Frontend
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: ''
        };
    }

    const { fa_flight_id } = event.queryStringParameters;

    if (!fa_flight_id) {
        return { 
            statusCode: 400, 
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: "Missing FlightAware ID" }) 
        };
    }

    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    // Wir fragen exakt nach dem Flight-Track für diese spezifische Flug-ID
    const faUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(fa_flight_id)}/track`;

    try {
        const response = await fetch(faUrl, {
            headers: {
                'x-apikey': API_KEY
            }
        });

        if (!response.ok) {
            console.warn(`Kein GPS-Track gefunden für ${fa_flight_id}. Status: ${response.status}`);
            return { 
                statusCode: response.status, 
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ positions: [] }) // Leeres Array als sicherer Fallback
            };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            // Wir schicken nur das Positions-Array ans Frontend, um Daten zu sparen
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error("Netzwerkfehler beim Track-Fetch:", error);
        return { 
            statusCode: 500, 
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Internal Server Error' }) 
        };
    }
};