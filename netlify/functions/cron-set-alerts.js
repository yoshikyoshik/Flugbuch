import { createClient } from '@supabase/supabase-js';

// Moderne Netlify V2 Syntax
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

    // 🚀 NEU: Globaler Try-Catch-Block für ausfallsicheres Error-Logging
    try {
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

        // 🚀 NEU: Datenbank-Fehler loggen
        if (error) {
            console.error("❌ DB Fehler:", error);
            await supabase.from('system_logs').insert([{
                job_name: 'cron-set-alerts',
                status: 'error',
                message: 'Fehler beim Laden der Flüge aus Supabase',
                details: error
            }]);
            return new Response("DB Error", { status: 500 });
        }

        // 🚀 NEU: Erfolgreichen Leerlauf loggen
        if (!flights || flights.length === 0) {
            console.log("✅ Keine neuen Flüge im 48h-Fenster für Alerts gefunden.");
            await supabase.from('system_logs').insert([{
                job_name: 'cron-set-alerts',
                status: 'success',
                message: 'Keine neuen Flüge im 48h-Fenster für Alerts gefunden.'
            }]);
            return new Response("OK", { status: 200 });
        }

        console.log(`✈️ ${flights.length} Flüge für Alert-Registrierung gefunden.`);
        
        // Zähler für das abschließende Protokoll
        let successCount = 0;
        let errorCount = 0;

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
                    successCount++;
                } else {
                    const errText = await response.text();
                    console.error(`❌ FlightAware Fehler für ${flight.fa_flight_id}:`, errText);
                    errorCount++;
                }
            } catch (err) {
                console.error(`❌ Genereller Fehler bei Flug ${flight.flight_id}:`, err);
                errorCount++;
            }
        }

        // 🚀 NEU: Gesamtergebnis nach der Flug-Schleife loggen
        await supabase.from('system_logs').insert([{
            job_name: 'cron-set-alerts',
            // Setzt den Status auf 'warning', falls einzelne Flüge fehlgeschlagen sind
            status: errorCount === 0 ? 'success' : 'warning',
            message: `Alert-Registrierung abgeschlossen. ${successCount} erfolgreich, ${errorCount} fehlerhaft.`,
            details: { processed: flights.length, success: successCount, failed: errorCount }
        }]);

        console.log("🕒 Cron Job beendet.");
        return new Response("OK", { status: 200 });

    } catch (globalError) {
        // 🚀 NEU: Auffangbecken für unerwartete Skript-Abstürze
        console.error("❌ Kritischer Fehler im Cronjob:", globalError);
        await supabase.from('system_logs').insert([{
            job_name: 'cron-set-alerts',
            status: 'error',
            message: globalError.message || 'Unerwarteter kritischer Fehler aufgetreten',
            details: { stack: globalError.stack }
        }]);
        return new Response("Internal Server Error", { status: 500 });
    }
};

// Netlify Cron-Job Konfiguration für V2
export const config = {
    schedule: "@hourly"
};