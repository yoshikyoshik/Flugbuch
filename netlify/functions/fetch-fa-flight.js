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
            if (rawFlights.length === 0 && dep && arr && startDate) {
                console.log(`🔍 Detective-Mode: Keine Live-Daten für ${cleanFlightNum}. Suche Schedule für Route ${dep} -> ${arr}...`);
                
                // 🚀 BUGHUNT FIX: Korrekter API-Endpunkt für Routen!
                const routeUrl = `https://aeroapi.flightaware.com/aeroapi/schedules/${dep}/${arr}?start=${startDate}&end=${endDate}`;
                const routeRes = await fetch(routeUrl, { headers });
                
                if (routeRes.ok) {
                    const routeData = await routeRes.json();
                    const schedules = routeData.schedules || [];
                    console.log(`✅ Detective: ${schedules.length} geplante Flüge gefunden.`);

                    // Finde den wahren Flug (Aggressive Suche)
                    const masterSchedule = schedules.find(f => {
                        const codeshares = f.codeshares || [];
                        const codesharesIata = f.codeshares_iata || [];
                        const searchNum = cleanFlightNum.replace(/\D/g, ''); // Zieht nur "514" aus "4Y514"
                        
                        return codeshares.includes(cleanFlightNum) || 
                               codesharesIata.includes(cleanFlightNum) ||
                               f.ident === cleanFlightNum || 
                               f.ident_iata === cleanFlightNum ||
                               codesharesIata.some(code => code.includes(searchNum)) ||
                               codeshares.some(code => code.includes(searchNum));
                    });

                    if (masterSchedule && masterSchedule.ident) {
                        const masterIdent = masterSchedule.ident; // z.B. DLH4301
                        console.log(`🎯 Codeshare gelöst! Master ist ${masterIdent}. Hole jetzt Live-Daten für Master...`);
                        
                        // JETZT holen wir die echten LIVE-Daten des Masters!
                        const masterUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${masterIdent}?start=${startDate}&end=${endDate}`;
                        const masterRes = await fetch(masterUrl, { headers });
                        
                        if (masterRes.ok) {
                            const masterData = await masterRes.json();
                            if (masterData.flights && masterData.flights.length > 0) {
                                const masterLive = masterData.flights[0];
                                
                                // 🚀 TARNUNG ANWENDEN
                                masterLive.actual_ident_iata = masterLive.ident_iata; 
                                masterLive.ident_iata = cleanFlightNum;
                                masterLive.flight_number = cleanFlightNum;
                                
                                rawFlights = [masterLive];
                                console.log(`🕵️‍♂️ Mission erfüllt! Tarnung aktiv. Sende Live-Daten als ${cleanFlightNum} an Frontend.`);
                            }
                        }
                    } else {
                        console.log(`❌ Detective: Keiner der ${schedules.length} Flüge enthält den Codeshare ${cleanFlightNum}.`);
                    }
                } else {
                    console.log(`❌ Detective API Error: Status ${routeRes.status} bei /schedules`);
                }
            }
        } 
        // ==========================================
        // 2. SCENARIO: REINE ROUTEN-SUCHE (Die Lupe)
        // ==========================================
        else if (dep && arr) {
            // 🚀 BUGHUNT FIX: Auch die Lupe nutzt jetzt den korrekten Schedule-Endpunkt
            const url = `https://aeroapi.flightaware.com/aeroapi/schedules/${dep}/${arr}?start=${startDate}&end=${endDate}`;
            const response = await fetch(url, { headers });
            if (response.ok) {
                const data = await response.json();
                if (data.schedules) rawFlights = data.schedules;
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
                fa_flight_id: f.fa_flight_id || f.ident,
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