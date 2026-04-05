exports.handler = async function(event, context) {
    const icaoCode = event.queryStringParameters.icao;

    // Standard CORS-Header für ALLE Antworten (auch bei Fehlern wichtig!)
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
    };

    if (!icaoCode || icaoCode.length !== 4) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing or invalid ICAO code" }) };
    }

    try {
        const noaaUrl = `https://aviationweather.gov/api/data/metar?ids=${icaoCode.toUpperCase()}&format=json`;
        const response = await fetch(noaaUrl);
        
        if (!response.ok) {
            return { statusCode: response.status, headers, body: JSON.stringify({ error: "NOAA API failed or rate limited" }) };
        }
        
        // 🚀 BUGHUNT FIX: Zuerst als Text lesen! So stürzen wir nicht ab, wenn NOAA nichts oder HTML schickt.
        const textData = await response.text();
        
        if (!textData || textData.trim() === "") {
            // Wenn NOAA keinen Wetterbericht hat, schicken wir einfach eine leere Liste zurück
            return { statusCode: 200, headers, body: JSON.stringify([]) };
        }

        // Jetzt sicher versuchen, es in JSON umzuwandeln
        const data = JSON.parse(textData);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
        
    } catch (error) {
        // Falls doch etwas schiefgeht, geben wir den genauen Fehlergrund aus, statt nur "500"
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "Server Error", details: error.message }) 
        };
    }
};