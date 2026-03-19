// =================================================================
// MAIN APP LOGIC
// =================================================================

let isDemoMode = false; // Neue Flagge

// Globale Variable für das aktuell geladene Flugzeug-Foto
let currentPlanespottersData = null;

// API-Aufruf zu Planespotters.net
async function fetchAircraftPhoto(registration) {
    if (!registration || registration.trim().length < 3) return null;
    
    try {
        const cleanReg = registration.trim().toUpperCase();
        // Planespotters API aufrufen
        const response = await fetch(`https://api.planespotters.net/pub/photos/reg/${cleanReg}`);
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        // Prüfen, ob Fotos gefunden wurden
        if (data && data.photos && data.photos.length > 0) {
            const photo = data.photos[0]; // Wir nehmen das erste (beliebteste/neueste) Bild
            return {
                url: photo.thumbnail_large.src,
                photographer: photo.photographer,
                link: photo.link
            };
        }
    } catch (err) {
        console.warn("Planespotters API Fehler:", err);
    }
    return null;
}

// Manuelles Leeren der Vorschau
window.clearPlanespottersPreview = function() {
    document.getElementById('planespotters-preview').classList.add('hidden');
    currentPlanespottersData = null;
};

async function initializeApp() {
  if (isAppInitialized) return;
  isAppInitialized = true;

  let user;
  
  document.getElementById("auth-container").classList.add("hidden");
  document.getElementById("app-container").classList.remove("hidden");

  try {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    user = data.user;

    // 🚀 NEU: Prüfen, ob wir über einen Einladungs-Link gekommen sind
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');
    if (inviteId && user && inviteId !== user.id) {
        handleFriendInvite(inviteId, user.id);
        // Die URL sofort bereinigen, damit der Dialog beim Neuladen nicht nochmal kommt
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // --- NEU: Profil-Daten laden ---
    //// loadUserProfile(user);
    // -------------------------------

    // --- BILLING INIT ---
    // Wir übergeben die ID, damit RevenueCat den User zuordnen kann
    await initializeBilling(user.id);
    // --------------------

    if (user) {
      const userDisplay = document.getElementById("user-display");
      if (userDisplay) {
        userDisplay.textContent = user.email;
      }

      // --- ✅ STATUS-PRÜFUNG & SELBSTHEILUNG ---
      const meta = user.user_metadata || {};
      
      // Letzte Flug-ID laden
      if (meta.last_flight_id) {
          globalLastFlightId = meta.last_flight_id;
      }
      
      let isPro = false;
      let performDbCorrection = false;

      // 🚀 1. REVENUECAT (NATIV) HAT VORRANG!
      // Wenn das native SDK durch initializeBilling() den Nutzer bereits als PRO markiert hat,
      // vertrauen wir dem zu 100%, egal was in der Supabase steht.
      const isNative = typeof isNativeApp === 'function' ? isNativeApp() : (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform());
      
      if (isNative && window.currentUserSubscription === "pro") {
          isPro = true;
      } 
      // 🌍 2. SUPABASE (WEB) ALS ZWEITE INSTANZ
      else if (meta.subscription_status === "pro") {
        if (meta.subscription_end) {
          currentSubscriptionEnd = Number(meta.subscription_end);
          const nowInSeconds = Math.floor(Date.now() / 1000);

          if (currentSubscriptionEnd > (nowInSeconds - 30)) {
            isPro = true;
          } else {
            console.warn("Status: Datum abgelaufen! Markiere für DB-Korrektur...");
            isPro = false;
            performDbCorrection = true;
          }
        } else {
          // Fall B: "Pro" ohne Datum.
          // Google Play und Apple Abos verlängern sich automatisch. 
          // RevenueCat schreibt nicht immer zwingend ein Enddatum in die Supabase.
          // Daher erlauben wir diese Quellen jetzt ausdrücklich!
          const validSources = ['lifetime', 'google_play', 'apple_app_store', 'stripe'];
          
          if (validSources.includes(meta.subscription_source)) {
              isPro = true;
          } else {
              console.warn("Status Inkonsistenz: PRO ohne Datum und unbekannte Quelle. Setze auf FREE.");
              isPro = false;
              performDbCorrection = true;
          }
        }
      }

      // Status global setzen
      currentUserSubscription = isPro ? "pro" : "free";
      window.currentUserSubscriptionSource = meta.subscription_source || null;

      // --- 🛠 DB REPARATUR DURCHFÜHREN ---
      // Wir korrigieren nur, wenn wir WIRKLICH sicher sind, dass das Abo abgelaufen ist
      if (performDbCorrection && !isPro) {
          console.log("Führe DB-Korrektur durch (Setze Status auf FREE)...");
          supabaseClient.auth.updateUser({
              data: { subscription_status: 'free', subscription_end: null }
          });
      }
      // --- ENDE STATUS-PRÜFUNG ---

      // --- ✅ PROFIL & UI UPDATES (Nach der Status-Prüfung!) ---
      
      // 1. Profil-Tab aktualisieren (JETZT weiß die App, ob du PRO bist!)
      loadUserProfile(user);

      // 2. Schloss am Scanner-Button steuern
      const scannerLock = document.getElementById("scanner-lock");
      if (currentUserSubscription === "pro") {
          if (scannerLock) scannerLock.classList.add("hidden");
      } else {
          if (scannerLock) scannerLock.classList.remove("hidden");
      }
    } else {
      currentUserSubscription = "free";
    }
  } catch (e) {
    console.error("Fehler beim Abrufen des Benutzers:", e);
    currentUserSubscription = "free";
  }

  await migrateAndLoadAirports();

  if (!map) {
    map = L.map("flight-map-container").setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
  }

  // --- Event-Listener: ---

  // Listener für Flight-Number:
  document
    .getElementById("autofill-btn")
    .addEventListener("click", autofillFlightData);

  // Listener für das neue Burger-Menü
  ////document
    ////.getElementById("burger-menu-btn")
    ////.addEventListener("click", toggleBurgerMenu);
  //// document.getElementById("menu-logout-btn").addEventListener("click", logout);
  

  // Listener, um das Menü zu schließen, wenn man daneben klickt
  document.addEventListener("click", function (event) {
    const menu = document.getElementById("burger-menu");
    const menuBtn = document.getElementById("burger-menu-btn");
    if (
      !menu.classList.contains("hidden") &&
      !menu.contains(event.target) &&
      !menuBtn.contains(event.target)
    ) {
      toggleBurgerMenu();
    }
  });

  // Listener für Autopilot (Sperre)
  const autopilotSummary = document
    .querySelector('[data-i18n="autoPilot"]')
    ?.closest("summary");
  if (autopilotSummary) {
    autopilotSummary.addEventListener("click", (e) => {
      if (currentUserSubscription === "free") {
        e.preventDefault();
        openPremiumModal("autopilot");
      }
    });
  }

  // ✅ NEU: Listener für Foto-Upload (Sperre / Gatekeeper)
  // Wir hängen den Listener an das LABEL, da man darauf klickt, um Dateien zu wählen
  const photoLabelInput = document.querySelector('label[for="flightPhoto"]');
  if (photoLabelInput) {
    photoLabelInput.addEventListener("click", (e) => {
      // Wir prüfen den Status "live" beim Klick
      if (currentUserSubscription === "free") {
        e.preventDefault(); // 🛑 Verhindert das Öffnen des Datei-Managers
        e.stopPropagation();
        openPremiumModal("photos"); // Öffnet das Upsell-Modal
      }
      // Wenn Pro: Mach nichts, Browser öffnet Standard-Upload
    });
  }

  document
    .getElementById("play-chronicle-btn")
    .addEventListener("click", animateTravelChronicle);
  document
    .getElementById("flightClass")
    .addEventListener("change", updateFlightDetails);
  document
    .getElementById("chart-view-year")
    .addEventListener("click", () => setChartTimeframe("year"));
  document
    .getElementById("chart-view-month")
    .addEventListener("click", () => setChartTimeframe("month"));
  document
    .getElementById("password-change-form")
    .addEventListener("submit", changePassword);

  // Listener für Foto-Vorschau (wenn Dateien gewählt wurden)
  document.getElementById("flightPhoto").addEventListener("change", (event) => {
    const files = event.target.files;
    const previewText = document.getElementById("photo-preview-text");
    const previewContainer = document.getElementById("photo-preview-container");

    if (files && files.length > 0) {
      previewText.textContent = getTranslation("form.filesSelected").replace(
        "{count}",
        files.length
      );
      previewContainer.classList.remove("hidden");
    } else {
      previewText.textContent = getTranslation("form.noFileSelected");
      previewContainer.classList.add("hidden");
    }
  });

  document.getElementById("departure").addEventListener("input", () => {
    updateAutocompleteList("departure", "departure-list");
    updateFlightDetails();
  });
  document.getElementById("arrival").addEventListener("input", () => {
    updateAutocompleteList("arrival", "arrival-list");
    updateFlightDetails();
  });
  document
    .getElementById("logbook-view-aircraft")
    .addEventListener("click", () => renderLogbookView("aircraftType"));
  document
    .getElementById("logbook-view-airline")
    .addEventListener("click", () => renderLogbookView("airline"));
  document
    .getElementById("logbook-view-airport")
    .addEventListener("click", () => renderLogbookView("airport"));
  document
    .getElementById("logbook-view-registration")
    .addEventListener("click", () => renderLogbookView("registration"));

  document
    .getElementById("import-file-input")
    .addEventListener("change", handleImport);

  document
    .getElementById("show-globe-btn")
    .addEventListener("click", openGlobeModal);

  // Listener für den Druck-Button
  document
    .getElementById("print-book-btn")
    .addEventListener("click", triggerPrintView_FlightsTab);

  // --- ENDE Event-Listener ---

  // Initiales Rendern der App
  showTab("fluege");
  renderFlights();
  displayAppVersion();
  showFirstStepsTutorial();
  updateLockVisuals();
  // 🚀 NEU: Live-Widget für heutige Flüge prüfen
  initLiveWidget();

  // --- ✅ UPDATE: LIVE-CHECK (Der Wächter) ---
  // Prüft alle 60 Sekunden
  setInterval(async () => {
    
    // 1. Native Prüfung (RevenueCat)
    // Das sorgt dafür, dass auch bei offener App ein abgelaufenes Abo erkannt wird
    if (isNativeApp() && typeof refreshSubscriptionStatus === 'function') {
         // Wir machen das vllt. nicht jede Minute, um Akku zu sparen? 
         // Doch, invalidateCache ist billig, Google Play Anfragen kosten nix.
         await refreshSubscriptionStatus();
    }

    // 2. Zeit-Prüfung (Bestehender Code für Supabase-Datum)
    if (currentUserSubscription === "pro" && currentSubscriptionEnd) {
      const now = Math.floor(Date.now() / 1000);

      if (now > currentSubscriptionEnd) {
        console.warn("Live-Check: Subscription expired (Time Check).");
        
        // ... (Dein existierender Downgrade Code hier) ...
        currentUserSubscription = "free";
        updateLockVisuals();
        // ...
        
        // WICHTIG: Auch hier die Selbstheilung der DB anstoßen!
        supabaseClient.auth.updateUser({
            data: { subscription_status: 'free', subscription_end: null }
        });
      }
    }
  }, 60000); // Alle 60 Sekunden

  // Trips initial laden
  loadTripsIntoDropdown();

  // Trips für den Filter laden (für den Tab "Flüge")
  populateTripFilterDropdown();

  // --- OFFLINE SYNC LISTENER ---
  // 1. Beim Start prüfen
  syncOfflineFlights();
  
  // 2. Nach fehlenden Registrierungen für vergangene Flüge suchen (Butler)
  autoSyncMissingFlightData();

  // 3. Wenn Verbindung wiederkommt
  window.addEventListener('online', () => {
      console.log("🌐 Verbindung wiederhergestellt. Starte Sync...");
      syncOfflineFlights();
  });

}

// ==========================================
// OFFLINE SYNC LOGIC
// ==========================================

function saveFlightOffline(flightData) {
    // 1. Hole bestehende Queue aus LocalStorage
    let queue = [];
    try {
        queue = JSON.parse(localStorage.getItem('offline_flight_queue') || '[]');
    } catch (e) { queue = []; }
    
    // 2. Flug markieren und hinzufügen
    flightData._isOffline = true; 
    flightData._timestamp = new Date().getTime(); // Für Sortierung
    queue.push(flightData);
    
    // 3. Speichern
    localStorage.setItem('offline_flight_queue', JSON.stringify(queue));
    
    showMessage(
      getTranslation("toast.saveOffline") || "Offline gespeichert",
      getTranslation("toast.noInternet") || "Kein Internet. Flug wurde lokal gespeichert und wird später übertragen.",
      "info"
    );
}

async function syncOfflineFlights() {
    // Nur ausführen, wenn wir online sind
    if (!navigator.onLine) return;

    let queue = [];
    try {
        queue = JSON.parse(localStorage.getItem('offline_flight_queue') || '[]');
    } catch (e) { return; }
    
    if (queue.length === 0) return;

    console.log(`🔄 Sync: Versuche ${queue.length} Offline-Flüge zu senden...`);
    showMessage(
    getTranslation("toast.syncTitle") || "Sync", 
    (getTranslation("toast.syncingDesc") || "Übertrage {count} offline gespeicherte Flüge...").replace("{count}", queue.length), 
    "info"
);

    const failedQueue = [];
    let successCount = 0;

    for (const flight of queue) {
        // Aufräumen: Interne Offline-Flags entfernen
        const { _isOffline, _timestamp, ...flightForDb } = flight;

        // --- 📸 NEU: Planespotters Foto beim Sync automatisch nachladen! ---
        if (!flightForDb.planespotters_url && flightForDb.registration) {
            try {
                // Wir rufen die Funktion auf, die wir vorhin angelegt haben
                const photoData = await fetchAircraftPhoto(flightForDb.registration);
                if (photoData) {
                    flightForDb.planespotters_url = photoData.url;
                    flightForDb.planespotters_photographer = photoData.photographer;
                }
            } catch (e) {
                console.warn("Konnte Flugzeugbild beim Sync nicht nachladen", e);
            }
        }
        // -----------------------------------------------------------------

        // Versuchen zu senden
        const { error } = await supabaseClient
            .from("flights")
            .insert(flightForDb);

        if (error) {
            console.error("Sync Fehler für Flug:", flight, error);
            // Bei Fehler behalten wir ihn in der Queue
            failedQueue.push(flight);
        } else {
            successCount++;
        }
    }

    // Queue aktualisieren (nur die fehlgeschlagenen bleiben übrig)
    localStorage.setItem('offline_flight_queue', JSON.stringify(failedQueue));

    if (successCount > 0) {
        showMessage(
            getTranslation("toast.syncSuccess") || "Sync erfolgreich", 
            (getTranslation("toast.flightsTransferred") || "{successCount} Flüge wurden nachgetragen.").replace("{successCount}", successCount), 
            "success"
        );
        
        // Liste neu laden, damit die neuen Flüge erscheinen
        if (typeof renderFlights === 'function') {
             // Cache leeren erzwingen durch direkten Abruf
             allFlightsUnfiltered = await getFlights();
             renderFlights(allFlightsUnfiltered);
        }
    }
    
    if (failedQueue.length > 0) {
        // Silent Log, um den User nicht zu nerven, oder kleine Info
        console.warn(`${failedQueue.length} Flüge konnten noch nicht gesendet werden.`);
    }
}

// =================================================================
// DEMO MODE LOGIC (FIXED)
// =================================================================

function getDemoData() {
    // KORRIGIERTE STRUKTUR: Keys entsprechen jetzt exakt dem, was ui.js erwartet!
    return [
      {
        id: 9001,
        date: "2024-03-10",
        departure: "FRA",
        arrival: "JFK",
        depName: "Frankfurt am Main",
        arrName: "New York JFK",
        depLat: 50.0333,
        depLon: 8.5706,
        arrLat: 40.6397,
        arrLon: -73.7789,
        distance: 6200,
        time: "8h 30m",
        flightNumber: "LH400",
        airline: "Lufthansa",
        aircraftType: "Boeing 747-8",
        registration: "D-ABYA",
        class: "First",
        co2_kg: 1200,
        notes: "Start of the world trip! Fantastic service on the upper deck. *** Start der Weltreise! Fantastischer Service im Oberdeck.",
        photo_url: []
      },
      {
        id: 9002,
        date: "2024-03-15",
        departure: "JFK",
        arrival: "SFO",
        depName: "New York JFK",
        arrName: "San Francisco",
        depLat: 40.6397,
        depLon: -73.7789,
        arrLat: 37.6188,
        arrLon: -122.375,
        distance: 4150,
        time: "6h 25m",
        flightNumber: "UA1543",
        airline: "United Airlines",
        aircraftType: "Boeing 737 MAX 9",
        registration: "N37532",
        class: "Economy",
        co2_kg: 350,
        notes: "Transcontinental flight. Great view over the Rockies. *** Transkontinentalflug. Tolle Aussicht über die Rockies.",
        photo_url: []
      },
      {
        id: 9003,
        date: "2024-03-20",
        departure: "SFO",
        arrival: "SIN",
        depName: "San Francisco",
        arrName: "Singapore Changi",
        depLat: 37.6188,
        depLon: -122.375,
        arrLat: 1.3644,
        arrLon: 103.991,
        distance: 13600,
        time: "17h 10m",
        flightNumber: "SQ31",
        airline: "Singapore Airlines",
        aircraftType: "Airbus A350-900ULR",
        registration: "9V-SGB",
        class: "Business",
        co2_kg: 980,
        notes: "One of the longest flights in the world! *** Einer der längsten Flüge der Welt!",
        photo_url: []
      },
      {
        id: 9004,
        date: "2024-03-25",
        departure: "SIN",
        arrival: "DXB",
        depName: "Singapore Changi",
        arrName: "Dubai Intl",
        depLat: 1.3644,
        depLon: 103.991,
        arrLat: 25.2532,
        arrLon: 55.3657,
        distance: 5850,
        time: "7h 20m",
        flightNumber: "EK405",
        airline: "Emirates",
        aircraftType: "Airbus A380-800",
        registration: "A6-EEO",
        class: "Economy",
        co2_kg: 420,
        notes: "Stopover in the desert. *** Zwischenstopp in der Wüste.",
        photo_url: []
      },
      {
        id: 9005,
        date: "2024-03-28",
        departure: "DXB",
        arrival: "FRA",
        depName: "Dubai Intl",
        arrName: "Frankfurt am Main",
        depLat: 25.2532,
        depLon: 55.3657,
        arrLat: 50.0333,
        arrLon: 8.5706,
        distance: 4850,
        time: "6h 45m",
        flightNumber: "LH631",
        airline: "Lufthansa",
        aircraftType: "Airbus A330-300",
        registration: "D-AIKO",
        class: "Premium Eco",
        co2_kg: 400,
        notes: "Back home. Journey complete. *** Zurück zu Hause. Reise beendet.",
        photo_url: []
      }
    ];
}

async function startDemoMode() {
    console.log("Starte Demo-Modus...");
    isDemoMode = true;
    
    // Globale Variablen setzen
    currentUserSubscription = "free"; 
    window.currentUserSubscriptionSource = "demo";

    // 1. UI umschalten
    document.getElementById("auth-container").classList.add("hidden");
    document.getElementById("app-container").classList.remove("hidden");
    
    // User-Display anpassen
    const userDisplay = document.getElementById("user-display");
    if (userDisplay) {
        userDisplay.textContent = getTranslation("demo.userBadge") || "Demo Pilot 🚀";
    }

    // 2. Demo-Daten laden (Interne Funktion statt externe Datei)
    let demoData = getDemoData();
    
    // Daten vorbereiten (Nummerierung #1, #2, etc.)
    demoData = resequenceAndAssignNumbers(demoData);
    
    // WICHTIG: Global speichern für Globus & Map
    window.flights = demoData; 

    // 🔥 NEU: Cache für Länder-Highlights manuell füllen
    // Damit der Globus weiß, welche Länder er einfärben muss
    window.airportData = window.airportData || {};
    Object.assign(window.airportData, {
        "FRA": { name: "Frankfurt am Main", lat: 50.0333, lon: 8.5706, country_code: "DE" },
        "JFK": { name: "New York JFK", lat: 40.6397, lon: -73.7789, country_code: "US" },
        "SFO": { name: "San Francisco", lat: 37.6188, lon: -122.375, country_code: "US" },
        "SIN": { name: "Singapore Changi", lat: 1.3644, lon: 103.991, country_code: "SG" },
        "DXB": { name: "Dubai Intl", lat: 25.2532, lon: 55.3657, country_code: "AE" }
    });
    // ---------------------------------------------------

    // 3. Tab wechseln (Direkt zur Liste)
    showTab('fluege'); 

    // --- KARTE INITIALISIEREN (Wichtig, sonst Crash!) ---
    if (!map) {
        try {
            map = L.map("flight-map-container").setView([20, 0], 2);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            }).addTo(map);
            routeLayer = L.layerGroup().addTo(map);
            console.log("Karte für Demo-Modus initialisiert.");
        } catch (e) {
            console.error("Fehler beim Initialisieren der Karte:", e);
        }
    }
    
    // 4. Listen rendern
    if (typeof renderFlights === 'function') {
        await renderFlights(demoData); 
        
        // Karte auf alle Routen zoomen
        setTimeout(() => {
             if(typeof drawAllRoutesOnMap === 'function') {
                 drawAllRoutesOnMap(demoData);
                 // Button Text anpassen
                 const btn = document.getElementById("toggle-map-view-btn");
                 if(btn) btn.textContent = getTranslation("flights.showSingleRoute");
                 isAllRoutesViewActive = true;
             }
        }, 500);
    }
    
    // UI sperren (kein Löschen/Speichern)
    lockUiForDemo();

    showMessage(
        getTranslation("demo.welcomeTitle") || "Demo-Modus", 
        getTranslation("demo.welcomeBody") || "Willkommen! Du siehst nun Beispieldaten.", 
        "success"
    );
}

function lockUiForDemo() {
    // 1. Floating Action Button (Neuer Flug) verstecken
    const fab = document.getElementById('add-flight-fab');
    if (fab) fab.classList.add('hidden');

    // 2. Gefährliche Buttons in der Liste verstecken
    // EINFÜGEN: 'return-flight-btn' in dieses Array aufnehmen!
    const dangerousButtons = [
        'play-chronicle-btn', 
        'toggle-map-view-btn', 
        'print-book-btn', 
        'return-flight-btn' // <--- NEU
    ];
    
    dangerousButtons.forEach(id => {
        const btn = document.getElementById(id);
        // Wir nutzen 'style.display = none', das ist stärker als classList bei manchen UI-Logiken
        if (btn) {
            btn.classList.add('hidden');
            btn.style.display = 'none'; // Zur Sicherheit, falls JS es wieder einblenden will
        }
    });
    
    // 3. Refresh-Button verstecken
    const refreshBtn = document.querySelector('button[data-i18n="flights.refresh"]');
    if (refreshBtn) refreshBtn.classList.add('hidden');

    // 4. Burger-Menü: ALLES verstecken außer Exit
    const burgerMenu = document.getElementById('burger-menu');
    if (burgerMenu) {
        // A) Sektionen verstecken
        const sections = burgerMenu.querySelectorAll('div.border-b, div.border-t, div.md\\:hidden');
        sections.forEach(el => el.classList.add('hidden'));

        // B) Alle Links/Buttons verstecken (Ausnahme: Exit & Theme-Toggle)
        const allInteractives = burgerMenu.querySelectorAll('a, button');
        allInteractives.forEach(el => {
            if (el.id !== 'menu-exit-demo-btn' && el.id !== 'menu-theme-toggle') {
                el.classList.add('hidden');
            }
        });

        // Sicherstellen, dass der Theme-Toggle auch wirklich sichtbar ist
        const themeToggleBtn = document.getElementById('menu-theme-toggle');
        if (themeToggleBtn) {
            themeToggleBtn.classList.remove('hidden');
        }

        // C) Exit Button anzeigen
        const exitBtn = document.getElementById('menu-exit-demo-btn');
        if (exitBtn) {
            exitBtn.classList.remove('hidden');
            // Container sichtbar machen
            if (exitBtn.parentElement) exitBtn.parentElement.classList.remove('hidden');
            exitBtn.textContent = getTranslation("demo.exit") || "🚪 Demo Beenden";
        }
    }

    // 5. Import Label verstecken
    const importLabel = document.querySelector('label[for="import-file-input"]');
    if (importLabel) importLabel.classList.add('hidden');
}

