// netlify/functions/touchdown-agent.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, context) {
    console.log("🤖 [AGENT START] Touchdown Agent (FlightAware) erwacht...");

    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

    if (!API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
        console.error("FEHLER: Umgebungsvariablen fehlen!");
        return new Response("Missing Envs", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const nowSeconds = Math.floor(Date.now() / 1000);

    // ====================================================================
    // 🧹 DER DEEP SWEEP (Automatisches Archivieren nach 24h)
    // ====================================================================
    const oneDayAgo = nowSeconds - 86400; 
    const { data: oldFlights } = await supabase
        .from('flights')
        // 🚀 FIX: flight_id statt id abfragen
        .select('flight_id, flightNumber, arr_time_ts')
        .eq('status', 'landed');

    if (oldFlights && oldFlights.length > 0) {
        const idsToArchive = oldFlights
            .filter(f => (f.arr_time_ts || (nowSeconds - 90000)) < oneDayAgo)
            .map(f => f.flight_id); // 🚀 FIX: flight_id statt id mappen

        if (idsToArchive.length > 0) {
            console.log(`🧹 [DEEP SWEEP] Schiebe ${idsToArchive.length} alte Landungen ins Archiv...`);
            // 🚀 FIX: in('flight_id', ...) statt in('id', ...)
            await supabase.from('flights').update({ status: 'archived' }).in('flight_id', idsToArchive);
        }
    }

    // ====================================================================
    // 🎯 TOUCHDOWN CHECK (Landungen prüfen)
    // ====================================================================
    const { data: activeFlights, error } = await supabase
        .from('flights')
        .select('*')
        .in('status', ['scheduled', 'active', 'en-route', 'manual_review']);

    if (error || !activeFlights || activeFlights.length === 0) {
        console.log("📭 Keine aktiven Flüge zum Prüfen gefunden.");
        return new Response("OK", { status: 200 });
    }

    let processedCount = 0;

    for (const flight of activeFlights) {
        const flightNum = flight.flightNumber || flight.flight_iata || flight.flight_number;
        if (!flightNum) continue;

        let shouldCheck = false;

        if (flight.arr_time_ts) {
            // Wir geben 30 Minuten Puffer nach der Landung
            if (nowSeconds >= flight.arr_time_ts + 1800) {
                shouldCheck = true;
            }
        } else {
            const todayStr = new Date().toISOString().split('T')[0];
            if (flight.date && flight.date <= todayStr) {
                shouldCheck = true;
            }
        }

        if (!shouldCheck) continue;

        console.log(`✈️ Prüfe Landung für ${flightNum}...`);
        processedCount++;

        try {
            const cleanFlightNum = flightNum.replace(/\s+/g, '').toUpperCase();
            const startDate = `${flight.date}T00:00:00Z`;
            const endDate = `${flight.date}T23:59:59Z`;
            const faUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${cleanFlightNum}?start=${startDate}&end=${endDate}`;
            
            const faRes = await fetch(faUrl, { 
                headers: { 'x-apikey': API_KEY, 'Accept': 'application/json' } 
            });
            
            if (faRes.ok) {
                const faData = await faRes.json();
                const faFlights = faData.flights || [];
                const matchedFlight = faFlights.find(f => f.destination?.code_iata === flight.arrival);

                if (matchedFlight) {
                    const updatePayload = {};

                    if (matchedFlight.scheduled_out) updatePayload.dep_time_ts = Math.floor(new Date(matchedFlight.scheduled_out).getTime() / 1000);
                    if (matchedFlight.scheduled_in) updatePayload.arr_time_ts = Math.floor(new Date(matchedFlight.scheduled_in).getTime() / 1000);
                    if (matchedFlight.estimated_out) updatePayload.dep_estimated_ts = Math.floor(new Date(matchedFlight.estimated_out).getTime() / 1000);
                    if (matchedFlight.estimated_in) updatePayload.arr_estimated_ts = Math.floor(new Date(matchedFlight.estimated_in).getTime() / 1000);
                    if (matchedFlight.terminal_origin) updatePayload.dep_terminal = matchedFlight.terminal_origin;
                    if (matchedFlight.gate_origin) updatePayload.dep_gate = matchedFlight.gate_origin;
                    if (matchedFlight.terminal_destination) updatePayload.arr_terminal = matchedFlight.terminal_destination;
                    if (matchedFlight.gate_destination) updatePayload.arr_gate = matchedFlight.gate_destination;
                    if (matchedFlight.registration) updatePayload.registration = matchedFlight.registration;

                    if (matchedFlight.actual_in || matchedFlight.actual_on) {
                        console.log(`✅ Touchdown für ${flightNum} bestätigt (Grund: ${matchedFlight.actual_in ? 'Gate' : 'Landebahn'})!`);
                        updatePayload.status = 'landed';
                        updatePayload.api_sync_attempts = 0;
                        
                        const actualArrIso = matchedFlight.actual_in || matchedFlight.actual_on;
                        if (actualArrIso) {
                            updatePayload.arr_actual_ts = Math.floor(new Date(actualArrIso).getTime() / 1000);
                        }
                        
                        // 🚀 FIX: .eq('flight_id', flight.flight_id)
                        await supabase.from('flights').update(updatePayload).eq('flight_id', flight.flight_id);
                    } else {
                        console.log(`⏳ Flug ${flightNum} ist laut FlightAware noch nicht gelandet.`);
                        
                        if (updatePayload.arr_time_ts && nowSeconds > updatePayload.arr_time_ts + 1800) {
                            const newAttempts = (flight.api_sync_attempts || 0) + 1;
                            updatePayload.api_sync_attempts = newAttempts;
                            
                            if (newAttempts >= 5) {
                                console.log(`⚠️ 5 Fehlversuche erreicht. Setze ${flightNum} auf manual_review.`);
                                updatePayload.status = 'manual_review';
                            }
                        }
                        
                        if (Object.keys(updatePayload).length > 0) {
                             // 🚀 FIX: .eq('flight_id', flight.flight_id)
                             await supabase.from('flights').update(updatePayload).eq('flight_id', flight.flight_id);
                        }
                    }
                } else {
                    console.log(`❌ Flug ${flightNum} an diesem Datum nicht in FlightAware gefunden.`);
                    const newAttempts = (flight.api_sync_attempts || 0) + 1;
                    if (newAttempts >= 5) {
                        // 🚀 FIX: .eq('flight_id', flight.flight_id)
                        await supabase.from('flights').update({ api_sync_attempts: newAttempts, status: 'manual_review' }).eq('flight_id', flight.flight_id);
                    } else {
                        // 🚀 FIX: .eq('flight_id', flight.flight_id)
                        await supabase.from('flights').update({ api_sync_attempts: newAttempts }).eq('flight_id', flight.flight_id);
                    }
                }
            } else {
                console.log(`❌ Fehler von FlightAware (${faRes.status}).`);
            }
        } catch (err) {
            console.error(`Fehler bei ${flightNum}:`, err.message);
        }
    }

    console.log(`🏁 [AGENT ENDE] Deep Sweep erledigt, ${processedCount} Landungen geprüft.`);
    return new Response("Cronjob Finished", { status: 200 });
}