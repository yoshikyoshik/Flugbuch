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
    // === 🇩🇪 DACH-REGION & FERIENFLIEGER ===
    "DLH": { iata: "LH", name: "Lufthansa" },
    "OCN": { iata: "4Y", name: "Discover Airlines" }, // FlightAware nutzt OCN
    "EWG": { iata: "EW", name: "Eurowings" },
    "CFG": { iata: "DE", name: "Condor" },
    "TUI": { iata: "X3", name: "TUIfly" },
    "HLX": { iata: "X3", name: "TUIfly" }, // Historischer Code, oft noch in alten DBs
    "SDR": { iata: "SR", name: "Sundair" },
    "SWR": { iata: "LX", name: "Swiss International Air Lines" },
    "EDW": { iata: "WK", name: "Edelweiss Air" },
    "AUA": { iata: "OS", name: "Austrian Airlines" },
    "DLA": { iata: "EN", name: "Air Dolomiti" },
    "CXI": { iata: "XR", name: "Corendon Airlines Europe" },
    "CAI": { iata: "XC", name: "Corendon Airlines" },
    "SXS": { iata: "XQ", name: "SunExpress" },
    "FHY": { iata: "FH", name: "Freebird Airlines" },
    "TVS": { iata: "QS", name: "Smartwings" },

    // === 🇪🇺 EUROPA (Legacy & Low-Cost) ===
    "RYR": { iata: "FR", name: "Ryanair" },
    "EZY": { iata: "U2", name: "easyJet" },
    "WZZ": { iata: "W6", name: "Wizz Air" },
    "BAW": { iata: "BA", name: "British Airways" },
    "AFR": { iata: "AF", name: "Air France" },
    "KLM": { iata: "KL", name: "KLM Royal Dutch Airlines" },
    "IBE": { iata: "IB", name: "Iberia" },
    "AEA": { iata: "UX", name: "Air Europa" },
    "VLG": { iata: "VY", name: "Vueling" },
    "VOE": { iata: "V7", name: "Volotea" },
    "ITY": { iata: "AZ", name: "ITA Airways" }, 
    "TAP": { iata: "TP", name: "TAP Air Portugal" },
    "SAS": { iata: "SK", name: "SAS Scandinavian Airlines" },
    "NAX": { iata: "DY", name: "Norwegian Air Shuttle" },
    "FIN": { iata: "AY", name: "Finnair" },
    "ICE": { iata: "FI", name: "Icelandair" },
    "AEE": { iata: "A3", name: "Aegean Airlines" },
    "THY": { iata: "TK", name: "Turkish Airlines" },
    "PGT": { iata: "PC", name: "Pegasus Airlines" },
    "BEL": { iata: "SN", name: "Brussels Airlines" },
    "EIN": { iata: "EI", name: "Aer Lingus" },
    "LOT": { iata: "LO", name: "LOT Polish Airlines" },
    "ROT": { iata: "RO", name: "TAROM" },
    "AMC": { iata: "KM", name: "KM Malta Airlines" },
    "CTN": { iata: "OU", name: "Croatia Airlines" },
    "ASL": { iata: "JU", name: "Air Serbia" },
    "BTI": { iata: "BT", name: "airBaltic" },
    "CSW": { 
        iata: "GM", 
        name: "Chair Airlines", 
        logo: "https://images.kiwi.com/airlines/128x128/GM.png" 
    },
    "OAW": { iata: "2L", name: "Helvetic Airways" },
    "EZS": { iata: "DS", name: "easyJet Switzerland" },
    "EJU": { iata: "EC", name: "easyJet Europe" },
    "CFE": { iata: "BA", name: "BA CityFlyer" },

    // === 🇺🇸 NORDAMERIKA ===
    "AAL": { iata: "AA", name: "American Airlines" },
    "DAL": { iata: "DL", name: "Delta Air Lines" },
    "UAL": { iata: "UA", name: "United Airlines" },
    "SWA": { iata: "WN", name: "Southwest Airlines" },
    "JBU": { iata: "B6", name: "JetBlue Airways" },
    "ASA": { iata: "AS", name: "Alaska Airlines" },
    "NKS": { iata: "NK", name: "Spirit Airlines" },
    "FFT": { iata: "F9", name: 'Frontier Airlines' },
    "ACA": { iata: "AC", name: "Air Canada" },
    "WJA": { iata: "WS", name: "WestJet" },
    "TSC": { iata: "TS", name: "Air Transat" },
    "AMX": { iata: "AM", name: "Aeromexico" },

    // === 🌎 SÜD- & MITTELAMERIKA ===
    "LAN": { iata: "LA", name: "LATAM Airlines" },
    "CMP": { iata: "CM", name: "Copa Airlines" },
    "AVA": { iata: "AV", name: "Avianca" },
    "AZU": { iata: "AD", name: "Azul Brazilian Airlines" },
    "GLO": { iata: "G3", name: "GOL Linhas Aereas" },
    "ARG": { iata: "AR", name: "Aerolineas Argentinas" },

    // === 🐪 NAHER OSTEN ===
    "UAE": { iata: "EK", name: "Emirates" },
    "QTR": { iata: "QR", name: "Qatar Airways" },
    "ETD": { iata: "EY", name: "Etihad Airways" },
    "SVA": { iata: "SV", name: "Saudia" },
    "OMA": { iata: "WY", name: "Oman Air" },
    "RJA": { iata: "RJ", name: "Royal Jordanian" },
    "MEA": { iata: "ME", name: "Middle East Airlines" },
    "ELY": { iata: "LY", name: "El Al Israel Airlines" },
    "FDB": { iata: "FZ", name: "flydubai" },
    "KAC": { iata: "KU", name: "Kuwait Airways" },

    // === 🌏 ASIEN & PAZIFIK ===
    "SIA": { iata: "SQ", name: "Singapore Airlines" },
    "CPA": { iata: "CX", name: "Cathay Pacific" },
    "THA": { iata: "TG", name: "Thai Airways" },
    "MAS": { iata: "MH", name: "Malaysia Airlines" },
    "PAL": { iata: "PR", name: "Philippine Airlines" },
    "HVN": { iata: "VN", name: "Vietnam Airlines" },
    "GIA": { iata: "GA", name: "Garuda Indonesia" },
    "EVA": { iata: "BR", name: "EVA Air" },
    "CAL": { iata: "CI", name: "China Airlines" },
    "JAL": { iata: "JL", name: "Japan Airlines" },
    "ANA": { iata: "NH", name: "All Nippon Airways" },
    "KAL": { iata: "KE", name: "Korean Air" },
    "AAR": { iata: "OZ", name: "Asiana Airlines" },
    "CCA": { iata: "CA", name: "Air China" },
    "CSN": { iata: "CZ", name: "China Southern Airlines" },
    "CES": { iata: "MU", name: "China Eastern Airlines" },
    "CHH": { iata: "HU", name: "Hainan Airlines" },
    "AIC": { iata: "AI", name: "Air India" },
    "IGO": { iata: "6E", name: "IndiGo" },
    "AXM": { iata: "AK", name: "AirAsia" },
    "TGW": { iata: "TR", name: "Scoot" },

    // === 🦘 AUSTRALIEN & OZEANIEN ===
    "QFA": { iata: "QF", name: "Qantas" },
    "VOZ": { iata: "VA", name: "Virgin Australia" },
    "JST": { iata: "JQ", name: "Jetstar Airways" },
    "ANZ": { iata: "NZ", name: "Air New Zealand" },

    // === 🌍 AFRIKA ===
    "ETH": { iata: "ET", name: "Ethiopian Airlines" },
    "KQA": { iata: "KQ", name: "Kenya Airways" },
    "MSR": { iata: "MS", name: "EgyptAir" },
    "RAM": { iata: "AT", name: "Royal Air Maroc" },
    "SAA": { iata: "SA", name: "South African Airways" },