// Globale Funktionen für HTML-Aufrufe
// *** Hauptfunktion (jetzt für Loggen & Aktualisieren) ***
window.logFlight = async function () {
  // --- NEU: DEMO CHECK ---
    if (isDemoMode) {
        showMessage(
          getTranslation("demo.demoModus") || "Demo-Modus",
          getTranslation("demo.noDataSaved") || "Im Demo-Modus können keine Daten gespeichert werden.",
          "info"
        );
        return;
    }
    // -----------------------

  if (currentlyEditingFlightData !== null) {
    await updateFlight();
    return;
  }

  const logButton = document.getElementById("log-button");
  logButton.textContent = getTranslation("form.buttonSaving") || "Saving...";
  logButton.disabled = true;

  // --- OFFLINE-FREUNDLICHER LOGIN CHECK ---
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  // Wir holen uns den User aus der lokalen Session
  const user = session?.user;

  if (!user) {
    showMessage(getTranslation("toast.errorTitle"), getTranslation("toast.notLoggedIn"), "error");
    
    // UI zurücksetzen, damit der Button nicht hängen bleibt
    if (logButton) {
        logButton.textContent = getTranslation("form.buttonLogFlight") || "Log Flight";
        logButton.disabled = false;
    }
    return;
  }
  // ----------------------------------------

  // --- ✅ NEU: FLUG-LIMIT PRÜFEN ---
  // Wir holen kurz die Liste der Flüge, um zu zählen
  const allFlights = await getFlights();

  if (currentUserSubscription === "free" && allFlights.length >= 15) {
    /*
		showMessage(
            getTranslation("messages.limitTitle") || "Limit erreicht", 
            getTranslation("messages.limitBody") || "Bitte upgrade auf Pro für unbegrenzte Flüge.", 
            "error"
        );
		*/

    // ✅ NEUE VARIANTE: Modal öffnen!
    openPremiumModal();

    // Button wieder freigeben
    logButton.textContent =
      getTranslation("logFlightNewFlight") || "Flug loggen";
    logButton.disabled = false;
    return; // Funktion abbrechen
  }
  // --- ENDE NEU ---

  // --- ✅ NEU: FOTO-UPLOAD (Nur für Pro) ---
  let filesToUpload = Array.from(document.getElementById("flightPhoto").files);
  let photoUrls = []; // Standardmäßig leer

  if (currentUserSubscription === "pro") {
    // Nur Pro-Nutzer dürfen diesen Block ausführen

    if (filesToUpload.length > MAX_PHOTOS_PER_FLIGHT) {
      const errorMsg = (
        getTranslation("messages.uploadLimitCount") || "Limit erreicht"
      ).replace(/{count}/g, MAX_PHOTOS_PER_FLIGHT);
      showMessage("Upload-Limit", errorMsg, "info");

      filesToUpload = filesToUpload.slice(0, MAX_PHOTOS_PER_FLIGHT);
    }

    photoUrls = await uploadFlightPhotos(filesToUpload);
  }
  // Free-Nutzer überspringen den Upload, 'photoUrls' bleibt []
  // --- ENDE NEU ---

  const depCodeInput = document
    .getElementById("departure")
    .value.trim()
    .toUpperCase();
  const arrCodeInput = document
    .getElementById("arrival")
    .value.trim()
    .toUpperCase();

  // --- ✅ KORRIGIERTE DATEN-ABFRAGE-LOGIK ---

  // 1. Versuche, Daten aus dem Cache zu holen
  let departureAirport = findAirport(depCodeInput);
  let arrivalAirport = findAirport(arrCodeInput);

  // 2. Prüfe Abflughafen
  if (!departureAirport || !departureAirport.country_code) {
    const results = await window.fetchExternalAirport(depCodeInput);
    if (results && results.length > 0) {
      departureAirport = results[0];
    }
  }

  // 3. Prüfe Zielflughafen
  if (!arrivalAirport || !arrivalAirport.country_code) {
    const results = await window.fetchExternalAirport(arrCodeInput);
    if (results && results.length > 0) {
      arrivalAirport = results[0];
    }
  }

  // --- ENDE KORRIGIERTE LOGIK ---

  if (!departureAirport || !arrivalAirport) {
    showMessage(getTranslation("toast.errorTitle"), getTranslation("toast.airportNotFound"), "error");
    logButton.textContent = getTranslation("flights.logFlightBtn") || "Flug loggen und speichern";
    logButton.disabled = false;
    return;
  }

  // 4. Speichere die Daten
  await cacheAndSaveAirport(departureAirport);
  await cacheAndSaveAirport(arrivalAirport);

  const distance = calculateDistance(
    departureAirport.lat,
    departureAirport.lon,
    arrivalAirport.lat,
    arrivalAirport.lon
  );
  const newFlightId = new Date().getTime();

  // --- NEU: Logo & Name holen ---
  const rawAirlineInput = document.getElementById("airline").value.trim();
  let finalAirlineName = rawAirlineInput;
  let finalAirlineLogo = null;

  if (rawAirlineInput.length >= 2) {
      try {
          // Wir rufen die API direkt auf (wie im Logbuch), um GANZ SICHER das Logo zu bekommen!
          const response = await fetch(`${API_BASE_URL}/.netlify/functions/fetch-airline-details?iata_code=${encodeURIComponent(rawAirlineInput.toUpperCase())}`);
          
          if (response.ok) {
              const result = await response.json();
              if (result && result.data && result.data.length > 0) {
                  const airlineData = result.data[0];
                  finalAirlineName = airlineData.name || finalAirlineName;
                  // Wir sichern alle Logo-Varianten ab (logo_url, brandmark_url, tail_logo_url)
                  finalAirlineLogo = airlineData.logo_url || airlineData.brandmark_url || airlineData.tail_logo_url || null;
              }
          }
      } catch (err) {
          console.warn("Konnte Airline-Details nicht laden:", err);
      }
  }
  // ------------------------------

  const flightClass = document.getElementById("flightClass").value;
  const calculatedCO2 = calculateCO2(distance, flightClass);

  const priceInput = document.getElementById("price").value;

  // 🚀 BUGHUNT-FIX: Fehlendes Planespotters-Bild in letzter Sekunde sichern
  const regValueForPhoto = document.getElementById("registration").value.trim().toUpperCase();
  if (regValueForPhoto && !currentPlanespottersData) {
      currentPlanespottersData = await fetchAircraftPhoto(regValueForPhoto);
  }
  
  const newFlightForSupabase = {
    flight_id: newFlightId,
    user_id: user.id,
    date:
      document.getElementById("flightDate").value ||
      new Date().toISOString().slice(0, 10),
    departure: departureAirport.code,
    arrival: arrivalAirport.code,
    distance: Math.round(distance),
    time: estimateFlightTime(distance),
    class: document.getElementById("flightClass").value,
    co2_kg: calculatedCO2,
    flightNumber: document.getElementById("flightNumber").value.trim(),
    // ✅ NEU HINZUFÜGEN:
    trip_id: document.getElementById("tripSelect").value || null,
    airline: finalAirlineName,       // Name aus API oder Eingabefeld
    airline_logo: finalAirlineLogo,  // Das neue Logo-Feld
    aircraftType: document.getElementById("aircraftType").value.trim(),
    notes: document.getElementById("notes").value.trim(),
    depLat: departureAirport.lat,
    depLon: departureAirport.lon,
    arrLat: arrivalAirport.lat,
    arrLon: arrivalAirport.lon,
    depName: departureAirport.name,
    arrName: arrivalAirport.name,
    photo_url: photoUrls, // Hier wird entweder das Array oder [] übergeben
    price:
      priceInput !== "" && !isNaN(parseFloat(priceInput))
        ? parseFloat(priceInput)
        : null,
    currency:
      document.getElementById("currency").value.trim().toUpperCase() || null,
    registration:
      document.getElementById("registration").value.trim().toUpperCase() ||
      null,
    // 📸 NEU: Planespotters Daten speichern
    planespotters_url: currentPlanespottersData ? currentPlanespottersData.url : null,
    planespotters_photographer: currentPlanespottersData ? currentPlanespottersData.photographer : null,
  };

  // --- OFFLINE CHECK & SAVE ---
  if (!navigator.onLine) {
      // 1. Warnung bzgl. Fotos (da Supabase Storage offline nicht geht)
      if (filesToUpload && filesToUpload.length > 0) {
          alert(
              getTranslation("toast.offlinePhotoWarning") || 
              "Hinweis: Fotos können im Offline-Modus leider nicht gespeichert werden. Bitte fügen Sie diese später hinzu."
          );
          newFlightForSupabase.photo_url = []; // Fotos leeren
      }

      // 2. Lokal speichern
      saveFlightOffline(newFlightForSupabase);
      
      // 3. UI zurücksetzen (wie beim Erfolg)
      resetForm();
      logButton.textContent = getTranslation("form.buttonLogFlight") || "Log Flight";
      logButton.disabled = false;
      return; // 🛑 HIER ABBRECHEN, NICHT AN SUPABASE SENDEN
  }
  // -----------------------------

  // Normaler Online-Insert (Dein bestehender Code)
  const { error } = await supabaseClient
    .from("flights")
    .insert(newFlightForSupabase);

  if (error) {
    showMessage(getTranslation("toast.saveErrorTitle"), getTranslation("toast.saveErrorBody"), "error");
    console.error("Supabase Insert Error:", error);
  } else {
    showMessage(getTranslation("toast.successTitle"), getTranslation("toast.flightSaved"), "success");
    resetForm();
	
	// ID in Supabase Metadaten speichern
	// Wir machen das "im Hintergrund" (kein await nötig, damit die UI nicht blockiert)
	supabaseClient.auth.updateUser({
		data: { last_flight_id: newFlightId }
	}).then(() => {
		globalLastFlightId = newFlightId; // Auch lokal sofort updaten
		console.log("Last Flight ID gespeichert:", newFlightId);
	});
	
    renderFlights(null, newFlightId);
    initLiveWidget(); // 🚀 NEU: Widget sofort updaten!

  // --- NEU: Review Trigger ---
    // Wir holen kurz die aktuelle Anzahl der Flüge um zu prüfen
    // (Da wir gerade einen hinzugefügt haben, ist die lokale Liste evtl. noch alt, 
    // aber renderFlights lädt neu oder wir zählen manuell).
    // Am sichersten: Wir warten kurz auf das Update oder nutzen getFlights.
    getFlights().then(flights => {
        checkAndAskForReview(flights.length);
    });
    // --------------------------

  }
  logButton.textContent = getTranslation("form.buttonLogFlight") || "Log Flight";
  logButton.disabled = true;
};

/**
 * KORRIGIERT: Speichert Änderungen, handhabt Hinzufügen UND Löschen von Fotos.
 */
async function updateFlight() {
  // --- NEU: DEMO CHECK ---
    if (isDemoMode) {"demo.noChangesSaved"
        showMessage(
          getTranslation("demo.demoModus") || "Demo-Modus",
          getTranslation() || "Im Demo-Modus können keine Änderungen gespeichert werden.",
          "info"
        );
        return;
    }
    // -----------------------

  // 1. Auth-Check
  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    showMessage(getTranslation("toast.errorTitle"), getTranslation("toast.sessionExpired"), "error");
    logout();
    return;
  }

  const logButton = document.getElementById("log-button");
  logButton.textContent = getTranslation("form.buttonUpdating") || "Updating...";
  logButton.disabled = true;

  // 2. Finde die "überlebenden" Fotos (bereits existierende)
  const survivingUrls = Array.from(
    document.querySelectorAll("#existing-photos-preview [data-url]")
  ).map((el) => el.dataset.url);

  // --- ✅ NEU: FOTO-UPDATE LOGIK (Nur Pro darf NEUE hochladen) ---
  let filesToUpload = Array.from(document.getElementById("flightPhoto").files);
  let newUploadedUrls = []; // Standardmäßig leer

  if (currentUserSubscription === "pro") {
    // Nur Pro-User durchlaufen die Logik für neue Uploads

    const currentPhotoCount = survivingUrls.length;
    const remainingSlots = MAX_PHOTOS_PER_FLIGHT - currentPhotoCount;

    if (filesToUpload.length > 0 && remainingSlots <= 0) {
      const errorMsg = (
        getTranslation("messages.uploadLimitCount") || "Limit erreicht"
      ).replace(/{count}/g, MAX_PHOTOS_PER_FLIGHT);
      showMessage("Upload-Limit", errorMsg, "error");
      filesToUpload = [];
    } else if (filesToUpload.length > remainingSlots) {
      const errorMsg = (
        getTranslation("messages.uploadLimitCount") || "Limit erreicht"
      ).replace(/{count}/g, MAX_PHOTOS_PER_FLIGHT);
      showMessage("Upload-Limit", errorMsg, "info");
      filesToUpload = filesToUpload.slice(0, remainingSlots);
    }

    // Upload durchführen
    newUploadedUrls = await uploadFlightPhotos(filesToUpload);
  }
  // Free-User: 'newUploadedUrls' bleibt leer, auch wenn Dateien ausgewählt wurden.

  // 4. Kombiniere die Listen
  const finalPhotoUrls = survivingUrls.concat(newUploadedUrls);
  // --- ENDE NEU ---

  // 5. Finde die Fotos, die WIRKLICH gelöscht werden müssen (vom Supabase Storage)
  const originalUrls = currentlyEditingFlightData.photo_url || [];
  const urlsToDelete = originalUrls.filter(
    (url) => !survivingUrls.includes(url)
  );

  // 6. Führe die Löschung auf Supabase aus
  if (urlsToDelete.length > 0) {
    console.log("Lösche folgende Fotos:", urlsToDelete);
    const filePathsToDelete = urlsToDelete.map((url) =>
      url.substring(url.lastIndexOf("/") + 1)
    );

    const { error: deleteError } = await supabaseClient.storage
      .from("flight-photos")
      .remove(filePathsToDelete);

    if (deleteError) {
      console.error("Fehler beim Löschen alter Fotos:", deleteError);
      showMessage(
        getTranslation("toast.saveErrorTitle") || "Save error",
        getTranslation("flights.photoDeleteError") || "Old photos could not get deleted, but new ones added.",
        "error"
      );
    }
  }

  // --- ENDE DER FOTO-LOGIK ---

  const depCodeInput = document
    .getElementById("departure")
    .value.trim()
    .toUpperCase();
  const arrCodeInput = document
    .getElementById("arrival")
    .value.trim()
    .toUpperCase();

  // --- ✅ KORRIGIERTE DATEN-ABFRAGE-LOGIK ---

  // 1. Versuche, Daten aus dem Cache zu holen
  let departureAirport = findAirport(depCodeInput);
  let arrivalAirport = findAirport(arrCodeInput);

  // 2. Prüfe Abflughafen
  if (!departureAirport || !departureAirport.country_code) {
    const results = await window.fetchExternalAirport(depCodeInput);
    if (results && results.length > 0) {
      departureAirport = results[0];
    }
  }

  // 3. Prüfe Zielflughafen
  if (!arrivalAirport || !arrivalAirport.country_code) {
    const results = await window.fetchExternalAirport(arrCodeInput);
    if (results && results.length > 0) {
      arrivalAirport = results[0];
    }
  }

  // --- ENDE KORRIGIERTE LOGIK ---

  if (!departureAirport || !arrivalAirport) {
    showMessage(getTranslation("toast.errorTitle"), getTranslation("toast.airportNotFound"), "error");
    logButton.textContent = getTranslation("flights.saveChangesBtn") || "Änderungen speichern";
    logButton.disabled = false;
    return;
  }

  // 4. Speichere die Daten
  await cacheAndSaveAirport(departureAirport);
  await cacheAndSaveAirport(arrivalAirport);

  const distance = calculateDistance(
    departureAirport.lat,
    departureAirport.lon,
    arrivalAirport.lat,
    arrivalAirport.lon
  );

  const flightClass = document.getElementById("flightClass").value;
  const calculatedCO2 = calculateCO2(distance, flightClass);

  const priceInput = document.getElementById("price").value;

  // --- NEU: Logo & Name auch beim Update holen ---
  const rawAirlineInput = document.getElementById("airline").value.trim();
  let finalAirlineName = rawAirlineInput;
  let finalAirlineLogo = currentlyEditingFlightData.airline_logo || null; 

  if (rawAirlineInput.length >= 2) {
      try {
          // Auch beim Update den direkten API-Weg gehen!
          const response = await fetch(`${API_BASE_URL}/.netlify/functions/fetch-airline-details?iata_code=${encodeURIComponent(rawAirlineInput.toUpperCase())}`);
          
          if (response.ok) {
              const result = await response.json();
              if (result && result.data && result.data.length > 0) {
                  const airlineData = result.data[0];
                  finalAirlineName = airlineData.name || finalAirlineName;
                  // Falls die API ein Logo hat, nimm es. Ansonsten behalte das alte Logo.
                  finalAirlineLogo = airlineData.logo_url || airlineData.brandmark_url || airlineData.tail_logo_url || finalAirlineLogo;
              }
          }
      } catch (err) {
          console.warn("Update: Konnte Airline nicht laden", err);
      }
  }
  // -----------------------------------------------

  // 🚀 BUGHUNT-FIX: Fehlendes Planespotters-Bild in letzter Sekunde sichern
  const regValueForPhoto = document.getElementById("registration").value.trim().toUpperCase();
  if (regValueForPhoto && !currentPlanespottersData) {
      currentPlanespottersData = await fetchAircraftPhoto(regValueForPhoto);
  }

  const updatedFlightForSupabase = {
    date: document.getElementById("flightDate").value,
    departure: departureAirport.code,
    arrival: arrivalAirport.code,
    distance: Math.round(distance),
    time: estimateFlightTime(distance),
    class: document.getElementById("flightClass").value,
    co2_kg: calculatedCO2,
    flightNumber: document.getElementById("flightNumber").value.trim(),
    // ✅ NEU HINZUFÜGEN:
    trip_id: document.getElementById("tripSelect").value || null,
    airline: finalAirlineName,      // Name aus API oder Input
    airline_logo: finalAirlineLogo, // Logo aus API oder Datenbank
    aircraftType: document.getElementById("aircraftType").value.trim(),
    notes: document.getElementById("notes").value.trim(),
    depLat: departureAirport.lat,
    depLon: departureAirport.lon,
    arrLat: arrivalAirport.lat,
    arrLon: arrivalAirport.lon,
    depName: departureAirport.name,
    arrName: arrivalAirport.name,
    photo_url: finalPhotoUrls,
    price:
      priceInput !== "" && !isNaN(parseFloat(priceInput))
        ? parseFloat(priceInput)
        : null,
    currency:
      document.getElementById("currency").value.trim().toUpperCase() || null,
    registration:
      document.getElementById("registration").value.trim().toUpperCase() ||
      null,
    // 📸 NEU: Planespotters updaten (oder das alte behalten, falls nicht neu gesucht wurde)
    planespotters_url: currentPlanespottersData ? currentPlanespottersData.url : (currentlyEditingFlightData.planespotters_url || null),
    planespotters_photographer: currentPlanespottersData ? currentPlanespottersData.photographer : (currentlyEditingFlightData.planespotters_photographer || null),
  };

  const { error } = await supabaseClient
    .from("flights")
    .update(updatedFlightForSupabase)
    .eq("flight_id", currentlyEditingFlightData.id);

  if (error) {
    showMessage(getTranslation("toast.updateErrorTitle"), getTranslation("toast.updateErrorBody"), "error");
    console.error("Supabase Update Error:", error);
  } else {
    showMessage(getTranslation("toast.successTitle"), getTranslation("toast.flightUpdated"), "success");
	
	// ID in Supabase Metadaten speichern
	const currentId = currentlyEditingFlightData.id;
	supabaseClient.auth.updateUser({
		data: { last_flight_id: currentId }
	}).then(() => {
		globalLastFlightId = currentId; // Auch lokal sofort updaten
		console.log("Last Flight ID aktualisiert:", currentId);
	});
	
  }
  const flightIdToFocus = currentlyEditingFlightData.id;
  resetForm();
  
  // Nach dem Bearbeiten automatisch zurück zur Liste springen
    showTab("fluege");
  
  renderFlights(null, flightIdToFocus);
  initLiveWidget(); // 🚀 NEU: Widget sofort updaten!
}

// *** Rendern und Löschen ***
window.deleteFlight = async function (id) {
  // --- NEU: DEMO CHECK ---
    if (isDemoMode) {
        showMessage(
          getTranslation("demo.demoModus") || "Demo-Modus",
          getTranslation("demo.noDataDeleted") || "Im Demo-Modus können keine Daten gelöscht werden.",
          "info"
        );
        return;
    }
    // -----------------------

  // 1. Sicherheitsabfrage (mit Übersetzung)
  if (!confirm(getTranslation("messages.confirmDelete") || "Sind Sie sicher, dass Sie diesen Flug endgültig löschen möchten?")) {
    return;
  }

  // 2. Löschen in Supabase
  const { error } = await supabaseClient
    .from("flights")
    .delete()
    .eq("flight_id", id);

  if (error) {
    showMessage(
      getTranslation("toast.errorTitle"), 
      getTranslation("toast.deleteError"), 
      "error"
    );
    console.error("Supabase Delete Error:", error);
  } else {
    showMessage(
      getTranslation("toast.successTitle"), 
      getTranslation("toast.flightDeleted"), 
      "success"
    );

    // --- ✅ BUGFIX: Lokalen Cache aktualisieren ---
    
    if (currentlyFilteredFlights) {
        // FALL A: Ein Filter ist aktiv (oder wurde mal benutzt)
        // Wir entfernen den Flug manuell aus der lokalen Liste
        currentlyFilteredFlights = currentlyFilteredFlights.filter(f => f.id !== id);
        
        // Rendern mit der aktualisierten Liste (ohne Neuladen vom Server)
        // Wir behalten 'currentPage' bei, damit der User nicht auf Seite 1 springt
        renderFlights(currentlyFilteredFlights, null, currentPage);
    } else {
        // FALL B: Kein Filter aktiv (Alles wird angezeigt)
        // Wir rufen renderFlights() ohne Argumente auf -> Das erzwingt ein getFlights() vom Server
        renderFlights(null, null, currentPage);
    }
    initLiveWidget(); // 🚀 NEU: Falls der heutige Flug gelöscht wurde, Widget verstecken!
  }
};

/**
 * Setzt das Formular zurück und beendet den Bearbeitungsmodus.
 */
window.resetForm = function () {
  // Formularfelder leeren
  document.getElementById("departure").value = "";
  document.getElementById("arrival").value = "";
  document.getElementById("flightDate").value = "";
  document.getElementById("flightNumber").value = "";
  document.getElementById("airline").value = "";
  document.getElementById("aircraftType").value = "";
  document.getElementById("notes").value = "";
  document.getElementById("price").value = "";
  document.getElementById("currency").value = "";
  document.getElementById("registration").value = "";

  // Foto-Feld und Vorschau zurücksetzen
  document.getElementById("flightPhoto").value = null;

  // ✅ KORRIGIERT: Container bleibt sichtbar
  document.getElementById("photo-preview-container").classList.remove("hidden");

  // ✅ KORRIGIERT: Nur der Text wird zurückgesetzt
  document.getElementById("photo-preview-text").textContent = getTranslation(
    "form.noFileSelected"
  );

  // ✅ NEU: Auch die "existing"-Vorschau löschen
  document.getElementById("existing-photos-preview").innerHTML = "";

  // Planespotters Vorschau zurücksetzen
  if (typeof clearPlanespottersPreview === 'function') clearPlanespottersPreview();

  // Zustand zurücksetzen
  currentlyEditingFlightData = null;

  // UI zurücksetzen
  const logButton = document.getElementById("log-button");
  logButton.textContent = getTranslation("flights.logFlightBtn") || "Flug loggen und speichern";
  document.getElementById("cancel-edit-button").classList.add("hidden");

  updateFlightDetails(); // Setzt Distanz etc. zurück und deaktiviert den Button
};

/**
 * Startet den Bearbeitungsmodus für einen bestimmten Flug.
 * @param {number} id - Die ID des zu bearbeitenden Flugs.
 */
