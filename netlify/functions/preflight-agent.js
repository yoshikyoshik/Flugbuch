// netlify/functions/preflight-agent.js
import { createClient } from '@supabase/supabase-js';

// 🚀 NETLIFY CRONJOB CONFIGURATION
// Dieser Job läuft alle 2 Stunden ("0 */2 * * *")
export const config = {
    schedule: "0 */2 * * *"
};

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

    // ====================================================================
    // 🛡️ REGEL 3: API-Health-Check Bremse
    // ====================================================================
    try {
        const pingRes = await fetch(`https://www.goflightlabs.com/airports-by-filter?access_key=${API_KEY}&iata_code=FRA`);
        const pingText = await pingRes.text();
        JSON.parse(pingText); 
    } catch (e) {
        console.error("🛑 [AGENT ABBRUCH] GoFlightLabs API ist down. Agent geht wieder schlafen.");
        return new Response("API Down", { status: 502 });
    }

    // ====================================================================
    // 🎯 REGEL 1: Der Laser-Fokus (Flüge in den nächsten 8 Stunden)
    // ====================================================================
    const nowSeconds = Math.floor(Date.now() / 1000);
    const lookAheadSeconds = nowSeconds + (8 * 3600); // Jetzt + 8 Stunden

    // Hole alle geplanten Flüge, die im 8-Stunden-Fenster liegen
    const { data: flights, error } = await supabase
        .from('flights')
        .select('*')
        .eq('status', 'scheduled')
        .gt('dep_time_ts', nowSeconds) // Startet in der Zukunft
        .lt('dep_time_ts', lookAheadSeconds); // Aber maximal in 8 Stunden

    if (error || !flights || flights.length === 0) {
        console.log("📭 Keine anstehenden Flüge in den nächsten 8 Stunden. Agent schläft wieder ein.");
        return new Response("OK", { status: 200 });
    }

    let processedCount = 0;

    for (const flight of flights) {
        console.log(`✈️ Bereite Flug ${flight.flight_iata} (Abflug in < 8h) vor...`);
        processedCount++;

        try {
            // Wir suchen im Live-Schedules-System (da dort die Gates/Terminals am aktuellsten sind)
            const liveUrl = `https://www.goflightlabs.com/advanced-flights-schedules?access_key=${API_KEY}&iataCode=${flight.departure}&type=departure&flight_iata=${flight.flight_iata}`;
            const liveRes = await fetch(liveUrl);
            const liveData = await liveRes.json();
            const liveArray = Array.isArray(liveData.data) ? liveData.data : [];
            
            const matchedFlight = liveArray.find(f => f.flight_date === flight.date || f.flight_iata === flight.flight_iata);

            if (matchedFlight) {
                // Das Update-Paket mit den frischen Live-Daten schnüren
                const updatePayload = {};

                // Terminals & Gates aktualisieren (falls von der API geliefert)
                if (matchedFlight.dep_terminal) updatePayload.dep_terminal = matchedFlight.dep_terminal;
                if (matchedFlight.dep_gate) updatePayload.dep_gate = matchedFlight.dep_gate;
                if (matchedFlight.arr_terminal) updatePayload.arr_terminal = matchedFlight.arr_terminal;
                if (matchedFlight.arr_gate) updatePayload.arr_gate = matchedFlight.arr_gate;

                // REG & Flugzeugtyp mitnehmen (oft erst kurz vor Abflug bekannt)
                if (matchedFlight.aircraft_registration) updatePayload.registration = matchedFlight.aircraft_registration;
                if (matchedFlight.aircraft_icao) updatePayload.aircraft_type = matchedFlight.aircraft_icao;

                // Nur updaten, wenn es auch wirklich etwas Neues gibt (Payload ist nicht leer)
                if (Object.keys(updatePayload).length > 0) {
                    console.log(`✅ Frische Gate/Terminal/REG-Daten für ${flight.flight_iata} gefunden! Speichere in Supabase...`);
                    await supabase.from('flights').update(updatePayload).eq('id', flight.id);
                } else {
                    console.log(`ℹ️ Noch keine neuen Live-Details für ${flight.flight_iata} verfügbar.`);
                }
            }

        } catch (err) {
            console.error(`Fehler bei der Vorbereitung von Flug ${flight.flight_iata}:`, err.message);
        }
    }

    console.log(`🏁 [AGENT ENDE] Habe ${processedCount} anstehende(n) Flug/Flüge vorbereitet.`);
    return new Response("Cronjob Finished", { status: 200 });
}