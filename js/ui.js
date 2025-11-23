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
  toast.className = `toast ${typeClass}`;
  toast.innerHTML = `<strong class="block">${title}</strong> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

// MODALS
function openInfoModal() {
  document.getElementById("info-modal").classList.remove("hidden");
  document.getElementById("info-modal").classList.add("flex");
}
function closeInfoModal() {
  document.getElementById("info-modal").classList.add("hidden");
  document.getElementById("info-modal").classList.remove("flex");
  document.getElementById("info-modal-title").textContent = "Lade...";
  document.getElementById("info-modal-content").innerHTML =
    "<p>Lade Details...</p>";
}

function openPremiumModal(featureKey = null) {
  const modal = document.getElementById("premium-modal");
  const imgContainer = document.getElementById("premium-modal-image-container");
  const imgElement = document.getElementById("premium-modal-image");
  const titleElement = document.getElementById("modal-title");
  let titleText = getTranslation("premium.title") || "Unlock Full Potential 🚀";

  if (featureKey && premiumFeatureImages[featureKey]) {
    imgElement.src = premiumFeatureImages[featureKey];
    imgContainer.classList.remove("hidden");
    if (featureKey === "globe") titleText = "Entdecke den 3D Globus 🌍";
    if (featureKey === "print") titleText = "Erstelle dein Logbuch als PDF 📚";
  } else {
    imgContainer.classList.add("hidden");
  }
  if (titleElement) titleElement.textContent = titleText;
  modal.classList.remove("hidden");
  switchPlan("yearly");
}
function closePremiumModal() {
  document.getElementById("premium-modal").classList.add("hidden");
}

// DETAILS
async function showAirportDetails(iataCode, silentCache = false) {
  const contentContainer = document.getElementById("info-modal-content");

  // ✅ NEU: Schutzabfrage für ICAO-Codes
  if (iataCode.length === 4) {
    if (!silentCache) {
      openInfoModal();
      document.getElementById("info-modal-title").textContent = getTranslation(
        "modalDetails.airportTitle"
      ).replace("{key}", iataCode);

      const cachedAirport = airportData[iataCode];
      if (cachedAirport) {
        // Zeige die Infos an, die wir aus dem Cache (von API-Ninjas) haben
        contentContainer.innerHTML = `
                        <p><strong>${getTranslation("modalDetails.airportName")}</strong> ${cachedAirport.name}</p>
                        <p><strong>${getTranslation("modalDetails.airportLocation")}</strong> ${cachedAirport.city || "N/A"}, ${cachedAirport.country_code || "N/A"}</p>
                        <p><strong>${getTranslation("modalDetails.airportCoords")}</strong> Lat: ${cachedAirport.lat}, Lng: ${cachedAirport.lon}</p>
                        <hr class="my-2 dark:border-gray-600">
                        <p class="text-xs italic">${getTranslation("logbook.icaoInfoNote")}</p>
                    `;
      } else {
        contentContainer.innerHTML = `<p>${getTranslation("modalDetails.airportNoDetails")}</p>`;
      }
    }
    return; // Beende die Funktion HIER, bevor 'fetch' aufgerufen wird.
  }
  // ✅ ENDE NEU

  if (!silentCache) {
    openInfoModal();
    document.getElementById("info-modal-title").textContent = getTranslation(
      "modalDetails.airportTitle"
    ).replace("{key}", iataCode);
    const contentContainer = document.getElementById("info-modal-content");
    contentContainer.innerHTML = `<p>${getTranslation(
      "modalDetails.loading"
    )}</p>`;
  }

  try {
    // Wir verwenden unsere GFL-Funktion
    const response = await fetch(
      `https://aesthetic-strudel-ecfe50.netlify.app/.netlify/functions/fetch-airport-details?code=${iataCode}`
    );
    if (!response.ok) {
      throw new Error("Netzwerk-Antwort war nicht OK");
    }
    const result = await response.json();

    if (result.data && result.data.length > 0) {
      const airport = result.data[0];

      // Speichere die Infos (inkl. country_code) in DB & Cache
      await cacheAndSaveAirport({
        code: iataCode,
        name: airport.name,
        lat: airport.lat,
        lon: airport.lng,
        city: airport.city,
        country_code: airport.country_code,
      });

      if (!silentCache) {
        const content = `
							<p><strong>${getTranslation("modalDetails.airportName")}</strong> ${
                airport.name
              }</p>
							<p><strong>${getTranslation("modalDetails.airportLocation")}</strong> ${
                airport.city
              }, ${airport.country_code}</p>
							<p><strong>${getTranslation("modalDetails.airportTimezone")}</strong> ${
                airport.timezone
              }</p>
							<p><strong>${getTranslation("modalDetails.airportCoords")}</strong> Lat: ${
                airport.lat
              }, Lng: ${airport.lng}</p>
							<p class="mt-2"><a href="${
                airport.website
              }" target="_blank" class="text-indigo-500 hover:underline">${getTranslation(
                "modalDetails.airportWebsite"
              )}</a></p>
						`;
        document.getElementById("info-modal-content").innerHTML = content;
      }
    } else if (!silentCache) {
      document.getElementById("info-modal-content").innerHTML =
        `<p>${getTranslation("modalDetails.airportNoDetails")}</p>`;
    }
  } catch (error) {
    console.error("Fehler beim Abrufen der Flughafen-Details:", error);
    if (!silentCache) {
      document.getElementById("info-modal-content").innerHTML =
        `<p>${getTranslation("modalDetails.airportError")}</p>`;
    }
  }
}

