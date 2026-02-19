// =================================================================
// KONFIGURATION & GLOBALE VARIABLEN
// =================================================================

const SUPABASE_URL = "https://sbmjdwktxsnmukbooycu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNibWpkd2t0eHNubXVrYm9veWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyOTczNDgsImV4cCI6MjA3NTg3MzM0OH0.NN9EHfS7iyAZvFm_UYs3PxEWj2pMbYmMduUeVA70rpo";

// ✅ NEU: Automatische Erkennung der Backend-URL
// Wenn wir auf localhost (Android App) sind, nutzen wir die echte Domain.
// Wenn wir im Web sind, nutzen wir relative Pfade (leerer String).
// BITTE HIER DEINE ECHTE NETLIFY-URL ODER AVIOSPHERE-DOMAIN EINTRAGEN:
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.protocol === 'file:')
    ? 'https://aviosphere.com/' // <-- DEINE LIVE URL HIER!
    : '';

// Konstanten
const MAX_PHOTOS_PER_FLIGHT = 5;
const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
const ITEMS_PER_PAGE = 5;

// Globale Zustands-Variablen
let map;
let routeLayer;
let markerClusterGroup = null;
let currentlyEditingFlightData = null;
let isAllRoutesViewActive = false;
let currentSort = { key: "flightLogNumber", direction: "asc" };
let currentPage = 1;
let currentlyFilteredFlights = null;
let flightsChartInstance, distanceChartInstance, timeChartInstance;
let currentChartTimeframe = "year";
let isAppInitialized = false;
let currentLanguage = "de";
let translations = {};
let globeInstance = null;
let isStoryModeActive = false;
let normalGlobeLabelText = "";
let countriesGeoJSON = null;
let currentUserSubscription = "free";
let currentSubscriptionEnd = null;
let animationState = "stopped";
let animationStartIndex = 0;
let selectedPlan = "yearly";
// Speichert die ID des letzten Flugs global
let globalLastFlightId = null;


// Objekt zur Zuordnung von ISO-Ländercodes zu Kontinenten
const countryToContinent = {
  AF: "Asien",
  AX: "Europa",
  AL: "Europa",
  DZ: "Afrika",
  AS: "Ozeanien",
  AD: "Europa",
  AO: "Afrika",
  AI: "Nordamerika",
  AQ: "Antarktis",
  AG: "Nordamerika",
  AR: "Südamerika",
  AM: "Asien",
  AW: "Nordamerika",
  AU: "Ozeanien",
  AT: "Europa",
  AZ: "Asien",
  BS: "Nordamerika",
  BH: "Asien",
  BD: "Asien",
  BB: "Nordamerika",
  BY: "Europa",
  BE: "Europa",
  BZ: "Nordamerika",
  BJ: "Afrika",
  BM: "Nordamerika",
  BT: "Asien",
  BO: "Südamerika",
  BA: "Europa",
  BW: "Afrika",
  BR: "Südamerika",
  IO: "Asien",
  BG: "Europa",
  BF: "Afrika",
  BI: "Afrika",
  KH: "Asien",
  CM: "Afrika",
  CA: "Nordamerika",
  CV: "Afrika",
  KY: "Nordamerika",
  CF: "Afrika",
  TD: "Afrika",
  CL: "Südamerika",
  CN: "Asien",
  CX: "Asien",
  CC: "Asien",
  CO: "Südamerika",
  KM: "Afrika",
  CG: "Afrika",
  CD: "Afrika",
  CK: "Ozeanien",
  CR: "Nordamerika",
  CI: "Afrika",
  HR: "Europa",
  CU: "Nordamerika",
  CY: "Asien",
  CZ: "Europa",
  DK: "Europa",
  DJ: "Afrika",
  DM: "Nordamerika",
  DO: "Nordamerika",
  EC: "Südamerika",
  EG: "Afrika",
  SV: "Nordamerika",
  GQ: "Afrika",
  ER: "Afrika",
  EE: "Europa",
  ET: "Afrika",
  FK: "Südamerika",
  FO: "Europa",
  FJ: "Ozeanien",
  FI: "Europa",
  FR: "Europa",
  GF: "Südamerika",
  PF: "Ozeanien",
  GA: "Afrika",
  GM: "Afrika",
  GE: "Asien",
  DE: "Europa",
  GH: "Afrika",
  GI: "Europa",
  GR: "Europa",
  GL: "Nordamerika",
  GD: "Nordamerika",
  GP: "Nordamerika",
  GU: "Ozeanien",
  GT: "Nordamerika",
  GG: "Europa",
  GN: "Afrika",
  GW: "Afrika",
  GY: "Südamerika",
  HT: "Nordamerika",
  HN: "Nordamerika",
  HK: "Asien",
  HU: "Europa",
  IS: "Europa",
  IN: "Asien",
  ID: "Asien",
  IR: "Asien",
  IQ: "Asien",
  IE: "Europa",
  IM: "Europa",
  IL: "Asien",
  IT: "Europa",
  JM: "Nordamerika",
  JP: "Asien",
  JE: "Europa",
  JO: "Asien",
  KZ: "Asien",
  KE: "Afrika",
  KI: "Ozeanien",
  KP: "Asien",
  KR: "Asien",
  KW: "Asien",
  KG: "Asien",
  LA: "Asien",
  LV: "Europa",
  LB: "Asien",
  LS: "Afrika",
  LR: "Afrika",
  LY: "Afrika",
  LI: "Europa",
  LT: "Europa",
  LU: "Europa",
  MO: "Asien",
  MK: "Europa",
  MG: "Afrika",
  MW: "Afrika",
  MY: "Asien",
  MV: "Asien",
  ML: "Afrika",
  MT: "Europa",
  MH: "Ozeanien",
  MQ: "Nordamerika",
  MR: "Afrika",
  MU: "Afrika",
  YT: "Afrika",
  MX: "Nordamerika",
  FM: "Ozeanien",
  MD: "Europa",
  MC: "Europa",
  MN: "Asien",
  ME: "Europa",
  MS: "Nordamerika",
  MA: "Afrika",
  MZ: "Afrika",
  MM: "Asien",
  NA: "Afrika",
  NR: "Ozeanien",
  NP: "Asien",
  NL: "Europa",
  NC: "Ozeanien",
  NZ: "Ozeanien",
  NI: "Nordamerika",
  NE: "Afrika",
  NG: "Afrika",
  NU: "Ozeanien",
  NF: "Ozeanien",
  MP: "Ozeanien",
  NO: "Europa",
  OM: "Asien",
  PK: "Asien",
  PW: "Ozeanien",
  PS: "Asien",
  PA: "Nordamerika",
  PG: "Ozeanien",
  PY: "Südamerika",
  PE: "Südamerika",
  PH: "Asien",
  PN: "Ozeanien",
  PL: "Europa",
  PT: "Europa",
  PR: "Nordamerika",
  QA: "Asien",
  RE: "Afrika",
  RO: "Europa",
  RU: "Europa",
  RW: "Afrika",
  BL: "Nordamerika",
  SH: "Afrika",
  KN: "Nordamerika",
  LC: "Nordamerika",
  MF: "Nordamerika",
  PM: "Nordamerika",
  VC: "Nordamerika",
  WS: "Ozeanien",
  SM: "Europa",
  ST: "Afrika",
  SA: "Asien",
  SN: "Afrika",
  RS: "Europa",
  SC: "Afrika",
  SL: "Afrika",
  SG: "Asien",
  SX: "Nordamerika",
  SK: "Europa",
  SI: "Europa",
  SB: "Ozeanien",
  SO: "Afrika",
  ZA: "Afrika",
  GS: "Antarktis",
  SS: "Afrika",
  ES: "Europa",
  LK: "Asien",
  SD: "Afrika",
  SR: "Südamerika",
  SJ: "Europa",
  SZ: "Afrika",
  SE: "Europa",
  CH: "Europa",
  SY: "Asien",
  TW: "Asien",
  TJ: "Asien",
  TZ: "Afrika",
  TH: "Asien",
  TL: "Asien",
  TG: "Afrika",
  TK: "Ozeanien",
  TO: "Ozeanien",
  TT: "Nordamerika",
  TN: "Afrika",
  TR: "Asien",
  TM: "Asien",
  TC: "Nordamerika",
  TV: "Ozeanien",
  UG: "Afrika",
  UA: "Europa",
  AE: "Asien",
  GB: "Europa",
  US: "Nordamerika",
  UY: "Südamerika",
  UZ: "Asien",
  VU: "Ozeanien",
  VE: "Südamerika",
  VN: "Asien",
  VG: "Nordamerika",
  VI: "Nordamerika",
  WF: "Ozeanien",
  EH: "Afrika",
  YE: "Asien",
  ZM: "Afrika",
  ZW: "Afrika",
};

