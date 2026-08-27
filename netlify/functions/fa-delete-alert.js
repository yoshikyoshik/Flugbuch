export default async function handler(request, context) {
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;

    if (request.method !== 'POST') {
        return new Response('Bitte POST verwenden', { status: 405 });
    }

    try {
        const { fa_flight_id } = await request.json();

        if (!fa_flight_id) {
            return new Response(JSON.stringify({ error: "fa_flight_id fehlt" }), { status: 400 });
        }

        // 1. Alle Alerts abrufen, um die interne Alert-ID von FlightAware zu finden
        const getRes = await fetch('https://aeroapi.flightaware.com/aeroapi/alerts', {
            method: 'GET',
            headers: { 'x-apikey': API_KEY }
        });
        
        if (!getRes.ok) throw new Error('Konnte Alert-Liste nicht abrufen');
        const data = await getRes.json();
        
        // 2. Den passenden Alert für diesen Flug suchen
        const alertToDelete = data.alerts?.find(a => a.ident === fa_flight_id);

        if (!alertToDelete) {
            console.log(`Kein aktiver Alert für ${fa_flight_id} gefunden. Nichts zu tun.`);
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        // 3. Den gefundenen Alert endgültig löschen
        const delRes = await fetch(`https://aeroapi.flightaware.com/aeroapi/alerts/${alertToDelete.id}`, {
            method: 'DELETE',
            headers: { 'x-apikey': API_KEY }
        });

        if (!delRes.ok) throw new Error('Fehler beim Löschen des Alerts');

        console.log(`🗑️ Alert für ${fa_flight_id} erfolgreich abbestellt!`);
        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (error) {
        console.error("❌ Fehler beim Löschen des Alerts:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}