window.editFlight = async function (id) {
  showTab("neue-fluege"); // Wechsle zum Formular-Tab
  // Wenn die Gesamtansicht aktiv ist, schalte sie zuerst aus
  if (isAllRoutesViewActive) {
    toggleAllRoutesView();
  }
  const flights = await getFlights();
  const flightToEdit = flights.find((flight) => flight.id === id);

  if (!flightToEdit) {
    showMessage(
      getTranslation("toast.errorTitle") || "Fehler",
      getTranslation("flights.notFound") || "Der zu bearbeitende Flug wurde nicht gefunden.",
      "error"
    );
    return;
  }

  // --- NEUE FOTO-VORSCHAU-LOGIK ---
  const existingPreviewContainer = document.getElementById(
    "existing-photos-preview"
  );
  existingPreviewContainer.innerHTML = ""; // Vorherige Previews löschen

  if (flightToEdit.photo_url && flightToEdit.photo_url.length > 0) {
    // Erstelle eine "Foto-Karte" für jedes existierende Foto
    flightToEdit.photo_url.forEach((url) => {
      const imgCard = document.createElement("div");
      imgCard.className = "relative inline-block h-16 w-16"; // Feste Größe für die Vorschau

      // Wir speichern die URL in einem data-Attribut,
      // damit 'updateFlight' weiß, welche Fotos überlebt haben.
      imgCard.dataset.url = url;

      imgCard.innerHTML = `
              <img src="${url}" class="h-16 w-16 rounded-md object-cover shadow-sm">
              
              <button 
                type="button" 
                onclick="this.parentElement.remove()" 
                class="absolute top-0 right-0 -mt-2 -mr-2 bg-red-600 text-white rounded-full w-5 h-5 
                       flex items-center justify-center text-sm font-bold 
                       hover:bg-red-700 transition-transform hover:scale-110"
                title="Foto entfernen"
              >
                &times;
              </button>
            `;
      existingPreviewContainer.appendChild(imgCard);
    });
  }
  // Der "photo-preview-text" für NEUE Dateien wird von resetForm/change gehandhabt
  // --- ENDE NEUE LOGIK ---

  // Zeichne die Route des aktuell ausgewählten Flugs auf der Karte
  window.drawRouteOnMap(
    flightToEdit.depLat,
    flightToEdit.depLon,
    flightToEdit.arrLat,
    flightToEdit.arrLon,
    flightToEdit.departure,
    flightToEdit.arrival,
    flightToEdit.depName,
    flightToEdit.arrName,
    flightToEdit
  );

  // Formular mit den Flugdaten füllen
  document.getElementById("departure").value = flightToEdit.departure;
  document.getElementById("arrival").value = flightToEdit.arrival;
  document.getElementById("flightDate").value = flightToEdit.date;
  document.getElementById("flightClass").value = flightToEdit.class;
  document.getElementById("flightNumber").value = flightToEdit.flightNumber;
  document.getElementById("airline").value = flightToEdit.airline || "";
  document.getElementById("aircraftType").value = flightToEdit.aircraftType;
  document.getElementById("notes").value = flightToEdit.notes;
  document.getElementById("price").value =
    typeof flightToEdit.price === "number" ? flightToEdit.price : "";
  document.getElementById("currency").value = flightToEdit.currency || "";
  document.getElementById("registration").value =
    flightToEdit.registration || "";
  // 📸 NEU: Planespotters Vorschau beim Bearbeiten laden
  if (flightToEdit.planespotters_url) {
      currentPlanespottersData = {
          url: flightToEdit.planespotters_url,
          photographer: flightToEdit.planespotters_photographer,
          link: "#" // Fallback, da wir den Link nicht extra speichern
      };
      document.getElementById('planespotters-img').src = flightToEdit.planespotters_url;
      document.getElementById('planespotters-credit').textContent = flightToEdit.planespotters_photographer || "Planespotters";
      document.getElementById('planespotters-preview').classList.remove('hidden');
  } else {
      if (typeof clearPlanespottersPreview === 'function') clearPlanespottersPreview();
  }

  // Bearbeitungszustand setzen
  currentlyEditingFlightData = flightToEdit;

  // UI für den Bearbeitungsmodus anpassen
  const logButton = document.getElementById("log-button");
  logButton.textContent = getTranslation("flights.saveChangesBtn") || "Änderungen speichern";
  document.getElementById("cancel-edit-button").classList.remove("hidden");

  updateFlightDetails(); // Berechnet Distanz/Zeit für die geladenen Flughäfen

  // Zum Formular scrollen für eine bessere User Experience
  document
    .getElementById("log-button")
    .scrollIntoView({ behavior: "smooth", block: "center" });

  // Falls der Flug eine trip_id hat, laden wir die Trips neu und setzen den Wert
  if (flightToEdit.trip_id) {
      loadTripsIntoDropdown(flightToEdit.trip_id);
  } else {
      loadTripsIntoDropdown(null);
  }
};

/**
 * Wendet Filter (Ort, Datum, Reise) an.
 */
window.applyFilters = async function () {
  currentPage = 1;
  
  // Wir nutzen die globale Variable 'allFlightsUnfiltered' (falls vorhanden) 
  // oder laden neu, falls nötig.
  // Da deine App Struktur 'getFlights' nutzt, bleiben wir dabei:
  const allFlights = await getFlights();

  const searchInput = document.getElementById("search-input").value.toLowerCase();
  
  // ✅ NEU: Trip Filter Wert holen
  const tripFilterEl = document.getElementById("filter-trip");
  const tripFilterId = tripFilterEl ? tripFilterEl.value : "";

  // Alte Filter-Felder (falls du die Details-Leiste noch nutzt):
  const depFilter = document.getElementById("filter-departure")?.value.trim().toUpperCase() || "";
  const arrFilter = document.getElementById("filter-arrival")?.value.trim().toUpperCase() || "";
  const dateFrom = document.getElementById("filter-date-from")?.value || "";
  const dateTo = document.getElementById("filter-date-to")?.value || "";

  let filtered = allFlights.filter((flight) => {
    
    // 1. Text-Suche (Orte, Airline, Datum... UND JETZT AUCH REISENAME)
    const matchesSearch =
      !searchInput ||
      (flight.departure && flight.departure.toLowerCase().includes(searchInput)) ||
      (flight.arrival && flight.arrival.toLowerCase().includes(searchInput)) ||
      (flight.depName && flight.depName.toLowerCase().includes(searchInput)) ||
      (flight.arrName && flight.arrName.toLowerCase().includes(searchInput)) ||
      (flight.airline && flight.airline.toLowerCase().includes(searchInput)) ||
      (flight.date && flight.date.includes(searchInput)) ||
      (flight.aircraftType && flight.aircraftType.toLowerCase().includes(searchInput)) ||
      (flight.registration && flight.registration.toLowerCase().includes(searchInput)) ||
      (flight.notes && flight.notes.toLowerCase().includes(searchInput)) ||
      // ✅ HIER: Auch nach Reisenamen suchen
      (flight.trips && flight.trips.name && flight.trips.name.toLowerCase().includes(searchInput));

    // 2. ✅ NEU: Trip Dropdown Filter
    let matchesTripFilter = true;
    if (tripFilterId !== "") {
        // Vergleich String vs Number sicherstellen
        matchesTripFilter = flight.trip_id == tripFilterId;
    }

    // 3. Bestehende Detail-Filter (Abwärtskompatibilität)
    const matchesDep = !depFilter || flight.departure.toUpperCase().includes(depFilter);
    const matchesArr = !arrFilter || flight.arrival.toUpperCase().includes(arrFilter);
    const matchesDateFrom = !dateFrom || flight.date >= dateFrom;
    const matchesDateTo = !dateTo || flight.date <= dateTo;

    return matchesSearch && matchesTripFilter && matchesDep && matchesArr && matchesDateFrom && matchesDateTo;
  });

  // Globale Variable aktualisieren
  currentlyFilteredFlights = filtered;
  
  // Rendern (Seite 1)
  renderFlights(filtered, null, 1);
};

/**
 * Setzt alle Filterfelder zurück und zeigt wieder die vollständige Flugliste an.
 */
window.resetFilters = function () {
  currentPage = 1; // Zurück zu Seite 1
  // Setze die Werte der Input-Felder zurück
  document.getElementById("filter-departure").value = "";
  document.getElementById("filter-arrival").value = "";
  document.getElementById("filter-date-from").value = "";
  document.getElementById("filter-date-to").value = "";
  // Auch das Reise-Dropdown zurücksetzen
  const tripFilter = document.getElementById("filter-trip");
  if (tripFilter) tripFilter.value = "";

  // Rufe renderFlights ohne Argument auf, um alle Flüge anzuzeigen
  currentlyFilteredFlights = null; // ✅ NEU: Gespeicherten Filter löschen
  renderFlights(null, null, 1); // ✅ NEU: Aufruf anpassen
};

/**
 * Setzt den Sortierschlüssel und die Richtung und rendert die Liste neu.
 * @param {string} sortKey - Die Eigenschaft, nach der sortiert werden soll (z.B. 'date').
 */
window.setSortOrder = function (sortKey) {
  currentPage = 1; // Zurück zu Seite 1
  if (currentSort.key === sortKey) {
    // Wenn derselbe Button geklickt wird, kehre die Richtung um
    currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
  } else {
    // Bei einem neuen Button, setze den Schlüssel und starte mit aufsteigender Sortierung
    currentSort.key = sortKey;
    currentSort.direction = "asc";
  }
  // Rendere die Flugliste mit der neuen Sortierung neu
  applyFilters();
};

// app.js - exportData (MIT TRIPS SUPPORT)

