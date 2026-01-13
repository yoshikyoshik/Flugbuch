// netlify/functions/fetch-airline-details.js
// KEIN 'require('node-fetch')'

exports.handler = async function(event, context) {
    // --- DEBUGGING ---
    console.log("Netlify Function 'fetch-airline-details' (API-Ninjas) aufgerufen.");
    console.log("Empfangene Query-Parameter:", event.queryStringParameters);
    // --- ENDE DEBUGGING ---

    // WICHTIG: Stelle sicher, dass dieser Key in Netlify hinterlegt ist!
    const API_KEY = process.env.API_NINJAS_KEY; 
    
    if (!API_KEY) {
        console.error("FEHLER: API-Ninjas Key nicht gefunden.");
        return { 
            statusCode: 500, 
            body: JSON.stringify({ message: 'Server-Konfiguration fehlerhaft: API-Key fehlt.' }) 
        };
    }

    // Das Frontend sendet den Parameter 'iata_code' (auch wenn es theoretisch ein ICAO Code sein könnte)
    const inputCode = event.queryStringParameters.iata_code;

    if (!inputCode) {
        return { 
            statusCode: 400, 
            body: JSON.stringify({ message: 'Parameter "iata_code" ist erforderlich.' }) 
        };
    }

    const cleanCode = inputCode.trim().toUpperCase();
    let apiEndpoint = 'https://api.api-ninjas.com/v1/airlines?';

    // --- INTELLIGENTE PARAMETER-WAHL ---
    // API Ninjas unterscheidet strikt zwischen 'iata' (2 Zeichen) und 'icao' (3 Zeichen).
    if (cleanCode.length === 2) {
        apiEndpoint += `iata=${cleanCode}`;
        console.log(`Erkannt als IATA-Code: ${cleanCode}`);
    } else if (cleanCode.length === 3) {
        apiEndpoint += `icao=${cleanCode}`;
        console.log(`Erkannt als ICAO-Code: ${cleanCode}`);
    } else {
        // Fallback: Wenn es weder 2 noch 3 Zeichen sind, versuchen wir es als Name
        apiEndpoint += `name=${encodeURIComponent(cleanCode)}`;
        console.log(`Erkannt als Name (Fallback): ${cleanCode}`);
    }

    console.log(`Rufe API Ninjas auf: ${apiEndpoint}`);

    try {
        const response = await fetch(apiEndpoint, {
            headers: {
                'X-Api-Key': API_KEY, // WICHTIG: API Ninjas nutzt Header, nicht URL-Parameter für den Key
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API Ninjas Fehler: ${response.status} - ${errorText}`);
            return { statusCode: response.status, body: errorText };
        }

        const data = await response.json(); // API Ninjas gibt direkt ein Array zurück: [...]
        console.log(`Erfolgreich. ${data.length} Airline(s) gefunden.`);

        // --- KOMPATIBILITÄTS-WRAPPER ---
        // Dein Frontend (ui.js) erwartet { data: [...] }, da die alte API das so lieferte.
        // Wir wickeln das Array hier ein, damit das Frontend nicht geändert werden muss.
        const wrappedData = {
            data: data
        };
        
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(wrappedData)
        };

    } catch (error) {
        console.error(`INTERNER FEHLER: ${error.message}`);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) 
        };
    }
};