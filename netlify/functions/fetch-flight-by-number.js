const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // =================================================================
    // 1. CORS HEADERS (Müssen IMMER mitgesendet werden, auch bei Fehlern)
    // =================================================================
    const CORS_HEADERS = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    // Preflight Request für CORS abfangen
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
        // SCHRITT 1: HISTORIE (Dein Original)
        // =================================================================
        const HISTORY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
        
        const response = await fetch(HISTORY_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        }); 
        
        const responseBody = await response.text(); 

        if (!response.ok) {
            // Selbst Fehler müssen CORS Header haben!
            return { statusCode: response.status, headers: CORS_HEADERS, body: JSON.stringify({ message: `API Fehler: ${response.status}` }) };
        }

        const data = JSON.parse(responseBody);
        const flightsArray = data?.result?.response?.data || [];
        
        if (flightsArray.length > 0) {
            // ✅ Daten gefunden! Zurückgeben.
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify(data)
            };
        }

        // =================================================================
        // SCHRITT 2: LIVE DATEN
        // =================================================================
        const cleanFlightNum = flight_number.replace(/\s+/g, '').toUpperCase();
        const LIVE_ENDPOINT = `https://fr24api.flightradar24.com/api/live/flight-positions/full?flights=${cleanFlightNum}`;

        const liveResponse = await fetch(LIVE_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (liveResponse.ok) {
            const liveBody = await liveResponse.text();
            const liveJson = JSON.parse(liveBody);
            const liveArray = liveJson.data || [];

            if (liveArray.length > 0) {
                const liveFlight = liveArray[0];

                // Zeitstempel generieren (Mitte des gesuchten Tages), um config.js zu besänftigen
                const dummyTimestamp = Math.floor(new Date(`${date}T12:00:00Z`).getTime() / 1000);

                // Das ultimative Mapping (Täuscht einen perfekten Historien-Flug vor)
                const mappedData = {
                    result: {
                        request: { query: flight_number },
                        response: {
                            data: [{
                                identification: {
                                    number: { default: liveFlight.flight || flight_number, alternative: null },
                                    callsign: liveFlight.callsign || ""
                                },
                                aircraft: {
                                    model: { text: liveFlight.type || "", code: liveFlight.type || "" },
                                    registration: liveFlight.reg || "",
                                    country: { name: "" }
                                },
                                airline: {
                                    name: liveFlight.operating_as || "Unknown",
                                    code: { iata: liveFlight.operating_as || "", icao: liveFlight.operating_as || "" }
                                },
                                airport: {
                                    origin: {
                                        name: liveFlight.orig_iata || "",
                                        code: { iata: liveFlight.orig_iata || "", icao: liveFlight.orig_icao || "" },
                                        position: { country: { name: "" }, region: { city: "" } },
                                        timezone: { name: "UTC", offset: 0 }
                                    },
                                    destination: {
                                        name: liveFlight.dest_iata || "",
                                        code: { iata: liveFlight.dest_iata || "", icao: liveFlight.dest_icao || "" },
                                        position: { country: { name: "" }, region: { city: "" } },
                                        timezone: { name: "UTC", offset: 0 }
                                    }
                                },
                                status: {
                                    live: true,
                                    text: "Live / In Air",
                                    icon: "green",
                                    estimated: null,
                                    ambiguous: false,
                                    generic: { status: { text: "estimated", type: "arrival" } }
                                },
                                time: {
                                    scheduled: { departure: dummyTimestamp, arrival: dummyTimestamp + 7200 },
                                    real: { departure: dummyTimestamp, arrival: null },
                                    estimated: { 
                                        departure: dummyTimestamp,
                                        arrival: liveFlight.eta ? Math.floor(new Date(liveFlight.eta).getTime() / 1000) : dummyTimestamp + 7200 
                                    }
                                }
                            }]
                        }
                    }
                };

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify(mappedData)
                };
            }
        }

        // =================================================================
        // SCHRITT 3: NICHTS GEFUNDEN
        // =================================================================
        return {
            statusCode: 200, 
            headers: CORS_HEADERS,
            body: JSON.stringify(data) // Das leere Original-Objekt zurückgeben
        };

    } catch (error) {
        console.error("Fataler Crash:", error);
        // Notfall-Rückgabe bei Crashs (MIT CORS HEADERS!)
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