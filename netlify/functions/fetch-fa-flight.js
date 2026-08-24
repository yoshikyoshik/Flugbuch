const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
    }

    const { flight_number, dep, arr, date } = event.queryStringParameters;
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;

    const headers = { 'x-apikey': API_KEY, 'Content-Type': 'application/json' };

    // Zeitfenster für den heutigen Tag
    let startDate, endDate;
    if (date) {
        startDate = `${date}T00:00:00Z`;
        endDate = `${date}T23:59:59Z`;
    }

    try {
        let rawFlights = [];
        let cleanFlightNum = flight_number ? flight_number.replace(/\s+/g, '').toUpperCase() : null;

        // ==========================================
        // 1. SCENARIO: DIREKTE FLUGNUMMER SUCHE (Widget, Sync, Autopilot)
        // ==========================================
        if (cleanFlightNum) {
            let url = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(cleanFlightNum)}`;
            if (startDate && endDate) url += `?start=${startDate}&end=${endDate}`;

            const response = await fetch(url, { headers });
            if (response.ok) {
                const data = await response.json();
                if (data.flights && data.flights.length > 0) {
                    rawFlights = data.flights;
                }
            }

            // 🕵️‍♂️ DER CODESHARE-DETECTIVE (Cross-Reference Fallback)
            // Wenn die direkte Suche scheitert, wir aber die Strecke kennen (vom Widget geschickt!):
            if (rawFlights.length === 0 && dep && arr && startDate) {
                console.log(`🔍 Detective-Mode: Keine Live-Daten für ${cleanFlightNum}. Suche über Route ${dep} -> ${arr}...`);
                
                const routeUrl = `https://aeroapi.flightaware.com/aeroapi/flights?origin=${dep}&destination=${arr}&start=${startDate}&end=${endDate}`;
                const routeRes = await fetch(routeUrl, { headers });
                
                if (routeRes.ok) {
                    const routeData = await routeRes.json();
                    if (routeData.flights) {
                        // Finde den wahren Flug, der unser Ticket als Codeshare gelistet hat!
                        const masterFlight = routeData.flights.find(f => {
                            const codeshares = f.codeshares || [];
                            const codesharesIata = f.codeshares_iata || [];
                            return codeshares.includes(cleanFlightNum) || 
                                   codesharesIata.includes(cleanFlightNum) ||
                                   f.ident === cleanFlightNum || 
                                   f.ident_iata === cleanFlightNum;
                        });

                        if (masterFlight) {
                            console.log(`✅ Codeshare gelöst! Master ist ${masterFlight.ident}. Wir tarnen ihn nun für das Frontend als ${cleanFlightNum}.`);
                            
                            // 🚀 Tarnung anwenden: Wir überschreiben die Identität des Master-Flugs, 
                            // damit dein Frontend-Widget ihn anstandslos als seinen eigenen Flug akzeptiert!
                            masterFlight.actual_ident_iata = masterFlight.ident_iata; // Echten Namen merken
                            masterFlight.ident_iata = cleanFlightNum;
                            masterFlight.flight_number = cleanFlightNum;
                            
                            rawFlights = [masterFlight];
                        } else {
                            console.log(`❌ Auch der Detective konnte keinen Codeshare für ${cleanFlightNum} auf dieser Route finden.`);
                        }
                    }
                }
            }
        } 
        // ==========================================
        // 2. SCENARIO: REINE ROUTEN-SUCHE (Die Lupe)
        // ==========================================
        else if (dep && arr) {
            const url = `https://aeroapi.flightaware.com/aeroapi/flights?origin=${dep}&destination=${arr}&start=${startDate}&end=${endDate}`;
            const response = await fetch(url, { headers });
            if (response.ok) {
                const data = await response.json();
                if (data.flights) rawFlights = data.flights;
            }
        }

        // ==========================================
        // PANZER-CODE: Mapping für das Frontend
        // ==========================================
        let flights = rawFlights.map(f => {
            let ident = f.ident_iata || f.actual_ident_iata || f.ident || f.flight_number || "Unbekannt";
            
            // Zwinge den Ident knallhart auf den gesuchten Flight Number!
            if (cleanFlightNum) ident = cleanFlightNum;

            let status = "scheduled";
            if (f.status && f.status.toLowerCase().includes("en route")) status = "active";
            if (f.status && f.status.toLowerCase().includes("arrived")) status = "landed";
            if (f.status && f.status.toLowerCase().includes("cancelled")) status = "cancelled";

            const depTs = f.scheduled_out ? Math.floor(new Date(f.scheduled_out).getTime() / 1000) : null;
            const arrTs = f.scheduled_in ? Math.floor(new Date(f.scheduled_in).getTime() / 1000) : null;

            return {
                fa_flight_id: f.fa_flight_id,
                ident_iata: ident,
                flight_number: ident,
                airline_icao: f.operator_iata || f.operator_icao || f.operator || "Unknown",
                dep_iata: f.origin?.code_iata || f.origin?.code || dep,
                arr_iata: f.destination?.code_iata || f.destination?.code || arr,
                dep_time_iso: f.scheduled_out,
                arr_time_iso: f.scheduled_in,
                dep_time_ts: depTs,
                arr_time_ts: arrTs,
                dep_estimated_ts: f.estimated_out ? Math.floor(new Date(f.estimated_out).getTime() / 1000) : depTs,
                arr_estimated_ts: f.estimated_in ? Math.floor(new Date(f.estimated_in).getTime() / 1000) : arrTs,
                dep_terminal: f.terminal_origin || null,
                dep_gate: f.gate_origin || null,
                arr_terminal: f.terminal_destination || null,
                arr_gate: f.gate_destination || null,
                status: status,
                aircraft_type: f.aircraft_type || null,
                registration: f.registration || null,
                baggage_claim: f.baggage_claim || null,
                actual_out: f.actual_out || null,
                actual_in: f.actual_in || f.actual_on || null
            };
        });

        // ==========================================
        // FILTER: Duplikate in der Lupen-Ansicht löschen
        // ==========================================
        if (!cleanFlightNum) {
            const uniqueFlights = [];
            const seenActualIdents = new Set();
            
            flights.forEach(f => {
                const actual = f.actual_ident_iata || f.ident_iata;
                if (!seenActualIdents.has(actual)) {
                    seenActualIdents.add(actual);
                    uniqueFlights.push(f);
                }
            });
            flights = uniqueFlights;
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify(flights)
        };

    } catch (error) {
        console.error("FlightFetch Error:", error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};