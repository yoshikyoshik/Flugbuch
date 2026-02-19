// netlify/functions/fetch-flight-by-number.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // --- DEBUGGING ---
    console.log("Function 'fetch-flight-by-number' aufgerufen.");
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

    // =================================================================
    // 1. ORIGINAL-LOGIK (Historische Daten)
    // =================================================================
    const HISTORY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    
    console.log(`[1] History-API: ${HISTORY_ENDPOINT}`);

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
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody);
        
        // --- PRÜFUNG: Haben wir Daten gefunden? ---
        // Wir prüfen vorsichtig die Struktur. Wenn auch nur ein Flug drin ist, geben wir es SOFORT zurück.
        // Das garantiert, dass dein PC986 Fall funktioniert.
        const flightsFound = data?.result?.response?.data || [];
        
        if (flightsFound.length > 0) {
            console.log(`✅ ${flightsFound.length} Historische Flüge gefunden. Sende Ergebnis.`);
            return {
                statusCode: 200,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(data) // Originaldaten zurückgeben
            };
        }

        // =================================================================
        // 2. LIVE-LOGIK (Nur wenn History leer war!)
        // =================================================================
        console.log("⚠️ History leer. [2] Versuche Live-API...");

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

            if (liveJson.data && liveJson.data.length > 0) {
                console.log("✅ Live-Daten gefunden! Mappe Struktur...");
                const liveFlight = liveJson.data[0];

                // Mapping für Live-Daten
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
        } else {
            console.log(`Live API Status: ${liveResponse.status}`);
        }

        // =================================================================
        // 3. KEIN ERGEBNIS (Custom Error Message)
        // =================================================================
        console.log("❌ Weder History noch Live gefunden.");
        
        return {
            statusCode: 404, // 404 damit das Frontend den Fehler anzeigt
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