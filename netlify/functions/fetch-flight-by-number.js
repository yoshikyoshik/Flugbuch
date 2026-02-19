// netlify/functions/fetch-flight-by-number.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // Unser Debug-Sammler (wird ans Frontend zurückgeschickt)
    const debugLogs = [];
    const log = (msg) => {
        console.log(msg); // Schreibt ins Netlify Dashboard
        debugLogs.push(msg); // Sammelt für das Frontend
    };

    log("=== START fetch-flight-by-number ===");
    log(`Query Parameter: ${JSON.stringify(event.queryStringParameters)}`);

    const TOKEN = process.env.FLIGHTRADAR24_TOKEN; 
    if (!TOKEN) {
        log("FEHLER: FR24-Token fehlt.");
        return { statusCode: 500, body: JSON.stringify({ message: 'FR24-Token ist nicht konfiguriert.', _debug: debugLogs }) };
    }

    const { flight_number, date } = event.queryStringParameters;
    if (!flight_number || !date) {
        log("FEHLER: Flugnummer oder Datum fehlen.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.', _debug: debugLogs }) };
    }

    const dateFrom = `${date}T00:00:00Z`;
    const dateTo = `${date}T23:59:59Z`;

    // =================================================================
    // SCHRITT 1: HISTORIE
    // =================================================================
    const HISTORY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    log(`[Schritt 1] Rufe History-API auf: ${HISTORY_ENDPOINT}`);

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
        log(`History HTTP Status: ${response.status}`);
        
        if (!response.ok) {
            log(`History API Fehler-Body: ${responseBody}`);
            return { statusCode: response.status, body: JSON.stringify({ message: `Fehler von externer API`, _debug: debugLogs }) };
        }

        historyData = JSON.parse(responseBody);
        const flightsArray = historyData?.result?.response?.data || [];
        log(`History Prüfung: ${flightsArray.length} Flüge im Array gefunden.`);

        if (flightsArray.length > 0) {
            log("✅ Historie hat Daten geliefert. Gebe Original-Daten zurück.");
            historyData._debug = debugLogs; // Debug Infos anhängen
            return {
                statusCode: 200,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(historyData)
            };
        }

    } catch (error) {
        log(`FEHLER im History catch-Block: ${error.message}`);
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler`, _debug: debugLogs }) };
    }

    // =================================================================
    // SCHRITT 2: LIVE DATEN (Da History leer war)
    // =================================================================
    log("⚠️ History war leer. Starte [Schritt 2] Live-Abfrage...");

    const cleanFlightNum = flight_number.replace(/\s+/g, '').toUpperCase();
    const LIVE_ENDPOINT = `https://fr24api.flightradar24.com/api/live/flight-positions/full?flights=${cleanFlightNum}`;
    log(`Live-API URL gebaut: ${LIVE_ENDPOINT}`);

    try {
        const liveResponse = await fetch(LIVE_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        log(`Live HTTP Status: ${liveResponse.status}`);
        const liveBody = await liveResponse.text();
        
        // Wir loggen die ersten 200 Zeichen der Live-Antwort, um zu sehen, was WIRKLICH zurückkommt
        log(`Live API Raw Body (Auszug): ${liveBody.substring(0, 200)}...`);

        if (liveResponse.ok) {
            const liveJson = JSON.parse(liveBody);
            const liveArray = liveJson.data || [];
            log(`Live Prüfung: ${liveArray.length} Flüge im Live-Array gefunden.`);

            if (liveArray.length > 0) {
                log("✅ Live-Daten gefunden! Starte Mapping...");
                const liveFlight = liveArray[0];

                const mappedData = {
                    _debug: debugLogs, // Debug Infos anhängen
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
                                    name: liveFlight.operating_as || "",
                                    code: { iata: "", icao: liveFlight.operating_as || "" }
                                },
                                airport: {
                                    origin: {
                                        name: "",
                                        code: { iata: liveFlight.orig_iata || "", icao: liveFlight.orig_icao || "" },
                                        timezone: { offset: 0 }
                                    },
                                    destination: {
                                        name: "",
                                        code: { iata: liveFlight.dest_iata || "", icao: liveFlight.dest_icao || "" },
                                        timezone: { offset: 0 }
                                    }
                                },
                                status: {
                                    live: true,
                                    text: "Live / In Air"
                                },
                                time: {
                                    scheduled: { departure: null, arrival: null },
                                    real: { departure: null, arrival: null },
                                    estimated: { arrival: liveFlight.eta ? Math.floor(new Date(liveFlight.eta).getTime() / 1000) : null }
                                }
                            }]
                        }
                    }
                };

                log("Mapping abgeschlossen. Sende zurück.");
                return {
                    statusCode: 200,
                    headers: { "Access-Control-Allow-Origin": "*" },
                    body: JSON.stringify(mappedData)
                };
            } else {
                log("❌ Live-Array war leer (0 Treffer).");
            }
        } else {
             log("❌ Live API hat keinen 200er Status geliefert.");
        }
    } catch (liveErr) {
        log(`FEHLER im Live catch-Block: ${liveErr.message}`);
    }

    // =================================================================
    // SCHRITT 3: NICHTS GEFUNDEN
    // =================================================================
    log("❌ Komplett-Abbruch: Weder History noch Live lieferten Daten.");
    
    // Wir hängen die Debug-Logs an das leere History-Objekt an
    if (historyData) {
        historyData._debug = debugLogs;
    }

    return {
        statusCode: 200, // Bleibt 200, damit config.js nicht abstürzt
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(historyData || { _debug: debugLogs, result: { response: { data: [] } } }) 
    };
};