async function showAirlineDetails(iataCode) {
  openInfoModal();
  document.getElementById("info-modal-title").textContent = getTranslation(
    "modalDetails.airlineTitle"
  ).replace("{key}", iataCode);
  const contentContainer = document.getElementById("info-modal-content");
  contentContainer.innerHTML = `<p>${getTranslation(
    "modalDetails.loading"
  )}</p>`;

  try {
    const response = await fetch(
      `https://aesthetic-strudel-ecfe50.netlify.app/.netlify/functions/fetch-airline-details?iata_code=${iataCode}`
    );
    if (!response.ok) {
      throw new Error("Netzwerk-Antwort war nicht OK");
    }
    const result = await response.json(); // result ist { "success": true, "data": [...] }

    // --- HIER IST DIE KORREKTUR ---
    // Wir prüfen auf 'result.data', nicht 'result.response.data'
    if (result.data && result.data.length > 0) {
      let content = "";
      const notAvailable = getTranslation("modalDetails.notAvailable");

      // Die API kann mehrere Airlines zurückgeben (z.B. Lufthansa & Lufthansa Cargo)
      result.data.forEach((airline, index) => {
        if (index > 0) {
          content += '<hr class="my-4 dark:border-gray-700">';
        }

        content += `
                            <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                                <p><strong>${getTranslation(
                                  "modalDetails.airlineName"
                                )}</strong></p> 
                                <p>${airline.name || notAvailable} <strong>(${
                                  airline.iata_code || "?"
                                })</strong></p>
                                
                                <p><strong>${getTranslation(
                                  "modalDetails.airlineCountry"
                                )}</strong></p> 
                                <p>${airline.country_code || notAvailable}</p>
                                
                                <p><strong>${getTranslation(
                                  "modalDetails.airlineIcao"
                                )}</strong></p> 
                                <p>${airline.icao_code || notAvailable}</p>
                                
                                <p><strong>${getTranslation(
                                  "modalDetails.airlineCallsign"
                                )}</strong></p> 
                                <p>${airline.callsign || notAvailable}</p>

                                <p><strong>${getTranslation(
                                  "modalDetails.airlineFleetSize"
                                )}</strong></p> 
                                <p>${
                                  airline.total_aircrafts || notAvailable
                                }</p>

                                <p><strong>${getTranslation(
                                  "modalDetails.airlineFleetAge"
                                )}</strong></p> 
                                <p>${
                                  airline.average_fleet_age
                                    ? `${
                                        airline.average_fleet_age
                                      } ${getTranslation(
                                        "modalDetails.airlineAgeUnit"
                                      )}`
                                    : notAvailable
                                }</p>
                                
                                <p class="mt-2 col-span-2"><a href="https://${
                                  airline.website
                                }" target="_blank" class="text-indigo-500 hover:underline">${getTranslation(
                                  "modalDetails.airlineWebsite"
                                )}</a></p>
                            </div>
                        `;
      });

      contentContainer.innerHTML = content;
    } else {
      // Dieser Block wird jetzt nur noch ausgeführt, wenn 'result.data' leer ist
      contentContainer.innerHTML = `<p>${getTranslation(
        "modalDetails.airlineNoDetails"
      )}</p>`;
    }
  } catch (error) {
    console.error("Fehler beim Abrufen der Airline-Details:", error);
    contentContainer.innerHTML = `<p>${getTranslation(
      "modalDetails.airlineError"
    )}</p>`;
  }
}

