const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // --- DEBUGGING ---
    console.log("Netlify Function 'fetch-flight-by-number' aufgerufen.");
    // --- ENDE DEBUGGING ---

    const TOKEN = process.env.FLIGHTRADAR24_TOKEN; 
    if (!TOKEN) {
        console.log("FEHLER: FR24-Token ist nicht konfiguriert.");
        return { statusCode: 500, body: JSON.stringify({ message: 'FR24-Token ist nicht konfiguriert.' }) };
    }

    const { flight_number, date } = event.queryStringParameters;
    if (!flight_number || !date) {
        console.log("FEHLER: Flugnummer oder Datum fehlen.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    const dateFrom = `${date}T00:00:00Z`;
    const dateTo = `${date}T23:59:59Z`;

    // ============================================================
    // TEIL 1: DEIN ORIGINAL CODE (Historische Daten)
    // ============================================================
    const API_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    
    console.log(`[1] Rufe History-API auf: ${API_ENDPOINT}`);

    try {
        const response = await fetch(API_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        }); 
        
        const responseBody = await response.text(); 

        if (!response.ok) {
            // Wenn die API einen echten Fehler wirft (401, 500), geben wir den weiter
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody);
        
        // ------------------------------------------------------------
        // HIER IST DIE EINZIGE ÄNDERUNG: CHECK, OB DATEN DRIN SIND
        // ------------------------------------------------------------
        
        // Flightradar24 liefert diese Struktur: result.response.data (Array)
        // Wir prüfen, ob Flüge gefunden wurden.
        let historyFound = false;
        if (data && data.result && data.result.response && data.result.response.data && data.result.response.data.length > 0) {
            historyFound = true;
        }

        if (historyFound) {
            console.log("✅ Historische Daten gefunden. Gebe Original-Antwort zurück.");
            return {
                statusCode: 200,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(data) // Das ist exakt das, was dein Code vorher gemacht hat
            };
        }

        // ============================================================
        // TEIL 2: LIVE DATEN (Nur wenn History leer war)
        // ============================================================
        console.log("⚠️ History leer. [2] Versuche Live-API...");

        // WICHTIG: Live-Endpunkt OHNE Datumsparameter
        const LIVE_ENDPOINT = `https://fr24api.flightradar24.com/api/live/flight-positions/full?flights=${flight_number}`;

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

            // Prüfen ob Live Daten da sind: { data: [...] }
            if (liveJson.data && liveJson.data.length > 0) {
                console.log("✅ Live-Daten gefunden! Mappe Daten für Frontend...");
                const liveFlight = liveJson.data[0];

                // WICHTIG: Wir müssen die Live-Daten so umbauen, dass sie aussehen wie historische Daten.
                // Sonst stürzt deine config.js / app.js ab, weil die Felder fehlen.
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
                                    code: { 
                                        icao: liveFlight.operating_as || "", 
                                        iata: "" 
                                    },
                                    name: liveFlight.operating_as || "" // Name fehlt oft in Live
                                },
                                airport: {
                                    origin: {
                                        code: { 
                                            iata: liveFlight.orig_iata || "", 
                                            icao: liveFlight.orig_icao || "" 
                                        },
                                        timezone: {} 
                                    },
                                    destination: {
                                        code: { 
                                            iata: liveFlight.dest_iata || "", 
                                            icao: liveFlight.dest_icao || "" 
                                        },
                                        timezone: {} 
                                    },
                                },
                                status: {
                                    live: true,
                                    text: "Live / In Air"
                                },
                                time: {
                                    scheduled: {
                                        departure: null, 
                                        arrival: null
                                    },
                                    estimated: {
                                        // Wir nutzen ETA als Ankunft, falls vorhanden
                                        arrival: liveFlight.eta ? Math.floor(new Date(liveFlight.eta).getTime() / 1000) : null
                                    },
                                    real: {
                                        departure: null,
                                        arrival: null
                                    }
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

        // ============================================================
        // TEIL 3: NICHTS GEFUNDEN
        // ============================================================
        console.log("❌ Weder Historie noch Live Daten gefunden.");
        
        // Deine gewünschte Fehlermeldung
        return {
            statusCode: 404,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                message: "Per automatischer Flugnummernsuche wird aktuell kein Flug gefunden. Vermutlich liegt das Flugdatum in der Zukunft." 
            })
        };

    } catch (error) {
        console.log(`FEHLER im catch-Block: ${error.message}`);
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};