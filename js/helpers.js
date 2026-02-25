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

function parseFlightTimeToMinutes(timeString) {
  if (!timeString || !timeString.includes("Std.")) return 0;
  const parts = timeString.match(/(\d+)\s*Std\.\s*(\d+)\s*Min\./);
  if (parts && parts.length === 3) {
    return parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  return 0;
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
  if (amountEl) amountEl.textContent = config.amount;
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

        showMessage("Lade...", getTranslation("messages.redirectingStripe"), "info");

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
    if (!isAppInitialized) {
      return; 
    }
    // ENDE Schutzabfrage

    // 2. Dynamische Inhalte der App aktualisieren (nur wenn eingeloggt)
    if (!document.getElementById("tab-content-fluege").classList.contains("hidden")) {
      renderFlights();
    }
    if (!document.getElementById("tab-content-achievements").classList.contains("hidden")) {
      updateAchievements();
    }
    if (!document.getElementById("tab-content-logbook").classList.contains("hidden")) {
      const activeBtn = document.querySelector(".logbook-view-btn.active");
      let view = "aircraftType"; 
      if (activeBtn) {
        if (activeBtn.id.includes("airline")) view = "airline";
        if (activeBtn.id.includes("airport")) view = "airport";
      }
      renderLogbookView(view);
    }
    if (!document.getElementById("tab-content-charts").classList.contains("hidden")) {
      const flights = await getFlights();
      updateCharts(flights, currentChartTimeframe);
    }
    if (!document.getElementById("tab-content-hilfe").classList.contains("hidden")) {
      renderHelpContent(); 
    }

  } catch (error) {
    console.error(`Sprachdatei ${lang}.json konnte nicht geladen werden:`, error);
  }
  
  updateLockVisuals();
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