// netlify/functions/fetch-fa-flight.js

exports.handler = async function(event, context) {
    // 🛡️ CORS-Header (Erlaubt deiner App den Zugriff)
    const CORS_HEADERS = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers: CORS_HEADERS, body: "OK" };
    }

    // 🔑 API-Key prüfen
    const API_KEY = process.env.FLIGHTAWARE_API_KEY;
    if (!API_KEY) {
        return { 
            statusCode: 500, 
            headers: CORS_HEADERS, 
            body: JSON.stringify({ error: "FlightAware API Key fehlt in Netlify." }) 
        };
    }

    // 📥 Parameter aus dem Frontend empfangen
    const { flight_number, dep, arr, date } = event.queryStringParameters || {};

    try {
        let flights = [];

        // =========================================================
        // FALL A: SUCHE NACH FLUGNUMMER (Für "Autopilot" & "Live-Widget")
        // =========================================================
        if (flight_number) {
            const cleanFlightNum = flight_number.replace(/\s+/g, '').toUpperCase();
            let url = `https://aeroapi.flightaware.com/aeroapi/flights/${cleanFlightNum}`;
            
            // Wenn ein Datum übergeben wurde, grenzen wir den Zeitraum ein
            if (date) {
                const startDate = `${date}T00:00:00Z`;
                const endDate = `${date}T23:59:59Z`;
                url += `?start=${startDate}&end=${endDate}`;
            }

            const response = await fetch(url, {
                headers: { 'x-apikey': API_KEY, 'Accept': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                flights = data.flights || [];
            }
        } 
        // =========================================================
        // FALL B: SUCHE NACH ROUTE (Für "Manuell hinzufügen" Liste)
        // =========================================================
        else if (dep && arr) {
            // Wenn kein Datum da ist, nehmen wir heute
            const searchDate = date || new Date().toISOString().split('T')[0];
            const url = `https://aeroapi.flightaware.com/aeroapi/schedules/${searchDate}/${dep.toUpperCase()}/${arr.toUpperCase()}`;
            
            const response = await fetch(url, {
                headers: { 'x-apikey': API_KEY, 'Accept': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                flights = data.scheduled_flights || [];
            }
        } else {
            return { 
                statusCode: 400, 
                headers: CORS_HEADERS, 
                body: JSON.stringify({ error: "Bitte entweder Flugnummer oder Route (dep/arr) angeben." }) 
            };
        }

        // =========================================================
        // 🧹 DATEN-AUFBEREITUNG (Übersetzer für AvioSphere)
        // =========================================================
        // FlightAware liefert extrem viele Daten. Wir picken uns nur die Kirschen 
        // heraus und verpacken sie so flach, dass deine App sie sofort versteht.
        
        const mappedFlights = flights.map(f => {
            // Zeiten sicher extrahieren
            const depTime = f.actual_out || f.estimated_out || f.scheduled_out || null;
            const arrTime = f.actual_in || f.estimated_in || f.scheduled_in || null;
            
            // Status ableiten
            let status = "scheduled";
            if (f.actual_in) status = "landed";
            else if (f.actual_off) status = "active";
            else if (f.cancelled) status = "cancelled";

            return {
                // Basis
                flight_number: f.ident || "",
                airline_icao: f.operator || "",
                
                // Route
                dep_iata: f.origin?.code_iata || dep || "",
                arr_iata: f.destination?.code_iata || arr || "",
                
                // Flugzeug (wichtig für Logbuch)
                aircraft_type: f.aircraft_type || "",
                registration: f.registration || "",
                
                // 🎯 DIE MAGISCHEN FLIGHTAWARE DATEN
                dep_terminal: f.terminal_origin || "",
                dep_gate: f.gate_origin || "",
                arr_terminal: f.terminal_destination || "",
                arr_gate: f.gate_destination || "",
                baggage_claim: f.baggage_claim || "",
                
                // Zeiten (App nutzt gerne Unix-Timestamps in Sekunden)
                dep_time_ts: depTime ? Math.floor(new Date(depTime).getTime() / 1000) : null,
                arr_time_ts: arrTime ? Math.floor(new Date(arrTime).getTime() / 1000) : null,
                dep_time_iso: depTime, // Auch im Originalformat zur Sicherheit mitgeben
                arr_time_iso: arrTime,
                
                status: status
            };
        });

        // Codeshares und leere Hüllen (ohne Start/Ziel) herausfiltern
        const validFlights = mappedFlights.filter(f => f.dep_iata && f.arr_iata);

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify(validFlights)
        };

    } catch (error) {
        console.error("FlightAware API Fehler:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: `Server-Fehler: ${error.message}` })
        };
    }
};