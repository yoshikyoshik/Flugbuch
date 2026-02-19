// netlify/functions/fetch-flight-by-number.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // --- DEBUGGING ---
    console.log("Netlify Function 'fetch-flight-by-number' aufgerufen.");
    console.log("Empfangene Query-Parameter:", event.queryStringParameters);
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

    const API_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flight_number}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    
    // --- DEBUGGING ---
    console.log(`Rufe FR24-API auf: ${API_ENDPOINT}`);
    // --- ENDE DEBUGGING ---

    try {
        const response = await fetch(API_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        }); 
        
        const responseBody = await response.text(); 
        
        // --- DEBUGGING ---
        console.log(`Antwort-Status von FR24: ${response.status}`);
        console.log(`Antwort-Body von FR24 (als Text): ${responseBody}`);
        // --- ENDE DEBUGGING ---

        if (!response.ok) {
            return { statusCode: response.status, body: `Fehler von externer API: ${responseBody}` };
        }

        const data = JSON.parse(responseBody);
        
        // =========================================================================
        // ✅ NEUER BLOCK: HIER GREIFEN WIR NUR EIN, WENN DIE HISTORIE LEER IST
        // =========================================================================
        const flightsArray = data?.result?.response?.data || [];
        
        // Wenn das Array leer ist, ist der Flug wahrscheinlich heute / Live
        if (flightsArray.length === 0) {
            console.log("Historische Daten sind leer. Prüfe Live-API...");
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

                    // Hat die Live-API etwas gefunden?
                    if (liveJson.data && liveJson.data.length > 0) {
                        console.log("Live-Daten gefunden! Baue sie für die App um...");
                        const liveFlight = liveJson.data[0];

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
                                            }
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

                        // Wir geben die umgebauten Live-Daten zurück und beenden hier
                        return {
                            statusCode: 200,
                            headers: { "Access-Control-Allow-Origin": "*" },
                            body: JSON.stringify(mappedData)
                        };
                    }
                }
            } catch (liveError) {
                console.log(`Fehler bei Live-Abfrage: ${liveError.message}`);
                // Wenn Live fehlschlägt, ignorieren wir das und lassen den Original-Code weiterlaufen
            }
        }
        // =========================================================================
        // ✅ ENDE NEUER BLOCK
        // =========================================================================

        // DEIN ORIGINAL RETURN (Wird ausgeführt, wenn History Daten hat ODER wenn beides leer ist)
        // Dadurch stürzt config.js NIE ab, da immer Status 200 gesendet wird.
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