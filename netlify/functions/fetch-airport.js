/**
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
        return {
    statusCode: 200,
    headers: {
        "Access-Control-Allow-Origin": "*", // Erlaubt Anfragen von jeder Herkunft
        "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(data)
};
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: 'Interner Serverfehler' }) };
    }
};
*/

// netlify/functions/fetch-airport.js
// KORRIGIERT: Erkennt jetzt IATA (3), ICAO (4) und Name

exports.handler = async function(event, context) {
    const API_KEY = process.env.API_NINJAS_KEY;
    const query = event.queryStringParameters.query.toUpperCase(); // Wichtig: Großbuchstaben

    if (!API_KEY) {
         return { statusCode: 500, body: JSON.stringify({ message: 'API-Ninjas-Schlüssel ist nicht konfiguriert.' }) };
    }
    
    if (!query || query.length < 3) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Mindestens 3 Zeichen erforderlich.' }) };
    }

    let apiEndpoint;
    const icaoRegex = /^[A-Z0-9]{4}$/; // Prüft auf 4 alphanumerische Zeichen
    const iataRegex = /^[A-Z0-9]{3}$/; // Prüft auf 3 alphanumerische Zeichen

    if (iataRegex.test(query)) {
        // 3 Zeichen = IATA
        apiEndpoint = `https://api.api-ninjas.com/v1/airports?iata=${query}`;
    } else if (icaoRegex.test(query)) {
        // 4 Zeichen = ICAO
        apiEndpoint = `https://api.api-ninjas.com/v1/airports?icao=${query}`;
    } else {
        // Alles andere = Name
        apiEndpoint = `https://api.api-ninjas.com/v1/airports?name=${encodeURIComponent(query)}`;
    }

    try {
        const response = await fetch(apiEndpoint, { headers: { 'X-Api-Key': API_KEY } });
        
        if (!response.ok) { 
            if (response.status === 404) {
                return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: "[]" };
            }
            return { statusCode: response.status, body: response.statusText }; 
        }
        
        const data = await response.json(); 
        
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: 'Interner Serverfehler' }) };
    }
};