// Statische Flughafendaten
var airportData = {
  FRA: {
    name: "Frankfurt",
    city: "Frankfurt",
    lat: 50.0333,
    lon: 8.5706,
  },
  MUC: { name: "München", city: "Munich", lat: 48.3538, lon: 11.7861 },
  BER: {
    name: "Berlin Brandenburg",
    city: "Berlin",
    lat: 52.3667,
    lon: 13.5033,
  },
  HAM: { name: "Hamburg", city: "Hamburg", lat: 53.6304, lon: 9.9882 },
  DUS: {
    name: "Düsseldorf",
    city: "Dusseldorf",
    lat: 51.2895,
    lon: 6.7667,
  },
  VIE: { name: "Wien", city: "Vienna", lat: 48.1103, lon: 16.5697 },
  ZRH: { name: "Zürich", city: "Zurich", lat: 47.4647, lon: 8.5492 },
  AMS: {
    name: "Amsterdam Schiphol",
    city: "Amsterdam",
    lat: 52.3086,
    lon: 4.7638,
  },
  LHR: {
    name: "London Heathrow",
    city: "London",
    lat: 51.47,
    lon: -0.4543,
  },
  CDG: {
    name: "Paris Charles de Gaulle",
    city: "Paris",
    lat: 49.0097,
    lon: 2.5479,
  },
  IST: { name: "Istanbul", city: "Istanbul", lat: 41.2619, lon: 28.7361 },
  JFK: {
    name: "New York JFK",
    city: "New York",
    lat: 40.6413,
    lon: -73.7781,
  },
  LAX: {
    name: "Los Angeles Intl",
    city: "Los Angeles",
    lat: 33.9416,
    lon: -118.4085,
  },
  ATL: {
    name: "Atlanta Intl",
    city: "Atlanta",
    lat: 33.6407,
    lon: -84.4277,
  },
  DXB: { name: "Dubai Intl", city: "Dubai", lat: 25.2532, lon: 55.3653 },
  SIN: {
    name: "Singapur Changi",
    city: "Singapore",
    lat: 1.3644,
    lon: 103.9915,
  },
  NRT: {
    name: "Tokio Narita",
    city: "Tokyo",
    lat: 35.7647,
    lon: 140.3864,
  },
  SYD: {
    name: "Sydney Intl",
    city: "Sydney",
    lat: -33.9461,
    lon: 151.1772,
  },
  HND: {
    name: "Tokio Haneda",
    city: "Tokyo",
    lat: 35.5523,
    lon: 139.7797,
  },
  ICN: {
    name: "Seoul Incheon",
    city: "Seoul",
    lat: 37.4692,
    lon: 126.4505,
  },
  PEK: {
    name: "Peking Capital",
    city: "Beijing",
    lat: 40.0799,
    lon: 116.6031,
  },
  PVG: {
    name: "Shanghai Pudong",
    city: "Shanghai",
    lat: 31.1434,
    lon: 121.7876,
  },
  DFW: {
    name: "Dallas/Fort Worth",
    city: "Dallas",
    lat: 32.8998,
    lon: -97.0403,
  },
  ORD: {
    name: "Chicago O'Hare",
    city: "Chicago",
    lat: 41.9742,
    lon: -87.9073,
  },
  MAD: {
    name: "Madrid Barajas",
    city: "Madrid",
    lat: 40.4839,
    lon: -3.5679,
  },
  BCN: {
    name: "Barcelona-El Prat",
    city: "Barcelona",
    lat: 41.2974,
    lon: 2.0787,
  },
  FCO: {
    name: "Rom Fiumicino",
    city: "Rome",
    lat: 41.8003,
    lon: 12.2389,
  },
  DOH: {
    name: "Doha Hamad Intl",
    city: "Doha",
    lat: 25.273,
    lon: 51.608,
  },
  GRU: {
    name: "São Paulo Guarulhos",
    city: "Sao Paulo",
    lat: -23.4356,
    lon: -46.4731,
  },
  CPT: {
    name: "Kapstadt",
    city: "Cape Town",
    lat: -33.9692,
    lon: 18.6017,
  },
  JNB: {
    name: "Johannesburg OR Tambo",
    city: "Johannesburg",
    lat: -26.1367,
    lon: 28.2435,
  },
  SFO: {
    name: "San Francisco Intl",
    city: "San Francisco",
    lat: 37.6213,
    lon: -122.379,
  },
};

