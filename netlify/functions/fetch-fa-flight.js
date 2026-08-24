export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    if (!API_KEY) {
        return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 500 });
    }

    const url = new URL(request.url);
    const flight_number = url.searchParams.get("flight_number");
    const dep = url.searchParams.get("dep");
    const arr = url.searchParams.get("arr");
    const date = url.searchParams.get("date"); 

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
            // 🚀 BUGHUNT FIX: FlightAware liebt ICAO-Codes! Wir wandeln IATA (z.B. 4Y518) in ICAO (OCN518) um.
            let searchIdents = [cleanFlightNum];
            if (cleanFlightNum.startsWith("4Y")) {
                searchIdents.unshift(cleanFlightNum.replace("4Y", "OCN")); // OCN518 an erster Stelle probieren!
            } else if (cleanFlightNum.startsWith("LH")) {
                searchIdents.unshift(cleanFlightNum.replace("LH", "DLH")); // DLH statt LH
            }

            let response = null;
            let usedIdent = cleanFlightNum;

            for (let idToTry of searchIdents) {
                console.log(`📡 Abfrage: Versuche direkte Anfrage für ${idToTry}...`);
                let faUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(idToTry)}`;
                if (startDateIso && endDateIso) {
                    faUrl += `?start=${startDateIso}&end=${endDateIso}`;
                }

                const res = await fetch(faUrl, { headers });
                if (res.ok) {
                    const data = await res.json();
                    if (data.flights && data.flights.length > 0) {
                        rawFlights = data.flights;
                        usedIdent = idToTry;
                        console.log(`✅ Direkttreffer mit ${idToTry}! Flug gefunden. Gates vorhanden: ${!!rawFlights[0].gate_origin}`);
                        break;
                    }
                }
            }

            if (rawFlights.length === 0) {
                console.log(`⚠️ Kein Direkttreffer für ${cleanFlightNum} (auch nicht mit ICAO-Aliasen).`);
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

            // 🕵️‍♂️ DETECTIVE 2: THE GATE STEALER & FALLBACK (Für 4Y514, 4Y518 etc.)
            if ((rawFlights.length === 0 || !rawFlights[0].gate_origin) && dep && arr && dateStart && dateEnd) {
                console.log(`🔍 Detective: Flug ${cleanFlightNum} fehlt oder hat keine Gates. Durchsuche den Tagesplan...`);
                
                const routeUrl = `https://aeroapi.flightaware.com/aeroapi/schedules/${dateStart}/${dateEnd}?origin=${dep}&destination=${arr}&max_pages=5`;
                const routeRes = await fetch(routeUrl, { headers });
                
                if (routeRes.ok) {
                    const routeData = await routeRes.json();
                    const scheduledFlights = routeData.scheduled || []; 
                    console.log(`✅ Tagesplan: ${scheduledFlights.length} geplante Flüge gefunden.`);

                    // 🚀 BUGHUNT FIX: Wir suchen jetzt aktiv nach echten Codeshares im Flugplan!
                    const matchingSchedules = scheduledFlights.filter(f => {
                        const cs = f.codeshares || [];
                        const csi = f.codeshares_iata || [];
                        const ident = f.ident || '';
                        const identIata = f.ident_iata || '';
                        
                        return ident === cleanFlightNum || 
                               identIata === cleanFlightNum ||
                               cs.includes(cleanFlightNum) || 
                               csi.includes(cleanFlightNum);
                    });

                    if (matchingSchedules.length > 0) {
                        console.log(`🎯 ${matchingSchedules.length} Kandidaten für ${cleanFlightNum} gefunden. Prüfe Live-Daten...`);
                        let liveDataFound = false;

                        // Wir probieren jeden Kandidaten (z.B. 4Y518, OCN518, LH4320), bis einer Live-Daten hat
                        for (let match of matchingSchedules) {
                            const tryIdent = match.actual_ident_iata || match.actual_ident || match.ident_iata || match.ident;
                            console.log(`🔄 Prüfe Kandidat: ${tryIdent}...`);
                            
                            let masterUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(tryIdent)}`;
                            if (startDateIso && endDateIso) masterUrl += `?start=${startDateIso}&end=${endDateIso}`;
                            
                            const masterRes = await fetch(masterUrl, { headers });
                            if (masterRes.ok) {
                                const masterData = await masterRes.json();
                                if (masterData.flights && masterData.flights.length > 0) {
                                    let masterLive = masterData.flights[0];
                                    console.log(`✅ Live-Daten für ${tryIdent} gefunden!`);
                                    
                                    // GATE STEALER
                                    if (!masterLive.gate_origin && !masterLive.terminal_origin) {
                                        console.log(`🕵️‍♂️ ${tryIdent} hat keine Gates. Untersuche die anderen Kandidaten im Flugplan...`);
                                        for (let brother of matchingSchedules) {
                                            if (brother.gate_origin || brother.terminal_origin) {
                                                masterLive.gate_origin = brother.gate_origin;
                                                masterLive.terminal_origin = brother.terminal_origin;
                                                masterLive.gate_destination = brother.gate_destination;
                                                masterLive.terminal_destination = brother.terminal_destination;
                                                console.log(`✅ BINGO! Gates direkt aus Flugplan von ${brother.ident} gestohlen!`);
                                                break;
                                            }
                                        }
                                    }
                                    
                                    // TARNUNG ANWENDEN
                                    masterLive.actual_ident_iata = masterLive.ident_iata || tryIdent;
                                    masterLive.ident_iata = cleanFlightNum;
                                    masterLive.flight_number = cleanFlightNum;
                                    
                                    rawFlights = [masterLive];
                                    liveDataFound = true;
                                    break; // Wir haben Live-Daten! Schleife abbrechen.
                                } else {
                                    console.log(`⚠️ Keine Live-Daten für ${tryIdent}. Versuche nächsten Kandidaten...`);
                                }
                            }
                        }

                        // 🚀 ULTIMATIVER FALLBACK: Wenn KEIN Kandidat Live-Daten hatte, nimm den reinen Flugplan!
                        if (!liveDataFound) {
                            console.log(`⚠️ Kein Kandidat hatte Live-Daten. Nutze reinen Flugplan als Fallback!`);
                            let masterLive = matchingSchedules[0]; 
                            masterLive.ident_iata = cleanFlightNum;
                            masterLive.flight_number = cleanFlightNum;
                            rawFlights = [masterLive];
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