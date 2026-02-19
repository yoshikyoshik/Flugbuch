const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const CORS_HEADERS = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers: CORS_HEADERS, body: "" };
    }

    try {
        const TOKEN = process.env.FLIGHTRADAR24_TOKEN; 
        if (!TOKEN) {
            return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'FR24-Token ist nicht konfiguriert.' }) };
        }

        const { flight_number, date } = event.queryStringParameters || {};
        if (!flight_number || !date) {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
        }

        const dateFrom = `${date}T00:00:00Z`;
        const dateTo = `${date}T23:59:59Z`;

        // =================================================================
        // SCHRITT 1: HISTORIE
        // =================================================================
        const HISTORY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
        
        const response = await fetch(HISTORY_ENDPOINT, {
            headers: { 'Accept': 'application/json', 'Accept-Version': 'v1', 'Authorization': `Bearer ${TOKEN}` }
        }); 
        
        const responseBody = await response.text(); 
        if (!response.ok) {
            return { statusCode: response.status, headers: CORS_HEADERS, body: JSON.stringify({ message: `API Fehler: ${response.status}` }) };
        }

        const data = JSON.parse(responseBody);
        
        // Flightradar liefert oft verschachtelt: result.response.data
        // Deine config.js erwartet aber direkt: { data: [...] }
        let flightsArray = [];
        if (data && data.result && data.result.response && data.result.response.data) {
             flightsArray = data.result.response.data;
        } else if (data && data.data) {
             flightsArray = data.data; // Falls die API doch flach antwortet
        }
        
        if (flightsArray.length > 0) {
            // Wir bauen das Array so um, dass config.js glücklich ist (braucht orig_iata, dest_iata, first_seen)
            // Wenn die Historie verschachtelte Objekte hat, müssen wir sie für config.js flachklopfen
            const mappedHistory = flightsArray.map(f => {
                return {
                    flight: f.identification?.number?.default || flight_number,
                    orig_iata: f.airport?.origin?.code?.iata || "",
                    dest_iata: f.airport?.destination?.code?.iata || "",
                    operating_as: f.airline?.code?.icao || "",
                    type: f.aircraft?.model?.code || "",
                    reg: f.aircraft?.registration || "",
                    // WICHTIG: Das Feld first_seen wird zwingend gebraucht!
                    first_seen: f.time?.real?.departure ? new Date(f.time.real.departure * 1000).toISOString() : `${date}T12:00:00Z`
                };
            });

            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ data: mappedHistory }) };
        }

        // =================================================================
        // SCHRITT 2: LIVE DATEN
        // =================================================================
        const cleanFlightNum = flight_number.replace(/\s+/g, '').toUpperCase();
        const LIVE_ENDPOINT = `https://fr24api.flightradar24.com/api/live/flight-positions/full?flights=${cleanFlightNum}`;

        const liveResponse = await fetch(LIVE_ENDPOINT, {
            headers: { 'Accept': 'application/json', 'Accept-Version': 'v1', 'Authorization': `Bearer ${TOKEN}` }
        });

        if (liveResponse.ok) {
            const liveBody = await liveResponse.text();
            const liveJson = JSON.parse(liveBody);
            const liveArray = liveJson.data || [];

            if (liveArray.length > 0) {
                const liveFlight = liveArray[0];

                // 🔥 Das ultimative Mapping, exakt auf config.js (Zeile 451ff) zugeschnitten
                const mappedData = {
                    data: [{
                        flight: liveFlight.flight || flight_number,
                        orig_iata: liveFlight.orig_iata || "",
                        dest_iata: liveFlight.dest_iata || "",
                        operating_as: liveFlight.operating_as || "",
                        painted_as: liveFlight.painted_as || "",
                        type: liveFlight.type || "",
                        reg: liveFlight.reg || "",
                        // 🔥 HIER IST DER LEBENSRETTER FÜR CONFIG.JS:
                        first_seen: `${date}T12:00:00Z` 
                    }]
                };

                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(mappedData) };
            }
        }

        // =================================================================
        // SCHRITT 3: NICHTS GEFUNDEN
        // =================================================================
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ data: [] }) };

    } catch (error) {
        return { 
            statusCode: 500, 
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
            },
            body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) 
        };
    }
};