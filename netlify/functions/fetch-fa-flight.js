export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    if (!API_KEY) {
        return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 500 });
    }

    const url = new URL(request.url);
    const flight_number = url.searchParams.get("flight_number");
    const dep = url.searchParams.get("dep");
    const arr = url.searchParams.get("arr");
    const date = url.searchParams.get("date"); // Erwartet YYYY-MM-DD

    const headers = { 'x-apikey': API_KEY, 'Accept': 'application/json' };

    let startDateIso = "";
    let endDateIso = "";
    let dateStart = "";
    let dateEnd = "";

    if (date) {
        startDateIso = `${date}T00:00:00Z`;
        endDateIso = `${date}T23:59:59Z`;
        
        dateStart = date;
        const d = new Date(date);
        d.setDate(d.getDate() + 1);
        dateEnd = d.toISOString().split('T')[0];
    }

    try {
        let rawFlights = [];
        let cleanFlightNum = flight_number ? flight_number.replace(/\s+/g, '').toUpperCase() : null;

        // ==========================================
        // MODUS A: Suche per Flugnummer (Autopilot & Widget)
        // ==========================================
        if (cleanFlightNum) {
            let faUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(cleanFlightNum)}`;
            if (startDateIso && endDateIso) {
                faUrl += `?start=${startDateIso}&end=${endDateIso}`;
            }

            console.log(`📡 Abfrage: Sende direkte Anfrage für ${cleanFlightNum}...`);
            const response = await fetch(faUrl, { headers });
            
            if (response.ok) {
                const data = await response.json();
                if (data.flights && data.flights.length > 0) {
                    rawFlights = data.flights;
                    console.log(`✅ Direkttreffer: Flug gefunden. Gates vorhanden: ${!!rawFlights[0].gate_origin}`);
                } else {
                    console.log(`⚠️ Kein Direkttreffer für ${cleanFlightNum}.`);
                }
            }

            // 🕵️‍♂️ DETECTIVE 1: THE MERGER
            if (rawFlights.length > 0) {
                let firstHit = rawFlights[0];
                let actualIdent = firstHit.actual_ident_iata || firstHit.actual_ident;
                
                if (actualIdent && actualIdent !== cleanFlightNum) {
                    console.log(`🕵️‍♂️ Codeshare erkannt! ${cleanFlightNum} zeigt auf ${actualIdent}. Hole ATC-Daten...`);
                    
                    let masterUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(actualIdent)}`;
                    if (startDateIso && endDateIso) masterUrl += `?start=${startDateIso}&end=${endDateIso}`;
                    
                    const masterRes = await fetch(masterUrl, { headers });
                    if (masterRes.ok) {
                        const masterData = await masterRes.json();
                        if (masterData.flights && masterData.flights.length > 0) {
                            let masterLive = masterData.flights[0];
                            
                            masterLive.gate_origin = masterLive.gate_origin || firstHit.gate_origin;
                            masterLive.terminal_origin = masterLive.terminal_origin || firstHit.terminal_origin;
                            masterLive.gate_destination = masterLive.gate_destination || firstHit.gate_destination;
                            masterLive.terminal_destination = masterLive.terminal_destination || firstHit.terminal_destination;
                            masterLive.baggage_claim = masterLive.baggage_claim || firstHit.baggage_claim;
                            
                            masterLive.actual_ident_iata = masterLive.ident_iata || actualIdent;
                            masterLive.ident_iata = cleanFlightNum;
                            masterLive.flight_number = cleanFlightNum;
                            
                            rawFlights = [masterLive];
                            console.log(`✅ Merge erfolgreich!`);
                        }
                    }
                }
            }

            // 🕵️‍♂️ DETECTIVE 2: THE GATE STEALER
            // 🚀 BUGHUNT FIX: Greift jetzt AUCH ein, wenn der Flug da ist, aber keine Gates hat!
            if ((rawFlights.length === 0 || !rawFlights[0].gate_origin) && dep && arr && dateStart && dateEnd) {
                console.log(`🔍 Detective: Flug ${cleanFlightNum} fehlt oder hat keine Gates. Durchsuche den Tagesplan...`);
                
                const routeUrl = `https://aeroapi.flightaware.com/aeroapi/schedules/${dateStart}/${dateEnd}?origin=${dep}&destination=${arr}&max_pages=5`;
                const routeRes = await fetch(routeUrl, { headers });
                
                if (routeRes.ok) {
                    const routeData = await routeRes.json();
                    const scheduledFlights = routeData.scheduled || []; 
                    console.log(`✅ Tagesplan: ${scheduledFlights.length} geplante Flüge gefunden.`);

                    const masterSchedule = scheduledFlights.find(f => {
                        const searchNum = cleanFlightNum.replace(/\D/g, ''); 
                        const cs = f.codeshares || [];
                        const csi = f.codeshares_iata || [];
                        return f.ident === cleanFlightNum || f.ident_iata === cleanFlightNum ||
                               cs.includes(cleanFlightNum) || csi.includes(cleanFlightNum) ||
                               cs.some(c => c.includes(searchNum)) || csi.some(c => c.includes(searchNum));
                    });

                    if (masterSchedule) {
                        const masterIdent = masterSchedule.actual_ident_iata || masterSchedule.actual_ident || masterSchedule.ident_iata || masterSchedule.ident;
                        console.log(`🎯 Master ermittelt: ${masterIdent}. Hole Live-Daten...`);
                        
                        let masterUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(masterIdent)}`;
                        if (startDateIso && endDateIso) masterUrl += `?start=${startDateIso}&end=${endDateIso}`;
                        
                        const masterRes = await fetch(masterUrl, { headers });
                        if (masterRes.ok) {
                            const masterData = await masterRes.json();
                            if (masterData.flights && masterData.flights.length > 0) {
                                let masterLive = masterData.flights[0];
                                
                                if (!masterLive.gate_origin && !masterLive.terminal_origin) {
                                    console.log(`🕵️‍♂️ Master ${masterIdent} hat selbst keine Gates. Untersuche Brüder...`);
                                    
                                    const brothers = scheduledFlights.filter(f => 
                                        (f.actual_ident === masterSchedule.actual_ident || f.actual_ident_iata === masterSchedule.actual_ident_iata) && f.ident !== masterIdent
                                    );
                                    
                                    for (let brother of brothers) {
                                        if (brother.gate_origin || brother.terminal_origin) {
                                            masterLive.gate_origin = brother.gate_origin;
                                            masterLive.terminal_origin = brother.terminal_origin;
                                            masterLive.gate_destination = brother.gate_destination;
                                            console.log(`✅ BINGO! Gates direkt aus dem Flugplan von ${brother.ident} gestohlen!`);
                                            break;
                                        }

                                        const queryId = brother.ident_iata || brother.ident;
                                        console.log(`Prüfe Live-Gates von Bruder ${queryId}...`);
                                        
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
                                                    console.log(`✅ BINGO! Gates via API von ${queryId} gestohlen!`);
                                                    break; 
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                masterLive.actual_ident_iata = masterLive.ident_iata || masterIdent;
                                masterLive.ident_iata = cleanFlightNum;
                                masterLive.flight_number = cleanFlightNum;
                                
                                rawFlights = [masterLive];
                            }
                        }
                    } else {
                        console.log(`❌ Flug ${cleanFlightNum} nicht im Tagesplan gefunden.`);
                    }
                }
            }

        // ==========================================
        // MODUS B: Suche per Strecke (Lupe)
        // ==========================================
        } else if (dep && arr && dateStart && dateEnd) {
            const routeUrl = `https://aeroapi.flightaware.com/aeroapi/schedules/${dateStart}/${dateEnd}?origin=${dep}&destination=${arr}&max_pages=5`;
            const response = await fetch(routeUrl, { headers });
            if (response.ok) {
                const data = await response.json();
                if (data.scheduled) rawFlights = data.scheduled; 
            }
        }

        // ==========================================
        // PANZER-CODE: Maßgeschneidert auf das JSON!
        // ==========================================
        let flights = rawFlights.map(f => {
            let ident = f.actual_ident_iata || f.ident_iata || f.ident || f.flight_number || "Unbekannt";
            if (cleanFlightNum) ident = cleanFlightNum;

            let operator = f.operator || f.operator_icao || f.operator_iata || f.airline_icao;
            if (!operator) {
                const baseIdent = f.actual_ident_icao || f.ident_icao || f.ident || "";
                const match = baseIdent.match(/^[A-Za-z]+/); 
                operator = match ? match[0] : "UNK";
            }
            
            const depIata = f.origin_iata || (f.origin && f.origin.code_iata) || (typeof f.origin === 'string' && f.origin.length === 3 ? f.origin : "UNK");
            const arrIata = f.destination_iata || (f.destination && f.destination.code_iata) || (typeof f.destination === 'string' && f.destination.length === 3 ? f.destination : "UNK");

            const depTime = f.scheduled_out || f.actual_out || f.estimated_out || f.departure_time;
            const arrTime = f.scheduled_in || f.actual_in || f.estimated_in || f.arrival_time;
            
            const aircraftType = (f.aircraft_type && typeof f.aircraft_type === 'object') ? f.aircraft_type.type : (f.aircraft_type || null);

            let flightStatus = "scheduled";
            if (f.cancelled === true || (typeof f.status === 'string' && f.status.toLowerCase().includes('cancel'))) {
                flightStatus = "cancelled";
            } else if (f.actual_in || f.actual_on) {
                flightStatus = "landed";
            } else if (f.actual_out || f.actual_off) {
                flightStatus = "active";
            }

            return {
                ...f, 
                flight_number: ident,
                fa_flight_id: f.fa_flight_id || f.ident,
                airline_icao: operator,
                dep_iata: depIata,         
                arr_iata: arrIata,         
                dep_time_iso: depTime,
                arr_time_iso: arrTime,
                dep_time_ts: depTime ? Math.floor(new Date(depTime).getTime() / 1000) : null,
                arr_time_ts: arrTime ? Math.floor(new Date(arrTime).getTime() / 1000) : null,
                dep_estimated_ts: f.estimated_out ? Math.floor(new Date(f.estimated_out).getTime() / 1000) : (depTime ? Math.floor(new Date(depTime).getTime() / 1000) : null),
                arr_estimated_ts: f.estimated_in ? Math.floor(new Date(f.estimated_in).getTime() / 1000) : (arrTime ? Math.floor(new Date(arrTime).getTime() / 1000) : null),
                dep_terminal: f.terminal_origin || null,
                dep_gate: f.gate_origin || null,
                arr_terminal: f.terminal_destination || null,
                arr_gate: f.gate_destination || null,
                status: flightStatus,
                aircraft_registration: f.registration || null,
                aircraft_type: aircraftType
            };
        });

        const uniqueFlights = [];
        const seenIds = new Set();
        for (const flight of flights) {
            const uniqueId = flight.flight_number !== "Unbekannt" ? flight.flight_number : Math.random().toString();
            if (!seenIds.has(uniqueId)) {
                seenIds.add(uniqueId);
                uniqueFlights.push(flight);
            }
        }

        uniqueFlights.sort((a, b) => {
            if (!a.dep_time_ts) return 1;
            if (!b.dep_time_ts) return -1;
            return a.dep_time_ts - b.dep_time_ts;
        });

        return new Response(JSON.stringify(uniqueFlights), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Backend Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}