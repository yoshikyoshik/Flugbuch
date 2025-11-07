// netlify/functions/fetch-airport.js
// Diese Funktion ist für die AUTOCOMPLETE-SUCHE zuständig.

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    const { query } = event.queryStringParameters;
    if (!query) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "query" ist erforderlich.' }) };
    }

    const apiEndpoint = `https://www.goflightlabs.com/retrieve-airports?access_key=${API_KEY}&query=${query}`;
    
    try {
        const response = await fetch(apiEndpoint); 
        const responseBody = await response.text(); 

        if (!response.ok) {
            // Wenn GoFlightLabs selbst einen 500er oder 404er wirft
            return { 
                statusCode: 200, // Für das Frontend ist das kein Fehler, nur keine Daten
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify([]) // Leeres Array zurückgeben
            };
        }

        const data = JSON.parse(responseBody);
        
        // --- ✅ HIER IST DIE KORREKTUR ---
        // Wir prüfen, ob die API-Antwort erfolgreich war UND das data-Array existiert.
        if (data.success && data.data && Array.isArray(data.data)) {
            return {
                statusCode: 200,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(data.data) // Nur das Array zurückgeben
            };
        } else {
            // Wenn die API 'success: false' oder kein 'data'-Array sendet (z.B. bei "Toro")
            return {
                statusCode: 200, // Die Funktion selbst war erfolgreich
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify([]) // Ein leeres Array zurückgeben
            };
        }
        // --- ✅ ENDE KORREKTUR ---

    } catch (error) {
        // Falls JSON.parse fehlschlägt oder ein Netzwerkfehler auftritt
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};