// --- 📦 CARGO & FRACHTFLIEGER ---
    "BCS": { 
        iata: "QY", 
        name: "EAT Leipzig (DHL)",
        // Zieht sich das offizielle, saubere DHL-Logo direkt von Wikipedia:
        logo: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ac/DHL_Logo.svg/250px-DHL_Logo.svg.png"
    },
    "BOX": { iata: "3T", name: "AeroLogic" },
    "TAY": { iata: "3V", name: "ASL Airlines Belgium" },
    "SRR": { iata: "S6", name: "Maersk Air Cargo" },

    // --- 🌍 WEITERE PASSAGIER-AIRLINES ---
    "GFA": { iata: "GF", name: "Gulf Air" },
    
    // --- 🛠️ SPEZIAL-FALLBACKS ---
    // Fängt alphanumerische Lufthansa-Rufzeichen ab, die fälschlicherweise als "LHX" ausgelesen werden
    "LHX": { iata: "LH", name: "Lufthansa" },

// --- 🌍 INTERNATIONALE AIRLINES ---
    "TAR": { iata: "TU", name: "Tunisair" },
    "LBT": { iata: "BJ", name: "Nouvelair Tunisie" },
    "KMM": { iata: "KM", name: "KM Malta Airlines" },
    "UZB": { iata: "HY", name: "Uzbekistan Airways" },
    
    // --- 🇪🇺 EUROPA & REGIONAL ---
    "EWL": { iata: "EW", name: "Eurowings Europe" },
    "BCY": { iata: "WX", name: "CityJet" },

    // --- 📦 CARGO & FRACHT (Ergänzung) ---
    "GEC": { iata: "LH", name: "Lufthansa Cargo" },
    
    // --- 🚁 POLIZEI & CORPORATE JETS (MUC/FRA Specials) ---
    "EDL": { 
        iata: "POL",
        name: "Polizei Bayern (Heli)", 
        // 100% ausfallsicherer Trick: Rendert ein echtes Helikopter-Emoji (🚁) als SVG-Grafik!
        logo: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🚁%3C/text%3E%3C/svg%3E"
    },
    "BFD": { 
        iata: "JET", // Dummy-Code
        name: "Bertelsmann Aviation", 
        logo: "https://cdn-icons-png.flaticon.com/128/3125/3125713.png" // Fallback auf ein Privatjet-Icon
    },

    // --- 🇫🇷 & 🇪🇺 EUROPA ---
    "HOP": { iata: "A5", name: "Air France Hop" },
    "TVF": { iata: "TO", name: "Transavia France" },
    "AWG": { iata: "A2", name: "Animawings" },

    // --- 🇷🇺 & 🌍 CIS / ZENTRALASIEN ---
    "AFL": { iata: "SU", name: "Aeroflot" },
    "PBD": { iata: "DP", name: "Pobeda" },
    "AZO": { iata: "A4", name: "Azimuth" },
    "BRU": { iata: "B2", name: "Belavia" },
    "AHY": { iata: "J2", name: "Azerbaijan Airlines" },
    "KZR": { iata: "KC", name: "Air Astana" },
    "SMR": { iata: "SZ", name: "Somon Air" },

    // --- 🐪 NAHER OSTEN & AFRIKA ---
    "KAC": { iata: "KU", name: "Kuwait Airways" },
    "JZR": { iata: "J9", name: "Jazeera Airways" },
    "KNE": { iata: "XY", name: "Flynas" },
    "FAD": { iata: "F3", name: "Flyadeal" },
    "IAW": { iata: "IA", name: "Iraqi Airways" },
    "IRA": { iata: "IR", name: "Iran Air" },

    // --- 🌏 ASIEN ---
    "PIA": { iata: "PK", name: "Pakistan International Airlines" },
    "AXB": { iata: "IX", name: "Air India Express" },
    "SEJ": { iata: "SG", name: "SpiceJet" },
    "UBG": { iata: "BS", name: "US-Bangla Airlines" },

    // --- 📦 CARGO & FRACHT ---
    "SIF": { iata: "7L", name: "Silk Way West Airlines" },
    "KZU": { iata: "GO", name: "ULS Airlines Cargo" },
    "MFX": { iata: "C6", name: "My Freighter / Centrum Air" }

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
