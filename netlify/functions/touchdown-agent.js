// netlify/functions/touchdown-agent.js
import { createClient } from '@supabase/supabase-js';



export default async function handler(request, context) {
    console.log("🤖 [AGENT START] Touchdown & Deep Sweep Agent erwacht...");

    const API_KEY = process.env.GOFLIGHTLABS_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

    if (!API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
        console.error("FEHLER: Umgebungsvariablen fehlen!");
        return new Response("Missing Envs", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const nowSeconds = Math.floor(Date.now() / 1000);

    // ====================================================================
    // 🧹 NEU: DER DEEP SWEEP (Automatisches Archivieren)
    // ====================================================================
    // Wir suchen Flüge, die seit mehr als 24 Stunden auf 'landed' stehen.
    const oneDayAgo = nowSeconds - 86400; 
    
    const { data: oldFlights } = await supabase
        .from('flights')
        .select('id, flightNumber, arr_time_ts')
        .eq('status', 'landed');

    if (oldFlights && oldFlights.length > 0) {
        const idsToArchive = oldFlights
            .filter(f => (f.arr_time_ts || (nowSeconds - 90000)) < oneDayAgo)
            .map(f => f.id);

        if (idsToArchive.length > 0) {
            console.log(`🧹 [DEEP SWEEP] Schiebe ${idsToArchive.length} alte Landungen ins Archiv...`);
            await supabase.from('flights').update({ status: 'archived' }).in('id', idsToArchive);
        }
    }

    // ====================================================================
    // 🛡️ API-Health-Check Bremse
    // ====================================================================
    try {
        const pingRes = await fetch(`https://www.goflightlabs.com/airports-by-filter?access_key=${API_KEY}&iata_code=FRA`);
        const pingText = await pingRes.text();
        JSON.parse(pingText); 
    } catch (e) {
        console.error("🛑 [AGENT ABBRUCH] GoFlightLabs API ist down. Agent schläft wieder ein.");
        return new Response("API Down", { status: 502 });
    }

    // ====================================================================
    // 🎯 TOUCHDOWN CHECK (Die reguläre Arbeit)
    // ====================================================================
    const { data: activeFlights, error } = await supabase
        .from('flights')
        .select('*')
        .in('status', ['scheduled', 'active', 'en-route'])
        .lt('api_sync_attempts', 5);

    if (error || !activeFlights || activeFlights.length === 0) {
        console.log("📭 Keine aktiven Flüge zum Prüfen gefunden.");
        return new Response("OK", { status: 200 });
    }

    let processedCount = 0;

    for (const flight of activeFlights) {
        const flightNum = flight.flightNumber || flight.flight_iata || flight.flight_number;
        
        let estimatedTouchdownTs = flight.arr_time_ts || (flight.dep_time_ts ? (flight.dep_time_ts + 7200) : (nowSeconds + 999999));
        const gracePeriodTs = estimatedTouchdownTs + 1800; // 30 Min Puffer

        if (nowSeconds < gracePeriodTs) continue; 

        console.log(`✈️ Prüfe Landung für ${flightNum}...`);
        processedCount++;

        try {
            const liveUrl = `https://www.goflightlabs.com/advanced-flights-schedules?access_key=${API_KEY}&iataCode=${flight.departure}&type=departure&flight_iata=${flightNum}`;
            const liveRes = await fetch(liveUrl);
            const liveData = await liveRes.json();
            const liveArray = Array.isArray(liveData.data) ? liveData.data : [];
            
            const matchedFlight = liveArray.find(f => 
                (f.flight_iata === flightNum || f.flight_icao === flightNum) && 
                f.flight_date === flight.date
            );

            if (matchedFlight && matchedFlight.status === 'landed') {
                console.log(`✅ Touchdown für ${flightNum} bestätigt!`);
                const updatePayload = { status: 'landed', api_sync_attempts: 0 };
                if (matchedFlight.aircraft_registration) updatePayload.registration = matchedFlight.aircraft_registration;
                await supabase.from('flights').update(updatePayload).eq('id', flight.id);
            } else {
                const newAttempts = (flight.api_sync_attempts || 0) + 1;
                const fallbackPayload = { api_sync_attempts: newAttempts };
                if (newAttempts >= 5) fallbackPayload.status = 'manual_review';
                await supabase.from('flights').update(fallbackPayload).eq('id', flight.id);
            }
        } catch (err) {
            console.error(`Fehler bei ${flightNum}:`, err.message);
        }
    }

    console.log(`🏁 [AGENT ENDE] Deep Sweep erledigt, ${processedCount} Landungen geprüft.`);
    return new Response("Cronjob Finished", { status: 200 });
}