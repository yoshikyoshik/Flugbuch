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