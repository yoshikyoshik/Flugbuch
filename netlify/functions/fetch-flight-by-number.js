// netlify/functions/fetch-flight-by-number.js
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
        const flightsArray = data?.result?.response?.data || [];
        
        if (flightsArray.length > 0) {
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
        }

        // =================================================================
        // SCHRITT 2: LIVE DATEN
        // =================================================================
        const cleanFlightNum = flight_number.replace(/\s+/g, '').toUpperCase();
        
        // 🔥 DER TRICK: Wir extrahieren die Airline-Buchstaben aus deiner Eingabe (z.B. "FR" aus "FR1148")
        const inputIata = cleanFlightNum.replace(/[0-9]/g, '');

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
                const dummyTimestamp = Math.floor(new Date(`${date}T12:00:00Z`).getTime() / 1000);

                const mappedData = {
                    result: {
                        request: { query: flight_number },
                        response: {
                            data: [{
                                identification: {
                                    number: { default: cleanFlightNum, alternative: null },
                                    callsign: liveFlight.callsign || ""
                                },
                                aircraft: {
                                    model: { text: liveFlight.type || "", code: liveFlight.type || "" },
                                    registration: liveFlight.reg || "",
                                    country: { name: "" }
                                },
                                airline: {
                                    // 🔥 HIER NUTZEN WIR DEINEN EINGABE-CODE ("FR") DAMIT CONFIG.JS IHN AKZEPTIERT
                                    name: inputIata,
                                    code: { 
                                        iata: inputIata, 
                                        icao: liveFlight.operating_as || "" 
                                    }
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
                                    scheduled: { 
                                        departure: dummyTimestamp, 
                                        arrival: dummyTimestamp + 7200,
                                        departure_date: date, // 🔥 Strings für die Filter hinzugefügt
                                        arrival_date: date
                                    },
                                    real: { 
                                        departure: dummyTimestamp, 
                                        arrival: null,
                                        departure_date: date
                                    },
                                    estimated: { 
                                        departure: dummyTimestamp,
                                        arrival: liveFlight.eta ? Math.floor(new Date(liveFlight.eta).getTime() / 1000) : dummyTimestamp + 7200 
                                    }
                                }
                            }]
                        }
                    }
                };

                return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(mappedData) };
            }
        }

        // =================================================================
        // SCHRITT 3: NICHTS GEFUNDEN
        // =================================================================
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };

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