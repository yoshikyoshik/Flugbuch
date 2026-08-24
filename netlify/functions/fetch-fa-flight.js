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
        d2.setDate(d2.getDate() + 1); // +1 Tag für das 24h Schedule-Fenster
        dateEnd = d2.toISOString().split('T')[0]; 
        
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

            // 🕵️‍♂️ DETECTIVE 1: Fehlende Gates bei Codeshares (z.B. LH4306) reparieren!
            if (rawFlights.length > 0) {
                let firstHit = rawFlights[0];
                let actualIdent = firstHit.actual_ident || firstHit.actual_ident_iata;
                
                // Wenn es ein Codeshare ist und er keine Gates hat -> Folge dem wahren Flug!
                if (actualIdent && actualIdent !== cleanFlightNum && !firstHit.gate_origin) {
                    console.log(`🕵️‍♂️ Codeshare erkannt! ${cleanFlightNum} zeigt auf ${actualIdent}. Hole echte Live-Daten...`);
                    
                    let masterUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(actualIdent)}`;
                    if (startDateIso && endDateIso) masterUrl += `?start=${startDateIso}&end=${endDateIso}`;
                    
                    const masterRes = await fetch(masterUrl, { headers });
                    if (masterRes.ok) {
                        const masterData = await masterRes.json();
                        if (masterData.flights && masterData.flights.length > 0) {
                            let masterLive = masterData.flights[0];
                            // TARNUNG ANWENDEN
                            masterLive.actual_ident_iata = masterLive.ident_iata || actualIdent;
                            masterLive.ident_iata = cleanFlightNum;
                            masterLive.flight_number = cleanFlightNum;
                            rawFlights = [masterLive]; // Überschreibe den nutzlosen Flug mit dem Echten!
                            console.log(`✅ Tarnung erfolgreich! Gates für ${cleanFlightNum} via ${actualIdent} geladen.`);
                        }
                    }
                }
            }

            // 🕵️‍♂️ DETECTIVE 2: Flug gar nicht gefunden (z.B. 4Y514)? Suche im ganzen Tagesplan!
            if (rawFlights.length === 0 && dep && arr && dateStart && dateEnd) {
                console.log(`🔍 Detective: Keine Live-Daten für ${cleanFlightNum}. Suche im kompletten Tagesplan...`);
                
                // 🚀 BUGHUNT FIX: max_pages=5 zwingt die API, bis zu 75 Flüge (den ganzen Tag) auszuspucken!
                const routeUrl = `https://aeroapi.flightaware.com/aeroapi/schedules/${dateStart}/${dateEnd}?origin=${dep}&destination=${arr}&max_pages=5`;
                const routeRes = await fetch(routeUrl, { headers });
                
                if (routeRes.ok) {
                    const routeData = await routeRes.json();
                    const scheduledFlights = routeData.scheduled || []; 
                    console.log(`✅ Detective: ${scheduledFlights.length} geplante Flüge gefunden.`);

                    const masterSchedule = scheduledFlights.find(f => {
                        const cs = f.codeshares || [];
                        const csi = f.codeshares_iata || [];
                        const searchNum = cleanFlightNum.replace(/\D/g, ''); 
                        
                        return cs.includes(cleanFlightNum) || csi.includes(cleanFlightNum) ||
                               f.ident === cleanFlightNum || f.ident_iata === cleanFlightNum ||
                               csi.some(c => c.includes(searchNum)) || cs.some(c => c.includes(searchNum));
                    });

                    if (masterSchedule) {
                        // Nimm actual_ident, falls vorhanden, sonst ident
                        const masterIdent = masterSchedule.actual_ident || masterSchedule.ident;
                        console.log(`🎯 Codeshare gelöst! Master ist ${masterIdent}. Hole jetzt Live-Daten für Master...`);
                        
                        const masterUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(masterIdent)}?start=${startDateIso}&end=${endDateIso}`;
                        const masterRes = await fetch(masterUrl, { headers });
                        
                        if (masterRes.ok) {
                            const masterData = await masterRes.json();
                            if (masterData.flights && masterData.flights.length > 0) {
                                const masterLive = masterData.flights[0];
                                
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
            // max_pages=3 für die Lupe, damit wir genug Auswahl haben
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
            
            // Zwinge den Ident knallhart auf den gesuchten Flight Number!
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