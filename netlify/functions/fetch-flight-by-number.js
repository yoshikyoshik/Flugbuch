const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const CORS_HEADERS = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS_HEADERS, body: "" };

    try {
        const TOKEN = process.env.FLIGHTRADAR24_TOKEN;
        if (!TOKEN) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'FR24-Token fehlt.' }) };

        const { flight_number, date } = event.queryStringParameters || {};
        if (!flight_number || !date) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Flugnummer und Datum fehlen.' }) };

        const dateFrom = `${date}T00:00:00Z`;
        const dateTo = `${date}T23:59:59Z`;

        // =================================================================
        // SCHRITT 1: HISTORY API
        // =================================================================
        const HISTORY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
        
        const response = await fetch(HISTORY_ENDPOINT, {
            headers: { 'Accept': 'application/json', 'Accept-Version': 'v1', 'Authorization': `Bearer ${TOKEN}` }
        });

        if (response.ok) {
            const data = await response.json();
            const flightsArray = data?.result?.response?.data || data?.data || [];
            
            // 🔥 FILTER: Wir akzeptieren History-Daten NUR, wenn sie echte IATA-Codes enthalten!
            // Das filtert "leere Hüllen" von Live-Flügen heraus.
            const validHistoryFlights = flightsArray.filter(f => {
                const dep = f.orig_iata || f.airport?.origin?.code?.iata || "";
                const arr = f.dest_iata || f.airport?.destination?.code?.iata || "";
                return dep !== "" && arr !== "";
            });

            if (validHistoryFlights.length > 0) {
                // Wir mappen die (oft verschachtelten) History-Daten in eine flache Struktur für config.js
                const mappedHistory = validHistoryFlights.map(f => ({
                    flight: f.identification?.number?.default || f.flight || flight_number,
                    orig_iata: f.orig_iata || f.airport?.origin?.code?.iata || "",
                    dest_iata: f.dest_iata || f.airport?.destination?.code?.iata || "",
                    operating_as: f.operating_as || f.airline?.code?.icao || f.airline?.code?.iata || "",
                    type: f.type || f.aircraft?.model?.code || "",
                    reg: f.reg || f.aircraft?.registration || "",
                    first_seen: f.time?.real?.departure ? new Date(f.time.real.departure * 1000).toISOString() : `${date}T12:00:00Z`
                }));
                
                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ data: mappedHistory }) };
            }
        }

        // =================================================================
        // SCHRITT 2: LIVE API
        // Wird aufgerufen, wenn History leer war ODER nur "leere Hüllen" geliefert hat.
        // =================================================================
        const cleanFlightNum = flight_number.replace(/\s+/g, '').toUpperCase();
        const LIVE_ENDPOINT = `https://fr24api.flightradar24.com/api/live/flight-positions/full?flights=${cleanFlightNum}`;
        
        const liveResponse = await fetch(LIVE_ENDPOINT, {
            headers: { 'Accept': 'application/json', 'Accept-Version': 'v1', 'Authorization': `Bearer ${TOKEN}` }
        });

        if (liveResponse.ok) {
            const liveJson = await liveResponse.json();
            const liveArray = liveJson.data || [];

            if (liveArray.length > 0) {
                const liveFlight = liveArray[0];
                const mappedData = {
                    data: [{
                        flight: liveFlight.flight || flight_number,
                        orig_iata: liveFlight.orig_iata || "",
                        dest_iata: liveFlight.dest_iata || "",
                        operating_as: liveFlight.operating_as || liveFlight.painted_as || "",
                        type: liveFlight.type || "",
                        reg: liveFlight.reg || "",
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
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: `Serverfehler: ${error.message}` }) };
    }
};