// Achievements Konfiguration
const achievements = {
  flights: [
    { milestone: 1, emoji: "🎉", key: "1" },
    { milestone: 10, emoji: "✈️", key: "10" },
    { milestone: 25, emoji: "🛫", key: "25" },
    { milestone: 50, emoji: "🌍", key: "50" },
    { milestone: 100, emoji: "💯", key: "100" },
    { milestone: 150, emoji: "🌟", key: "150" },
    { milestone: 250, emoji: "🏆", key: "250" },
    { milestone: 500, emoji: "🚀", key: "500" },
    { milestone: 750, emoji: "💎", key: "750" },
    { milestone: 1000, emoji: "🌌", key: "1000" },
  ],
  distance: [
    { milestone: 10000, emoji: "🏃", key: "10000" },
    { milestone: 40075, emoji: "🌐", key: "40075" },
    { milestone: 100000, emoji: "✨", key: "100000" },
    { milestone: 250000, emoji: "🏅", key: "250000" },
    { milestone: 384400, emoji: "🌕", key: "384400" },
    { milestone: 500000, emoji: "🌠", key: "500000" },
    { milestone: 768800, emoji: "🛰️", key: "768800" },
    { milestone: 1000000, emoji: "💥", key: "1000000" },
  ],
  time: [
    { milestone: 24, emoji: "☀️", key: "24" },
    { milestone: 100, emoji: "🗓️", key: "100" },
    { milestone: 500, emoji: "🕰️", key: "500" },
    { milestone: 1000, emoji: "⏳", key: "1000" },
    { milestone: 2500, emoji: "✨", key: "2500" },
    { milestone: 8760, emoji: "💫", key: "8760" },
  ],
  uniqueAirports: [
    { milestone: 10, emoji: "🗺️", key: "10" },
    { milestone: 25, emoji: "🧭", key: "25" },
    { milestone: 50, emoji: "🏛️", key: "50" },
    { milestone: 100, emoji: "🗽", key: "100" },
  ],
  longestFlight: [
    { milestone: 3000, emoji: "✈️", key: "3000" },
    { milestone: 5000, emoji: "🛫", key: "5000" },
    { milestone: 8000, emoji: "🌊", key: "8000" },
    { milestone: 12000, emoji: "🚀", key: "12000" },
  ],
  co2_total: [
    { milestone: 1000, emoji: "💨", key: "1000" },
    { milestone: 5000, emoji: "🌍", key: "5000" },
    { milestone: 10000, emoji: "📈", key: "10000" },
    { milestone: 50000, emoji: "🏭", key: "50000" },
    { milestone: 100000, emoji: "🚨", key: "100000" },
  ],
};

// Premium Bilder
const premiumFeatureImages = {
  globe: "./pictures/globe-teaser.jpg?q=80&w=1000&auto=format&fit=crop",
  print: "./pictures/print-teaser.jpg?q=80&w=1000&auto=format&fit=crop",
  autopilot: "./pictures/autopilot-teaser.jpg?q=80&w=1000&auto=format&fit=crop",
  photos: "./pictures/photos-teaser.jpg?q=80&w=1000&auto=format&fit=crop",
  default: "./pictures/globe-teaser.jpg?q=80&w=1000&auto=format&fit=crop",
};

// Pricing Config
const pricingConfig = {
  monthly: {
    amount: "2,99 €",
    periodKey: "premium.perMonth",
    fallbackPeriod: "/ Monat",
    stripeProductId: "price_1SXpRZCKgOyj3mnlTHFi6sNI",
  },
  yearly: {
    amount: "17,99 €",
    periodKey: "premium.perYear",
    fallbackPeriod: "/ Jahr",
    stripeProductId: "price_1SXpSxCKgOyj3mnlkPLe6JUY",
  },
};

////
/**
 * Lädt die Version aus der package.json und zeigt sie in der App an.
 */
async function displayAppVersion() {
  try {
    const response = await fetch("package.json");
    const data = await response.json();
    const versionElement = document.getElementById("app-version");
    if (versionElement && data.version) {
      versionElement.textContent = `v${data.version}`;
    }
  } catch (error) {
    console.error("Fehler beim Laden der Versionsnummer:", error);
  }
}

/**
 * Schaltet die Sichtbarkeit des Burger-Menüs um.
 */
function toggleBurgerMenu() {
  const menu = document.getElementById("burger-menu");
  menu.classList.toggle("hidden");
}

/**
 * Berechnet und zeigt die Errungenschaften des Nutzers an.
 */