async function showAircraftDetails(modelCode) {
  openInfoModal();
  document.getElementById("info-modal-title").textContent = getTranslation(
    "logbook.detailsTitleAircraft"
  ).replace("{key}", modelCode);
  const contentContainer = document.getElementById("info-modal-content");
  contentContainer.innerHTML = `<p>${getTranslation("modalDetails.loading")}</p>`;

  try {
    // ✅ KORREKTUR: Ruft die Netlify-Funktion mit dem Parameter "?model=..." auf
    const response = await fetch(
      `https://aesthetic-strudel-ecfe50.netlify.app/.netlify/functions/fetch-aircraft-details?model=${modelCode}`
    );
    if (!response.ok) {
      throw new Error("Netzwerk-Antwort war nicht OK");
    }
    const data = await response.json(); // data ist ein Array [...]

    if (data && data.length > 0) {
      // API-Ninjas kann mehrere Modelle zurückgeben (z.B. A320-100, A320-200)
      // Wir nehmen das erste als Referenz.
      const aircraft = data[0];
      const notAvailable = getTranslation("modalDetails.notAvailable");

      let content = `
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                        <p><strong>${getTranslation("logbook.aircraftManufacturer")}</strong></p> 
                        <p>${aircraft.manufacturer || notAvailable}</p>
                        
                        <p><strong>${getTranslation("logbook.aircraftModel")}</strong></p> 
                        <p>${aircraft.model || notAvailable}</p>
                        
                        <p><strong>${getTranslation("logbook.aircraftEngineType")}</strong></p> 
                        <p>${aircraft.engine_type || notAvailable}</p>
                        
                        <p><strong>${getTranslation("logbook.aircraftEngineThrust")}</strong></p> 
                        <p>${aircraft.engine_thrust_lbf ? `${aircraft.engine_thrust_lbf} lbf` : notAvailable}</p>

                        <p><strong>${getTranslation("logbook.aircraftMaxSpeed")}</strong></p> 
                        <p>${aircraft.max_speed_knots ? `${aircraft.max_speed_knots} knots` : notAvailable}</p>
                        
                        <p><strong>${getTranslation("logbook.aircraftCruiseSpeed")}</strong></p> 
                        <p>${aircraft.cruise_speed_knots ? `${aircraft.cruise_speed_knots} knots` : notAvailable}</p>
                        
                        <p><strong>${getTranslation("logbook.aircraftCeiling")}</strong></t></p> 
                        <p>${aircraft.ceiling_ft ? `${aircraft.ceiling_ft.toLocaleString("de-DE")} ft` : notAvailable}</p>
                        
                        <p><strong>${getTranslation("logbook.aircraftRange")}</strong></p> 
                        <p>${aircraft.range_nautical_miles ? `${aircraft.range_nautical_miles} NM` : notAvailable}</p>
                    </div>
                `;

      // Wenn es mehr als ein Modell gab, zeige die anderen auch an
      if (data.length > 1) {
        content += `<hr class="my-4 dark:border-gray-700">`;
        content += `<p class="font-semibold mb-2">${getTranslation("logbook.aircraftVariants")}:</p>`;
        data.slice(1).forEach((variant) => {
          content += `<p class="text-sm"><strong>${variant.model}:</strong> ${variant.engine_type || "N/A"}</p>`;
        });
      }

      contentContainer.innerHTML = content;
    } else {
      contentContainer.innerHTML = `<p>${getTranslation("logbook.aircraftNoDetails")}</p>`;
    }
  } catch (error) {
    console.error("Fehler beim Abrufen der Flugzeug-Details:", error);
    contentContainer.innerHTML = `<p>${getTranslation("logbook.aircraftError")}</p>`;
  }
}

/**
 * ANGEPASST: Öffnet das Info-Modal und zeigt die Details eines geklickten Fluges an.
 * (Verwendet jetzt i18n-Übersetzungen)
 */
function showFlightDetailsInModal(flight) {
  // 1. Titel des Modals setzen (JETZT MIT ÜBERSETZUNG)
  const titleTemplate =
    getTranslation("logbook.flightTitle") ||
    "Flug #{number}: {departure} → {arrival}";
  document.getElementById("info-modal-title").textContent = titleTemplate
    .replace("{number}", flight.flightLogNumber)
    .replace("{departure}", flight.departure)
    .replace("{arrival}", flight.arrival);

  // 2. Inhalt des Modals erstellen
  const contentContainer = document.getElementById("info-modal-content");

  // 3. Foto(s) anzeigen, falls vorhanden
  let photoHtml = "";
  if (flight.photo_url && flight.photo_url.length > 0) {
    photoHtml = `<img src="${flight.photo_url[0]}" alt="Flugfoto" class="w-full h-48 object-cover rounded-md mb-3 shadow-md">`;
  }

  // --- 4. Übersetzungen abrufen (mit Fallback) ---
  const keyDate = getTranslation("logbook.flightEntryDate") || "Datum";
  const keyRoute = getTranslation("logbook.flightEntryRoute") || "Strecke";
  const keyDistance =
    getTranslation("logbook.flightEntryDistance") || "Distanz";
  const keyDuration =
    getTranslation("logbook.flightEntryDuration") || "Flugzeit";
  const keyAirline =
    getTranslation("logbook.flightEntryAirline") || "Airline/Flugnr";
  const keyAircraft =
    getTranslation("logbook.flightEntryAircraft") || "Flugzeug/Reg";
  const keyNotes = getTranslation("logbook.flightEntryNotes") || "Notizen:";
  const keySeparator = getTranslation("logbook.routeSeparator") || "nach";
  // --- Ende Neu ---

  // 5. HTML zusammenbauen
  contentContainer.innerHTML = `
            ${photoHtml}
            <div class="space-y-2 text-sm">
                <p><strong>${keyDate}:</strong> ${flight.date}</p>
                <p><strong>${keyRoute}:</strong> ${flight.depName || flight.departure} ${keySeparator} ${flight.arrName || flight.arrival}</p>
                <p><strong>${keyDistance}:</strong> ${flight.distance.toLocaleString("de-DE")} km</p>
                <p><strong>${keyDuration}:</strong> ${estimateFlightTime(flight.distance)}</p> <hr class="my-2 dark:border-gray-600">
                <p><strong>${keyAirline}:</strong> ${flight.airline || "-"} (${flight.flightNumber || "-"})</p>
                <p><strong>${keyAircraft}:</strong> ${flight.aircraftType || "-"} (${flight.registration || "-"})</p>
                
                ${
                  flight.notes
                    ? `
                    <hr class="my-2 dark:border-gray-600">
                    <p class="font-semibold">${keyNotes}</p>
                    <p class="italic text-gray-600 dark:text-gray-400 whitespace-pre-wrap">${flight.notes}</p>
                `
                    : ""
                }
            </div>
        `;

  // 6. Modal öffnen (Diese Funktion existiert bereits)
  openInfoModal();
}

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

    // Klick-Aktion: Ruft die Detailansicht FÜR DIESEN FLUG auf
    button.addEventListener("click", () => {
      showFlightDetailsInModal(flight);
      // WICHTIG: Die Funktion ändert nur den Inhalt des bereits geöffneten Modals
    });

    listContainer.appendChild(button);
  });

  contentContainer.appendChild(listContainer);

  // 5. Modal öffnen (Diese Funktion existiert bereits)
  openInfoModal();
}

