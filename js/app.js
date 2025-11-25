// =================================================================
// MAIN APP LOGIC
// =================================================================

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

    if (user) {
      const userDisplay = document.getElementById("user-display");
      if (userDisplay) {
        userDisplay.textContent = user.email;
      }

      // --- ✅ NEU: STATUS-PRÜFUNG (MIT ZEIT-CHECK) ---
      const meta = user.user_metadata || {};
	  
	  // ✅ NEU: Letzte Flug-ID aus der Datenbank holen
		if (meta.last_flight_id) {
			globalLastFlightId = meta.last_flight_id;
			console.log("Letzter bearbeiteter Flug geladen:", globalLastFlightId);
		}
	  
      let isPro = false;

      // 1. Prüfen, ob überhaupt "pro" flag gesetzt ist
      if (meta.subscription_status === "pro") {
        // 2. Zeit-Check: Gibt es ein Ablaufdatum?
        if (meta.subscription_end) {
          currentSubscriptionEnd = meta.subscription_end; // ✅ NEU: Global speichern!

          const nowInSeconds = Math.floor(Date.now() / 1000); // Aktuelle Zeit in Unix-Timestamp

          if (meta.subscription_end > nowInSeconds) {
            // Datum liegt in der Zukunft -> Gültig
            isPro = true;
            console.log(
              "Status: PRO (Gültig bis " +
                new Date(meta.subscription_end * 1000).toLocaleDateString() +
                ")"
            );
          } else {
            // Datum liegt in der Vergangenheit -> Abgelaufen!
            isPro = false;
            console.warn(
              "Status: Abgelaufen am " +
                new Date(meta.subscription_end * 1000).toLocaleDateString()
            );
            // Optional: Dem Nutzer einmalig sagen, dass es vorbei ist (könnte man noch verfeinern)
          }
        } else {
          // Kein Enddatum gesetzt -> Manuell freigeschaltet oder Lifetime -> Gültig
          isPro = true;
          console.log("Status: PRO (Manuell/Lifetime)");
        }
      }

      // Ergebnis setzen
      currentUserSubscription = isPro ? "pro" : "free";
      // --- ENDE STATUS-PRÜFUNG ---

      // --- ✅ STATUS IM BURGER-MENÜ ANZEIGEN & BUTTONS SCHALTEN ---
      const statusBadge = document.getElementById("subscription-status-badge");
      const upgradeBtn = document.getElementById("menu-upgrade-btn");
      const manageBtn = document.getElementById("menu-manage-sub-btn");

      if (statusBadge) {
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
          if (upgradeBtn) upgradeBtn.classList.remove("hidden"); // "Upgrade" zeigen
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
  document
    .getElementById("burger-menu-btn")
    .addEventListener("click", toggleBurgerMenu);
  document.getElementById("menu-logout-btn").addEventListener("click", logout);
  document.getElementById("menu-theme-toggle").addEventListener("click", (e) => {
    e.preventDefault(); // Verhindert, dass die Seite nach oben springt (wegen href="#")
    toggleDarkMode();   // Schaltet Hell/Dunkel um
    toggleBurgerMenu(); // Schließt das Menü
});

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
  showTab("neue-fluege");
  renderFlights();
  displayAppVersion();
  showFirstStepsTutorial();
  updateLockVisuals();

  // --- ✅ NEU: LIVE-CHECK (Der Wächter) ---
  // Prüft alle 60 Sekunden (60000 ms), ob das Abo während der Sitzung abläuft
  setInterval(() => {
    // Wir prüfen nur, wenn der User aktuell noch PRO ist und ein Enddatum hat
    if (currentUserSubscription === "pro" && currentSubscriptionEnd) {
      const now = Math.floor(Date.now() / 1000);

      if (now > currentSubscriptionEnd) {
        console.warn(
          "Subscription expired during session! Downgrading to FREE."
        );

        // 1. Status ändern
        currentUserSubscription = "free";

        // 2. UI aktualisieren (Schlösser anbringen)
        updateLockVisuals();

        // 3. Badge und Buttons im Menü aktualisieren
        const statusBadge = document.getElementById(
          "subscription-status-badge"
        );
        const upgradeBtn = document.getElementById("menu-upgrade-btn");
        const manageBtn = document.getElementById("menu-manage-sub-btn");

        if (statusBadge) {
          statusBadge.textContent = "FREE";
          statusBadge.className =
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-600";
        }
        if (upgradeBtn) upgradeBtn.classList.remove("hidden");
        if (manageBtn) manageBtn.classList.add("hidden");

        // 4. Nutzer informieren (Toast Nachricht)
        showMessage(
          getTranslation("messages.statusUpdate"),
          getTranslation("messages.subscriptionExpired") ||
            "Dein Abo ist abgelaufen.",
          "info"
        );
      }
    }
  }, 60000); // Alle 60 Sekunden
}

// Globale Funktionen für HTML-Aufrufe
// *** Hauptfunktion (jetzt für Loggen & Aktualisieren) ***
window.logFlight = async function () {
  if (currentlyEditingFlightData !== null) {
    await updateFlight();
    return;
  }

  const logButton = document.getElementById("log-button");
  logButton.textContent = "Speichere...";
  logButton.disabled = true;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) {
    showMessage("Fehler", "Nicht eingeloggt. Bitte neu laden.", "error");
    logButton.disabled = false;
    return;
  }

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
    showMessage(
      "Fehler",
      "Mindestens ein Flughafen-Code wurde nicht gefunden.",
      "error"
    );
    logButton.textContent = "Flug loggen und speichern";
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
    airline: document.getElementById("airline").value.trim(),
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

  const { error } = await supabaseClient
    .from("flights")
    .insert(newFlightForSupabase);

  if (error) {
    showMessage(
      "Speicherfehler",
      "Der Flug konnte nicht in der Datenbank gespeichert werden.",
      "error"
    );
    console.error("Supabase Insert Error:", error);
  } else {
    showMessage(
      "Erfolg!",
      `Flug von ${departureAirport.name} nach ${arrivalAirport.name} erfolgreich geloggt.`,
      "success"
    );
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
  }
  logButton.textContent = "Flug loggen und speichern";
  logButton.disabled = true;
};

