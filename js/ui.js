// =================================================================
// UI & RENDERING
// =================================================================

function showMessage(title, message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  let typeClass = "toast-info";
  if (type === "success") typeClass = "toast-success";
  if (type === "error") typeClass = "toast-error";
  if (type === "easter-egg") typeClass = "toast-easteregg";
  toast.className = `toast ${typeClass}`;
  toast.innerHTML = `<strong class="block">${title}</strong> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

// MODALS
// MODALS
function openInfoModal() {
  const modal = document.getElementById("info-modal");
  modal.style.zIndex = '250'; // 🚀 BUGHUNT FIX: Hebt das Info-Modal sicher über das Logbuch (z-200)!
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}
function closeInfoModal() {
  document.getElementById("info-modal").classList.add("hidden");
  document.getElementById("info-modal").classList.remove("flex");
  document.getElementById("info-modal-title").textContent = getTranslation("modal.loadingTitle") || "Loading...";
  document.getElementById("info-modal-content").innerHTML = `<p>${getTranslation("modal.loadingBody") || "Loading details..."}</p>`;
}

function openPremiumModal(featureKey = null) {
  const modal = document.getElementById("premium-modal");
  const imgContainer = document.getElementById("premium-modal-image-container");
  const imgElement = document.getElementById("premium-modal-image");
  const titleElement = document.getElementById("modal-title");
  
  // Titel & Bild Logik (bleibt gleich)
  let titleText = getTranslation("premium.title") || "Unlock Full Potential 🚀";
  if (featureKey && premiumFeatureImages[featureKey]) {
    imgElement.src = premiumFeatureImages[featureKey];
    imgContainer.classList.remove("hidden");
    if (featureKey === "globe") titleText = getTranslation("premium.titleGlobe");
    if (featureKey === "print") titleText = getTranslation("premium.titlePrint");
  } else {
    imgContainer.classList.add("hidden");
  }
  if (titleElement) titleElement.textContent = titleText;

  // --- 🛡️ NEU: DOPPEL-ABO SCHUTZ ---
  
  const isNative = typeof isNativeApp === 'function' ? isNativeApp() : (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform());
  const restoreContainer = document.getElementById("restore-container");
  const footerContainer = document.getElementById("buy-pro-btn")?.closest("div.flex-col"); // Buttons
  const planSwitcher = document.getElementById("plan-monthly-btn")?.closest(".px-4.pt-5.pb-2"); // Toggle
  const nativeHint = document.getElementById("premium-native-hint"); // Hinweis-Text Container

  // Default-Zustand: Alles anzeigen
  if (footerContainer) footerContainer.classList.remove("hidden");
  if (planSwitcher) planSwitcher.classList.remove("hidden");
  if (restoreContainer) restoreContainer.classList.add("hidden"); // Standardmäßig versteckt
  if (nativeHint) nativeHint.classList.add("hidden");

  // Status aus Supabase prüfen (liegt global in 'user' Objekt in app.js vor, oder wir holen es neu)
  // Wir nutzen hier eine globale Annahme, dass 'user' existiert. Besser: wir prüfen currentUserSubscription
  
  let subscriptionSource = "unknown";
  // Wir greifen auf das User-Objekt zu (Trick: Wir holen es aus dem LocalStorage oder app.js Scope)
  // Da wir in ui.js sind, nehmen wir an, dass wir Zugriff auf das User-Objekt haben oder es uns holen müssen.
  // Einfacher: Wir schauen auf die Metadaten, wenn sie global verfügbar wären.
  // Für jetzt nehmen wir an, app.js hat 'currentUserSubscriptionSource' global gesetzt (das müssen wir noch tun!)
  
  // HINWEIS: Du musst in app.js eine globale Variable 'currentUserSubscriptionSource' einführen!
  
  if (currentUserSubscription === "pro" && typeof currentUserSubscriptionSource !== 'undefined') {
      
      // FALL 1: User hat Stripe Abo, ist aber in der App
      if (currentUserSubscriptionSource === 'stripe' && isNative) {
          // ALLES VERSTECKEN!
          if (footerContainer) footerContainer.classList.add("hidden");
          if (planSwitcher) planSwitcher.classList.add("hidden");
          
          // HINWEIS ANZEIGEN
          if (!nativeHint) {
               // Element erstellen falls nicht da (wie vorheriger Code)
          }
          if (nativeHint) {
              nativeHint.classList.remove("hidden");
              nativeHint.innerHTML = `
                <p class="text-red-500 font-bold">${getTranslation("premium.stripeConflictTitle") || "Du hast bereits ein aktives Web-Abo (Stripe)."}</p>
                <p>${getTranslation("premium.stripeConflictDesc") || "Bitte verwalte dein Abo auf aviosphere.com."}</p>
              `;
          }
          return; // Modal fertig, Abbruch
      }
      
      // FALL 2: User hat Google Abo, ist aber im Web
      if (currentUserSubscriptionSource === 'google_play' && !isNative) {
           // ALLES VERSTECKEN
          if (footerContainer) footerContainer.classList.add("hidden");
          if (planSwitcher) planSwitcher.classList.add("hidden");
          
          if (nativeHint) {
              nativeHint.classList.remove("hidden");
              nativeHint.innerHTML = nativeHint.innerHTML = `
                <p class="text-indigo-600 font-bold">${getTranslation("premium.googlePlayConflictTitle") || "Du hast ein aktives App-Abo (Google Play)."}</p>
                <p>${getTranslation("premium.googlePlayConflictDesc") || "Bitte verwalte dein Abo in der Android App."}</p>
              `;
          }
          return;
      }
  }

  // --- NORMALE LOGIK (Restore Button Logik) ---
  if (restoreContainer) {
      if (isNative) {
          restoreContainer.classList.remove("hidden");
      } else {
          restoreContainer.classList.add("hidden");
      }
  }

  modal.classList.remove("hidden");
  switchPlan("yearly");
}
function closePremiumModal() {
  document.getElementById("premium-modal").classList.add("hidden");

  // 🚀 BUGHUNT FIX: UI sofort updaten, falls der Kauf erfolgreich war!
  if (typeof currentUserSubscription !== 'undefined' && currentUserSubscription === "pro") {
      
      // 1. Scanner-Lock auf der Startseite absichern
      const scannerLock = document.getElementById("scanner-lock");
      if (scannerLock) scannerLock.classList.add("hidden");
      
      // 2. Das Logbuch sofort neu zeichnen, um die nervigen 🔒 zu entfernen
      const logbookContainer = document.getElementById("analytics-logbook-container");
      if (logbookContainer && !logbookContainer.classList.contains("hidden")) {
          let currentView = "aircraftType"; // Standard-Fall
          
          if (document.getElementById("logbook-view-airline")?.classList.contains("active")) {
              currentView = "airline";
          } else if (document.getElementById("logbook-view-airport")?.classList.contains("active")) {
              currentView = "airport";
          } else if (document.getElementById("logbook-view-registration")?.classList.contains("active")) {
              currentView = "registration";
          }
          
          // Zeichnet die Liste mit den echten Info-Buttons statt der Schlösser neu!
          if (typeof renderLogbookView === 'function') {
              renderLogbookView(currentView);
          }
      }
  }
}

// DETAILS
async function showAirportDetails(iataCode, silentCache = false) {
  const contentContainer = document.getElementById("info-modal-content");

  // Sicherstellen, dass der Cache existiert
  if (!window.airportData) window.airportData = {};
  const cachedAirport = window.airportData[iataCode];

  // =========================================================
  // 1. SOFORTIGES RENDERN AUS DEM CACHE (für maximale Speed)
  // =========================================================
  if (cachedAirport && cachedAirport.country_code) {
      if (!silentCache) {
          openInfoModal();
          document.getElementById("info-modal-title").textContent = getTranslation("modalDetails.airportTitle").replace("{key}", iataCode);
          
          let content = `
              <p><strong>${getTranslation("modalDetails.airportName")}</strong> ${cachedAirport.name || "N/A"}</p>
              <p><strong>${getTranslation("modalDetails.airportLocation")}</strong> ${cachedAirport.city || "N/A"}, ${cachedAirport.country_code || "N/A"}</p>
              <p><strong>${getTranslation("modalDetails.airportCoords")}</strong> Lat: ${cachedAirport.lat || "N/A"}, Lng: ${cachedAirport.lon || "N/A"}</p>
          `;

          // Wenn wir eine Website haben, direkt mit anzeigen!
          if (cachedAirport.website) {
              content += `<p class="mt-2"><a href="${cachedAirport.website}" target="_blank" class="text-indigo-500 hover:underline">${getTranslation("modalDetails.airportWebsite") || "Webseite öffnen"}</a></p>`;
          }

          if (iataCode.length === 4) {
              content += `<hr class="my-2 dark:border-gray-600"><p class="text-xs italic">${getTranslation("logbook.icaoInfoNote")}</p>`;
          }

          contentContainer.innerHTML = content;
          console.log(`ℹ️ Lade Basis-Daten für ${iataCode} aus dem blitzschnellen Cache!`);
      }

      // 🚀 BUGHUNT FIX: Die "Altlasten"-Prüfung!
      // Wenn der Cache schon eine Website hat ODER wir in dieser App-Sitzung schon die API gefragt haben, beenden wir.
      if (cachedAirport.website || cachedAirport.api_checked || iataCode.length === 4) {
          return; 
      }
      
      // Ansonsten setzen wir den "Habe-API-gefragt"-Haken und lassen das Script unten weiterlaufen,
      // um die Website im Hintergrund zu suchen!
      cachedAirport.api_checked = true;
  } else {
      // =========================================================
      // 2. LADEBILDSCHIRM (Wenn wir den Flughafen noch gar nicht kennen)
      // =========================================================
      if (!silentCache) {
          openInfoModal();
          document.getElementById("info-modal-title").textContent = getTranslation("modalDetails.airportTitle").replace("{key}", iataCode);
          contentContainer.innerHTML = `<p>${getTranslation("modalDetails.loading")}</p>`;
      }
  }

  // =========================================================
  // 3. API ABRUF (Für völlig Neue ODER für Alte ohne Webseite)
  // =========================================================
  try {
      // Dein normaler GFL Endpoint
      const response = await fetch(`https://aesthetic-strudel-ecfe50.netlify.app/.netlify/functions/fetch-airport-details?code=${iataCode}`);
      if (!response.ok) throw new Error("Netzwerk-Antwort war nicht OK");
      
      const result = await response.json();

      if (result.data && result.data.length > 0) {
          const airport = result.data[0];

          // Speichern & Cache aktualisieren (unser neuer Türsteher aus der supabase.js regelt das!)
          if (typeof cacheAndSaveAirport === 'function') {
              await cacheAndSaveAirport({
                  code: iataCode,
                  name: airport.name,
                  lat: airport.lat,
                  lon: airport.lng,
                  city: airport.city,
                  country_code: airport.country_code,
                  website: airport.website
              });
          }

          // 🚀 Das "Pop-In" Update: 
          // Wenn das Fenster noch offen ist, schieben wir die neue Webseite Live in die Ansicht!
          if (!silentCache) {
              const updatedCache = window.airportData[iataCode];
              let newContent = `
                  <p><strong>${getTranslation("modalDetails.airportName")}</strong> ${updatedCache.name || "N/A"}</p>
                  <p><strong>${getTranslation("modalDetails.airportLocation")}</strong> ${updatedCache.city || "N/A"}, ${updatedCache.country_code || "N/A"}</p>
                  <p><strong>${getTranslation("modalDetails.airportCoords")}</strong> Lat: ${updatedCache.lat || "N/A"}, Lng: ${updatedCache.lon || "N/A"}</p>
              `;
              
              if (updatedCache.website) {
                  newContent += `<p class="mt-2"><a href="${updatedCache.website}" target="_blank" class="text-indigo-500 hover:underline">${getTranslation("modalDetails.airportWebsite") || "Webseite öffnen"}</a></p>`;
              }
              
              document.getElementById("info-modal-content").innerHTML = newContent;
          }
      } else if (!silentCache && !cachedAirport) {
          // Nur meckern, wenn wir nicht schon Cache-Daten anzeigen
          document.getElementById("info-modal-content").innerHTML = `<p>${getTranslation("modalDetails.airportNoDetails")}</p>`;
      }
  } catch (error) {
      console.error("Fehler beim Abrufen der Flughafen-Details:", error);
      if (!silentCache && !cachedAirport) {
         document.getElementById("info-modal-content").innerHTML = `<p>${getTranslation("modalDetails.airportError")}</p>`;
      }
  }
}

