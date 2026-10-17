// netlify/functions/fetch-aircraft-facts.js

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const code = (event.queryStringParameters?.code || "").trim().toUpperCase();
  if (!code || code.length < 2) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing aircraft code" }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY not configured" }) };
  }

  const prompt = `Du bist eine Luftfahrt-Datenbank. Liefere die technischen Daten für den Flugzeugtyp mit dem ICAO/IATA-Code oder Namen "${code}".
Falls "${code}" kein echtes Flugzeug ist, antworte mit {"found": false}.
Andernfalls antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt in diesem exakten Schema (ohne Markdown-Backticks):
{
  "found": true,
  "code": "${code}",
  "name": "Vollständiger Name (z.B. Embraer E195-E2)",
  "manufacturer": "Hersteller (z.B. Embraer)",
  "engine": "Anzahl & Triebwerkstyp (z.B. 2× PW1900G Geared Turbofan)",
  "speed": "Reisegeschwindigkeit in km/h und Mach (z.B. 876 km/h (Mach 0.82))",
  "range": "Maximale Reichweite in km (z.B. 4.815 km)",
  "length": "Länge in m (z.B. 41,5 m)",
  "wingspan": "Spannweite in m (z.B. 35,1 m)",
  "alt": "Max. Reiseflughöhe in m (z.B. 12.500 m)",
  "weight": "Max. Startgewicht MTOW in kg (z.B. 62.000 kg)",
  "seats": "Typische Passagierkapazität & Sitzlayout (z.B. 120–146 (2-2, kein Mittelsitz))",
  "wiki": "Passende deutsche Wikipedia-URL zum Flugzeugtyp"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API HTTP ${response.status}`);
    }

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(rawText);

    if (!parsed.found) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Aircraft not found" }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    console.error("Gemini Aircraft Lookup Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};