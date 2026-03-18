exports.handler = async function(event, context) {
    const { dep_iata, flight_iata } = event.queryStringParameters;

    if (!dep_iata || !flight_iata) {
        return { statusCode: 400, body: JSON.stringify({ error: "Fehlende Parameter" }) };
    }

    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: "API Key fehlt in Netlify Environment Variables!" }) };
    }
    
    // 🚀 Die perfekte URL dank deiner Recherche:
    const url = `https://www.goflightlabs.com/advanced-flights-schedules?access_key=${API_KEY}&iataCode=${dep_iata}&type=departure&flight_iata=${flight_iata}`;

    try {
        const response = await fetch(url);
        const textData = await response.text(); 
        
        let data;
        try {
            data = JSON.parse(textData);
        } catch (err) {
            return { 
                statusCode: 500, 
                body: JSON.stringify({ 
                    error: "API gab ungültiges Format zurück", 
                    html_snippet: textData.substring(0, 150) 
                }) 
            };
        }

        if (data.success === false) {
            return { 
                statusCode: 404, 
                body: JSON.stringify({ error: data.data || "Keine Daten gefunden" }) 
            };
        }

        const flightArray = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

        if (flightArray.length > 0) {
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(flightArray[0])
            };
        } else {
            return { statusCode: 404, body: JSON.stringify({ error: `Flug ${flight_iata} nicht gefunden.` }) };
        }
        
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Server-Crash: " + error.message }) };
    }
};