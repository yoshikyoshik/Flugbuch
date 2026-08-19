// =================================================================
// SUPABASE & API CLIENT
// =================================================================

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getFlights() {
  // 1. Änderung im Select: trips(name) dazu
  // 2. Empfehlung: .order() dazu, damit die Liste sortiert ist
  const { data, error } = await supabaseClient
    .from("flights")
    .select("*, trips(name)") 
    .order("date", { ascending: false }); 

  if (error) {
    console.error("Fehler beim Laden der Flüge:", error);
    return [];
  }

  // Dein Mapping ist wichtig für deine App-Logik.
  // Durch den Spread-Operator (...flight) wird das neue 'trips'-Objekt 
  // automatisch mit übernommen.
  return data.map((flight) => ({ ...flight, id: flight.flight_id }));
}

async function uploadFlightPhotos(filesToUpload) {
  if (!filesToUpload || filesToUpload.length === 0) return [];
  const photoUrls = [];
  for (const file of filesToUpload) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const errorMsg = (
        getTranslation("messages.uploadLimitSize") || "Datei übersprungen"
      ).replace("{fileName}", file.name);
      sshowMessage(
        getTranslation("toast.uploadLimitTitle") || "Upload-Limit", 
        errorMsg, 
        "error"
      );
      continue;
    }
    const filePath = `${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabaseClient.storage
      .from("flight-photos")
      .upload(filePath, file);
    if (uploadError) {
      console.error("Fehler beim Hochladen der Datei:", uploadError);
      showMessage(
        getTranslation("toast.uploadErrorTitle") || "Upload-Fehler",
        (getTranslation("messages.photoUploadFailed") || "Foto {fileName} konnte nicht hochgeladen werden.").replace("{fileName}", file.name),
        "error"
      );
      continue;
    }
    const { data } = supabaseClient.storage
      .from("flight-photos")
      .getPublicUrl(filePath);
    if (data.publicUrl) photoUrls.push(data.publicUrl);
  }
  return photoUrls;
}

window.cacheAndSaveAirport = async (airport) => {
  if (!airport || !airport.code) return;

  // Sicherstellen, dass das globale Objekt existiert
  if (!window.airportData) window.airportData = {};

  const cached = window.airportData[airport.code];

  // Der smarte Türsteher
  const isNewOrIncomplete = 
      !cached || 
      !cached.country_code || 
      (!cached.website && airport.website);

  if (isNewOrIncomplete) {
    // 1. Lokalen Cache updaten
    window.airportData[airport.code] = {
      name: airport.name || (cached ? cached.name : null),
      lat: airport.lat || (cached ? cached.lat : null),
      lon: airport.lon || (cached ? cached.lon : null),
      city: airport.city || (cached ? cached.city : null),
      country_code: airport.country_code || (cached ? cached.country_code : null),
      website: airport.website || (cached ? cached.website : null)
    };

    // 2. Supabase updaten (Upsert)
    const { error } = await supabaseClient.from("airports").upsert({
      iata: airport.code,
      name: window.airportData[airport.code].name,
      lat: window.airportData[airport.code].lat,
      lon: window.airportData[airport.code].lon,
      city: window.airportData[airport.code].city,
      country_code: window.airportData[airport.code].country_code,
      website: window.airportData[airport.code].website
    });

    if (error) {
        console.error("Fehler beim Speichern des Flughafens in Supabase:", error);
    } else {
        console.log(`✅ Supabase Update erfolgreich: ${airport.code}`);
    }
  } else {
    // 🚀 NEU: So siehst du in der Konsole, dass er NICHTS unnötig speichert!
    console.log(`ℹ️ Supabase Update übersprungen: ${airport.code} ist lokal bereits aktuell.`);
  }
};

async function migrateAndLoadAirports() {
  if (localStorage.getItem("airports_migrated") !== "true") {
    console.log(
      "Starte einmalige Migration der Flughäfen von localStorage nach Supabase..."
    );
    const cachedAirportsJSON = localStorage.getItem("cachedAirports");
    const cachedAirports = cachedAirportsJSON
      ? JSON.parse(cachedAirportsJSON)
      : {};
    const airportsToInsert = Object.keys(cachedAirports).map((iata) => ({
      iata: iata,
      name: cachedAirports[iata].name,
      lat: cachedAirports[iata].lat,
      lon: cachedAirports[iata].lon,
    }));
    if (airportsToInsert.length > 0) {
      const { error } = await supabaseClient
        .from("airports")
        .insert(airportsToInsert);
      if (error) {
        console.error("Fehler bei der Flughafen-Migration:", error);
      } else {
        console.log("Flughafen-Migration erfolgreich!");
        localStorage.setItem("airports_migrated", "true");
        localStorage.removeItem("cachedAirports");
      }
    } else {
      localStorage.setItem("airports_migrated", "true");
    }
  }
  const { data, error } = await supabaseClient.from("airports").select("*");
  if (error) {
    console.error("Fehler beim Laden der Flughäfen aus Supabase:", error);
    return;
  }
  // Wandle die geladenen Daten in das Format um, das 'airportData' erwartet
  data.forEach((airport) => {
    airportData[airport.iata] = {
      name: airport.name,
      lat: airport.lat,
      lon: airport.lon,
      city: airport.city,
      country_code: airport.country_code,
    };
  });
  console.log(`${data.length} Flughäfen aus der Datenbank geladen.`);
}

async function claimExistingFlights() {
  if (localStorage.getItem("flights_claimed") === "true") return;
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (user) {
    const { error } = await supabaseClient
      .from("flights")
      .update({ user_id: user.id })
      .is("user_id", null);
    if (!error) localStorage.setItem("flights_claimed", "true");
  }
}

// ==========================================
// 🚀 NEU: KOSTENLOSE FLUGHAFEN-SUCHE (Bye, API-Ninjas!)
// ==========================================
window.fetchExternalAirport = async function (input) {
  const normalizedInput = input.trim();
  if (normalizedInput.length < 3) return [];
  
  try {
    // Wir nutzen die blitzschnelle und komplett kostenlose Travel-API von Kiwi.com
    const response = await fetch(`https://api.skypicker.com/locations?term=${encodeURIComponent(normalizedInput)}&locale=de-DE&location_types=airport&limit=10`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data.locations) return [];

    return data.locations.map((result) => {
      return {
        code: result.code, // IATA Code
        name: result.name,
        city: result.city ? result.city.name : "",
        lat: result.location.lat,
        lon: result.location.lon,
        country_code: result.city && result.city.country ? result.city.country.id : null,
      };
    });
  } catch (error) {
    console.error("Netzwerkfehler (Fetch Airport):", error);
    return [];
  }
};

