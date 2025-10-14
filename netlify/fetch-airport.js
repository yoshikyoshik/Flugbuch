// netlify/functions/fetch-airport.js

exports.handler = async function(event, context) {
    // API-Schlüssel sicher aus den Netlify-Umgebungsvariablen holen
    const API_KEY = process.env.API_NINJAS_KEY;
    
    // IATA-Code aus der Anfrage des Frontends holen (z.B. ...?iata=LHR)
    const iataCode = event.queryStringParameters.iata;

    if (!iataCode || iataCode.length !== 3) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Ein gültiger 3-stelliger IATA-Code ist erforderlich.' })
        };
    }

    const API_ENDPOINT = `https://api.api-ninjas.com/v1/airports?iata=${iataCode}`;

    try {
        const response = await fetch(API_ENDPOINT, {
            headers: {
                'X-Api-Key': API_KEY
            }
        });

        if (!response.ok) {
            return { statusCode: response.status, body: response.statusText };
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