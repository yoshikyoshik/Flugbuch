const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const debugLogs = [];
    const log = (msg) => {
        console.log(msg);
        debugLogs.push(msg);
    };

    log("=== START fetch-flight-by-number ===");
    
    const TOKEN = process.env.FLIGHTRADAR24_TOKEN; 
    if (!TOKEN) {
        return { statusCode: 500, body: JSON.stringify({ message: 'FR24-Token fehlt.', _debug: debugLogs }) };
    }

    const { flight_number, date } = event.queryStringParameters;
    if (!flight_number || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum fehlen.', _debug: debugLogs }) };
    }

    const dateFrom = `${date}T00:00:00Z`;
    const dateTo = `${date}T23:59:59Z`;

    // =================================================================
    // SCHRITT 1: HISTORIE
    // =================================================================
    const HISTORY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    
    let historyData = null;

    try {
        const response = await fetch(HISTORY_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        }); 
        
        const responseBody = await response.text(); 
        
        if (!response.ok) {
            return { statusCode: response.status, body: JSON.stringify({ message: `API Fehler`, _debug: debugLogs }) };
        }

        historyData = JSON.parse(responseBody);
        const flightsArray = historyData?.result?.response?.data || [];
        
        if (flightsArray.length > 0) {
            log("✅ Historie hat Daten. Sende zurück.");
            historyData._debug = debugLogs;
            return {
                statusCode: 200,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(historyData)
            };
        }
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ message: `Serverfehler`, _debug: debugLogs }) };
    }

    // =================================================================
    // SCHRITT 2: LIVE DATEN
    // =================================================================
    log("⚠️ History leer. Starte Live-Abfrage...");

    const cleanFlightNum = flight_number.replace(/\s+/g, '').toUpperCase();
    const LIVE_ENDPOINT = `https://fr24api.flightradar24.com/api/live/flight-positions/full?flights=${cleanFlightNum}`;
    
    try {
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
                log("✅ Live-Daten gefunden! Mappe Struktur...");
                const liveFlight = liveArray[0];

                // 🔥 HIER IST DER FIX: Wir bauen einen echten Zeitstempel aus deiner Datums-Eingabe
                // 12:00 Uhr Mittags UTC an dem Tag, den du gesucht hast.
                const dummyTimestamp = Math.floor(new Date(`${date}T12:00:00Z`).getTime() / 1000);

                const mappedData = {
                    _debug: debugLogs,
                    result: {
                        response: {
                            data: [{
                                identification: {
                                    number: { default: liveFlight.flight || flight_number },
                                    callsign: liveFlight.callsign || ""
                                },
                                aircraft: {
                                    model: { text: liveFlight.type || "", code: liveFlight.type || "" },
                                    registration: liveFlight.reg || ""
                                },
                                airline: {
                                    name: liveFlight.operating_as || "Unknown",
                                    code: { iata: "", icao: liveFlight.operating_as || "" }
                                },
                                airport: {
                                    origin: {
                                        name: liveFlight.orig_iata || "",
                                        code: { iata: liveFlight.orig_iata || "", icao: liveFlight.orig_icao || "" },
                                        timezone: { offset: 0 }
                                    },
                                    destination: {
                                        name: liveFlight.dest_iata || "",
                                        code: { iata: liveFlight.dest_iata || "", icao: liveFlight.dest_icao || "" },
                                        timezone: { offset: 0 }
                                    }
                                },
                                status: {
                                    live: true,
                                    text: "Live / In Air"
                                },
                                time: {
                                    // 🔥 JETZT BEKOMMT CONFIG.JS SEIN DATUM!
                                    scheduled: { departure: dummyTimestamp, arrival: dummyTimestamp },
                                    real: { departure: dummyTimestamp, arrival: null },
                                    estimated: { arrival: liveFlight.eta ? Math.floor(new Date(liveFlight.eta).getTime() / 1000) : dummyTimestamp }
                                }
                            }]
                        }
                    }
                };

                return {
                    statusCode: 200,
                    headers: { "Access-Control-Allow-Origin": "*" },
                    body: JSON.stringify(mappedData)
                };
            }
        }
    } catch (liveErr) {
        log(`FEHLER Live-Block: ${liveErr.message}`);
    }

    // =================================================================
    // SCHRITT 3: NICHTS GEFUNDEN
    // =================================================================
    if (historyData) historyData._debug = debugLogs;

    return {
        statusCode: 200, 
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(historyData || { _debug: debugLogs, result: { response: { data: [] } } }) 
    };
};