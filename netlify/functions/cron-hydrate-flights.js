import { createClient } from '@supabase/supabase-js';

// Moderne Netlify V2 Syntax
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
        // 1. Das Zeitfenster definieren: Ab HEUTE (0h) bis +72h (Fängt alle Nachzügler auf!)
        const now = new Date();
        const in72Hours = new Date(now.getTime() + (72 * 60 * 60 * 1000));
        
        const todayStr = now.toISOString().split('T')[0];
        const endStr = in72Hours.toISOString().split('T')[0];

        // 2. Flüge ohne FlightAware ID in diesem Zeitfenster laden
        const { data: flights, error } = await supabase
            .from('flights')
            .select('flight_id, flightNumber, date')
            .is('fa_flight_id', null) // Greift nur unvollständige Flüge!
            .gte('date', todayStr)    // Von HEUTE
            .lte('date', endStr);     // Bis in 3 Tagen

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

        // 3. FlightAware ID für jeden Flug abrufen
        for (const flight of flights) {
            try {
                // Endpoint aufrufen (z.B. /flights/LH624)
                const response = await fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${flight.flightNumber}`, {
                    method: 'GET',
                    headers: {
                        'x-apikey': FLIGHTAWARE_API_KEY,
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    // FlightAware gibt oft eine Liste von Flügen zurück (gestern, heute, morgen).
                    // Wir suchen den Flug, dessen geplanter Abflug (scheduled_out) mit unserem Flugdatum übereinstimmt.
                    const matchingFaFlight = data.flights.find(fa => {
                        return fa.scheduled_out && fa.scheduled_out.startsWith(flight.date);
                    });

                    if (matchingFaFlight && matchingFaFlight.fa_flight_id) {
                        // 4. In Supabase speichern
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
                console.error(`❌ Request Fehler bei ${flight.flightNumber}:`, err);
                errorCount++;
            }
        }

        // Globales Log für diesen Durchlauf speichern
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

// Netlify Cron-Job Konfiguration für V2 (stündliche Ausführung)
export const config = {
    schedule: "@hourly"
};
