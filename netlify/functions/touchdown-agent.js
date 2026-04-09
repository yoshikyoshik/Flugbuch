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
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // 🚀 FIX: Dein korrekter Variablen-Name!

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
        JSON.parse(pingText); // Wenn das crasht, ist die API down (502 HTML)
    } catch (e) {
        console.error("🛑 [AGENT ABBRUCH] GoFlightLabs API ist down (HTML/502). Agent geht wieder schlafen, um Tokens zu sparen.");
        return new Response("API Down", { status: 502 });
    }

    // ====================================================================
    // 🎯 REGEL 1: Supabase First (Der Laser-Fokus)
    // ====================================================================
    // Wir holen nur Flüge, die NICHT 'landed' oder 'manual_review' sind
    // UND die weniger als 5 Fehlversuche haben.
    const { data: flights, error } = await supabase
        .from('flights')
        .select('*')
        .neq('status', 'landed')
        .neq('status', 'manual_review')
        .lt('api_sync_attempts', 5);

    if (error || !flights || flights.length === 0) {
        console.log("📭 Keine relevanten Flüge zum Überprüfen gefunden. Agent schläft wieder ein.");
        return new Response("OK", { status: 200 });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    let processedCount = 0;

    for (const flight of flights) {
        // ====================================================================
        // ⏳ REGEL 4: Puffer-Zeiten nutzen (Grace Period)
        // ====================================================================
        // Wir nehmen die geplante Landezeit (oder Abflug + Dauer) und packen 30 Minuten Puffer drauf.
        const estimatedTouchdownTs = (flight.arr_time_ts) || (flight.dep_time_ts + 7200); // 7200 = Fallback 2h Flug
        const gracePeriodTs = estimatedTouchdownTs + 1800; // + 30 Minuten (1800 Sekunden)

        if (nowSeconds < gracePeriodTs) {
            // Flug ist laut Plan noch nicht (lange genug) gelandet. Überspringen!
            continue; 
        }

        console.log(`✈️ Prüfe Flug ${flight.flight_iata} (ID: ${flight.id}) - Landung sollte erfolgt sein.`);
        processedCount++;

        try {
            // API nach LIVE-Status abfragen
            const liveUrl = `https://www.goflightlabs.com/advanced-flights-schedules?access_key=${API_KEY}&iataCode=${flight.departure}&type=departure&flight_iata=${flight.flight_iata}`;
            const liveRes = await fetch(liveUrl);
            const liveData = await liveRes.json();
            const liveArray = Array.isArray(liveData.data) ? liveData.data : [];
            
            const matchedFlight = liveArray.find(f => f.flight_date === flight.date || f.flight_iata === flight.flight_iata);

            if (matchedFlight && matchedFlight.status === 'landed') {
                // 🛬 TOUCHDOWN ERFOLGREICH BESTÄTIGT!
                console.log(`✅ Touchdown für ${flight.flight_iata} bestätigt! Speichere in Supabase...`);
                
                const updatePayload = {
                    status: 'landed',
                    api_sync_attempts: 0 // Reset, da erfolgreich
                };

                // REG mitnehmen, falls vorhanden
                if (matchedFlight.aircraft_registration) updatePayload.registration = matchedFlight.aircraft_registration;
                if (matchedFlight.aircraft_icao) updatePayload.aircraft_type = matchedFlight.aircraft_icao;

                // (Optional: Hier könntest du noch eine Wetter-API Funktion einbauen, 
                // ähnlich wie window.fetchAviationWeather in deinem Frontend, falls der Agent das Wetter laden soll).

                await supabase.from('flights').update(updatePayload).eq('id', flight.id);

            } else {
                // ====================================================================
                // 🛡️ REGEL 2: Die "Max Retries" Sicherung
                // ====================================================================
                const newAttempts = (flight.api_sync_attempts || 0) + 1;
                console.log(`⚠️ Flug ${flight.flight_iata} nicht als 'landed' gefunden. Versuch ${newAttempts}/5.`);
                
                const fallbackPayload = { api_sync_attempts: newAttempts };
                if (newAttempts >= 5) {
                    console.log(`🚨 Max Retries erreicht für ${flight.flight_iata}. Markiere als 'manual_review'.`);
                    fallbackPayload.status = 'manual_review';
                }

                await supabase.from('flights').update(fallbackPayload).eq('id', flight.id);
            }

        } catch (err) {
            console.error(`Fehler bei der Verarbeitung von Flug ${flight.flight_iata}:`, err.message);
        }
    }

    console.log(`🏁 [AGENT ENDE] Habe ${processedCount} Flug/Flüge geprüft.`);
    return new Response("Cronjob Finished", { status: 200 });
}