window.exportData = async function (format) {
  // 1. Flüge laden (mit Trip Namen!)
  // Wir nutzen hier direkt Supabase, um sicherzugehen, dass wir alles haben
  const { data: allFlights } = await supabaseClient
    .from("flights")
    .select("*, trips(name, id)") // Trip Name und ID holen
    .order("date", { ascending: false });

  // 2. Trips separat laden (für JSON Export wichtig)
  const { data: allTrips } = await supabaseClient
    .from("trips")
    .select("*");

  const stats = calculateStatistics(allFlights);
  let filename = `flugbuch_export_${new Date().toISOString().slice(0, 10)}`;
  let data, mimeType;

  if (!allFlights || allFlights.length === 0) {
    showMessage(getTranslation("export.errorTitle") || "Fehler", getTranslation("export.noData") || "Keine Daten", "error");
    return;
  }

  // --- JSON EXPORT (Trips Array hinzufügen) ---
  if (format === "json") {
    const exportObj = {
      metadata: {
        export_date: new Date().toISOString(),
        totalFlights: stats.totalCount,
        totalDistanceKm: stats.totalDistance,
      },
      trips: allTrips, // ✅ NEU: Alle Reisen separat speichern
      flights: allFlights,
    };
    data = JSON.stringify(exportObj, null, 2);
    mimeType = "application/json";
    filename += ".json";
  } 
  
  // --- CSV EXPORT (Trip Name als Spalte) ---
  else if (format === "csv") {
    const separator = ";";
    
    const flightKeys = [
      "flightLogNumber", "date", "departure", "arrival",
      "depName", "arrName", "depLat", "depLon", "arrLat", "arrLon",
      "distance", "time", "class", "flightNumber", 
      "airline", "airline_logo", "aircraftType", "registration",
      "price", "currency", "notes", "flight_id", "photo_url",
      "trip_name" // ✅ NEU: Name der Reise
    ];

    const headers = flightKeys.join(separator);

    const csvRows = allFlights.map((flight) => {
      return flightKeys.map((key) => {
          let value = "";

          // Spezialfall: Trip Name aus dem verknüpften Objekt holen
          if (key === "trip_name") {
              value = flight.trips ? flight.trips.name : "";
          } 
          // Spezialfall: Basis-Daten
          else {
              value = flight[key];
          }

          // Fotos & Arrays
          if (key === "photo_url" && Array.isArray(value)) {
             value = JSON.stringify(value); 
          }

          if (value === undefined || value === null) value = "";
          else value = String(value);

          value = value.replace(/(\r\n|\n|\r)/gm, " ");
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(separator);
    }).join("\n");

    data = "\uFEFF" + headers + "\n" + csvRows; 
    mimeType = "text/csv;charset=utf-8;";
    filename += ".csv";
  } else {
    return;
  }

  // --- DOWNLOAD / SHARE LOGIK ---
  
  // Prüfen, ob wir als native App (Android/iOS) laufen
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

  if (isNative) {
      // 📱 NATIVE APP LOGIK (Android / iOS)
      try {
          const { Filesystem, Share } = Capacitor.Plugins;
          
          if (!Filesystem || !Share) throw new Error(getTranslation("export.errorPluginsMissing") || "Capacitor Plugins fehlen.");

          // Datei ins lokale Cache-Verzeichnis der App schreiben
          const result = await Filesystem.writeFile({
              path: filename,
              data: data, // Der reine String (CSV oder JSON)
              directory: 'CACHE',
              encoding: 'utf8'
          });

          // Das native "Teilen"-Menü öffnen (Speichern in Dateien, Google Drive, Mail etc.)
          await Share.share({
              title: getTranslation("export.shareTitle") || 'Flugbuch Export',
              text: getTranslation("export.shareText") || 'Hier ist mein AvioSphere Flugbuch-Export.',
              url: result.uri,
              dialogTitle: getTranslation("export.dialogTitle") || 'Export speichern unter...'
          });

          showMessage(
              getTranslation("export.successTitle") || "Export bereit", 
              getTranslation("export.successBodyMobile") || "Die Datei wurde zum Teilen bereitgestellt.", 
              "success"
          );

      } catch (e) {
          console.error("Fehler beim nativen Export:", e);
          showMessage(
            getTranslation("toast.errorTitle") || "Fehler", 
            (getTranslation("export.nativeErrorBody") || "Export auf dem Gerät fehlgeschlagen: {error}").replace("{error}", e.message), 
            "error"
        );
      }

  } else {
      // 💻 WEB LOGIK (PC / Browser Fallback - genau wie vorher)
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showMessage(
          getTranslation("export.successTitle") || "Export bereit", 
          (getTranslation("export.successBody") || "Datei {file} geladen.").replace("{file}", filename), 
          "success"
      );
  }
};

// app.js - handleImport (Update für Trips)

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  showMessage(getTranslation("import.readingFile") || "Lese...", getTranslation("import.wait") || "Warten...", "info");

  const reader = new FileReader();
  
  reader.onload = async (e) => {
    try {
      const content = e.target.result;
      let flightsToImport = [];
      let importedTrips = [];

      // 1. PARSEN
      try {
        const jsonContent = JSON.parse(content);
        if (jsonContent.flights && Array.isArray(jsonContent.flights)) {
            flightsToImport = jsonContent.flights;
            if (jsonContent.trips && Array.isArray(jsonContent.trips)) {
                importedTrips = jsonContent.trips;
            }
        } else if (Array.isArray(jsonContent)) {
            flightsToImport = jsonContent;
        } else {
            throw new Error();
        }
      } catch (jsonErr) {
        flightsToImport = parseCSV(content);
      }

      if (!flightsToImport || flightsToImport.length === 0) {
        throw new Error(getTranslation("import.errorNoFlights") || "Keine Flüge gefunden.");
      }

      const { data: userData } = await supabaseClient.auth.getUser();
      const userId = userData.user.id;

      // 2. DATEN AUFBEREITEN & ENRICHMENT (Die Magie passiert hier!)
      const cleanFlights = [];
      
      for (const f of flightsToImport) {
        // Foto Logik
        let parsedPhotos = [];
        if (f.photo_url) {
             if (Array.isArray(f.photo_url)) parsedPhotos = f.photo_url;
             else if (typeof f.photo_url === 'string' && f.photo_url.startsWith("[")) {
                 try { parsedPhotos = JSON.parse(f.photo_url.replace(/'/g, '"')); } catch(e){}
             } else if (f.photo_url.startsWith("http")) parsedPhotos = [f.photo_url];
        }

        let tripName = "";
        if (f.trip_name) tripName = f.trip_name;
        else if (f.trips && f.trips.name) tripName = f.trips.name;

        // Basis-Werte sichern
        let depCode = f.departure ? f.departure.toUpperCase() : "";
        let arrCode = f.arrival ? f.arrival.toUpperCase() : "";
        let distance = f.distance ? parseInt(f.distance) : 0;
        let time = f.time || "";
        let flightClass = f.class || "Economy";
        let co2_kg = f.co2_kg ? parseFloat(f.co2_kg) : 0;
        
        let depLat = f.depLat ? parseFloat(f.depLat) : null;
        let depLon = f.depLon ? parseFloat(f.depLon) : null;
        let arrLat = f.arrLat ? parseFloat(f.arrLat) : null;
        let arrLon = f.arrLon ? parseFloat(f.arrLon) : null;
        let depName = f.depName || "";
        let arrName = f.arrName || "";

        // 🚨 MISSING DATA ENRICHMENT: Fehlen Daten? Wir berechnen sie neu!
        if (distance === 0 || !depLat || !arrLat) {
            let depAirport = typeof findAirport === 'function' ? findAirport(depCode) : null;
            let arrAirport = typeof findAirport === 'function' ? findAirport(arrCode) : null;

            // API Fallback, falls der Flughafen nicht im Offline-Cache ist
            if (!depAirport && typeof window.fetchExternalAirport === 'function') {
                const res = await window.fetchExternalAirport(depCode);
                if (res && res.length > 0) depAirport = res[0];
            }
            if (!arrAirport && typeof window.fetchExternalAirport === 'function') {
                const res = await window.fetchExternalAirport(arrCode);
                if (res && res.length > 0) arrAirport = res[0];
            }

            if (depAirport && arrAirport) {
                // Koordinaten & Namen auffüllen
                if (!depLat) depLat = depAirport.lat;
                if (!depLon) depLon = depAirport.lon;
                if (!arrLat) arrLat = arrAirport.lat;
                if (!arrLon) arrLon = arrAirport.lon;
                if (!depName) depName = depAirport.name;
                if (!arrName) arrName = arrAirport.name;

                // Distanz berechnen
                if (distance === 0 && typeof calculateDistance === 'function') {
                    distance = Math.round(calculateDistance(depLat, depLon, arrLat, arrLon));
                }
            }
        }

        // Zeit berechnen (falls fehlend)
        if (time === "" && distance > 0 && typeof estimateFlightTime === 'function') {
            time = estimateFlightTime(distance);
        }

        // CO2 berechnen (falls fehlend)
        if (co2_kg === 0 && distance > 0 && typeof calculateCO2 === 'function') {
            co2_kg = calculateCO2(distance, flightClass);
        }

        // Flug dem finalen Array hinzufügen
        cleanFlights.push({
            user_id: userId,
            flight_id: f.flight_id ? parseInt(f.flight_id) : (new Date().getTime() + Math.floor(Math.random()*10000)),
            date: f.date,
            flightNumber: f.flightNumber || f.flight_number || "",
            departure: depCode,
            arrival: arrCode,
            airline: f.airline || "",
            airline_logo: f.airline_logo || null,
            aircraftType: f.aircraftType || f.aircraft || "",
            registration: f.registration || "",
            time: time,
            distance: distance,
            notes: f.notes || f.note || "",
            class: flightClass,
            co2_kg: co2_kg,
            price: f.price ? parseFloat(f.price) : null,
            currency: f.currency || null,
            depLat: depLat,
            depLon: depLon,
            arrLat: arrLat,
            arrLon: arrLon,
            depName: depName,
            arrName: arrName,
            photo_url: parsedPhotos,
            _tempTripName: tripName 
        });
      }

      // 3. LIMIT LOGIK VORBEREITEN
      // Wir schneiden hier noch NICHTS ab, sondern holen uns erst den aktuellen Stand der DB!
      const currentFlights = await getFlights();
      const currentDbCount = currentFlights.length;

      // Wir übergeben ALLE neuen Flüge und den aktuellen DB-Stand an das Modal.
      // Das Modal entscheidet dann anhand des Klicks (Ersetzen/Hinzufügen), wie hart limitiert wird.
      showImportDecisionModal(cleanFlights, importedTrips, currentDbCount);

    } catch (err) {
      console.error(err);
      showMessage(
        getTranslation("toast.errorTitle") || "Fehler",
        (getTranslation("import.failed") || "Import fehlgeschlagen: {error}").replace("{error}", err.message),
        "error"
      );
    }
    event.target.value = ''; // Input zurücksetzen
  };
  
  reader.readAsText(file);
}

// app.js - showImportDecisionModal (KORRIGIERT)

// WICHTIG: Achte auf 'importedTrips = []' in der Klammer!
function showImportDecisionModal(incomingFlights, importedTrips = [], currentDbCount = 0) {
  const incomingCount = incomingFlights.length;
  const isFree = (typeof currentUserSubscription !== 'undefined' && currentUserSubscription !== "pro");

  // Berechnen, wie viele Flüge bei welcher Aktion maximal erlaubt sind
  const replaceAllowed = isFree ? Math.min(15, incomingCount) : incomingCount;
  const availableSlots = isFree ? Math.max(0, 15 - currentDbCount) : incomingCount;
  const appendAllowed = isFree ? Math.min(availableSlots, incomingCount) : incomingCount;

  const title = getTranslation("import.modalTitle") || "Import Optionen";
  const bodyTpl = getTranslation("import.modalBody") || "Gefunden: {count} Flüge.";
  const bodyText = bodyTpl.replace("{count}", incomingCount);

  // Warn-Banner für Free-Nutzer
  let upsellHtml = "";
  if (isFree && (incomingCount > replaceAllowed || incomingCount > appendAllowed)) {
      upsellHtml = `
        <div class="mt-4 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 dark:border-yellow-800 dark:from-yellow-900/30 dark:to-orange-900/30 rounded-lg">
            <p class="text-sm text-yellow-800 dark:text-yellow-300 font-medium flex items-start gap-2">
                <span class="text-lg">⚠️</span> 
                <span>Du bist im <b>Free-Tarif</b> (Maximal 15 Flüge gesamt).</span>
            </p>
            <button onclick="closeInfoModal(); openPremiumModal()" class="mt-3 w-full py-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-extrabold rounded-md shadow-sm transition transform hover:scale-[1.02]">
                🚀 PRO freischalten für alle Flüge!
            </button>
        </div>
      `;
  }

  // Hinzufügen-Button dynamisch gestalten (Sperren, wenn voll)
  let appendButtonClass = "w-full p-4 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800 rounded-lg text-left transition";
  let appendTitleClass = "font-bold text-indigo-700 dark:text-indigo-400 mb-1 flex items-center";
  let appendText = (getTranslation("import.optionAppendTitle") || "➕ Hinzufügen") + (isFree ? ` (${appendAllowed} möglich)` : "");
  let appendDisabled = "";

  if (isFree && appendAllowed <= 0) {
      appendButtonClass = "w-full p-4 border border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 rounded-lg text-left opacity-50 cursor-not-allowed";
      appendTitleClass = "font-bold text-gray-500 dark:text-gray-400 mb-1 flex items-center";
      appendText = "➕ Hinzufügen (Limit erreicht)";
      appendDisabled = "disabled";
  }

  const content = `
    <div class="space-y-4">
      <p class="text-gray-700 dark:text-gray-300">
        ${bodyText}
        <br><span class="text-sm text-gray-500">Aktuell gespeichert: ${currentDbCount} Flüge.</span>
      </p>

      ${upsellHtml}

      <div class="grid grid-cols-1 gap-3 mt-4">
        <button id="btn-import-replace" class="w-full p-4 border border-red-200 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 rounded-lg text-left group transition">
          <div class="font-bold text-red-700 dark:text-red-400 mb-1 flex items-center">
             ${getTranslation("import.optionReplaceTitle") || "⚠️ Alles Ersetzen"} ${isFree ? `(Max. ${replaceAllowed})` : ""}
          </div>
          <div class="text-sm text-red-600/80 dark:text-red-400/70">
            ${getTranslation("import.optionReplaceDesc") || "Löscht ALLE deine aktuellen Flüge und ersetzt sie."}
          </div>
        </button>

        <button id="btn-import-append" class="${appendButtonClass}" ${appendDisabled}>
          <div class="${appendTitleClass}">
             ${appendText}
          </div>
          <div class="text-sm text-indigo-600/80 dark:text-indigo-400/70">
            ${getTranslation("import.optionAppendDesc") || "Fügt neue Flüge unten an."}
          </div>
        </button>
      </div>
      
      <div class="text-center mt-4">
          <button onclick="closeInfoModal()" class="text-gray-500 hover:text-gray-700 text-sm underline">
            ${getTranslation("import.cancel") || "Abbrechen"}
          </button>
      </div>
    </div>
  `;

  document.getElementById("info-modal-title").textContent = title;
  document.getElementById("info-modal-content").innerHTML = content;
  openInfoModal();

  // Wir übergeben das genau ausgerechnete Limit an die Ausführungsfunktion!
  document.getElementById("btn-import-replace").onclick = () => executeImport(incomingFlights, 'replace', importedTrips, replaceAllowed);
  
  const btnAppend = document.getElementById("btn-import-append");
  if (btnAppend && !appendDisabled) {
      btnAppend.onclick = () => executeImport(incomingFlights, 'append', importedTrips, appendAllowed);
  }
}

// app.js - executeImport (Final & Silent)

async function executeImport(flightsData, mode, importedTripsSource = [], allowedCount = null) {
  closeInfoModal();
  const { data: userData } = await supabaseClient.auth.getUser();
  if (!userData?.user) return;
  const userId = userData.user.id;

  showMessage(getTranslation("import.processing") || "Import läuft...", getTranslation("import.writing") || "Schreibe Daten...", "info");

  try {
    // --- 🚨 NEU: HARTES LIMIT ANWENDEN ---
    let finalFlightsToProcess = flightsData;
    
    // Wenn ein Limit übergeben wurde und wir zu viele Flüge haben
    if (allowedCount !== null && finalFlightsToProcess.length > allowedCount) {
        // Sortieren, damit wir die neuesten behalten
        finalFlightsToProcess.sort((a, b) => new Date(b.date) - new Date(a.date));
        // Array radikal abschneiden
        finalFlightsToProcess = finalFlightsToProcess.slice(0, allowedCount);
    }

    if (finalFlightsToProcess.length === 0 && mode === 'append') {
        showMessage("Limit erreicht", "Du hast bereits die maximale Anzahl an Flügen gespeichert.", "info");
        return;
    }
    // ------------------------------------

    // 1. CLEANUP BEI REPLACE
    if (mode === 'replace') {
      await supabaseClient.from("flights").delete().eq("user_id", userId);
      await supabaseClient.from("trips").delete().eq("user_id", userId);
    }

    // 2. TRIPS MANAGEN (Hier wird jetzt finalFlightsToProcess genutzt!)
    const tripNamesFromFlights = finalFlightsToProcess.map(f => f._tempTripName).filter(n => n);
    const tripNamesFromJSON = importedTripsSource.map(t => t.name).filter(n => n);
    const uniqueTripNames = [...new Set([...tripNamesFromFlights, ...tripNamesFromJSON])];
    
    const tripNameIdMap = {};

    for (const name of uniqueTripNames) {
        let { data: existing } = await supabaseClient
            .from("trips")
            .select("id")
            .eq("user_id", userId)
            .eq("name", name)
            .maybeSingle(); 

        if (existing) {
            tripNameIdMap[name] = existing.id;
        } else {
            // Neu anlegen
            const { data: newTrip } = await supabaseClient
                .from("trips")
                .insert([{ user_id: userId, name: name }])
                .select()
                .maybeSingle();
            
            if (newTrip) tripNameIdMap[name] = newTrip.id;
        }
    }

    // 3. FLÜGE VORBEREITEN & SÄUBERN (Auch hier finalFlightsToProcess!)
    const finalFlights = finalFlightsToProcess.map(f => {
        const tripId = f._tempTripName ? tripNameIdMap[f._tempTripName] : null;
        
        // Aufräumen: Alles weg, was nicht in die DB gehört
        const { _tempTripName, trips, trip_name, ...rest } = f;
        
        return {
            ...rest,
            trip_id: tripId
        };
    });

    // 4. SPEICHERN
    if (finalFlights.length > 0) {
        const { error: insertError } = await supabaseClient
          .from("flights")
          .insert(finalFlights);

        if (insertError) throw insertError;
    }

    // 5. ERFOLG
    let successBody = mode === 'replace' 
        ? (getTranslation("import.successReplace") || "Ersetzt: {count}").replace("{count}", finalFlights.length)
        : (getTranslation("import.successAppend") || "Hinzugefügt: {count}").replace("{count}", finalFlights.length);

    showMessage(getTranslation("import.successTitle") || "Erfolg", successBody, "success");

    if (typeof loadTripsIntoDropdown === 'function') loadTripsIntoDropdown(); 
    if (typeof getFlights === 'function') {
        allFlightsUnfiltered = await getFlights();
        if (typeof renderFlights === 'function') renderFlights(allFlightsUnfiltered);
    }

  } catch (err) {
    console.error("Datenbank Fehler:", err);
    showMessage(getTranslation("import.errorTitle") || "Fehler", (getTranslation("import.saveError") || "Fehler: ") + err.message, "error");
  }
}

// AUTH LOGIC
function showAuth() {
  document.getElementById("auth-container").classList.remove("hidden");
  document.getElementById("app-container").classList.add("hidden");
}

function switchAuthTab(tab) {
  const loginTab = document.getElementById("login-tab");
  const registerTab = document.getElementById("register-tab");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  document.getElementById("auth-error").textContent = "";

  if (tab === "login") {
    loginTab.classList.add("active-tab");
    registerTab.classList.remove("active-tab");
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
  } else {
    loginTab.classList.remove("active-tab");
    registerTab.classList.add("active-tab");
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
  }
}

async function logout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.error("Error logging out:", error);
    showMessage(getTranslation("toast.errorTitle"), error.message, "error");
  } else {
    window.location.reload();
  }
}

function showPasswordChangeModal() {
  document.getElementById("new-password").value = "";
  document.getElementById("password-change-modal").classList.remove("hidden");
  document.getElementById("password-change-modal").classList.add("flex");
}

function closePasswordChangeModal(event) {
  if (event) {
    event.preventDefault(); // Verhindert jegliche Standard-Button-Aktion
  }
  document.getElementById("password-change-modal").classList.add("hidden");
  document.getElementById("password-change-modal").classList.remove("flex");
}

async function changePassword(event) {
  event.preventDefault();
  const newPassword = document.getElementById("new-password").value;

  if (newPassword.length < 6) {
    showMessage(
      getTranslation("toast.errorTitle") || "Fehler",
      getTranslation("auth.passwordTooShort") || "Das Passwort muss mindestens 6 Zeichen lang sein.",
      "error"
    );
    return;
  }

  try {
    const { error } = await supabaseClient.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      // Fängt "normale" Supabase-Fehler ab (z.B. "Passwort zu schwach")
      throw error;
    }

    // Dieser Teil wird jetzt wieder erreicht werden
    showMessage(
      "Erfolg!",
      "Dein Passwort wurde erfolgreich geändert.",
      "success"
    );
    closePasswordChangeModal();
  } catch (error) {
    // Fängt JEDEN denkbaren Fehler ab, auch Netzwerkprobleme oder unerwartetes Verhalten
    showMessage(
      "Fehler",
      "Das Passwort konnte nicht geändert werden.",
      "error"
    );
    console.error(
      "Ein unerwarteter Fehler ist beim Passwort-Update aufgetreten:",
      error
    );
  }
}

function showPasswordResetForm() {
  document.getElementById("auth-tabs").classList.add("hidden");
  document.getElementById("login-form").classList.add("hidden");
  document.getElementById("register-form").classList.add("hidden");
  document
    .getElementById("password-reset-container")
    .classList.remove("hidden");
  document.getElementById("request-reset-form").classList.remove("hidden");
  document.getElementById("update-password-form").classList.add("hidden");
  document.getElementById("auth-error").textContent = "";
}

function backToLogin() {
  // 1. Reiter wieder einblenden
  document.getElementById("auth-tabs").classList.remove("hidden");
  
  // 2. ALLE Reset-Container und Formulare rigoros verstecken
  document.getElementById("password-reset-container").classList.add("hidden");
  document.getElementById("request-reset-form").classList.add("hidden");
  document.getElementById("update-password-form").classList.add("hidden");
  
  // 3. Auf den sauberen Login-Tab wechseln
  switchAuthTab("login");
}

/**
 * NEU: Füllt das "Neuer Flug"-Formular für einen Rückflug aus.
 * (Wird vom Button auf der 2D-Karte aufgerufen)
 */
function prefillReturnFlight(departureIata, arrivalIata) {
  // 1. Zum "Neuer Flug"-Tab wechseln
  showTab("neue-fluege");

  // --- ✅ HIER IST DIE KORREKTUR ---
  // 2. Setze das Formular ZUERST komplett zurück.
  //    Dies löscht 'currentlyEditingFlightData' und beendet den Edit-Modus.
  window.resetForm();
  // --- ENDE KORREKTUR ---

  // 3. Felder (vertauscht) ausfüllen
  document.getElementById("departure").value = departureIata;
  document.getElementById("arrival").value = arrivalIata;

  // 4. Details (Distanz, CO2, etc.) aktualisieren und Button aktivieren
  updateFlightDetails();

  // 5. (Optional) Zum Formular scrollen
  document
    .getElementById("log-button")
    .scrollIntoView({ behavior: "smooth", block: "center" });
}

// app.js - parseCSV (FINAL, INTELLIGENT & KORRIGIERT FÜR ALLE EXPORTE)

function parseCSV(csvText) {
  // BOM entfernen, falls vorhanden (Excel-Artefakt)
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r\n|\n/);
  const result = [];
  
  if (lines.length < 2) return [];

  // Trennzeichen-Erkennung (; oder ,)
  const firstLine = lines[0];
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const separator = semicolonCount > commaCount ? ';' : ',';

  // Header normalisieren (alles kleingeschrieben für einfachen Vergleich)
  const headers = lines[0].split(separator).map(h => h.trim().toLowerCase().replace(/"/g, ''));
  
  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i];
    if (!currentLine.trim()) continue;
    
    // Split
    const values = currentLine.split(separator); 
    
    let obj = {};
    headers.forEach((header, index) => {
        // Wert säubern (Anführungszeichen entfernen)
        let val = values[index] ? values[index].trim().replace(/^"|"$/g, '').replace(/"/g, '') : "";
        
        // --- BASIS DATEN (Unterstützt AvioSphere, MyFlightradar24 & App In The Air) ---
        if (header === 'date' || header === 'flight date' || header === 'datum') obj.date = val;
        
        // WICHTIG: From/To für MyFlightradar24 hinzugefügt!
        if (header === 'departure' || header === 'from' || header === 'start') obj.departure = val;
        if (header === 'arrival' || header === 'to' || header === 'ziel') obj.arrival = val;
        
        if (header.includes('flightnumber') || header.includes('flight number') || header === 'flight' || header === 'flight_number') obj.flightNumber = val;
        if (header === 'airline') obj.airline = val;
        if (header === 'airline_logo') obj.airline_logo = val;
        if (header.includes('aircraft') || header === 'aircraft type' || header.includes('type')) obj.aircraftType = val;
        if (header === 'registration' || header === 'reg') obj.registration = val;
        if (header === 'time' || header === 'duration') obj.time = val;
        if (header === 'distance') obj.distance = val;
        if (header === 'class' || header === 'cabin') obj.class = val;
        if (header.includes('note')) obj.notes = val;
        if (header === 'price') obj.price = val;
        if (header === 'currency') obj.currency = val;

        // --- TECH & GEO DATEN ---
        if (header === 'deplat') obj.depLat = val;
        if (header === 'deplon') obj.depLon = val;
        if (header === 'arrlat') obj.arrLat = val;
        if (header === 'arrlon') obj.arrLon = val;
        if (header === 'depname') obj.depName = val;
        if (header === 'arrname') obj.arrName = val;

        // --- FOTOS & METADATEN ---
        if (header === 'photo_url') obj.photo_url = val; 
        if (header === 'flight_id') obj.flight_id = val; 
        if (header === 'trip_name' || header === 'trip' || header === 'reise') {
            obj.trip_name = val;
            obj._tempTripName = val; 
        }
    });

    // Validierung: Mindestens Datum und Route (Start & Ziel) müssen da sein
    if (obj.date && obj.departure && obj.arrival) {
        result.push(obj);
    }
  }
  return result;
}

// =================================================================
// AUTO-SYNC (Lazy Sync für vergangene Flüge)
// =================================================================

window.autoSyncMissingFlightData = async function() {
    if (typeof isDemoMode !== 'undefined' && isDemoMode) return;

    try {
        const allFlights = await getFlights();
        if (!allFlights || allFlights.length === 0) return;

        // Zeitfenster definieren (sichere String-Vergleiche gegen Zeitzonen-Bugs!)
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

        // 1. Suche nach Kandidaten
        let candidates = allFlights.filter(f => {
            if (!f.flightNumber || f.flightNumber.trim() === "") return false;
            if (f.registration && f.registration.trim() !== "") return false; // Hat schon eine Reg

            // Ist der Flug in den letzten 7 Tagen?
            return f.date >= sevenDaysAgoStr && f.date <= todayStr;
        });

        if (candidates.length === 0) return; // Nichts zu tun!

        // 🚀 BUGHUNT-FIX: Die neuesten Flüge zuerst abarbeiten!
        // Das verhindert, dass 3 unlösbare alte Flüge die API-Pipeline für immer verstopfen.
        candidates.sort((a, b) => new Date(b.date) - new Date(a.date));

        let syncCount = 0;
        let lastSyncedFlight = "";
        let lastSyncedReg = "";

        console.log(`🔄 Auto-Sync: ${candidates.length} Flüge ohne Registrierung gefunden. Starte Abfrage...`);

        // 2. Kandidaten abarbeiten (Wir limitieren auf max 3 pro Start, um die API nicht zu überlasten)
        for (let i = 0; i < Math.min(candidates.length, 3); i++) {
            const flight = candidates[i];
            const cleanFlightNum = flight.flightNumber.replace(/\s+/g, '').toUpperCase();
            
            // Abfrage an DEINE bestehende Flightradar24 Netlify-Funktion
            const url = `${typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : ''}/.netlify/functions/fetch-flight-by-number?flight_number=${cleanFlightNum}&date=${flight.date}`;
            
            const response = await fetch(url);
            if (!response.ok) continue;

            const json = await response.json();
            const fr24Data = json.data && json.data.length > 0 ? json.data[0] : null;

            // Wenn FR24 eine Registrierung für diesen Tag gefunden hat!
            if (fr24Data && fr24Data.reg && fr24Data.reg.trim() !== "") {
                const newReg = fr24Data.reg.toUpperCase();
                let newAircraftType = flight.aircraftType || fr24Data.type || "";

                let updateData = {
                    registration: newReg,
                    aircraftType: newAircraftType
                };

                // 📸 Magie: Wir holen uns direkt das passende Flugzeug-Foto dazu!
                const photoData = await fetchAircraftPhoto(newReg);
                if (photoData) {
                    updateData.planespotters_url = photoData.url;
                    updateData.planespotters_photographer = photoData.photographer;
                }

                // 3. Supabase Update
                const { error } = await supabaseClient
                    .from('flights')
                    .update(updateData)
                    .eq('flight_id', flight.id || flight.flight_id);

                if (!error) {
                    syncCount++;
                    lastSyncedFlight = cleanFlightNum;
                    lastSyncedReg = newReg;
                    
                    // Lokalen Cache aktualisieren, damit es sofort sichtbar ist
                    flight.registration = newReg;
                    flight.aircraftType = newAircraftType;
                    if (photoData) {
                        flight.planespotters_url = photoData.url;
                        flight.planespotters_photographer = photoData.photographer;
                    }
                }
            }
        }

        // 4. Dem Nutzer Bescheid geben (mit i18n Übersetzungen!)
        if (syncCount > 0) {
            const title = getTranslation("sync.autoSyncTitle") || "✨ Auto-Sync";
            let msg = "";
            
            if (syncCount === 1) {
                msg = (getTranslation("sync.autoSyncSuccessSingle") || `Flugdaten für {flight} wurden automatisch vervollständigt (Reg: {reg}).`)
                      .replace("{flight}", lastSyncedFlight)
                      .replace("{reg}", lastSyncedReg);
            } else {
                msg = (getTranslation("sync.autoSyncSuccessMultiple") || `{count} Flüge wurden im Hintergrund mit Live-Daten vervollständigt!`)
                      .replace("{count}", syncCount);
            }
            
            if (typeof showMessage === 'function') {
                showMessage(title, msg, "success");
            }
            
            // UI neu zeichnen, falls der Nutzer gerade im Logbuch oder der Flugliste ist
            if (typeof renderFlights === 'function') {
                renderFlights(null, null, currentPage);
            }
        }

    } catch (e) {
        console.warn("Auto-Sync Fehler:", e);
    }
};

// DOMContentLoaded
document.addEventListener("DOMContentLoaded", async function () {

// 🚀 NEU: Smartes App-Install-Routing (Nur im Webbrowser)
    if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform()) {
        const urlParams = new URLSearchParams(window.location.search);
        const inviteId = urlParams.get('invite');
        
        if (inviteId) {
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            const isAndroid = /android/i.test(userAgent);
            const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;

            window.currentStoreLink = "https://play.google.com/store/apps/details?id=com.manab.flightbook";

            // 🚀 NEU: Prüfen, ob der Nutzer das Overlay in dieser Session schon weggedrückt hat
            const overlayShown = sessionStorage.getItem('inviteOverlayShown');

            if ((isAndroid || isIOS) && !overlayShown) {
                // Handy erkannt & noch nicht weggeklickt -> Zeige das Overlay GANZ VORNE!
                const overlay = document.getElementById('invite-install-overlay');
                if (overlay) {
                    overlay.classList.remove('hidden');
                    overlay.classList.add('flex');
                }
            } else {
                // Entweder PC, oder Nutzer hat bereits "Im Browser fortfahren" geklickt
                processWebInvite(inviteId);
            }
        }
    }

  const preferredLanguage = localStorage.getItem("preferredLanguage") || "de";
  await setLanguage(preferredLanguage);

  // --- Check: Hat der User die Import-Werbung weggedrückt? ---
  if (localStorage.getItem('hideImportPromo') === 'true') {
      const promoContainer = document.getElementById('import-promo-container');
      if (promoContainer) {
          promoContainer.style.display = 'none';
      }
  }

  // FÜGE DIESEN BLOCK HIER EIN:
  const burgerBtn = document.getElementById('burger-menu-btn');
  if (burgerBtn) {
      burgerBtn.addEventListener('click', toggleBurgerMenu);
  }
  // ENDE EINFÜGEN

  // --- GLOBALER THEME-TOGGLE (Funktioniert auch im Demo-Modus!) ---
  const themeToggleBtn = document.getElementById("menu-theme-toggle");
  if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", (e) => {
          e.preventDefault(); 
          if (typeof toggleDarkMode === 'function') toggleDarkMode();   
          if (typeof toggleBurgerMenu === 'function') toggleBurgerMenu(); 
      });
  }

  // --- HIER EINFÜGEN (damit der Button auch ohne Login geht) ---
  const demoBtn = document.getElementById('demo-btn');
  if (demoBtn) {
      demoBtn.addEventListener('click', startDemoMode);
  }
  // -------------------------------------------------------------
  // --- 🔥 WICHTIG: Globus Button Listener HIERHIN verschieben! ---
  // Damit er auch im Demo-Modus (ohne initializeApp) funktioniert.
  const globeBtn = document.getElementById("show-globe-btn");
  if (globeBtn) {
      globeBtn.addEventListener("click", openGlobeModal);
  }
  // -------------------------------------------------------------

  // Event-Listener NUR für die Auth-Formulare
  document
    .getElementById("login-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        document.getElementById("auth-error").textContent = error.message;
      }
      // KEIN 'else' Block hier. onAuthStateChange kümmert sich um den Erfolg.
    });

  document
    .getElementById("register-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("register-email").value;
      const password = document.getElementById("register-password").value;
      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
      });
      if (error) {
        document.getElementById("auth-error").textContent = error.message;
      } else {
        showMessage(getTranslation("auth.registerSuccessTitle"), getTranslation("auth.registerSuccessBody"), "success");
      }
    });

  document
    .getElementById("request-reset-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById("reset-email");
      const email = emailInput.value;
      
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      
      if (error) {
        showMessage(getTranslation("toast.errorTitle") || "Fehler", error.message, "error");
      } else {
        // 1. Formular leeren und Ansicht zum Login zurücksetzen
        emailInput.value = "";
        backToLogin(); 
        
        // 2. Standard-Toast (oben rechts) trotzdem abfeuern
        showMessage(
          getTranslation("auth.resetEmailSentTitle") || "E-Mail gesendet",
          getTranslation("auth.resetEmailSentBody") || "Falls ein Konto existiert, wurde ein Reset-Link verschickt.",
          "success"
        );
        
        // 3. DIREKTES FEEDBACK: Meldung im Login-Fenster (in Grün) anzeigen
        const authError = document.getElementById("auth-error");
        if (authError) {
            authError.textContent = getTranslation("auth.resetEmailSentBody") || "Reset-Link gesendet! Bitte prüfe deinen Posteingang.";
            authError.classList.remove("text-red-500");
            authError.classList.add("text-green-500");
            
            // Nach 7 Sekunden räumen wir die Meldung wieder auf, damit es sauber bleibt
            setTimeout(() => {
                // Nur aufräumen, wenn es immer noch unsere grüne Erfolgsmeldung ist
                if (authError.classList.contains("text-green-500")) {
                    authError.textContent = "";
                    authError.classList.remove("text-green-500");
                    authError.classList.add("text-red-500");
                }
            }, 7000);
        }
      }
    });

  document
    .getElementById("update-password-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById(
        "update-password-input"
      ).value;
      if (newPassword.length < 6) {
        showMessage(
          "Fehler",
          "Das Passwort muss mindestens 6 Zeichen lang sein.",
          "error"
        );
        return;
      }
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        showMessage(
          getTranslation("toast.errorTitle") || "Fehler",
          getTranslation("auth.passwordUpdateFailed") || "Passwort konnte nicht aktualisiert werden...",
          "error"
        );
      } else {
        showMessage(
          getTranslation("toast.successTitle") || "Erfolg!",
          getTranslation("auth.passwordUpdated") || "Dein Passwort wurde geändert...",
          "success"
        );
        backToLogin();
      }
    });
	
    // NEU: Listener für Demo Exit
  const exitDemoBtn = document.getElementById('menu-exit-demo-btn');
  if (exitDemoBtn) {
      exitDemoBtn.addEventListener('click', () => {
          // Page Reload ist der sauberste Weg, um alles zurückzusetzen
          window.location.reload();
      });
  }

	// EASTER EGG LISTENER
    const headerLogo = document.getElementById("app-header-logo");
    
    if (headerLogo) {
        console.log("Easter Egg Listener wurde erfolgreich registriert!"); // 1. Check
        
        headerLogo.addEventListener("click", (e) => {
            e.preventDefault(); 
            console.log("Logo wurde geklickt! Zähler läuft..."); // 2. Check
            
            // Sicherheitsabfrage: Existiert die Funktion?
            if (typeof triggerEasterEgg === "function") {
                triggerEasterEgg();
            } else {
                console.error("Fehler: triggerEasterEgg Funktion nicht gefunden!");
            }
        });
    } else {
        console.error("Fehler: Element mit ID 'app-header-logo' nicht gefunden!");
    }

    // --- NEU: Listener für Planespotters Live-Vorschau ---
  const regInput = document.getElementById("registration");
  if (regInput) {
      regInput.addEventListener("blur", async (e) => {
          const reg = e.target.value;
          const previewContainer = document.getElementById('planespotters-preview');
          const previewImg = document.getElementById('planespotters-img');
          const previewCredit = document.getElementById('planespotters-credit');
          const previewLink = document.getElementById('planespotters-link');

          if (!reg) {
              clearPlanespottersPreview();
              return;
          }

          const photoData = await fetchAircraftPhoto(reg);
          
          if (photoData) {
              currentPlanespottersData = photoData;
              previewImg.src = photoData.url;
              previewCredit.textContent = photoData.photographer;
              previewLink.href = photoData.link;
              previewContainer.classList.remove('hidden');
          } else {
              clearPlanespottersPreview();
          }
      });
    }

