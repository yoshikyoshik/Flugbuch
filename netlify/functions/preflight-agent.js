// netlify/functions/preflight-agent.js
import { createClient } from '@supabase/supabase-js';



export default async function handler(request, context) {
    console.log("🛫 [AGENT START] Pre-Flight Prep Agent erwacht...");

    const API_KEY = process.env.GOFLIGHTLABS_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
        console.error("FEHLER: Umgebungsvariablen fehlen!");
        return new Response("Missing Envs", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
        const pingRes = await fetch(`https://www.goflightlabs.com/airports-by-filter?access_key=${API_KEY}&iata_code=FRA`);
        const pingText = await pingRes.text();
        JSON.parse(pingText); 
    } catch (e) {
        console.error("🛑 [AGENT ABBRUCH] GoFlightLabs API ist down.");
        return new Response("API Down", { status: 502 });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const lookAheadSeconds = nowSeconds + (8 * 3600); // Jetzt + 8 Stunden

    // ====================================================================
    // 🎯 NEUE REGEL 1: Der intelligente Datums-Fokus!
    // ====================================================================
    const nowObj = new Date();
    const todayStr = nowObj.toISOString().split('T')[0];
    const tomorrowObj = new Date(nowObj.getTime() + 86400000);
    const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

    // Wir suchen ALLE geplanten Flüge von heute und morgen (da uns die Timestamps oft fehlen).
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
        // 🚀 BUGHUNT FIX: Den echten Spaltennamen aus Supabase nutzen!
        const flightNum = flight.flightNumber || flight.flight_iata || flight.flight_number;
        
        if (!flightNum) {
            console.warn(`⚠️ Flug mit ID ${flight.id} hat keine Flugnummer. Überspringe...`);
            continue;
        }

        // ====================================================================
        // 🛡️ DAS SMARTE FILTER-SYSTEM:
        // ====================================================================
        if (flight.dep_time_ts) {
            // Wir kennen den Timestamp bereits! Liegt er im 8h Fenster?
            if (flight.dep_time_ts > lookAheadSeconds || flight.dep_time_ts < nowSeconds) {
                // Zu weit in der Zukunft oder schon abgeflogen -> Tokens sparen, überspringen!
                continue; 
            }
        } else {
            console.log(`🔍 [DISCOVERY] Flug ${flightNum} hat noch keinen Timestamp in DB. API-Abruf erzwungen...`);
        }

        console.log(`✈️ Bereite Flug ${flightNum} vor...`);
        processedCount++;

        try {
            // 🚀 BUGHUNT FIX: flightNum statt flight.flight_iata in der URL nutzen!
            const liveUrl = `https://www.goflightlabs.com/advanced-flights-schedules?access_key=${API_KEY}&iataCode=${flight.departure}&type=departure&flight_iata=${flightNum}`;
            const liveRes = await fetch(liveUrl);
            const liveData = await liveRes.json();
            const liveArray = Array.isArray(liveData.data) ? liveData.data : [];
            
            // 🚀 BUGHUNT FIX: Auch hier flightNum nutzen!
            const matchedFlight = liveArray.find(f => f.flight_date === flight.date || f.flight_iata === flightNum);

            if (matchedFlight) {
                const updatePayload = {};

                // 🚀 TIMESTAMPS SPEICHERN
                if (matchedFlight.dep_time_ts) updatePayload.dep_time_ts = matchedFlight.dep_time_ts;
                if (matchedFlight.arr_time_ts) updatePayload.arr_time_ts = matchedFlight.arr_time_ts;
                if (matchedFlight.dep_estimated_ts) updatePayload.dep_estimated_ts = matchedFlight.dep_estimated_ts;
                if (matchedFlight.arr_estimated_ts) updatePayload.arr_estimated_ts = matchedFlight.arr_estimated_ts;

                // Terminals & Gates
                if (matchedFlight.dep_terminal) updatePayload.dep_terminal = matchedFlight.dep_terminal;
                if (matchedFlight.dep_gate) updatePayload.dep_gate = matchedFlight.dep_gate;
                if (matchedFlight.arr_terminal) updatePayload.arr_terminal = matchedFlight.arr_terminal;
                if (matchedFlight.arr_gate) updatePayload.arr_gate = matchedFlight.arr_gate;

                // REG & Aircraft
                if (matchedFlight.aircraft_registration) updatePayload.registration = matchedFlight.aircraft_registration;
                if (matchedFlight.aircraft_icao) updatePayload.aircraft_type = matchedFlight.aircraft_icao;

                if (Object.keys(updatePayload).length > 0) {
                    console.log(`✅ Frische Daten (Timestamps/Gates) für ${flightNum} gefunden! Update in Supabase...`);
                    await supabase.from('flights').update(updatePayload).eq('id', flight.id);
                } else {
                    console.log(`ℹ️ Die API hat leider noch keine frischen Live-Daten für ${flightNum} geliefert.`);
                }
            } else {
                 console.log(`❌ Flug ${flightNum} an diesem Datum nicht in der GoFlightLabs Live-Abfrage gefunden.`);
            }
        } catch (err) {
            console.error(`Fehler bei der Vorbereitung von Flug ${flightNum}:`, err.message);
        }
    }

    console.log(`🏁 [AGENT ENDE] Habe ${processedCount} Flug/Flüge geprüft und vorbereitet.`);
    return new Response("Cronjob Finished", { status: 200 });
}