// TABS
function showTab(tabName) {
  // Alle Inhalte verstecken
  document.getElementById("tab-content-stats").classList.add("hidden");
  document.getElementById("tab-content-charts").classList.add("hidden");
  document.getElementById("tab-content-logbook").classList.add("hidden");
  document.getElementById("tab-content-fluege").classList.add("hidden");
  document.getElementById("tab-content-neue-fluege").classList.add("hidden");
  document.getElementById("tab-content-achievements").classList.add("hidden");
  document.getElementById("tab-content-hilfe").classList.add("hidden");

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("border-indigo-500", "text-indigo-600");
    btn.classList.add(
      "border-transparent",
      "text-gray-500",
      "hover:text-gray-700",
      "hover:border-gray-300"
    );
  });

  const activeBtn = document.getElementById(`tab-btn-${tabName}`);
  const activeContent = document.getElementById(`tab-content-${tabName}`);
  if (activeBtn && activeContent) {
    activeContent.classList.remove("hidden");
    activeBtn.classList.add("border-indigo-500", "text-indigo-600");
    activeBtn.classList.remove(
      "border-transparent",
      "text-gray-500",
      "hover:text-gray-700",
      "hover:border-gray-300"
    );
  }

  if (tabName === "logbook") {
    renderLogbookView("aircraftType");
  }
  if (tabName === "achievements") {
    updateAchievements();
  }
  if (tabName === "hilfe") {
    renderHelpContent();
  }
}

