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

const cacheAndSaveAirport = async (airport) => {
  if (
    airport &&
    (!airportData[airport.code] || !airportData[airport.code].country_code)
  ) {
    airportData[airport.code] = {
      name: airport.name,
      lat: airport.lat,
      lon: airport.lon,
      city: airport.city,
      country_code: airport.country_code,
    };
    const { error } = await supabaseClient.from("airports").upsert({
      iata: airport.code,
      name: airport.name,
      lat: airport.lat,
      lon: airport.lon,
      city: airport.city,
      country_code: airport.country_code,
    });
    if (error) console.error("Fehler beim Speichern des Flughafens:", error);
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

window.fetchExternalAirport = async function (input) {
  const normalizedInput = input.trim();
  if (normalizedInput.length < 3) return [];
  
  /*const url = `https://aesthetic-strudel-ecfe50.netlify.app/.netlify/functions/fetch-airport?query=${encodeURIComponent(normalizedInput)}`;
  */
  
  const url = `${API_BASE_URL}/.netlify/functions/fetch-airport?query=${encodeURIComponent(normalizedInput)}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const apiData = await response.json();
    return apiData
      .map((result) => {
        if (!result.iata && !result.icao) return null;
        return {
          code: result.iata || result.icao,
          name: result.name,
          city: result.city || "",
          lat: parseFloat(result.latitude),
          lon: parseFloat(result.longitude),
          country_code: result.country || null,
        };
      })
      .filter((airport) => airport !== null);
  } catch (error) {
    console.error("Netzwerkfehler (Fetch Airport):", error);
    return [];
  }
};

// supabase.js

async function fetchAirlineName(iataCode) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/.netlify/functions/fetch-airline-details?iata_code=${iataCode}`
    );
    if (!response.ok) return { name: iataCode, logo: null };
    
    const json = await response.json();
    const data = json.data; // Das Array aus deiner Netlify Function

    if (data && data.length > 0) {
      const airline = data[0];
      
      // ✅ ANPASSUNG FÜR API NINJAS:
      // Wir suchen das beste Logo aus. Priorität: Volles Logo -> Brandmark -> Tail
      const logo = airline.logo_url || airline.brandmark_url || airline.tail_logo_url || null;

      // API Ninjas liefert den Namen einfach als "name"
      return { 
          name: airline.name || iataCode,
          logo: logo
      };
    }
    return { name: iataCode, logo: null };
  } catch (error) {
    console.error("Fehler beim Laden der Airline:", error);
    return { name: iataCode, logo: null };
  }
}