async function updateAchievements() {
  const container = document.getElementById("achievements-container");
  container.innerHTML = `<p class="text-gray-500">${getTranslation(
    "achievements.loading"
  )}</p>`;

  const allFlights = await getFlights();
  if (allFlights.length === 0) {
    container.innerHTML = `<p class="text-gray-500">${getTranslation(
      "achievements.noFlights"
    )}</p>`;
    document.getElementById("records-container").innerHTML =
      `<p class="text-gray-500 md:col-span-2">${getTranslation(
        "stats.noData"
      )}</p>`;
    return;
  }

  // 1. Aktuelle Statistiken berechnen
  const totalFlights = allFlights.length;
  const totalDistance = allFlights.reduce(
    (sum, flight) => sum + flight.distance,
    0
  );
  const totalMinutes = allFlights.reduce(
    (sum, flight) => sum + parseFlightTimeToMinutes(flight.time),
    0
  );
  const totalHours = totalMinutes / 60;
  const uniqueAirports = new Set(
    allFlights.flatMap((f) => [f.departure, f.arrival])
  );
  const longestFlightDistance = Math.max(...allFlights.map((f) => f.distance));
  const totalCO2 = allFlights.reduce(
    (sum, flight) => sum + (flight.co2_kg || 0),
    0
  );

  let html = "";

  // 2. Alle definierten Errungenschaften durchgehen
  const allAchievementTypes = [
    {
      category: "flights",
      value: totalFlights,
      unit: getTranslation("achievements.unitFlights"),
    },
    {
      category: "distance",
      value: totalDistance,
      unit: getTranslation("achievements.unitKm"),
    },
    {
      category: "time",
      value: totalHours,
      unit: getTranslation("achievements.unitHours"),
    },
    {
      category: "uniqueAirports",
      value: uniqueAirports.size,
      unit: getTranslation("achievements.unitAirports"),
    },
    {
      category: "longestFlight",
      value: longestFlightDistance,
      unit: getTranslation("achievements.unitKm"),
    },
    {
      category: "co2_total",
      value: totalCO2,
      unit: getTranslation("achievements.unitCo2"),
    },
  ];

  allAchievementTypes.forEach((type) => {
    achievements[type.category].forEach((achievement) => {
      const isUnlocked = type.value >= achievement.milestone;
      const progressPercent = Math.min(
        (type.value / achievement.milestone) * 100,
        100
      );
      const progressBarColor =
        type.category === "co2_total" ? "bg-red-500" : "bg-indigo-500";

      // Verwende getTranslation mit den Schlüsseln aus dem Objekt
      const title = getTranslation(
        `achievements.${type.category}.${achievement.key}.title`
      );
      const description = getTranslation(
        `achievements.${type.category}.${achievement.key}.description`
      );

      html += `
                        <div class="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg flex items-center gap-4 ${
                          isUnlocked ? "" : "opacity-40"
                        }">
                            <span class="text-3xl">${achievement.emoji}</span>
                            <div>
                                <h3 class="font-bold text-gray-800 dark:text-white">${title}</h3>
                                <p class="text-sm text-gray-600 dark:text-gray-400">${description}</p>
                                <div class="w-full bg-gray-300 dark:bg-gray-600 rounded-full h-2 mt-2">
                                    <div class="${progressBarColor} h-2 rounded-full" style="width: ${progressPercent}%"></div>
                                </div>
                                <p class="text-xs text-right text-gray-500 dark:text-gray-400 mt-1">${Math.round(
                                  type.value
                                ).toLocaleString(
                                  "de-DE"
                                )} / ${achievement.milestone.toLocaleString(
                                  "de-DE"
                                )} ${type.unit}</p>
                            </div>
                        </div>
                    `;
    });
  });

  container.innerHTML = html;

  // Rekorde & Firsts berechnen und anzeigen
  const sortedFlights = resequenceAndAssignNumbers([...allFlights]);
  displayPersonalRecords(allFlights, sortedFlights);
}

/**
 * Erstellt den HTML-Code für einen einzelnen Rekord-Eintrag.
 */
function formatRecordEntry(title, value, description) {
  return `
                <div class="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400">${title}</p>
                    <p class="text-lg font-bold text-indigo-700 dark:text-indigo-400">${value}</p>
                    <p class="text-sm text-gray-600 dark:text-gray-300">${description}</p>
                </div>
            `;
}

/**
 * Erstellt den HTML-Code für einen noch nicht erreichten ("gesperrten") Rekord.
 */
function formatLockedEntry(title, description) {
  return `
                <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg opacity-40">
                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400">${title}</p>
                    <p class="text-lg font-bold text-gray-400 dark:text-gray-500">???</p>
                    <p class="text-sm text-gray-600 dark:text-gray-300">${description}</p>
                </div>
            `;
}

/**
 * Berechnet und zeigt die persönlichen Rekorde und "Firsts" an.
 */