async function showAirlineDetails(iataCode) {
    openInfoModal();
    document.getElementById("info-modal-title").textContent = getTranslation("modalDetails.airlineTitle").replace("{key}", iataCode);
    const contentContainer = document.getElementById("info-modal-content");
    contentContainer.innerHTML = `<p>${getTranslation("modalDetails.loading")}</p>`;

    try {
        const response = await fetch(`https://aesthetic-strudel-ecfe50.netlify.app/.netlify/functions/fetch-airline-details?iata_code=${iataCode}`);
        if (!response.ok) throw new Error("Netzwerk-Antwort war nicht OK");
        
        const result = await response.json();

        if (result.data && result.data.length > 0) {
            let content = "";
            const notAvailable = getTranslation("modalDetails.notAvailable");

            result.data.forEach((airline, index) => {
                if (index > 0) content += '<hr class="my-4 dark:border-gray-700">';

                // --- 1. LOGOS (Wie vorher) ---
                let imagesHtml = "";
                if (airline.logo_url || airline.tail_logo_url || airline.brandmark_url) {
                    imagesHtml = '<div class="flex flex-wrap gap-4 mb-4 justify-center items-center bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">';
                    const mainLogo = airline.logo_url || airline.brandmark_url;
                    if (mainLogo) {
                        imagesHtml += `<img src="${mainLogo}" alt="${airline.name} Logo" class="h-12 md:h-20 object-contain bg-white rounded-md p-1 shadow-sm" onerror="this.style.display='none'">`;
                    }
                    if (airline.tail_logo_url) {
                        imagesHtml += `<img src="${airline.tail_logo_url}" alt="${airline.name} Tail" class="h-12 md:h-20 object-contain bg-white rounded-md p-1 shadow-sm" onerror="this.style.display='none'">`;
                    }
                    imagesHtml += '</div>';
                }

                // --- 2. FLOTTEN-DETAILS (NEU) ---
                let fleetSize = 0;
                let fleetDetailsString = "";
                
                if (airline.fleet) {
                    // A) Gesamtgröße berechnen
                    // Falls die API explizit "total" liefert, nehmen wir das. Sonst summieren wir.
                    if (airline.fleet.total) {
                        fleetSize = airline.fleet.total;
                    } else {
                        fleetSize = Object.values(airline.fleet).reduce((a, b) => a + b, 0);
                    }

                    // B) Detail-Liste erstellen (ohne den Key "total")
                    const details = [];
                    for (const [type, count] of Object.entries(airline.fleet)) {
                        if (type.toLowerCase() !== 'total') {
                            details.push(`${type}: ${count}`);
                        }
                    }
                    // Verbinde mit Kommas (z.B. "A320: 5, B737: 2")
                    fleetDetailsString = details.join(", ");
                }
                
                const fleetDisplay = fleetSize > 0 ? fleetSize : notAvailable;

                // --- 3. WEBSITE FIX (Wie vorher) ---
                let websiteUrl = airline.website;
                if (websiteUrl && !websiteUrl.startsWith('http')) {
                    websiteUrl = 'https://' + websiteUrl;
                }

                // --- 4. HTML ZUSAMMENBAUEN (ERWEITERT) ---
                content += `
                    ${imagesHtml}
                    
                    <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        
                        <div class="col-span-2 sm:col-span-1">
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">${getTranslation("modalDetails.airlineName")}</p> 
                            <p class="font-medium text-gray-900 dark:text-white">${airline.name || notAvailable}</p>
                        </div>

                        <div class="col-span-2 sm:col-span-1">
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">IATA / ICAO</p> 
                            <p class="font-medium text-gray-900 dark:text-white">${airline.iata || "?"} / ${airline.icao || "?"}</p>
                        </div>
                        
                        <div class="col-span-2 sm:col-span-1">
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">${getTranslation("modalDetails.airlineCountry")}</p> 
                            <p class="font-medium text-gray-900 dark:text-white">${airline.country || notAvailable}</p>
                        </div>

                        <div class="col-span-2 sm:col-span-1">
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">${getTranslation("modalDetails.airlineBase")}</p> 
                            <p class="font-medium text-gray-900 dark:text-white">${airline.base || notAvailable}</p>
                        </div>

                        <div class="col-span-2 sm:col-span-1">
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">${getTranslation("modalDetails.airlineYear")}</p> 
                            <p class="font-medium text-gray-900 dark:text-white">${airline.year_created || notAvailable}</p>
                        </div>
                        
                        <div class="col-span-2 sm:col-span-1">
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">${getTranslation("modalDetails.airlineFleetSize")}</p> 
                            <p class="font-medium text-gray-900 dark:text-white">${fleetDisplay} <span class="text-xs font-normal text-gray-500">(${getTranslation("stats.total") || "Total"})</span>
                        </div>

                        ${fleetDetailsString ? `
                        <div class="col-span-2 mt-1 bg-gray-50 dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-700">
                            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-1">${getTranslation("modalDetails.airlineFleetDetail")}</p>
                            <p class="text-xs font-mono text-gray-700 dark:text-gray-300 break-words leading-relaxed">
                                ${fleetDetailsString}
                            </p>
                        </div>
                        ` : ''}

                        ${websiteUrl ? `
                        <div class="col-span-2 text-center mt-3">
                            <a href="${websiteUrl}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded-full text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900 transition">
                                🌐 ${getTranslation("modalDetails.airlineWebsite")}
                            </a>
                        </div>` : ''}
                    </div>
                `;
            });

            contentContainer.innerHTML = content;
        } else {
            contentContainer.innerHTML = `<p>${getTranslation("modalDetails.airlineNoDetails")}</p>`;
        }
    } catch (error) {
        console.error("Fehler beim Abrufen der Airline-Details:", error);
        contentContainer.innerHTML = `<p>${getTranslation("modalDetails.airlineError")}</p>`;
    }
}

