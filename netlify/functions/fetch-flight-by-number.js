// netlify/functions/fetch-flight-by-number.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // --- DEBUGGING ---
    console.log("Netlify Function 'fetch-flight-by-number' (FR24) aufgerufen.");
    // --- ENDE DEBUGGING ---

    const TOKEN = process.env.FLIGHTRADAR24_TOKEN; 
    if (!TOKEN) {
        return { statusCode: 500, body: JSON.stringify({ message: 'FR24-Token ist nicht konfiguriert.' }) };
    }

    const { flight_number, date } = event.queryStringParameters;
    if (!flight_number || !date) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Flugnummer und Datum sind erforderlich.' }) };
    }

    // Datum prüfen: Ist es heute?
    const inputDate = new Date(date);
    const today = new Date();
    today.setHours(0,0,0,0);
    inputDate.setHours(0,0,0,0);
    const isToday = inputDate.getTime() === today.getTime();

    // 1. VERSUCH: Historische Zusammenfassung (Standard)
    const dateFrom = `${date}T00:00:00Z`;
    const dateTo = `${date}T23:59:59Z`;
    const SUMMARY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;

    try {
        console.log(`Versuche History-API: ${SUMMARY_ENDPOINT}`);
        let response = await fetch(SUMMARY_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            return { statusCode: response.status, body: `Fehler von FR24 History API: ${errText}` };
        }

        let data = await response.json();
        
        // Prüfen, ob wir Daten gefunden haben
        const hasHistoryData = data?.result?.response?.data && data.result.response.data.length > 0;

        // Wenn Daten da sind, sofort zurückgeben
        if (hasHistoryData) {
            console.log("Daten in History gefunden.");
            return {
                statusCode: 200,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(data)
            };
        }

        // 2. VERSUCH: Live-API (Nur wenn Datum == Heute und nichts in History gefunden)
        if (!hasHistoryData && isToday) {
            console.log("Keine History-Daten für heute. Versuche Live-API...");
            
            const LIVE_ENDPOINT = `https://fr24api.flightradar24.com/api/live/flight-positions/full?flights=${flight_number}`;
            
            response = await fetch(LIVE_ENDPOINT, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Version': 'v1',
                    'Authorization': `Bearer ${TOKEN}`
                }
            });

            if (!response.ok) {
                // Wenn Live auch fehlschlägt, geben wir den leeren History-Status zurück oder Fehler
                console.log("Live-API fehlgeschlagen.");
                return { statusCode: 404, body: JSON.stringify({ message: "Flug weder historisch noch live gefunden." }) };
            }

            const liveData = await response.json();

            // Prüfen ob Live Daten da sind (FR24 Live API Struktur ist anders!)
            if (liveData && liveData.data && liveData.data.length > 0) {
                // MAPPING: Wir bauen die Live-Daten so um, dass sie wie Summary-Daten aussehen
                // damit app.js nicht geändert werden muss.
                const liveFlight = liveData.data[0];
                
                const mappedData = {
                    result: {
                        response: {
                            data: [{
                                identification: {
                                    number: { default: liveFlight.flight || flight_number },
                                    callsign: liveFlight.callsign
                                },
                                aircraft: {
                                    model: { code: liveFlight.aircraft_code || "" }, // z.B. B748
                                    registration: liveFlight.reg || ""
                                },
                                airline: {
                                    code: { icao: liveFlight.operate_by || "" }, // Oft Operator ICAO
                                    name: "" // Name fehlt oft in Live-Daten
                                },
                                airport: {
                                    origin: {
                                        code: { iata: liveFlight.orig_iata || "", icao: liveFlight.orig_icao || "" },
                                        name: "" // Fehlt in Live
                                    },
                                    destination: {
                                        code: { iata: liveFlight.dest_iata || "", icao: liveFlight.dest_icao || "" },
                                        name: "" // Fehlt in Live
                                    },
                                },
                                status: {
                                    live: true,
                                    text: "In Air / Scheduled"
                                },
                                time: {
                                    // Live liefert oft nur geschätzte Zeiten
                                    scheduled: {
                                        departure: null, // Schwierig in Live-Daten
                                        arrival: null
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

                console.log("Live-Daten gefunden und gemappt.");
                return {
                    statusCode: 200,
                    headers: { "Access-Control-Allow-Origin": "*" },
                    body: JSON.stringify(mappedData)
                };
            }
        }

        // Wenn nichts gefunden wurde (weder History noch Live)
        return { statusCode: 404, body: JSON.stringify({ message: 'Keine Daten für diesen Flug gefunden.' }) };

    } catch (error) {
        console.log(`FEHLER im catch-Block: ${error.message}`);
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};