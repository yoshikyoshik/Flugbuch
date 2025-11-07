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

    // --- ✅ KORREKTUR 1: Der URL-Endpunkt ---
    // Er lautet "retrieveAirport" (Singular, kein Bindestrich)
    const apiEndpoint = `https://www.goflightlabs.com/retrieveAirport?access_key=${API_KEY}&query=${query}`;
    
    try {
        const response = await fetch(apiEndpoint); 
        const responseBody = await response.text(); // Wir holen die Antwort als Text

        if (!response.ok) {
            // Wenn GoFlightLabs selbst einen Fehler wirft
            return { 
                statusCode: 200, // Für das Frontend ist das kein Fehler, nur keine Daten
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify([]) // Leeres Array zurückgeben
            };
        }

        // --- ✅ KORREKTUR 2: Die Antwort-Verarbeitung ---
        // Dein Test beweist, dass die API direkt ein Array "[{...}, {...}]" zurückgibt.
        // Es gibt kein "data.data" oder "data.success".
        // Der 'responseBody' IST das Array (als String).
        
        if (responseBody && responseBody.startsWith('[')) {
            // Wenn der Body mit "[" beginnt, ist es das Array, das wir wollen.
            return {
                statusCode: 200,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: responseBody // Wir geben den rohen Text (der das Array ist) direkt zurück
            };
        } else {
            // Fallback, falls die API Müll schickt (z.B. eine Fehlermeldung ohne '[')
            return {
                statusCode: 200, 
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify([]) 
            };
        }
        // --- ✅ ENDE KORREKTUR ---

    } catch (error) {
        // Falls fetch fehlschlägt
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};