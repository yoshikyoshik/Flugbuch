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

  // 1. Exakter Treffer beim IATA/ICAO-Code
  if (
    (normalizedInput.length === 3 || normalizedInput.length === 4) &&
    airportData[normalizedInput]
  ) {
    return { code: normalizedInput, ...airportData[normalizedInput] };
  }

  // 🚀 BUGHUNT FIX: Wenn exakt 3 Buchstaben (IATA-Code wie "DUB") gesucht werden,
  // NICHT in Namen suchen (verhindert, dass "DUB" in "Dubai" gefunden wird!).
  if (normalizedInput.length === 3) {
    return null;
  }

  // 2. Namenssuche nur bei längeren Eingaben (ab 4 Zeichen, z.B. "Frankfurt")
  for (const code in airportData) {
    if (airportData[code].name && airportData[code].name.toUpperCase().includes(normalizedInput)) {
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

function parseFlightTimeToMinutes(flightOrTimeString, distance = 0) {
  let t = flightOrTimeString;
  let flightMinutes = 0;

  // 🚀 NEU: Wenn ein ganzes Flug-Objekt übergeben wird, nutze zuerst fa_duration_minutes & Timestamps!
  if (t && typeof t === 'object') {
      const f = t;
      if (f.fa_duration_minutes && f.fa_duration_minutes > 0) {
          return Math.round(f.fa_duration_minutes);
      }
      if (!f.time && f.arr_time_ts && f.dep_time_ts && f.arr_time_ts > f.dep_time_ts) {
          const diff = Math.floor((f.arr_time_ts - f.dep_time_ts) / 60);
          if (diff > 0 && diff < 1500) return diff;
      }
      distance = f.distance || distance;
      t = f.time;
  }

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

window.formatFlightDuration = function(flight) {
  if (!flight) return "-";
  const hUnit = typeof getTranslation === 'function' ? getTranslation("units.hoursShort") || "Std." : "Std.";
  const mUnit = typeof getTranslation === 'function' ? getTranslation("units.minutesShort") || "Min." : "Min.";

  if (flight.fa_duration_minutes && flight.fa_duration_minutes > 0) {
      const hours = Math.floor(flight.fa_duration_minutes / 60);
      const mins = flight.fa_duration_minutes % 60;
      return `${hours} ${hUnit} ${mins} ${mUnit}`;
  }
  if (flight.time) {
      return flight.time.replace("Std.", hUnit).replace("Min.", mUnit);
  }
  if (flight.arr_time_ts && flight.dep_time_ts && flight.arr_time_ts > flight.dep_time_ts) {
      const diffMinutes = Math.floor((flight.arr_time_ts - flight.dep_time_ts) / 60);
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      return `${hours} ${hUnit} ${mins} ${mUnit}`;
  }
  return "-";
};

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
      // billing.js kümmert sich um Fallbacks, wir zeigen einfach nur an, was im config steht!
      amountEl.textContent = config.amount || (plan === 'monthly' ? "2,99 €" : "17,99 €");
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
            showMessage(getTranslation("toast.infoTitle") || "Info", getTranslation("messages.noStripeAccount") || "Aktives Play Store-Abo-Konto gefunden.", "info");
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
        showMessage(getTranslation("toast.errorTitle") || "Fehler", getTranslation("premium.portalError") || "Konnte Portal nicht öffnen.", "error");
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

    // 🚀 HIER EINBAUEN: Aktualisiert die Flagge & den Namen im neuen Profil-Dropdown
    const flagImg = document.getElementById("current-lang-flag");
    const textSpan = document.getElementById("current-lang-text");
    const langMap = { de: ['Deutsch', 'de'], en: ['English', 'gb'], es: ['Español', 'es'], ru: ['Русский', 'ru'], zh: ['中文', 'cn'] };
    if (flagImg && textSpan && langMap[lang]) {
        flagImg.src = `https://flagcdn.com/w80/${langMap[lang][1]}.png`;
        textSpan.textContent = langMap[lang][0];
    }
    // -------------------------------------------------------------------------

    // ================================================================
    // 🚀 NEU: Sprache an Supabase melden, damit der Push-Server sie kennt!
    // ================================================================
    if (typeof supabaseClient !== 'undefined') {
        supabaseClient.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                // Speichert das Kürzel (de, en, es...) im Profil des Nutzers
                supabaseClient.from('profiles').update({ language: lang }).eq('id', user.id).then();
            }
        });
    }
    // ================================================================

    // 1. Alle Texte übersetzen
    translatePage();

    // ================================================================
    // 🚀 BUGHUNT FIX: Das HTML-Dropdown-Menü visuell synchronisieren!
    // ================================================================
    const langSelect = document.getElementById("language-select"); // ⚠️ WICHTIG: Ersetze "language-select" durch die ECHTE ID deines <select> im HTML!
    if (langSelect) {
        langSelect.value = lang;
    }
    // ================================================================

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

  // 🚀 NEU: Sofortiges Neuladen der aktiven Logbuch-Ansicht (inkl. Länder) beim Sprachwechsel!
  if (typeof renderLogbookView === 'function') {
      const analyticsTab = document.getElementById("tab-content-analytics");
      if (analyticsTab && !analyticsTab.classList.contains("hidden")) {
          if (document.getElementById("logbook-view-country")?.classList.contains("active")) {
              renderLogbookView("country");
          } else if (document.getElementById("logbook-view-aircraft")?.classList.contains("active")) {
              renderLogbookView("aircraftType");
          } else if (document.getElementById("logbook-view-airline")?.classList.contains("active")) {
              renderLogbookView("airline");
          } else if (document.getElementById("logbook-view-airport")?.classList.contains("active")) {
              renderLogbookView("airport");
          } else if (document.getElementById("logbook-view-registration")?.classList.contains("active")) {
              renderLogbookView("registration");
          }
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
        } else if (element.id === "google-compliance-text") {
          // 🚀 BUGHUNT FIX: Erlaube HTML (Links) NUR für den Google-Disclaimer!
          element.innerHTML = translation; 
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

// ==========================================
// 🌍 ZENTRALER ICAO-ÜBERSETZER
// ==========================================
window.icaoCache = window.icaoCache || {};
window.icaoPromiseCache = window.icaoPromiseCache || {};

window.getIcaoCode = async function(airportCode) {
    if (!airportCode) return null;
    let icaoCode = airportCode.toString().trim().toUpperCase();
    
    if (icaoCode.length === 4) return icaoCode;

    // 🚀 Großes Offline-Lexikon (Spart API-Calls & verhindert 403-Fehler)
    const commonAirports = {
        "FRA": "EDDF", "MUC": "EDDM", "BER": "EDDB", "DUS": "EDDL", "HAM": "EDDH",
        "STR": "EDDS", "CGN": "EDDK", "HAJ": "EDDV", "BRE": "EDDW", "DRS": "EDDC",
        "LEJ": "EDDP", "NUE": "EDDN", "FMO": "EDDG", "PAD": "EDLP", "LHR": "EGLL",
        "LGW": "EGKK", "LTN": "EGGW", "AMS": "EHAM", "CDG": "LFPG", "ORY": "LFPO",
        "MAD": "LEMD", "BCN": "LEBL", "PMI": "LEPA", "IBZ": "LEIB", "AGP": "LEMG",
        "LPA": "GCLP", "TFS": "GCTS", "FUE": "GCFV", "ACE": "GCRR", "FCO": "LIRF",
        "MXP": "LIMC", "LIN": "LIML", "VCE": "LIPZ", "BGY": "LIME", "ZRH": "LSZH",
        "GVA": "LSGG", "BSL": "LFSB", "VIE": "LOWW", "SZG": "LOWS", "IST": "LTFM",
        "SAW": "LTFJ", "AYT": "LTAI", "TIA": "LATI", "ATH": "LGAV", "HER": "LGIR",
        "RHO": "LGRP", "KGS": "LGKO", "CFU": "LGKR", "LIS": "LPPT", "OPO": "LPPR",
        "FAO": "LPFR", "FNC": "LPMA", "CPH": "EKCH", "OSL": "ENGM", "ARN": "ESSA",
        "HEL": "EFHK", "WAW": "EPWA", "PRG": "LKPR", "BUD": "LHBP", "OTP": "LROP",
        "TZL": "LQTZ", "DUB": "EIDW", "JFK": "KJFK", "LAX": "KLAX", "ORD": "KORD",
        "ATL": "KATL", "SFO": "KSFO", "EWR": "KEWR", "MIA": "KMIA", "BOS": "KBOS",
        "DFW": "KDFW", "DEN": "KDEN", "SEA": "KSEA", "LAS": "KLAS", "MCO": "KMCO",
        "PHX": "KPHX", "IAH": "KIAH", "YYZ": "CYYZ", "YVR": "CYVR", "YUL": "CYUL",
        "MEX": "MMMX", "CUN": "MMUN", "HND": "RJTT", "NRT": "RJAA", "KIX": "RJBB",
        "ITM": "RJOO", "PEK": "ZBAA", "PVG": "ZSPD", "HKG": "VHHH", "MFM": "VMMC",
        "TPE": "RCTP", "ICN": "RKSI", "SIN": "WSSS", "KUL": "WMKK", "BKK": "VTBS",
        "HKT": "VTSP", "CGK": "WIII", "DPS": "WADD", "DEL": "VIDP", "BOM": "VABB",
        "BLR": "VOBL", "SGN": "VVTS", "HAN": "VVNB", "MNL": "RPLL", "DXB": "OMDB",
        "AUH": "OMAA", "DOH": "OTHH", "KWI": "OKBK", "MCT": "OOMS", "BAH": "OBBI",
        "JED": "OEJN", "RUH": "OERK", "TLV": "LLBG", "AMM": "OJAI", "BEY": "OLBA",
        "JNB": "FAOR", "CPT": "FACT", "CAI": "HECA", "HRG": "HEGN", "SSH": "HESH",
        "CMN": "GMMN", "NBO": "HKJK", "ADD": "HAAB", "LOS": "DNMM", "GRU": "SBGR",
        "GIG": "SBGL", "BSB": "SBBR", "EZE": "SAEZ", "AEP": "SABE", "SCL": "SCEL",
        "BOG": "SKBO", "LIM": "SPJC", "PTY": "MPTO", "PUJ": "MDPC", "SDQ": "MDSD",
        "HAV": "MUHA", "SYD": "YSSY", "MEL": "YMML", "BNE": "YBBN", "PER": "YPPH",
        "AKL": "NZAA", "NAN": "NFFN", "MLE": "VRMM"
    };

    if (commonAirports[icaoCode]) return commonAirports[icaoCode];
    if (window.icaoCache[icaoCode]) return window.icaoCache[icaoCode];
    
    if (typeof airportData !== 'undefined' && airportData[icaoCode] && airportData[icaoCode].icao) {
        window.icaoCache[icaoCode] = airportData[icaoCode].icao;
        return airportData[icaoCode].icao;
    }

    try {
        const { data: sbData } = await supabaseClient.from('icao_cache').select('icao_code').eq('iata_code', icaoCode).maybeSingle();
        if (sbData && sbData.icao_code) {
            window.icaoCache[icaoCode] = sbData.icao_code;
            return sbData.icao_code;
        }
    } catch (err) {}

    return null;
};

// ==========================================
// 🌤️ PILOTEN-WETTER (Nutzt jetzt den zentralen Übersetzer)
// ==========================================
window.fetchAviationWeather = async function(airportCode) {
    if (!airportCode) return null;
    let iataCode = airportCode.toUpperCase();
    let icaoCode = iataCode;

    // 1. IATA zu ICAO Übersetzung (wenn es 3 Buchstaben sind)
    if (iataCode.length === 3) {
        
        // 🛡️ Stufe 1: Blitzschneller RAM-Cache (Verhindert doppelte Anfragen in derselben Session)
        window.icaoMemoryCache = window.icaoMemoryCache || {};
        
        if (window.icaoMemoryCache[iataCode]) {
            icaoCode = window.icaoMemoryCache[iataCode];
        } else {
            
            // 🚑 Stufe 2: Erweitertes Notfall-Lexikon VORZIEHEN (Spart 90% aller API/DB-Calls)
            const emergencyMap = {
                // --- DEUTSCHLAND ---
                'FRA': 'EDDF', 'MUC': 'EDDM', 'BER': 'EDDB', 'DUS': 'EDDL', 'HAM': 'EDDH',
                'STR': 'EDDS', 'CGN': 'EDDK', 'HAJ': 'EDDV', 'BRE': 'EDDW', 'DRS': 'EDDC',
                'LEJ': 'EDDP', 'NUE': 'EDDN', 'FMO': 'EDDG', 'PAD': 'EDLP',
                
                // --- EUROPA ---
                'LHR': 'EGLL', 'LGW': 'EGKK', 'AMS': 'EHAM', 'CDG': 'LFPG', 'ORY': 'LFPO',
                'MAD': 'LEMD', 'BCN': 'LEBL', 'PMI': 'LEPA', 'IBZ': 'LEIB', 'AGP': 'LEMG',
                'LPA': 'GCLP', 'TFS': 'GCTS', 'FUE': 'GCFV', 'ACE': 'GCRR',
                'FCO': 'LIRF', 'MXP': 'LIMC', 'LIN': 'LIML', 'VCE': 'LIPZ', 'BGY': 'LIME',
                'ZRH': 'LSZH', 'GVA': 'LSGG', 'BSL': 'LFSB', 'VIE': 'LOWW', 'SZG': 'LOWS',
                'IST': 'LTFM', 'SAW': 'LTFJ', 'AYT': 'LTAI', 'TIA': 'LATI',
                'ATH': 'LGAV', 'HER': 'LGIR', 'RHO': 'LGRP', 'KGS': 'LGKO', 'CFU': 'LGKR',
                'LIS': 'LPPT', 'OPO': 'LPPR', 'FAO': 'LPFR', 'FNC': 'LPMA',
                'CPH': 'EKCH', 'OSL': 'ENGM', 'ARN': 'ESSA', 'HEL': 'EFHK',
                'WAW': 'EPWA', 'PRG': 'LKPR', 'BUD': 'LHBP', 'OTP': 'LROP',
                'LTN': 'EGGW', 'TZL': 'LQTZ',

                // --- NORDAMERIKA ---
                'JFK': 'KJFK', 'LAX': 'KLAX', 'ORD': 'KORD', 'ATL': 'KATL', 'SFO': 'KSFO',
                'EWR': 'KEWR', 'MIA': 'KMIA', 'BOS': 'KBOS', 'DFW': 'KDFW', 'DEN': 'KDEN',
                'SEA': 'KSEA', 'LAS': 'KLAS', 'MCO': 'KMCO', 'PHX': 'KPHX', 'IAH': 'KIAH',
                'YYZ': 'CYYZ', 'YVR': 'CYVR', 'YUL': 'CYUL', 
                'MEX': 'MMMX', 'CUN': 'MMUN',

                // --- ASIEN ---
                'HND': 'RJTT', 'NRT': 'RJAA', 'KIX': 'RJBB', 'ITM': 'RJOO',
                'PEK': 'ZBAA', 'PVG': 'ZSPD', 'HKG': 'VHHH', 'MFM': 'VMMC', 'TPE': 'RCTP',
                'ICN': 'RKSI', 'SIN': 'WSSS', 'KUL': 'WMKK',
                'BKK': 'VTBS', 'HKT': 'VTSP', 'CGK': 'WIII', 'DPS': 'WADD',
                'DEL': 'VIDP', 'BOM': 'VABB', 'BLR': 'VOBL',
                'SGN': 'VVTS', 'HAN': 'VVNB', 'MNL': 'RPLL',

                // --- NAHER OSTEN ---
                'DXB': 'OMDB', 'AUH': 'OMAA', 'DOH': 'OTHH', 'KWI': 'OKBK',
                'MCT': 'OOMS', 'BAH': 'OBBI', 'JED': 'OEJN', 'RUH': 'OERK',
                'TLV': 'LLBG', 'AMM': 'OJAI', 'BEY': 'OLBA',

                // --- AFRIKA ---
                'JNB': 'FAOR', 'CPT': 'FACT',
                'CAI': 'HECA', 'HRG': 'HEGN', 'SSH': 'HESH',
                'CMN': 'GMMN', 'NBO': 'HKJK', 'ADD': 'HAAB', 'LOS': 'DNMM',

                // --- SÜD- UND MITTELAMERIKA ---
                'GRU': 'SBGR', 'GIG': 'SBGL', 'BSB': 'SBBR', 
                'EZE': 'SAEZ', 'AEP': 'SABE', 'SCL': 'SCEL', 'BOG': 'SKBO', 'LIM': 'SPJC',
                'PTY': 'MPTO', 'PUJ': 'MDPC', 'SDQ': 'MDSD', 'HAV': 'MUHA',

                // --- OZEANIEN & REST ---
                'SYD': 'YSSY', 'MEL': 'YMML', 'BNE': 'YBBN', 'PER': 'YPPH',
                'AKL': 'NZAA', 'NAN': 'NFFN', 'MLE': 'VRMM'
            };
            
            if (emergencyMap[iataCode]) {
                icaoCode = emergencyMap[iataCode];
                window.icaoMemoryCache[iataCode] = icaoCode; // Im RAM merken
            } else {

                let foundIcao = null;

                // 🗄️ Stufe 3: Supabase Datenbank prüfen
                try {
                    if (typeof supabaseClient !== 'undefined') {
                        const { data } = await supabaseClient
                            .from('icao_cache')
                            .select('icao_code')
                            .eq('iata_code', iataCode)
                            .maybeSingle();
                        if (data && data.icao_code) foundIcao = data.icao_code;
                    }
                } catch(e) {}

                if (foundIcao) {
                    icaoCode = foundIcao;
                    window.icaoMemoryCache[iataCode] = icaoCode;
                } else {
                    
                    // 🌐 Stufe 4: API Request mit "REQUEST-LOCKING" (Verhindert API-DDoS)
                    window.icaoOngoingRequests = window.icaoOngoingRequests || {};
                    
                    // Wenn noch keine Anfrage für diesen IATA läuft, starten wir EINE einzige
                    if (!window.icaoOngoingRequests[iataCode]) {
                        window.icaoOngoingRequests[iataCode] = (async () => {
                            try {
                                const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
                                const res = await fetch(`${baseUrl}/.netlify/functions/fetch-airport-details?code=${iataCode}`);
                                if (res.ok) {
                                    const json = await res.json();
                                    if (json && json.data && json.data.length > 0 && json.data[0].icao) {
                                        const newIcao = json.data[0].icao.toUpperCase();
                                        // Sofort in Supabase wegspeichern
                                        if (typeof supabaseClient !== 'undefined') {
                                            supabaseClient.from('icao_cache').upsert({ iata_code: iataCode, icao_code: newIcao }).then();
                                        }
                                        return newIcao;
                                    }
                                } else {
                                    console.warn(`API-Blockade (${res.status}) für ${iataCode}`);
                                }
                            } catch(e) { console.warn("API Fetch Fehler ICAO:", e); }
                            return null;
                        })();
                    }
                    
                    // Alle parallelen Aufrufe warten hier auf denselben Promise!
                    foundIcao = await window.icaoOngoingRequests[iataCode];
                    
                    if (foundIcao) {
                        icaoCode = foundIcao;
                        window.icaoMemoryCache[iataCode] = icaoCode;
                    } else {
                        console.warn(`🌤️ Wetter abgebrochen: Konnte keinen ICAO für ${iataCode} finden.`);
                        return null;
                    }
                }
            }
        }
    }
    
    // 2. Das eigentliche Wetter abrufen (mit Corsproxy-Fallback)
    try {
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
        const res = await fetch(`${baseUrl}/.netlify/functions/fetch-weather?icao=${icaoCode}`);
        
        if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) return data[0]; 
        }

        console.warn(`🌤️ Netlify lieferte kein Wetter für ${icaoCode}. Nutze Fallback...`);
        const fallbackUrl = `https://corsproxy.io/?url=${encodeURIComponent(`https://aviationweather.gov/api/data/metar?ids=${icaoCode}&format=json`)}`;
        const fallbackRes = await fetch(fallbackUrl);
        
        if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            if (fallbackData && fallbackData.length > 0) return fallbackData[0];
        }
    } catch(e) {
        console.warn(`🌤️ Wetter-Fehler für ${icaoCode}:`, e);
    }
    
    return null;
};

