import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createClient } from '@supabase/supabase-js';

// 1. FIREBASE ADMIN INITIALISIEREN (Sicherstellen, dass es nur 1x geladen wird)
if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // 🚀 BUGHUNT FIX: Netlify zerschießt oft die Zeilenumbrüche (\n) in Env-Variablen.
            // Diese Replace-Funktion repariert den Schlüssel, damit Firebase ihn lesen kann!
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}

// 2. SUPABASE INITIALISIEREN (Mit dem geheimen Service Role Key!)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(request, context) {
    // FlightAware schickt Alerts immer als POST-Request
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        // FlightAware JSON-Paket auslesen
        const alertData = await request.json();
        console.log("🔔 FlightAware Webhook empfangen:", JSON.stringify(alertData));

        // Das Alert-Paket von FlightAware (v4) auswerten
        const faFlightId = alertData.flight?.fa_flight_id;
        const messageTitle = "✈️ AvioSphere Flug-Update";
        
        // FlightAware schickt uns meistens eine schöne Zusammenfassung des Events
        const messageBody = alertData.summary || alertData.long_description || "Es gibt Neuigkeiten zu deinem Flug.";

        if (!faFlightId) {
            console.log("Keine fa_flight_id im Payload gefunden. Abbruch.");
            return new Response('OK', { status: 200 }); // Wir antworten trotzdem 200 OK, damit FlightAware nicht meckert
        }

        // 3. Wem gehört dieser Flug? (Wir suchen in Supabase nach allen Nutzern, die diesen Flug geloggt haben)
        const { data: flights, error: flightError } = await supabase
            .from('flights')
            .select('user_id')
            .eq('fa_flight_id', faFlightId);

        if (flightError || !flights || flights.length === 0) {
            console.log(`Niemand trackt Flug ${faFlightId}.`);
            return new Response('OK', { status: 200 });
        }

        // 4. Push-Nachrichten an alle Finder senden!
        for (const flight of flights) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('fcm_token')
                .eq('id', flight.user_id)
                .maybeSingle();

            if (profile && profile.fcm_token) {
                // Firebase beauftragen, die Nachricht ans Handy zu feuern!
                await getMessaging().send({
                    token: profile.fcm_token,
                    notification: {
                        title: messageTitle,
                        body: messageBody
                    },
                    data: {
                        fa_flight_id: faFlightId // Kann genutzt werden, um in der App direkt die richtige Bordkarte zu öffnen
                    }
                });
                console.log(`✅ Push erfolgreich an User ${flight.user_id} gesendet!`);
            }
        }

        return new Response('Webhook erfolgreich verarbeitet', { status: 200 });

    } catch (error) {
        console.error("❌ Webhook Fehler:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}