async function showAircraftDetails(modelCode) {
  openInfoModal();
  document.getElementById("info-modal-title").textContent = getTranslation(
    "logbook.detailsTitleAircraft"
  ).replace("{key}", modelCode);
  const contentContainer = document.getElementById("info-modal-content");
  contentContainer.innerHTML = `<p>${getTranslation("modalDetails.loading")}</p>`;

  // 🚀 Mapping-Logik
  let mappedModel = modelCode;
  if (typeof window.normalizeAircraftCode === 'function') {
      mappedModel = window.normalizeAircraftCode(modelCode);
      console.log(`🔀 Mapping-Check: Aus rohem Code "${modelCode}" wurde "${mappedModel}"`);
  } else {
      console.warn("⚠️ ACHTUNG: window.normalizeAircraftCode wurde nicht gefunden!");
  }

  try {
    const response = await fetch(
      `https://aesthetic-strudel-ecfe50.netlify.app/.netlify/functions/fetch-aircraft-details?model=${mappedModel}`
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Netzwerk-Antwort war nicht OK");
    }
    const data = await response.json(); // data ist ein Array [...]

    if (data && data.length > 0) {
      const aircraft = data[0];

      // Umrechnungen (Imperial zu Metrisch)
      const speedKmh = aircraft.max_speed_knots ? Math.round(aircraft.max_speed_knots * 1.852) + ' km/h' : 'N/A';
      const rangeKm = aircraft.range_nautical_miles ? Math.round(aircraft.range_nautical_miles * 1.852).toLocaleString('de-DE') + ' km' : 'N/A';
      const weightKg = aircraft.gross_weight_lbs ? Math.round(aircraft.gross_weight_lbs * 0.453592).toLocaleString('de-DE') + ' kg' : 'N/A';
      const ceilingM = aircraft.ceiling_ft ? Math.round(aircraft.ceiling_ft * 0.3048).toLocaleString('de-DE') + ' m' : 'N/A';
      const lengthM = aircraft.length_ft ? (aircraft.length_ft * 0.3048).toFixed(1) + ' m' : 'N/A';
      const heightM = aircraft.height_ft ? (aircraft.height_ft * 0.3048).toFixed(1) + ' m' : 'N/A';
      const wingspanM = aircraft.wing_span_ft ? (aircraft.wing_span_ft * 0.3048).toFixed(1) + ' m' : 'N/A';

      // 🚀 NEU: Komplettes HTML inklusive der Varianten-Anzeige am Ende
      // 🚀 BUG FIX: EXPLICIT DARK MODE COLORS FOR PROPER CONTRAST
      contentContainer.innerHTML = `
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-surface-container-low dark:bg-slate-800 p-3 rounded-2xl transition-colors">
              <p class="text-[10px] uppercase tracking-wider text-on-surface/50 dark:text-slate-400 font-bold mb-1">${getTranslation("aircraftFacts.model")}</p>
              <p class="font-bold text-sm text-on-surface dark:text-slate-100">${aircraft.model || mappedModel}</p>
            </div>
            <div class="bg-surface-container-low dark:bg-slate-800 p-3 rounded-2xl transition-colors">
              <p class="text-[10px] uppercase tracking-wider text-on-surface/50 dark:text-slate-400 font-bold mb-1">${getTranslation("aircraftFacts.manufacturer")}</p>
              <p class="font-bold text-sm text-on-surface dark:text-slate-100">${aircraft.manufacturer || getTranslation("aircraftFacts.notAvailable")}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="bg-surface-container-low dark:bg-slate-800 p-3 rounded-2xl transition-colors">
              <p class="text-[10px] uppercase tracking-wider text-on-surface/50 dark:text-slate-400 font-bold mb-1">${getTranslation("aircraftFacts.engine")}</p>
              <p class="font-bold text-sm text-on-surface dark:text-slate-100">${aircraft.engine_type || getTranslation("aircraftFacts.notAvailable")}</p>
            </div>
            <div class="bg-surface-container-low dark:bg-slate-800 p-3 rounded-2xl transition-colors">
              <p class="text-[10px] uppercase tracking-wider text-on-surface/50 dark:text-slate-400 font-bold mb-1">${getTranslation("aircraftFacts.maxSpeed")}</p>
              <p class="font-bold text-sm text-on-surface dark:text-slate-100">${speedKmh}</p>
            </div>
            <div class="bg-surface-container-low dark:bg-slate-800 p-3 rounded-2xl transition-colors">
              <p class="text-[10px] uppercase tracking-wider text-on-surface/50 dark:text-slate-400 font-bold mb-1">${getTranslation("aircraftFacts.range")}</p>
              <p class="font-bold text-sm text-on-surface dark:text-slate-100">${rangeKm}</p>
            </div>
            <div class="bg-surface-container-low dark:bg-slate-800 p-3 rounded-2xl transition-colors">
              <p class="text-[10px] uppercase tracking-wider text-on-surface/50 dark:text-slate-400 font-bold mb-1">${getTranslation("aircraftFacts.maxAltitude")}</p>
              <p class="font-bold text-sm text-on-surface dark:text-slate-100">${ceilingM}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="bg-surface-container-low dark:bg-slate-800 p-3 rounded-2xl transition-colors">
              <p class="text-[10px] uppercase tracking-wider text-on-surface/50 dark:text-slate-400 font-bold mb-1">${getTranslation("aircraftFacts.maxWeight")}</p>
              <p class="font-bold text-sm text-on-surface dark:text-slate-100">${weightKg}</p>
            </div>
            <div class="bg-surface-container-low dark:bg-slate-800 p-3 rounded-2xl transition-colors">
              <p class="text-[10px] uppercase tracking-wider text-on-surface/50 dark:text-slate-400 font-bold mb-1">${getTranslation("aircraftFacts.wingspan")}</p>
              <p class="font-bold text-sm text-on-surface dark:text-slate-100">${wingspanM}</p>
            </div>
            <div class="bg-surface-container-low dark:bg-slate-800 p-3 rounded-2xl transition-colors">
              <p class="text-[10px] uppercase tracking-wider text-on-surface/50 dark:text-slate-400 font-bold mb-1">${getTranslation("aircraftFacts.length")}</p>
              <p class="font-bold text-sm text-on-surface dark:text-slate-100">${lengthM}</p>
            </div>
            <div class="bg-surface-container-low dark:bg-slate-800 p-3 rounded-2xl transition-colors">
              <p class="text-[10px] uppercase tracking-wider text-on-surface/50 dark:text-slate-400 font-bold mb-1">${getTranslation("aircraftFacts.height")}</p>
              <p class="font-bold text-sm text-on-surface dark:text-slate-100">${heightM}</p>
            </div>
          </div>

          ${data.length > 1 ? `
            <div class="mt-4 pt-4 border-t border-outline-variant/20 transition-colors">
              <p class="text-xs text-on-surface/60 dark:text-slate-400 mb-2">${getTranslation("aircraftFacts.otherVariants")}</p>
              <div class="flex flex-wrap gap-2">
                ${data.slice(1, 4).map(a => `<span class="text-xs px-2 py-1 bg-surface-container dark:bg-slate-700 dark:text-slate-300 rounded-md transition-colors">${a.model}</span>`).join('')}
                ${data.length > 4 ? `<span class="text-xs px-2 py-1 bg-surface-container dark:bg-slate-700 dark:text-slate-300 rounded-md transition-colors">+${data.length - 4}</span>` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      `;

    } else {
      contentContainer.innerHTML = `<p class="text-on-surface dark:text-white">${getTranslation("logbook.aircraftNoDetails")}</p>`;
    }
  } catch (error) {
    console.error("Fehler beim Abrufen der Flugzeug-Details:", error);
    contentContainer.innerHTML = `<p class="text-red-500 font-bold">${error.message}</p>`;
  }
}

/**
 * ANGEPASST: Leitet den Klick auf der Karte jetzt direkt auf die neue digitale Bordkarte um!
 */
window.showFlightDetailsInModal = function(flight) {
  // 1. Falls ein altes Info-Modal noch offen sein sollte, schließen wir es
  if (typeof closeInfoModal === 'function') closeInfoModal();
  
  // 2. Wir rufen direkt unser neues Premium-Tagebuch auf!
  if (flight && (flight.id || flight.flight_id)) {
      viewFlightDetails(flight.id || flight.flight_id);
  }
};

/**
 * Öffnet das Info-Modal mit einer Auswahlliste für überlappende Flüge.
 * (Verwendet jetzt i18n-Übersetzungen)
 */
function showFlightDisambiguationModal(flights) {
  // 1. Titel setzen (JETZT MIT ÜBERSETZUNG)
  const firstFlight = flights[0];
  const titleTemplate =
    getTranslation("logbook.disambiguationTitle") ||
    "Route: {departure} → {arrival}";
  document.getElementById("info-modal-title").textContent = titleTemplate
    .replace("{departure}", firstFlight.departure)
    .replace("{arrival}", firstFlight.arrival);

  // 2. Inhalt-Container holen und leeren
  const contentContainer = document.getElementById("info-modal-content");
  contentContainer.innerHTML = ""; // Wichtig: Alten Inhalt löschen

  // 3. Beschreibung hinzufügen (JETZT MIT ÜBERSETZUNG)
  const description = document.createElement("p");
  description.className = "text-sm text-gray-700 dark:text-gray-300 mb-4";
  const introTemplate =
    getTranslation("logbook.disambiguationIntro") ||
    "Auf dieser Route wurden {count} Flüge gefunden. Bitte wählen Sie einen aus:";
  description.textContent = introTemplate.replace("{count}", flights.length);
  contentContainer.appendChild(description);

  // 4. Button-Liste erstellen
  const listContainer = document.createElement("div");
  listContainer.className = "flex flex-col space-y-2";

  // Sortiere Flüge nach Datum, bevor sie angezeigt werden
  flights.sort((a, b) => new Date(a.date) - new Date(b.date));

  flights.forEach((flight) => {
    const button = document.createElement("button");
    button.className =
      "text-left p-3 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors w-full";

    // Text für den Button (JETZT MIT ÜBERSETZUNG)
    const buttonTemplate =
      getTranslation("logbook.disambiguationButton") ||
      "Flug #{number} (am {date})";
    button.innerHTML = buttonTemplate
      .replace("{number}", flight.flightLogNumber)
      .replace("{date}", flight.date);

    // Klick-Aktion: Ruft die neue digitale Bordkarte auf!
    button.addEventListener("click", () => {
      closeInfoModal(); // Altes Listen-Modal schließen
      viewFlightDetails(flight.id || flight.flight_id); // Neue Bordkarte öffnen
    });

    listContainer.appendChild(button);
  });

  contentContainer.appendChild(listContainer);

  // 5. Modal öffnen (Diese Funktion existiert bereits)
  openInfoModal();
}

// TABS
// ==========================================
// 🚀 NEUE 5-TAB NAVIGATION LOGIC
// ==========================================
window.showTab = function (tabId) {
    // ❌ Wir haben die alte Profil-Sperre hier gelöscht, 
    // damit du im Demo-Modus an den "Demo Beenden" und Dark-Mode Button kommst!

    // 1. Alle Tab-Inhalte verstecken
    const allTabs = ['radar', 'timeline', 'analytics', 'profil'];
    allTabs.forEach(id => {
        const contentBlock = document.getElementById(`tab-content-${id}`);
        if (contentBlock) {
            contentBlock.classList.add('hidden');
        }
    });

    // 2. Gewünschten Tab-Inhalt anzeigen
    const activeContent = document.getElementById(`tab-content-${tabId}`);
    if (activeContent) {
        activeContent.classList.remove('hidden');
    }

    // 3. UI-Status der Navigations-Buttons in der unteren Leiste aktualisieren
    allTabs.forEach(id => {
        const btn = document.getElementById(`tab-btn-${id}`);
        if (btn) {
            btn.classList.remove('text-primary', 'dark:text-indigo-400');
            btn.classList.add('text-on-surface/40', 'dark:text-slate-500', 'hover:text-on-surface/80', 'dark:hover:text-slate-300');
        }
    });

    // Aktiven Button hervorheben
    const activeBtn = document.getElementById(`tab-btn-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-on-surface/40', 'dark:text-slate-500', 'hover:text-on-surface/80', 'dark:hover:text-slate-300');
        activeBtn.classList.add('text-primary', 'dark:text-indigo-400');
    }

    // 4. Tab-spezifische Funktionen laden
    if (tabId === "timeline") {
        if (typeof map !== 'undefined' && map) {
            setTimeout(() => { map.invalidateSize(); }, 50);
        }
        if (typeof renderFlights === 'function') {
            // 🚀 BUGHUNT FIX: Verhindert, dass die Demo-Flüge durch eine leere DB-Abfrage gelöscht werden!
            if (typeof isDemoMode !== 'undefined' && isDemoMode && typeof flights !== 'undefined') {
                renderFlights(flights);
            } else {
                renderFlights();
            }
        }
    } 
    else if (tabId === "radar") {
        if (typeof initUpcomingWidget === 'function') initUpcomingWidget();
        if (typeof initLiveWidget === 'function') initLiveWidget();
    } 
    else if (tabId === "profil") {
        // Erfolge beim Öffnen des Profils laden
        if (typeof updateAchievements === 'function') updateAchievements();
        
        // 🚀 NEU: Rang berechnen, sobald das Profil geöffnet wird!
        if (typeof getFlights === 'function') {
            getFlights().then(flights => {
                if (typeof updateUserRank === 'function') {
                    updateUserRank(flights.length);
                }
            });
        }
    }
    
    // Ganz nach oben scrollen beim Tab-Wechsel
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// RENDERING
window.renderFlights = async function (
  flightsToRender,
  flightIdToFocus,
  page = 1
) {
  if (typeof stopAnimation === 'function') stopAnimation();
  window.currentPage = page;

  // 🚀 BUGHUNT FIX: Wir löschen isAllRoutesViewActive NICHT mehr blind!
  // isAllRoutesViewActive = false; 

  // Button-Status mit der Variablen synchronisieren (Aktions-orientiert)
  const mapBtn = document.getElementById("toggle-map-view-btn");
  if (mapBtn) {
      if (window.isAllRoutesViewActive) {
          mapBtn.innerHTML = `
              <span class="material-symbols-outlined text-3xl text-primary dark:text-indigo-400 group-hover:scale-110 transition-transform">location_on</span>
              <span class="text-sm font-bold text-on-surface dark:text-white" data-i18n="singleView">${getTranslation("singleView") || "Einzelansicht"}</span>
          `;
          mapBtn.classList.add('bg-primary/10', 'dark:bg-indigo-900/40');
      } else {
          mapBtn.innerHTML = `
              <span class="material-symbols-outlined text-3xl text-primary dark:text-indigo-400 group-hover:scale-110 transition-transform">map</span>
              <span class="text-sm font-bold text-on-surface dark:text-white" data-i18n="allRoutes">${getTranslation("allRoutes") || "Alle Routen"}</span>
          `;
          mapBtn.classList.remove('bg-primary/10', 'dark:bg-indigo-900/40');
      }
  }

  let allFlights;
  if (flightsToRender) {
    allFlights = flightsToRender;
  } else if (currentlyFilteredFlights) {
    allFlights = currentlyFilteredFlights;
  } else {
    allFlights = await getFlights();
  }

  allFlights = resequenceAndAssignNumbers(allFlights);

  if (allFlights.length > 0) {
    const sortKey = currentSort.key;
    const direction = currentSort.direction === "asc" ? 1 : -1;

    allFlights.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      let comparison = 0;

      if (sortKey === "trip") {
          const nameA = a.trips ? a.trips.name : "";
          const nameB = b.trips ? b.trips.name : "";
          comparison = nameA.localeCompare(nameB);
      }
      else if (typeof valA === "number") {
        comparison = valA - valB;
      } else if (sortKey === "date") {
        comparison = new Date(valA) - new Date(valB);
      } else {
        comparison = (valA || "").localeCompare(valB || "");
      }
      return comparison * direction;
    });
  }
  
  updateStatisticsDisplay(allFlights);
  updateCharts(allFlights); 
  if (typeof window.updatePaginationUI === 'function') {
      window.updatePaginationUI(allFlights);
  }

  // 🚀 BUGHUNT FIX: Sicherstellen, dass 'currentPage' immer als korrekte Zahl existiert, 
  // bevor wir die Liste zerschneiden!
  const cp = window.currentPage || 1;
  const startIndex = (cp - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedFlights = allFlights.slice(startIndex, endIndex);

  // 🚀 BUGHUNT FIX: Karte nur dann als Einzelansicht zeichnen, wenn der Modus inaktiv ist!
  if (window.isAllRoutesViewActive) {
      if (typeof drawAllRoutesOnMap === 'function') {
          drawAllRoutesOnMap(allFlights);
      }
  } else {
      let flightForMap = null;

      if (flightIdToFocus) {
        flightForMap = allFlights.find((f) => f.id === flightIdToFocus);
      }

      if (!flightForMap && globalLastFlightId) {
          flightForMap = allFlights.find((f) => f.id == globalLastFlightId);
      }

      if (!flightForMap && allFlights.length > 0) {
        flightForMap = [...allFlights].sort((a, b) => {
            const dateDiff = new Date(b.date) - new Date(a.date);
            if (dateDiff !== 0) return dateDiff;
            return b.id - a.id;
        })[0];
      }

      if (flightForMap) {
        window.drawRouteOnMap(
          flightForMap.depLat,
          flightForMap.depLon,
          flightForMap.arrLat,
          flightForMap.arrLon,
          flightForMap.departure,
          flightForMap.arrival,
          flightForMap.depName,
          flightForMap.arrName,
          flightForMap
        );
      } else {
        window.drawRouteOnMap();
      }
  }

  const flightList = document.getElementById("flight-log-list");
  flightList.innerHTML = "";

  if (paginatedFlights.length === 0 && currentPage === 1) {
    flightList.innerHTML = `<p id="no-flights-message" class="log-placeholder text-gray-500 italic text-center py-4">${getTranslation("flights.noFlights")}</p>`;
  } else {
    paginatedFlights.forEach((flight) => {
      const depName = (airportData && airportData[flight.departure]) ? airportData[flight.departure].name : flight.departure;
      const arrName = (airportData && airportData[flight.arrival]) ? airportData[flight.arrival].name : flight.arrival;
      const rawMilestoneColor = getMilestoneColor(flight.flightLogNumber) || "";
      const dotColor = rawMilestoneColor.replace('bg-', 'bg-').replace('text-white', '').trim() || 'bg-indigo-500';

      const flightElement = document.createElement("div");
      flightElement.className = "w-full max-w-3xl mx-auto relative group cursor-pointer mb-6";
      flightElement.setAttribute("onclick", `viewFlightDetails('${flight.id || flight.flight_id || flight.flightLogNumber}')`);

      const planeBg = flight.planespotters_url ? `style="background-image: url('${flight.planespotters_url}');"` : '';
      const planeOpacity = flight.planespotters_url ? 'opacity-20 group-hover:opacity-40' : 'opacity-0';
      const logoHtml = flight.airline_logo ? `<img src="${flight.airline_logo}" class="h-5 md:h-6 max-w-[80px] object-contain opacity-90 drop-shadow-sm" alt="Logo">` : '';
      const formattedDate = flight.date ? new Date(flight.date).toLocaleDateString() : '--';
      const formattedTime = (flight.time || "").replace("Std.", getTranslation("units.hoursShort") || "Std.").replace("Min.", getTranslation("units.minutesShort") || "Min.");
      const tripBadge = flight.trips && flight.trips.name 
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-tertiary-fixed text-on-tertiary-container dark:bg-purple-900/30 dark:text-purple-300 uppercase tracking-wide">🏝️ ${flight.trips.name}</span>` 
          : '';

      flightElement.innerHTML = `
        <div class="bg-surface-container-lowest dark:bg-slate-800 rounded-[2rem] p-5 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none relative overflow-hidden border border-outline-variant/20 dark:border-slate-700 transition-all duration-300 group-hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] group-hover:-translate-y-1">
            <div class="absolute right-0 top-0 w-3/4 h-full ${planeOpacity} transition-opacity duration-500 bg-cover bg-center pointer-events-none" ${planeBg}></div>
            <div class="absolute inset-0 bg-gradient-to-r from-surface-container-lowest via-surface-container-lowest/90 to-transparent dark:from-slate-800 dark:via-slate-800/90 z-0 pointer-events-none"></div>

            <div class="relative z-10">
                <div class="flex flex-wrap justify-between items-start mb-6 gap-3">
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="bg-surface-container-low dark:bg-slate-700 px-3 py-1 rounded-full shadow-inner flex items-center gap-1.5" title="${getTranslation("flights.flightNumberTitle") || 'Flugnummer'}">
                            <span class="w-2 h-2 rounded-full ${dotColor}"></span>
                            <span class="font-display text-[10px] font-bold text-on-surface/70 dark:text-slate-300 uppercase tracking-wider">#${flight.flightLogNumber || "-"} • ${formattedDate}</span>
                        </div>
                        ${tripBadge}
                    </div>
                    <div class="flex items-center gap-3 ml-auto">
                        ${logoHtml}
                        <h3 class="font-display text-xl md:text-2xl font-bold tracking-tight text-on-surface dark:text-white truncate">${flight.flightNumber || '-'}</h3>
                    </div>
                </div>

                <div class="flex items-center justify-between mb-8">
                    <div class="flex flex-col">
                        <p class="font-display text-4xl md:text-5xl font-extrabold text-primary dark:text-indigo-400 tracking-tighter leading-none">${flight.departure || 'N/A'}</p>
                        <p class="text-[10px] md:text-xs font-medium text-on-surface/60 dark:text-slate-400 mt-1 max-w-[120px] md:max-w-[150px] line-clamp-2 leading-tight" title="${depName}">${depName}</p>
                    </div>
                    <div class="flex-1 px-2 md:px-8 relative flex items-center justify-center">
                        <div class="h-[2px] w-full bg-gradient-to-r from-transparent via-outline-variant/50 dark:via-slate-500 to-transparent relative">
                            <span class="material-symbols-outlined absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-outline-variant dark:text-slate-400 bg-surface-container-lowest dark:bg-slate-800 px-2 text-xl" style="font-variation-settings: 'FILL' 1;">flight</span>
                        </div>
                    </div>
                    <div class="flex flex-col items-end">
                        <p class="font-display text-4xl md:text-5xl font-extrabold text-primary dark:text-indigo-400 tracking-tighter leading-none">${flight.arrival || 'N/A'}</p>
                        <p class="text-[10px] md:text-xs font-medium text-on-surface/60 dark:text-slate-400 mt-1 max-w-[120px] md:max-w-[150px] line-clamp-2 text-right leading-tight" title="${arrName}">${arrName}</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-outline-variant/20 dark:border-slate-700">
                    <div class="flex flex-col">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface/50 dark:text-slate-500 mb-1 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">schedule</span> ${getTranslation('boardingPass.flightTime') || 'Flugzeit'}</span>
                        <span class="text-xs font-bold text-on-surface/90 dark:text-slate-200">${formattedTime}</span>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface/50 dark:text-slate-500 mb-1 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">straighten</span> ${getTranslation('boardingPass.distance') || 'Distanz'}</span>
                        <span class="text-xs font-bold text-on-surface/90 dark:text-slate-200">${flight.distance ? flight.distance.toLocaleString("de-DE") : '--'} ${getTranslation("achievements.unitKm") || "km"}</span>
                    </div>
                    ${flight.aircraftType ? `
                    <div class="flex flex-col">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface/50 dark:text-slate-500 mb-1 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">airlines</span> ${getTranslation('boardingPass.aircraft') || 'Flugzeug'}</span>
                        <span class="text-xs font-bold text-on-surface/90 dark:text-slate-200 truncate" title="${flight.aircraftType}">${flight.aircraftType}</span>
                    </div>` : ''}
                    ${flight.seatNumber ? `
                    <div class="flex flex-col">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-on-surface/50 dark:text-slate-500 mb-1 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">event_seat</span> ${getTranslation('boardingPass.seat') || 'Sitzplatz'}</span>
                        <span class="text-xs font-bold text-on-surface/90 dark:text-slate-200">${flight.seatNumber}</span>
                    </div>` : ''}
                </div>
            </div>
        </div>
      `;
      flightList.appendChild(flightElement);
    });
  }

  if(typeof updateSortButtonUI === 'function') updateSortButtonUI();
};

/**
 * Gruppiert Flüge nach einem bestimmten Kriterium und zeigt sie im Logbuch-Tab an.
 * @param {'aircraftType' | 'airline' | 'airport'} groupBy - Das Kriterium für die Gruppierung.
 */
async function renderLogbookView(groupBy) {
  const contentContainer = document.getElementById("logbook-content");
  contentContainer.innerHTML = `<p class="text-gray-500">${getTranslation(
    "logbook.loading"
  )}</p>`;

  const allFlights = await getFlights();
  const grouped = {};

  const unknownKey = getTranslation("logbook.unknown"); // Hole "Unbekannt" einmal

  let isAirportView = groupBy === "airport";
  let isAircraftTypeView = groupBy === "aircraftType";
  let isAirlineView = groupBy === "airline";
  let isRegistrationView = groupBy === "registration";

  allFlights.forEach((flight) => {
    let keys = [];
    if (isAircraftTypeView) {
      let type = (flight.aircraftType || unknownKey).trim().toUpperCase();
      if (type === "") type = unknownKey;
      keys.push(type);
    } else if (isAirlineView) {
      // 1. Priorität: Das Feld "Airline", falls gefüllt
      let airline = flight.airline ? flight.airline.trim() : "";

      // 2. Fallback: Versuche Code aus Flugnummer zu extrahieren (z.B. "LH" aus "LH400")
      if (!airline && flight.flightNumber) {
          const match = flight.flightNumber.match(/^[A-Z0-9]{2}/);
          if (match) airline = match[0].toUpperCase();
      }

      // 3. Wenn immer noch nichts gefunden -> Unbekannt
      if (!airline) airline = unknownKey;

      keys.push(airline);
    } else if (isAirportView) {
      if (flight.departure) keys.push(flight.departure.toUpperCase());
      if (flight.arrival) keys.push(flight.arrival.toUpperCase());
    } else if (isRegistrationView) {
      // NEU
      let reg = (flight.registration || unknownKey).trim().toUpperCase();
      if (reg === "") reg = unknownKey;
      keys.push(reg);
    }

    keys.forEach((key) => {
      if (key === "") key = unknownKey;
      if (!grouped[key]) {
        grouped[key] = { flights: [], totalDistance: 0, count: 0 };
      }
      grouped[key].flights.push(flight);
      grouped[key].totalDistance += flight.distance;
      grouped[key].count++;
    });
  });

  contentContainer.innerHTML = "";
  const sortedKeys = Object.keys(grouped).sort();

  if (sortedKeys.length === 0) {
    contentContainer.innerHTML = `<p class="text-gray-500">${getTranslation(
      "logbook.noData"
    )}</p>`;
    return;
  }

  sortedKeys.forEach((key) => {
    const group = grouped[key];
    const detailsElement = document.createElement("details");
    detailsElement.className = "bg-surface-container-lowest dark:bg-slate-800 p-6 md:p-8 rounded-[2rem] shadow-sm border border-outline-variant/20 dark:border-slate-700 mb-6 transition-all duration-300 group";

    const summaryElement = document.createElement("summary");
    summaryElement.className = "font-display font-bold text-lg cursor-pointer text-on-surface dark:text-white flex items-center outline-none list-none relative";

    let titleHtml = key;
    let titleKey = "";

    // ... (Logik für isAirportView etc.)
    const iconBtnClass = "ml-4 p-2 rounded-xl bg-surface-container-low dark:bg-slate-900 text-primary dark:text-indigo-400 hover:bg-primary/10 transition-colors duration-150 shadow-inner flex items-center justify-center";

    if (isAirportView && key !== unknownKey) {
      titleKey = getTranslation("logbook.detailsTitleAirport").replace("{key}", key);
      if (currentUserSubscription === "pro") {
        titleHtml = `
            <span class="flex-1">${key}</span>
            <button onclick="event.stopPropagation(); viewLogbookDetails('airport', '${key}')" class="${iconBtnClass}" title="${titleKey}">
                <span class="material-symbols-outlined text-[18px]">info</span>
            </button>
        `;
      } else {
        titleHtml = `<span class="flex-1">${key}</span> <button onclick="event.stopPropagation(); openPremiumModal('default')" class="ml-4 p-2 rounded-xl bg-surface-container-low dark:bg-slate-900 text-on-surface/40 dark:text-slate-500 shadow-inner border border-outline-variant/10 dark:border-slate-700"><span class="text-xs">🔒</span></button>`;
      }
    } else if (isAirlineView && key !== unknownKey) {
      const firstFlightWithName = group.flights.find((f) => f.airline && f.airline.trim() !== "");
      let displayLabel = key;
      if (firstFlightWithName && firstFlightWithName.airline !== key) {
          displayLabel = `${firstFlightWithName.airline} <span class="text-sm text-on-surface/50 font-medium ml-2">(${key})</span>`;
      }
      titleKey = getTranslation("logbook.detailsTitleAirline").replace("{key}", key);
      
      if (currentUserSubscription === "pro") {
        titleHtml = `
            <span class="flex-1">${displayLabel}</span>
            <button onclick="event.stopPropagation(); viewLogbookDetails('airline', '${key}')" class="${iconBtnClass}" title="${titleKey}">
                <span class="material-symbols-outlined text-[18px]">info</span>
            </button>
        `;
      } else {
        titleHtml = `<span class="flex-1">${key}</span> <button onclick="event.stopPropagation(); openPremiumModal('default')" class="ml-4 p-2 rounded-xl bg-surface-container-low dark:bg-slate-900 text-on-surface/40 dark:text-slate-500 shadow-inner border border-outline-variant/10 dark:border-slate-700"><span class="text-xs">🔒</span></button>`;
      }
    } else if (isAircraftTypeView && key !== unknownKey) {
      titleKey = getTranslation("logbook.detailsTitleAircraft").replace("{key}", key);
      
      if (currentUserSubscription === "pro") {
        titleHtml = `
            <span class="flex-1">${key}</span>
            <button onclick="event.stopPropagation(); viewLogbookDetails('aircraft', '${key}')" class="${iconBtnClass}" title="${titleKey}">
                <span class="material-symbols-outlined text-[18px]">info</span>
            </button>
        `;
      } else {
        titleHtml = `<span class="flex-1">${key}</span> <button onclick="event.stopPropagation(); openPremiumModal('default')" class="ml-4 p-2 rounded-xl bg-surface-container-low dark:bg-slate-900 text-on-surface/40 dark:text-slate-500 shadow-inner border border-outline-variant/10 dark:border-slate-700"><span class="text-xs">🔒</span></button>`;
      }
    } else if (isRegistrationView && key !== unknownKey) {
      if (currentUserSubscription === "pro") {
        titleHtml = `
            <span class="flex-1">${key}</span>
            <button onclick="event.stopPropagation(); viewLogbookDetails('registration', '${key}')" class="${iconBtnClass}" title="Flugzeug Details">
                <span class="material-symbols-outlined text-[18px]">info</span>
            </button>
        `;
      } else {
        titleHtml = `<span class="flex-1">${key}</span> <button onclick="event.stopPropagation(); openPremiumModal('default')" class="ml-4 p-2 rounded-xl bg-surface-container-low dark:bg-slate-900 text-on-surface/40 dark:text-slate-500 shadow-inner border border-outline-variant/10 dark:border-slate-700"><span class="text-xs">🔒</span></button>`;
      }
    }

    // Pfeil-Icon hinzufügen für den Accordion-Effekt
    summaryElement.innerHTML = `
      <div class="flex items-center w-full">
        <span class="material-symbols-outlined mr-3 text-primary/60 transition-transform duration-300 group-open:rotate-90">chevron_right</span>
        <div class="flex items-center flex-1">${titleHtml}</div>
      </div>
    `;

    const flightListDiv = document.createElement("div");
    flightListDiv.className = "mt-6 space-y-3 border-t border-outline-variant/10 dark:border-slate-700/50 pt-6";

    if (currentUserSubscription === "pro") {
      const printButton = document.createElement("button");
      printButton.className = "text-xs font-bold text-primary hover:text-white p-3 rounded-xl bg-surface-container-low dark:bg-slate-900 hover:bg-primary dark:hover:bg-primary/90 transition shadow-sm w-full sm:w-auto flex items-center justify-center gap-2 mb-6 border border-outline-variant/10 dark:border-white/5";

      const buttonTitle = (getTranslation("print.logbookTitle") || "Logbuch: {groupName}").replace("{groupName}", key);
      printButton.innerHTML = `<span class="material-symbols-outlined text-[18px]">menu_book</span> ` + (getTranslation("print.createBookForGroup") || "Buch für {groupName} erstellen").replace("{groupName}", key);

      printButton.onclick = async (event) => {
        event.stopPropagation();
        const sortedGroupFlights = [...group.flights].sort((a, b) => new Date(a.date) - new Date(b.date));
        await buildAndPrintHtml(sortedGroupFlights, buttonTitle);
      };
      flightListDiv.appendChild(printButton);
    }

    const listTitle = document.createElement("p");
    listTitle.className = "text-[10px] font-bold uppercase tracking-widest text-on-surface/50 dark:text-slate-400 mb-4";
    listTitle.textContent = getTranslation("logbook.summary")
      .replace("{count}", group.count)
      .replace("{distance}", group.totalDistance.toLocaleString("de-DE"));
    flightListDiv.appendChild(listTitle);

    group.flights
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach((flight) => {
        const flightText = getTranslation("logbook.flightEntry")
          .replace("{date}", flight.date)
          .replace("{departure}", flight.departure)
          .replace("{arrival}", flight.arrival)
          .replace("{distance}", flight.distance.toLocaleString("de-DE"));

        const flightEntryDiv = document.createElement("div");
        flightEntryDiv.className = "text-sm font-medium text-on-surface/80 dark:text-slate-300 bg-surface-container-low dark:bg-slate-900/50 p-4 rounded-xl border border-outline-variant/10 dark:border-slate-700/50 flex items-center gap-3";
        flightEntryDiv.innerHTML = `<span class="material-symbols-outlined text-primary/50 text-[18px]">flight</span> <span>${flightText}</span>`;

        flightListDiv.appendChild(flightEntryDiv); 
      });

    detailsElement.appendChild(summaryElement);
    detailsElement.appendChild(flightListDiv);
    contentContainer.appendChild(detailsElement);
  });

  // UI für die Buttons aktualisieren
  document
    .querySelectorAll(".logbook-view-btn")
    .forEach((btn) => btn.classList.remove("active"));
  let buttonIdFragment = groupBy;
  if (groupBy === "aircraftType") {
    buttonIdFragment = "aircraft";
  }
  if (groupBy === "airline") {
    buttonIdFragment = "airline";
  }
  if (groupBy === "registration") {
    buttonIdFragment = "registration";
  }
  const activeButton = document.getElementById(
    `logbook-view-${buttonIdFragment}`
  );
  if (activeButton) {
    activeButton.classList.add("active");
  }
}

// CHARTS & STATS
/**
 * Aktualisiert die Paginierungs-UI (Button-Zustände, Seitenzahlanzeige).
 * @param {Array<Object>} allFlights - Das komplette, ungefilterte Array aller Flüge.
 */
// ==========================================
// 🚀 BUGHUNT FIX: KUGELSICHERE PAGINATION
// ==========================================
window.updatePaginationUI = function(allFlights) {
  const pageInfo = document.getElementById("page-info");
  const prevBtn = document.getElementById("prev-page-btn");
  const nextBtn = document.getElementById("next-page-btn");
  const paginationControls = document.getElementById("pagination-controls");

  if (!pageInfo || !prevBtn || !nextBtn || !paginationControls) return;

  const totalPages = Math.ceil(allFlights.length / ITEMS_PER_PAGE);

  if (totalPages <= 1) {
    paginationControls.style.display = "none"; 
    return;
  }

  paginationControls.style.display = "flex";

  // Immer sicherstellen, dass wir eine gültige Seitenzahl haben
  const cp = window.currentPage || 1;
  
  // Sicherer Fallback, falls der Übersetzungstext mal kurz nicht greifbar ist
  const textTemplate = getTranslation("flights.pageInfo") || "Seite {currentPage} von {totalPages}";
  
  pageInfo.textContent = textTemplate
    .replace("{currentPage}", cp)
    .replace("{totalPages}", totalPages);

  prevBtn.disabled = (cp === 1);
  nextBtn.disabled = (cp === totalPages);
};

window.nextPage = function() {
  const cp = window.currentPage || 1;
  if (typeof window.renderFlights === 'function') {
      window.renderFlights(null, null, cp + 1);
  }
};

window.prevPage = function() {
  const cp = window.currentPage || 1;
  if (cp > 1 && typeof window.renderFlights === 'function') {
      window.renderFlights(null, null, cp - 1);
  }
};

var updateStatisticsDisplay = function (flights) {
  var stats = calculateStatistics(flights);

  // Standard-Werte
  document.getElementById("stat-count").textContent =
    stats.totalCount.toLocaleString("de-DE");
  document.getElementById("stat-distance").textContent =
    `${stats.totalDistance.toLocaleString("de-DE")} km`;
  document.getElementById("stat-frequent").textContent = stats.frequentAirport;
  document.getElementById("stat-avg-distance").textContent =
    `${stats.averageDistance.toLocaleString("de-DE")} km`;
  document.getElementById("stat-frequent-aircraft").textContent =
    stats.frequentAircraft;
  document.getElementById("stat-total-co2").textContent =
    `${stats.totalCO2.toLocaleString("de-DE")} kg`;
  document.getElementById("stat-avg-co2").textContent =
    `${stats.averageCO2.toLocaleString("de-DE")} kg`;

  // Längster Flug
  if (stats.longestFlight) {
    document.getElementById("stat-longest-flight").textContent = getTranslation(
      "stats.flightRouteKm"
    )
      .replace("{departure}", stats.longestFlight.departure)
      .replace("{arrival}", stats.longestFlight.arrival)
      .replace(
        "{distance}",
        stats.longestFlight.distance.toLocaleString("de-DE")
      );
  } else {
    document.getElementById("stat-longest-flight").textContent =
      getTranslation("stats.noData");
  }

  // Kürzester Flug
  if (stats.shortestFlight) {
    document.getElementById("stat-shortest-flight").textContent =
      getTranslation("stats.flightRouteKm")
        .replace("{departure}", stats.shortestFlight.departure)
        .replace("{arrival}", stats.shortestFlight.arrival)
        .replace(
          "{distance}",
          stats.shortestFlight.distance.toLocaleString("de-DE")
        );
  } else {
    document.getElementById("stat-shortest-flight").textContent =
      getTranslation("stats.noData");
  }

  // Kosten-Statistiken
  const spendingText =
    Object.keys(stats.totalSpending)
      .map((currency) =>
        stats.totalSpending[currency].toLocaleString("de-DE", {
          style: "currency",
          currency: currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      )
      .join(" | ") || getTranslation("stats.noData");
  document.getElementById("stat-total-spending").textContent = spendingText;

  if (stats.mostExpensiveFlight) {
    document.getElementById("stat-most-expensive").textContent = getTranslation(
      "stats.flightRoutePrice"
    )
      .replace("{departure}", stats.mostExpensiveFlight.departure)
      .replace("{arrival}", stats.mostExpensiveFlight.arrival)
      .replace(
        "{price}",
        stats.mostExpensiveFlight.price.toLocaleString("de-DE")
      )
      .replace("{currency}", stats.mostExpensiveFlight.currency);
  } else {
    document.getElementById("stat-most-expensive").textContent =
      getTranslation("stats.noData");
  }

  if (stats.leastExpensiveFlight) {
    document.getElementById("stat-least-expensive").textContent =
      getTranslation("stats.flightRoutePrice")
        .replace("{departure}", stats.leastExpensiveFlight.departure)
        .replace("{arrival}", stats.leastExpensiveFlight.arrival)
        .replace(
          "{price}",
          stats.leastExpensiveFlight.price.toLocaleString("de-DE")
        )
        .replace("{currency}", stats.leastExpensiveFlight.currency);
  } else {
    document.getElementById("stat-least-expensive").textContent =
      getTranslation("stats.noData");
  }

  // Jahreszusammenfassung
  const yearSelect = document.getElementById("stat-year-select");
  const yearlySummary = document.getElementById("stat-yearly-summary");
  yearSelect.innerHTML = "";

  const years = Object.keys(stats.yearlyData).sort((a, b) => b - a);

  if (years.length > 0) {
    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    });

    const updateYearlyDisplay = (year) => {
      const data = stats.yearlyData[year];
      // Wir nutzen innerHTML und verpacken die übersetzbaren Wörter in Spans!
      yearlySummary.innerHTML = `
        ${data.count} <span data-i18n="stats.flights">${getTranslation("stats.flights") || "Flüge"}</span> | 
        ${data.distance.toLocaleString("de-DE")} <span data-i18n="achievements.unitKm">${getTranslation("achievements.unitKm") || "km"}</span>
      `;
    };

    yearSelect.onchange = (event) => {
      updateYearlyDisplay(event.target.value);
    };

    updateYearlyDisplay(years[0]);
    yearSelect.style.display = "inline-block";
  } else {
    yearlySummary.textContent = getTranslation("stats.noYearlyData");
    yearSelect.style.display = "none";
  }
};

/**
 * Hauptfunktion zum Aufbereiten der Flugdaten und Aktualisieren der Charts.
 * @param {Array<Object>} allFlights - Das Array mit allen Flug-Objekten.
 * @param {string} timeframe - Entweder 'year' oder 'month'.
 */
function updateCharts(allFlights, timeframe = "year") {
  if (!allFlights || allFlights.length === 0) {
    if (flightsChartInstance) flightsChartInstance.destroy();
    if (distanceChartInstance) distanceChartInstance.destroy();
    if (timeChartInstance) timeChartInstance.destroy();
    return;
  }

  const aggregatedData = {};

  allFlights.forEach((flight) => {
    const key =
      timeframe === "year"
        ? flight.date.substring(0, 4)
        : flight.date.substring(0, 7);
        
    if (!aggregatedData[key]) {
      aggregatedData[key] = { count: 0, distance: 0, time: 0 };
    }
    
    // --- 🛡️ DER MULTILINGUALE ZEIT-PARSER ---
    let flightMinutes = 0;
    let t = flight.time;
    
    if (t) {
        if (typeof t === 'number') {
            flightMinutes = t <= 30 ? t * 60 : t; 
        } else if (typeof t === 'string') {
            t = t.toLowerCase().trim();
            
            // Fall 1: Doppelpunkt (z.B. "11:31", "0:54h")
            if (t.includes(':')) {
                const cleanT = t.replace(/[^\d:]/g, ''); 
                const parts = cleanT.split(':');
                flightMinutes = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
            } 
            // Fall 2: Textformate (Findet jetzt 'h', 'Std', 'Stunde', 'hour' etc.)
            else if (/[a-z]/i.test(t)) {
                let h = 0, m = 0;
                // Sucht nach der Zahl vor h, std, stunde oder hour
                const matchH = t.match(/(\d+(?:[.,]\d+)?)\s*(?:h|std|stunde|hour)/i);
                // Sucht nach der Zahl vor m, min oder minute
                const matchM = t.match(/(\d+(?:[.,]\d+)?)\s*(?:m|min|minute)/i);
                
                if (matchH) h = parseFloat(matchH[1].replace(',', '.'));
                if (matchM) m = parseFloat(matchM[1].replace(',', '.'));
                
                if (matchH || matchM) {
                    flightMinutes = (h * 60) + m;
                } else {
                    // Notfall-Rettung: Holt einfach die ersten zwei Zahlen (z.B. bei "11 31")
                    const nums = t.match(/\d+/g);
                    if (nums && nums.length >= 2) {
                        flightMinutes = (parseInt(nums[0], 10) * 60) + parseInt(nums[1], 10);
                    }
                }
            } 
            // Fall 3: Reine Zahlen (z.B. "1.5", "5,2")
            else {
                let cleanT = t.replace(/[^\d.,]/g, '').replace(',', '.');
                let num = parseFloat(cleanT);
                if (!isNaN(num)) {
                    flightMinutes = num <= 30 ? num * 60 : num;
                }
            }
        }
    }
    
    // Fallback falls alles fehlschlägt
    if (flightMinutes <= 0 && flight.distance > 0) {
        flightMinutes = (flight.distance / 800) * 60 + 30;
    }
    // -------------------------------------

    aggregatedData[key].count++;
    aggregatedData[key].distance += (flight.distance || 0);
    aggregatedData[key].time += Math.round(flightMinutes);
  });

  const sortedLabels = Object.keys(aggregatedData).sort();

  const flightsData = sortedLabels.map((label) => aggregatedData[label].count);
  const distanceData = sortedLabels.map((label) => aggregatedData[label].distance);
  
  // Umrechnung für die Anzeige im Chart
  const timeData = sortedLabels.map((label) => {
    return parseFloat((aggregatedData[label].time / 60).toFixed(2));
  });

  renderAllCharts(sortedLabels, flightsData, distanceData, timeData);

  const btnYear = document.getElementById("chart-view-year");
  const btnMonth = document.getElementById("chart-view-month");
  if(btnYear) btnYear.classList.toggle("active", timeframe === "year");
  if(btnMonth) btnMonth.classList.toggle("active", timeframe === "month");
}

/**
 * Zeichnet alle Diagramme basierend auf den aufbereiteten Daten.
 */
function renderAllCharts(labels, flightsData, distanceData, timeData) {
  if (flightsChartInstance) flightsChartInstance.destroy();
  if (distanceChartInstance) distanceChartInstance.destroy();
  if (timeChartInstance) timeChartInstance.destroy();

  const isDarkMode = document.documentElement.classList.contains("dark");
  const gridColor = isDarkMode
    ? "rgba(255, 255, 255, 0.1)"
    : "rgba(0, 0, 0, 0.1)";
  const labelColor = isDarkMode ? "#d1d5db" : "#374151";

  // 1. Flüge pro Zeitraum (Balkendiagramm)
  flightsChartInstance = new Chart(document.getElementById("flightsChart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: getTranslation("charts.labelFlights"),
          data: flightsData,
          backgroundColor: "rgba(79, 70, 229, 0.8)",
          borderColor: "rgba(79, 70, 229, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      scales: {
        y: { beginAtZero: true, ticks: { color: labelColor }, grid: { color: gridColor } },
        x: { ticks: { color: labelColor }, grid: { color: gridColor } },
      },
    },
  });

  // 2. Distanz pro Zeitraum (Liniendiagramm)
  distanceChartInstance = new Chart(document.getElementById("distanceChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: getTranslation("charts.labelDistance"),
          data: distanceData,
          fill: false,
          borderColor: "rgba(22, 163, 74, 1)",
          tension: 0.1,
        },
      ],
    },
    options: {
      scales: {
        y: { beginAtZero: true, ticks: { color: labelColor }, grid: { color: gridColor } },
        x: { ticks: { color: labelColor }, grid: { color: gridColor } },
      },
    },
  });

  // 3. Flugzeit pro Zeitraum (Liniendiagramm)
  timeChartInstance = new Chart(document.getElementById("timeChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: getTranslation("charts.labelDuration"),
          data: timeData, // Y-Achse ist jetzt in Dezimal-Stunden
          fill: false,
          borderColor: "rgba(219, 39, 119, 1)",
          tension: 0.1,
        },
      ],
    },
    options: {
      scales: {
        y: { beginAtZero: true, ticks: { color: labelColor }, grid: { color: gridColor } },
        x: { ticks: { color: labelColor }, grid: { color: gridColor } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function (context) {
              let label = context.dataset.label || "";
              if (label) label += ": ";
              
              // HIER IST DER TOOLTIP-FIX: Rechnet Dezimal-Stunden zurück in Stunden und saubere Minuten
              const totalHoursDecimal = context.parsed.y;
              const hours = Math.floor(totalHoursDecimal);
              const minutes = Math.round((totalHoursDecimal - hours) * 60);

              return getTranslation("charts.tooltipLabel")
                .replace("{label}", label)
                .replace("{hours}", hours)
                .replace("{minutes}", minutes);
            },
          },
        },
      },
    },
  });
}

