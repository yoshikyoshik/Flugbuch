import { createClient } from '@supabase/supabase-js';

// Moderne Netlify V2 Syntax (Jetzt als Background Function)
export default async (req, context) => {
    console.log("🕒 Cron Job Start: Hydrate Flights (Suche fehlende FlightAware IDs)...");

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
    const FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FLIGHTAWARE_API_KEY) {
        console.error("❌ Umgebungsvariablen fehlen!");
        return new Response("Missing env vars", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        const now = new Date();
        const in72Hours = new Date(now.getTime() + (72 * 60 * 60 * 1000));
        
        const todayStr = now.toISOString().split('T')[0];
        const endStr = in72Hours.toISOString().split('T')[0];

        const { data: flights, error } = await supabase
            .from('flights')
            .select('flight_id, flightNumber, date')
            .is('fa_flight_id', null)
            .gte('date', todayStr)
            .lte('date', endStr);

        if (error) {
            console.error("❌ DB Fehler:", error);
            await supabase.from('system_logs').insert([{
                job_name: 'cron-hydrate-flights',
                status: 'error',
                message: 'Fehler beim Laden der Flüge aus Supabase',
                details: error
            }]);
            return new Response("DB Error", { status: 500 });
        }

        if (!flights || flights.length === 0) {
            console.log("✅ Keine Flüge zum Hydrieren im 0-72h Fenster gefunden.");
            await supabase.from('system_logs').insert([{
                job_name: 'cron-hydrate-flights',
                status: 'success',
                message: 'Keine anstehenden importierten Flüge ohne fa_flight_id gefunden.'
            }]);
            return new Response("OK", { status: 200 });
        }

        console.log(`✈️ ${flights.length} Flüge für ID-Abruf gefunden.`);
        
        let successCount = 0;
        let notFoundCount = 0;
        let errorCount = 0;

        for (const flight of flights) {
            // 🚀 NEU: Timeout Controller für maximal 10 Sekunden Wartezeit
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            try {
                const response = await fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${flight.flightNumber}`, {
                    method: 'GET',
                    signal: controller.signal, // 🚀 Signal übergeben
                    headers: {
                        'x-apikey': FLIGHTAWARE_API_KEY,
                        'Accept': 'application/json'
                    }
                });

                clearTimeout(timeoutId); // 🚀 Erfolgreich geantwortet -> Timeout löschen

                if (response.ok) {
                    const data = await response.json();
                    
                    const matchingFaFlight = data.flights.find(fa => {
                        return fa.scheduled_out && fa.scheduled_out.startsWith(flight.date);
                    });

                    if (matchingFaFlight && matchingFaFlight.fa_flight_id) {
                        await supabase
                            .from('flights')
                            .update({ fa_flight_id: matchingFaFlight.fa_flight_id })
                            .eq('flight_id', flight.flight_id);
                            
                        console.log(`✅ ID gefunden für ${flight.flightNumber}: ${matchingFaFlight.fa_flight_id}`);
                        successCount++;
                    } else {
                        console.log(`⚠️ Flug ${flight.flightNumber} am ${flight.date} existiert bei FlightAware (noch) nicht im System.`);
                        notFoundCount++;
                    }
                } else {
                    const errText = await response.text();
                    console.error(`❌ API Fehler für ${flight.flightNumber}:`, errText);
                    errorCount++;
                }
            } catch (err) {
                clearTimeout(timeoutId); // 🚀 Auch im Fehlerfall Timeout aufräumen
                
                // 🚀 NEU: Prüfen, ob der Abbruch durch unseren Timeout kam
                if (err.name === 'AbortError') {
                    console.error(`❌ API Timeout: FlightAware hat für ${flight.flightNumber} zu lange gebraucht (>10s)`);
                } else {
                    console.error(`❌ Request Fehler bei ${flight.flightNumber}:`, err);
                }
                errorCount++;
            }
        }

        await supabase.from('system_logs').insert([{
            job_name: 'cron-hydrate-flights',
            status: (errorCount === 0 && notFoundCount === 0) ? 'success' : 'warning',
            message: `Hydrierung abgeschlossen. ${successCount} IDs bezogen, ${notFoundCount} nicht gefunden, ${errorCount} Fehler.`,
            details: { processed: flights.length, success: successCount, notFound: notFoundCount, errors: errorCount }
        }]);

        console.log("🕒 Cron Job beendet.");
        return new Response("OK", { status: 200 });

    } catch (globalError) {
        console.error("❌ Kritischer Fehler im Cronjob:", globalError);
        await supabase.from('system_logs').insert([{
            job_name: 'cron-hydrate-flights',
            status: 'error',
            message: globalError.message || 'Unerwarteter Fehler im Skript',
            details: { stack: globalError.stack }
        }]);
        return new Response("Internal Server Error", { status: 500 });
    }
};

export const config = {
    schedule: "@hourly"
};
