// netlify/functions/fetch-airport-details.js
// KEIN 'require('node-fetch')' mehr hier.

exports.handler = async function(event, context) {
    // --- START DEBUGGING ---
    console.log("Netlify Function 'fetch-airport-details' aufgerufen.");
    console.log("Empfangene Query-Parameter:", event.queryStringParameters);
    // --- END DEBUGGING ---

    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        console.log("FEHLER: API-Schlüssel nicht gefunden.");
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // Wir prüfen 'code', den das Frontend sendet
    const { code } = event.queryStringParameters;
    if (!code) {
        console.log("FEHLER: Parameter 'code' fehlt in der Anfrage.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "code" ist erforderlich.' }) };
    }

    console.log(`Parameter 'code' erfolgreich empfangen: ${code}`);

    // Wir verwenden die Domain 'www.' und den Parameter 'iata_code' für die API
    const apiEndpoint = `https://www.goflightlabs.com/airports-by-filter?access_key=${API_KEY}&iata_code=${code}`;
    
    console.log(`Rufe externe API auf: ${apiEndpoint}`);

    try {
        const response = await fetch(apiEndpoint); 
        const responseBody = await response.text(); 

        if (!response.ok) {
            console.log(`FEHLER von externer API: Status ${response.status}, Body: ${responseBody}`);
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        console.log("Erfolgreiche Antwort von API erhalten.");
        const data = JSON.parse(responseBody);
        
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.log(`INTERNER FEHLER: ${error.message}`);
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};