// DRUCKEN
/**
 * NEU: Kernfunktion, die eine Flugliste entgegennimmt und das Druck-HTML generiert.
 * @param {Array<Object>} flightsToPrint - Die vor-gefilterte Liste der Flüge.
 * @param {string} title - Der Titel für das Deckblatt.
 */
async function buildAndPrintHtml(flightsToPrint, title) {
  // 1. Prüfen, ob Flüge vorhanden sind
  if (!flightsToPrint || flightsToPrint.length === 0) {
    showMessage(getTranslation("print.errorTitle"), getTranslation("print.errorNoFlights"), "error");
    return;
  }

  // 2. Stelle sicher, dass die Flüge nummeriert sind
  const sequencedFlights = resequenceAndAssignNumbers([...flightsToPrint]);

  // 3. Finde das ECHTE Start- und Enddatum VOR der UI-Sortierung
  const dateSortedFlights = [...sequencedFlights].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  const firstDate = dateSortedFlights[0].date;
  const lastDate = dateSortedFlights[dateSortedFlights.length - 1].date;

  // 4. Wende die aktuelle UI-Sortierung an
  const sortKey = currentSort.key;
  const direction = currentSort.direction === "asc" ? 1 : -1;
  sequencedFlights.sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    let comparison = 0;
    if (typeof valA === "number") comparison = valA - valB;
    else if (sortKey === "date")
      comparison = new Date(a.date) - new Date(b.date);
    else comparison = (valA || "").localeCompare(valB || "");
    return comparison * direction;
  });

  // 5. Statistiken berechnen
  const stats = calculateStatistics(sequencedFlights);
  const totalMinutes = sequencedFlights.reduce(
    (sum, f) => sum + parseFlightTimeToMinutes(f.time),
    0
  );
  const totalTimeStr = `${Math.floor(totalMinutes / 60)} ${getTranslation("units.hoursShort")} ${totalMinutes % 60} ${getTranslation("units.minutesShort")}`;

  let html = "";

  // 6. HTML für das Deckblatt
  html += `
        <div class="print-cover-page" style="font-family: 'Inter', sans-serif; padding: 1rem; text-align: center;">
          <h1 style="font-size: 2.5rem; font-weight: 800; color: #4F46E5; margin-top: 4rem;">${getTranslation("print.coverTitle")}</h1>
          <p style="font-size: 1.25rem; color: #374151; margin-bottom: 5rem;">${title}</p>
          
          <div style="text-align: left; max-width: 400px; margin: 0 auto; border-top: 1px solid #E5E7EB; padding-top: 2rem;">
            <h2 style="font-size: 1.5rem; font-weight: 700; color: #1F2937; margin-bottom: 1.5rem;">
              ${getTranslation("print.summaryFor").replace("{count}", sequencedFlights.length)}
            </h2>
            <p style="font-size: 1rem; margin-bottom: 0.5rem;"><strong>${getTranslation("print.dateRange")}:</strong> ${firstDate} – ${lastDate}</p>
            <p style="font-size: 1rem; margin-bottom: 0.5rem;"><strong>${getTranslation("print.totalDistance")}:</strong> ${stats.totalDistance.toLocaleString("de-DE")} km</p>
            <p style="font-size: 1rem; margin-bottom: 0.5rem;"><strong>${getTranslation("print.totalTime")}:</strong> ${totalTimeStr}</p>
            <p style="font-size: 1rem; margin-bottom: 0.5rem;"><strong>${getTranslation("print.totalCO2")}:</strong> ${stats.totalCO2.toLocaleString("de-DE")} kg CO₂</p>
          </div>
        </div>
      `;

  // 7. HTML für jeden einzelnen Flug erstellen
  sequencedFlights.forEach((flight, index) => {
    const title = getTranslation("print.flightTitle")
      .replace("{number}", flight.flightLogNumber)
      .replace("{departure}", flight.departure)
      .replace("{arrival}", flight.arrival);

    let photosHtml = "";
    if (flight.photo_url && flight.photo_url.length > 0) {
      photosHtml +=
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">';
      photosHtml += flight.photo_url
        .map(
          (url) =>
            `<div><img src="${url}" alt="Flugfoto" style="width: 100%; border-radius: 0.375rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"></div>`
        )
        .join("");
      photosHtml += "</div>";
    }

    // ACHTUNG: Hier bauen wir den Eintrag. 
    // Ich füge die Reise-Info als Zeile unter dem Datum ein.
    let flightEntryHtml = `
        <div class="print-flight-entry" style="font-family: 'Inter', sans-serif;">
            <h2 style="font-size: 1.5rem; font-weight: 700; color: #4F46E5; border-bottom: 1px solid #E5E7EB; padding-bottom: 0.5rem;">
                ${title}
            </h2>
            <div style="margin-top: 1rem; line-height: 1.75;">
                <p><strong>${getTranslation("logbook.flightEntryDate")}:</strong> ${flight.date}</p>
                
                ${ flight.trips && flight.trips.name 
                    ? `<p><strong>${getTranslation("logbook.flightEntryTrip") || "Reise / Trip:"}</strong> ${flight.trips.name}</p>` 
                    : '' 
                }
                <p><strong>${getTranslation("logbook.flightEntryRoute")}:</strong> ${flight.depName || flight.departure} ${getTranslation("logbook.routeSeparator")} ${flight.arrName || flight.arrival}</p>
                <p><strong>${getTranslation("logbook.flightEntryDistance")}:</strong> ${flight.distance.toLocaleString("de-DE")} km</p>
                <p><strong>${getTranslation("logbook.flightEntryDuration")}:</strong> ${flight.time}</p>
                <hr style="margin: 0.75rem 0;">
                <p><strong>${getTranslation("logbook.flightEntryAirline")}:</strong> ${flight.airline || "-"} (${flight.flightNumber || "-"})</p>
                <p><strong>${getTranslation("logbook.flightEntryAircraft")}:</strong> ${flight.aircraftType || "-"} (${flight.registration || "-"})</p>
                
                ${
                  flight.notes
                    ? `
                    <div style="margin-top: 1rem; border-left: 4px solid #C7D2FE; padding-left: 1rem; font-style: italic;">
                        <strong style="font-style: normal;">${getTranslation("logbook.flightEntryNotes")}</strong>
                        <p style="white-space: pre-wrap;">${flight.notes}</p>
                    </div>
                `
                    : ""
                }
                
                ${photosHtml}
            </div>
        </div>
    `;

    html += `
        <table class="print-table" role="presentation" style="border-collapse: collapse; page-break-before: always !important;">
            <tr>
                <td style="width: 100%; vertical-align: top; padding: 0;">
                    ${flightEntryHtml}
                </td>
            </tr>
        </table>
    `;

    if (index < sequencedFlights.length - 1) {
      html += '<hr class="page-break">';
    }
  });

  // 8. HTML in den Container einfügen
  document.getElementById("print-view-content").innerHTML = html;

  // 9. Capacitor Check (Native Printing)
  if (typeof Capacitor !== "undefined" && Capacitor.isNativePlatform()) {
    showMessage(
      getTranslation("print.nativeTitle") || "PDF wird erstellt...",
      getTranslation("print.nativeMessage") || "Die App generiert das PDF. Bitte warten...",
      "info"
    );

    try {
      const { MyPrinter } = Capacitor.Plugins;
      if (!MyPrinter) {
        throw new Error("Eigenes 'MyPrinter'-Plugin nicht auf Capacitor.Plugins gefunden.");
      }

      MyPrinter.printHtml({
        content: html,
        jobName: title,
      }).catch((error) => {
        console.error("Fehler beim nativen Drucken:", error);
        showMessage(getTranslation("print.errorTitle"), getTranslation("print.errorNativeFailed"), "error");
      });
    } catch (e) {
      console.error("Eigenes 'MyPrinter'-Plugin konnte nicht geladen werden:", e);
      alert(getTranslation("print.pluginError") || "Die native Druckfunktion ist auf diesem Gerät nicht verfügbar. (Plugin-Fehler)");
    }
  } else {
    // Browser Druck
    setTimeout(() => {
      window.print();
    }, 500);
  }
}

