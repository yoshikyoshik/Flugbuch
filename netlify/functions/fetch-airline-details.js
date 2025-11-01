/**
// netlify/functions/fetch-airline-details.js
// KEIN 'require('node-fetch')'

exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    const { iata_code } = event.queryStringParameters;
    if (!iata_code) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "iata_code" ist erforderlich.' }) };
    }

    // KORREKTUR: Verwende den von dir gefundenen Parameter 'codeIataAirline'
    const apiEndpoint = `https://www.goflightlabs.com/airlines?access_key=${API_KEY}&codeIataAirline=${iata_code}`;
    
    try {
        const response = await fetch(apiEndpoint); 
        const responseBody = await response.text(); 
        if (!response.ok) {
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody);
        
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};
*/

/**
// netlify/functions/fetch-airline-details.js
// KEIN 'require('node-fetch')'
exports.handler = async function(event, context) {
    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // Wir erhalten 'iata_code' vom Frontend (obwohl es ein ICAO-Code ist, der Name ist hier egal)
    const { iata_code } = event.queryStringParameters;
    if (!iata_code) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "iata_code" ist erforderlich.' }) };
    }

    // KORREKTUR: Der GFL-Parameter heißt 'icao_code'
    const apiEndpoint = `https://www.goflightlabs.com/airlines?access_key=${API_KEY}&icao_code=${iata_code}`;

    try {
        const response = await fetch(apiEndpoint); 
        const responseBody = await response.text(); 
        if (!response.ok) {
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }
        const data = JSON.parse(responseBody);
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};
*/

// netlify/functions/fetch-airline-details.js
// KEIN 'require('node-fetch')'
/**
exports.handler = async function(event, context) {
    // --- DEBUGGING ---
    console.log("Netlify Function 'fetch-airline-details' aufgerufen.");
    console.log("Empfangene Query-Parameter:", event.queryStringParameters);
    // --- ENDE DEBUGGING ---

    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        console.log("FEHLER: API-Schlüssel nicht gefunden.");
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    // Der Parameter, der vom Frontend kommt (kann IATA oder ICAO sein)
    const { iata_code } = event.queryStringParameters;
    if (!iata_code) {
        console.log("FEHLER: Parameter 'iata_code' fehlt in der Anfrage.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "iata_code" ist erforderlich.' }) };
    }

    console.log(`Empfangener Code: ${iata_code}`);

    // --- HIER IST DIE KORREKTUR (SMARTE LOGIK) ---
    let apiEndpoint = '';
    const code = iata_code.trim().toUpperCase();

    // Entscheide, welchen GFL-Parameter wir basierend auf der Länge des Codes verwenden
    if (code.length === 2) {
        // Es ist ein IATA-Code (z.B. "LH")
        apiEndpoint = `https://www.goflightlabs.com/airlines?access_key=${API_KEY}&iata_code=${code}`;
    } else if (code.length === 3) {
        // Es ist ein ICAO-Code (z.B. "DLH")
        apiEndpoint = `https://www.goflightlabs.com/airlines?access_key=${API_KEY}&icao_code=${code}`;
    } else {
        // Ungültiger Code
        console.log("FEHLER: Empfangener Code ist weder IATA noch ICAO.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Ungültiger Airline-Code.' }) };
    }
    // --- ENDE KORREKTUR ---

    console.log(`Rufe GFL-API auf: ${apiEndpoint}`);
    
    try {
        const response = await fetch(apiEndpoint); 
        const responseBody = await response.text(); 

        console.log(`Antwort-Status von GFL: ${response.status}`);
        
        if (!response.ok) {
            console.log(`FEHLER von externer API: ${responseBody}`);
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody);
        console.log("Erfolgreiche Antwort von GFL erhalten.");
        
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

// netlify/functions/fetch-airline-details.js
// KEIN 'require('node-fetch')'

exports.handler = async function(event, context) {
    // --- DEBUGGING ---
    console.log("Netlify Function 'fetch-airline-details' aufgerufen.");
    console.log("Empfangene Query-Parameter:", event.queryStringParameters);
    // --- ENDE DEBUGGING ---

    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        console.log("FEHLER: API-Schlüssel nicht gefunden.");
        return { statusCode: 500, body: JSON.stringify({ message: 'API-Schlüssel ist nicht konfiguriert.' }) };
    }

    const { iata_code } = event.queryStringParameters;
    if (!iata_code) {
        console.log("FEHLER: Parameter 'iata_code' fehlt in der Anfrage.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Parameter "iata_code" ist erforderlich.' }) };
    }

    console.log(`Parameter 'iata_code' erfolgreich empfangen: ${iata_code}`);

    // --- HIER IST DIE KORREKTUR ---
    // Der Parameter von GoFlightLabs heißt 'iata_code', nicht 'codeIataAirline'.
    const apiEndpoint = `https://www.goflightlabs.com/airlines?access_key=${API_KEY}&iata_code=${iata_code}`;
    
    console.log(`Rufe GFL-API auf: ${apiEndpoint}`);

    try {
        const response = await fetch(apiEndpoint); 
        const responseBody = await response.text(); 
        
        console.log(`Antwort-Status von GFL: ${response.status}`);
        
        if (!response.ok) {
            console.log(`FEHLER von externer API: ${responseBody}`);
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        console.log("Erfolgreiche Antwort von GFL erhalten.");
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