/*
  // Dummy-Funktion für den Kauf (später kommt hier Stripe hin)
  document.getElementById("buy-pro-btn").addEventListener("click", async () => {
    const btn = document.getElementById("buy-pro-btn");
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML =
      '<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...';

    // Simuliere Netzwerk-Anfrage
    await new Promise((r) => setTimeout(r, 1500));

    showMessage(
      "Bald verfügbar",
      getTranslation("premium.thankYou"),
      "success"
    );

    btn.disabled = false;
    btn.innerHTML = originalText;
    closePremiumModal();
  });
*/  
  
    // Kaufen-Button Logik (Hybrid & Abgesichert)
document.getElementById("buy-pro-btn").addEventListener("click", async () => {
    const btn = document.getElementById("buy-pro-btn");
    
    // 1. Prüfen: Sind wir Nativ (App) oder Web?
    const isNative = typeof isNativeApp === 'function' ? isNativeApp() : (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform());

    if (isNative) {
        // --- 📱 APP WEG (RevenueCat) ---
        
        // Türsteher A: Hat User schon Stripe UND ist aktuell PRO?
        if (window.currentUserSubscriptionSource === 'stripe' && currentUserSubscription === 'pro') {
            showMessage(
              getTranslation("premium.alreadyPremiumTitle") || "Bereits Premium",
              getTranslation("premium.alreadyPremiumDesc") || "Du hast ein aktives Web-Abo. Bitte verwalte es auf der Webseite.",
              "info"
            );
            return;
        }

        await buyNative(selectedPlan); 
        
    } else {
        // --- 💻 WEB WEG (Stripe) ---

        // 🛑 TÜRSTEHER B: Hat User Google-Abo UND ist aktuell PRO?
        // WICHTIG: Die Variable 'currentUserSubscription' kommt aus app.js. 
        // Durch den Fix in app.js ist sie jetzt 'free', wenn das Abo abgelaufen ist, 
        // auch wenn in der DB noch kurzzeitig 'pro' stand.
        if (window.currentUserSubscriptionSource === 'google_play' && currentUserSubscription === 'pro') {
            showMessage(
                getTranslation("premium.alreadyPremiumTitle") || "Bereits Premium", 
                getTranslation("premium.googlePlayConflictDesc2") || "Du hast dein Abo über die Android App (Google Play) abgeschlossen. Bitte verwalte dein Abo in der App.", 
                "info"
            );
            return; 
        }

        // ... Ab hier normaler Stripe Code ...
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `⏳ ${getTranslation("premium.loadingCheckout") || "Lade Checkout..."}`;

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) throw new Error("Nicht eingeloggt");

            const priceId = pricingConfig[selectedPlan].stripeProductId;
            
            const response = await fetch(`${API_BASE_URL}/.netlify/functions/create-checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    priceId: priceId,
                    userId: user.id,
                    userEmail: user.email,
                    returnUrl: null 
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.error);
            if (result.url) window.location.href = result.url;

        } catch (error) {
            console.error("Checkout Fehler:", error);
            showMessage(
                getTranslation("toast.errorTitle") || "Fehler", 
                getTranslation("premium.checkoutError") || "Konnte Checkout nicht starten.", 
                "error"
            );
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
});

  // Haupt-Logik: Reagiere auf Änderungen des Login-Status
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      showAuth();
      showPasswordResetForm();
      document.getElementById("request-reset-form").classList.add("hidden");
      document
        .getElementById("update-password-form")
        .classList.remove("hidden");
      showMessage(getTranslation("auth.welcomeBack"), getTranslation("auth.enterNewPassword"), "info");
    } else if (session) {
      // Dieser Block wird bei INITIAL_SESSION (Seitenaufruf im eingeloggten Zustand)
      // UND bei SIGNED_IN (direkt nach dem Login) ausgeführt.
      await initializeApp();
    } else {
      // Dieser Block wird bei SIGNED_OUT ausgeführt.
      showAuth();
    }
  });
  
	// Copyright Jahr automatisch setzen
	const yearSpan = document.getElementById('current-year');
	if (yearSpan) {
		yearSpan.textContent = new Date().getFullYear();
	}
	
	// Listener für Deep Links (Stripe & Einladungen)
    if (typeof Capacitor !== 'undefined') {
        const { App } = Capacitor.Plugins;
        App.addListener('appUrlOpen', async data => {
            console.log('App aus dem Hintergrund geöffnet via URL:', data.url);
            
            // Fall 1: Rückkehr von Stripe (Custom Scheme)
            if (data.url.includes('aviosphere://')) {
                if (Capacitor.Plugins.Browser) Capacitor.Plugins.Browser.close();
                initializeApp(); 
            }
            
            // Fall 2: Einladungslink (App Links / Universal Links)
            // z.B. https://aviosphere.com/?invite=12345
            if (data.url.includes('aviosphere.com') && data.url.includes('invite=')) {
                try {
                    // Wir lesen die URL sauber aus
                    const urlObj = new URL(data.url);
                    const inviteId = urlObj.searchParams.get('invite');
                    
                    if (inviteId) {
                        // Prüfen, ob der User eingeloggt ist
                        const { data: userData } = await supabaseClient.auth.getUser();
                        if (userData && userData.user && userData.user.id !== inviteId) {
                            // Einladungs-Funktion aufrufen!
                            handleFriendInvite(inviteId, userData.user.id);
                        } else if (!userData || !userData.user) {
                            showMessage("Hinweis", "Bitte logge dich zuerst ein, um den Freund hinzuzufügen.", "info");
                        }
                    }
                } catch (e) {
                    console.error("Fehler beim Verarbeiten des Deep Links:", e);
                }
            }
        });
    }

    // ✅ NEU: Wenn die App aus dem Hintergrund kommt
    if (typeof Capacitor !== 'undefined') {
        const { App } = Capacitor.Plugins;
        
        App.addListener('resume', async () => {
            console.log("App wurde fortgesetzt (Resume). Prüfe Abo-Status...");
            
            // 1. RevenueCat Status neu laden (nur native App)
            if (typeof refreshSubscriptionStatus === 'function') {
                await refreshSubscriptionStatus();
            }
            
            // 2. Optional: Auch User-Metadaten von Supabase neu laden
            // const { data } = await supabaseClient.auth.refreshSession();
            // if(data.user) { ... Logik ... }
        });
    }

});

// ====== KUGELSICHERE UMSCHALT-LOGIK FÜR ERRUNGENSCHAFTEN ======
window.toggleAchievementsView = function(view) {
    const btnBadges = document.getElementById('btn-view-badges');
    const btnRecords = document.getElementById('btn-view-records');
    const btnLeaderboard = document.getElementById('btn-view-leaderboard');

    const viewBadges = document.getElementById('view-achievements-badges');
    const viewRecords = document.getElementById('view-achievements-records');
    const viewLeaderboard = document.getElementById('view-achievements-leaderboard');

    // 1. Zuerst alles zurücksetzen
    [viewBadges, viewRecords, viewLeaderboard].forEach(el => { if(el) el.classList.add('hidden'); });
    [btnBadges, btnRecords, btnLeaderboard].forEach(btn => {
        if(btn) {
            btn.classList.remove('bg-white', 'dark:bg-gray-700', 'shadow-sm');
            btn.classList.add('hover:bg-white', 'dark:hover:bg-gray-700');
        }
    });

    // 2. Den aktiven Tab einschalten
    if (view === 'badges') {
        if(viewBadges) viewBadges.classList.remove('hidden');
        if(btnBadges) {
            btnBadges.classList.add('bg-white', 'dark:bg-gray-700', 'shadow-sm');
            btnBadges.classList.remove('hover:bg-white', 'dark:hover:bg-gray-700');
        }
    } else if (view === 'records') {
        if(viewRecords) viewRecords.classList.remove('hidden');
        if(btnRecords) {
            btnRecords.classList.add('bg-white', 'dark:bg-gray-700', 'shadow-sm');
            btnRecords.classList.remove('hover:bg-white', 'dark:hover:bg-gray-700');
        }
    } else if (view === 'leaderboard') {
        if(viewLeaderboard) viewLeaderboard.classList.remove('hidden');
        if(btnLeaderboard) {
            btnLeaderboard.classList.add('bg-white', 'dark:bg-gray-700', 'shadow-sm');
            btnLeaderboard.classList.remove('hover:bg-white', 'dark:hover:bg-gray-700');
        }
        // 🚀 Daten laden, wenn der Tab geöffnet wird!
        loadLeaderboard();
    }
};

// ====== LEADERBOARD LADEN (SUPABASE) ======
window.currentLeaderboardScope = 'global'; // Standard-Modus

// Schalter-Logik (Ändert das Design der Buttons und lädt neu)
window.setLeaderboardScope = function(scope) {
    window.currentLeaderboardScope = scope;
    
    const btnGlobal = document.getElementById('btn-leaderboard-global');
    const btnFriends = document.getElementById('btn-leaderboard-friends');
    const title = document.getElementById('leaderboard-title');
    
    if (scope === 'global') {
        btnGlobal.className = "px-4 py-1.5 rounded-lg bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-400 transition-all";
        btnFriends.className = "px-4 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-all";
        if(title) {
            title.textContent = getTranslation("leaderboard.top100") || "Top 100 - Diesen Monat";
            title.setAttribute("data-i18n", "leaderboard.top100");
        }
    } else {
        btnFriends.className = "px-4 py-1.5 rounded-lg bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-400 transition-all";
        btnGlobal.className = "px-4 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-all";
        if(title) {
            title.textContent = getTranslation("leaderboard.friendsTitle") || "Freunde - Diesen Monat";
            title.setAttribute("data-i18n", "leaderboard.friendsTitle");
        }
    }
    
    loadLeaderboard();
};

window.loadLeaderboard = async function() {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    container.innerHTML = `<div class="p-8 text-center text-gray-500 animate-pulse">${getTranslation("leaderboard.loading") || "Lade Flugdaten aus aller Welt... 🌍"}</div>`;

    if (typeof isDemoMode !== 'undefined' && isDemoMode) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500">${getTranslation("leaderboard.demoDisabled") || "Im Demo-Modus ist das Leaderboard deaktiviert."}</div>`;
        return;
    }

    try {
        const { data: userData } = await supabaseClient.auth.getUser();
        const myUserId = userData?.user?.id;

        // Basis-Query auf unsere magische View
        let query = supabaseClient.from('global_leaderboard_current_month').select('*');

        // 🚀 NEU: Filter-Logik für "Freunde"
        if (window.currentLeaderboardScope === 'friends' && myUserId) {
            // 1. Alle Freundschaften laden, in denen ich vorkomme
            const { data: friendsData, error: friendsError } = await supabaseClient
                .from('friendships')
                .select('user_id_1, user_id_2')
                .or(`user_id_1.eq.${myUserId},user_id_2.eq.${myUserId}`)
                .eq('status', 'accepted');
                
            if (friendsError) throw friendsError;
            
            // 2. IDs in ein Set packen (eigene ID ist immer dabei!)
            const friendIds = new Set([myUserId]);
            if (friendsData) {
                friendsData.forEach(f => {
                    friendIds.add(f.user_id_1);
                    friendIds.add(f.user_id_2);
                });
            }
            
            // 3. View filtern: Nur Freunde und MICH zeigen, Bots rigoros ausschließen!
            query = query.in('user_id', Array.from(friendIds)).eq('is_bot', false);
        } else {
            // "Global" Modus: Standardmäßig die Top 100 anzeigen
            query = query.limit(100);
        }

        const { data, error } = await query;
        if (error) throw error;

        // JavaScript-Sortierung zur Sicherheit
        if (data) data.sort((a, b) => b.total_distance - a.total_distance);

        if (!data || data.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-gray-500">${getTranslation("leaderboard.noFlights") || "Diesen Monat ist noch niemand geflogen!"}</div>`;
            return;
        }

        let html = '';
        data.forEach((entry, index) => {
            const rank = index + 1;
            const isMe = entry.user_id === myUserId;
            
            let rankBadge = `<span class="text-gray-500 font-bold w-6 text-center">${rank}</span>`;
            if (rank === 1) rankBadge = `<span class="text-2xl" title="${getTranslation("leaderboard.rank1") || "Platz 1"}">🥇</span>`;
            if (rank === 2) rankBadge = `<span class="text-2xl" title="${getTranslation("leaderboard.rank2") || "Platz 2"}">🥈</span>`;
            if (rank === 3) rankBadge = `<span class="text-2xl" title="${getTranslation("leaderboard.rank3") || "Platz 3"}">🥉</span>`;

            const rowClass = isMe 
                ? "bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500" 
                : "hover:bg-gray-50 dark:hover:bg-gray-700/50";
            
            const nameClass = isMe ? "text-indigo-700 dark:text-indigo-300 font-black" : "text-gray-800 dark:text-gray-200 font-bold";
            const avatar = entry.avatar_url || "🧑‍✈️";
            const dist = entry.total_distance.toLocaleString('de-DE');

            html += `
            <div class="flex items-center justify-between p-3 sm:p-4 transition-colors ${rowClass}">
                <div class="flex items-center gap-3 sm:gap-4">
                    <div class="w-8 flex justify-center items-center shrink-0">
                        ${rankBadge}
                    </div>
                    <div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex justify-center items-center text-xl shrink-0 shadow-sm border border-white dark:border-gray-600">
                        ${avatar}
                    </div>
                    <div>
                        <p class="${nameClass} text-sm sm:text-base">${entry.username || 'Anonym'}</p>
                        <p class="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                            ${entry.flight_count} <span data-i18n="leaderboard.flights">${getTranslation("leaderboard.flights") || "Flüge"}</span>
                        </p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-black text-indigo-900 dark:text-white text-base sm:text-lg tracking-tight">
                        ${dist} <span class="text-xs text-gray-400 font-normal" data-i18n="leaderboard.km">${getTranslation("leaderboard.km") || "km"}</span>
                    </p>
                </div>
            </div>
            `;
        });

        container.innerHTML = html;

    } catch (err) {
        console.error("Leaderboard Fehler:", err);
        container.innerHTML = `<div class="p-8 text-center text-red-500">${getTranslation("leaderboard.error") || "Fehler beim Laden der Rangliste."}</div>`;
    }
};

// ==========================================
// TRIPS / REISEN LOGIK
// ==========================================

// 1. Trips laden und ins Dropdown füllen
async function loadTripsIntoDropdown(selectedTripId = null) {
  const select = document.getElementById("tripSelect");
  if (!select) return;

  // Leer machen (bis auf die erste Option)
  const defaultText = getTranslation("form.tripNone") || "-- Keine Reise / Einzelflug --";
  select.innerHTML = `<option value="" data-i18n="form.tripNone">${defaultText}</option>`;

  try {
    const { data: trips, error } = await supabaseClient
      .from("trips")
      .select("*")
      .order("created_at", { ascending: false }); // Neueste zuerst

    if (error) throw error;

    trips.forEach((trip) => {
      const option = document.createElement("option");
      option.value = trip.id;
      option.textContent = trip.name;
      if (selectedTripId && String(trip.id) === String(selectedTripId)) {
        option.selected = true;
      }
      select.appendChild(option);
    });

  } catch (err) {
    console.error("Fehler beim Laden der Trips:", err);
  }
}

// 2. Neuen Trip erstellen (Simple Version per Prompt)
async function createNewTrip() {
  // Demo Check
  if (typeof isDemoMode !== 'undefined' && isDemoMode) {
      showMessage(
        getTranslation("demo.demoModus") || "Demo-Modus",
        getTranslation("demo.noTripsCreated") || "Im Demo-Modus können keine Trips erstellt werden.",
        "info"
      );
      return;
  }

  const name = prompt(getTranslation("trips.promptName") || "Name der neuen Reise (z.B. 'Sommerurlaub 2024'):");
  if (!name || name.trim() === "") return;

  const { data: userData } = await supabaseClient.auth.getUser();
  if (!userData?.user) return;

  try {
    const { data, error } = await supabaseClient
      .from("trips")
      .insert([{ 
          user_id: userData.user.id,
          name: name.trim() 
      }])
      .select();

    if (error) throw error;

    showMessage(
      getTranslation("toast.successTitle") || "Erfolg",
      (getTranslation("trips.created") || "Reise '{name}' angelegt.").replace("{name}", name),
      "success"
    );
    
    // Dropdown neu laden und den neuen Trip direkt auswählen
    if (data && data.length > 0) {
        loadTripsIntoDropdown(data[0].id);
    }

  } catch (err) {
    console.error("Trip Fehler:", err);
    showMessage(
      getTranslation("toast.errorTitle") || "Fehler",
      getTranslation("trips.createError") || "Reise konnte nicht erstellt werden.",
      "error"
    );
  }
}

// app.js - openTripManager (KORRIGIERT)

window.renderTripManager = async function() {
  const container = document.getElementById("trips-content");
  if (!container) return;
  container.innerHTML = `<p class="text-gray-500">${getTranslation("trips.loading") || "Lade Reisen..."}</p>`;

  // 1. Trips laden
  const { data: trips } = await supabaseClient
      .from("trips")
      .select("*")
      .order("created_at", { ascending: false });
  
  // 2. Flüge laden
  const allFlights = await getFlights();

  if (!allFlights || allFlights.length === 0) {
      container.innerHTML = `<p class="text-gray-500">${getTranslation("trips.noFlightsLoaded") || "Keine Flüge geladen."}</p>`;
      return;
  }

  if (!trips || trips.length === 0) {
      container.innerHTML = `<p class="text-gray-500">${getTranslation("trips.noTripsCreated") || "Du hast noch keine Reisen angelegt."}</p>`;
      return;
  }

  // 3. HTML bauen
  let htmlContent = `<div class="space-y-6">`;

  trips.forEach(trip => {
      const tripFlights = allFlights.filter(f => f.trip_id == trip.id);
      if (tripFlights.length === 0) return; 

      const totalDist = tripFlights.reduce((sum, f) => sum + (f.distance || 0), 0);
      const totalCO2 = tripFlights.reduce((sum, f) => sum + (f.co2_kg || 0), 0);
      const totalPrice = tripFlights.reduce((sum, f) => sum + (f.price || 0), 0).toFixed(2);
      const currency = tripFlights.find(f => f.currency)?.currency || "";

      // HTML für die Karte (jetzt klickbar mit Hover-Effekt!)
      htmlContent += `
        <div onclick="viewTripDetails('${trip.id}')" class="bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-md transition-all group">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-indigo-700 dark:text-indigo-400 group-hover:text-indigo-500 transition-colors">🏝️ ${trip.name}</h3>
                <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-gray-500 px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-full">${tripFlights.length} ${getTranslation("stats.flights") || "Flüge"}</span>
                    <svg class="w-5 h-5 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </div>
            </div>
            
            <div class="grid grid-cols-3 gap-3 text-sm text-center mb-4">
                <div class="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                    <div class="font-extrabold text-gray-800 dark:text-gray-200 text-lg">${totalDist.toLocaleString("de-DE")} km</div>
                    <div class="text-xs text-gray-400 uppercase tracking-wide mt-1">${getTranslation("flights.sortDistance") || "Distanz"}</div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                     <div class="font-extrabold text-green-600 dark:text-green-400 text-lg">${totalPrice} ${currency}</div>
                     <div class="text-xs text-gray-400 uppercase tracking-wide mt-1">${getTranslation("stats.totalSpending") || "Kosten"}</div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                     <div class="font-extrabold text-orange-600 dark:text-orange-400 text-lg">${totalCO2.toLocaleString("de-DE")} kg</div>
                     <div class="text-xs text-gray-400 uppercase tracking-wide mt-1">CO₂</div>
                </div>
            </div>
            
            <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                ${tripFlights.map(f => `
                    <div class="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 last:border-0 pb-2 last:pb-0">
                        <span class="font-medium">✈️ ${f.departure} ➔ ${f.arrival}</span>
                        <span class="text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded">${f.date}</span>
                    </div>
                `).join('')}
            </div>
        </div>
      `;
  });

  htmlContent += `</div>`;
  container.innerHTML = htmlContent;
};

// app.js - Ganz am Ende einfügen

async function populateTripFilterDropdown() {
  const filterSelect = document.getElementById("filter-trip");
  if (!filterSelect) return;

  // Aktuellen Wert merken (falls wir refreshen)
  const currentVal = filterSelect.value;

  // Trips laden
  const { data: trips } = await supabaseClient
    .from("trips")
    .select("*")
    .order("created_at", { ascending: false });

  if (!trips) return;

  // Standard-Option setzen (Wichtig: i18n beachten wir hier einfachshalber via Helper oder HTML)
  // Wir löschen alles außer der ersten Option, falls nötig, oder bauen neu:
  const defaultText = getTranslation("flights.filterTripPlaceholder") || "Alle Reisen";
  filterSelect.innerHTML = `<option value="" data-i18n="flights.filterTripPlaceholder">${defaultText}</option>`;

  trips.forEach(trip => {
      const option = document.createElement("option");
      option.value = trip.id;
      option.textContent = trip.name;
      filterSelect.appendChild(option);
  });

  // Alten Wert wiederherstellen
  if (currentVal) filterSelect.value = currentVal;
}

// =================================================================
// BOARDING PASS SCANNER LOGIC
// =================================================================

/**
 * Entschlüsselt den IATA BCBP (Barcode Boarding Pass) Standard (Upgrade)
 */
function parseIataBarcode(barcode) {
    if (!barcode.startsWith('M1')) {
        return null;
    }

    try {
        const departure = barcode.substring(30, 33).trim();
        const arrival = barcode.substring(33, 36).trim();
        const airlineCode = barcode.substring(36, 39).trim();
        const flightNumRaw = barcode.substring(39, 44).trim();
        const flightNumber = airlineCode + flightNumRaw.replace(/^0+/, ''); 

        // 1. DATUM BERECHNEN (Julianischer Tag des Jahres: Zeichen 44-46)
        const julianDateStr = barcode.substring(44, 47).trim();
        let flightDate = "";
        
        if (julianDateStr && !isNaN(julianDateStr)) {
            const julianDay = parseInt(julianDateStr, 10);
            const now = new Date();
            let currentYear = now.getFullYear();

            // Datum ausrechnen (1. Januar + X Tage)
            const dateObj = new Date(currentYear, 0, 1);
            dateObj.setDate(julianDay);

            // Logik-Trick: Wenn jemand im Januar eine Bordkarte aus dem Dezember scannt 
            // (Datum liegt mehr als 6 Monate in der Zukunft), ziehen wir ein Jahr ab!
            if (dateObj > new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)) {
                dateObj.setFullYear(currentYear - 1);
            }

            // Als YYYY-MM-DD für das HTML-Input-Feld formatieren
            const yyyy = dateObj.getFullYear();
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            flightDate = `${yyyy}-${mm}-${dd}`;
        }

        // 2. KLASSE ERMITTELN (Buchungsklasse: Zeichen 47)
        const classCode = barcode.substring(47, 48).toUpperCase();
        let flightClass = "Economy"; // Fallback
        if (['F', 'A', 'P'].includes(classCode)) flightClass = "First";
        else if (['J', 'C', 'D', 'I', 'Z'].includes(classCode)) flightClass = "Business";

        return { departure, arrival, airlineCode, flightNumber, flightDate, flightClass };
    } catch(e) {
        console.error("Fehler beim Parsen des Barcodes:", e);
        return null;
    }
}

/**
 * Startet den Kamera-Scanner
 */