/**
 * NEU: Trigger-Funktion für den "Flüge"-Tab.
 * Liest die Filter aus und ruft die Kern-Druckfunktion auf.
 */
async function triggerPrintView_FlightsTab() {
  // ✅ 1. GATEKEEPER (Bleibt wie gehabt)
  if (currentUserSubscription === "free") {
    openPremiumModal("print");
    return;
  }

  // ✅ 2. DATENQUELLE BESTIMMEN (Hier ist die wichtige Änderung!)
  // Wir nehmen exakt das, was der User gerade in der Liste sieht.
  // Das respektiert AUTOMATISCH alle Filter (Reise, Suche, Datum, etc.).
  
  let flightsToPrint = [];

  // 'currentlyFilteredFlights' ist eine globale Variable aus app.js, 
  // die gesetzt wird, sobald ein Filter aktiv ist.
  if (typeof currentlyFilteredFlights !== 'undefined' && currentlyFilteredFlights && currentlyFilteredFlights.length > 0) {
      // Fall A: Filter ist aktiv -> Wir nehmen die gefilterte Liste
      flightsToPrint = currentlyFilteredFlights;
  } else if (typeof allFlightsUnfiltered !== 'undefined' && allFlightsUnfiltered && allFlightsUnfiltered.length > 0) {
      // Fall B: Kein Filter aktiv -> Wir nehmen die komplette Liste aus dem Speicher
      flightsToPrint = allFlightsUnfiltered;
  } else {
      // Fall C: Notfall-Fallback -> Neu laden
      flightsToPrint = await getFlights();
  }

  // Sicherheits-Check: Gibt es überhaupt Daten zum Drucken?
  if (!flightsToPrint || flightsToPrint.length === 0) {
    showMessage(
      getTranslation("toast.infoTitle") || "Info",
      getTranslation("print.noFlights") || "Keine Flüge für das Buch vorhanden.",
      "info"
    );
    return;
  }

  // Optional: Sortierung sicherstellen (Datum absteigend sieht im Buch meist am besten aus)
  flightsToPrint.sort((a, b) => new Date(b.date) - new Date(a.date));

  // ✅ 3. TITEL GENERIEREN (Reise-Name integrieren)
  let title = getTranslation("print.filteredTitle") || "Mein Flugbuch";
  
  const tripFilterEl = document.getElementById("filter-trip");
  // Wenn ein Trip ausgewählt ist (Index > 0, da 0 "Alle Reisen" ist), hängen wir den Namen an
  if (tripFilterEl && tripFilterEl.selectedIndex > 0) {
      title += ` - ${tripFilterEl.options[tripFilterEl.selectedIndex].text}`;
  }

  // 4. KERNFUNKTION AUFRUFEN
  await buildAndPrintHtml(flightsToPrint, title);
}