function displayPersonalRecords(allFlights, sortedFlights) {
  const container = document.getElementById("records-container");
  if (!container) return;

  // --- 1. REKORDE BERECHNEN ---
  const longestFlight = allFlights.reduce(
    (max, f) => (f.distance > max.distance ? f : max),
    allFlights[0]
  );
  const shortestFlight = allFlights.reduce(
    (min, f) => (f.distance < min.distance ? f : min),
    allFlights[0]
  );

  const paidFlights = allFlights.filter((f) => typeof f.price === "number");
  const mostExpensiveFlight =
    paidFlights.length > 0
      ? paidFlights.reduce(
          (max, f) => (f.price > max.price ? f : max),
          paidFlights[0]
        )
      : null;

  const co2Flights = allFlights.filter((f) => typeof f.co2_kg === "number");
  const highestCo2Flight =
    co2Flights.length > 0
      ? co2Flights.reduce(
          (max, f) => (f.co2_kg > max.co2_kg ? f : max),
          co2Flights[0]
        )
      : null;

  // --- 2. "FIRSTS" BERECHNEN ---
  const firstFlight = sortedFlights[0];
  const firstLongHaul = sortedFlights.find((f) => f.distance > 5000);
  const firstBusinessOrFirst = sortedFlights.find(
    (f) => f.class === "Business" || f.class === "First"
  );
  const firstA380 = sortedFlights.find(
    (f) => f.aircraftType && f.aircraftType.toUpperCase().includes("A380")
  );

  const firstEquator = sortedFlights.find(
    (f) => (f.depLat > 0 && f.arrLat < 0) || (f.depLat < 0 && f.arrLat > 0)
  );
  const firstArctic = sortedFlights.find(
    (f) => f.depLat > 66.5 || f.arrLat > 66.5
  );
  const firstAntarctic = sortedFlights.find(
    (f) => f.depLat < -66.5 || f.arrLat < -66.5
  );
  const firstMeridian = sortedFlights.find(
    (f) => (f.depLon > 0 && f.arrLon < 0) || (f.depLon < 0 && f.arrLon > 0)
  );

  // KONTINENT-LOGIK
  const firstContinents = {};
  const continents = [
    "Asien",
    "Europa",
    "Nordamerika",
    "Südamerika",
    "Afrika",
    "Ozeanien",
    "Antarktis",
  ];

  // Initialisiere alle Kontinente als "gesperrt" (null)
  continents.forEach((c) => (firstContinents[c] = null));

  // Gehe durch alle Flüge und finde den ERSTEN Besuch
  for (const flight of sortedFlights) {
    const continent = getContinentForAirport(flight.arrival);
    if (continent && !firstContinents[continent]) {
      // Dies ist der erste Flug zu diesem Kontinent, den wir gefunden haben
      firstContinents[continent] = flight;
    }
  }

  // --- 3. HTML ERSTELLEN ---
  let html = "";

  // Rekorde (immer sichtbar)
  html += formatRecordEntry(
    getTranslation("records.longestFlight"),
    `${longestFlight.distance.toLocaleString("de-DE")} km`,
    `${longestFlight.departure} → ${longestFlight.arrival}`
  );
  html += formatRecordEntry(
    getTranslation("records.shortestFlight"),
    `${shortestFlight.distance.toLocaleString("de-DE")} km`,
    `${shortestFlight.departure} → ${shortestFlight.arrival}`
  );

  if (mostExpensiveFlight) {
    html += formatRecordEntry(
      getTranslation("records.mostExpensive"),
      `${mostExpensiveFlight.price.toLocaleString("de-DE")} ${
        mostExpensiveFlight.currency
      }`,
      `${mostExpensiveFlight.departure} → ${mostExpensiveFlight.arrival}`
    );
  }
  if (highestCo2Flight) {
    html += formatRecordEntry(
      getTranslation("records.highestCO2"),
      `${highestCo2Flight.co2_kg.toLocaleString("de-DE")} kg`,
      `${highestCo2Flight.departure} → ${highestCo2Flight.arrival}`
    );
  }

  // "Firsts" (jetzt mit "Gesperrt"-Zustand)
  html += formatRecordEntry(
    getTranslation("records.firstFlight"),
    `${firstFlight.date}`,
    `${firstFlight.departure} → ${firstFlight.arrival}`
  );

  if (firstLongHaul) {
    html += formatRecordEntry(
      getTranslation("records.firstLongHaul"),
      `${firstLongHaul.date}`,
      `${firstLongHaul.departure} → ${firstLongHaul.arrival}`
    );
  } else {
    html += formatLockedEntry(
      getTranslation("records.firstLongHaul"),
      getTranslation("records.firstLongHaulDesc")
    );
  }

  if (firstBusinessOrFirst) {
    const title = getTranslation("records.firstPremiumFlight").replace(
      "{class}",
      firstBusinessOrFirst.class
    );
    html += formatRecordEntry(
      title,
      `${firstBusinessOrFirst.date}`,
      `${firstBusinessOrFirst.departure} → ${firstBusinessOrFirst.arrival}`
    );
  } else {
    const title = getTranslation("records.firstPremiumFlight").replace(
      "{class}",
      "Premium"
    );
    html += formatLockedEntry(
      title,
      getTranslation("records.firstPremiumFlightDesc")
    );
  }

  if (firstA380) {
    html += formatRecordEntry(
      getTranslation("records.firstA380"),
      `${firstA380.date}`,
      `${firstA380.departure} → ${firstA380.arrival}`
    );
  } else {
    html += formatLockedEntry(
      getTranslation("records.firstA380"),
      getTranslation("records.firstA380Desc")
    );
  }

  if (firstEquator) {
    html += formatRecordEntry(
      getTranslation("records.firstEquator"),
      `${firstEquator.date}`,
      `${firstEquator.departure} → ${firstEquator.arrival}`
    );
  } else {
    html += formatLockedEntry(
      getTranslation("records.firstEquator"),
      getTranslation("records.firstEquatorDesc")
    );
  }

  if (firstArctic) {
    html += formatRecordEntry(
      getTranslation("records.firstArctic"),
      `${firstArctic.date}`,
      `${firstArctic.departure} → ${firstArctic.arrival}`
    );
  } else {
    html += formatLockedEntry(
      getTranslation("records.firstArctic"),
      getTranslation("records.firstArcticDesc")
    );
  }

  if (firstAntarctic) {
    html += formatRecordEntry(
      getTranslation("records.firstAntarctic"),
      `${firstAntarctic.date}`,
      `${firstAntarctic.departure} → ${firstAntarctic.arrival}`
    );
  } else {
    html += formatLockedEntry(
      getTranslation("records.firstAntarctic"),
      getTranslation("records.firstAntarcticDesc")
    );
  }

  if (firstMeridian) {
    html += formatRecordEntry(
      getTranslation("records.firstMeridian"),
      `${firstMeridian.date}`,
      `${firstMeridian.departure} → ${firstMeridian.arrival}`
    );
  } else {
    html += formatLockedEntry(
      getTranslation("records.firstMeridian"),
      getTranslation("records.firstMeridianDesc")
    );
  }

  // Kontinent-Meilensteine anzeigen
  const continentToKeyMap = {
    Asien: "Asia",
    Europa: "Europe",
    Nordamerika: "NorthAmerica",
    Südamerika: "SouthAmerica",
    Afrika: "Africa",
    Ozeanien: "Oceania",
    Antarktis: "Antarctica",
  };

  // Iteriere über die deutschen Kontinentnamen aus der Logik
  continents.forEach((continent) => {
    const flight = firstContinents[continent];

    // Baue den Schlüssel über das Mapping-Objekt
    const keySuffix = continentToKeyMap[continent];
    const titleKey = `records.firstVisit${keySuffix}`;
    const descKey = `records.firstVisit${keySuffix}Desc`;

    if (flight) {
      html += formatRecordEntry(
        getTranslation(titleKey), // <-- KORREKTER SCHLÜSSEL
        `${flight.date}`,
        `${flight.departure} → ${flight.arrival}`
      );
    } else {
      html += formatLockedEntry(
        getTranslation(titleKey), // <-- KORREKTER SCHLÜSSEL
        getTranslation(descKey) // <-- KORREKTER SCHLÜSSEL
      );
    }
  });

  container.innerHTML = html;
}