window.startBoardingPassScanner = async function() {
    // 1. Demo-Modus Check
    if (typeof isDemoMode !== 'undefined' && isDemoMode) {
        showMessage(
            getTranslation("demo.demoModus") || "Demo-Modus", 
            getTranslation("scanner.demoDisabled") || "Der Scanner ist im Demo-Modus nicht verfügbar.", 
            "info"
        );
        return;
    }

    // --- 2. NEU: PRO-ABO CHECK ---
    if (typeof currentUserSubscription !== 'undefined' && currentUserSubscription !== "pro") {
        // Öffnet sofort das schöne Premium-Upgrade-Fenster!
        if (typeof openPremiumModal === 'function') {
            openPremiumModal(); 
        }
        return;
    }
    // -----------------------------

    // 3. Native App Check
    if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform()) {
        showMessage(getTranslation("toast.infoTitle") || "Hinweis", getTranslation("scanner.onlyMobile") || "Der Scanner ist nur in der mobilen App verfügbar.", "info");
        return;
    }

    try {
        const { BarcodeScanner } = Capacitor.Plugins;

        const status = await BarcodeScanner.checkPermission({ force: true });
        if (!status.granted) {
            showMessage(getTranslation("toast.errorTitle") || "Fehler", getTranslation("scanner.noPermission") || "Kamerazugriff verweigert.", "error");
            return;
        }

        // Native App komplett durchsichtig machen
        await BarcodeScanner.hideBackground();
        document.documentElement.style.background = "transparent";
        document.body.style.background = "transparent";
        
        // App-Inhalt sicher ausblenden
        document.getElementById("app-container").style.display = "none";

        // --- NEU: DYNAMISCHES, KUGELSICHERES OVERLAY ---
        let scannerUI = document.getElementById('dynamic-scanner-ui');
        if (!scannerUI) {
            scannerUI = document.createElement('div');
            scannerUI.id = 'dynamic-scanner-ui';
            // Harte Inline-Styles, die nicht von Tailwind beeinflusst werden können
            scannerUI.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 999999; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: auto;';
            
            // Fadenkreuz, Text und Button
            scannerUI.innerHTML = `
                <div style="position: relative; width: 280px; height: 200px; border: 4px solid #6366f1; border-radius: 16px; box-shadow: 0 0 0 9999px rgba(0,0,0,0.6);">
                    <div style="position: absolute; width: 100%; height: 2px; background: #818cf8; top: 50%; box-shadow: 0 0 15px #4f46e5;"></div>
                </div>
                <p style="color: white; font-weight: bold; margin-top: 32px; background: rgba(0,0,0,0.7); padding: 8px 20px; border-radius: 9999px; z-index: 100;">
                    ${getTranslation("scanner.instruction") || "Richte die Bordkarte im Rahmen aus"}
                </p>
                <button onclick="stopScanner()" style="position: absolute; bottom: 50px; padding: 15px 40px; background: #dc2626; color: white; font-weight: bold; font-size: 18px; border-radius: 9999px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 101; cursor: pointer;">
                    ${getTranslation("form.cancel") || "Abbrechen"}
                </button>
            `;
            document.body.appendChild(scannerUI);
        }
        // ----------------------------------------------

        // WICHTIG: Einen Sekundenbruchteil warten, damit der Bildschirm den Button fertig zeichnet,
        // bevor der native Scanner den Haupt-Thread beansprucht!
        await new Promise(resolve => setTimeout(resolve, 100));

        // Scan starten
        const result = await BarcodeScanner.startScan({ targetedFormats: ['PDF_417', 'QR_CODE'] });

        // Sofort aufräumen
        cleanupScannerUI();

        if (result.hasContent) {
            const parsedData = parseIataBarcode(result.content);
            
            if (parsedData) {
                document.getElementById('departure').value = parsedData.departure;
                document.getElementById('arrival').value = parsedData.arrival;
                document.getElementById('flightNumber').value = parsedData.flightNumber;
                document.getElementById('airline').value = parsedData.airlineCode;
                
                if (parsedData.flightDate) document.getElementById('flightDate').value = parsedData.flightDate;
                if (parsedData.flightClass) document.getElementById('flightClass').value = parsedData.flightClass;
                
                showTab('neue-fluege');
                updateFlightDetails();

                showMessage(getTranslation("toast.successTitle") || "Erfolg", getTranslation("scanner.success") || "Bordkarte erfolgreich ausgelesen!", "success");
                document.getElementById("departure").scrollIntoView({ behavior: "smooth", block: "center" });
            } else {
                showMessage(getTranslation("toast.errorTitle") || "Fehler", getTranslation("scanner.invalidCode") || "Code ist keine gültige IATA-Bordkarte.", "error");
            }
        }
    } catch (err) {
        cleanupScannerUI();
        console.error("Scanner Error:", err);
        showMessage(getTranslation("toast.errorTitle") || "Fehler", "Scanner-Fehler.", "error");
    }
};

window.stopScanner = async function() {
    try {
        const { BarcodeScanner } = Capacitor.Plugins;
        await BarcodeScanner.stopScan(); 
    } catch (e) {
        console.error("Fehler beim Stoppen:", e);
    } finally {
        cleanupScannerUI();
    }
};

function cleanupScannerUI() {
    // Native Kamera stoppen / Hintergrund wieder füllen
    if (typeof Capacitor !== 'undefined' && Capacitor.Plugins.BarcodeScanner) {
        Capacitor.Plugins.BarcodeScanner.showBackground();
    }

    // App-Container und Hintergrund wieder herstellen
    document.documentElement.style.background = "";
    document.body.style.background = "";
    document.getElementById("app-container").style.display = "";

    // Das dynamische Overlay restlos löschen
    const scannerUI = document.getElementById('dynamic-scanner-ui');
    if (scannerUI) {
        scannerUI.remove();
    }
}

window.dismissImportPromo = function(event) {
    if (event) event.stopPropagation(); // Verhindert, dass der Klick den Import auslöst
    
    const container = document.getElementById('import-promo-container');
    if (container) {
        container.style.display = 'none'; // Kasten sofort verstecken
    }
    
    // Im lokalen Speicher des Geräts hinterlegen, dass der User das nicht mehr sehen will
    localStorage.setItem('hideImportPromo', 'true');
};

// ==========================================
// TAGEBUCH / DIGITAL BOARDING PASS
// ==========================================

// --- NEU: Globale Variablen für die Swipe-Logik ---
window.currentSwipeIndex = -1;
window.currentSwipeFlights = [];

// --- 🚀 NEU: Animations-Helfer für das Swipen ---
window.switchFlightCard = function(flightId, direction) {
    const modalContent = document.getElementById('fd-modal-content');
    if (!modalContent) return;

    // 1. Sanftes Rausgleiten (in Wisch-Richtung)
    modalContent.style.transition = 'transform 0.2s ease-in, opacity 0.2s ease-in';
    modalContent.style.opacity = '0';
    modalContent.style.transform = direction === 'left' ? 'translateX(-50px) scale(0.98)' : 'translateX(50px) scale(0.98)';

    setTimeout(() => {
        // 2. Daten aktualisieren und SCOPE weitergeben!
        viewFlightDetails(flightId, true, window.currentSwipeFlights); 

        // 3. Karte auf die andere Seite teleportieren (unsichtbar)
        modalContent.style.transition = 'none';
        modalContent.style.transform = direction === 'left' ? 'translateX(50px) scale(0.98)' : 'translateX(-50px) scale(0.98)';

        // 4. Sanftes Reingleiten
        setTimeout(() => {
            modalContent.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease-out';
            modalContent.style.opacity = '1';
            modalContent.style.transform = 'translateX(0) scale(1)';
            
            // 5. Aufräumen, damit Schließen & Öffnen danach normal funktionieren
            setTimeout(() => {
                modalContent.style.transition = '';
                modalContent.style.transform = '';
                modalContent.style.opacity = '';
            }, 300);
        }, 20); // Kurzer Moment, damit der Browser die Start-Position rendert
    }, 200); // Entspricht der 0.2s Raus-Animation
};

// 🚀 ANPASSUNG: Wir akzeptieren jetzt einen 3. Parameter "customScope"
window.viewFlightDetails = async function(id, isSwitching = false, customScope = null) {
    let allFlights = [];
    
    // 1. Datenquelle wählen (Trip-Scope oder Alle Flüge)
    if (customScope) {
        allFlights = customScope; // Wir nutzen NUR die Flüge dieser Reise!
        allFlights.sort((a, b) => a.flightLogNumber - b.flightLogNumber);
    } else {
        if (typeof isDemoMode !== 'undefined' && isDemoMode && typeof flights !== 'undefined') {
            allFlights = [...flights]; 
        } else {
            allFlights = await getFlights(); 
        }
        allFlights = resequenceAndAssignNumbers(allFlights);
        allFlights.sort((a, b) => a.flightLogNumber - b.flightLogNumber);
    }

    // 2. Aktuellen Flug finden
    const currentIndex = allFlights.findIndex(f => f.id == id || f.flight_id == id || f.flightLogNumber == id); 
    const flight = allFlights[currentIndex]; 
    if (!flight) return;

    // Swipe-Daten für später speichern
    window.currentSwipeIndex = currentIndex;
    window.currentSwipeFlights = allFlights;

    // 3. Textdaten einfügen
    document.getElementById('fd-date').textContent = new Date(flight.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('fd-log-number').textContent = `#${flight.flightLogNumber}`; // 🎫 Flugnummer setzen
    
    document.getElementById('fd-dep').textContent = flight.departure;
    document.getElementById('fd-arr').textContent = flight.arrival;
    document.getElementById('fd-airline').textContent = flight.airline || "Unbekannte Airline";
    document.getElementById('fd-flight-number').textContent = flight.flightNumber || "";
    document.getElementById('fd-class').textContent = flight.class || "Economy";
    document.getElementById('fd-aircraft').textContent = flight.aircraftType || "Unbekannt";
    document.getElementById('fd-reg').textContent = flight.registration || "-";
    document.getElementById('fd-distance').textContent = flight.distance ? `${flight.distance.toLocaleString()} km` : "-";
    document.getElementById('fd-duration').textContent = flight.time || "-";
    document.getElementById('fd-co2').textContent = flight.co2_kg ? `${flight.co2_kg.toLocaleString()} kg` : "-";

    // 4. Airline Logo & Notizen
    const logoEl = document.getElementById('fd-airline-logo');
    if (flight.airline_logo) { logoEl.src = flight.airline_logo; logoEl.classList.remove('hidden'); } 
    else { logoEl.classList.add('hidden'); }

    const notesContainer = document.getElementById('fd-notes-container');
    if (flight.notes && flight.notes.trim() !== "") {
        document.getElementById('fd-notes').textContent = flight.notes;
        notesContainer.classList.remove('hidden');
    } else { notesContainer.classList.add('hidden'); }

    // 5. Hero Image (Planespotters)
    const heroImg = document.getElementById('fd-hero-img');
    const creditContainer = document.getElementById('fd-planespotters-credit');
    if (flight.planespotters_url) {
        heroImg.src = flight.planespotters_url;
        document.getElementById('fd-photographer').textContent = flight.planespotters_photographer || "Unbekannt";
        creditContainer.classList.remove('hidden');
    } else {
        heroImg.src = "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=1000&auto=format&fit=crop"; 
        creditContainer.classList.add('hidden');
    }

    // 6. EIGENE Fotos (Die kleine Galerie unten)
    const userPhotosContainer = document.getElementById('fd-user-photos-container');
    const userPhotosDiv = document.getElementById('fd-user-photos');
    userPhotosDiv.innerHTML = ""; 
    
    if (flight.photo_url && flight.photo_url.length > 0) {
        flight.photo_url.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            if (url.includes('supabase.co')) img.crossOrigin = "anonymous"; 
            img.onclick = () => window.open(url, '_blank'); 
            img.className = "h-24 w-24 sm:h-28 sm:w-28 object-cover rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 shrink-0 cursor-pointer hover:opacity-80 transition";
            userPhotosDiv.appendChild(img);
        });
        userPhotosContainer.classList.remove('hidden');
    } else {
        userPhotosContainer.classList.add('hidden');
    }

    // 7. Button Logik (Bearbeiten)
    const editBtn = document.getElementById('fd-edit-btn');
    if (typeof isDemoMode !== 'undefined' && isDemoMode) {
        // Im Demo-Modus wird der Stift komplett ausgeblendet
        if (editBtn) editBtn.style.display = 'none';
    } else {
        // Im normalen Modus ist der Stift sichtbar und klickbar
        if (editBtn) {
            editBtn.style.display = ''; 
            editBtn.onclick = () => {
                closeFlightDetails();
                // 🚀 BUGHUNT-FIX: Wir nutzen die Original-ID aus dem Flug-Objekt (behält den Typ Zahl/String bei!)
                if (typeof editFlight === 'function') editFlight(flight.id || flight.flight_id);
            };
        }
    }

    // --- 8. NEU: NAVIGATION BUTTONS (PC) ---
    const prevBtn = document.getElementById('fd-prev-btn');
    const nextBtn = document.getElementById('fd-next-btn');
    
    const isNativeApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

    if (isNativeApp) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    } else {
        if (prevBtn) {
            if (currentIndex > 0) {
                prevBtn.style.display = 'flex';
                // 🚀 NEU: Nutzt die flüssige Switch-Animation nach RECHTS
                prevBtn.onclick = () => switchFlightCard(allFlights[currentIndex - 1].id || allFlights[currentIndex - 1].flight_id, 'right');
            } else { prevBtn.style.display = 'none'; }
        }
        if (nextBtn) {
            if (currentIndex < allFlights.length - 1) {
                nextBtn.style.display = 'flex';
                // 🚀 NEU: Nutzt die flüssige Switch-Animation nach LINKS
                nextBtn.onclick = () => switchFlightCard(allFlights[currentIndex + 1].id || allFlights[currentIndex + 1].flight_id, 'left');
            } else { nextBtn.style.display = 'none'; }
        }
    }

    // --- 9. NEU: Wischgesten (SWIPE) für Handys anbinden ---
    const modalContent = document.getElementById('fd-modal-content');
    if (modalContent && !modalContent.dataset.swipeBound) {
        let touchstartX = 0;
        let touchstartY = 0;

        modalContent.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
            touchstartY = e.changedTouches[0].screenY;
        }, {passive: true});

        modalContent.addEventListener('touchend', e => {
            const touchendX = e.changedTouches[0].screenX;
            const touchendY = e.changedTouches[0].screenY;
            
            const deltaX = touchendX - touchstartX;
            const deltaY = touchendY - touchstartY;

            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
                if (deltaX < 0) {
                    // Nach links wischen -> Neuerer Flug
                    if (window.currentSwipeIndex < window.currentSwipeFlights.length - 1) {
                        const nextF = window.currentSwipeFlights[window.currentSwipeIndex + 1];
                        // 🚀 NEU: Nutzt die Switch-Animation
                        switchFlightCard(nextF.id || nextF.flight_id, 'left');
                    }
                } else {
                    // Nach rechts wischen -> Älterer Flug
                    if (window.currentSwipeIndex > 0) {
                        const prevF = window.currentSwipeFlights[window.currentSwipeIndex - 1];
                        // 🚀 NEU: Nutzt die Switch-Animation
                        switchFlightCard(prevF.id || prevF.flight_id, 'right');
                    }
                }
            }
        }, {passive: true});
        
        modalContent.dataset.swipeBound = 'true';
    }

    // Modal geschmeidig einblenden
    const modal = document.getElementById('flight-details-modal');
    modal.style.zIndex = '60'; // <-- 🚀 NEU: Legt die Flug-Karte sicher ÜBER die Reise-Karte!
    modal.classList.remove('hidden');
    
    if (!isSwitching) {
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
        }, 10);
    }
};

// --- NEU: Funktion zum Schließen der Flug-Karte (inkl. weicher Animation) ---
window.closeFlightDetails = function() {
    const modal = document.getElementById('flight-details-modal');
    const modalContent = document.getElementById('fd-modal-content');
    
    if (modal) {
        // 1. Animation rückwärts abspielen (weich ausblenden)
        modal.classList.add('opacity-0');
        if (modalContent) {
            modalContent.classList.add('scale-95');
        }
        
        // 2. Nach der Animation (z.B. 200ms) das Element komplett verstecken
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 200);
    }
};

// =================================================================
// TRIP KARTEN LOGIK (Swipe & View)
// =================================================================

window.currentSwipeTripIndex = -1;
window.currentSwipeTrips = [];

// Animations-Helfer
window.switchTripCard = function(tripId, direction) {
    const modalContent = document.getElementById('td-modal-content');
    if (!modalContent) return;

    modalContent.style.transition = 'transform 0.2s ease-in, opacity 0.2s ease-in';
    modalContent.style.opacity = '0';
    modalContent.style.transform = direction === 'left' ? 'translateX(-50px) scale(0.98)' : 'translateX(50px) scale(0.98)';

    setTimeout(() => {
        viewTripDetails(tripId, true); 

        modalContent.style.transition = 'none';
        modalContent.style.transform = direction === 'left' ? 'translateX(50px) scale(0.98)' : 'translateX(-50px) scale(0.98)';

        setTimeout(() => {
            modalContent.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease-out';
            modalContent.style.opacity = '1';
            modalContent.style.transform = 'translateX(0) scale(1)';
            
            setTimeout(() => {
                modalContent.style.transition = '';
                modalContent.style.transform = '';
                modalContent.style.opacity = '';
            }, 300);
        }, 20); 
    }, 200); 
};

// Schließen-Helfer
window.closeTripDetails = function() {
    const modal = document.getElementById('trip-details-modal');
    const modalContent = document.getElementById('td-modal-content');
    
    if (modal) {
        modal.classList.add('opacity-0');
        if (modalContent) modalContent.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 200);
    }
};

// Hauptfunktion zum Öffnen der Reise
window.viewTripDetails = async function(tripId, isSwitching = false) {
    // 1. Alle Reisen abrufen (Supabase)
    const { data: trips, error } = await supabaseClient.from('trips').select('*').order('created_at', { ascending: false });
    if (error || !trips) return;
    
    // 2. Alle Flüge abrufen und chronologisch nummerieren (wichtig für die Flug-Nummern!)
    let allFlights = typeof isDemoMode !== 'undefined' && isDemoMode && typeof flights !== 'undefined' ? [...flights] : await getFlights();
    allFlights = resequenceAndAssignNumbers(allFlights); // <-- NEU
    
    // 3. Den aktuellen Trip finden
    const currentIndex = trips.findIndex(t => t.id == tripId);
    const trip = trips[currentIndex];
    if (!trip) return;

    window.currentSwipeTripIndex = currentIndex;
    window.currentSwipeTrips = trips;

    // 4. Die Flüge für DIESEN Trip herausfiltern und sortieren (chronologisch)
    const tripFlights = allFlights.filter(f => f.trip_id == trip.id);
    tripFlights.sort((a, b) => new Date(a.date) - new Date(b.date));
    window.currentTripFlights = tripFlights; // <-- NEU: Scope für Swipen speichern

    // 5. Statistiken der Reise berechnen
    let totalDist = 0;
    let totalCO2 = 0;
    tripFlights.forEach(f => {
        totalDist += (f.distance || 0);
        totalCO2 += (f.co2_kg || 0);
    });

    let dateRange = "Keine Flüge";
    if (tripFlights.length > 0) {
        const first = new Date(tripFlights[0].date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        const last = new Date(tripFlights[tripFlights.length - 1].date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        dateRange = tripFlights.length === 1 ? first : `${first} – ${last}`;
    }

    // 6. Werte ins HTML eintragen
    document.getElementById('td-name').textContent = trip.name;
    document.getElementById('td-date-range').textContent = dateRange;
    document.getElementById('td-flight-count').textContent = tripFlights.length;
    document.getElementById('td-distance').textContent = `${totalDist.toLocaleString("de-DE")} km`;
    document.getElementById('td-co2').textContent = `${totalCO2.toLocaleString("de-DE")} kg`;

    // 7. Die kleine Flugliste generieren
    const listContainer = document.getElementById('td-flight-list');
    listContainer.innerHTML = '';

    if (tripFlights.length === 0) {
        listContainer.innerHTML = `<p class="text-sm text-gray-500 italic">Noch keine Flüge hinzugefügt.</p>`;
    } else {
        tripFlights.forEach((f, idx) => {
            const isLast = idx === tripFlights.length - 1;
            const el = document.createElement('div');
            el.className = `relative pb-4 ${isLast ? '' : ''}`; // Für den Timeline-Look
            
            // Kleiner Kreis links auf der Border-Linie
            el.innerHTML = `
                <div class="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-400 border-2 border-white dark:border-gray-800"></div>
                <div class="flex justify-between items-center group cursor-pointer" onclick="viewFlightDetails('${f.id || f.flight_id}', false, window.currentTripFlights)">
                    <div>
                        <p class="text-sm font-bold text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 transition">
                            ${f.departure} ➔ ${f.arrival}
                        </p>
                        <p class="text-xs text-gray-500">${f.date} • ${f.airline || 'Unbekannt'}</p>
                    </div>
                    <div class="bg-gray-100 dark:bg-gray-700 p-1.5 rounded text-gray-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                </div>
            `;
            listContainer.appendChild(el);
        });
    }

    // 8. Pfeil-Logik (PC) & Swipe-Logik (Handy) - Exakt wie bei den Flügen
    const prevBtn = document.getElementById('td-prev-btn');
    const nextBtn = document.getElementById('td-next-btn');
    const isNativeApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

    if (isNativeApp) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    } else {
        if (prevBtn) {
            if (currentIndex > 0) {
                prevBtn.style.display = 'flex';
                prevBtn.onclick = () => switchTripCard(trips[currentIndex - 1].id, 'right');
            } else { prevBtn.style.display = 'none'; }
        }
        if (nextBtn) {
            if (currentIndex < trips.length - 1) {
                nextBtn.style.display = 'flex';
                nextBtn.onclick = () => switchTripCard(trips[currentIndex + 1].id, 'left');
            } else { nextBtn.style.display = 'none'; }
        }
    }

    // Touch-Event für Swipe anhängen
    const modalContent = document.getElementById('td-modal-content');
    if (modalContent && !modalContent.dataset.swipeBound) {
        let touchstartX = 0;
        let touchstartY = 0;

        modalContent.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
            touchstartY = e.changedTouches[0].screenY;
        }, {passive: true});

        modalContent.addEventListener('touchend', e => {
            const touchendX = e.changedTouches[0].screenX;
            const touchendY = e.changedTouches[0].screenY;
            const deltaX = touchendX - touchstartX;
            const deltaY = touchendY - touchstartY;

            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
                if (deltaX < 0) {
                    if (window.currentSwipeTripIndex < window.currentSwipeTrips.length - 1) {
                        switchTripCard(window.currentSwipeTrips[window.currentSwipeTripIndex + 1].id, 'left');
                    }
                } else {
                    if (window.currentSwipeTripIndex > 0) {
                        switchTripCard(window.currentSwipeTrips[window.currentSwipeTripIndex - 1].id, 'right');
                    }
                }
            }
        }, {passive: true});
        modalContent.dataset.swipeBound = 'true';
    }

    // 9. Karte anzeigen
    const modal = document.getElementById('trip-details-modal');
    modal.classList.remove('hidden');
    if (!isSwitching) {
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
        }, 10);
    }
};

// =================================================================
// LOGBOOK KARTEN LOGIK
// =================================================================

window.closeLogbookDetails = function() {
    const modal = document.getElementById('logbook-details-modal');
    const modalContent = document.getElementById('ld-modal-content');
    
    if (modal) {
        modal.classList.add('opacity-0');
        if (modalContent) modalContent.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 200);
    }
};