/**
 * 🚀 NEU: Trigger-Funktion für den direkten Reise-Druck
 */
window.printTripPDF = async function(tripId, tripName) {
    if (currentUserSubscription === "free") {
        openPremiumModal("print");
        return;
    }

    // Flüge laden und filtern
    const allFlights = typeof isDemoMode !== 'undefined' && isDemoMode && typeof flights !== 'undefined' ? flights : await getFlights();
    const tripFlights = allFlights.filter(f => f.trip_id == tripId);

    if (!tripFlights || tripFlights.length === 0) {
        showMessage(getTranslation("toast.infoTitle") || "Info", getTranslation("print.noFlights") || "Keine Flüge für das Buch vorhanden.", "info");
        return;
    }

    // Chronologisch sortieren
    tripFlights.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Titel generieren
    let title = getTranslation("print.filteredTitle") || "Mein Flugbuch";
    if (tripName) {
        title += ` - ${tripName}`;
    }

    // Drucken auslösen
    await buildAndPrintHtml(tripFlights, title);
};

/**
 * NEU: Füllt den Hilfe-Tab mit übersetzbarem Inhalt.
 */
function renderHelpContent() {
    const container = document.getElementById("help-content-container");

    // Hilfetexte (mit i18n-Schlüsseln)
    const sections = [
        { key: "help.radar.title", contentKey: "help.radar.content" },
        { key: "help.timeline.title", contentKey: "help.timeline.content" },
        { key: "help.logging.title", contentKey: "help.logging.content" },
        { key: "help.globe.title", contentKey: "help.globe.content" },
        { key: "help.analytics.title", contentKey: "help.analytics.content" },
        { key: "help.profile.title", contentKey: "help.profile.content" },
    ];

    let html = "";
    sections.forEach(section => {
        html += `
          <h3 class="text-lg font-semibold text-indigo-600 dark:text-indigo-400">${getTranslation(section.key)}</h3>
          <p>${getTranslation(section.contentKey)}</p>
        `;
    });

    // ✅ NEU: Intelligente Verlinkung basierend auf der Sprache
    // currentLanguage kommt aus config.js
    const isGerman = currentLanguage === 'de';
    
    const privacyLink = isGerman ? 'privacy.html' : 'privacy_en.html';
    const termsLink = isGerman ? 'terms.html' : 'terms_en.html';

    // Übersetzte Titel für die Links (optional, oder wir nehmen Symbole/Englisch als Standard)
    const privacyTitle = isGerman ? 'Datenschutzerklärung' : 'Privacy Policy';
    const termsTitle = isGerman ? 'AGB & Impressum' : 'Terms & Legal Notice';

    html += `
        <hr class="my-6 border-gray-300 dark:border-gray-600">
        <h3 class="text-lg font-semibold text-indigo-600 dark:text-indigo-400 mb-2">${getTranslation("help.legal") || "Rechtliches"}</h3>
        <div class="flex flex-col space-y-2">
            <a href="${privacyLink}" target="_blank" class="text-indigo-500 hover:underline flex items-center gap-2">
                🛡️ ${privacyTitle}
            </a>
            <a href="${termsLink}" target="_blank" class="text-indigo-500 hover:underline flex items-center gap-2">
                ⚖️ ${termsTitle}
            </a>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * NEU: Prüft, ob die App in einem Android WebView mit einer
 * dedizierten Druck-Schnittstelle ("AndroidPrintInterface") läuft.
 * @returns {boolean} True, wenn die Android-Schnittstelle existiert.
 */
function isAndroidWebViewPrint() {
  // Der Android-Entwickler muss 'AndroidPrintInterface'
  // per addJavascriptInterface() im WebView bereitstellen.
  // Wir prüfen, ob das Objekt UND die spezifische 'print'-Funktion existieren.
  return (
    typeof window.AndroidPrintInterface !== "undefined" &&
    typeof window.AndroidPrintInterface.print === "function"
  );
}

// =================================================================
// EASTER EGG
// =================================================================

let eggClickCount = 0;
let eggClickTimer = null;
let eggLevel = 0; // ✅ NEU: Zählt, wie oft das UFO schon geflogen ist

function triggerEasterEgg() {
    eggClickCount++;

    if (eggClickTimer) clearTimeout(eggClickTimer);
    eggClickTimer = setTimeout(() => {
        eggClickCount = 0;
    }, 500);

    if (eggClickCount >= 5) {
        eggLevel++; // Level hochzählen
        launchPaperPlane();
        eggClickCount = 0;
    }
}

function launchPaperPlane() {
    // 1. Größe berechnen
    const baseSize = 60; // Startgröße in Pixel
    const growthPerLevel = 40; // Wächst um 40px pro Flug
    const maxSize = 400; // Maximalgröße (ruhig etwas größer für den Spaßfaktor)

    // Formel: Basis + (Level-1 * Wachstum)
    let currentSize = baseSize + ((eggLevel - 1) * growthPerLevel);
    
    // Cap (Limit) anwenden
    if (currentSize > maxSize) currentSize = maxSize;

    // 2. Element erstellen
    const plane = document.createElement('div');
    plane.className = 'paper-plane animate-fly';
    
    // ✅ FIX: Da Emojis Text sind, müssen wir die Schriftgröße ändern!
    plane.style.fontSize = `${currentSize}px`;
    
    // Damit der Container um das Emoji herum auch passt (für Klicks/Layout)
    plane.style.width = `${currentSize}px`;
    plane.style.height = `${currentSize}px`;
    
    // Zentrierung, damit das Emoji schön in der Mitte der Animation sitzt
    plane.style.display = 'flex';
    plane.style.alignItems = 'center';
    plane.style.justifyContent = 'center';
    // WICHTIG: line-height 1 verhindert, dass das Emoji nach unten verschoben wird
    plane.style.lineHeight = '1'; 

    // Zentrierung und Line-Height (Wichtig für Emojis)
    plane.style.display = 'flex';
    plane.style.alignItems = 'center';
    plane.style.justifyContent = 'center';
    plane.style.lineHeight = '1'; 

    // ✅ NEU: Emoji-Wechsel ab Level 10
    let emojiIcon = '🛸'; // Standard: UFO
    if (eggLevel >= 10) {
        emojiIcon = '👽'; // Ab Level 10: Alien
    }

    plane.innerHTML = emojiIcon;

    document.body.appendChild(plane);

    // 3. Nachricht anpassen
    let msg = getTranslation("easterEgg.level1") || "Whoosh! 🛸";
    if (eggLevel > 3) msg = getTranslation("easterEgg.level2") || "Big Ufo Incoming! 🛸";
    if (eggLevel > 6) msg = getTranslation("easterEgg.level3") || "ALIEN INVASION! 👽";

    if (typeof showMessage === "function") {
        showMessage(msg, (getTranslation("easterEgg.unlocked") || "Level {level} Pilot Mode unlocked!").replace("{level}", eggLevel), "easter-egg");
    }

    // 4. Aufräumen (Timer passend zum CSS, z.B. 7s)
    setTimeout(() => {
        plane.remove();
    }, 7500);
}

// ui.js - Ganz am Ende einfügen

/**
 * Schaltet die Sichtbarkeit des Passworts um.
 * @param {string} inputId - Die ID des Input-Feldes (z.B. 'login-password')
 * @param {HTMLElement} btn - Der geklickte Button (this)
 */
window.togglePasswordVisibility = function(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('svg path');
    
    if (input.type === "password") {
        // Passwort anzeigen
        input.type = "text";
        // Icon zu "Auge durchgestrichen" (Verstecken) ändern
        icon.setAttribute("d", "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.454 10.454 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88");
        btn.classList.add("text-indigo-600"); // Optional: Farbe ändern wenn sichtbar
    } else {
        // Passwort verstecken
        input.type = "password";
        // Icon zu "Auge" (Anzeigen) ändern
        icon.setAttribute("d", "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z M12 9a3 3 0 100 6 3 3 0 000-6z");
        btn.classList.remove("text-indigo-600");
    }
}

// ui.js - Am Ende einfügen

// --- RATING / REVIEW LOGIC ---

function checkAndAskForReview(flightCount) {
    // 1. Prüfen, ob schon mal gefragt wurde (Local Storage)
    const hasRated = localStorage.getItem("aviosphere_has_rated");
    if (hasRated === "true") return;

    // 2. Trigger-Bedingung: Genau 5 Flüge (oder ein Vielfaches, wenn du willst)
    // Wir fragen nur einmalig bei Erreichen der 5.
    if (flightCount === 5) {
        setTimeout(() => {
            document.getElementById("rating-modal").classList.remove("hidden");
        }, 2000); // 2 Sekunden Verzögerung nach dem Speichern für besseren Effekt
    }
}

function handleRatingAction(action) {
    const modal = document.getElementById("rating-modal");
    
    // Dein Android Package Name (MUSS ANGEPASST WERDEN!)
    const ANDROID_PACKAGE_NAME = "com.manab.flightbook"; // <--- HIER DEINE ID EINTRAGEN!
    const SUPPORT_EMAIL = "support@aviosphere.com"; // <--- DEINE EMAIL

    if (action === 'rate') {
        // Fall A: User will bewerten -> Play Store öffnen
        localStorage.setItem("aviosphere_has_rated", "true"); // Nicht mehr fragen
        
        // Versuche nativen Market-Link, Fallback auf HTTPS
        const isAndroid = /Android/i.test(navigator.userAgent);
        if (isAndroid) {
            window.location.href = `market://details?id=${ANDROID_PACKAGE_NAME}`;
        } else {
            window.open(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`, '_blank');
        }
        modal.classList.add("hidden");

    } else if (action === 'feedback') {
        // Fall B: User hat Kritik -> Email öffnen
        localStorage.setItem("aviosphere_has_rated", "true"); // Auch hier nicht nerven
        window.location.href = `mailto:${SUPPORT_EMAIL}?subject=Feedback AvioSphere App`;
        modal.classList.add("hidden");

    } else {
        // Fall C: Schließen (Später vielleicht nochmal fragen? Hier: erstmal merken "gefragt")
        // Wenn du willst, dass er später nochmal gefragt wird (z.B. bei 10 Flügen), 
        // setze hier NICHT "aviosphere_has_rated".
        // Wir setzen es hier auf "true", damit er Ruhe hat.
        localStorage.setItem("aviosphere_has_rated", "true"); 
        modal.classList.add("hidden");
    }
}

// ui.js - Am Ende einfügen

/**
 * Zentrale Funktion zum Teilen von Base64-Bildern
 * Funktioniert für Globus UND HTML-Screenshots
 */
async function shareImageBase64(dataURL, filenamePrefix = "aviosphere_share") {
    // 1. Visuelles Feedback
    showMessage(
      getTranslation("share.prepTitle") || "Moment...",
      getTranslation("share.prepDesc") || "Bild wird aufbereitet 📸",
      "info"
    );

    const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

    if (isNative) {
        try {
            const { Share, Filesystem } = Capacitor.Plugins;

            if (!Filesystem || !Share) {
                throw new Error("Plugins fehlen.");
            }

            // A) Base64 Header entfernen und Dateityp dynamisch erkennen
            const mimeType = dataURL.split(';')[0].split(':')[1]; 
            const ext = mimeType === 'image/jpeg' ? '.jpg' : '.png';
            const base64Data = dataURL.split(',')[1];
            
            const fileName = `${filenamePrefix}_${new Date().getTime()}${ext}`;

            // B) Datei schreiben (Das Nadelöhr! Mit JPEG flutscht es hier jetzt durch)
            const result = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: 'CACHE'
            });

            // C) Teilen
            await Share.share({
                title: getTranslation("share.statsTitle") || 'AvioSphere Stats',
                text: getTranslation("share.statsText") || 'Meine Flugstatistik auf AvioSphere! ✈️📊',
                files: [result.uri]
            });

        } catch (e) {
            console.error("Fehler beim Teilen:", e);
            if (e.message !== 'Share canceled') {
                showMessage(
                  getTranslation("share.errorTitle") || "Ups",
                  (getTranslation("share.errorDesc") || "Fehler beim Teilen: {error}").replace("{error}", e.message),
                  "error"
                );
            }
        }
    } else {
        // Web Fallback (für den PC)
        
        // Dateiendung dynamisch auslesen (.jpg oder .png)
        const mimeType = dataURL.split(';')[0].split(':')[1]; 
        const ext = mimeType === 'image/jpeg' ? '.jpg' : '.png';
        
        const link = document.createElement("a");
        link.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}${ext}`; // Nutzt jetzt die korrekte Endung
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showMessage(
          getTranslation("share.successTitle") || "Gespeichert",
          getTranslation("share.downloaded") || "Bild wurde heruntergeladen.",
          "success"
        );
    }
}

