// netlify/functions/fetch-flight-by-number.js
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
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    const dateFrom = `${date}T00:00:00Z`;
    const dateTo = `${date}T23:59:59Z`;

    // 1. ORIGINAL HISTORISCHER REQUEST (Dein funktionierender Code)
    const HISTORY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    
    console.log(`[Schritt 1] Rufe History-API auf: ${HISTORY_ENDPOINT}`);

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
            // Wenn die API selbst einen Fehler wirft (z.B. 401 Unauthorized), brechen wir ab.
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody);
        
        // --- PRÜFUNG: Haben wir historische Daten? ---
        // Die API liefert oft ein leeres Array in data.result.response.data, wenn nichts gefunden wurde.
        const hasHistoryData = data?.result?.response?.data && data.result.response.data.length > 0;

        if (hasHistoryData) {
            console.log("✅ Historische Daten gefunden. Sende zurück.");
            return {
                statusCode: 200,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(data) // Originale Struktur zurückgeben
            };
        }

        // -----------------------------------------------------------
        // SCHRITT 2: FALLBACK AUF LIVE-DATEN (Nur wenn History leer war)
        // -----------------------------------------------------------
        console.log("⚠️ Keine Historie gefunden. [Schritt 2] Versuche Live-API...");

        // WICHTIG: Live Endpoint OHNE Datums-Parameter!
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

            // Prüfen, ob Live-Daten da sind (Struktur ist { data: [...] })
            if (liveJson.data && liveJson.data.length > 0) {
                console.log("✅ Live-Daten gefunden! Mappe Daten für Frontend...");
                
                const liveFlight = liveJson.data[0];

                // MAPPING: Wir bauen die Live-Daten (flach) in die History-Struktur (verschachtelt) um.
                // Damit muss deine app.js/config.js NICHT geändert werden.
                const mappedData = {
                    result: {
                        response: {
                            data: [{
                                identification: {
                                    number: { default: liveFlight.flight || flight_number },
                                    callsign: liveFlight.callsign
                                },
                                aircraft: {
                                    model: { code: liveFlight.type || "" }, // z.B. A320
                                    registration: liveFlight.reg || ""
                                },
                                airline: {
                                    code: { 
                                        icao: liveFlight.operating_as || "", // Oft Operator Code
                                        iata: "" 
                                    },
                                    name: liveFlight.operating_as || "" 
                                },
                                airport: {
                                    origin: {
                                        code: { 
                                            iata: liveFlight.orig_iata || "", 
                                            icao: liveFlight.orig_icao || "" 
                                        },
                                        timezone: {} // Dummy, damit Frontend nicht meckert
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
                                    // Live liefert oft keine exakten Zeiten, wir nehmen was da ist oder null
                                    scheduled: {
                                        departure: null, 
                                        arrival: null
                                    },
                                    estimated: {
                                        // ETA nutzen, falls vorhanden
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
        } else {
            console.log(`Live API antwortete nicht OK: ${liveResponse.status}`);
        }

        // -----------------------------------------------------------
        // SCHRITT 3: NICHTS GEFUNDEN
        // -----------------------------------------------------------
        console.log("❌ Weder Historie noch Live Daten gefunden.");
        
        // Hier geben wir deine gewünschte Fehlermeldung zurück (als 404 Error Object)
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