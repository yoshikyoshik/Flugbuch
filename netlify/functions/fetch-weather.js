// netlify/functions/fetch-weather.js

exports.handler = async function(event, context) {
    const API_KEY = process.env.API_NINJAS_KEY;
    
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist auf dem Server nicht konfiguriert.' }) };
    }

    const { lat, lon } = event.queryStringParameters;

    if (!lat || !lon) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Latitude und Longitude sind erforderlich.' })
        };
    }

    const API_ENDPOINT = `https://api.api-ninjas.com/v1/weather?lat=${lat}&lon=${lon}`;

    try {
        const response = await fetch(API_ENDPOINT, {
            headers: { 'X-Api-Key': API_KEY }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            return { statusCode: response.status, body: `Fehler von externer API: ${errorBody}` };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Interner Serverfehler' })
        };
    }
};