/**
 * Ermittelt eine CSS-Farbklasse basierend auf der Flugnummer und den Errungenschaften.
 * @param {number} flightNumber - Die sequenzielle Flugnummer.
 * @returns {string} Die Tailwind-CSS-Klasse für die Hintergrundfarbe.
 */
function getMilestoneColor(flightNumber) {
  // Wir durchsuchen die Errungenschaften von der höchsten zur niedrigsten Stufe.
  const flightAchievements = [...achievements.flights].reverse();

  for (const achievement of flightAchievements) {
    if (flightNumber >= achievement.milestone) {
      // Weise Farben basierend auf dem Titel oder der Stufe zu
      switch (achievement.milestone) {
        case 1000:
          return "bg-purple-600"; // Meister
        case 750:
          return "bg-cyan-500"; // Diamant
        case 500:
          return "bg-amber-500"; // Legende
        case 250:
          return "bg-yellow-400"; // Gold
        case 150:
          return "bg-slate-400"; // Silber
        case 100:
          return "bg-rose-600";
        case 50:
          return "bg-orange-400"; // Globetrotter
        case 25:
          return "bg-amber-600"; // Bronze
        case 10:
          return "bg-teal-500";
        default:
          continue; // Prüfe die nächste Stufe
      }
    }
  }
  // Standardfarbe, wenn kein besonderer Meilenstein erreicht wurde
  return "bg-indigo-600";
}

var calculateStatistics = function (flights) {
  var stats = {
    totalCount: flights.length,
    totalDistance: 0,
    totalCO2: 0,
    airportUsage: {},
    frequentAirport: getTranslation("stats.noData"),
    // Neue Statistik-Properties
    longestFlight: null,
    shortestFlight: null,
    averageDistance: 0,
    averageCO2: 0,
    aircraftUsage: {},
    frequentAircraft: getTranslation("stats.noData"),
    yearlyData: {},
    totalSpending: {}, // Objekt, um mehrere Währungen zu speichern
    mostExpensiveFlight: null,
    leastExpensiveFlight: null,
  };

  if (flights.length === 0) return stats;

  flights.forEach(function (flight) {
    stats.totalDistance += flight.distance;

    if (flight.co2_kg > 0) {
      // NEU
      stats.totalCO2 += flight.co2_kg;
    }

    // 1. Längsten/kürzesten Flug finden
    if (
      !stats.longestFlight ||
      flight.distance > stats.longestFlight.distance
    ) {
      stats.longestFlight = flight;
    }
    if (
      !stats.shortestFlight ||
      flight.distance < stats.shortestFlight.distance
    ) {
      stats.shortestFlight = flight;
    }

    // 2. Flugzeugtyp-Nutzung zählen
    if (flight.aircraftType && flight.aircraftType.trim() !== "") {
      const type = flight.aircraftType.trim().toUpperCase();
      stats.aircraftUsage[type] = (stats.aircraftUsage[type] || 0) + 1;
    }

    // 3. Jahresdaten sammeln
    const year = flight.date.substring(0, 4);
    if (!stats.yearlyData[year]) {
      stats.yearlyData[year] = { count: 0, distance: 0 };
    }
    stats.yearlyData[year].count++;
    stats.yearlyData[year].distance += flight.distance;

    // Bestehende Logik
    stats.airportUsage[flight.departure] =
      (stats.airportUsage[flight.departure] || 0) + 1;
    stats.airportUsage[flight.arrival] =
      (stats.airportUsage[flight.arrival] || 0) + 1;

    // NEU: Kosten berechnen
    // Prüfe, ob der Preis eine Zahl ist (inklusive 0)
    if (typeof flight.price === "number" && flight.currency) {
      //          if (flight.price > 0 && flight.currency) {
      const currency = flight.currency;
      // Gesamtausgaben pro Währung summieren
      stats.totalSpending[currency] =
        (stats.totalSpending[currency] || 0) + flight.price;

      // Teuersten/günstigsten Flug finden (vereinfacht, vergleicht nur Preise ohne Währungsumrechnung)
      if (
        !stats.mostExpensiveFlight ||
        flight.price > stats.mostExpensiveFlight.price
      ) {
        stats.mostExpensiveFlight = flight;
      }
      if (
        !stats.leastExpensiveFlight ||
        flight.price < stats.leastExpensiveFlight.price
      ) {
        stats.leastExpensiveFlight = flight;
      }
    }
  });

  // Berechnungen nach der Schleife
  stats.averageDistance = Math.round(stats.totalDistance / stats.totalCount);
  stats.averageCO2 = Math.round(stats.totalCO2 / stats.totalCount);

  // Häufigsten Flughafen finden
  let maxCount = 0;
  for (var code in stats.airportUsage) {
    if (stats.airportUsage[code] > maxCount) {
      maxCount = stats.airportUsage[code];
      stats.frequentAirport = airportData[code]
        ? `${airportData[code].name} (${code})`
        : code;
    }
  }

  // Häufigsten Flugzeugtyp finden
  let maxAircraftCount = 0;
  for (var type in stats.aircraftUsage) {
    if (stats.aircraftUsage[type] > maxAircraftCount) {
      maxAircraftCount = stats.aircraftUsage[type];
      stats.frequentAircraft = `${type} (${maxAircraftCount}x)`;
    }
  }

  return stats;
};

