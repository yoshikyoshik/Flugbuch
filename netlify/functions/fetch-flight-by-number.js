// netlify/functions/fetch-flight-by-number.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
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
    // SCHRITT 1: DEIN EXAKTER ORIGINAL-CODE (Historie)
    // =================================================================
    const API_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    
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
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody);
        
        // --- PRÜFUNG ---
        const flightsArray = data?.result?.response?.data || [];
        
        if (flightsArray.length > 0) {
            // WENN DATEN DA SIND -> SOFORT ZURÜCKGEBEN (Dein Original-Verhalten)
            return {
                statusCode: 200,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(data)
            };
        }

        // =================================================================
        // SCHRITT 2: LIVE DATEN (Wird NUR ausgeführt, wenn Historie komplett leer ist)
        // =================================================================
        
        // WICHTIG: Die Live-API erlaubt absolut keine Leerzeichen! ("PC 982" -> "PC982")
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

                if (liveJson.data && liveJson.data.length > 0) {
                    const liveFlight = liveJson.data[0];

                    // Wir übersetzen das Live-Format in dein gewohntes Historie-Format,
                    // damit deine config.js reibungslos weiterläuft.
                    const mappedData = {
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

                    return {
                        statusCode: 200,
                        headers: { "Access-Control-Allow-Origin": "*" },
                        body: JSON.stringify(mappedData)
                    };
                }
            }
        } catch (liveErr) {
            console.log("Fehler bei Live API ignoriert:", liveErr.message);
        }

        // =================================================================
        // SCHRITT 3: NICHTS GEFUNDEN
        // =================================================================
        
        // Wir geben hier exakt das zurück, was dein Original-Code zurückgegeben hat (das leere 'data' Objekt).
        // Das bedeutet: KEIN Absturz mehr in der config.js.
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data) 
        };

    } catch (error) {
        console.log(`FEHLER im catch-Block: ${error.message}`);
        return { statusCode: 500, body: JSON.stringify({ message: `Interner Serverfehler: ${error.message}` }) };
    }
};