// RENDERING
window.renderFlights = async function (
  flightsToRender,
  flightIdToFocus,
  page = 1
) {
  stopAnimation();
  currentPage = page;

  isAllRoutesViewActive = false;
  document.getElementById("toggle-map-view-btn").textContent = getTranslation(
    "flights.showAllRoutes"
  );

  // let allFlights = flightsToRender || (await getFlights());
  let allFlights;
  if (flightsToRender) {
    // Fall 1: Ein neuer Filter wird angewendet (aus applyFilters)
    allFlights = flightsToRender;
  } else if (currentlyFilteredFlights) {
    // Fall 2: Wir paginieren (next/prev) durch ein GEFILTERTES Ergebnis
    allFlights = currentlyFilteredFlights;
  } else {
    // Fall 3: Kein Filter aktiv (z.B. beim ersten Laden oder nach Reset)
    allFlights = await getFlights();
  }

  // NEU: Nummerierung nach dem Laden der Daten anwenden
  allFlights = resequenceAndAssignNumbers(allFlights);

  if (allFlights.length > 0) {
    const sortKey = currentSort.key;
    const direction = currentSort.direction === "asc" ? 1 : -1;

    allFlights.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      let comparison = 0;

      if (typeof valA === "number") {
        comparison = valA - valB;
      } else if (sortKey === "date") {
        // Hier stand fälschlicherweise b[sortKey]
        comparison = new Date(valA) - new Date(valB);
      } else {
        comparison = (valA || "").localeCompare(valB || "");
      }
      return comparison * direction;
    });
  }
  updateCharts(allFlights); // Ruft die Charts mit der Standard-Jahresansicht auf
  updatePaginationUI(allFlights);
  updateStatisticsDisplay(allFlights);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedFlights = allFlights.slice(startIndex, endIndex);

  let flightForMap = null;
    
    // 1. Wurde ein spezifischer Flug (z.B. nach dem Speichern) fokussiert?
    if (flightIdToFocus) {
        flightForMap = allFlights.find((f) => f.id === flightIdToFocus);
    }
    
    // 2. Fallback: Wenn kein Fokus gesetzt ist, nimm den chronologisch NEUESTEN Flug
    if (!flightForMap && allFlights.length > 0) {
        // Wir sortieren eine Kopie der Liste nach Datum (absteigend) und nehmen den ersten
        // Dies ignoriert die Sortierung der Tabelle unten und zeigt immer den aktuellsten Flug oben.
        flightForMap = [...allFlights].sort((a, b) => {
            const dateDiff = new Date(b.date) - new Date(a.date);
            if (dateDiff !== 0) return dateDiff;
            return b.id - a.id; // Bei gleichem Datum gewinnt die höhere ID (neuer eingetragen)
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
      flightForMap.arrName
    );
  } else {
    window.drawRouteOnMap();
  }

  const flightList = document.getElementById("flight-log-list");
  flightList.innerHTML = "";

  if (paginatedFlights.length === 0 && currentPage === 1) {
    flightList.innerHTML = `<p id="no-flights-message" class="log-placeholder text-gray-500 italic text-center py-4">${getTranslation(
      "flights.noFlights"
    )}</p>`;
  } else {
    paginatedFlights.forEach((flight) => {
      const depName = airportData[flight.departure]?.name || flight.departure;
      const arrName = airportData[flight.arrival]?.name || flight.arrival;

      // Rufe die Hilfsfunktion auf, um die Farbe zu bestimmen
      const milestoneColor = getMilestoneColor(flight.flightLogNumber);

      const flightElement = document.createElement("div");
      flightElement.className =
        "bg-white dark:bg-gray-800 p-3 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 hover:shadow-lg transition flex justify-between items-start";

      // KORRIGIERTER innerHTML Block (Jetzt einklappbar)
      flightElement.innerHTML = `
            <div class="flex items-start gap-4 flex-grow">
                <div class="flex-shrink-0 ${milestoneColor} text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" title="${getTranslation("flights.flightNumberTitle")}">
                    #${flight.flightLogNumber || "-"}
                </div>

                <details class="flex-grow group">
                    <summary class="list-none md:list-item cursor-pointer">
                        <p class="text-base md:text-lg font-bold text-indigo-700 dark:text-indigo-400">
                            ${depName} (${flight.departure}) ➔ ${arrName} (${flight.arrival})
                        </p>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            📅 ${flight.date} | ⏱️ ${flight.time} | 📏 ${flight.distance.toLocaleString("de-DE")} km
                        </F>
                        
                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1 group-open:hidden">
                            ${getTranslation("flights.showMore") || "Details anzeigen..."}
                        </p>
						
						<p class="text-xs text-gray-400 dark:text-gray-500 mt-1 hidden group-open:block">
                            ${getTranslation("flights.hideMore") || "Details ausblenden..."}
                        </p>
						
                    </summary>

                    <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <p class="text-sm font-semibold text-red-600 dark:text-red-400">
                            ${getTranslation("flights.co2Info").replace(
                              "{co2}",
                              flight.co2_kg
                                ? flight.co2_kg.toLocaleString("de-DE")
                                : "k.A."
                            )}
                        </p>
                        
                        <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">
                              ${getTranslation("flights.flightDetails")
                                .replace(
                                  "{flightNumber}",
                                  flight.flightNumber || "-"
                                )
                                .replace("{airline}", flight.airline || "-")
                                .replace(
                                  "{aircraftType}",
                                  flight.aircraftType || "-"
                                )}
                        </p>
                        
                        ${
                          flight.photo_url && flight.photo_url.length > 0
                            ? `<div class="mt-2 flex gap-2">${flight.photo_url
                                .map(
                                  (url) => `
                                <a href="${url}" target="_blank">
                                    <img src="${url}" alt="Flugfoto" class="h-12 w-12 rounded-md object-cover shadow-sm hover:scale-110 transition">
                                </a>`
                                )
                                .join("")}
                               </div>`
                            : ""
                        }
                        ${
                          flight.notes
                            ? `<p class="text-xs text-gray-700 dark:text-gray-300 italic mt-2 border-l-2 border-indigo-400 pl-2">
                                  ${flight.notes}
                              </p>`
                            : ""
                        }
                    </div>
                    </details>
                </div>
            
            <div class="flex flex-col md:flex-row items-center ml-2">
            <button onclick="editFlight(${
              flight.id
            })" class="p-2 text-blue-500 hover:text-blue-700 transition" title="${getTranslation("flights.editTitle")}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                </button>
                <button onclick="deleteFlight(${
                  flight.id
                })" class="p-2 text-red-500 hover:text-red-700 transition" title="${getTranslation("flights.deleteTitle")}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                </button>
            </div>
            `;
      flightList.appendChild(flightElement);
    });
  }

  updateSortButtonUI();
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
      const match = flight.flightNumber
        ? flight.flightNumber.match(/^[A-Z0-9]{2}/)
        : null;
      const airline = match ? match[0].toUpperCase() : unknownKey;
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
    detailsElement.className = "bg-gray-50 dark:bg-gray-700 p-4 rounded-lg";

    const summaryElement = document.createElement("summary");
    summaryElement.className =
      "font-semibold text-lg cursor-pointer text-indigo-700 dark:text-indigo-400 flex items-center";

    let titleHtml = key;
    let titleKey = "";

    // ... (Vorheriger Code in renderLogbookView)

    if (isAirportView && key !== unknownKey) {
      titleKey = getTranslation("logbook.detailsTitleAirport").replace(
        "{key}",
        key
      );

      // ✅ NEU: Feature Gating für Airport-Details
      if (currentUserSubscription === "pro") {
        // PRO: Text + Button anzeigen
        titleHtml = `
						${key}
						<button onclick="event.stopPropagation(); showAirportDetails('${key}')" class="ml-2 p-1 rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors duration-150" title="${titleKey}">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" /></svg>
						</button>
					`;
      } else {
        // ✅ TEASER VERSION
        titleHtml = `
						${key}
						<button onclick="event.stopPropagation(); openPremiumModal('default')" class="ml-2 p-1 rounded-full text-gray-400 hover:bg-gray-100 transition">
							<span class="text-xs">🔒</span>
						</button>
					`;
      }
    } else if (isAirlineView && key !== unknownKey) {
      const firstFlightWithName = group.flights.find(
        (f) => f.airline && f.airline.trim() !== ""
      );
      const displayLabel = firstFlightWithName
        ? `${firstFlightWithName.airline} (${key})`
        : key;
      titleKey = getTranslation("logbook.detailsTitleAirline").replace(
        "{key}",
        key
      );

      // ✅ NEU: Feature Gating für Airline-Details
      if (currentUserSubscription === "pro") {
        // PRO: Text + Button anzeigen
        titleHtml = `
						${displayLabel}
						<button onclick="event.stopPropagation(); showAirlineDetails('${key}')" class="ml-2 p-1 rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors duration-150" title="${titleKey}">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" /></svg>
						</button>
					`;
      } else {
        // ✅ TEASER VERSION
        titleHtml = `
						${key}
						<button onclick="event.stopPropagation(); openPremiumModal('default')" class="ml-2 p-1 rounded-full text-gray-400 hover:bg-gray-100 transition">
							<span class="text-xs">🔒</span>
						</button>
					`;
      }
    } else if (isAircraftTypeView && key !== unknownKey) {
      titleKey = getTranslation("logbook.detailsTitleAircraft").replace(
        "{key}",
        key
      );

      // ✅ NEU: Feature Gating für Aircraft-Details
      if (currentUserSubscription === "pro") {
        // PRO: Text + Button anzeigen
        titleHtml = `
						${key}
						<button onclick="event.stopPropagation(); showAircraftDetails('${key}')" class="ml-2 p-1 rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors duration-150" title="${titleKey}">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" /></svg>
						</button>
					`;
      } else {
        // ✅ TEASER VERSION
        titleHtml = `
						${key}
						<button onclick="event.stopPropagation(); openPremiumModal('default')" class="ml-2 p-1 rounded-full text-gray-400 hover:bg-gray-100 transition">
							<span class="text-xs">🔒</span>
						</button>
					`;
      }
    }
    // ...

    // KEIN Info-Button für Registrierung, da es keine API dafür gibt

    summaryElement.innerHTML = `${titleHtml}`; // Entfernt die (Anzahl/Distanz) aus dem Titel

    const flightListDiv = document.createElement("div");
    flightListDiv.className =
      "mt-4 space-y-2 border-t border-gray-200 dark:border-gray-600 pt-4";

    // --- ✅ NEU: Feature Gating für PDF-Druck im Logbuch ---
    // Wir prüfen hier, ob der User PRO ist. Nur dann erstellen wir den Button.
    if (currentUserSubscription === "pro") {
      // 1. Druck-Button erstellen und konfigurieren
      const printButton = document.createElement("button");
      printButton.className =
        "text-xs font-medium text-blue-600 hover:text-blue-800 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-600 transition";

      const buttonTitle = (
        getTranslation("print.logbookTitle") || "Logbuch: {groupName}"
      ).replace("{groupName}", key);
      printButton.innerHTML = (
        getTranslation("print.createBookForGroup") ||
        "Buch für {groupName} erstellen"
      ).replace("{groupName}", key);

      printButton.onclick = async (event) => {
        event.stopPropagation();
        const sortedGroupFlights = [...group.flights].sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        );
        await buildAndPrintHtml(sortedGroupFlights, buttonTitle);
      };

      // Button dem Container hinzufügen
      flightListDiv.appendChild(printButton);
    }
    // --- ENDE NEU ---

    // 2. Titel (Summary) erstellen und hinzufügen
    const listTitle = document.createElement("p");
    // (Ich habe eine Trennlinie hinzugefügt, um den Button von der Liste zu trennen)
    listTitle.className =
      "text-sm font-semibold text-gray-700 dark:text-gray-300 pt-4 border-t dark:border-gray-700 mt-4";
    listTitle.textContent = getTranslation("logbook.summary")
      .replace("{count}", group.count)
      .replace("{distance}", group.totalDistance.toLocaleString("de-DE"));
    flightListDiv.appendChild(listTitle);

    // 3. Flugliste als DOM-Elemente erstellen und hinzufügen
    group.flights
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach((flight) => {
        const flightText = getTranslation("logbook.flightEntry")
          .replace("{date}", flight.date)
          .replace("{departure}", flight.departure)
          .replace("{arrival}", flight.arrival)
          .replace("{distance}", flight.distance.toLocaleString("de-DE"));

        // Erstelle ein 'div' statt 'innerHTML +=' zu verwenden
        const flightEntryDiv = document.createElement("div");
        flightEntryDiv.className = "text-sm text-gray-700 dark:text-gray-300";
        flightEntryDiv.textContent = flightText; // Sicherer und erhält den Button-Listener

        flightListDiv.appendChild(flightEntryDiv); // Hängt den Flug hinzu
      });

    // --- ✅ ENDE KORREKTUR ---

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
function updatePaginationUI(allFlights) {
  const pageInfo = document.getElementById("page-info");
  const prevBtn = document.getElementById("prev-page-btn");
  const nextBtn = document.getElementById("next-page-btn");
  const paginationControls = document.getElementById("pagination-controls");

  const totalPages = Math.ceil(allFlights.length / ITEMS_PER_PAGE);

  if (totalPages <= 1) {
    paginationControls.style.display = "none"; // Verstecke Steuerung, wenn nicht benötigt
    return;
  }

  // Stelle sicher, dass die Leiste sichtbar ist, wenn sie gebraucht wird.
  paginationControls.style.display = "flex";

  // Dynamischen Text verwenden
  pageInfo.textContent = getTranslation("flights.pageInfo")
    .replace("{currentPage}", currentPage)
    .replace("{totalPages}", totalPages);

  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;
}

