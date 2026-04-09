/*

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
    const { code } = event.queryStringParameters || {};
    
    // Globale CORS Header für die Antworten
    const CORS_HEADERS = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers: CORS_HEADERS, body: "" };
    }

    if (!code || code.trim() === "") {
        // HIER HABEN DIE CORS-HEADER GEFEHLT!
        return { 
            statusCode: 400, 
            headers: CORS_HEADERS, 
            body: JSON.stringify({ message: 'Flughafencode fehlt oder ist leer.' }) 
        };
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

*/

// netlify/functions/fetch-airport-details.js

exports.handler = async function(event, context) {
    // --- START DEBUGGING ---
    console.log("Netlify Function 'fetch-airport-details' aufgerufen.");
    // --- END DEBUGGING ---

    // Globale CORS Header für die Antworten (WICHTIG für Frontend!)
    const CORS_HEADERS = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers: CORS_HEADERS, body: "OK" };
    }

    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        console.log("FEHLER: API-Schlüssel nicht gefunden.");
        return { 
            statusCode: 500, 
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) 
        };
    }

    // Wir prüfen 'code', den das Frontend sendet
    const { code } = event.queryStringParameters || {};
    
    if (!code || code.trim() === "") {
        return { 
            statusCode: 400, 
            headers: CORS_HEADERS, 
            body: JSON.stringify({ message: 'Flughafencode fehlt oder ist leer.' }) 
        };
    }

    console.log(`Parameter 'code' erfolgreich empfangen: ${code}`);

    // Wir verwenden die Domain 'www.' und den Parameter 'iata_code' für die API
    const apiEndpoint = `https://www.goflightlabs.com/airports-by-filter?access_key=${API_KEY}&iata_code=${code}`;
    
    console.log(`Rufe externe API auf: ${apiEndpoint}`);

    try {
        const response = await fetch(apiEndpoint); 
        const responseText = await response.text(); // 🚀 FIX: Erst als puren Text laden!

        let data;
        try {
            // Wir versuchen, den Text in ein JSON-Objekt zu verwandeln
            data = JSON.parse(responseText);
        } catch (e) {
            // 🚀 BUGHUNT FIX: Wenn Cloudflare eine HTML-Fehlerseite schickt, landen wir HIER!
            console.error(`[API ERROR] GoFlightLabs gab HTML statt JSON zurück (Status ${response.status}).`);
            return { 
                statusCode: 502, 
                headers: CORS_HEADERS, 
                body: JSON.stringify({ message: "GoFlightLabs Server ist vorübergehend nicht erreichbar (502 Bad Gateway)." }) 
            };
        }

        if (!response.ok) {
            console.log(`FEHLER von externer API: Status ${response.status}`);
            return { 
                statusCode: response.status, 
                headers: CORS_HEADERS, 
                // Wir senden jetzt SAUBERES JSON an die App, auch im Fehlerfall!
                body: JSON.stringify({ message: data.error || "Fehlerhafte Antwort von GoFlightLabs", details: data }) 
            };
        }

        console.log("Erfolgreiche Antwort von API erhalten.");
        
        return {
            statusCode: 200,
            headers: CORS_HEADERS, // Immer CORS-Header mitschicken!
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.log(`INTERNER FEHLER: ${error.message}`);
        return { 
            statusCode: 500, 
            headers: CORS_HEADERS, 
            body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) 
        };
    }
};