window.viewLogbookDetails = async function(type, key) {
    // 1. Alle Flüge holen und nummerieren (für den "Scope")
    let allFlights = typeof isDemoMode !== 'undefined' && isDemoMode && typeof flights !== 'undefined' ? [...flights] : await getFlights();
    allFlights = resequenceAndAssignNumbers(allFlights);

    let filteredFlights = [];
    let title = key;
    let subtitle = "";
    let icon = "✈️";
    let logoUrl = null;
    let heroImgUrl = null; // 📸 NEU: Variable für das Hintergrundbild

    // 2. Flüge nach der angeklickten Kategorie filtern
    if (type === 'airline') {
        filteredFlights = allFlights.filter(f => f.airline === key);
        subtitle = "Airline";
        icon = "🏢";
        // Wir schnappen uns das Logo vom ersten Flug, der eins hat!
        const flightWithLogo = filteredFlights.find(f => f.airline_logo);
        if (flightWithLogo) logoUrl = flightWithLogo.airline_logo;
        
    } else if (type === 'aircraft') {
        filteredFlights = allFlights.filter(f => f.aircraftType === key);
        subtitle = "Flugzeugtyp";
        icon = "🛫";
        
        // 📸 NEU: Bild-Suche auch für den gesamten Flugzeugtyp
        const flightWithPhoto = filteredFlights.find(f => f.planespotters_url);
        if (flightWithPhoto) heroImgUrl = flightWithPhoto.planespotters_url;
        
    } else if (type === 'airport') {
        filteredFlights = allFlights.filter(f => f.departure === key || f.arrival === key);
        subtitle = "Flughafen";
        icon = "📍";
        if (typeof airportData !== 'undefined' && airportData[key]) {
            title = `${airportData[key].name} (${key})`;
        }
        
    } else if (type === 'registration') {
        filteredFlights = allFlights.filter(f => f.registration === key);
        subtitle = "Registrierung";
        icon = "🏷️";
        
        // 📸 NEU: Bild für diese exakte Registrierung suchen
        const flightWithPhoto = filteredFlights.find(f => f.planespotters_url);
        if (flightWithPhoto) {
            heroImgUrl = flightWithPhoto.planespotters_url;
        } else {
            // Fallback: Deine eigenen hochgeladenen Fotos nutzen
            const flightWithOwnPhoto = filteredFlights.find(f => f.photo_url && f.photo_url.length > 0);
            if (flightWithOwnPhoto) heroImgUrl = flightWithOwnPhoto.photo_url[0];
        }
    }

    if (filteredFlights.length === 0) return;

    // Sortierung: Neuester Flug oben
    filteredFlights.sort((a, b) => new Date(b.date) - new Date(a.date));
    window.currentLogbookFlights = filteredFlights;

    // 3. Header-Texte & Icons setzen
    document.getElementById('ld-title').textContent = title;
    document.getElementById('ld-subtitle').textContent = subtitle;
    
    const logoContainer = document.getElementById('ld-logo-container');
    const logoImg = document.getElementById('ld-logo');
    const iconEl = document.getElementById('ld-icon');
    
    // 📸 NEU: Bildelemente holen
    const heroImg = document.getElementById('ld-hero-img');
    const heroOverlay = document.getElementById('ld-hero-overlay');

    // Logo Logik (Airline)
    if (logoUrl) {
        logoImg.src = logoUrl;
        logoContainer.classList.remove('hidden');
        iconEl.classList.add('hidden');
    } else {
        logoContainer.classList.add('hidden');
        iconEl.textContent = icon;
        iconEl.classList.remove('hidden');
    }

    // 📸 NEU: Hero Image Logik einblenden
    if (heroImgUrl && heroImg && heroOverlay) {
        heroImg.src = heroImgUrl;
        heroImg.classList.remove('hidden');
        heroOverlay.classList.remove('hidden');
        iconEl.classList.add('hidden'); // Emoji verstecken, da das Bild schon wirkt
    } else if (heroImg && heroOverlay) {
        // Sicherstellen, dass es versteckt ist (z.B. bei Flughäfen)
        heroImg.classList.add('hidden');
        heroOverlay.classList.add('hidden');
    }

    // 4. Statistiken berechnen (Dynamisch je nach Typ!)
    let totalDist = 0;
    const uniqueTypes = new Set();
    const uniqueRoutes = new Set();

    filteredFlights.forEach(f => {
        totalDist += (f.distance || 0);
        if (f.aircraftType) uniqueTypes.add(f.aircraftType);
        if (f.departure && f.arrival) uniqueRoutes.add(`${f.departure}-${f.arrival}`);
    });

    document.getElementById('ld-flight-count').textContent = filteredFlights.length;
    document.getElementById('ld-stat2-value').textContent = `${totalDist.toLocaleString("de-DE")} km`;

    const stat3Label = document.getElementById('ld-stat3-label');
    const stat3Value = document.getElementById('ld-stat3-value');

    if (type === 'airline') {
        stat3Label.textContent = "Geflogene Typen";
        stat3Value.textContent = uniqueTypes.size;
    } else {
        stat3Label.textContent = "Verschiedene Routen";
        stat3Value.textContent = uniqueRoutes.size;
    }

    // 5. Flug-Liste aufbauen
    const listContainer = document.getElementById('ld-flight-list');
    listContainer.innerHTML = '';

    filteredFlights.forEach((f, idx) => {
        const isLast = idx === filteredFlights.length - 1;
        const el = document.createElement('div');
        el.className = `relative pb-4 ${isLast ? '' : ''}`;
        
        // Klick auf den Flug öffnet die Flug-Karte und übergibt den Logbuch-Scope!
        el.innerHTML = `
            <div class="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-400 border-2 border-white dark:border-gray-800"></div>
            <div class="flex justify-between items-center group cursor-pointer" onclick="viewFlightDetails('${f.id || f.flight_id}', false, window.currentLogbookFlights)">
                <div>
                    <p class="text-sm font-bold text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 transition">
                        ${f.departure} ➔ ${f.arrival}
                    </p>
                    <p class="text-xs text-gray-500">${f.date} • Flug #${f.flightLogNumber}</p>
                </div>
                <div class="bg-gray-100 dark:bg-gray-700 p-1.5 rounded text-gray-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </div>
            </div>
        `;
        listContainer.appendChild(el);
    });

    // 6. Modal anzeigen (Z-Index etwas niedriger als die Flug-Karte, damit die drüber passt)
    const modal = document.getElementById('logbook-details-modal');
    modal.style.zIndex = '50';
    modal.classList.remove('hidden');
    
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('ld-modal-content').classList.remove('scale-95');
    }, 10);
};

// =================================================================
// ACHIEVEMENT KARTEN LOGIK (Trophäen)
// =================================================================

window.currentSwipeAchievementIndex = -1;
window.currentSwipeAchievements = [];

window.closeAchievementDetails = function() {
    const modal = document.getElementById('achievement-details-modal');
    const modalContent = document.getElementById('ad-modal-content');
    if (modal) {
        modal.classList.add('opacity-0');
        if (modalContent) modalContent.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 200);
    }
};

window.switchAchievementCard = function(index, direction) {
    const modalContent = document.getElementById('ad-modal-content');
    if (!modalContent) return;

    modalContent.style.transition = 'transform 0.2s ease-in, opacity 0.2s ease-in';
    modalContent.style.opacity = '0';
    modalContent.style.transform = direction === 'left' ? 'translateX(-50px) scale(0.98)' : 'translateX(50px) scale(0.98)';

    setTimeout(() => {
        const nextAch = window.currentSwipeAchievements[index];
        viewAchievementDetails(nextAch.category, nextAch.key, true); 

        modalContent.style.transition = 'none';
        modalContent.style.transform = direction === 'left' ? 'translateX(50px) scale(0.98)' : 'translateX(-50px) scale(0.98)';

        setTimeout(() => {
            modalContent.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease-out';
            modalContent.style.opacity = '1';
            modalContent.style.transform = 'translateX(0) scale(1)';
            
            setTimeout(() => {
                modalContent.style.transition = '';
                modalContent.style.transform = '';
                modalContent.style.opacity = '';
            }, 300);
        }, 20); 
    }, 200); 
};

window.viewAchievementDetails = async function(category, key, isSwitching = false) {
    // 1. Daten zusammensammeln (falls wir nicht schon swipen)
    if (!isSwitching || window.currentSwipeAchievements.length === 0) {
        const allFlights = typeof isDemoMode !== 'undefined' && isDemoMode && typeof flights !== 'undefined' ? [...flights] : await getFlights();
        
        // Werte berechnen (Gleiche Logik wie in ui.js)
        const totalFlights = allFlights.length;
        const totalDistance = allFlights.reduce((sum, f) => sum + (f.distance || 0), 0);
        const totalMinutes = allFlights.reduce((sum, f) => sum + (typeof parseFlightTimeToMinutes === 'function' ? parseFlightTimeToMinutes(f.time) : 0), 0);
        const totalHours = totalMinutes / 60;
        const uniqueAirports = new Set(allFlights.flatMap(f => [f.departure, f.arrival]));
        const longestFlightDistance = allFlights.length > 0 ? Math.max(...allFlights.map(f => f.distance || 0)) : 0;
        const totalCO2 = allFlights.reduce((sum, f) => sum + (f.co2_kg || 0), 0);

        const values = { flights: totalFlights, distance: totalDistance, time: totalHours, uniqueAirports: uniqueAirports.size, longestFlight: longestFlightDistance, co2_total: totalCO2 };
        const units = { flights: getTranslation("achievements.unitFlights"), distance: getTranslation("achievements.unitKm"), time: getTranslation("achievements.unitHours"), uniqueAirports: getTranslation("achievements.unitAirports"), longestFlight: getTranslation("achievements.unitKm"), co2_total: getTranslation("achievements.unitCo2") };

        // Flache Liste aller Trophäen bauen
        let flatList = [];
        Object.keys(achievements).forEach(cat => {
            achievements[cat].forEach(ach => {
                const isUnlocked = values[cat] >= ach.milestone;
                flatList.push({ category: cat, key: ach.key, milestone: ach.milestone, emoji: ach.emoji, currentValue: values[cat], unit: units[cat], isUnlocked: isUnlocked, title: getTranslation(`achievements.${cat}.${ach.key}.title`), description: getTranslation(`achievements.${cat}.${ach.key}.description`) });
            });
        });
        window.currentSwipeAchievements = flatList;
    }

    // 2. Den richtigen Index finden
    const currentIndex = window.currentSwipeAchievements.findIndex(a => a.category === category && a.key === key);
    if (currentIndex === -1) return;
    window.currentSwipeAchievementIndex = currentIndex;
    const ach = window.currentSwipeAchievements[currentIndex];

    // 3. Texte setzen
    document.getElementById('ad-title').textContent = ach.title;
    document.getElementById('ad-desc').textContent = ach.description;
    const adImg = document.getElementById('ad-img');
    adImg.src = `pictures/achievements/${ach.category}_${ach.key}.png`;
    
    // 4. Fortschrittsbalken
    document.getElementById('ad-progress-text').textContent = `${Math.round(ach.currentValue).toLocaleString("de-DE")} / ${ach.milestone.toLocaleString("de-DE")} ${ach.unit}`;
    const progressPercent = Math.min((ach.currentValue / ach.milestone) * 100, 100);
    const bar = document.getElementById('ad-progress-bar');
    bar.style.width = `${progressPercent}%`;

    // 5. Visuelles Styling (Museums-Look für die 3D-Icons)
    const headerBg = document.getElementById('ad-header-bg');
    const shine = document.getElementById('ad-shine');

    // 🧹 ALTE RESTE LÖSCHEN: Wir entfernen die blockierenden Inline-Styles von vorhin
    adImg.style.cssText = "";
    headerBg.style.cssText = "";

    // 🚀 DER FIX: Wir setzen die Klassen neu, ABER BEHALTEN DIE GRÖSSEN!
    // w-64 (256px) auf dem Handy, w-80 (320px) auf dem PC!
    adImg.className = "w-64 h-64 sm:w-80 sm:h-80 object-contain transform transition-transform duration-500 hover:scale-110 z-10";
    
    // Auch der Header bekommt seine Höhe per Tailwind ZURÜCK (h-80 auf Handy, h-96 auf PC)
    headerBg.className = "relative h-80 sm:h-96 shrink-0 flex items-center justify-center p-6 text-center overflow-hidden transition-colors duration-500";

    if (ach.isUnlocked) {
        // FREIGESCHALTET: Edler, dunkler Museums-Hintergrund & fetter 3D-Schatten
        headerBg.classList.add("bg-gradient-to-br", "from-slate-800", "via-slate-900", "to-black");
        adImg.style.filter = "drop-shadow(0 25px 35px rgba(0,0,0,0.7))"; // Nur Schatten
        
        const bar = document.getElementById('ad-progress-bar');
        if (bar) bar.className = `absolute top-0 left-0 h-full transition-all duration-1000 ease-out ${ach.category === 'co2_total' ? 'bg-red-500' : 'bg-indigo-500'}`;
        shine.classList.remove('hidden');

        // ✨ Animation: Licht-Reflexion
        shine.style.transition = 'none';
        shine.style.transform = 'translateX(-100%) skewX(-12deg)';
        setTimeout(() => {
            shine.style.transition = 'transform 1.5s ease-in-out';
            shine.style.transform = 'translateX(200%) skewX(-12deg)';
        }, 100);

    } else {
        // GESPERRT: Düster, mysteriös und Bild in Graustufen
        headerBg.classList.add("bg-gradient-to-br", "from-gray-800", "via-gray-900", "to-black");
        adImg.style.filter = "drop-shadow(0 20px 30px rgba(0,0,0,0.8)) grayscale(100%) brightness(0.4) opacity(0.8)"; // Schatten + Grau + Dunkel
        
        const bar = document.getElementById('ad-progress-bar');
        if (bar) bar.className = "absolute top-0 left-0 h-full bg-gray-500 transition-all duration-1000 ease-out";
        shine.classList.add('hidden');
    }

    // 6. Navigation (Pfeile & Swipe)
    const prevBtn = document.getElementById('ad-prev-btn');
    const nextBtn = document.getElementById('ad-next-btn');
    const isNativeApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

    if (isNativeApp) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    } else {
        if (prevBtn) {
            if (currentIndex > 0) {
                prevBtn.style.display = 'flex';
                prevBtn.onclick = () => switchAchievementCard(currentIndex - 1, 'right');
            } else { prevBtn.style.display = 'none'; }
        }
        if (nextBtn) {
            if (currentIndex < window.currentSwipeAchievements.length - 1) {
                nextBtn.style.display = 'flex';
                nextBtn.onclick = () => switchAchievementCard(currentIndex + 1, 'left');
            } else { nextBtn.style.display = 'none'; }
        }
    }

    // Touch-Event (Swipe)
    const modalContent = document.getElementById('ad-modal-content');
    if (modalContent && !modalContent.dataset.swipeBound) {
        let touchstartX = 0; let touchstartY = 0;
        modalContent.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
            touchstartY = e.changedTouches[0].screenY;
        }, {passive: true});
        modalContent.addEventListener('touchend', e => {
            const deltaX = e.changedTouches[0].screenX - touchstartX;
            const deltaY = e.changedTouches[0].screenY - touchstartY;
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
                if (deltaX < 0 && window.currentSwipeAchievementIndex < window.currentSwipeAchievements.length - 1) {
                    switchAchievementCard(window.currentSwipeAchievementIndex + 1, 'left');
                } else if (deltaX > 0 && window.currentSwipeAchievementIndex > 0) {
                    switchAchievementCard(window.currentSwipeAchievementIndex - 1, 'right');
                }
            }
        }, {passive: true});
        modalContent.dataset.swipeBound = 'true';
    }

    // 7. Modal anzeigen
    const modal = document.getElementById('achievement-details-modal');
    modal.classList.remove('hidden');
    if (!isSwitching) {
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
        }, 10);
    }
};

// =================================================================
// USER PROFILE LOGIC (Leaderboard & Account)
// =================================================================

window.loadUserProfile = async function(user) {
    if (!user) return;
    
    // 1. Account Details (Email & Version) ins Profil-Tab eintragen
    document.getElementById('profile-email-display').textContent = user.email;

    // 2. Pro-Status Buttons im Profil-Tab updaten
    const badge = document.getElementById('profile-status-badge');
    const upgBtn = document.getElementById('profile-upgrade-btn');
    const manBtn = document.getElementById('profile-manage-btn');
    
    if (currentUserSubscription === "pro") {
        badge.textContent = "PRO";
        badge.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800";
        if(upgBtn) upgBtn.classList.add('hidden');
        if(manBtn) manBtn.classList.remove('hidden');
    } else {
        badge.textContent = "FREE";
        badge.className = "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-600";
        if(upgBtn) upgBtn.classList.remove('hidden');
        if(manBtn) manBtn.classList.add('hidden');
    }

    // 3. Leaderboard-Daten aus Supabase laden
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle(); // maybeSingle verhindert Fehler, falls noch kein Profil existiert

        if (error && error.code !== 'PGRST116') throw error;

        if (data) {
            document.getElementById('profile-username').value = data.username || "";
            document.getElementById('profile-is-public').checked = data.is_public || false;
            // 🚀 NEU: Avatar laden (falls vorhanden)
            if (data.avatar_url) {
                document.getElementById('profile-avatar').value = data.avatar_url;
            }
        }
    } catch (err) {
        console.error("Fehler beim Laden des Profils:", err);
    }
};

window.saveUserProfile = async function() {
    // Demo Check
    if (typeof isDemoMode !== 'undefined' && isDemoMode) {
        showMessage(getTranslation("demo.demoModus") || "Demo-Modus", getTranslation("profile.demoSaveError") || "Im Demo-Modus können keine Profile gespeichert werden.", "info");
        return;
    }

    const btn = document.getElementById('btn-save-profile');
    const originalText = btn.textContent;
    btn.textContent = getTranslation("profile.saveLoading") || "Speichere...";
    btn.disabled = true;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Nicht eingeloggt.");

        const username = document.getElementById('profile-username').value.trim();
        const isPublic = document.getElementById('profile-is-public').checked;
        const avatarUrl = document.getElementById('profile-avatar').value; // 🚀 NEU

        if (isPublic && username.length < 3) {
            showMessage(getTranslation("toast.infoTitle") || "Hinweis", getTranslation("profile.nickTooShort") || "Dein Nickname muss mindestens 3 Zeichen lang sein, um teilzunehmen.", "info");
            btn.textContent = originalText;
            btn.disabled = false;
            return;
        }

        // Upsert (Update falls vorhanden, sonst Insert)
        const { error } = await supabaseClient
            .from('profiles')
            .upsert({ 
                id: user.id, 
                username: username, 
                is_public: isPublic,
                avatar_url: avatarUrl // 🚀 NEU: Avatar mit in die DB schreiben!
            });

        if (error) {
            if (error.code === '23505') {
                showMessage(getTranslation("profile.nickTakenTitle") || "Name vergeben", getTranslation("profile.nickTakenDesc") || "Dieser Nickname ist leider schon vergeben. Bitte wähle einen anderen.", "error");
            } else {
                throw error;
            }
        } else {
            showMessage(getTranslation("toast.successTitle") || "Erfolg", getTranslation("profile.saveSuccess") || "Profil erfolgreich gespeichert!", "success");
        }
    } catch (err) {
        console.error("Profil speichern Fehler:", err);
        showMessage(getTranslation("toast.errorTitle") || "Fehler", getTranslation("profile.saveError") || "Profil konnte nicht gespeichert werden.", "error");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
};

// ====== FREUNDE EINLADEN (LINK GENERIEREN) ======
window.shareInviteLink = async function() {
    if (typeof isDemoMode !== 'undefined' && isDemoMode) {
        showMessage(getTranslation("toast.infoTitle") || "Hinweis", getTranslation("profile.demoTabDisabled") || "Im Demo-Modus nicht verfügbar.", "info");
        return;
    }

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Nicht eingeloggt");

        // 🚀 FIX 1: Wir zwingen die App, immer die echte Live-URL zu nutzen!
        // (Bitte prüfe, ob aviosphere.com deine korrekte Domain ist)
        const baseUrl = 'https://aviosphere.com/'; 
        const inviteUrl = `${baseUrl}?invite=${user.id}`;

        const shareTitle = 'AvioSphere';
        const shareText = getTranslation("leaderboard.shareText") || 'Lass uns unsere Flüge vergleichen! Füge mich auf AvioSphere hinzu:';

        // 🚀 FIX 2: Das native Teilen-Menü für Handys (WhatsApp, Mail etc.)
        const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

        if (isNative && Capacitor.Plugins.Share) {
            // Öffnet das echte, native Teilen-Menü (Slide-Up) am Smartphone
            await Capacitor.Plugins.Share.share({
                title: shareTitle,
                text: shareText,
                url: inviteUrl,
                dialogTitle: 'AvioSphere Einladung'
            });
        } else if (navigator.share) {
            // Fallback für moderne PC-Browser (Mac/Windows Teilen-Menü)
            await navigator.share({
                title: shareTitle,
                text: shareText,
                url: inviteUrl
            });
        } else {
            // Letzter Fallback für alte Browser am PC: Zwischenablage
            await navigator.clipboard.writeText(inviteUrl);
            showMessage("URL Kopiert", getTranslation("leaderboard.linkCopied") || "Einladungslink in die Zwischenablage kopiert!", "success");
        }
    } catch (err) {
        console.warn("Teilen abgebrochen oder fehlgeschlagen:", err);
    }
};

// ====== FREUNDSCHAFTSANFRAGE VERARBEITEN ======
window.handleFriendInvite = async function(friendId, myId) {
    if (typeof isDemoMode !== 'undefined' && isDemoMode) return;
    
    try {
        // 🚀 NEU: 1. Sicherheits-Check! Existiert mein eigenes Profil schon? 
        // Falls nicht, legen wir lautlos ein leeres "Schatten-Profil" an, damit die Datenbank glücklich ist.
        const { data: myProfile } = await supabaseClient.from('profiles').select('id').eq('id', myId).maybeSingle();
        if (!myProfile) {
            await supabaseClient.from('profiles').insert({ id: myId, is_public: false });
        }

        // 2. Name des Freundes laden, um ihn im Dialog anzuzeigen
        const { data: friendProfile } = await supabaseClient
            .from('profiles')
            .select('username')
            .eq('id', friendId)
            .maybeSingle();
            
        const friendName = friendProfile?.username || "Ein Pilot";
        const confirmMsg = (getTranslation("leaderboard.inviteConfirm") || "{name} möchte sich mit dir auf AvioSphere verbinden. Akzeptieren?").replace('{name}', friendName);

        // 3. Nutzer fragen
        if (window.confirm(confirmMsg)) {
            // Wir speichern die Freundschaft bidirektional
            const { error } = await supabaseClient.from('friendships').insert([
                { user_id_1: myId, user_id_2: friendId, status: 'accepted' },
                { user_id_1: friendId, user_id_2: myId, status: 'accepted' }
            ]);

            if (error) {
                if (error.code === '23505') { 
                    // UNIQUE Error: Die beiden sind schon befreundet
                    showMessage(getTranslation("toast.infoTitle") || "Hinweis", getTranslation("leaderboard.alreadyFriends") || "Ihr seid bereits verbunden!", "info");
                } else if (error.code === '23503') {
                    // 🚀 NEU: Foreign Key Error abfangen (Der Freund hat sein Profil gelöscht oder nie eins angelegt)
                    showMessage(getTranslation("toast.errorTitle") || "Fehler", getTranslation("leaderboard.noProfileError") || "Der einladende Pilot hat sein Profil noch nicht fertig eingerichtet.", "error");
                } else {
                    throw error;
                }
            } else {
                showMessage(getTranslation("toast.successTitle") || "Erfolg", getTranslation("leaderboard.inviteSuccess") || "Freund erfolgreich hinzugefügt!", "success");
            }
        }
    } catch (err) {
        console.error("Fehler bei Freundschaftsanfrage:", err);
        showMessage(getTranslation("toast.errorTitle") || "Fehler", "Einladung konnte nicht verarbeitet werden.", "error");
    }
};

// =================================================================
// AVIOSPHERE WRAPPED (JAHRESRÜCKBLICK)
// =================================================================

let currentWrappedSlide = 0;
let wrappedSlides = [];
let wrappedTimer = null;
const WRAPPED_SLIDE_DURATION = 5000; // 5 Sekunden pro Folie

// 🚀 Der smarte Türsteher, der die Jahre analysiert (Jetzt mit i18n)
window.initWrapped = async function() {
    const allFlights = typeof isDemoMode !== 'undefined' && isDemoMode && typeof flights !== 'undefined' ? flights : await getFlights();
    
    if (!allFlights || allFlights.length === 0) {
        showMessage(getTranslation("wrapped.noFlightsTitle") || "Schade!", getTranslation("wrapped.noFlightsGeneral") || "Du hast noch keine Flüge eingetragen.", "info");
        return;
    }

    const years = [...new Set(allFlights.filter(f => f.date).map(f => f.date.substring(0, 4)))].sort((a, b) => b - a);

    if (years.length === 0) {
        showMessage(getTranslation("wrapped.errorTitle") || "Fehler", getTranslation("wrapped.noValidDates") || "Keine gültigen Flugdaten mit Datum gefunden.", "error");
        return;
    }

    if (years.length === 1) {
        startWrapped(years[0]);
    } else {
        document.getElementById("info-modal-title").textContent = getTranslation("wrapped.selectYear") || "Wähle ein Jahr";
        
        let html = '<div class="space-y-3 mt-4">';
        years.forEach(year => {
            const btnText = (getTranslation("wrapped.reviewBtn") || "✨ Rückblick {year}").replace('{year}', year);
            html += `
                <button onclick="closeInfoModal(); startWrapped('${year}')" class="w-full p-4 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800 rounded-xl text-center font-black text-indigo-700 dark:text-indigo-400 transition transform hover:scale-105 shadow-sm">
                    ${btnText}
                </button>
            `;
        });
        html += '</div>';
        
        document.getElementById("info-modal-content").innerHTML = html;
        if (typeof openInfoModal === 'function') openInfoModal();
    }
};

