// netlify/functions/fetch-flight-by-number.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // CORS Header definieren
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    // Preflight Request (OPTIONS) behandeln
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    const TOKEN = process.env.FLIGHTRADAR24_TOKEN;
    if (!TOKEN) {
        return { statusCode: 500, headers, body: JSON.stringify({ message: 'FR24-Token fehlt.' }) };
    }

    // Parameter lesen (POST Body oder Query String unterstützen)
    let params = event.queryStringParameters;
    if (event.body) {
        try {
            const bodyParams = JSON.parse(event.body);
            params = { ...params, ...bodyParams };
        } catch (e) {
            // Body war kein JSON, wir machen mit QueryParams weiter
        }
    }

    const { flight_number, flightNumber, date } = params;
    // Support für beide Schreibweisen (Frontend sendet oft flightNumber, API braucht flight_number Logik)
    const flightNum = flight_number || flightNumber;

    if (!flightNum || !date) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Flugnummer und Datum erforderlich.' }) };
    }

    // Datums-Grenzen für History API
    const dateFrom = `${date}T00:00:00Z`;
    const dateTo = `${date}T23:59:59Z`;

    // ---------------------------------------------------------
    // SCHRITT 1: Historische Daten abfragen (Standard)
    // ---------------------------------------------------------
    const HISTORY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flightNum}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    
    console.log(`[1] Prüfe History: ${HISTORY_ENDPOINT}`);

    try {
        let response = await fetch(HISTORY_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            // Prüfen, ob wirklich Daten drin sind (FR24 sendet oft leeres Array)
            const hasHistory = data?.result?.response?.data && data.result.response.data.length > 0;

            if (hasHistory) {
                console.log("✅ History Daten gefunden.");
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(data)
                };
            }
        }
    } catch (err) {
        console.warn("Fehler bei History Abruf:", err.message);
        // Wir machen weiter mit Live Check...
    }

    // ---------------------------------------------------------
    // SCHRITT 2: Live Daten abfragen (Fallback für "Heute")
    // ---------------------------------------------------------
    
    // Prüfen, ob das angefragte Datum "heute" ist
    const inputDateObj = new Date(date);
    const todayObj = new Date();
    const isToday = inputDateObj.toISOString().split('T')[0] === todayObj.toISOString().split('T')[0];

    if (isToday) {
        // ACHTUNG: Live Endpoint darf KEINE Datums-Parameter haben!
        const LIVE_ENDPOINT = `https://fr24api.flightradar24.com/api/live/flight-positions/full?flights=${flightNum}`;
        console.log(`[2] Datum ist heute, History leer. Prüfe Live: ${LIVE_ENDPOINT}`);

        try {
            const liveResponse = await fetch(LIVE_ENDPOINT, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Version': 'v1',
                    'Authorization': `Bearer ${TOKEN}`
                }
            });

            if (liveResponse.ok) {
                const liveJson = await liveResponse.json();
                
                // Prüfen auf Daten (Live Struktur: { data: [ ... ] })
                if (liveJson.data && liveJson.data.length > 0) {
                    console.log("✅ Live Daten gefunden! Starte Mapping...");
                    
                    const liveFlight = liveJson.data[0];

                    // ---------------------------------------------------------
                    // SCHRITT 3: Mapping (Live-Format -> History-Format)
                    // Damit app.js nicht abstürzt, bauen wir die Struktur nach.
                    // ---------------------------------------------------------
                    const mappedData = {
                        result: {
                            response: {
                                data: [{
                                    identification: {
                                        number: { default: liveFlight.flight || flightNum },
                                        callsign: liveFlight.callsign
                                    },
                                    aircraft: {
                                        model: { code: liveFlight.type || "" }, 
                                        registration: liveFlight.reg || ""
                                    },
                                    airline: {
                                        code: { 
                                            icao: liveFlight.operating_as || "", 
                                            iata: "" 
                                        },
                                        name: "" // Live API liefert oft keinen Airline-Namen
                                    },
                                    airport: {
                                        origin: {
                                            code: { 
                                                iata: liveFlight.orig_iata || "", 
                                                icao: liveFlight.orig_icao || "" 
                                            },
                                            timezone: {} // Dummy
                                        },
                                        destination: {
                                            code: { 
                                                iata: liveFlight.dest_iata || "", 
                                                icao: liveFlight.dest_icao || "" 
                                            },
                                            timezone: {} // Dummy
                                        },
                                    },
                                    status: {
                                        live: true,
                                        text: "Live / In Air"
                                    },
                                    time: {
                                        // Live liefert nur Zeitstempel oder ETA, wir simulieren Scheduled
                                        scheduled: {
                                            departure: null, 
                                            arrival: null
                                        },
                                        estimated: {
                                            arrival: liveFlight.eta ? Math.floor(new Date(liveFlight.eta).getTime() / 1000) : null
                                        }
                                    }
                                }]
                            }
                        }
                    };

                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify(mappedData)
                    };
                }
            }
        } catch (liveErr) {
            console.error("Fehler bei Live Abruf:", liveErr);
        }
    }

    // Wenn nichts gefunden wurde
    console.log("❌ Weder History noch Live Daten gefunden.");
    return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Keine Flugdaten gefunden (Weder historisch noch live).' })
    };
};