// netlify/functions/fetch-airport.js

exports.handler = async function(event, context) {
    const API_KEY = process.env.API_NINJAS_KEY;
    
    // Wir verwenden einen allgemeinen Parameter 'query' anstelle von 'iata'
    const query = event.queryStringParameters.query;

    if (!query || query.length < 3) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Eine Suchanfrage mit mindestens 3 Zeichen ist erforderlich.' })
        };
    }

    let apiEndpoint = '';
    
    // NEUE LOGIK: Entscheide, ob nach IATA oder Name gesucht wird
    if (query.length === 3) {
        // Wenn die Anfrage 3 Zeichen lang ist, nehmen wir an, es ist ein IATA-Code
        apiEndpoint = `https://api.api-ninjas.com/v1/airports?iata=${query}`;
    } else {
        // Ansonsten suchen wir nach dem Namen
        apiEndpoint = `https://api.api-ninjas.com/v1/airports?name=${encodeURIComponent(query)}`;
    }

    try {
        const response = await fetch(apiEndpoint, {
            headers: { 'X-Api-Key': API_KEY }
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