// 🚀 startWrapped ist jetzt komplett übersetzbar!
window.startWrapped = async function(year) {
    const allFlights = typeof isDemoMode !== 'undefined' && isDemoMode && typeof flights !== 'undefined' ? flights : await getFlights();
    const flightsToProcess = allFlights.filter(f => f.date && f.date.startsWith(year.toString()));

    if (flightsToProcess.length === 0) {
        showMessage(getTranslation("wrapped.noFlightsTitle") || "Schade!", (getTranslation("wrapped.noFlightsYear") || "Du hast {year} noch keine Flüge eingetragen.").replace('{year}', year), "info");
        return;
    }

    let totalDistance = 0;
    let totalMinutes = 0;
    let airlines = {};
    let aircrafts = {};

    flightsToProcess.forEach(f => {
        totalDistance += (f.distance || 0);
        if (typeof parseFlightTimeToMinutes === 'function') {
            totalMinutes += parseFlightTimeToMinutes(f.time, f.distance);
        }
        if (f.airline) airlines[f.airline] = (airlines[f.airline] || 0) + 1;
        if (f.aircraftType) aircrafts[f.aircraftType] = (aircrafts[f.aircraftType] || 0) + 1;
    });

    const unknownTxt = getTranslation("wrapped.unknown") || "Unbekannt";
    const topAirline = Object.keys(airlines).sort((a, b) => airlines[b] - airlines[a])[0] || unknownTxt;
    const topAircraft = Object.keys(aircrafts).sort((a, b) => aircrafts[b] - aircrafts[a])[0] || unknownTxt;
    const earthCircumnavigations = (totalDistance / 40075).toFixed(1);
    const hoursInAir = Math.round(totalMinutes / 60);

    // --- ALLE ÜBERSETZUNGEN LADEN ---
    const slide1Subtitle = getTranslation("wrapped.slide1Subtitle") || "Dein Jahr über den Wolken";
    const slide2Title = getTranslation("wrapped.slide2Title") || "Zurückgelegte Distanz";
    const slide2Desc = (getTranslation("wrapped.slide2Desc") || "Das ist <span class=\"font-bold text-white\">{x}x</span> um die Erde!").replace('{x}', earthCircumnavigations);
    const slide3Title = getTranslation("wrapped.slide3Title") || "Zeit im Himmel";
    const slide3Desc = (getTranslation("wrapped.slide3Desc") || "Wahnsinn! Du bist in diesem Jahr insgesamt <span class=\"font-bold text-white\">{x}</span> mal abgehoben.").replace('{x}', flightsToProcess.length);
    const slide4Title = getTranslation("wrapped.slide4Title") || "Deine Favoriten";
    const slide4TopAirline = getTranslation("wrapped.slide4TopAirline") || "Top Airline";
    const slide4TopAircraft = getTranslation("wrapped.slide4TopAircraft") || "Treuester Begleiter";
    
    const shareFlights = getTranslation("wrapped.shareFlights") || "Flüge";
    const shareDistance = getTranslation("wrapped.shareDistance") || "Distanz";
    const shareDuration = getTranslation("wrapped.shareDuration") || "Dauer";
    const shareTopAircraft = getTranslation("wrapped.shareTopAircraft") || "Top Flugzeug";

    wrappedSlides = [
        {
            bg: "from-indigo-900 to-purple-900",
            html: `
                <div class="animate-bounce mb-6 text-6xl">🚀</div>
                <h2 class="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-2">${year}</h2>
                <p class="text-2xl font-bold text-indigo-100">${slide1Subtitle}</p>
            `
        },
        {
            bg: "from-blue-900 to-teal-900",
            html: `
                <div class="text-6xl mb-6 transform transition-transform duration-1000 scale-110">🌍</div>
                <p class="text-lg text-teal-200 uppercase tracking-widest font-bold mb-2">${slide2Title}</p>
                <h3 class="text-5xl font-black text-white mb-4">${totalDistance.toLocaleString()} km</h3>
                <p class="text-xl text-teal-100">${slide2Desc}</p>
            `
        },
        {
            bg: "from-purple-900 to-pink-900",
            html: `
                <div class="text-6xl mb-6">⏱️</div>
                <p class="text-lg text-pink-200 uppercase tracking-widest font-bold mb-2">${slide3Title}</p>
                <h3 class="text-5xl font-black text-white mb-4">${hoursInAir} h</h3>
                <p class="text-xl text-pink-100">${slide3Desc}</p>
            `
        },
        {
            bg: "from-orange-900 to-red-900",
            html: `
                <div class="text-6xl mb-6">🏆</div>
                <p class="text-lg text-orange-200 uppercase tracking-widest font-bold mb-6">${slide4Title}</p>
                <div class="w-full max-w-sm bg-black/20 rounded-2xl p-6 backdrop-blur-sm text-left border border-white/10 space-y-4">
                    <div>
                        <p class="text-xs text-orange-300 uppercase">${slide4TopAirline}</p>
                        <p class="text-2xl font-bold text-white">${topAirline}</p>
                    </div>
                    <div>
                        <p class="text-xs text-orange-300 uppercase">${slide4TopAircraft}</p>
                        <p class="text-2xl font-bold text-white">${topAircraft}</p>
                    </div>
                </div>
            `
        },
        {
            bg: "from-gray-900 to-black",
            isShareScreen: true,
            stats: `
                <div class="flex justify-between items-center border-b border-white/10 pb-2">
                    <span class="text-gray-400">${shareFlights}</span>
                    <span class="text-xl font-bold text-white">${flightsToProcess.length}</span>
                </div>
                <div class="flex justify-between items-center border-b border-white/10 pb-2 pt-2">
                    <span class="text-gray-400">${shareDistance}</span>
                    <span class="text-xl font-bold text-white">${totalDistance.toLocaleString()} km</span>
                </div>
                <div class="flex justify-between items-center border-b border-white/10 pb-2 pt-2">
                    <span class="text-gray-400">${shareDuration}</span>
                    <span class="text-xl font-bold text-white">${hoursInAir} h</span>
                </div>
                <div class="flex justify-between items-center pt-2">
                    <span class="text-gray-400">${shareTopAircraft}</span>
                    <span class="text-lg font-bold text-white text-right">${topAircraft}</span>
                </div>
            `
        }
    ];

    currentWrappedSlide = 0;
    
    const usernameEl = document.getElementById('profile-username');
    document.getElementById('wrapped-share-user').textContent = usernameEl && usernameEl.value ? usernameEl.value : (getTranslation("wrapped.defaultPilot") || "AvioSphere Pilot");
    document.getElementById('wrapped-share-title').textContent = year;

    const progressContainer = document.getElementById('wrapped-progress-container');
    progressContainer.innerHTML = '';
    wrappedSlides.forEach((_, index) => {
        progressContainer.innerHTML += `
            <div class="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                <div id="wrapped-bar-${index}" class="h-full bg-white w-0 transition-all ease-linear"></div>
            </div>
        `;
    });

    document.getElementById('wrapped-overlay').classList.remove('hidden');
    document.getElementById('wrapped-overlay').classList.add('flex');
    
    renderWrappedSlide();
};

window.renderWrappedSlide = function() {
    clearTimeout(wrappedTimer);
    const slide = wrappedSlides[currentWrappedSlide];
    
    // Hintergrund wechseln
    const bgEl = document.getElementById('wrapped-bg');
    bgEl.className = `absolute inset-0 opacity-80 transition-colors duration-1000 bg-gradient-to-br ${slide.bg}`;

    // Balken updaten (vorherige voll, aktuelle wächst, nächste leer)
    wrappedSlides.forEach((_, index) => {
        const bar = document.getElementById(`wrapped-bar-${index}`);
        if(!bar) return;
        bar.style.transitionDuration = '0ms'; // Reset
        
        if (index < currentWrappedSlide) {
            bar.style.width = '100%';
        } else if (index > currentWrappedSlide) {
            bar.style.width = '0%';
        } else {
            bar.style.width = '0%';
            // Kurzer Delay, damit der Browser den CSS-Reset schluckt
            setTimeout(() => {
                bar.style.transitionDuration = `${WRAPPED_SLIDE_DURATION}ms`;
                bar.style.width = '100%';
            }, 50);
        }
    });

    // Content anzeigen
    const contentEl = document.getElementById('wrapped-content');
    const shareScreen = document.getElementById('wrapped-share-screen');
    
    if (slide.isShareScreen) {
        contentEl.classList.add('hidden');
        shareScreen.classList.remove('hidden');
        shareScreen.classList.add('flex');
        document.getElementById('wrapped-share-stats').innerHTML = slide.stats;
        // Keine automatische Weiterleitung auf der letzten Folie!
    } else {
        shareScreen.classList.add('hidden');
        shareScreen.classList.remove('flex');
        contentEl.classList.remove('hidden');
        
        // Kleine Fade-In Animation für den Text
        contentEl.style.opacity = '0';
        contentEl.innerHTML = slide.html;
        setTimeout(() => contentEl.style.opacity = '1', 100);

        // Nächster Slide nach X Sekunden
        wrappedTimer = setTimeout(() => {
            nextWrappedSlide();
        }, WRAPPED_SLIDE_DURATION);
    }
};

window.nextWrappedSlide = function() {
    if (currentWrappedSlide < wrappedSlides.length - 1) {
        currentWrappedSlide++;
        renderWrappedSlide();
    }
};

window.prevWrappedSlide = function() {
    if (currentWrappedSlide > 0) {
        currentWrappedSlide--;
        renderWrappedSlide();
    }
};

window.closeWrapped = function() {
    clearTimeout(wrappedTimer);
    document.getElementById('wrapped-overlay').classList.add('hidden');
    document.getElementById('wrapped-overlay').classList.remove('flex');
};

window.shareWrappedImage = async function() {
    const shareCard = document.getElementById('wrapped-share-card');
    if (!shareCard) return;

    // Optional: Lade-Meldung anzeigen
    if (typeof showMessage === 'function') {
        showMessage(getTranslation("share.prepTitle") || "Moment...", getTranslation("share.prepDesc") || "Bild wird aufbereitet 📸", "info");
    }

    try {
        // Wir geben html2canvas einen dunklen Hintergrund mit (#111827 = Tailwind gray-900), 
        // da die Kachel selbst halbtransparent ist und sonst auf weißen Hintergründen 
        // (z.B. in der WhatsApp-Vorschau) unleserlich wäre!
        const canvas = await html2canvas(shareCard, {
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#111827', 
            scale: window.innerWidth < 768 ? 2 : 3 // Extra scharf für Instagram/WhatsApp
        });

        // Capacitor (Handy) mag JPG lieber (kleinere Datei), PC nutzt PNG
        const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
        const dataURL = isNative 
            ? canvas.toDataURL("image/jpeg", 0.9) 
            : canvas.toDataURL("image/png");
        
        // Aufruf unserer bewährten zentralen Teilen-Funktion aus der ui.js
        if (typeof shareImageBase64 === 'function') {
            await shareImageBase64(dataURL, "aviosphere_wrapped");
        }

    } catch (e) {
        console.error("Wrapped Screenshot Fehler:", e);
        if (typeof showMessage === 'function') {
            showMessage(getTranslation("toast.errorTitle") || "Fehler", "Konnte Bild nicht erstellen.", "error");
        }
    }
};

// --- LOGIK FÜR DAS APP INSTALL OVERLAY ---

window.goToStore = function() {
    window.location.href = window.currentStoreLink;
};

window.continueInBrowser = function() {
    // 🚀 NEU: Overlay für diese Session deaktivieren, damit es nach dem Login nicht nochmal kommt!
    sessionStorage.setItem('inviteOverlayShown', 'true');
    
    // Overlay schließen
    const overlay = document.getElementById('invite-install-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    
    // Web-Logik ausführen
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');
    if (inviteId) {
        processWebInvite(inviteId);
    }
};

window.processWebInvite = async function(inviteId) {
    try {
        const { data: userData } = await supabaseClient.auth.getUser();
        if (userData && userData.user && userData.user.id !== inviteId) {
            // Wenn eingeloggt, normalen Freundes-Dialog aufrufen!
            if (typeof handleFriendInvite === 'function') {
                handleFriendInvite(inviteId, userData.user.id);
            }
        } else if (!userData || !userData.user) {
            // Wenn NICHT eingeloggt im Browser:
            if (typeof showMessage === 'function') {
                showMessage(
                    getTranslation("toast.infoTitle") || "Hinweis", 
                    getTranslation("invite.loginFirst") || "Bitte logge dich in der Web-Version ein, um die Einladung anzunehmen.", 
                    "info"
                );
            }
        }
    } catch (e) {
        console.error("Web Invite Fehler:", e);
    }
};

// =================================================================
// LIVE FLIGHT WIDGET (TRAVEL MODE)
// =================================================================

window.dismissLivePromo = function() {
    document.getElementById('live-flight-promo').style.display = 'none';
    localStorage.setItem('hideLivePromo', 'true');
};

// Globale Variablen für den Travel Mode
window.todaysLiveFlights = [];
window.currentLiveFlightIndex = 0;

window.initLiveWidget = async function() {
    const promo = document.getElementById('live-flight-promo');
    if (promo && localStorage.getItem('hideLivePromo') !== 'true') {
        promo.classList.remove('hidden');
    }

    const allFlights = typeof isDemoMode !== 'undefined' && isDemoMode && typeof flights !== 'undefined' ? flights : await getFlights();
    if (!allFlights || allFlights.length === 0) return;

    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    // 🚀 NEU: Alle Flüge von heute filtern und nach Eingabe-Reihenfolge (Chronologisch) sortieren
    window.todaysLiveFlights = allFlights
        .filter(f => f.date === todayStr)
        .sort((a, b) => {
            // Wir sortieren aufsteigend nach der internen ID (Erstellungszeitpunkt)
            const idA = a.flightLogNumber || a.flight_id || a.id || 0;
            const idB = b.flightLogNumber || b.flight_id || b.id || 0;
            return idA - idB; 
        });
    const widget = document.getElementById('live-flight-widget');

    if (window.todaysLiveFlights.length > 0) {
        if (window.currentLiveFlightIndex >= window.todaysLiveFlights.length) {
            window.currentLiveFlightIndex = 0; // Reset, falls ein Flug gelöscht wurde
        }
        renderCurrentLiveFlight();
        widget.classList.remove('hidden');
    } else {
        widget.classList.add('hidden');
    }
};

window.renderCurrentLiveFlight = function() {
    const flight = window.todaysLiveFlights[window.currentLiveFlightIndex];
    window.currentLiveFlight = flight; 

    // Basis-Daten eintragen
    document.getElementById('live-dep-iata').textContent = flight.departure || "???";
    document.getElementById('live-arr-iata').textContent = flight.arrival || "???";
    document.getElementById('live-flight-number').textContent = flight.flightNumber || flight.flightLogNumber || "Unbekannt";
    
    // 🚀 FIX 1: Unbekannte Airline übersetzen (mit Live-Update Support)
    const airlineEl = document.getElementById('live-airline-name');
    if (flight.airline && flight.airline.trim() !== "") {
        airlineEl.removeAttribute('data-i18n'); // Echter Airline-Name -> nicht übersetzen!
        airlineEl.textContent = flight.airline;
    } else {
        airlineEl.setAttribute('data-i18n', 'live.unknownAirline'); // Markierung für den Sprachwechsler setzen!
        airlineEl.textContent = getTranslation("live.unknownAirline") || "Unbekannte Airline";
    }

    // 🚀 FIX 2: Flugdauer formatieren (Universal 'h' und 'm')
    let durationStr = flight.time || "-";
    durationStr = durationStr.replace(/Std\.?/g, 'h').replace(/Min\.?/g, 'm').replace(/\s+/g, ' ');
    document.getElementById('live-flight-duration').textContent = durationStr;

    const logoEl = document.getElementById('live-airline-logo');
    if (flight.airline_logo) {
        logoEl.src = flight.airline_logo;
        logoEl.parentElement.classList.remove('hidden');
    } else {
        logoEl.parentElement.classList.add('hidden');
    }

    // Felder optisch resetten
    document.getElementById('live-dep-sched').textContent = "--:--";
    document.getElementById('live-dep-est').textContent = "--:--";
    document.getElementById('live-arr-sched').textContent = "--:--";
    document.getElementById('live-arr-est').textContent = "--:--";
    document.getElementById('live-dep-terminal').textContent = "-";
    document.getElementById('live-dep-gate').textContent = "-";
    document.getElementById('live-arr-terminal').textContent = "-";
    document.getElementById('live-arr-gate').textContent = "-";
    
    // 🚀 FIX 3: Gepäckband optisch resetten (mit i18n Unterstützung)
    const baggageVal = document.getElementById('live-baggage-val');
    if (baggageVal) {
        baggageVal.setAttribute('data-i18n', 'live.baggageTBD');
        baggageVal.textContent = getTranslation("live.baggageTBD") || "Wird noch ermittelt...";
    }

    // 🚀 FIX 4: Status Badge mit i18n Unterstützung
    document.getElementById('live-status-badge').innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-gray-500"></span> <span data-i18n="live.statusLoading">${getTranslation("live.statusLoading") || "LADE..."}</span>`;
    document.getElementById('live-status-badge').className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-700 shadow-sm animate-pulse";
    
    // Navigation ein/ausblenden, wenn > 1 Flug
    const nav = document.getElementById('live-flight-nav');
    if (window.todaysLiveFlights.length > 1) {
        nav.classList.remove('hidden');
        nav.classList.add('flex');
        document.getElementById('live-flight-counter').textContent = `${window.currentLiveFlightIndex + 1} / ${window.todaysLiveFlights.length}`;
    } else if (nav) {
        nav.classList.add('hidden');
        nav.classList.remove('flex');
    }

    // API sofort anfeuern
    refreshLiveFlightData();
};

window.nextLiveFlight = function() {
    if (window.currentLiveFlightIndex < window.todaysLiveFlights.length - 1) {
        window.currentLiveFlightIndex++;
        renderCurrentLiveFlight();
    }
};

window.prevLiveFlight = function() {
    if (window.currentLiveFlightIndex > 0) {
        window.currentLiveFlightIndex--;
        renderCurrentLiveFlight();
    }
};

window.refreshLiveFlightData = async function() {
    if (!window.currentLiveFlight) return;
    
    const icon = document.getElementById('live-refresh-icon');
    if (icon) icon.classList.add('animate-spin');

    try {
        const flightNum = window.currentLiveFlight.flightNumber || window.currentLiveFlight.flightLogNumber;
        const depIata = window.currentLiveFlight.departure;
        
        if (!flightNum || !depIata) throw new Error("Flugnummer oder Abflugort fehlt");

        console.log(`✈️ Starte Live-Abruf für Flug ${flightNum} ab ${depIata}...`);
        
        // Netlify Funktion aufrufen
        const response = await fetch(`${API_BASE_URL}/.netlify/functions/fetch-live-flight?dep_iata=${depIata}&flight_iata=${flightNum}`);
        
        if (!response.ok) {
            throw new Error("API Limit erreicht oder Flug nicht gefunden");
        }

        const data = await response.json();
        
        // --- 1. ZEITEN UPDATEN ---
        const extractTime = (apiStr) => {
            if (!apiStr) return null;
            const match = apiStr.match(/\b(\d{2}:\d{2})\b/);
            return match ? match[1] : null;
        };

        const depSched = extractTime(data.dep_time);
        const depEst = extractTime(data.dep_estimated || data.dep_actual);
        const arrSched = extractTime(data.arr_time);
        const arrEst = extractTime(data.arr_estimated || data.arr_actual);

        if (depSched) document.getElementById('live-dep-sched').textContent = depSched;
        if (arrSched) document.getElementById('live-arr-sched').textContent = arrSched;

        const depEstEl = document.getElementById('live-dep-est');
        const arrEstEl = document.getElementById('live-arr-est');

        depEstEl.textContent = depEst || depSched || "--:--";
        arrEstEl.textContent = arrEst || arrSched || "--:--";

        // 🚀 UPGRADE 1: Verspätungen rot markieren!
        // Zuerst Standardfarben (Indigo) setzen, falls es ein Refresh ist
        depEstEl.className = "font-black text-indigo-600 dark:text-indigo-400";
        arrEstEl.className = "font-black text-indigo-600 dark:text-indigo-400";

        // Wenn die API ein Delay von > 5 Min meldet ODER die Timestamp-Differenz > 300 Sek (5 Min) ist
        if ((data.dep_delayed && data.dep_delayed > 5) || (data.dep_estimated_ts > data.dep_time_ts + 300)) {
            depEstEl.className = "font-black text-red-600 dark:text-red-500 animate-pulse";
        }
        if ((data.arr_delayed && data.arr_delayed > 5) || (data.arr_estimated_ts > data.arr_time_ts + 300)) {
            arrEstEl.className = "font-black text-red-600 dark:text-red-500 animate-pulse";
        }

        // 🚀 UPGRADE 2: Exakte Flugdauer aus der API nutzen (überschreibt die geschätzte Zeit)
        if (data.duration && !isNaN(data.duration)) {
            const h = Math.floor(data.duration / 60);
            const m = data.duration % 60;
            document.getElementById('live-flight-duration').textContent = `${h}h ${m}m`;
        }

        // --- 2. GATES & TERMINALS & GEPÄCK ---
        document.getElementById('live-dep-terminal').textContent = data.dep_terminal || "-";
        document.getElementById('live-dep-gate').textContent = data.dep_gate || "-";
        document.getElementById('live-arr-terminal').textContent = data.arr_terminal || "-";
        document.getElementById('live-arr-gate').textContent = data.arr_gate || "-";
        
        // 🚀 FIX 3 (Fortsetzung): Gepäckband mit i18n Unterstützung updaten
        const baggageVal = document.getElementById('live-baggage-val');
        if (baggageVal) {
            if(data.arr_baggage) {
                baggageVal.removeAttribute('data-i18n'); // Attribut entfernen, damit das echte Gate nicht überschrieben wird
                baggageVal.textContent = data.arr_baggage;
            } else {
                baggageVal.setAttribute('data-i18n', 'live.baggageTBD');
                baggageVal.textContent = getTranslation("live.baggageTBD") || "Wird noch ermittelt...";
            }
        }

        // --- 3. STATUS BADGE ---
        const statusEl = document.getElementById('live-status-badge');
        const status = data.status || "scheduled";
        
        // 🚀 FIX 4 (Fortsetzung): Status Badge mit eingefügten <span> für die Live-Übersetzung!
        if (status === "active" || status === "en-route") {
            statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-blue-900"></span> <span data-i18n="live.statusAir">${getTranslation("live.statusAir") || "IN DER LUFT"}</span>`;
            statusEl.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-400 text-blue-950 shadow-sm animate-pulse";
        } else if (status === "landed") {
            statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-green-900"></span> <span data-i18n="live.statusLanded">${getTranslation("live.statusLanded") || "GELANDET"}</span>`;
            statusEl.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-400 text-green-950 shadow-sm";
        } else if (status === "cancelled") {
            statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-900"></span> <span data-i18n="live.statusCancelled">${getTranslation("live.statusCancelled") || "STORNIERT"}</span>`;
            statusEl.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-400 text-red-950 shadow-sm";
        } else {
            statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-yellow-900"></span> <span data-i18n="live.statusScheduled">${getTranslation("live.statusScheduled") || "GEPLANT"}</span>`;
            statusEl.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-400 text-yellow-950 shadow-sm";
        }
        
    } catch(e) {
        console.error("Live API Fehler:", e);
        const statusEl = document.getElementById('live-status-badge');
        statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-gray-600"></span> <span data-i18n="live.statusOffline">${getTranslation("live.statusOffline") || "OFFLINE"}</span>`;
        statusEl.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-700 shadow-sm";
    } finally {
        if (icon) icon.classList.remove('animate-spin');
    }
};