// netlify/functions/fetch-flight-by-number.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // 1. Setup & Checks (Dein Original)
    const TOKEN = process.env.FLIGHTRADAR24_TOKEN;
    if (!TOKEN) {
        return { statusCode: 500, body: JSON.stringify({ message: 'FR24-Token ist nicht konfiguriert.' }) };
    }

    const { flight_number, date } = event.queryStringParameters;
    if (!flight_number || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    const dateFrom = `${date}T00:00:00Z`;
    const dateTo = `${date}T23:59:59Z`;

    // =================================================================
    // SCHRITT 1: DEIN ORIGINAL-CODE (Historische Daten)
    // =================================================================
    const HISTORY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    
    console.log(`[1] History Request: ${HISTORY_ENDPOINT}`);

    let historyData = null;
    let historyFound = false;

    try {
        const response = await fetch(HISTORY_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        const responseBody = await response.text();

        if (response.ok) {
            historyData = JSON.parse(responseBody);
            
            // PRÜFUNG: Enthält die Antwort echte Flüge?
            // Die Struktur von FR24 ist: result.response.data (Array)
            if (historyData?.result?.response?.data && historyData.result.response.data.length > 0) {
                historyFound = true;
            }
        } else {
            console.log(`History API Fehler: ${response.status} - ${responseBody}`);
        }

    } catch (e) {
        console.error("Fetch Error History:", e);
    }

    // =================================================================
    // ENTSCHEIDUNG: Sofort zurückgeben oder Live versuchen?
    // =================================================================
    
    if (historyFound) {
        // ✅ SZENARIO A: Historische Daten gefunden (z.B. PC986).
        // Wir geben EXAKT das zurück, was dein alter Code auch zurückgegeben hätte.
        console.log("✅ Historische Daten gefunden. Return.");
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(historyData)
        };
    }

    // =================================================================
    // SCHRITT 2: LIVE DATEN (Nur wenn Schritt 1 leer war)
    // =================================================================
    console.log("⚠️ Keine Historie. [2] Versuche Live-API...");

    // WICHTIG: Live-Endpunkt OHNE Datum!
    const LIVE_ENDPOINT = `https://fr24api.flightradar24.com/api/live/flight-positions/full?flights=${flight_number}`;

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

            if (liveJson.data && liveJson.data.length > 0) {
                console.log("✅ Live-Daten gefunden! Mappe Struktur...");
                const liveFlight = liveJson.data[0];

                // MAPPING: Live-Daten (flach) in History-Struktur (verschachtelt) umwandeln
                // Damit deine config.js damit arbeiten kann.
                const mappedData = {
                    result: {
                        response: {
                            data: [{
                                identification: {
                                    number: { default: liveFlight.flight || flight_number },
                                    callsign: liveFlight.callsign
                                },
                                aircraft: {
                                    model: { code: liveFlight.type || "" },
                                    registration: liveFlight.reg || ""
                                },
                                airline: {
                                    code: { icao: liveFlight.operating_as || "", iata: "" },
                                    name: liveFlight.operating_as || ""
                                },
                                airport: {
                                    origin: {
                                        code: { iata: liveFlight.orig_iata || "", icao: liveFlight.orig_icao || "" },
                                        timezone: {}
                                    },
                                    destination: {
                                        code: { iata: liveFlight.dest_iata || "", icao: liveFlight.dest_icao || "" },
                                        timezone: {}
                                    },
                                },
                                status: {
                                    live: true,
                                    text: "Live / In Air"
                                },
                                time: {
                                    scheduled: { departure: null, arrival: null },
                                    estimated: {
                                        arrival: liveFlight.eta ? Math.floor(new Date(liveFlight.eta).getTime() / 1000) : null
                                    },
                                    real: { departure: null, arrival: null }
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
    } catch (e) {
        console.error("Fetch Error Live:", e);
    }

    // =================================================================
    // SCHRITT 3: ALLES LEER
    // =================================================================
    console.log("❌ Weder Historie noch Live gefunden.");
    
    return {
        statusCode: 404, // Wichtig: 404, damit config.js den Error fängt
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ 
            message: "Per automatischer Flugnummernsuche wird aktuell kein Flug gefunden. Vermutlich liegt das Flugdatum in der Zukunft." 
        })
    };
};