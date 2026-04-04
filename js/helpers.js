// =================================================================
// HELPER FUNCTIONS
// =================================================================

function toggleDarkMode() {
  document.documentElement.classList.toggle("dark");
  if (document.documentElement.classList.contains("dark")) {
    localStorage.setItem("theme", "dark");
  } else {
    localStorage.setItem("theme", "light");
  }
}

function getTranslation(key) {
  return key
    .split(".")
    .reduce(
      (obj, k) => (obj && obj[k] !== undefined ? obj[k] : key),
      translations
    );
}

var findAirport = function (input) {
  const normalizedInput = input.trim().toUpperCase();
  if (normalizedInput.length === 0) return null;

  if (
    (normalizedInput.length === 3 || normalizedInput.length === 4) &&
    airportData[normalizedInput]
  ) {
    return { code: normalizedInput, ...airportData[normalizedInput] };
  }
  for (const code in airportData) {
    if (airportData[code].name.toUpperCase().includes(normalizedInput)) {
      return { code: code, ...airportData[code] };
    }
  }
  return null;
};

var calculateDistance = function (lat1, lon1, lat2, lon2) {
  var R = 6371;
  var toRad = (d) => d * (Math.PI / 180);
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

var estimateFlightTime = function (distanceKm) {
  var hours = Math.floor(distanceKm / 850 + 0.5);
  var minutes = Math.round((distanceKm / 850 + 0.5 - hours) * 60);
  const hUnit = getTranslation("units.hoursShort") || "Std.";
  const mUnit = getTranslation("units.minutesShort") || "Min.";
  return `${hours} ${hUnit} ${minutes} ${mUnit}`;
};

function calculateCO2(distance, flightClass) {
  if (!distance || distance <= 0) return 0;
  let baseFactor;
  if (distance < 1000) baseFactor = 0.2;
  else if (distance < 3500) baseFactor = 0.15;
  else baseFactor = 0.12;

  let classMultiplier = 1.0;
  if (flightClass === "Business") classMultiplier = 2.5;
  if (flightClass === "First") classMultiplier = 4.0;

  const RFI_MULTIPLIER = 1.9;
  const co2_kg = distance * baseFactor * classMultiplier * RFI_MULTIPLIER;
  return Math.round(co2_kg);
}

function parseFlightTimeToMinutes(timeString, distance = 0) {
  let t = timeString;
  let flightMinutes = 0;

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
          // Fall 2: Textformate ('h', 'Std', 'hour', 'm', 'min')
          else if (/[a-z]/i.test(t)) {
              let h = 0, m = 0;
              const matchH = t.match(/(\d+(?:[.,]\d+)?)\s*(?:h|std|stunde|hour)/i);
              const matchM = t.match(/(\d+(?:[.,]\d+)?)\s*(?:m|min|minute)/i);
              
              if (matchH) h = parseFloat(matchH[1].replace(',', '.'));
              if (matchM) m = parseFloat(matchM[1].replace(',', '.'));
              
              if (matchH || matchM) {
                  flightMinutes = (h * 60) + m;
              } else {
                  // Notfall-Rettung für Formate wie "11 31"
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

  // Fallback: Falls keine Zeit eingegeben wurde, aber eine Distanz vorhanden ist!
  if (flightMinutes <= 0 && distance > 0) {
      flightMinutes = (distance / 800) * 60 + 30;
  }

  return Math.round(flightMinutes);
}

function extractIata(text) {
  const match = text.match(/\(([^)]+)\)/);
  return match ? match[1] : null;
}

function getContinentForAirport(iataCode) {
  const airport = airportData[iataCode];
  if (airport && airport.country_code) {
    return countryToContinent[airport.country_code] || null;
  }
  return null;
}

function getColorByDistance(distance) {
  if (distance < 1000) {
    return "#60a5fa"; // Hellblau (Kurzstrecke, < 1000km)
  } else if (distance < 2000) {
    return "#22c55e"; // Grün (Mittelstrecke 1, 1000-2000km)
  } else if (distance < 5000) {
    return "#facc15"; // Gelb (Mittelstrecke 2, 2000-5000km)
  } else if (distance < 9000) {
    return "#f97316"; // Orange (Langstrecke, 5000-9000km)
  } else {
    return "#ec4899"; // Pink/Rot (Ultra-Langstrecke, > 9000km)
  }
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function switchPlan(plan) {
  selectedPlan = plan;
  const config = pricingConfig[plan];
  const monthlyBtn = document.getElementById("plan-monthly-btn");
  const yearlyBtn = document.getElementById("plan-yearly-btn");
  
  const activeClasses = [
    "bg-white",
    "dark:bg-gray-600",
    "shadow-sm",
    "text-gray-900",
    "dark:text-white",
  ];
  const inactiveClasses = [
    "text-gray-500",
    "dark:text-gray-400",
    "hover:text-gray-900",
    "dark:hover:text-white",
  ];

  if (plan === "monthly") {
    monthlyBtn.classList.add(...activeClasses);
    monthlyBtn.classList.remove(...inactiveClasses);
    yearlyBtn.classList.remove(...activeClasses);
    yearlyBtn.classList.add("bg-transparent");
    yearlyBtn.classList.add(...inactiveClasses);
  } else {
    yearlyBtn.classList.remove("bg-transparent");
    yearlyBtn.classList.add(...activeClasses);
    yearlyBtn.classList.remove(...inactiveClasses);
    monthlyBtn.classList.remove(...activeClasses);
    monthlyBtn.classList.add(...inactiveClasses);
  }

  const amountEl = document.getElementById("premium-price-amount");
  const periodEl = document.getElementById("premium-price-period");
  
  if (amountEl) {
    // === 🚀 DIE SCHLAUE GOOGLE-SCHUTZ-WEICHE ===
    const isNativeApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
    
    if (isNativeApp && !window.nativePricesLoaded) {
        amountEl.textContent = "Lade Preis...";
        
        // ULTIMATIVER FALLBACK: Wenn nach 3 Sekunden immer noch keine Preise 
        // von RevenueCat da sind, beenden wir das Laden automatisch!
        setTimeout(() => {
            if (!window.nativePricesLoaded && amountEl.textContent === "Lade Preis...") {
                amountEl.textContent = "Im Store ansehen";
            }
        }, 3000);
        
    } else {
        amountEl.textContent = config.amount;
    }
    // ===================================
  }

  if (periodEl) {
    const translatedPeriod = getTranslation(config.periodKey);
    periodEl.textContent = translatedPeriod || config.fallbackPeriod;
    periodEl.setAttribute("data-i18n", config.periodKey);
  }
}

function updateLockVisuals() {
  const globeBtn = document.getElementById("show-globe-btn");
  const autopilotDetails = document
    .querySelector('[data-i18n="autoPilot"]')
    ?.closest("details");
  const printBtn = document.getElementById("print-book-btn");
  const photoLabel = document.querySelector('label[for="flightPhoto"]');

  if (currentUserSubscription === "free") {
    const lockElement = (element) => {
      if (!element) return;
      element.classList.remove("hidden");
      element.classList.add("opacity-70", "cursor-pointer");
      if (!element.querySelector(".lock-icon")) {
        const lockSpan = document.createElement("span");
        lockSpan.className = "lock-icon ml-2 text-xs";
        lockSpan.innerHTML = "🔒";
        if (element.tagName === "BUTTON" || element.tagName === "LABEL") {
          element.appendChild(lockSpan);
        } else if (element.tagName === "DETAILS") {
          const summary = element.querySelector("summary");
          if (summary) summary.appendChild(lockSpan);
        }
      }
    };
    lockElement(globeBtn);
    lockElement(printBtn);
    if (photoLabel) {
      lockElement(photoLabel);
      photoLabel.classList.add("relative");
    }
    if (autopilotDetails) {
      autopilotDetails.classList.remove("hidden");
      autopilotDetails.querySelector("summary").classList.add("opacity-70");
      const summary = autopilotDetails.querySelector("summary");
      if (summary && !summary.querySelector(".lock-icon")) {
        summary.innerHTML += ' <span class="lock-icon">🔒</span>';
      }
    }
  } else {
    const unlockElement = (element) => {
      if (!element) return;
      element.classList.remove("hidden", "opacity-70", "relative");
      const lock = element.querySelector(".lock-icon");
      if (lock) lock.remove();
    };
    unlockElement(globeBtn);
    unlockElement(printBtn);
    unlockElement(photoLabel);
    if (autopilotDetails) {
      autopilotDetails.classList.remove("hidden");
      const summary = autopilotDetails.querySelector("summary");
      if (summary) {
        summary.classList.remove("opacity-70");
        const lock = summary.querySelector(".lock-icon");
        if (lock) lock.remove();
      }
    }
  }
// --- NEU: Profil-Tab immer synchronisieren ---
    const profileBadge = document.getElementById('profile-status-badge');
    const profileUpgBtn = document.getElementById('profile-upgrade-btn');
    const profileManBtn = document.getElementById('profile-manage-btn');

    if (profileBadge) {
        if (typeof currentUserSubscription !== 'undefined' && currentUserSubscription === "pro") {
            profileBadge.textContent = "PRO";
            profileBadge.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800";
            if (profileUpgBtn) profileUpgBtn.classList.add('hidden');
            if (profileManBtn) profileManBtn.classList.remove('hidden');
        } else {
            profileBadge.textContent = "FREE";
            profileBadge.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-600";
            if (profileUpgBtn) profileUpgBtn.classList.remove('hidden');
            if (profileManBtn) profileManBtn.classList.add('hidden');
        }
    }
}

/*
function manageSubscription() {
  // Später: window.location.href = "STRIPE_CUSTOMER_PORTAL_LINK";
  showMessage(
    "Info",
    "Hier wirst du später zu Stripe weitergeleitet, um zu kündigen oder Zahlungsdaten zu ändern.",
    "info"
  );
}
*/

async function manageSubscription() {
  // ✅ NEU: Für Android öffnen wir direkt die Play Store Abo-Verwaltung
  if (isNativeApp()) {
      // Deep Link zum Play Store (Subscriptions Bereich)
      window.location.href = "https://play.google.com/store/account/subscriptions";
      return;
  }
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const customerId = user?.user_metadata?.stripe_customer_id;

        if (!customerId) {
            showMessage("Info", getTranslation("messages.noStripeAccount") || "Aktives Play Store-Abo-Konto gefunden.", "info");
            return;
        }

        showMessage(
          getTranslation("toast.loadingTitle") || "Lade...", 
          getTranslation("messages.redirectingStripe"), 
          "info"
        );

        // ✅ NEU: Plattform-Check
        // Wir prüfen, ob wir nativ (Android) sind.
        const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
        
        // Wenn Native: "aviosphere://return"
        // Wenn Web: "https://aviosphere.com" (wird vom Backend Fallback erledigt, also null senden)
        const returnUrl = isNative ? 'aviosphere://return' : null;

        const response = await fetch(`${API_BASE_URL}/.netlify/functions/create-portal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                customerId,
                returnUrl // ✅ Wird mitgesendet
            })
        });
        
        if (!response.ok) throw new Error("Netzwerkfehler beim Portal-Aufruf");

        const result = await response.json();
        
        if (result.url) {
            // ✅ KORREKTUR 2: Capacitor Browser nutzen (falls verfügbar)
            if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.Browser) {
                await Capacitor.Plugins.Browser.open({ url: result.url });
            } else {
                // Fallback für Web
                window.location.href = result.url;
            }
        } else {
            throw new Error("Keine URL von Stripe erhalten");
        }

    } catch (e) {
        console.error(e);
        showMessage("Fehler", "Konnte Portal nicht öffnen.", "error");
    }
}

/**
 * Lädt die Übersetzungsdatei und startet die Übersetzung der Seite.
 * @param {string} lang - Der Sprachcode (z.B. "de" or "en").
 */
async function setLanguage(lang) {
  try {
    const response = await fetch(`locales/${lang}.json`);

    if (!response.ok) {
      throw new Error(`Netzwerk-Antwort war nicht OK: ${response.statusText}`);
    }

    translations = await response.json();
    currentLanguage = lang;
    localStorage.setItem("preferredLanguage", lang);

    // 1. Alle Texte übersetzen
    translatePage();

    // --- ✅ KUGELSICHERE LINK-UMSCHALTUNG (Ohne IDs) ---
    const isEn = (lang === 'en');
    
    // Findet ALLE Links mit "terms" im href (z.B. terms.html oder terms_en.html)
    document.querySelectorAll('a[href*="terms"]').forEach(a => {
        a.href = isEn ? "terms_en.html" : "terms.html";
    });
    
    // Findet ALLE Links mit "privacy" im href
    document.querySelectorAll('a[href*="privacy"]').forEach(a => {
        a.href = isEn ? "privacy_en.html" : "privacy.html";
    });
    // --- ENDE DYNAMISCHE LINKS ---


    // Schutzabfrage: Ab hier nur weiter, wenn App initialisiert (User eingeloggt)
    if (typeof isAppInitialized === 'undefined' || !isAppInitialized) {
      return; 
    }
    // ENDE Schutzabfrage

    // 2. Dynamische Inhalte der App aktualisieren (KUGELSICHER GEMACHT 🚀)
    const tabFluege = document.getElementById("tab-content-fluege");
    if (tabFluege && !tabFluege.classList.contains("hidden")) {
      if (typeof renderFlights === 'function') renderFlights();
    }
    
    const tabAchievements = document.getElementById("tab-content-achievements");
    if (tabAchievements && !tabAchievements.classList.contains("hidden")) {
      if (typeof updateAchievements === 'function') updateAchievements();
    }
    
    const tabLogbook = document.getElementById("tab-content-logbook");
    if (tabLogbook && !tabLogbook.classList.contains("hidden")) {
      const activeBtn = document.querySelector(".logbook-view-btn.active");
      let view = "aircraftType"; 
      if (activeBtn) {
        if (activeBtn.id.includes("airline")) view = "airline";
        if (activeBtn.id.includes("airport")) view = "airport";
      }
      if (typeof renderLogbookView === 'function') renderLogbookView(view);
    }
    
    const tabCharts = document.getElementById("tab-content-charts");
    if (tabCharts && !tabCharts.classList.contains("hidden")) {
      if (typeof getFlights === 'function' && typeof updateCharts === 'function') {
          const flights = await getFlights();
          updateCharts(flights, typeof currentChartTimeframe !== 'undefined' ? currentChartTimeframe : 'year');
      }
    }
    
    const tabHilfe = document.getElementById("tab-content-hilfe");
    if (tabHilfe && !tabHilfe.classList.contains("hidden")) {
      if (typeof renderHelpContent === 'function') renderHelpContent(); 
    }

  } catch (error) {
    console.error(`Sprachdatei ${lang}.json konnte nicht geladen werden:`, error);
  }
  
  if (typeof updateLockVisuals === 'function') updateLockVisuals();

  // --- NEU: Dynamische Ansichten nach Sprachwechsel sofort neu rendern ---
  
  // 1. Flugliste, Statistiken und Charts aktualisieren (behält Filter & Seite bei!)
  if (typeof renderFlights === 'function') {
      const flightsToRender = (typeof currentlyFilteredFlights !== 'undefined' && currentlyFilteredFlights) ? currentlyFilteredFlights : null;
      const page = typeof currentPage !== 'undefined' ? currentPage : 1;
      renderFlights(flightsToRender, null, page);
  }

  // 2. Reisen-Tab aktualisieren (falls der Nutzer sich gerade in diesem Tab befindet)
  const tabTrips = document.getElementById("tab-content-trips");
  if (typeof renderTripManager === 'function' && tabTrips && !tabTrips.classList.contains("hidden")) {
      renderTripManager();
  }

  // 3. Logbuch-Tab aktualisieren (Sicherheits-Check mit ?.)
  if (typeof renderLogbookView === 'function') {
      const analyticsTab = document.getElementById("tab-content-analytics");
      if (analyticsTab && !analyticsTab.classList.contains("hidden")) {
          if (document.getElementById("logbook-view-aircraft")?.classList.contains("bg-white")) renderLogbookView("aircraftType");
          else if (document.getElementById("logbook-view-airline")?.classList.contains("bg-white")) renderLogbookView("airline");
          else if (document.getElementById("logbook-view-airport")?.classList.contains("bg-white")) renderLogbookView("airport");
          else if (document.getElementById("logbook-view-registration")?.classList.contains("bg-white")) renderLogbookView("registration");
      }
  }

  // 🚀 NEU: 4. Upcoming-Widget aktualisieren
  if (typeof initUpcomingWidget === 'function') {
      initUpcomingWidget();
  }
  
  // 🚀 NEU: 5. Live-Widget aktualisieren (Damit "Gelandet" sofort zu "Landed" wird!)
  if (typeof refreshLiveFlightData === 'function') {
      refreshLiveFlightData();
  }

  // 🚀 NEU: 6. Piloten-Rang im Profil sofort übersetzen (KORRIGIERT!)
  if (typeof updateUserRank === 'function') {
      if (typeof allFlights !== 'undefined' && Array.isArray(allFlights)) {
          updateUserRank(allFlights.length);
      } else if (typeof getFlights === 'function') {
          getFlights().then(flights => {
              if(flights) updateUserRank(flights.length);
          });
      }
  }

}

/**
 * Geht durch die Seite und ersetzt alle data-i18n-Schlüssel mit dem Text der geladenen Sprache.
 */
function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");

    // --- NEUE LOGIK FÜR DYNAMISCHE INHALTE ---
    if (key === "mapVisualization") {
      const depName = element.getAttribute("data-dynamic-depName");

      // Prüft, ob dynamische Daten vorhanden sind
      if (depName) {
        // Ja: Baue den Text mit der NEUEN Sprache neu zusammen
        const template = getTranslation("mapVisualization"); // Holt die NEUE Sprachvorlage
        const translatedText = template
          .replace("{depName}", depName)
          .replace("{depCode}", element.getAttribute("data-dynamic-depCode"))
          .replace("{arrName}", element.getAttribute("data-dynamic-arrName"))
          .replace("{arrCode}", element.getAttribute("data-dynamic-arrCode"));
        element.textContent = translatedText;
      } else {
        // Nein: Nutze den statischen Fallback-Text (z.B. "Flugroute wird visualisiert.")
        element.textContent = getTranslation("mapInfo");
      }
      // --- ENDE NEUE LOGIK ---
    } else {
      // Standard-Logik für alle anderen Elemente
      const translation = getTranslation(key);
      if (translation) {
        if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
          element.placeholder = translation;
        } else {
          element.textContent = translation;
        }
      }
    }
  });
  // --- NEU: Titel-Attribute (Tooltips bei Icon-Buttons) übersetzen ---
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const key = element.getAttribute("data-i18n-title");
    const translation = getTranslation(key);
    if (translation) {
      element.title = translation; // Überschreibt nur den Hover-Text!
    }
  });
}

/**
 * ✅ NEU: Prüft zuverlässig, ob wir in der nativen Android/iOS App laufen.
 */
function isNativeApp() {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
}

/**
 * Tauscht die Links für rechtliche Dokumente (AGB, Datenschutz) 
 * dynamisch je nach gewählter Sprache aus.
 */
function updateLegalLinks(lang) {
    const isEn = (lang === 'en');
    
    // 1. AGB / Terms Links anpassen
    document.querySelectorAll('a[href="terms.html"], a[href="terms_en.html"]').forEach(a => {
        a.href = isEn ? "terms_en.html" : "terms.html";
    });
    
    // 2. Datenschutz / Privacy Links anpassen
    document.querySelectorAll('a[href="privacy.html"], a[href="privacy_en.html"]').forEach(a => {
        a.href = isEn ? "privacy_en.html" : "privacy.html";
    });
}

// ==========================================
// ✈️ AIRCRAFT TYPE MAPPING (ICAO -> IATA/Generic)
// ==========================================
window.normalizeAircraftCode = function(rawCode) {
    if (!rawCode) return "";
    
    const cleanCode = rawCode.trim().toUpperCase();

    // Optimiert für die API-Ninjas Datenbank!
    const aircraftMap = {
        // Airbus Narrowbodies
        "A20N": "A320",
        "A21N": "A321", 
        "A318": "A318",
        "A319": "A319",
        "A320": "A320",
        "A321": "A321",
        
        // Airbus Widebodies
        "A332": "A330-200",
        "A333": "A330-300",
        "A339": "A330-900", 
        "A343": "A340-300",
        "A346": "A340-600",
        "A359": "A350-900",
        "A35K": "A350-1000",
        "A388": "A380-800",

        // Boeing (API Ninjas bevorzugt oft die Schreibweise ohne "B")
        "B737": "737-800",
        "B738": "737-800", 
        "B739": "737-900",
        "B38M": "737 MAX 8", 
        "B39M": "737 MAX 9", 
        
        "B77W": "777-300ER", 
        "B77L": "777-200LR", 
        "B772": "777-200",
        "B773": "777-300",
        "B788": "787-8", 
        "B789": "787-9", 
        "B78X": "787-10", 
        "B744": "747-400", 
        "B748": "747-8", 
        
        // Embraer / Bombardier
        "E190": "190", // Oft besser erkannt
        "E195": "195",
        "E170": "170",
        "CRJ100ER": "CRJ100",
        "CRJ100": "CRJ100", 
        "CRJ200ER": "CRJ200",
        "CRJ200": "CRJ200",
    
    };

    return aircraftMap[cleanCode] || cleanCode;
};

// ==========================================
// 🌤️ PILOTEN-WETTER (METAR / TAF) LOGIK
// ==========================================

// 🚀 NEU: Zwei Caches (für fertige Ergebnisse und laufende Anfragen)
window.icaoCache = window.icaoCache || {};
window.icaoPromiseCache = window.icaoPromiseCache || {};

window.fetchAviationWeather = async function(airportCode) {
    if (!airportCode) return null;
    let icaoCode = airportCode.toUpperCase();
    
    // 1. IATA zu ICAO wandeln
    if (icaoCode.length === 3) {
        
        // A) Zuerst im fertigen Cache schauen
        if (window.icaoCache[icaoCode]) {
            icaoCode = window.icaoCache[icaoCode];
            
        // B) Lokale Datenbank (airportData)
        } else if (typeof airportData !== 'undefined' && airportData[icaoCode] && airportData[icaoCode].icao) {
            icaoCode = airportData[icaoCode].icao;
            window.icaoCache[airportCode.toUpperCase()] = icaoCode;
            
        // C) Netlify API fragen (mit Anti-DDoS-Schutz!)
        } else {
             try {
                 if (window.icaoPromiseCache[icaoCode]) {
                     icaoCode = await window.icaoPromiseCache[icaoCode];
                 } else {
                     const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
                     
                     // Die Anfrage als Promise verpacken
                     const fetchPromise = (async () => {
                         // 🚀 BUGHUNT FIX: Zufällige kleine Pause (200-700ms), damit API Ninjas nicht wegen "Too Many Requests" blockiert!
                         await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));
                         
                         const res = await fetch(`${baseUrl}/.netlify/functions/fetch-airport-details?code=${icaoCode}`);
                         if (!res.ok) {
                             console.warn(`🌤️ Wetter: Netlify API blockiert (429) für ${icaoCode}.`);
                             return null;
                         }
                         const json = await res.json();
                         if (json && json.data && json.data.length > 0 && json.data[0].icao) {
                             const foundIcao = json.data[0].icao;
                             window.icaoCache[icaoCode] = foundIcao;
                             return foundIcao;
                         }
                         return null;
                     })();
                     
                     window.icaoPromiseCache[icaoCode] = fetchPromise;
                     icaoCode = await fetchPromise;
                     
                     // 🚀 WICHTIG: Wenn es fehlschlug, den Cache löschen, damit es beim Neuladen der App wieder frisch versucht wird!
                     if (!icaoCode) {
                         delete window.icaoPromiseCache[airportCode.toUpperCase()];
                     }
                 }
                 
                 if (!icaoCode) return null;
                 
             } catch(e) {
                 console.warn(`🌤️ Wetter: Fehler bei ICAO Auflösung für ${icaoCode}:`, e);
                 delete window.icaoPromiseCache[airportCode.toUpperCase()];
                 return null; 
             }
        }
    }
    
    // 2. Wetterdaten von NOAA abrufen (Braucht 4-stelligen ICAO Code)
    try {
        // 🚀 BUGHUNT FIX: Wir MÜSSEN einen CORS-Proxy nutzen, da NOAA direkte Browser-Anfragen blockiert!
        const noaaUrl = `https://aviationweather.gov/api/data/metar?ids=${icaoCode}&format=json`;
        const proxiedUrl = `https://corsproxy.io/?url=${encodeURIComponent(noaaUrl)}`;

        const res = await fetch(proxiedUrl);
        if (!res.ok) return null;
        
        const data = await res.json();
        if (data && data.length > 0) {
            return data[0]; 
        } else {
            console.warn(`🌤️ Wetter: NOAA hat leider kein Wetter für den Flughafen "${icaoCode}" gemeldet.`);
        }
    } catch(e) {
        console.warn("🌤️ NOAA Wetter-API nicht erreichbar:", e);
    }
    
    return null;
};

window.buildWeatherWidgetHtml = function(weatherData, title) {
    if (!weatherData) return "";
    
    // 1. Flugregeln (Flight Rules) zu Farben zuordnen
    let dotColor = "bg-gray-500";
    let textColor = "text-gray-700 dark:text-gray-300";
    let catText = weatherData.fltcat || "UNK";
    
    if (catText === "VFR") { dotColor = "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"; textColor = "text-green-700 dark:text-green-400"; }
    else if (catText === "MVFR") { dotColor = "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"; textColor = "text-blue-700 dark:text-blue-400"; }
    else if (catText === "IFR") { dotColor = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"; textColor = "text-red-700 dark:text-red-400"; }
    else if (catText === "LIFR") { dotColor = "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"; textColor = "text-purple-700 dark:text-purple-400"; }

    // 2. Daten decodieren
    const windDir = weatherData.wdir ? `${weatherData.wdir}°` : "VRB";
    const windSpd = weatherData.wspd ? `${weatherData.wspd}kt` : "0kt";
    const temp = weatherData.temp ? `${weatherData.temp}°C` : "";
    
    // Optional: Sichtweite
    let vis = "";
    if (weatherData.visib) {
        vis = weatherData.visib === "10+" ? ">10km" : `${weatherData.visib}sm`;
    }

    return `
      <div class="flex flex-col bg-surface-container-low dark:bg-slate-900/80 p-3 rounded-2xl border border-outline-variant/10 dark:border-slate-700/50 relative group cursor-help transition-all hover:bg-surface-container dark:hover:bg-slate-800">
          
          <div class="flex justify-between items-center mb-2">
              <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface/50 dark:text-slate-400">${title}</span>
              <div class="flex items-center gap-1.5 bg-surface-container-lowest dark:bg-slate-950/50 px-2 py-0.5 rounded-full border border-outline-variant/5 dark:border-slate-700/50">
                  <span class="w-2 h-2 rounded-full ${dotColor} animate-pulse"></span>
                  <span class="text-[9px] font-black ${textColor}">${catText}</span>
              </div>
          </div>
          
          <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-bold text-on-surface dark:text-slate-200 flex items-center gap-1" title="Wind">
                  <span class="material-symbols-outlined text-[14px] text-primary/70">air</span> ${windDir} @ ${windSpd}
              </span>
              ${vis ? `
              <span class="text-xs font-bold text-on-surface dark:text-slate-200 flex items-center gap-1" title="Sichtweite">
                  <span class="material-symbols-outlined text-[14px] text-blue-500/70">visibility</span> ${vis}
              </span>` : ''}
              <span class="text-xs font-bold text-on-surface dark:text-slate-200 flex items-center gap-1" title="Temperatur">
                  <span class="material-symbols-outlined text-[14px] text-orange-500/70">thermostat</span> ${temp}
              </span>
          </div>

          <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[280px] p-3 bg-slate-800 text-slate-200 text-[10px] font-mono leading-relaxed rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-slate-700">
              <div class="text-indigo-400 font-bold mb-1 uppercase tracking-widest text-[8px] font-sans">Raw METAR Data</div>
              ${weatherData.rawOb}
              <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
          </div>
      </div>
    `;
};