// ==========================================
// SHARE STATS SCREENSHOT
// ==========================================
window.shareStatsScreenshot = async function() {
    const statsPanel = document.getElementById("statistics-panel");
    if (!statsPanel) return;

    try {
        if (typeof showMessage === 'function') {
            showMessage(getTranslation("share.prepTitle") || "Moment...", getTranslation("share.prepDesc") || "Bild wird aufbereitet 📸", "info");
        }

        const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
        const isDark = document.documentElement.classList.contains('dark');
        const bgColor = isDark ? '#111827' : '#f8f9fa';

        const liveSelect = document.getElementById("stat-year-select");
        let selectedText = "";
        if (liveSelect && liveSelect.selectedIndex >= 0) {
            selectedText = liveSelect.options[liveSelect.selectedIndex].text;
        }

        const canvas = await html2canvas(statsPanel, {
            useCORS: true,
            allowTaint: false,
            backgroundColor: isNative ? bgColor : null, 
            scale: window.innerWidth < 768 ? 2 : 2,
            
            onclone: function(clonedDoc) {
                // 1. Dropdown ersetzen (für die schöne Optik)
                const clonedSelect = clonedDoc.getElementById("stat-year-select");
                if (clonedSelect && selectedText) {
                    const span = clonedDoc.createElement("span");
                    span.textContent = selectedText;
                    span.className = "text-sm font-black text-on-surface dark:text-white";
                    clonedSelect.parentNode.replaceChild(span, clonedSelect);
                }

                // 2. 🚀 DER MAGISCHE FIX FÜR DEN "ß"-BUG (IndexSizeError)
                // Wir suchen alles was "uppercase" ist, und machen es als echten Text groß!
                const uppercaseElements = clonedDoc.querySelectorAll('.uppercase');
                uppercaseElements.forEach(el => {
                    // Nur anwenden, wenn es sich um reine Textelemente handelt (wie unsere <p> Tags)
                    if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
                        el.classList.remove('uppercase');
                        el.textContent = el.textContent.toUpperCase(); // Macht aus "ß" ein echtes "SS" (24 Zeichen)
                    }
                });
            }
        });

        const dataURL = isNative 
            ? canvas.toDataURL("image/jpeg", 0.9) 
            : canvas.toDataURL("image/png");
        
        await shareImageBase64(dataURL, "aviosphere_stats");

    } catch (e) {
        console.error("html2canvas Fehler:", e);
        if (typeof showMessage === 'function') {
            showMessage(
              getTranslation("toast.errorTitle") || "Fehler",
              getTranslation("share.statImageError") || "Konnte Statistik-Bild nicht erstellen.",
              "error"
            );
        }
    }
};

// ui.js - Am Ende einfügen

async function shareInfoModalScreenshot() {
    // Wir nehmen den ganzen Body auf, damit man den Kontext (Globus/Hintergrund) sieht.
    // Das Info-Modal liegt ja über allem.
    
    // UI Aufräumen: Wir wollen die Schließen-Buttons im Modal für das Foto verstecken
    const modal = document.getElementById('info-modal');
    const buttons = modal.querySelectorAll('button');
    buttons.forEach(b => b.style.visibility = 'hidden');

    try {
        const canvas = await html2canvas(document.body, {
            useCORS: true,
            // Wir beschränken den Bereich evtl. auf den Viewport, 
            // aber document.body ist meist okay für Overlays.
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            x: window.scrollX,
            y: window.scrollY,
            width: window.innerWidth,
            height: window.innerHeight,
            scale: 2
        });

        const dataURL = canvas.toDataURL("image/png");
        await shareImageBase64(dataURL, "aviosphere_details");

    } catch (e) {
        console.error("Screenshot Fehler:", e);
        showMessage(
          getTranslation("toast.errorTitle") || "Fehler",
          getTranslation("share.imageError") || "Konnte Bild nicht erstellen.",
          "error"
        );
    } finally {
        // Buttons wieder anzeigen
        buttons.forEach(b => b.style.visibility = 'visible');
    }
}

/**
 * Steuert das Öffnen und Schließen des neuen Login Bottom-Sheets / Modals
 * @param {boolean} show - true zum Öffnen, false zum Schließen
 */
window.toggleAuthSheet = function(show) {
    const backdrop = document.getElementById("auth-sheet-backdrop");
    const panel = document.getElementById("auth-sheet-panel");

    if (!backdrop || !panel) return;

    if (show) {
        // Einblenden: Wir entfernen den unsichtbaren Schutzschild
        backdrop.classList.remove("pointer-events-none", "opacity-0");
        backdrop.classList.add("opacity-100");

        // Panel rein-sliden & klickbar machen
        panel.classList.remove("translate-y-full", "md:scale-95", "md:opacity-0", "pointer-events-none");
    } else {
        // Ausblenden: Wir setzen den Schutzschild wieder
        backdrop.classList.remove("opacity-100");
        backdrop.classList.add("opacity-0", "pointer-events-none");

        // Panel raus-sliden & unklickbar machen
        panel.classList.add("translate-y-full", "md:scale-95", "md:opacity-0", "pointer-events-none");
        
        // Fehler-Meldungen zurücksetzen beim Schließen
        const errorText = document.getElementById("auth-error");
        if(errorText) errorText.textContent = "";
    }
};

/**
 * Erstellt einen Screenshot der digitalen Bordkarte (Tagebuch) und teilt diesen.
 */
async function shareFlightDetailsScreenshot() {
    const modalContent = document.getElementById('fd-modal-content');
    const scrollArea = modalContent.querySelector('.overflow-y-auto');
    if (!modalContent || !scrollArea) return;

    // 1. UI Aufräumen: Buttons KOMPLETT aus dem DOM nehmen (Android hakt sonst beim Blur-Effekt)
    const actionBtns = document.getElementById('fd-action-buttons');
    const closeBtn = document.getElementById('fd-close-btn');
    const prevBtn = document.getElementById('fd-prev-btn'); // ⬅️ NEU
    const nextBtn = document.getElementById('fd-next-btn'); // ➡️ NEU
    
    // Original-Zustand merken
    const prevBtnOrig = prevBtn ? prevBtn.style.display : '';
    const nextBtnOrig = nextBtn ? nextBtn.style.display : '';

    if (actionBtns) actionBtns.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';
    if (prevBtn) prevBtn.style.display = 'none'; // ⬅️ NEU
    if (nextBtn) nextBtn.style.display = 'none'; // ➡️ NEU

    showMessage(getTranslation("share.prepTitle") || "Moment...", getTranslation("share.prepDescBoardingPass") || "Bordkarte wird exportiert...", "info");

    // 2. PARALLELER BILDER-PROXY (Nur für kleine, fremde Bilder!)
    const images = modalContent.querySelectorAll('img');
    const originalSrcs = new Map();
    const fetchPromises = []; 

    for (let img of images) {
        if (img.src && img.src.startsWith('http') && !img.src.includes(window.location.host) && !img.src.includes('supabase.co')) { 
            originalSrcs.set(img, img.src);
            const proxyJob = (async () => {
                try {
                    const fetchUrl = `https://corsproxy.io/?url=${encodeURIComponent(img.src)}`;
                    const response = await fetch(fetchUrl);
                    if (!response.ok) throw new Error("Netzwerkfehler");
                    const blob = await response.blob();
                    const base64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                    img.src = base64; 
                } catch (err) {
                    img.crossOrigin = "anonymous";
                }
            })();
            fetchPromises.push(proxyJob);
        }
    }

    await Promise.all(fetchPromises);

    const originalMaxHeight = modalContent.style.maxHeight;
    const originalOverflow = scrollArea.style.overflowY;
    modalContent.style.maxHeight = 'none';
    scrollArea.style.overflowY = 'visible';

    // 🚀 NEU: Finde heraus, wo wir sind (Handy oder PC?)
    const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
    const isDark = document.documentElement.classList.contains('dark');
    const bgColor = isDark ? '#111827' : '#f3f4f6'; // gray-900 für dark, gray-100 für light

    try {
        // 3. Screenshot machen (mit Performance-Boost)
        const canvas = await html2canvas(modalContent, {
            useCORS: true, 
            allowTaint: false, 
            // PC: Transparente Ecken (null) | Handy: Feste Farbe für das JPEG
            backgroundColor: isNative ? bgColor : null, 
            scale: window.innerWidth < 768 ? 1 : 2 
        });

        // 🚀 DER GAMECHANGER: Dynamisches Format!
        // Handy = JPG (Winzige Datei, flutscht in Millisekunden durch die Bridge)
        // PC = PNG (Verlustfreie Qualität mit perfekten Kanten)
        const dataURL = isNative 
            ? canvas.toDataURL("image/jpeg", 0.85) 
            : canvas.toDataURL("image/png");
        
        await shareImageBase64(dataURL, "aviosphere_boardingpass");

    } catch (e) {
        console.error("Screenshot Fehler:", e);
        showMessage(getTranslation("toast.errorTitle") || "Fehler", getTranslation("share.imageError") || "Konnte Bild nicht erstellen.", "error");
    } finally {
        modalContent.style.maxHeight = originalMaxHeight;
        scrollArea.style.overflowY = originalOverflow;
        
        originalSrcs.forEach((src, img) => {
            img.src = src;
            img.removeAttribute('crossOrigin');
        });
        
        // Buttons wieder einblenden
        if (actionBtns) actionBtns.style.display = 'flex';
        if (closeBtn) closeBtn.style.display = 'block';
        if (prevBtn) prevBtn.style.display = prevBtnOrig; // ⬅️ NEU
        if (nextBtn) nextBtn.style.display = nextBtnOrig; // ➡️ NEU
    }
}

// ==========================================
// PLUS BUTTON & FLUG ERFASSEN MODALS LOGIC
// ==========================================
window.openAddMenu = function() {
    const modal = document.getElementById('add-action-modal');
    const content = document.getElementById('add-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex'); // 🚀 NEU: Aktiviert das korrekte Layout
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        if (window.innerWidth < 640) {
            content.classList.remove('translate-y-full');
        } else {
            content.classList.remove('scale-95');
        }
    }, 10);
};

window.closeAddMenu = function() {
    const modal = document.getElementById('add-action-modal');
    const content = document.getElementById('add-modal-content');
    modal.classList.add('opacity-0');
    if (window.innerWidth < 640) {
        content.classList.add('translate-y-full');
    } else {
        content.classList.add('scale-95');
    }
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex'); // 🚀 NEU: Wieder aufräumen
    }, 300);
};

window.openAddFlightModal = function() {
    const modal = document.getElementById('add-flight-modal');
    const content = document.getElementById('add-flight-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex'); // Zwingend notwendig für die Zentrierung!
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        if (content) {
            if (window.innerWidth < 640) {
                content.classList.remove('translate-y-full'); // Auf dem Handy von unten
            } else {
                content.classList.remove('scale-95'); // Am PC wie ein Pop-Up
            }
        }
    }, 10);
};

window.closeAddFlightModal = function() {
    const modal = document.getElementById('add-flight-modal');
    const content = document.getElementById('add-flight-modal-content');
    modal.classList.add('opacity-0');
    if (content) {
        if (window.innerWidth < 640) {
            content.classList.add('translate-y-full');
        } else {
            content.classList.add('scale-95');
        }
    }
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex'); 
    }, 300);
};

// ==========================================
// SUB-NAVIGATION LOGIC (TAB 4 & 5)
// ==========================================
window.switchAnalyticsView = function(view) {
    const views = ['stats', 'charts', 'logbook'];
    
    views.forEach(v => {
        const btn = document.getElementById(`analytics-view-${v}`);
        const container = document.getElementById(
            v === 'stats' ? 'analytics-stats-container' : 
            v === 'charts' ? 'analytics-graphs-container' : 
            'analytics-logbook-container'
        );
        
        if (!btn || !container) return;

        if (v === view) {
            // 🚀 BUGHUNT FIX: Die neuen schmalen Klassen beim AKTIVEN Button anwenden
            btn.className = 'flex-shrink-0 px-4 sm:px-6 py-2.5 text-sm font-bold rounded-xl transition-all bg-surface-container-lowest dark:bg-slate-700 text-on-surface dark:text-white shadow-sm flex items-center justify-center gap-2';
            container.classList.remove('hidden');
        } else {
            // 🚀 BUGHUNT FIX: Die neuen schmalen Klassen beim INAKTIVEN Button anwenden
            btn.className = 'flex-shrink-0 px-4 sm:px-6 py-2.5 text-sm font-bold rounded-xl transition-all text-on-surface/60 hover:text-on-surface dark:text-slate-400 dark:hover:text-white hover:bg-surface-container-lowest dark:hover:bg-slate-700 flex items-center justify-center gap-2';
            container.classList.add('hidden');
        }
    });

    // 🚀 BUGHUNT FIX: Share-Button nur im "Statistiken"-Tab anzeigen
    const shareBtn = document.getElementById('analytics-share-btn');
    if (shareBtn) {
        if (view === 'stats') {
            shareBtn.classList.remove('hidden');
            shareBtn.classList.add('flex'); // Da der Button original "flex" nutzt
        } else {
            shareBtn.classList.add('hidden');
            shareBtn.classList.remove('flex');
        }
    }

    // Funktionen feuern
    if (view === 'logbook' && typeof renderLogbookView === 'function') {
        renderLogbookView("aircraftType");
    } else if (view === 'charts' && typeof getFlights === 'function' && typeof updateCharts === 'function') {
        // Charts dürfen nur gezeichnet werden, wenn sie sichtbar sind!
        getFlights().then(f => updateCharts(f, typeof currentChartTimeframe !== 'undefined' ? currentChartTimeframe : 'year'));
    }
};