/**
 * Wechselt zur nächsten Seite.
 */
function nextPage() {
  renderFlights(null, null, currentPage + 1);
}

/**
 * Wechselt zur vorherigen Seite.
 */
function prevPage() {
  renderFlights(null, null, currentPage - 1);
}

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
      yearlySummary.textContent = getTranslation("stats.yearlySummaryContent")
        .replace("{count}", data.count)
        .replace("{distance}", data.distance.toLocaleString("de-DE"));
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
  // Zeile entfernt: const allFlights = getFlights();

  if (!allFlights || allFlights.length === 0) {
    // Optional: Verstecke oder leere die Charts, wenn keine Daten da sind
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
    aggregatedData[key].count++;
    aggregatedData[key].distance += flight.distance;
    aggregatedData[key].time += parseFlightTimeToMinutes(flight.time);
  });

  const sortedLabels = Object.keys(aggregatedData).sort();

  const flightsData = sortedLabels.map((label) => aggregatedData[label].count);
  const distanceData = sortedLabels.map(
    (label) => aggregatedData[label].distance
  );
  const timeData = sortedLabels.map((label) => aggregatedData[label].time);

  renderAllCharts(sortedLabels, flightsData, distanceData, timeData);

  document
    .getElementById("chart-view-year")
    .classList.toggle("active", timeframe === "year");
  document
    .getElementById("chart-view-month")
    .classList.toggle("active", timeframe === "month");
}

