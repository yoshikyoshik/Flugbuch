/**
exports.handler = async function(event, context) {
    const icaoCode = event.queryStringParameters.icao;

    if (!icaoCode || icaoCode.length !== 4) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing or invalid ICAO code" }) };
    }

    try {
        const noaaUrl = `https://aviationweather.gov/api/data/metar?ids=${icaoCode.toUpperCase()}&format=json`;
        const response = await fetch(noaaUrl);
        
        if (!response.ok) {
            return { statusCode: response.status, body: JSON.stringify({ error: "NOAA API failed" }) };
        }
        
        const data = await response.json();
        
        // CORS Header hinzufügen, damit deine App es lesen darf!
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
*/

exports.handler = async function(event, context) {
    const icaoCode = event.queryStringParameters.icao;

    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
    };

    if (!icaoCode || icaoCode.length !== 4) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing or invalid ICAO code" }) };
    }

    try {
        const noaaUrl = `https://aviationweather.gov/api/data/metar?ids=${icaoCode.toUpperCase()}&format=json`;
        
        // 🚀 BUGHUNT FIX: Wir tarnen Netlify als echten Google Chrome Browser!
        // So blockiert uns der Bot-Schutz der US-Wetterbehörde nicht länger.
        const response = await fetch(noaaUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
        });
        
        if (!response.ok) {
            return { statusCode: response.status, headers, body: JSON.stringify({ error: "NOAA API blocked request" }) };
        }
        
        const textData = await response.text();
        
        if (!textData || textData.trim() === "") {
            return { statusCode: 200, headers, body: JSON.stringify([]) };
        }

        const data = JSON.parse(textData);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
        
    } catch (error) {
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "Server Error", details: error.message }) 
        };
    }
};