window.switchProfileView = function(view) {
    const views = ['badges', 'community', 'settings'];
    
    // 🚀 BUGHUNT FIX: Wir trennen Layout-Klassen von Farb-Klassen!
    // Basis-Layout (Das "Gummi"-Layout, das niemals überschrieben werden darf)
    const baseClasses = 'flex-auto px-3 py-2 sm:py-2.5 text-[12px] sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap';
    
    // Farben für den gerade aktiven Tab
    const activeClasses = 'bg-surface-container-lowest dark:bg-slate-700 text-on-surface dark:text-white shadow-sm';
    
    // Farben für die inaktiven Tabs
    const inactiveClasses = 'text-on-surface/60 hover:text-on-surface dark:text-slate-400 dark:hover:text-white hover:bg-surface-container-lowest dark:hover:bg-slate-700';
    
    views.forEach(v => {
        const btn = document.getElementById(`profil-view-${v}`);
        const container = document.getElementById(`profile-${v}-content`);
        
        if (!btn || !container) return;

        if (v === view) {
            // Kombiniere Basis-Layout + Aktive Farben
            btn.className = `${baseClasses} ${activeClasses}`;
            container.classList.remove('hidden');
        } else {
            // Kombiniere Basis-Layout + Inaktive Farben
            btn.className = `${baseClasses} ${inactiveClasses}`;
            container.classList.add('hidden');
        }
    });

    // Funktionen feuern
    if (view === 'badges' && typeof updateAchievements === 'function') {
        updateAchievements();
    } else if (view === 'community' && typeof loadLeaderboard === 'function') {
        loadLeaderboard();
    }
};

// ==========================================
// TIMELINE SUB-NAVIGATION LOGIC
// ==========================================
window.switchTimelineView = function(view) {
    const btnFlights = document.getElementById('timeline-view-flights');
    const btnTrips = document.getElementById('timeline-view-trips');
    const containerFlights = document.getElementById('timeline-flights-container');
    const containerTrips = document.getElementById('timeline-trips-container');
    
    const mapDetails = document.getElementById('last-flight-map-details');
    const mapButtons = document.getElementById('timeline-map-buttons-container');
    const chronicleControls = document.getElementById('chronicle-controls-container');
    
    // 🚀 NEU: Den Container des großen PDF-Buttons identifizieren
    const printBtnContainer = document.getElementById('print-book-btn')?.parentElement;

    if (!btnFlights || !btnTrips) return;

    if (view === 'flights') {
        // Einzelflüge aktiv
        btnFlights.className = 'flex-1 sm:flex-none px-6 py-2.5 text-sm font-bold rounded-xl transition-all bg-surface-container-lowest dark:bg-slate-700 text-on-surface dark:text-white shadow-sm flex items-center justify-center gap-2';
        btnTrips.className = 'flex-1 sm:flex-none px-6 py-2.5 text-sm font-bold rounded-xl transition-all text-on-surface/60 hover:text-on-surface dark:text-slate-400 dark:hover:text-white hover:bg-surface-container-lowest dark:hover:bg-slate-700 flex items-center justify-center gap-2';
        
        containerFlights.classList.remove('hidden');
        containerTrips.classList.add('hidden');
        
        // Elemente wieder einblenden
        if (mapDetails) mapDetails.classList.remove('hidden');
        if (mapButtons) mapButtons.classList.remove('hidden');
        if (printBtnContainer) printBtnContainer.classList.remove('hidden'); // Großen Button wieder zeigen
        
        if (chronicleControls && window.isAllRoutesViewActive) {
             chronicleControls.classList.remove('hidden');
        }

        setTimeout(() => { 
            if (typeof map !== 'undefined' && map) map.invalidateSize(); 
        }, 50);

    } else {
        // Reisen aktiv
        btnTrips.className = 'flex-1 sm:flex-none px-6 py-2.5 text-sm font-bold rounded-xl transition-all bg-surface-container-lowest dark:bg-slate-700 text-on-surface dark:text-white shadow-sm flex items-center justify-center gap-2';
        btnFlights.className = 'flex-1 sm:flex-none px-6 py-2.5 text-sm font-bold rounded-xl transition-all text-on-surface/60 hover:text-on-surface dark:text-slate-400 dark:hover:text-white hover:bg-surface-container-lowest dark:hover:bg-slate-700 flex items-center justify-center gap-2';
        
        containerFlights.classList.add('hidden');
        containerTrips.classList.remove('hidden');
        
        // Elemente verstecken!
        if (mapDetails) mapDetails.classList.add('hidden');
        if (mapButtons) mapButtons.classList.add('hidden');
        if (printBtnContainer) printBtnContainer.classList.add('hidden'); // Großen Button ausblenden
        if (chronicleControls) chronicleControls.classList.add('hidden');
        
        if (window.animationState === "running" || window.animationState === "paused") {
            if (typeof stopChronicle === 'function') stopChronicle();
        }

        if (typeof renderTripManager === 'function') {
            renderTripManager();
        }
    }
};

window.switchAchievementsView = function(view) {
    const btnBadges = document.getElementById('toggle-achievements-badges');
    const btnRecords = document.getElementById('toggle-achievements-records');
    
    // Klassen zurücksetzen
    [btnBadges, btnRecords].forEach(btn => {
        btn.className = 'px-5 py-1.5 rounded-lg text-on-surface/60 hover:text-on-surface dark:text-slate-400 dark:hover:text-white transition-all';
    });

    // Aktiven Button stylen und Container umschalten
    if (view === 'badges') {
        btnBadges.className = 'px-5 py-1.5 rounded-lg bg-surface-container-lowest dark:bg-slate-600 shadow-sm text-primary dark:text-indigo-300 transition-all';
        document.getElementById('achievements-grid-container').classList.remove('hidden');
        document.getElementById('records-grid-container').classList.add('hidden');
    } else {
        btnRecords.className = 'px-5 py-1.5 rounded-lg bg-surface-container-lowest dark:bg-slate-600 shadow-sm text-primary dark:text-indigo-300 transition-all';
        document.getElementById('achievements-grid-container').classList.add('hidden');
        document.getElementById('records-grid-container').classList.remove('hidden');
    }
};

// ==========================================
// KARTEN-TOGGLE LOGIC FIX
// ==========================================
window.toggleAllRoutesView = async function() {
    // 1. Status umschalten
    window.isAllRoutesViewActive = !window.isAllRoutesViewActive;

    // 2. Button UI anpassen (Beschriftung = Ziel der Aktion)
    const btn = document.getElementById("toggle-map-view-btn");
    if (btn) {
        if (window.isAllRoutesViewActive) {
            // Wir zeigen gerade alle Routen -> Button bietet Rückkehr zur Einzelansicht an
            btn.innerHTML = `
                <span class="material-symbols-outlined text-3xl text-primary dark:text-indigo-400 group-hover:scale-110 transition-transform">location_on</span>
                <span class="text-sm font-bold text-on-surface dark:text-white" data-i18n="singleView">${getTranslation("singleView") || "Einzelansicht"}</span>
            `;
            // Optional: Button-Hintergrund leicht einfärben, um "Aktiven Modus" zu zeigen
            btn.classList.add('bg-primary/10', 'dark:bg-indigo-900/40');
        } else {
            // Wir zeigen die Einzelansicht -> Button bietet "Alle Routen" an
            btn.innerHTML = `
                <span class="material-symbols-outlined text-3xl text-primary dark:text-indigo-400 group-hover:scale-110 transition-transform">map</span>
                <span class="text-sm font-bold text-on-surface dark:text-white" data-i18n="allRoutes">${getTranslation("allRoutes") || "Alle Routen"}</span>
            `;
            btn.classList.remove('bg-primary/10', 'dark:bg-indigo-900/40');
        }
    }

    // 3. Daten für die Karte holen
    let flightsForMap = (typeof isDemoMode !== 'undefined' && isDemoMode) ? window.flights : (currentlyFilteredFlights || await getFlights());

    // 4. Karte aktualisieren
    if (window.isAllRoutesViewActive) {
        if (typeof drawAllRoutesOnMap === 'function') drawAllRoutesOnMap(flightsForMap);
    } else {
        // Zurück zur Einzelansicht des letzten Flugs
        let flightForMap = flightsForMap.find(f => f.id == globalLastFlightId) || flightsForMap[0];
        if (flightForMap && typeof drawRouteOnMap === 'function') {
             drawRouteOnMap(flightForMap.depLat, flightForMap.depLon, flightForMap.arrLat, flightForMap.arrLon, flightForMap.departure, flightForMap.arrival, flightForMap.depName, flightForMap.arrName, flightForMap);
        }
    }

    // 🚀 NEU: Chronik-Leiste ein-/ausblenden und ggf. stoppen
    const chronicleContainer = document.getElementById('chronicle-controls-container');
    if (chronicleContainer) {
        if (window.isAllRoutesViewActive) {
            chronicleContainer.classList.remove('hidden');
        } else {
            chronicleContainer.classList.add('hidden');
            // Wenn man auf Einzelansicht geht, Chronik hart abbrechen
            if (typeof stopTravelChronicle === 'function') stopTravelChronicle();
            if (typeof updateChronicleUI === 'function') updateChronicleUI('stopped');
        }
    }

};

// ==========================================
// CHRONIK STEUERUNG (Global & Kugelsicher)
// ==========================================
window.startChronicle = function() {
    if (typeof animateTravelChronicle === 'function') animateTravelChronicle();
    updateChronicleUI('playing');
};

window.pauseChronicle = function() {
    // 1. Echte Pause versuchen
    if (typeof pauseTravelChronicle === 'function') {
        pauseTravelChronicle();
    } 
    // 2. Fallback: Harter Stopp, falls Pause nicht in map.js existiert
    else if (typeof stopAnimation === 'function') {
        stopAnimation(); 
    }
    updateChronicleUI('paused');
};

window.resumeChronicle = function() {
    // 1. Echtes Resume versuchen
    if (typeof resumeTravelChronicle === 'function') {
        resumeTravelChronicle();
    } 
    // 2. Fallback: Neu starten
    else if (typeof animateTravelChronicle === 'function') {
        animateTravelChronicle(); 
    }
    updateChronicleUI('playing');
};

window.stopChronicle = async function() {
    // 1. Animation in der map.js abwürgen
    if (typeof stopTravelChronicle === 'function') stopTravelChronicle();
    else if (typeof stopAnimation === 'function') stopAnimation();
    
    // UI direkt auf Stopp setzen
    updateChronicleUI('stopped');
    
    // 2. Kurz warten (damit der Animations-Loop wirklich tot ist), dann Karte neu zeichnen
    setTimeout(async () => {
        if (window.isAllRoutesViewActive && typeof drawAllRoutesOnMap === 'function') {
            
            // Flüge sicher holen (Demo, Filter oder aus der Supabase DB)
            let flightsForMap = [];
            if (typeof isDemoMode !== 'undefined' && isDemoMode && window.flights) {
                flightsForMap = window.flights;
            } else if (typeof currentlyFilteredFlights !== 'undefined' && currentlyFilteredFlights) {
                flightsForMap = currentlyFilteredFlights;
            } else if (typeof getFlights === 'function') {
                flightsForMap = await getFlights(); // 🚀 BUGHUNT FIX: Warten auf die Datenbank!
            }
            
            // Karte final neu zeichnen
            if (flightsForMap && flightsForMap.length > 0) {
                drawAllRoutesOnMap(flightsForMap);
            }
        }
    }, 250); // 250 Millisekunden Puffer verhindern den Crash zwischen Löschen und Neuzeichnen
};

window.updateChronicleUI = function(state) {
    const playBtn = document.getElementById('play-chronicle-btn');
    const pauseBtn = document.getElementById('pause-chronicle-btn');
    const resumeBtn = document.getElementById('resume-chronicle-btn');
    const stopBtn = document.getElementById('stop-chronicle-btn');

    if(!playBtn) return;

    [playBtn, pauseBtn, resumeBtn, stopBtn].forEach(btn => btn.classList.add('hidden'));

    if (state === 'playing') {
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
    } else if (state === 'paused') {
        resumeBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
    } else {
        // state === 'stopped' oder idle
        playBtn.classList.remove('hidden');
    }
};

// ==========================================
// DYNAMISCHE PILOT-RÄNGE
// ==========================================

window.updateUserRank = function(flightCount) {
    const statusEl = document.getElementById('profile-header-status');
    if (!statusEl) return;

    let rank = getTranslation("ranks.beginner") || "Anfänger";
    let rankClass = "text-on-surface/60 dark:text-slate-400"; 
    let i18nKey = "ranks.beginner"; // 🚀 NEU: Key merken

    if (flightCount > 500) {
        rank = getTranslation("ranks.legend") || "Sky Legend 🏆";
        rankClass = "text-amber-500 dark:text-amber-400";
        i18nKey = "ranks.legend";
    } else if (flightCount > 100) {
        rank = getTranslation("ranks.seniorCaptain") || "Senior Captain";
        rankClass = "text-primary dark:text-indigo-400";
        i18nKey = "ranks.seniorCaptain";
    } else if (flightCount > 50) {
        rank = getTranslation("ranks.commander") || "Commander";
        i18nKey = "ranks.commander";
    } else if (flightCount > 25) {
        rank = getTranslation("ranks.firstOfficer") || "First Officer";
        i18nKey = "ranks.firstOfficer";
    } else if (flightCount > 15) {
        rank = getTranslation("ranks.frequentFlyer") || "Vielflieger";
        i18nKey = "ranks.frequentFlyer";
    } else if (flightCount > 10) {
        rank = getTranslation("ranks.hobbyist") || "Hobbypilot";
        rankClass = "text-primary dark:text-indigo-400";
        i18nKey = "ranks.hobbyist";
    }

    statusEl.textContent = rank;
    // 🚀 BUGHUNT FIX: Das Schildchen für den Sprachwechsler ankleben!
    statusEl.setAttribute("data-i18n", i18nKey); 
    statusEl.className = `px-3 py-1 bg-surface-container dark:bg-slate-800 rounded-full text-xs font-bold shadow-sm border border-outline-variant/10 ${rankClass}`;
};

// Modal Steuerung
window.openRankInfoModal = function() {
    const modal = document.getElementById('rank-info-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
};

window.closeRankInfoModal = function() {
    const modal = document.getElementById('rank-info-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
};