/**
 * Zeichnet alle Diagramme basierend auf den aufbereiteten Daten.
 * Zerstört alte Diagramme, bevor neue gezeichnet werden.
 * @param {Array<string>} labels - Die Labels für die X-Achse (z.B. ['2024', '2025']).
 * @param {Array<number>} flightsData - Die Daten für die Anzahl der Flüge.
 * @param {Array<number>} distanceData - Die Daten für die Distanz.
 * @param {Array<number>} timeData - Die Daten für die Flugzeit in Minuten.
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
          label: getTranslation("charts.labelFlights"), // KORRIGIERT
          data: flightsData,
          backgroundColor: "rgba(79, 70, 229, 0.8)",
          borderColor: "rgba(79, 70, 229, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: labelColor },
          grid: { color: gridColor },
        },
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
          label: getTranslation("charts.labelDistance"), // KORRIGIERT
          data: distanceData,
          fill: false,
          borderColor: "rgba(22, 163, 74, 1)",
          tension: 0.1,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: labelColor },
          grid: { color: gridColor },
        },
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
          label: getTranslation("charts.labelDuration"), // KORRIGIERT
          data: timeData,
          fill: false,
          borderColor: "rgba(219, 39, 119, 1)",
          tension: 0.1,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: labelColor },
          grid: { color: gridColor },
        },
        x: { ticks: { color: labelColor }, grid: { color: gridColor } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function (context) {
              let label = context.dataset.label || "";
              if (label) label += ": ";
              const totalMinutes = context.parsed.y;
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;

              // KORRIGIERT: Verwendet die Übersetzungsvorlage
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
    showMessage(
      "Export-Fehler",
      "Keine Flüge im aktuellen Filter zum Drucken gefunden.",
      "error"
    );
    return;
  }

  // 2. (BUGFIX von vorher) Stelle sicher, dass die Flüge nummeriert sind
  // (Wir verwenden resequenceAndAssignNumbers für die *gefilterte* Liste)
  const sequencedFlights = resequenceAndAssignNumbers([...flightsToPrint]);

  // 3. Finde das ECHTE Start- und Enddatum VOR der UI-Sortierung
  const dateSortedFlights = [...sequencedFlights].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  const firstDate = dateSortedFlights[0].date;
  const lastDate = dateSortedFlights[dateSortedFlights.length - 1].date;

  // 4. Wende die aktuelle UI-Sortierung (currentSort) für die Druck-Reihenfolge an
  const sortKey = currentSort.key;
  const direction = currentSort.direction === "asc" ? 1 : -1;
  sequencedFlights.sort((a, b) => {
    // (Sortierlogik bleibt gleich)
    const valA = a[sortKey];
    const valB = b[sortKey];
    let comparison = 0;
    if (typeof valA === "number") comparison = valA - valB;
    else if (sortKey === "date")
      comparison = new Date(a.date) - new Date(b.date);
    else comparison = (valA || "").localeCompare(valB || "");
    return comparison * direction;
  });

  // 5. Statistiken für das Deckblatt berechnen
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
    // WICHTIG: 'index' zur Schleife hinzufügen!
    // (Rest der Funktion bleibt exakt gleich, verwendet 'flight.flightLogNumber')
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

    // ACHTUNG: Wir bauen den gesamten Flugeintrag in der Variablen 'flightEntryHtml'
    // und fügen sie dann in die umhüllende Tabelle ein.
    let flightEntryHtml = `
        <div class="print-flight-entry" style="font-family: 'Inter', sans-serif;">
            <h2 style="font-size: 1.5rem; font-weight: 700; color: #4F46E5; border-bottom: 1px solid #E5E7EB; padding-bottom: 0.5rem;">
                ${title}
            </h2>
            <div style="margin-top: 1rem; line-height: 1.75;">
                <p><strong>${getTranslation("logbook.flightEntryDate")}:</strong> ${flight.date}</p>
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

    // ----------------------------------------------------------------------
    // KORRIGIERTER HAUPT-BLOCK: Verpackt den Eintrag in eine Tabelle
    // ----------------------------------------------------------------------
    html += `
        <table class="print-table" role="presentation" style="border-collapse: collapse; page-break-before: always !important;">
            <tr>
                <td style="width: 100%; vertical-align: top; padding: 0;">
                    ${flightEntryHtml}
                </td>
            </tr>
        </table>
    `;

    // ----------------------------------------------------------------------
    // MANUELLER UMBRUCH NACH JEDEM FLUG (AUSSER DEM LETZTEN)
    // ----------------------------------------------------------------------
    if (index < sequencedFlights.length - 1) {
      html += '<hr class="page-break">';
    }
    // ----------------------------------------------------------------------
  });

  // 8. HTML in den Container einfügen
  document.getElementById("print-view-content").innerHTML = html;

  // --- HIER IST DIE "WEICHE" (CAPACITOR / WEB) ---

  // 9. Prüfen, ob die App in einer Capacitor-Umgebung (Android/iOS) läuft
  if (typeof Capacitor !== "undefined" && Capacitor.isNativePlatform()) {
    // --- FALL 1: CAPACITOR APP (Android) ---

    showMessage(
      getTranslation("print.nativeTitle") || "PDF wird erstellt...",
      getTranslation("print.nativeMessage") ||
        "Die App generiert das PDF. Bitte warten...",
      "info"
    );

    try {
      // 1. Hole unser EIGENES Plugin
      const { MyPrinter } = Capacitor.Plugins;

      if (!MyPrinter) {
        // Diese Meldung sehen Sie, wenn die Synchronisierung (sync) fehlgeschlagen ist
        throw new Error(
          "Eigenes 'MyPrinter'-Plugin nicht auf Capacitor.Plugins gefunden."
        );
      }

      // 2. Rufe unsere EIGENE 'printHtml'-Funktion auf
      // (Beachten Sie 'printHtml' und das 'content'-Objekt)
      MyPrinter.printHtml({
        content: html,
        jobName: title,
      }).catch((error) => {
        // Fängt Fehler ab, falls das native Drucken fehlschlägt
        console.error("Fehler beim nativen Drucken:", error);
        showMessage(
          "Druckfehler",
          "Natives PDF konnte nicht erstellt werden.",
          "error"
        );
      });
    } catch (e) {
      console.error(
        "Eigenes 'MyPrinter'-Plugin konnte nicht geladen werden:",
        e
      );
      alert(
        "Die native Druckfunktion ist auf diesem Gerät nicht verfügbar. (Plugin-Fehler)"
      );
    }
  } else {
    // --- FALL 2: NORMALER BROWSER (Windows, etc.) ---
    // Wir verwenden die alte Methode mit window.print()
    setTimeout(() => {
      window.print();
    }, 500);
  }
  // --- ENDE DER WEICHE ---
}

/**
 * NEU: Trigger-Funktion für den "Flüge"-Tab.
 * Liest die Filter aus und ruft die Kern-Druckfunktion auf.
 */