/**
 * KORRIGIERT: Speichert Änderungen, handhabt Hinzufügen UND Löschen von Fotos.
 */
async function updateFlight() {
  // 1. Auth-Check
  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    showMessage("Fehler", "Sitzung abgelaufen. Bitte neu einloggen.", "error");
    logout();
    return;
  }

  const logButton = document.getElementById("log-button");
  logButton.textContent = "Aktualisiere...";
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
        "Speicherfehler",
        "Alte Fotos konnten nicht gelöscht werden, die neuen wurden aber hinzugefügt.",
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
    showMessage(
      "Flug nicht speicherbar",
      "Mindestens ein Flughafen-Code wurde nicht gefunden.",
      "error"
    );
    logButton.textContent = "Änderungen speichern";
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

  const updatedFlightForSupabase = {
    date: document.getElementById("flightDate").value,
    departure: departureAirport.code,
    arrival: arrivalAirport.code,
    distance: Math.round(distance),
    time: estimateFlightTime(distance),
    class: document.getElementById("flightClass").value,
    co2_kg: calculatedCO2,
    flightNumber: document.getElementById("flightNumber").value.trim(),
    airline: document.getElementById("airline").value.trim(),
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
    showMessage(
      "Update-Fehler",
      "Die Änderungen konnten nicht gespeichert werden.",
      "error"
    );
    console.error("Supabase Update Error:", error);
  } else {
    showMessage(
      "Erfolg!",
      "Die Flugdaten wurden erfolgreich aktualisiert.",
      "success"
    );
	
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
  // Eine Bestätigung ist bei Löschaktionen immer eine gute Idee
  if (
    !confirm("Sind Sie sicher, dass Sie diesen Flug endgültig löschen möchten?")
  ) {
    return;
  }

  const { error } = await supabaseClient
    .from("flights")
    .delete()
    .eq("flight_id", id);

  if (error) {
    showMessage(
      "Löschfehler",
      "Der Flug konnte nicht gelöscht werden.",
      "error"
    );
    console.error("Supabase Delete Error:", error);
  } else {
    showMessage("Erfolg!", "Der Flug wurde gelöscht.", "success");
    renderFlights(); // Lade die Liste einfach neu
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
  logButton.textContent = "Flug loggen und speichern";
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
      "Fehler",
      "Der zu bearbeitende Flug wurde nicht gefunden.",
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
  logButton.textContent = "Änderungen speichern";
  document.getElementById("cancel-edit-button").classList.remove("hidden");

  updateFlightDetails(); // Berechnet Distanz/Zeit für die geladenen Flughäfen

  // Zum Formular scrollen für eine bessere User Experience
  document
    .getElementById("log-button")
    .scrollIntoView({ behavior: "smooth", block: "center" });
};

/**
 * Wendet die in der Filterleiste eingegebenen Kriterien an und rendert die Ergebnisliste neu.
 */
window.applyFilters = async function () {
  // 'async' hinzugefügt
  currentPage = 1;
  const allFlights = await getFlights(); // 'await' hinzugefügt

  const depFilter = document
    .getElementById("filter-departure")
    .value.trim()
    .toUpperCase();
  const arrFilter = document
    .getElementById("filter-arrival")
    .value.trim()
    .toUpperCase();
  const dateFrom = document.getElementById("filter-date-from").value;
  const dateTo = document.getElementById("filter-date-to").value;

  let filteredFlights = allFlights;

  if (depFilter) {
    filteredFlights = filteredFlights.filter((flight) =>
      flight.departure.toUpperCase().includes(depFilter)
    );
  }
  if (arrFilter) {
    filteredFlights = filteredFlights.filter((flight) =>
      flight.arrival.toUpperCase().includes(arrFilter)
    );
  }
  if (dateFrom) {
    filteredFlights = filteredFlights.filter(
      (flight) => flight.date >= dateFrom
    );
  }
  if (dateTo) {
    filteredFlights = filteredFlights.filter((flight) => flight.date <= dateTo);
  }

  currentlyFilteredFlights = filteredFlights; // ✅ NEU: Filter speichern
  renderFlights(filteredFlights, null, 1); // ✅ NEU: Seite 1 erzwingen
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

window.exportData = async function (format) {
  const allFlights = await getFlights(); // Lade alle Flüge asynchron
  const stats = calculateStatistics(allFlights);
  let filename = `flugbuch_export_${new Date().toISOString().slice(0, 10)}`;
  let data, mimeType;

  if (allFlights.length === 0) {
    showMessage(
      "Export Fehler",
      "Keine Daten zum Exportieren vorhanden.",
      "error"
    );
    return;
  }

  if (format === "json") {
    // JSON-Export: Wir exportieren die Rohdaten der Flüge
    const exportObj = {
      metadata: {
        export_date: new Date().toISOString(),
        totalFlights: stats.totalCount,
        totalDistanceKm: stats.totalDistance,
      },
      flights: allFlights, // Das Array mit allen Flugobjekten
    };
    data = JSON.stringify(exportObj, null, 2);
    mimeType = "application/json";
    filename += ".json";
  } else if (format === "csv") {
    const separator = ";";
    // Definiere ALLE Spalten, die wir exportieren wollen
    const flightKeys = [
      "flightLogNumber",
      "date",
      "departure",
      "arrival",
      "distance",
      "time",
      "class",
      "flightNumber",
      "airline",
      "aircraftType",
      "price",
      "currency",
      "notes",
    ];
    const headers = flightKeys.join(separator);

    const csvRows = allFlights
      .map((flight) => {
        return flightKeys
          .map((key) => {
            let value =
              flight[key] !== undefined && flight[key] !== null
                ? String(flight[key])
                : "";
            // Werte mit Anführungszeichen umschließen, um Kommas/Semikolons im "notes"-Feld abzufangen
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(separator);
      })
      .join("\n");

    data = "\uFEFF" + headers + "\n" + csvRows; // BOM für Excel-Kompatibilität
    mimeType = "text/csv;charset=utf-8;";
    filename += ".csv";
  } else {
    return;
  }

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
    "Export erfolgreich",
    `Daten wurden als "${filename}" exportiert.`,
    "success"
  );
};

/**
 * Verarbeitet die hochgeladene JSON-Importdatei.
 */
async function handleImport(event) {
  toggleBurgerMenu();
  const file = event.target.files[0];
  if (!file) {
    return; // Abbruch, wenn keine Datei gewählt wurde
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    let importData;
    try {
      importData = JSON.parse(e.target.result);
      if (!importData.flights || !Array.isArray(importData.flights)) {
        throw new Error(
          "JSON-Datei hat nicht das erwartete Format (fehlendes 'flights'-Array)."
        );
      }
    } catch (error) {
      showMessage(
        "Import-Fehler",
        `Die Datei konnte nicht gelesen werden: ${error.message}`,
        "error"
      );
      return;
    }

    const flightCount = importData.flights.length;
    if (flightCount === 0) {
      showMessage("Import-Info", "Die JSON-Datei enthält keine Flüge.", "info");
      return;
    }

    // WICHTIGE SICHERHEITSABFRAGE
    const confirmed = confirm(
      `ACHTUNG!\n\nDu bist dabei, ${flightCount} Flüge zu importieren. \n\n'OK' klicken: ALLE deine aktuell in der Cloud gespeicherten Flüge werden gelöscht und durch die Flüge aus der Datei ersetzt.\n'Abbrechen' klicken: Der Vorgang wird abgebrochen.`
    );

    if (!confirmed) {
      showMessage(
        "Import abgebrochen",
        "Es wurden keine Daten geändert.",
        "info"
      );
      event.target.value = null; // Setzt den Datei-Input zurück
      return;
    }

    try {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (!user) {
        throw new Error("Nutzer nicht authentifiziert.");
      }

      // 1. Alle alten Flüge für diesen Nutzer löschen
      const { error: deleteError } = await supabaseClient
        .from("flights")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      // 2. Die neuen Flüge vorbereiten (alle 'id'-Felder entfernen und 'user_id' setzen)
      const flightsToInsert = importData.flights.map((flight) => {
        delete flight.id; // Entfernt die alte Supabase-ID
        return { ...flight, user_id: user.id };
      });

      // 3. Neue Flüge einfügen
      const { error: insertError } = await supabaseClient
        .from("flights")
        .insert(flightsToInsert);

      if (insertError) throw insertError;

      showMessage(
        "Import erfolgreich!",
        `${flightCount} Flüge wurden importiert. Die Ansicht wird aktualisiert.`,
        "success"
      );
      renderFlights(); // Lade die App neu
    } catch (error) {
      showMessage(
        "Import-Fehler",
        `Ein Datenbankfehler ist aufgetreten: ${error.message}`,
        "error"
      );
    } finally {
      event.target.value = null; // Setzt den Datei-Input zurück
    }
  };

  reader.readAsText(file);
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
    showMessage("Logout-Fehler", error.message, "error");
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
      "Fehler",
      "Das Passwort muss mindestens 6 Zeichen lang sein.",
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
  document.getElementById("auth-tabs").classList.remove("hidden");
  document.getElementById("password-reset-container").classList.add("hidden");
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

// DOMContentLoaded
document.addEventListener("DOMContentLoaded", async function () {
  const preferredLanguage = localStorage.getItem("preferredLanguage") || "de";
  await setLanguage(preferredLanguage);

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
        showMessage(
          "Registrierung erfolgreich!",
          "Bitte bestätige deine E-Mail-Adresse, um dich einzuloggen.",
          "success"
        );
      }
    });

  document
    .getElementById("request-reset-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("reset-email").value;
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        showMessage("Fehler", error.message, "error");
      } else {
        showMessage(
          "E-Mail gesendet",
          "Wenn ein Benutzer mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet.",
          "success"
        );
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
          "Fehler",
          "Passwort konnte nicht aktualisiert werden: " + error.message,
          "error"
        );
      } else {
        showMessage(
          "Erfolg!",
          "Dein Passwort wurde geändert. Du kannst dich jetzt einloggen.",
          "success"
        );
        backToLogin();
      }
    });
	
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
  
    // Echte-Funktion für den Kauf (Stripe)
  document.getElementById("buy-pro-btn").addEventListener("click", async () => {
    const btn = document.getElementById("buy-pro-btn");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Lade Checkout...';

    try {
        // 1. Aktuellen User holen
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Nicht eingeloggt");

        // 2. Gewählten Plan holen (selectedPlan kommt aus config/global state)
        const priceId = pricingConfig[selectedPlan].stripeProductId;

        // 3. Netlify Function aufrufen
// ✅ KORREKTUR: API_BASE_URL davor setzen
const response = await fetch(`${API_BASE_URL}/.netlify/functions/create-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        priceId: priceId,
        userId: user.id,
        userEmail: user.email
    })
});

        const result = await response.json();
        
        if (result.error) throw new Error(result.error);
        if (result.url) {
            // 4. Weiterleitung zu Stripe
            window.location.href = result.url;
        }

    } catch (error) {
        console.error("Checkout Fehler:", error);
        showMessage("Fehler", "Konnte Checkout nicht starten.", "error");
        btn.disabled = false;
        btn.innerHTML = originalText;
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
      showMessage(
        "Willkommen zurück!",
        "Bitte gib jetzt dein neues Passwort ein.",
        "info"
      );
    } else if (session) {
      // Dieser Block wird bei INITIAL_SESSION (Seitenaufruf im eingeloggten Zustand)
      // UND bei SIGNED_IN (direkt nach dem Login) ausgeführt.
      await initializeApp();
    } else {
      // Dieser Block wird bei SIGNED_OUT ausgeführt.
      showAuth();
    }
  });
});
