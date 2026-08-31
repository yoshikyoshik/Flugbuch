import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createClient } from '@supabase/supabase-js';

// 1. FIREBASE ADMIN INITIALISIEREN
if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}

// 2. SUPABASE INITIALISIEREN
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 🌍 NEU: Unser Übersetzungs-Wörterbuch für Push-Nachrichten
const translations = {
    de: {
        title: "✈️ Flug-Update: {ident}",
        departure: "Dein Flug nach {dest} ist gestartet! 🛫",
        arrival: "Dein Flug in {dest} ist gelandet! 🛬",
        delayed: "Verspätung für Flug {ident} ⏱️",
        cancelled: "Dein Flug nach {dest} wurde annulliert ❌",
        default: "Neues Update zu deinem Flug {ident} ℹ️",
        termGate: "🚪 Terminal {term} | Gate {gate}"
    },
    en: {
        title: "✈️ Flight Update: {ident}",
        departure: "Your flight to {dest} has departed! 🛫",
        arrival: "Your flight in {dest} has landed! 🛬",
        delayed: "Delay for flight {ident} ⏱️",
        cancelled: "Your flight to {dest} has been cancelled ❌",
        default: "New update for your flight {ident} ℹ️",
        termGate: "🚪 Terminal {term} | Gate {gate}"
    },
    es: {
        title: "✈️ Vuelo: {ident}",
        departure: "¡Tu vuelo a {dest} ha despegado! 🛫",
        arrival: "¡Tu vuelo en {dest} ha aterrizado! 🛬",
        delayed: "Retraso en el vuelo {ident} ⏱️",
        cancelled: "Tu vuelo a {dest} ha sido cancelado ❌",
        default: "Nueva actualización para tu vuelo {ident} ℹ️",
        termGate: "🚪 Terminal {term} | Puerta {gate}"
    },
    ru: {
        title: "✈️ Рейс: {ident}",
        departure: "Ваш рейс в {dest} вылетел! 🛫",
        arrival: "Ваш рейс в {dest} приземлился! 🛬",
        delayed: "Задержка рейса {ident} ⏱️",
        cancelled: "Ваш рейс в {dest} отменен ❌",
        default: "Обновление для вашего рейса {ident} ℹ️",
        termGate: "🚪 Терминал {term} | Выход {gate}"
    },
    zh: {
        title: "✈️ 航班更新: {ident}",
        departure: "您飞往 {dest} 的航班已起飞！ 🛫",
        arrival: "您在 {dest} 的航班已降落！ 🛬",
        delayed: "航班 {ident} 延误 ⏱️",
        cancelled: "您飞往 {dest} 的航班已取消 ❌",
        default: "您的航班 {ident} 有新动态 ℹ️",
        termGate: "🚪 航站楼 {term} | 登机口 {gate}"
    }
};

export default async function handler(request, context) {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const alertData = await request.json();
        console.log("🔔 FlightAware Webhook empfangen:", JSON.stringify(alertData));

        const faFlightId = alertData.flight?.fa_flight_id;
        
        if (!faFlightId) {
            return new Response('OK', { status: 200 }); 
        }

        const { data: flights, error: flightError } = await supabase
            .from('flights')
            .select('user_id')
            .eq('fa_flight_id', faFlightId);

        if (flightError || !flights || flights.length === 0) {
            return new Response('OK', { status: 200 });
        }

        // 3. Push-Nachrichten an alle Finder senden!
        for (const flight of flights) {
            
            // 🚀 NEU: Wir holen fcm_token UND die Sprache aus dem Profil
            const { data: profile } = await supabase
                .from('profiles')
                .select('fcm_token, language')
                .eq('id', flight.user_id)
                .maybeSingle();

            if (profile && profile.fcm_token) {
                
                // 🌍 Sprache ermitteln (Fallback auf Englisch)
                const userLang = profile.language || 'en';
                const t = translations[userLang] || translations['en'];
                
                const fInfo = alertData.flight || {};
                const ident = fInfo.ident_iata || fInfo.ident || "Unbekannt";
                const dest = fInfo.destination_iata || fInfo.destination || "";
                
                // 🏗️ Titel bauen
                const pushTitle = t.title.replace('{ident}', ident);
                
                // 🏗️ Basis-Nachricht bauen (Je nach Event)
                let pushBody = t.default.replace('{ident}', ident);
                if (alertData.event_code === 'departure') pushBody = t.departure.replace('{dest}', dest);
                else if (alertData.event_code === 'arrival') pushBody = t.arrival.replace('{dest}', dest);
                else if (alertData.event_code === 'delayed') pushBody = t.delayed.replace('{ident}', ident);
                else if (alertData.event_code === 'cancelled') pushBody = t.cancelled.replace('{dest}', dest);
                
                // 🏗️ Terminal & Gate anfügen (falls vorhanden)
                // Bei Ankunft (arrival) zeigen wir die Ziel-Gates, sonst die Abflug-Gates
                const isArr = alertData.event_code === 'arrival';
                const term = isArr ? (fInfo.terminal_destination || "-") : (fInfo.terminal_origin || "-");
                const gate = isArr ? (fInfo.gate_destination || "-") : (fInfo.gate_origin || "-");
                
                if (term !== "-" || gate !== "-") {
                    pushBody += "\n" + t.termGate.replace('{term}', term).replace('{gate}', gate);
                }
                
                // 🏗️ Die "long_description" von FlightAware als Details unten anhängen
                const longDesc = alertData.long_description || alertData.summary || "";
                pushBody += `\n\n📝 ${longDesc}`;

                // Firebase beauftragen
                await getMessaging().send({
                    token: profile.fcm_token,
                    notification: {
                        title: pushTitle,
                        body: pushBody
                    },
                    data: {
                        fa_flight_id: faFlightId 
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