async function triggerPrintView_FlightsTab() {
  // ✅ NEU: GATEKEEPER
  if (currentUserSubscription === "free") {
    openPremiumModal("print");
    return;
  }

  // 1. Alle Flüge abrufen
  let allFlights = await getFlights();

  // 2. Flüge filtern (Logik aus der alten Funktion)
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
  if (depFilter)
    filteredFlights = filteredFlights.filter((f) =>
      f.departure.toUpperCase().includes(depFilter)
    );
  if (arrFilter)
    filteredFlights = filteredFlights.filter((f) =>
      f.arrival.toUpperCase().includes(arrFilter)
    );
  if (dateFrom)
    filteredFlights = filteredFlights.filter((f) => f.date >= dateFrom);
  if (dateTo) filteredFlights = filteredFlights.filter((f) => f.date <= dateTo);

  // 3. Kernfunktion aufrufen
  const title = getTranslation("print.filteredTitle") || "Gefilterte Flugliste";
  await buildAndPrintHtml(filteredFlights, title);
}

/**
 * NEU: Füllt den Hilfe-Tab mit übersetzbarem Inhalt.
 */
function renderHelpContent() {
    const container = document.getElementById("help-content-container");

    // Hilfetexte (mit i18n-Schlüsseln)
    const sections = [
        { key: "help.logging.title", contentKey: "help.logging.content" },
        { key: "help.globe.title", contentKey: "help.globe.content" },
        { key: "help.tabs.title", contentKey: "help.tabs.content" },
        { key: "help.data.title", contentKey: "help.data.content" },
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
        <h3 class="text-lg font-semibold text-indigo-600 dark:text-indigo-400 mb-2">${isGerman ? 'Rechtliches' : 'Legal'}</h3>
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
