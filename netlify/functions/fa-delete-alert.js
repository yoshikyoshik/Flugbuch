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

        // 1. Alle Alerts abrufen
        const getRes = await fetch('https://aeroapi.flightaware.com/aeroapi/alerts', {
            method: 'GET',
            headers: { 'x-apikey': API_KEY }
        });
        
        if (!getRes.ok) throw new Error('Konnte Alert-Liste nicht abrufen');
        const data = await getRes.json();
        
        // 🚀 BUGHUNT FIX: Wir loggen die rohe Antwort von FlightAware, 
        // um zu sehen, wie sie unsere Flugnummern speichern!
        console.log(`🔍 Suche nach: ${fa_flight_id}`);
        console.log("🗃️ Aktuelle FlightAware Alerts:", JSON.stringify(data.alerts));
        
        // 2. Den passenden Alert suchen (Jetzt auch mit Teil-Übereinstimmung!)
        const alertToDelete = data.alerts?.find(a => 
            a.ident === fa_flight_id || 
            a.flight_id === fa_flight_id || 
            fa_flight_id.startsWith(a.ident) // <-- Das ist der Fuzzy-Match Trick!
        );

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

        console.log(`🗑️ Alert für ${fa_flight_id} (ID: ${alertToDelete.id}) erfolgreich abbestellt!`);
        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (error) {
        console.error("❌ Fehler beim Löschen des Alerts:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}