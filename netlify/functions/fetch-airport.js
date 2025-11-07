// netlify/functions/fetch-airport.js
// Diese Funktion ist für die AUTOCOMPLETE-SUCHE zuständig.

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // 1. Wir erwarten den "?query=..." Parameter vom Frontend
    const { query } = event.queryStringParameters;
    if (!query) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "query" ist erforderlich.' }) };
    }

    // 2. Wir rufen den KORREKTEN GoFlightLabs-Such-Endpunkt auf (mit 'name=...')
    const apiEndpoint = `https://www.goflightlabs.com/airports?access_key=${API_KEY}&name=${query}`;
    
    try {
        const response = await fetch(apiEndpoint); 
        const responseBody = await response.text(); 

        if (!response.ok) {
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody);
        
        // 3. Das Frontend (fetchExternalAirport) erwartet ein reines Array.
        // Die API gibt { "success": true, "data": [...] } zurück.
        // Wir geben daher nur das 'data'-Array zurück.
        
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data.data) // Nur das Array zurückgeben
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};