// ==========================================
// 🚀 NEU: AIRLINE LOGOS VIA CDN & LOKALES MAPPING
// ==========================================
// Übersetzt die FlightAware ICAO-Codes in bekannte IATA-Codes für Logos und saubere Flugnummern!
window.AIRLINE_MAPPING = {
    "DLH": { iata: "LH", name: "Lufthansa" },
    "SWR": { iata: "LX", name: "Swiss International Air Lines" },
    "AUA": { iata: "OS", name: "Austrian Airlines" },
    "EWG": { iata: "EW", name: "Eurowings" },
    "OCN": { iata: "4Y", name: "Discover Airlines" },
    "CFG": { iata: "DE", name: "Condor" },
    "TUI": { iata: "X3", name: "TUIfly" },
    "HLX": { iata: "X3", name: "TUIfly" },
    "SDR": { iata: "SR", name: "Sundair" },
    "SXS": { iata: "XQ", name: "SunExpress" },
    "RYR": { iata: "FR", name: "Ryanair" },
    "EZY": { iata: "U2", name: "easyJet" },
    "UAE": { iata: "EK", name: "Emirates" },
    "QTR": { iata: "QR", name: "Qatar Airways" },
    "THY": { iata: "TK", name: "Turkish Airlines" },
    "PGT": { iata: "PC", name: "Pegasus Airlines" },
    "CAI": { iata: "XC", name: "Corendon Airlines" },
    "AFR": { iata: "AF", name: "Air France" },
    "KLM": { iata: "KL", name: "KLM Royal Dutch Airlines" },
    "BAW": { iata: "BA", name: "British Airways" },
    "SAS": { iata: "SK", name: "SAS Scandinavian Airlines" },
    "TAP": { iata: "TP", name: "TAP Air Portugal" },
    "IBE": { iata: "IB", name: "Iberia" },
    "VLG": { iata: "VY", name: "Vueling" },
    "AEE": { iata: "A3", name: "Aegean Airlines" },
    "WZZ": { iata: "W6", name: "Wizz Air" },
    "DAL": { iata: "DL", name: "Delta Air Lines" },
    "UAL": { iata: "UA", name: "United Airlines" },
    "AAL": { iata: "AA", name: "American Airlines" },
    "ACA": { iata: "AC", name: "Air Canada" },
    "SIA": { iata: "SQ", name: "Singapore Airlines" },
    "ANA": { iata: "NH", name: "All Nippon Airways" },
    "JAL": { iata: "JL", name: "Japan Airlines" },
    "QFA": { iata: "QF", name: "Qantas" }
};

async function fetchAirlineName(icaoCode) {
  if (!icaoCode) return { name: "", logo: null, iata: "" };
  
  const cleanCode = icaoCode.trim().toUpperCase();
  let iata = cleanCode.length >= 2 ? cleanCode.substring(0, 2) : cleanCode;
  let name = cleanCode;

  // 🚀 Wenn der Code 3-stellig ist und wir ihn im Lexikon haben, übersetzen wir ihn!
  if (cleanCode.length === 3 && window.AIRLINE_MAPPING && window.AIRLINE_MAPPING[cleanCode]) {
      iata = window.AIRLINE_MAPPING[cleanCode].iata;
      name = window.AIRLINE_MAPPING[cleanCode].name;
  }
  
  return {
      name: name,
      iata: iata, // Wir geben den echten IATA-Code mit zurück!
      logo: `https://images.kiwi.com/airlines/128x128/${iata}.png`
  };
}
