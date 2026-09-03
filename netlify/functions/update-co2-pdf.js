const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
    // 1. CORS Preflight für die Android-App
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
    }

    try {
        const { flightId, userId } = JSON.parse(event.body);

        // 2. Aktuellen Link aus Supabase holen
        const { data: flight, error: fetchErr } = await supabaseAdmin
            .from('flights')
            .select('co2_certificate_url')
            .eq('flight_id', flightId)
            .eq('user_id', userId)
            .single();

        if (fetchErr || !flight || !flight.co2_certificate_url) {
            throw new Error('Flug nicht gefunden oder kein Zertifikat vorhanden');
        }

        const currentUrl = flight.co2_certificate_url;

        // 3. Wenn es schon ein Carbonmark-Link ist, müssen wir nichts tun!
        if (!currentUrl.includes('polygonscan.com/tx/')) {
            return { 
                statusCode: 200, 
                headers: corsHeaders, 
                body: JSON.stringify({ url: currentUrl, upgraded: false }) 
            };
        }

        // 4. Hash aus dem Polygon-Link extrahieren
        const txHash = currentUrl.split('/tx/')[1];
        if (!txHash) throw new Error('Konnte keinen Hash extrahieren.');

        // 5. Bei Carbonmark nach dem fertigen PDF fragen (Asynchron!)
        const cmRes = await fetch(`https://v20.api.carbonmark.com/retirements?hash=${txHash}`, {
            headers: { 'Accept': 'application/json' }
        });
        const cmData = await cmRes.json();

        // 6. Prüfen, ob die viewRetirementUrl (Das PDF) mittlerweile existiert
        if (cmRes.ok && cmData && cmData.length > 0 && cmData[0].viewRetirementUrl) {
            const newPdfUrl = cmData[0].viewRetirementUrl;

            // 7. Supabase lautlos updaten!
            await supabaseAdmin
                .from('flights')
                .update({ co2_certificate_url: newPdfUrl })
                .eq('flight_id', flightId)
                .eq('user_id', userId);

            return { 
                statusCode: 200, 
                headers: corsHeaders, 
                body: JSON.stringify({ url: newPdfUrl, upgraded: true }) 
            };
        }

        // 8. Falls Carbonmark immer noch nicht fertig ist, geben wir den alten Link zurück
        return { 
            statusCode: 200, 
            headers: corsHeaders, 
            body: JSON.stringify({ url: currentUrl, upgraded: false }) 
        };

    } catch (error) {
        console.error("PDF Update Error:", error);
        return { 
            statusCode: 500, 
            headers: corsHeaders, 
            body: JSON.stringify({ error: error.message }) 
        };
    }
};