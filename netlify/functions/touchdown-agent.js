// netlify/functions/touchdown-agent.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, context) {
    console.log("🤖 [AGENT START] Touchdown Agent (FlightAware) erwacht...");

    // 🚀 NEU: FlightAware API Key
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

    if (!API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
        console.error("FEHLER: Umgebungsvariablen fehlen!");
        return new Response("Missing Envs", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const nowSeconds = Math.floor(Date.now() / 1000);

    // ====================================================================
    // 🧹 DER DEEP SWEEP (Automatisches Archivieren nach 24h)
    // ====================================================================
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
    // 🎯 TOUCHDOWN CHECK (Landungen prüfen)
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
        
        // Wir prüfen erst 30 Minuten nach der geplanten Ankunft!
        let estimatedTouchdownTs = flight.arr_time_ts || (flight.dep_time_ts ? (flight.dep_time_ts + 7200) : (nowSeconds + 999999));
        const gracePeriodTs = estimatedTouchdownTs + 1800; 

        if (nowSeconds < gracePeriodTs) continue; 

        console.log(`✈️ Prüfe Landung für ${flightNum}...`);
        processedCount++;

        try {
            const cleanFlightNum = flightNum.replace(/\s+/g, '').toUpperCase();
            const startDate = `${flight.date}T00:00:00Z`;
            const endDate = `${flight.date}T23:59:59Z`;
            const faUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${cleanFlightNum}?start=${startDate}&end=${endDate}`;
            
            const faRes = await fetch(faUrl, { 
                headers: { 'x-apikey': API_KEY, 'Accept': 'application/json' } 
            });
            
            if (faRes.ok) {
                const faData = await faRes.json();
                const faFlights = faData.flights || [];
                const matchedFlight = faFlights.find(f => f.destination?.code_iata === flight.arrival);

                // 🚀 FLIGHTAWARE LOGIK: Hat der Flug einen "actual_in" (Ankunft am Gate) Stempel?
                if (matchedFlight && matchedFlight.actual_in) {
                    console.log(`✅ Touchdown für ${flightNum} durch FlightAware bestätigt!`);
                    const updatePayload = { status: 'landed', api_sync_attempts: 0 };
                    if (matchedFlight.registration) updatePayload.registration = matchedFlight.registration;
                    await supabase.from('flights').update(updatePayload).eq('id', flight.id);
                } else {
                    console.log(`⏳ Flug ${flightNum} ist laut FlightAware noch nicht gelandet.`);
                    const newAttempts = (flight.api_sync_attempts || 0) + 1;
                    const fallbackPayload = { api_sync_attempts: newAttempts };
                    if (newAttempts >= 5) fallbackPayload.status = 'manual_review';
                    await supabase.from('flights').update(fallbackPayload).eq('id', flight.id);
                }
            } else {
                console.log(`❌ Fehler von FlightAware. Erhöhe Fehler-Zähler für ${flightNum}.`);
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