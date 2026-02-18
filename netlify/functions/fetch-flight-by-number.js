// fetch-flight-by-number.js (Serverless Function)

exports.handler = async function (event, context) {
  // CORS Header für Sicherheit
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const API_KEY = process.env.FLIGHTAWARE_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server config error: API Key missing" }),
    };
  }

  try {
    const { flightNumber, date } = JSON.parse(event.body);

    if (!flightNumber || !date) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing flightNumber or date" }),
      };
    }

    // Datum Parsing & Logik für Endpoint-Wahl
    const inputDate = new Date(date);
    const today = new Date();
    // Zeitanteile nullen für reinen Datumsvergleich
    today.setHours(0, 0, 0, 0);
    // Wir setzen inputDate auf 00:00 UTC oder Local, um sicher zu vergleichen
    // Einfacherer Check: Ist das Input-Datum >= Heute (00:00)?
    // Wir geben etwas Puffer (gestern könnte auch noch 'active' sein bei Zeitzonen)
    
    // Zeitfenster berechnen (Start/Ende des gesuchten Tages)
    // AeroAPI erwartet ISO Strings oder Timestamps.
    // Wir nehmen Start des Tages bis Ende des Tages (+etwas Puffer)
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1); // +1 Tag

    const startStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const endStr = endDate.toISOString().split('T')[0];

    // ENTSCHEIDUNG: Welcher Endpoint?
    // Wenn Datum >= Heute-1 Tag -> Standard Endpoint (Scheduled/Enroute)
    // Wenn Datum älter -> History Endpoint
    const oneDayAgo = new Date(today);
    oneDayAgo.setDate(today.getDate() - 1);
    
    let apiUrl;
    const isRecent = inputDate >= oneDayAgo;

    if (isRecent) {
        // Aktuelle/Geplante Flüge
        // Parameter ?start=...&end=... filtern das Fenster
        apiUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${flightNumber}?start=${startStr}&end=${endStr}`;
    } else {
        // Historische Flüge
        apiUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${flightNumber}/history?start=${startStr}&end=${endStr}`;
    }

    console.log(`Fetching from: ${apiUrl}`); // Zum Debuggen in Netlify Logs

    const response = await fetch(apiUrl, {
      headers: {
        "x-apikey": API_KEY,
      },
    });

    if (!response.ok) {
        // Fehlerbehandlung
        const errText = await response.text();
        console.error("FlightAware Error:", errText);
        return {
            statusCode: response.status,
            headers,
            body: JSON.stringify({ error: `Provider Error: ${response.statusText}` }),
        };
    }

    const data = await response.json();

    // FlightAware gibt { flights: [...] } zurück.
    // Wir müssen den passenden Flug aus dem Array finden.
    // Da wir start/end gesetzt haben, sollten nur relevante Flüge kommen.
    
    if (!data.flights || data.flights.length === 0) {
       return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "Flight not found for this date." }),
      };
    }

    // Wir nehmen den ersten Treffer, der einen Status hat (oder einfach den ersten)
    // Manchmal liefert FlightAware "Cancelled" Flüge, die wollen wir ggf. filtern, 
    // aber fürs Logbuch ist "Cancelled" auch eine Info. Wir nehmen den ersten.
    const flight = data.flights[0];

    // Mapping auf unser Format
    // Achtung: scheduled_out vs actual_out
    const flightData = {
      flightNumber: flight.ident || flightNumber,
      airline: flight.operator || "", // ICAO Code der Airline
      aircraftType: flight.aircraft_type || "",
      registration: flight.registration || "",
      departure: flight.origin ? flight.origin.code : "",
      arrival: flight.destination ? flight.destination.code : "",
      // Bevorzuge Actual, sonst Scheduled
      depTime: flight.actual_out || flight.scheduled_out, 
      arrTime: flight.actual_in || flight.scheduled_in,
      status: flight.status
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(flightData),
    };

  } catch (error) {
    console.error("Server Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};