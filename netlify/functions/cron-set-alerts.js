import { createClient } from '@supabase/supabase-js';

// Moderne Netlify V2 Syntax (Ohne fehlerhaften Import!)
export default async (req, context) => {
    console.log("🕒 Cron Job Start: Prüfe anstehende Flüge für Push-Alerts...");

    // Umgebungsvariablen laden
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
    const FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FLIGHTAWARE_API_KEY) {
        console.error("❌ Umgebungsvariablen fehlen!");
        return new Response("Missing env vars", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Das 48h-Zeitfenster definieren
    const now = new Date();
    const in48Hours = new Date(now.getTime() + (48 * 60 * 60 * 1000));
    
    // Für Supabase als saubere YYYY-MM-DD Strings formatieren
    const todayStr = now.toISOString().split('T')[0];
    const targetStr = in48Hours.toISOString().split('T')[0];

    // 2. Flüge aus Supabase laden
    const { data: flights, error } = await supabase
        .from('flights')
        .select('flight_id, fa_flight_id, date, user_id')
        .eq('alert_set', false)
        .not('fa_flight_id', 'is', null)
        .gte('date', todayStr)
        .lte('date', targetStr);

    if (error) {
        console.error("❌ DB Fehler:", error);
        return new Response("DB Error", { status: 500 });
    }

    if (!flights || flights.length === 0) {
        console.log("✅ Keine neuen Flüge im 48h-Fenster für Alerts gefunden.");
        return new Response("OK", { status: 200 });
    }

    console.log(`✈️ ${flights.length} Flüge für Alert-Registrierung gefunden.`);

    // 3. Alerts bei FlightAware setzen
    for (const flight of flights) {
        try {
            const response = await fetch('https://aeroapi.flightaware.com/aeroapi/alerts', {
                method: 'POST',
                headers: {
                    'x-apikey': FLIGHTAWARE_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    flight_id: flight.fa_flight_id,
                    events: {
                        arrival: true,
                        departure: true,
                        cancelled: true,
                        delay: true,
                        diverted: true,
                        gate_change: true
                    }
                })
            });

            if (response.ok || response.status === 409) { 
                // 4. In Supabase abhaken
                await supabase
                    .from('flights')
                    .update({ alert_set: true })
                    .eq('flight_id', flight.flight_id);
                    
                console.log(`✅ Alert erfolgreich gesetzt für: ${flight.fa_flight_id}`);
            } else {
                const errText = await response.text();
                console.error(`❌ FlightAware Fehler für ${flight.fa_flight_id}:`, errText);
            }
        } catch (err) {
            console.error(`❌ Genereller Fehler bei Flug ${flight.flight_id}:`, err);
        }
    }

    console.log("🕒 Cron Job beendet.");
    return new Response("OK", { status: 200 });
};

// Netlify Cron-Job Konfiguration für V2
export const config = {
    schedule: "@hourly"
};