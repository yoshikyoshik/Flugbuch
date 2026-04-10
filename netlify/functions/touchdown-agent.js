// netlify/functions/touchdown-agent.js
import { createClient } from '@supabase/supabase-js';

// 🚀 NETLIFY CRONJOB CONFIGURATION
// Dieser Job läuft alle 30 Minuten ("*/30 * * * *")
export const config = {
    schedule: "*/30 * * * *"
};

export default async function handler(request, context) {
    console.log("🤖 [AGENT START] Touchdown & Sweep Agent erwacht...");

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
        console.log("Ping an GoFlightLabs...");
        const pingRes = await fetch(`https://www.goflightlabs.com/airports-by-filter?access_key=${API_KEY}&iata_code=FRA`);
        const pingText = await pingRes.text();
        JSON.parse(pingText); 
    } catch (e) {
        console.error("🛑 [AGENT ABBRUCH] GoFlightLabs API ist down (HTML/502). Agent geht wieder schlafen.");
        return new Response("API Down", { status: 502 });
    }

    // ====================================================================
    // 🎯 REGEL 1: Supabase First (Der Laser-Fokus)
    // ====================================================================
    // 🚀 BUGHUNT FIX: Greife NUR Flüge an, die wirklich noch laufen oder geplant sind!
    // Lasse 'archived', 'landed', 'cancelled' und 'manual_review' komplett in Ruhe.
    const { data: flights, error } = await supabase
        .from('flights')
        .select('*')
        .in('status', ['scheduled', 'active', 'en-route'])
        .lt('api_sync_attempts', 5);

    if (error || !flights || flights.length === 0) {
        console.log("📭 Keine relevanten Flüge zum Überprüfen gefunden. Agent schläft wieder ein.");
        return new Response("OK", { status: 200 });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    let processedCount = 0;

    for (const flight of flights) {
        // 🚀 BUGHUNT FIX: Echte Flugnummer nutzen!
        const flightNum = flight.flightNumber || flight.flight_iata || flight.flight_number;
        
        if (!flightNum) {
            console.warn(`⚠️ Flug mit ID ${flight.id} hat keine Flugnummer. Überspringe...`);
            continue;
        }

        // ====================================================================
        // ⏳ REGEL 4: Puffer-Zeiten nutzen (Grace Period)
        // ====================================================================
        // 🚀 BUGHUNT FIX: Absicherung, falls Timestamps noch fehlen!
        let estimatedTouchdownTs = flight.arr_time_ts;
        if (!estimatedTouchdownTs) {
            estimatedTouchdownTs = flight.dep_time_ts ? (flight.dep_time_ts + 7200) : (nowSeconds + 999999); // Ignore if totally unknown
        }
        
        const gracePeriodTs = estimatedTouchdownTs + 1800; // + 30 Minuten (1800 Sekunden)

        if (nowSeconds < gracePeriodTs) {
            // Flug ist laut Plan noch nicht (lange genug) gelandet. Überspringen!
            continue; 
        }

        console.log(`✈️ Prüfe Flug ${flightNum} (ID: ${flight.id}) - Landung sollte erfolgt sein.`);
        processedCount++;

        try {
            // 🚀 BUGHUNT FIX: flightNum in URL einsetzen!
            const liveUrl = `https://www.goflightlabs.com/advanced-flights-schedules?access_key=${API_KEY}&iataCode=${flight.departure}&type=departure&flight_iata=${flightNum}`;
            const liveRes = await fetch(liveUrl);
            const liveData = await liveRes.json();
            const liveArray = Array.isArray(liveData.data) ? liveData.data : [];
            
            // 🚀 BUGHUNT FIX: Auch hier flightNum nutzen!
            const matchedFlight = liveArray.find(f => f.flight_date === flight.date || f.flight_iata === flightNum);

            if (matchedFlight && matchedFlight.status === 'landed') {
                // 🛬 TOUCHDOWN ERFOLGREICH BESTÄTIGT!
                console.log(`✅ Touchdown für ${flightNum} bestätigt! Speichere in Supabase...`);
                
                const updatePayload = {
                    status: 'landed',
                    api_sync_attempts: 0 // Reset, da erfolgreich
                };

                // REG mitnehmen, falls vorhanden
                if (matchedFlight.aircraft_registration) updatePayload.registration = matchedFlight.aircraft_registration;
                if (matchedFlight.aircraft_icao) updatePayload.aircraft_type = matchedFlight.aircraft_icao;

                await supabase.from('flights').update(updatePayload).eq('id', flight.id);

            } else {
                // ====================================================================
                // 🛡️ REGEL 2: Die "Max Retries" Sicherung
                // ====================================================================
                const newAttempts = (flight.api_sync_attempts || 0) + 1;
                console.log(`⚠️ Flug ${flightNum} nicht als 'landed' gefunden (Status in API: ${matchedFlight ? matchedFlight.status : 'Nicht gefunden'}). Versuch ${newAttempts}/5.`);
                
                const fallbackPayload = { api_sync_attempts: newAttempts };
                if (newAttempts >= 5) {
                    console.log(`🚨 Max Retries erreicht für ${flightNum}. Markiere als 'manual_review'.`);
                    fallbackPayload.status = 'manual_review';
                }

                await supabase.from('flights').update(fallbackPayload).eq('id', flight.id);
            }

        } catch (err) {
            console.error(`Fehler bei der Verarbeitung von Flug ${flightNum}:`, err.message);
        }
    }

    console.log(`🏁 [AGENT ENDE] Habe ${processedCount} Flug/Flüge geprüft.`);
    return new Response("Cronjob Finished", { status: 200 });
}