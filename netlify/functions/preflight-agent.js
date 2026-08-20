// netlify/functions/preflight-agent.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, context) {
    console.log("🛫 [AGENT START] Pre-Flight Prep Agent (FlightAware) erwacht...");

    // 🚀 NEU: Wir nutzen jetzt den FlightAware Key!
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
        console.error("FEHLER: Umgebungsvariablen fehlen!");
        return new Response("Missing Envs", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const lookAheadSeconds = nowSeconds + (8 * 3600); // Jetzt + 8 Stunden

    // ====================================================================
    // 🎯 DATUMS-FOKUS
    // ====================================================================
    const nowObj = new Date();
    const todayStr = nowObj.toISOString().split('T')[0];
    const tomorrowObj = new Date(nowObj.getTime() + 86400000);
    const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

    const { data: flights, error } = await supabase
        .from('flights')
        .select('*')
        .eq('status', 'scheduled')
        .in('date', [todayStr, tomorrowStr]);

    if (error || !flights || flights.length === 0) {
        console.log("📭 Keine anstehenden Flüge für heute/morgen gefunden.");
        return new Response("OK", { status: 200 });
    }

    let processedCount = 0;

    for (const flight of flights) {
        const flightNum = flight.flightNumber || flight.flight_iata || flight.flight_number;
        
        if (!flightNum) {
            console.warn(`⚠️ Flug mit ID ${flight.id} hat keine Flugnummer. Überspringe...`);
            continue;
        }

        // ====================================================================
        // 🛡️ SMARTES FILTER-SYSTEM
        // ====================================================================
        if (flight.dep_time_ts) {
            if (flight.dep_time_ts > lookAheadSeconds || flight.dep_time_ts < nowSeconds) {
                continue; 
            }
        } else {
            console.log(`🔍 [DISCOVERY] Flug ${flightNum} hat noch keinen Timestamp in DB. API-Abruf erzwungen...`);
        }

        console.log(`✈️ Bereite Flug ${flightNum} vor...`);
        processedCount++;

        try {
            // 🚀 BUGHUNT FIX: Direkter Aufruf der FlightAware AeroAPI!
            const cleanFlightNum = flightNum.replace(/\s+/g, '').toUpperCase();
            const startDate = `${flight.date}T00:00:00Z`;
            const endDate = `${flight.date}T23:59:59Z`;
            const faUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${cleanFlightNum}?start=${startDate}&end=${endDate}`;
            
            const faRes = await fetch(faUrl, { 
                headers: { 'x-apikey': API_KEY, 'Accept': 'application/json' } 
            });

            if (!faRes.ok) {
                console.log(`❌ FlightAware fand nichts für ${flightNum} (Status: ${faRes.status})`);
                continue;
            }
            
            const faData = await faRes.json();
            const faFlights = faData.flights || [];
            
            // Wir filtern nach dem Zielort, falls es mehrere Flugabschnitte gibt
            const matchedFlight = faFlights.find(f => f.destination?.code_iata === flight.arrival);

            if (matchedFlight) {
                const updatePayload = {};

                // 🚀 TIMESTAMPS SPEICHERN
                const depTime = matchedFlight.actual_out || matchedFlight.estimated_out || matchedFlight.scheduled_out;
                const arrTime = matchedFlight.actual_in || matchedFlight.estimated_in || matchedFlight.scheduled_in;

                if (depTime) updatePayload.dep_time_ts = Math.floor(new Date(depTime).getTime() / 1000);
                if (arrTime) updatePayload.arr_time_ts = Math.floor(new Date(arrTime).getTime() / 1000);
                if (matchedFlight.estimated_out) updatePayload.dep_estimated_ts = Math.floor(new Date(matchedFlight.estimated_out).getTime() / 1000);
                if (matchedFlight.estimated_in) updatePayload.arr_estimated_ts = Math.floor(new Date(matchedFlight.estimated_in).getTime() / 1000);

                // Terminals & Gates
                if (matchedFlight.terminal_origin) updatePayload.dep_terminal = matchedFlight.terminal_origin;
                if (matchedFlight.gate_origin) updatePayload.dep_gate = matchedFlight.gate_origin;
                if (matchedFlight.terminal_destination) updatePayload.arr_terminal = matchedFlight.terminal_destination;
                if (matchedFlight.gate_destination) updatePayload.arr_gate = matchedFlight.gate_destination;

                // REG & Aircraft
                if (matchedFlight.registration) updatePayload.registration = matchedFlight.registration;
                if (matchedFlight.aircraft_type) updatePayload.aircraftType = matchedFlight.aircraft_type;

                if (Object.keys(updatePayload).length > 0) {
                    console.log(`✅ Frische Daten (Timestamps/Gates) für ${flightNum} gefunden! Update in Supabase...`);
                    await supabase.from('flights').update(updatePayload).eq('id', flight.id);
                } else {
                    console.log(`ℹ️ FlightAware hat leider noch keine frischen Live-Daten für ${flightNum} geliefert.`);
                }
            } else {
                 console.log(`❌ Flug ${flightNum} an diesem Datum nicht in FlightAware gefunden.`);
            }
        } catch (err) {
            console.error(`Fehler bei der Vorbereitung von Flug ${flightNum}:`, err.message);
        }
    }

    console.log(`🏁 [AGENT ENDE] Habe ${processedCount} Flug/Flüge geprüft und vorbereitet.`);
    return new Response("Cronjob Finished", { status: 200 });
}