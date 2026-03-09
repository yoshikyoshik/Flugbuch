// =================================================================
// MAIN APP LOGIC
// =================================================================

let isDemoMode = false; // Neue Flagge

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
      let performDbCorrection = false; // Merker, ob wir die DB reparieren müssen

      // 1. Prüfen, ob "pro" flag gesetzt ist
      if (meta.subscription_status === "pro") {
        
        // 2. Zeit-Check: Gibt es ein Ablaufdatum?
        if (meta.subscription_end) {
          currentSubscriptionEnd = Number(meta.subscription_end); // Sicherstellen, dass es eine Zahl ist
          const nowInSeconds = Math.floor(Date.now() / 1000);

          // 30 Sekunden Kulanz
          if (currentSubscriptionEnd > (nowInSeconds - 30)) {
            // Datum liegt in der Zukunft -> GÜLTIG
            isPro = true;
            console.log("Status: PRO (Gültig bis " + new Date(currentSubscriptionEnd * 1000).toLocaleDateString() + ")");
          } else {
            // 🛑 Datum liegt in der Vergangenheit -> ABGELAUFEN
            console.warn("Status: Datum abgelaufen! Markiere für DB-Korrektur...");
            isPro = false;
            performDbCorrection = true;
          }
        } else {
          // Fall B: "Pro" steht in DB, aber KEIN Datum vorhanden
          if (meta.subscription_source === 'lifetime') {
              isPro = true;
          } else {
              // 🛑 FEHLERZUSTAND: Pro ohne Datum -> Das muss weg!
              console.warn("Status Inkonsistenz: PRO ohne Datum. Setze auf FREE.");
              isPro = false;
              performDbCorrection = true;
          }
        }
      }

      // Status global setzen
      currentUserSubscription = isPro ? "pro" : "free";
      
      // Quelle global speichern (Wichtig für ui.js!)
      window.currentUserSubscriptionSource = meta.subscription_source || null;

      // --- 🛠 DB REPARATUR DURCHFÜHREN ---
      if (performDbCorrection) {
          console.log("Führe DB-Korrektur durch (Setze Status auf FREE)...");
          // Wir warten nicht auf das Ergebnis (await), damit die UI sofort lädt
          supabaseClient.auth.updateUser({
              data: { 
                  subscription_status: 'free', 
                  subscription_end: null 
                  // Wir lassen die 'source' stehen, damit wir wissen, woher er kam,
                  // oder wir könnten sie auf null setzen. Meist ist Status 'free' genug.
              }
          });
      }
      // --- ENDE STATUS-PRÜFUNG ---

      // --- ✅ STATUS IM BURGER-MENÜ ANZEIGEN & BUTTONS SCHALTEN ---
      const statusBadge = document.getElementById("subscription-status-badge");
      const upgradeBtn = document.getElementById("menu-upgrade-btn");
      const manageBtn = document.getElementById("menu-manage-sub-btn");

      if (statusBadge) {
        // 🔥 FIX: Wir entfernen das i18n-Attribut, damit die Übersetzung das "PRO/FREE" nicht mehr überschreibt!
        statusBadge.removeAttribute("data-i18n");

        if (currentUserSubscription === "pro") {
          // PRO Design
          statusBadge.textContent = "PRO";
          statusBadge.className =
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold mt-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800";

          // Buttons umschalten
          if (upgradeBtn) upgradeBtn.classList.add("hidden");
          if (manageBtn) manageBtn.classList.remove("hidden"); // "Verwalten" zeigen
        } else {
          // FREE Design
          statusBadge.textContent = "FREE";
          statusBadge.className =
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-600";

          // Buttons umschalten
          if (upgradeBtn) {
             // ✅ KORREKTUR: Button IMMER zeigen (da wir jetzt In-App-Käufe haben)
             upgradeBtn.classList.remove("hidden");
          }
          
          if (manageBtn) manageBtn.classList.add("hidden");
        }
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
  document.getElementById("menu-logout-btn").addEventListener("click", logout);
  

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

  // 2. Wenn Verbindung wiederkommt
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
    flightToEdit.arrName
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

async function executeImport(flightsData, mode, importedTripsSource = []) {
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

    // 2. TRIPS MANAGEN
    const tripNamesFromFlights = finalFlightsToProcess.map(f => f._tempTripName).filter(n => n);
    const tripNamesFromJSON = importedTripsSource.map(t => t.name).filter(n => n);
    const uniqueTripNames = [...new Set([...tripNamesFromFlights, ...tripNamesFromJSON])];
    
    const tripNameIdMap = {};

    for (const name of uniqueTripNames) {
        // HIER IST DER FIX: .maybeSingle() statt .single()
        // Das verhindert den 406 Fehler in der Konsole, wenn der Trip noch nicht existiert.
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
                .maybeSingle(); // Auch hier sicherheitshalber maybeSingle
            
            if (newTrip) tripNameIdMap[name] = newTrip.id;
        }
    }

    // 3. FLÜGE VORBEREITEN & SÄUBERN
    const finalFlights = finalFlightsToProcess.map(f => {  // <--- Hier auch 'finalFlightsToProcess' nutzen!
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

    loadTripsIntoDropdown(); 
    allFlightsUnfiltered = await getFlights();
    renderFlights(allFlightsUnfiltered);

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

// DOMContentLoaded
document.addEventListener("DOMContentLoaded", async function () {
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
	
	// Listener für Deep Links (Rückkehr von Stripe)
    if (typeof Capacitor !== 'undefined') {
        const { App } = Capacitor.Plugins;
        App.addListener('appUrlOpen', data => {
            console.log('App geöffnet via URL:', data.url);
            if (data.url.includes('aviosphere://')) {
                // Wir sind zurück!
                // Browser Plugin schließen (falls es nicht automatisch zugeht)
                if (Capacitor.Plugins.Browser) {
                    Capacitor.Plugins.Browser.close();
                }
                // Optional: Nutzerdaten neu laden, um Pro-Status sofort zu prüfen
                initializeApp(); 
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
    const viewBadges = document.getElementById('view-achievements-badges');
    const viewRecords = document.getElementById('view-achievements-records');

    if (!btnBadges || !viewBadges) return; // Sicherheits-Check

    if (view === 'badges') {
        // Badges zeigen, Rekorde verstecken
        viewBadges.classList.remove('hidden');
        viewRecords.classList.add('hidden');
        
        // Buttons umfärben
        btnBadges.classList.add('bg-white', 'dark:bg-gray-700', 'shadow-sm');
        btnRecords.classList.remove('bg-white', 'dark:bg-gray-700', 'shadow-sm');
    } else {
        // Rekorde zeigen, Badges verstecken
        viewRecords.classList.remove('hidden');
        viewBadges.classList.add('hidden');
        
        // Buttons umfärben
        btnRecords.classList.add('bg-white', 'dark:bg-gray-700', 'shadow-sm');
        btnBadges.classList.remove('bg-white', 'dark:bg-gray-700', 'shadow-sm');
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

      // HTML für die Karte (jetzt ohne Popup-Rand, passend für den Tab)
      htmlContent += `
        <div class="bg-gray-50 dark:bg-gray-900/50 p-5 rounded-xl border border-gray-200 dark:border-gray-700">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-indigo-700 dark:text-indigo-400">🏝️ ${trip.name}</h3>
                <span class="text-sm font-semibold text-gray-500 px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-full">${tripFlights.length} ${getTranslation("stats.flights") || "Flüge"}</span>
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