/**
 * Ruft Flugdaten per Flugnummer und Datum ab und füllt das Formular aus.
 * FR24
 */
async function autofillFlightData() {
  const flightNumber = document
    .getElementById("auto-flight-number")
    .value.replace(/\s/g, "")
    .trim()
    .toUpperCase();
  const flightDate = document.getElementById("auto-flight-date").value;

  if (!flightNumber || !flightDate) {
    showMessage(getTranslation("form.autopilotError"), "error");
    return;
  }

  const btn = document.getElementById("autofill-btn");
  btn.textContent = getTranslation("form.buttonFetching");
  btn.disabled = true;

  try {
    // Wir übergeben 'flight_number' (wird von der Netlify-Funktion als 'flights' interpretiert)
    const response = await fetch(
      `https://aesthetic-strudel-ecfe50.netlify.app/.netlify/functions/fetch-flight-by-number?flight_number=${flightNumber}&date=${flightDate}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    const result = await response.json();

    // KORRIGIERTE ANTWORT-STRUKTUR: 'result.data'
    if (result.data && result.data.length > 0) {
      // Finde den Flug, der am nächsten am Zieldatum liegt
      const targetTimestamp = new Date(flightDate).getTime();
      const flight = result.data.reduce((prev, curr) => {
        const prevDiff = Math.abs(
          new Date(prev.first_seen).getTime() - targetTimestamp
        );
        const currDiff = Math.abs(
          new Date(curr.first_seen).getTime() - targetTimestamp
        );
        return currDiff < prevDiff ? curr : prev;
      });

      // --- DATEN EXTRAHIEREN ---
      const depIata = flight.orig_iata || (flight.airport?.origin?.code?.iata) || "";
      const arrIata = flight.dest_iata || (flight.airport?.destination?.code?.iata) || "";
      const airlineIata = flight.operating_as || flight.painted_as || (flight.airline?.code?.icao) || (flight.airline?.code?.iata) || ""; 
      const aircraftModel = flight.type || (flight.aircraft?.model?.code) || ""; 
      
      // Sicheres Auslesen der Registrierung für Live- und Historien-Flüge
      const registration = flight.reg || (flight.aircraft?.registration) || flight.registration || "";
      
      if (!depIata || !arrIata) {
          throw new Error("Flughafencodes fehlen in den API-Daten.");
      }

      // Airline-Namen abrufen (Robust gegen Arrays, Objekte und Strings)
      let airlineName = airlineIata; // Standard-Fallback ist der IATA/ICAO Code

      if (airlineIata) {
          try {
              const fetchedAirline = await fetchAirlineName(airlineIata);
              
              if (fetchedAirline) {
                  if (Array.isArray(fetchedAirline) && fetchedAirline.length > 0) {
                      // API Ninjas liefert oft ein Array: [{ name: "Lufthansa", ... }]
                      airlineName = fetchedAirline[0].name || fetchedAirline[0].icao || airlineIata;
                  } else if (typeof fetchedAirline === 'object' && !Array.isArray(fetchedAirline)) {
                      // Es ist ein einzelnes Objekt
                      airlineName = fetchedAirline.name || fetchedAirline.icao || airlineIata;
                  } else if (typeof fetchedAirline === 'string' && fetchedAirline.trim() !== "") {
                      // Es ist bereits reiner Text
                      airlineName = fetchedAirline;
                  }
              }
          } catch (error) {
              console.warn("Airline-Name konnte nicht geladen werden, nutze Code-Fallback.", error);
          }
      }

      // --- FORMULAR FÜLLEN ---
      document.getElementById("departure").value = depIata;
      document.getElementById("arrival").value = arrIata;
      document.getElementById("aircraftType").value = aircraftModel || "";
      // Falls die Flugnummer fehlt, nehmen wir das, was der Nutzer ins Suchfeld getippt hat
      document.getElementById("flightNumber").value = flight.flight || flight.identification?.number?.default || document.getElementById("auto-flight-number").value.trim().toUpperCase() || "";
      document.getElementById("airline").value = airlineName || "";
      document.getElementById("registration").value = registration || "";
      document.getElementById("flightDate").value = flightDate;

      // Wir müssen die Flughafendaten noch schnell cachen, falls sie neu sind
      // (Wir rufen die Detail-API auf, um alle Infos zu haben)
      await showAirportDetails(depIata, true); // true = "nur cachen, nicht anzeigen"
      await showAirportDetails(arrIata, true);

      updateFlightDetails(); // Distanz, Zeit & CO2 berechnen
      showMessage(getTranslation("form.autopilotSuccess"), "success");
    } else {
      // Prüfen, ob das eingegebene Datum heute oder in der Zukunft liegt
      const selectedDate = new Date(flightDate).setHours(0, 0, 0, 0);
      const today = new Date().setHours(0, 0, 0, 0);

      if (selectedDate >= today) {
          // Meldung für zukünftige oder geplante, aber noch nicht gestartete Flüge
          showMessage(getTranslation("messages.futureData"), "info");
      } else {
          // Standard-Meldung für alte Flüge, die wirklich nicht existieren
          showMessage(getTranslation("messages.noDataFound"), "error");
      }
    }
  } catch (error) {
    console.error("Fehler beim Abrufen der Flugdaten:", error);
    showMessage(
      getTranslation("messages.fetchError") + `: ${error.message}`,
      "error"
    );
  } finally {
    btn.textContent = getTranslation("form.buttonFetch");
    btn.disabled = false;
  }
}

/**
 * Setzt den Zeitraum für die Charts und löst eine Aktualisierung aus.
 * @param {'year' | 'month'} timeframe
 */
async function setChartTimeframe(timeframe) {
  currentChartTimeframe = timeframe; // Neuen Zeitraum speichern
  const flights = await getFlights(); // Immer die kompletten, aktuellen Daten laden
  updateCharts(flights, currentChartTimeframe); // Charts mit den neuen Daten und dem neuen Zeitraum aktualisieren
}

// *** Autocomplete-Logik ***
async function updateAutocompleteList(inputId, listId) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  const value = input.value.trim();
  list.innerHTML = "";

  if (value.length < 3) {
    list.classList.add("hidden");
    return;
  }

  const upperCaseValue = value.toUpperCase();
  let matches = [];

  // 1. Lokale Suche (schnell)
  for (const code in airportData) {
    const airport = airportData[code];
    if (
      code.includes(upperCaseValue) ||
      airport.name.toUpperCase().includes(upperCaseValue)
    ) {
      matches.push({ code, ...airport });
    }
  }

  // 2. Externe API-Suche (langsamer)
  const apiResults = await window.fetchExternalAirport(value);

  // 3. Ergebnisse zusammenführen und Duplikate entfernen
  if (apiResults && apiResults.length > 0) {
    const existingCodes = new Set(matches.map((m) => m.code));
    apiResults.forEach((result) => {
      if (!existingCodes.has(result.code)) {
        matches.push(result);
      }
    });
  }

  // 4. Ergebnisse alphabetisch sortieren
  matches.sort((a, b) => a.name.localeCompare(b.name));

  // 5. Ergebnisse anzeigen
  if (matches.length > 0) {
    matches.slice(0, 10).forEach((match) => {
      // Begrenze auf 10 Ergebnisse zur Übersicht
      const item = document.createElement("div");
      item.className =
        "p-2 cursor-pointer text-gray-700 dark:text-gray-300 autocomplete-item";
      item.textContent = `${match.name} (${match.code})`;
      item.addEventListener("click", () => {
        selectAutocompleteItem(input, list, match); // Übergib das komplette Objekt
      });
      list.appendChild(item);
    });
    list.classList.remove("hidden");
  } else {
    list.classList.add("hidden");
  }
}

var hideAllAutocompleteLists = function () {
  document.getElementById("departure-list").classList.add("hidden");
  document.getElementById("arrival-list").classList.add("hidden");
};

function selectAutocompleteItem(input, list, selectedAirport) {
  // Stelle sicher, dass die Stadtinformation an die Speicherfunktion übergeben wird
  cacheAndSaveAirport({
    code: selectedAirport.code,
    name: selectedAirport.name,
    lat: selectedAirport.lat,
    lon: selectedAirport.lon,
    city: selectedAirport.city, // Stadtinformation hinzufügen
  });

  input.value = selectedAirport.code;
  list.classList.add("hidden");
  updateFlightDetails();
  input.focus();
}

var updateFlightDetails = function () {
  var departureInput = document.getElementById("departure").value;
  var arrivalInput = document.getElementById("arrival").value;
  var flightClass = document.getElementById("flightClass").value; // NEU
  var departureAirport = findAirport(departureInput);
  var arrivalAirport = findAirport(arrivalInput);
  var distanceDisplay = document.getElementById("distance-display");
  var timeDisplay = document.getElementById("time-display");
  var co2Display = document.getElementById("co2-display"); // NEU
  var logButton = document.getElementById("log-button");

  distanceDisplay.textContent = "-";
  timeDisplay.textContent = "-";
  co2Display.textContent = "-"; // NEU
  logButton.disabled = true;

  // (Dank Korrektur 1 wird dies jetzt 'null' sein, wenn die Felder leer sind)
  var departureAirport = findAirport(departureInput);
  var arrivalAirport = findAirport(arrivalInput);

  // Nur wenn BEIDE Flughäfen gefunden wurden, neu berechnen
  if (departureAirport && arrivalAirport) {
    var distance = calculateDistance(
      departureAirport.lat,
      departureAirport.lon,
      arrivalAirport.lat,
      arrivalAirport.lon
    );
    var estimatedTime = estimateFlightTime(distance);
    var estimatedCO2 = calculateCO2(distance, flightClass);

    distanceDisplay.textContent = `${Math.round(distance).toLocaleString(
      "de-DE"
    )} km`;
    timeDisplay.textContent = estimatedTime;
    co2Display.textContent = `${estimatedCO2.toLocaleString("de-DE")} kg`;
    logButton.disabled = false;
  }
};

/**
 * Sortiert Flüge chronologisch nach Datum und weist sequenzielle Flugbuch-Nummern zu.
 * @param {Array<Object>} flights - Das Array der Flug-Objekte.
 * @returns {Array<Object>} Das sortierte und neu nummerierte Array.
 */
function resequenceAndAssignNumbers(flights) {
  // 1. Sortiere die Flüge. Primäres Kriterium ist das Datum (aufsteigend).
  // Als zweites Kriterium dient die technische ID, um eine stabile Reihenfolge
  // bei Flügen am selben Tag zu gewährleisten.
  const sortedFlights = flights.sort((a, b) => {
    const dateComparison = new Date(a.date) - new Date(b.date);
    if (dateComparison !== 0) {
      return dateComparison;
    }
    return a.id - b.id; // Fallback-Sortierung für Flüge am gleichen Tag
  });

  // 2. Weise die neuen, sequenziellen Flugbuch-Nummern zu.
  sortedFlights.forEach((flight, index) => {
    flight.flightLogNumber = index + 1;
  });

  return sortedFlights;
}

/**
 * Aktualisiert die UI der Sortier-Buttons, um den aktiven Zustand anzuzeigen.
 */
function updateSortButtonUI() {
  // Entferne zuerst alle aktiven Zustände und Pfeile
  document.querySelectorAll(".sort-btn").forEach((btn) => {
    btn.classList.remove("active");
    btn.textContent = btn.textContent.replace(/ [▲▼]/, "");
  });

  // Setze den aktiven Zustand und Pfeil für den aktuellen Sortier-Button
  const activeButton = document.getElementById(`sort-btn-${currentSort.key}`);
  if (activeButton) {
    activeButton.classList.add("active");
    activeButton.textContent += currentSort.direction === "asc" ? " ▲" : " ▼";
  }
}
