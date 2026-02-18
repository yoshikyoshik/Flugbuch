// netlify/functions/fetch-flight-by-number.js

// WICHTIG: Wir nutzen das native 'fetch' von Node.js 18+. 
// Kein 'require' notwendig, das reduziert Fehlerquellen.

exports.handler = async function(event, context) {
    // 1. CORS Headers (für Zugriff von deiner App)
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    // 2. Token Check
    const TOKEN = process.env.FLIGHTRADAR24_TOKEN;
    if (!TOKEN) {
        return { statusCode: 500, headers, body: JSON.stringify({ message: 'Server-Config: FR24-Token fehlt.' }) };
    }

    // 3. Parameter auslesen
    const params = event.queryStringParameters || {};
    // Fallback: Manchmal kommen Parameter im Body (je nach Aufruf)
    if (event.body) {
        try {
            const bodyParams = JSON.parse(event.body);
            Object.assign(params, bodyParams);
        } catch (e) {}
    }

    // Support für beide Schreibweisen (flightNumber vs flight_number)
    const rawFlightNum = params.flight_number || params.flightNumber;
    const date = params.date;

    if (!rawFlightNum || !date) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Flugnummer und Datum erforderlich.' }) };
    }

    // Leerzeichen entfernen (z.B. "PC 986" -> "PC986")
    const flightNum = rawFlightNum.replace(/\s+/g, '').toUpperCase();

    // Debugging Logs (sichtbar im Netlify Dashboard)
    console.log(`🔍 Suche Flug: ${flightNum} am ${date}`);

    // Datums-Grenzen für History
    const dateFrom = `${date}T00:00:00Z`;
    const dateTo = `${date}T23:59:59Z`;

    // =====================================================================
    // STRATEGIE: Erst History versuchen. Wenn leer -> Live versuchen.
    // =====================================================================

    // --- 1. HISTORY API (flight-summary) ---
    // Dokumentation: https://fr24api.flightradar24.com/docs/endpoints/overview#flight-summary-full
    const HISTORY_ENDPOINT = `https://fr24api.flightradar24.com/api/flight-summary/full?flights=${flightNum}&flight_datetime_from=${dateFrom}&flight_datetime_to=${dateTo}`;
    
    try {
        const histResp = await fetch(HISTORY_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (histResp.ok) {
            const histData = await histResp.json();
            // Check: Ist das Array 'data' gefüllt?
            if (histData?.result?.response?.data && histData.result.response.data.length > 0) {
                console.log("✅ Fündig in History API.");
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(histData)
                };
            }
        } else {
            console.warn(`⚠️ History API Status: ${histResp.status}`);
        }
    } catch (e) {
        console.error("Fehler History API:", e);
    }

    // --- 2. LIVE API (live/flight-positions) ---
    // Fallback, falls History leer war (z.B. Flug ist gerade aktiv oder API hinkt hinterher)
    // Wir machen das unabhängig vom Datum, um Zeitzonen-Probleme zu umgehen.
    // Wenn das Datum 2 Jahre her ist, liefert Live eh nix zurück -> Kein Schaden.
    
    console.log("...nicht in History. Prüfe Live API...");

    // WICHTIG: Live Endpoint OHNE Datums-Parameter!
    const LIVE_ENDPOINT = `https://fr24api.flightradar24.com/api/live/flight-positions/full?flights=${flightNum}`;

    try {
        const liveResp = await fetch(LIVE_ENDPOINT, {
            headers: {
                'Accept': 'application/json',
                'Accept-Version': 'v1',
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (liveResp.ok) {
            const liveJson = await liveResp.json();
            
            // Live Daten Struktur: { data: [ ... ] }
            if (liveJson.data && liveJson.data.length > 0) {
                console.log("✅ Fündig in Live API. Mappe Daten...");
                const liveFlight = liveJson.data[0];

                // MAPPING: Wir bauen die Live-Daten in die History-Struktur um,
                // damit deine 'app.js' nicht abstürzt.
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
                                    name: liveFlight.operating_as || "" // Live liefert oft keinen Namen
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
                                    // Wir nutzen ETA als Ankunftszeit, falls vorhanden
                                    scheduled: {
                                        departure: null, 
                                        arrival: null
                                    },
                                    estimated: {
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
                    headers,
                    body: JSON.stringify(mappedData)
                };
            }
        }
    } catch (e) {
        console.error("Fehler Live API:", e);
    }

    // --- 3. NICHTS GEFUNDEN ---
    console.log("❌ Weder History noch Live Daten gefunden.");
    return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Keine Flugdaten gefunden (Weder historisch noch live).' })
    };
};