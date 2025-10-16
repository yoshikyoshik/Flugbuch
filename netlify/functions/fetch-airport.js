// netlify/functions/fetch-airport.js
exports.handler = async function(event, context) {
    const API_KEY = process.env.API_NINJAS_KEY;
    const query = event.queryStringParameters.query;

    if (!query || query.length < 3) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Mindestens 3 Zeichen erforderlich.' }) };
    }

    let apiEndpoint = query.length === 3
        ? `https://api.api-ninjas.com/v1/airports?iata=${query}`
        : `https://api.api-ninjas.com/v1/airports?name=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(apiEndpoint, { headers: { 'X-Api-Key': API_KEY } });
        if (!response.ok) { return { statusCode: response.status, body: response.statusText }; }
        const data = await response.json();
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: 'Interner Serverfehler' }) };
    }
};