window.buildWeatherWidgetHtml = function(weatherData, title) {
    if (!weatherData) return "";
    
    let dotColor = "bg-gray-500";
    let textColor = "text-gray-700 dark:text-gray-300";
    let catText = weatherData.fltcat || "UNK";
    
    if (catText === "VFR") { dotColor = "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"; textColor = "text-green-700 dark:text-green-400"; }
    else if (catText === "MVFR") { dotColor = "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"; textColor = "text-blue-700 dark:text-blue-400"; }
    else if (catText === "IFR") { dotColor = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"; textColor = "text-red-700 dark:text-red-400"; }
    else if (catText === "LIFR") { dotColor = "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"; textColor = "text-purple-700 dark:text-purple-400"; }

    const windDir = weatherData.wdir ? `${weatherData.wdir}°` : "VRB";
    const windSpd = weatherData.wspd ? `${weatherData.wspd}kt` : "0kt";
    const temp = weatherData.temp ? `${weatherData.temp}°C` : "";
    
    let vis = "";
    if (weatherData.visib) {
        vis = weatherData.visib === "10+" ? ">10km" : `${weatherData.visib}sm`;
    }

    return `
      <div onclick="event.stopPropagation(); const tt = this.querySelector('.metar-tooltip'); tt.classList.toggle('hidden'); tt.classList.toggle('block');" 
           onmouseleave="const tt = this.querySelector('.metar-tooltip'); tt.classList.add('hidden'); tt.classList.remove('block');"
           class="w-full flex flex-col bg-black/5 dark:bg-black/20 p-2.5 rounded-xl border border-black/5 dark:border-white/5 relative group cursor-pointer transition-all hover:bg-black/10 dark:hover:bg-black/40 shadow-sm">

          <div class="flex justify-between items-center mb-1.5">
              <span class="text-[9px] font-black uppercase tracking-widest text-on-surface/50 dark:text-slate-500">${title}</span>
              <div class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                  <span class="text-[9px] font-black ${textColor}">${catText}</span>
              </div>
          </div>
          
          <div class="flex flex-wrap items-center gap-3">
              <span class="text-[10px] font-bold text-on-surface dark:text-slate-300 flex items-center gap-1">
                  <span class="material-symbols-outlined text-[12px] text-primary/70">air</span> ${windDir} @ ${windSpd}
              </span>
              ${vis ? `
              <span class="text-[10px] font-bold text-on-surface dark:text-slate-300 flex items-center gap-1">
                  <span class="material-symbols-outlined text-[12px] text-blue-500/70">visibility</span> ${vis}
              </span>` : ''}
              <span class="text-[10px] font-bold text-on-surface dark:text-slate-300 flex items-center gap-1">
                  <span class="material-symbols-outlined text-[12px] text-orange-500/70">thermostat</span> ${temp}
              </span>
          </div>

          <div class="metar-tooltip absolute bottom-full left-0 mb-2 w-48 p-2.5 bg-slate-900 text-slate-300 text-[9px] font-mono leading-tight rounded-lg shadow-xl hidden lg:group-hover:block z-[100] border border-slate-700 pointer-events-none">
              <div class="text-indigo-400 font-bold mb-1 uppercase tracking-widest text-[8px] font-sans">Raw METAR</div>
              ${weatherData.rawOb || 'N/A'}
          </div>
      </div>
    `;
};

// ==========================================
// 🛂 AVIOSPHERE PASSPORT, FLAGGEN & WAHRZEICHEN ENGINE
// ==========================================

// 1. Echte Flaggen-Grafik (funktioniert auch auf Windows-PCs, wo Emojis nur als "DE" erscheinen!)
window.getCountryFlagHtml = function (countryCode, className = "w-5 h-3.5 rounded-[3px] object-cover shadow-sm inline-block shrink-0") {
  if (!countryCode || countryCode.length !== 2 || countryCode === "XX") {
    return `<span class="inline-block leading-none">🌍</span>`;
  }
  const lower = countryCode.toLowerCase();
  return `<img src="https://flagcdn.com/w80/${lower}.png" alt="${countryCode}" class="${className}" onerror="this.outerHTML='🌍'">`;
};

// Emoji-Fallback für reine Text-Stellen (z.B. PDF-Titel)
window.getCountryFlag = function (countryCode) {
  if (!countryCode || countryCode.length !== 2 || countryCode === "XX") return "🌍";
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
};

// Liefert den lokalisierten Ländernamen automatisch in DE, EN, ES, RU, ZH
window.getCountryName = function (countryCode) {
  if (!countryCode || countryCode.length !== 2 || countryCode === "XX") {
    return typeof getTranslation === "function" ? getTranslation("logbook.unknown") || "Unbekannt" : "Unbekannt";
  }
  try {
    const lang = typeof currentLanguage !== "undefined" && currentLanguage ? currentLanguage : "de";
    const displayNames = new Intl.DisplayNames([lang], { type: "region" });
    return displayNames.of(countryCode.toUpperCase()) || countryCode.toUpperCase();
  } catch (e) {
    return countryCode.toUpperCase();
  }
};

// 🏛️ Kuratierte Wahrzeichen-Fotos (High-Res) für den Länder-Header
const COUNTRY_LANDMARK_IMAGES = {
  DE: "https://images.unsplash.com/photo-1560969184-10fe8719e047?q=80&w=1000&auto=format&fit=crop", // Berlin Brandenburger Tor / Skyline
  AT: "https://images.unsplash.com/photo-1516550893923-42d28e5677af?q=80&w=1000&auto=format&fit=crop", // Wien / Hallstatt
  CH: "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?q=80&w=1000&auto=format&fit=crop", // Schweizer Alpen / Matterhorn
  FR: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=1000&auto=format&fit=crop", // Paris Eiffelturm
  IT: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=1000&auto=format&fit=crop", // Rom Kolosseum
  ES: "https://images.unsplash.com/photo-1583422409516-2895a77efded?q=80&w=1000&auto=format&fit=crop", // Barcelona Sagrada Familia
  PT: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?q=80&w=1000&auto=format&fit=crop", // Lissabon
  GB: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=1000&auto=format&fit=crop", // London Big Ben / Tower Bridge
  IE: "https://images.unsplash.com/photo-1590089415225-401ed6f9db8e?q=80&w=1000&auto=format&fit=crop", // Irland Cliffs of Moher
  NL: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?q=80&w=1000&auto=format&fit=crop", // Amsterdam Grachten
  BE: "https://images.unsplash.com/photo-1559113202-c916b8e44373?q=80&w=1000&auto=format&fit=crop", // Brüssel Grand Place
  GR: "https://images.unsplash.com/photo-1533105079780-92b9be482077?q=80&w=1000&auto=format&fit=crop", // Santorini / Akropolis
  TR: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?q=80&w=1000&auto=format&fit=crop", // Istanbul Hagia Sophia
  RU: "https://images.unsplash.com/photo-1513326738677-b964603b136d?q=80&w=1000&auto=format&fit=crop", // Moskau Basilius-Kathedrale
  PL: "https://images.unsplash.com/photo-1519197924294-4ba991a11128?q=80&w=1000&auto=format&fit=crop", // Warschau / Krakau
  CZ: "https://images.unsplash.com/photo-1541849546-216549ae216d?q=80&w=1000&auto=format&fit=crop", // Prag Karlsbrücke
  HU: "https://images.unsplash.com/photo-1549877452-9c387954fbc2?q=80&w=1000&auto=format&fit=crop", // Budapest Parlament
  HR: "https://images.unsplash.com/photo-1555990538-1e6c0c12db88?q=80&w=1000&auto=format&fit=crop", // Dubrovnik
  DK: "https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?q=80&w=1000&auto=format&fit=crop", // Kopenhagen Nyhavn
  SE: "https://images.unsplash.com/photo-1509356843151-3e7d96241e11?q=80&w=1000&auto=format&fit=crop", // Stockholm
  NO: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?q=80&w=1000&auto=format&fit=crop", // Norwegen Fjorde
  FI: "https://images.unsplash.com/photo-1538332576228-eb5b4c4de6f5?q=80&w=1000&auto=format&fit=crop", // Helsinki Dom
  IS: "https://images.unsplash.com/photo-1504893524553-b855bce32c67?q=80&w=1000&auto=format&fit=crop", // Island
  AL: "https://images.unsplash.com/photo-1592488831719-396a2a0b284f?q=80&w=1000&auto=format&fit=crop", // Albanien
  RO: "https://images.unsplash.com/photo-1584646098378-0874589d76b1?q=80&w=1000&auto=format&fit=crop", // Rumänien Schloss Bran
  US: "https://images.unsplash.com/photo-1485738422979-f5c462d49f74?q=80&w=1000&auto=format&fit=crop", // New York Freiheitsstatue
  CA: "https://images.unsplash.com/photo-1503614472-8c93d56e92ce?q=80&w=1000&auto=format&fit=crop", // Kanada Moraine Lake
  MX: "https://images.unsplash.com/photo-1518638150340-f706e86654de?q=80&w=1000&auto=format&fit=crop", // Mexiko Chichén Itzá
  BR: "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?q=80&w=1000&auto=format&fit=crop", // Rio de Janeiro
  AR: "https://images.unsplash.com/photo-1589909202802-8f4aadce1849?q=80&w=1000&auto=format&fit=crop", // Buenos Aires
  JP: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1000&auto=format&fit=crop", // Japan Mount Fuji & Pagode
  CN: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?q=80&w=1000&auto=format&fit=crop", // Chinesische Mauer
  HK: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?q=80&w=1000&auto=format&fit=crop", // Hongkong Skyline
  TW: "https://images.unsplash.com/photo-1470004914212-05527e49370b?q=80&w=1000&auto=format&fit=crop", // Taipei 101
  KR: "https://images.unsplash.com/photo-1517154421773-0529f29ea451?q=80&w=1000&auto=format&fit=crop", // Seoul
  SG: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?q=80&w=1000&auto=format&fit=crop", // Singapur Marina Bay Sands
  TH: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?q=80&w=1000&auto=format&fit=crop", // Bangkok Tempel
  MY: "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?q=80&w=1000&auto=format&fit=crop", // Kuala Lumpur Petronas Towers
  ID: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?q=80&w=1000&auto=format&fit=crop", // Bali Tempel
  IN: "https://images.unsplash.com/photo-1564507592333-c60657eea523?q=80&w=1000&auto=format&fit=crop", // Taj Mahal
  AE: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=1000&auto=format&fit=crop", // Dubai Burj Khalifa
  QA: "https://images.unsplash.com/photo-1578895101408-1a36b834405b?q=80&w=1000&auto=format&fit=crop", // Doha Skyline
  KW: "https://images.unsplash.com/photo-1578894381163-e72c17f2d45f?q=80&w=1000&auto=format&fit=crop", // Kuwait Towers
  ZA: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?q=80&w=1000&auto=format&fit=crop", // Kapstadt Tafelberg
  EG: "https://images.unsplash.com/photo-1539650116574-8efeb43e2750?q=80&w=1000&auto=format&fit=crop", // Pyramiden von Gizeh
  MA: "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?q=80&w=1000&auto=format&fit=crop", // Marrakesch
  AU: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?q=80&w=1000&auto=format&fit=crop", // Sydney Opera House
  NZ: "https://images.unsplash.com/photo-1507699622108-4be3abd695ad?q=80&w=1000&auto=format&fit=crop",  // Neuseeland Milford Sound
  DEFAULT: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1000&auto=format&fit=crop"
};

// Holt das Wahrzeichen-Bild (mit sicherem Default für Unknown & XX)
window.getCountryLandmarkImage = async function (countryCode) {
  if (!countryCode || countryCode === "XX" || countryCode === "Unknown") {
    return COUNTRY_LANDMARK_IMAGES.DEFAULT;
  }
  const code = countryCode.toUpperCase();
  if (COUNTRY_LANDMARK_IMAGES[code]) return COUNTRY_LANDMARK_IMAGES[code];
  return COUNTRY_LANDMARK_IMAGES.DEFAULT;
};

// Ermittelt zuverlässig den 2-stelligen Ländercode eines Flughafens (inkl. SVO & Historien-Fallback)
window.getAirportCountryCode = function (iataCode) {
  if (!iataCode) return null;
  const code = iataCode.trim().toUpperCase();

  if (
    typeof window.airportData !== "undefined" &&
    window.airportData[code] &&
    window.airportData[code].country_code &&
    window.airportData[code].country_code !== "XX"
  ) {
    return window.airportData[code].country_code.toUpperCase();
  }

  // Großes Fallback-Lexikon (inkl. SVO, DME, VKO, LED und weltweiten Hubs)
  const quickCountryMap = {
    // Deutschland, Österreich, Schweiz
    FRA: "DE", MUC: "DE", BER: "DE", TXL: "DE", SXF: "DE", DUS: "DE", HAM: "DE", STR: "DE", CGN: "DE", HAJ: "DE", BRE: "DE", DRS: "DE", LEJ: "DE", NUE: "DE", FMO: "DE", PAD: "DE", DTM: "DE", FKB: "DE", FMM: "DE", HHN: "DE", NRN: "DE", ERF: "DE", RLG: "DE", GWT: "DE",FDH: "DE",
    ZRH: "CH", GVA: "CH", BSL: "CH", BRN: "CH", ACH: "CH", LUG: "CH",
    VIE: "AT", SZG: "AT", INN: "AT", GRZ: "AT", LNZ: "AT", KLU: "AT",
    // Russland & GUS (inkl. SVO Sheremetyevo!)
    SVO: "RU", DME: "RU", VKO: "RU", ZIA: "RU", LED: "RU", AER: "RU", SVX: "RU", OVB: "RU", KZN: "RU", ROV: "RU", UFA: "RU", KGD: "RU", VVO: "RU", IKT: "RU", KJA: "RU", MRV: "RU",
    MSQ: "BY", KBP: "UA", IEV: "UA", LWO: "UA", ODS: "UA", ALA: "KZ", NQZ: "KZ", TSE: "KZ", TAS: "UZ", GYD: "AZ", EVN: "AM", TBS: "GE",
    // Restliches Europa
    LHR: "GB", LGW: "GB", LTN: "GB", STN: "GB", LCY: "GB", SEN: "GB", MAN: "GB", BHX: "GB", EDI: "GB", GLA: "GB", BRS: "GB", NCL: "GB", LPL: "GB", BFS: "GB",
    DUB: "IE", SNN: "IE", ORK: "IE",
    AMS: "NL", EIN: "NL", RTM: "NL", BRU: "BE", CRL: "BE", ANR: "BE", LUX: "LU",
    CDG: "FR", ORY: "FR", BVA: "FR", NCE: "FR", LYS: "FR", MRS: "FR", TLS: "FR", BOD: "FR", NTE: "FR", SXB: "FR", BIQ: "FR",
    MAD: "ES", BCN: "ES", PMI: "ES", IBZ: "ES", MAH: "ES", AGP: "ES", ALC: "ES", VLC: "ES", SVQ: "ES", BIO: "ES", LPA: "ES", TFS: "ES", TFN: "ES", FUE: "ES", ACE: "ES", SPC: "ES", SCQ: "ES", GRO: "ES", REU: "ES",
    LIS: "PT", OPO: "PT", FAO: "PT", FNC: "PT", PDL: "PT", TER: "PT",
    FCO: "IT", CIA: "IT", MXP: "IT", LIN: "IT", BGY: "IT", VCE: "IT", TSF: "IT", NAP: "IT", BLQ: "IT", PSA: "IT", FLR: "IT", CTA: "IT", PMO: "IT", OLB: "IT", CAG: "IT", BRI: "IT", VRN: "IT", TRN: "IT", GOA: "IT", SUF: "IT", BDS: "IT",
    ATH: "GR", SKG: "GR", HER: "GR", CHQ: "GR", RHO: "GR", KGS: "GR", CFU: "GR", ZTH: "GR", JTR: "GR", JMK: "GR", KVA: "GR", EFL: "GR", PVK: "GR", JSI: "GR", SMI: "GR",
    IST: "TR", ISL: "TR", SAW: "TR", AYT: "TR", ADB: "TR", DLM: "TR", BJV: "TR", ESB: "TR", TZX: "TR", GZP: "TR", ASR: "TR",
    CPH: "DK", BLL: "DK", AAL: "DK", OSL: "NO", TRF: "NO", BGO: "NO", SVG: "NO", TOS: "NO", TRD: "NO", BOO: "NO", ARN: "SE", NYO: "SE", GOT: "SE", MMX: "SE", HEL: "FI", TMP: "FI", OUL: "FI", RVN: "FI", KEF: "IS", RKV: "IS",
    WAW: "PL", WMI: "PL", KRK: "PL", GDN: "PL", KTW: "PL", WRO: "PL", POZ: "PL",
    PRG: "CZ", BRQ: "CZ", BTS: "SK", KSC: "SK", BUD: "HU", DEB: "HU",
    OTP: "RO", CLJ: "RO", TSR: "RO", IAS: "RO", SBZ: "RO", SOF: "BG", VAR: "BG", BOJ: "BG", PDV: "BG",
    BEG: "RS", INI: "RS", ZAG: "HR", SPU: "HR", DBV: "HR", ZAD: "HR", PUY: "HR", RJK: "HR", LJU: "SI", SJJ: "BA", TZL: "BA", TIA: "AL", PRN: "XK", SKP: "MK", TGD: "ME", TIV: "ME",
    TLL: "EE", RIX: "LV", VNO: "LT", KUN: "LT", MLA: "MT", LCA: "CY", PFO: "CY",
    // Amerika
    JFK: "US", EWR: "US", LGA: "US", LAX: "US", SFO: "US", SAN: "US", SJC: "US", ORD: "US", MDW: "US", ATL: "US", MIA: "US", FLL: "US", MCO: "US", TPA: "US", RSW: "US", BOS: "US", DFW: "US", DAL: "US", IAH: "US", HOU: "US", AUS: "US", DEN: "US", SEA: "US", LAS: "US", PHX: "US", IAD: "US", DCA: "US", BWI: "US", PHL: "US", DTW: "US", MSP: "US", CLT: "US", SLC: "US", PDX: "US", HNL: "US", OGG: "US", ANC: "US", MSY: "US", BNA: "US", STL: "US",
    YYZ: "CA", YVR: "CA", YUL: "CA", YYC: "CA", YEG: "CA", YOW: "CA", YHZ: "CA",
    MEX: "MX", CUN: "MX", GDL: "MX", MTY: "MX", SJD: "MX", PVR: "MX",
    GRU: "BR", CGH: "BR", GIG: "BR", SDU: "BR", BSB: "BR", FOR: "BR", REC: "BR", SSA: "BR",
    EZE: "AR", AEP: "AR", COR: "AR", MDZ: "AR", USH: "AR", SCL: "CL", BOG: "CO", MDE: "CO", CTG: "CO", LIM: "PE", CUZ: "PE", UIO: "EC", GYE: "EC", PTY: "PA", SJO: "CR", PUJ: "DO", SDQ: "DO", POP: "DO", HAV: "CU", VRA: "CU", MBJ: "JM", NAS: "BS", SJU: "PR", AUA: "AW", CUR: "CW", SXM: "SX",
    // Asien, Nahost, Afrika, Ozeanien
    HND: "JP", NRT: "JP", KIX: "JP", ITM: "JP", NGO: "JP", FUK: "JP", CTS: "JP", OKA: "JP", MSJ: "JP", HIJ: "JP", SDJ: "JP", KOJ: "JP",
    ICN: "KR", GMP: "KR", PUS: "KR", CJU: "KR", PEK: "CN", PKX: "CN", PVG: "CN", SHA: "CN", CAN: "CN", SZX: "CN", CTU: "CN", TFU: "CN", XIY: "CN", HGH: "CN", KMG: "CN", WUH: "CN", HKG: "HK", MFM: "MO", TPE: "TW", TSA: "TW", KHH: "TW",
    SIN: "SG", KUL: "MY",SZB: "MY", PEN: "MY", LGK: "MY", BKI: "MY", KCH: "MY", BKK: "TH", DMK: "TH", HKT: "TH", CNX: "TH", USM: "TH", KBV: "TH", CGK: "ID", DPS: "ID", SUB: "ID", MNL: "PH", CEB: "PH", CRK: "PH", SGN: "VN", HAN: "VN", DAD: "VN", CXR: "VN", PNH: "KH", REP: "KH", RGN: "MM", VTE: "LA",
    DEL: "IN", BOM: "IN", BLR: "IN", MAA: "IN", HYD: "IN", CCU: "IN", COK: "IN", GOI: "IN", AMD: "IN", CMB: "LK", MLE: "MV", KTM: "NP", DAC: "BD", KHI: "PK", LHE: "PK", ISB: "PK",
    DXB: "AE", DWC: "AE", AUH: "AE", SHJ: "AE", RKT: "AE", DOH: "QA", KWI: "KW", MCT: "OM", SLL: "OM", BAH: "BH", JED: "SA", RUH: "SA", DMM: "SA", MED: "SA", TLV: "IL", ETM: "IL", AMM: "JO", AQJ: "JO", BEY: "LB", BGW: "IQ", IKA: "IR", THR: "IR",
    JNB: "ZA", CPT: "ZA", DUR: "ZA", NLP: "ZA", MQP: "ZA", PTG: "ZA", PLZ: "ZA", GRJ: "ZA", HDS: "ZA", SZK: "ZA",
    CAI: "EG", SPX: "EG", HRG: "EG", SSH: "EG", RMF: "EG", LXR: "EG", ASW: "EG", HBE: "EG",
    CMN: "MA", RAK: "MA", AGA: "MA", TNG: "MA", FEZ: "MA", TUN: "TN", DJE: "TN", MIR: "TN", NBE: "TN", ALG: "DZ",
    NBO: "KE", MBA: "KE", ZNZ: "TZ", DAR: "TZ", JRO: "TZ", EBB: "UG", KGL: "RW", ADD: "ET", LOS: "NG", ABV: "NG", ACC: "GH", DSS: "SN", ABJ: "CI", WDH: "NA", GBE: "BW", VFA: "ZW", HRE: "ZW", LUN: "ZM", LLW: "MW", MPM: "MZ", TNR: "MG", MRU: "MU", RUN: "RE", SEZ: "SC", SID: "CV", VXE: "CV",
    SYD: "AU", MEL: "AU", BNE: "AU", PER: "AU", ADL: "AU", OOL: "AU", CNS: "AU", CBR: "AU", DRW: "AU", HBA: "AU",
    AKL: "NZ", CHC: "NZ", WLG: "NZ", ZQN: "NZ", NAN: "FJ", PPT: "PF", NOU: "NC"
  };

  if (quickCountryMap[code]) {
    if (typeof window.airportData !== "undefined" && window.airportData[code]) {
      window.airportData[code].country_code = quickCountryMap[code];
    }
    return quickCountryMap[code];
  }

  // Prüfe das historische Open-Source-Archiv (falls bereits geladen)
  if (Array.isArray(window.historicalAirportsCache)) {
    const hit = window.historicalAirportsCache.find((a) => a.iata_code === code);
    if (hit && hit.country) return hit.country.toUpperCase();
  }

  return null;
};

// Berechnet alle Passport-Kennzahlen
window.calculatePassportData = function (flights) {
  const countriesMap = {};
  const continentsSet = new Set();

  (flights || []).forEach((f) => {
    const depCountry = window.getAirportCountryCode(f.departure);
    const arrCountry = window.getAirportCountryCode(f.arrival);
    const touchedCountries = new Set([depCountry, arrCountry].filter(Boolean));

    touchedCountries.forEach((cc) => {
      if (!countriesMap[cc]) {
        countriesMap[cc] = {
          code: cc,
          name: window.getCountryName(cc),
          flag: window.getCountryFlag(cc),
          flagHtml: window.getCountryFlagHtml(cc),
          flights: [],
          airports: new Set(),
          totalDistance: 0,
        };
      }
      countriesMap[cc].flights.push(f);
      countriesMap[cc].totalDistance += f.distance || 0;
      if (depCountry === cc && f.departure) countriesMap[cc].airports.add(f.departure);
      if (arrCountry === cc && f.arrival) countriesMap[cc].airports.add(f.arrival);

      if (typeof countryToContinent !== "undefined" && countryToContinent[cc]) {
        continentsSet.add(countryToContinent[cc]);
      }
    });
  });

  const sortedCountries = Object.values(countriesMap).sort(
    (a, b) => b.flights.length - a.flights.length || a.name.localeCompare(b.name)
  );
  const count = sortedCountries.length;
  const worldPercent = Math.min(100, (count / 195) * 100).toFixed(1);

  return {
    count,
    worldPercent,
    continentsCount: continentsSet.size,
    countries: sortedCountries,
    countriesMap,
  };
};
