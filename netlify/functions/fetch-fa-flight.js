const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
    }

    const { flight_number, dep, arr, date } = event.queryStringParameters;
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;

    const headers = { 'x-apikey': API_KEY, 'Content-Type': 'application/json' };

    let dateStart = "";
    let dateEnd = "";
    let startDateIso = "";
    let endDateIso = "";
    
    if (date) {
        const d1 = new Date(date);
        dateStart = d1.toISOString().split('T')[0];
        
        const d2 = new Date(d1);
        d2.setDate(d2.getDate() + 1); // +1 Tag für das Schedule-Fenster
        dateEnd = d2.toISOString().split('T')[0]; 
        
        // 🚀 BUGHUNT FIX: Die ISO-Zeiten sind ZWINGEND nötig, damit FlightAware uns die Gates schickt!
        startDateIso = `${dateStart}T00:00:00Z`;
        endDateIso = `${dateStart}T23:59:59Z`; 
    }

    try {
        let rawFlights = [];
        let cleanFlightNum = flight_number ? flight_number.replace(/\s+/g, '').toUpperCase() : null;

        // ==========================================
        // 1. SCENARIO: DIREKTE FLUGNUMMER SUCHE 
        // ==========================================
        if (cleanFlightNum) {
            let url = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(cleanFlightNum)}`;
            if (startDateIso && endDateIso) url += `?start=${startDateIso}&end=${endDateIso}`;

            const response = await fetch(url, { headers });
            if (response.ok) {
                const data = await response.json();
                if (data.flights && data.flights.length > 0) {
                    rawFlights = data.flights;
                }
            }

            // 🕵️‍♂️ DETECTIVE 1: THE MERGER (Für LH4306)
            if (rawFlights.length > 0) {
                let firstHit = rawFlights[0];
                let actualIdent = firstHit.actual_ident || firstHit.actual_ident_iata;
                
                if (actualIdent && actualIdent !== cleanFlightNum) {
                    console.log(`🕵️‍♂️ Codeshare erkannt! ${cleanFlightNum} zeigt auf ${actualIdent}. Hole ATC-Daten...`);
                    
                    let masterUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(actualIdent)}`;
                    if (startDateIso && endDateIso) masterUrl += `?start=${startDateIso}&end=${endDateIso}`;
                    
                    const masterRes = await fetch(masterUrl, { headers });
                    if (masterRes.ok) {
                        const masterData = await masterRes.json();
                        if (masterData.flights && masterData.flights.length > 0) {
                            let masterLive = masterData.flights[0];
                            
                            // 🚀 THE MERGE: Wir übernehmen die Gates vom Marketing-Flug
                            masterLive.gate_origin = masterLive.gate_origin || firstHit.gate_origin;
                            masterLive.terminal_origin = masterLive.terminal_origin || firstHit.terminal_origin;
                            masterLive.gate_destination = masterLive.gate_destination || firstHit.gate_destination;
                            masterLive.terminal_destination = masterLive.terminal_destination || firstHit.terminal_destination;
                            masterLive.baggage_claim = masterLive.baggage_claim || firstHit.baggage_claim;
                            
                            // TARNUNG ANWENDEN
                            masterLive.actual_ident_iata = masterLive.ident_iata || actualIdent; 
                            masterLive.ident_iata = cleanFlightNum;
                            masterLive.flight_number = cleanFlightNum;
                            
                            rawFlights = [masterLive];
                            console.log(`✅ Merge erfolgreich! Gates von ${cleanFlightNum} mit Radar-Daten von ${actualIdent} kombiniert.`);
                        }
                    }
                }
            }

            // 🕵️‍♂️ DETECTIVE 2: THE GATE STEALER (Für 4Y514)
            if (rawFlights.length === 0 && dep && arr && dateStart && dateEnd) {
                console.log(`🔍 Detective: Keine Live-Daten für ${cleanFlightNum}. Suche im Tagesplan...`);
                
                const routeUrl = `https://aeroapi.flightaware.com/aeroapi/schedules/${dateStart}/${dateEnd}?origin=${dep}&destination=${arr}&max_pages=5`;
                const routeRes = await fetch(routeUrl, { headers });
                
                if (routeRes.ok) {
                    const routeData = await routeRes.json();
                    const scheduledFlights = routeData.scheduled || []; 
                    console.log(`✅ Detective: ${scheduledFlights.length} geplante Flüge gefunden.`);

                    const masterSchedule = scheduledFlights.find(f => {
                        const searchNum = cleanFlightNum.replace(/\D/g, ''); 
                        const cs = f.codeshares || [];
                        const csi = f.codeshares_iata || [];
                        return f.ident === cleanFlightNum || f.ident_iata === cleanFlightNum ||
                               cs.includes(cleanFlightNum) || csi.includes(cleanFlightNum) ||
                               cs.some(c => c.includes(searchNum)) || csi.some(c => c.includes(searchNum));
                    });

                    if (masterSchedule) {
                        const masterIdent = masterSchedule.actual_ident || masterSchedule.ident;
                        console.log(`🎯 Codeshare gelöst! Master ist ${masterIdent}. Hole Live-Daten...`);
                        
                        let masterUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(masterIdent)}`;
                        if (startDateIso && endDateIso) masterUrl += `?start=${startDateIso}&end=${endDateIso}`;
                        
                        const masterRes = await fetch(masterUrl, { headers });
                        if (masterRes.ok) {
                            const masterData = await masterRes.json();
                            if (masterData.flights && masterData.flights.length > 0) {
                                let masterLive = masterData.flights[0];
                                
                                // 🚀 THE GATE STEALER: Keine Gates beim Master? Frag die Brüder!
                                if (!masterLive.gate_origin && !masterLive.terminal_origin) {
                                    console.log(`🕵️‍♂️ Master ${masterIdent} hat keine Gates. Untersuche Schedule-Brüder...`);
                                    
                                    const brothers = scheduledFlights.filter(f => 
                                        (f.actual_ident === masterIdent || f.actual_ident_iata === masterIdent || f.actual_ident === masterSchedule.ident_iata)
                                        && f.ident !== masterIdent
                                    );
                                    
                                    for (let brother of brothers) {
                                        // 🚀 FIX: Bevorzuge IATA (LH4306 statt DLH4306), das liefert am Flughafen die Gates!
                                        const queryId = brother.ident_iata || brother.ident;
                                        console.log(`Versuche Gates von Bruder ${queryId} zu klauen...`);
                                        
                                        let csUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(queryId)}`;
                                        if (startDateIso && endDateIso) csUrl += `?start=${startDateIso}&end=${endDateIso}`;
                                        
                                        const csRes = await fetch(csUrl, { headers });
                                        
                                        if (csRes.ok) {
                                            const csData = await csRes.json();
                                            if (csData.flights && csData.flights.length > 0) {
                                                let csLive = csData.flights[0];
                                                if (csLive.gate_origin || csLive.terminal_origin || csLive.gate_destination) {
                                                    masterLive.gate_origin = csLive.gate_origin;
                                                    masterLive.terminal_origin = csLive.terminal_origin;
                                                    masterLive.gate_destination = csLive.gate_destination;
                                                    masterLive.terminal_destination = csLive.terminal_destination;
                                                    masterLive.baggage_claim = csLive.baggage_claim;
                                                    console.log(`✅ BINGO! Gates erfolgreich von ${queryId} gestohlen!`);
                                                    break; 
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                // TARNUNG ANWENDEN
                                masterLive.actual_ident_iata = masterLive.ident_iata || masterIdent; 
                                masterLive.ident_iata = cleanFlightNum;
                                masterLive.flight_number = cleanFlightNum;
                                
                                rawFlights = [masterLive];
                                console.log(`🕵️‍♂️ Mission erfüllt! Tarnung aktiv. Sende Live-Daten als ${cleanFlightNum}.`);
                            }
                        }
                    } else {
                        console.log(`❌ Detective: Keiner der ${scheduledFlights.length} Flüge enthält den Codeshare ${cleanFlightNum}.`);
                    }
                }
            }
        } 
        // ==========================================
        // 2. SCENARIO: REINE ROUTEN-SUCHE (Die Lupe)
        // ==========================================
        else if (dep && arr && dateStart && dateEnd) {
            const url = `https://aeroapi.flightaware.com/aeroapi/schedules/${dateStart}/${dateEnd}?origin=${dep}&destination=${arr}&max_pages=3`;
            const response = await fetch(url, { headers });
            if (response.ok) {
                const data = await response.json();
                if (data.scheduled) rawFlights = data.scheduled; 
            }
        }

        // ==========================================
        // PANZER-CODE: Mapping für das Frontend
        // ==========================================
        let flights = rawFlights.map(f => {
            let ident = f.ident_iata || f.actual_ident_iata || f.ident || f.flight_number || "Unbekannt";
            if (cleanFlightNum) ident = cleanFlightNum;

            let status = "scheduled";
            if (f.status && f.status.toLowerCase().includes("en route")) status = "active";
            if (f.status && f.status.toLowerCase().includes("arrived")) status = "landed";
            if (f.status && f.status.toLowerCase().includes("cancelled")) status = "cancelled";

            const depTs = f.scheduled_out ? Math.floor(new Date(f.scheduled_out).getTime() / 1000) : null;
            const arrTs = f.scheduled_in ? Math.floor(new Date(f.scheduled_in).getTime() / 1000) : null;

            const depIata = (f.origin && f.origin.code_iata) ? f.origin.code_iata : (typeof f.origin === 'string' ? f.origin : dep);
            const arrIata = (f.destination && f.destination.code_iata) ? f.destination.code_iata : (typeof f.destination === 'string' ? f.destination : arr);

            return {
                fa_flight_id: f.fa_flight_id || f.ident,
                ident_iata: ident,
                flight_number: ident,
                airline_icao: f.operator_iata || f.operator_icao || f.operator || "Unknown",
                dep_iata: depIata,
                arr_iata: arrIata,
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

        return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(flights) };

    } catch (error) {
        console.error("FlightFetch Error:", error);
        return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};