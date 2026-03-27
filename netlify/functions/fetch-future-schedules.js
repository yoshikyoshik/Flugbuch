// netlify/functions/fetch-future-schedules.js

exports.handler = async function(event, context) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "OK" };
    }

    const depIata = event.queryStringParameters.dep;
    const arrIata = event.queryStringParameters.arr;
    const date = event.queryStringParameters.date; // YYYY-MM-DD

    if (!depIata || !arrIata || !date) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Start, Ziel oder Datum fehlt." }) };
    }

    const API_KEY = process.env.GOFLIGHTLABS_API_KEY; 
    const url = `https://www.goflightlabs.com/advanced-future-flights?access_key=${API_KEY}&type=departure&iataCode=${depIata}&date=${date}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.data) {
            const filteredFlights = data.data.filter(flight => {
                // 1. Zielort abgleichen (In dieser API steht der Zielort unter airport.fs)
                const isCorrectDestination = flight.airport && flight.airport.fs === arrIata;
                
                // 2. Codeshares ignorieren (isCodeshare muss false oder undefined sein)
                const isOriginalFlight = !flight.isCodeshare;

                return isCorrectDestination && isOriginalFlight;
            });
            
            return { statusCode: 200, headers, body: JSON.stringify(filteredFlights) };
        } else {
            return { statusCode: 200, headers, body: JSON.stringify([]) };
        }
    } catch (error) {
        console.error("API Fehler:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Fehler beim Abrufen der Zukunfts-Fahrpläne." }) };
    }
};