// =================================================================
// MAP & GLOBE LOGIC
// =================================================================

// Hilfsfunktion: Wandelt Hex (#RRGGBB) in RGBA mit Transparenz um
function hexToRgba(hex, alpha) {
    // Entferne das Hash #
    hex = hex.replace('#', '');
    
    // Parse die Komponenten
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

window.drawRouteOnMap = async function (
  depLat,
  depLon,
  arrLat,
  arrLon,
  depCode,
  arrCode,
  depName,
  arrName
) {
  var mapInfo = document.getElementById("map-info");
  routeLayer.clearLayers();

  if (markerClusterGroup) {
    markerClusterGroup.clearLayers();
    map.removeLayer(markerClusterGroup);
  }

  if (!depLat || !arrLat) {
    mapInfo.textContent = getTranslation("mapInfo");
    mapInfo.removeAttribute("data-dynamic-depName");
    map.setView([20, 0], 2);
    return;
  }

  const depPopupContent = `<b>${getTranslation("map.departure") || "Departure"}:</b> ${depName} (${depCode})`;
  const arrPopupContent = `<b>${getTranslation("map.arrival") || "Arrival"}:</b> ${arrName} (${arrCode})`;

  const depMarker = L.marker([depLat, depLon]).bindPopup(depPopupContent);
  const arrMarker = L.marker([arrLat, arrLon]).bindPopup(arrPopupContent);

  const flightPath = L.polyline(
    [
      [depLat, depLon],
      [arrLat, arrLon],
    ],
    { color: "#10B981", weight: 3 }
  );

  routeLayer.addLayer(depMarker);
  routeLayer.addLayer(arrMarker);
  routeLayer.addLayer(flightPath);

  map.fitBounds(
    [
      [depLat, depLon],
      [arrLat, arrLon],
    ],
    { padding: [50, 50] }
  );

  mapInfo.setAttribute("data-dynamic-depName", depName);
  mapInfo.setAttribute("data-dynamic-depCode", depCode);
  mapInfo.setAttribute("data-dynamic-arrName", arrName);
  mapInfo.setAttribute("data-dynamic-arrCode", arrCode);

  const template = getTranslation("mapVisualization");
  mapInfo.textContent = template
    .replace("{depName}", depName)
    .replace("{depCode}", depCode)
    .replace("{arrName}", arrName)
    .replace("{arrCode}", arrCode);

  const returnFlightContainer = document.getElementById(
    "return-flight-container"
  );
  const returnFlightBtn = document.getElementById("return-flight-btn");
  returnFlightBtn.setAttribute(
    "onclick",
    `prefillReturnFlight('${arrCode}', '${depCode}')`
  );
  returnFlightContainer.classList.remove("hidden");
};

window.drawAllRoutesOnMap = function (flights) {
  const mapInfo = document.getElementById("map-info");
  routeLayer.clearLayers();
  if (markerClusterGroup) {
    markerClusterGroup.clearLayers();
    map.removeLayer(markerClusterGroup);
  }
  markerClusterGroup = L.markerClusterGroup();

  if (!flights || flights.length === 0) {
    mapInfo.textContent = getTranslation("flights.mapNoFlights");
    map.setView([20, 0], 2);
    return;
  }

  const routeGroups = {};
  const uniqueAirports = {};

  flights.forEach((flight) => {
    if (flight.depLat && flight.arrLat) {
      const routeKey = [flight.departure, flight.arrival].sort().join("-");
      if (!routeGroups[routeKey]) {
        routeGroups[routeKey] = {
          latLngs: [
            [flight.depLat, flight.depLon],
            [flight.arrLat, flight.arrLon],
          ],
          flightNumbers: [],
        };
      }
      routeGroups[routeKey].flightNumbers.push(flight.flightLogNumber);
      if (!uniqueAirports[flight.departure])
        uniqueAirports[flight.departure] = {
          name: flight.depName,
          lat: flight.depLat,
          lon: flight.depLon,
        };
      if (!uniqueAirports[flight.arrival])
        uniqueAirports[flight.arrival] = {
          name: flight.arrName,
          lat: flight.arrLat,
          lon: flight.arrLon,
        };
    }
  });

  const bounds = [];
  Object.values(routeGroups).forEach((group) => {
    const flightPath = L.polyline(group.latLngs, {
      color: "#312E81",
      weight: Math.min(1.5 + (group.flightNumbers.length - 1) * 0.5, 8),
      opacity: 0.6 + group.flightNumbers.length * 0.05,
    });
    flightPath.addTo(routeLayer);
    bounds.push(group.latLngs[0]);
    bounds.push(group.latLngs[1]);
  });

  Object.keys(uniqueAirports).forEach((iataCode) => {
    const airport = uniqueAirports[iataCode];
    const marker = L.marker([airport.lat, airport.lon]);
    marker.bindPopup(`<b>${airport.name}</b> (${iataCode})`);
    markerClusterGroup.addLayer(marker);
  });
  map.addLayer(markerClusterGroup);

  if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
  mapInfo.textContent = getTranslation("flights.mapOverview").replace(
    "{count}",
    Object.keys(routeGroups).length
  );
};

window.toggleAllRoutesView = async function () {
  stopAnimation();
  isAllRoutesViewActive = !isAllRoutesViewActive;
  const btn = document.getElementById("toggle-map-view-btn");

  if (isAllRoutesViewActive) {
    let allFlights = await getFlights();
    allFlights = resequenceAndAssignNumbers(allFlights);
    drawAllRoutesOnMap(allFlights);
    btn.textContent = getTranslation("flights.showSingleRoute");
  } else {
    renderFlights();
    btn.textContent = getTranslation("flights.showAllRoutes");
  }
};

// --- GLOBE LOGIC ---

function processGlobeData(flightsToShow, isStoryMode = false) {
    const arcData = [];
    const visitedCountries = new Set();
    const airportUsage = {};
    const routeGroups = {};

    // 1. Gruppieren, um Stapel zu berechnen
    flightsToShow.filter((f) => f.depLat && f.arrLat).forEach((flight) => {
        // Sortiere IATA-Codes alphabetisch, damit Hin- und Rückflug im selben Stapel landen
        const routeKey = [flight.departure, flight.arrival].sort().join("-");
        
        if (!routeGroups[routeKey]) routeGroups[routeKey] = [];
        routeGroups[routeKey].push(flight);
    });

    // Wir brauchen die ID des Fluges, auf dem der Slider gerade steht (der allerletzte in der gefilterten Liste)
    const currentSliderFlightId = flightsToShow.length > 0 ? flightsToShow[flightsToShow.length - 1].id : null;

    // 2. Daten für den Globus bauen
    for (const routeKey in routeGroups) {
        const flightsOnThisRoute = routeGroups[routeKey];
        
        flightsOnThisRoute.forEach((flight, indexInRoute) => {
            const distance = calculateDistance(flight.depLat, flight.depLon, flight.arrLat, flight.arrLon);
            const flightColor = getColorByDistance(distance);
            
            // Ist dies der Flug, den der Slider gerade "berührt"?
            const isActiveFlight = isStoryMode && (flight.id === currentSliderFlightId);

            arcData.push({
                startLat: flight.depLat, 
                startLng: flight.depLon, 
                endLat: flight.arrLat, 
                endLng: flight.arrLon,
                name: `${flight.departure} → ${flight.arrival}`,
                color: flightColor,
                distance: distance,
                originalFlight: flight,
                allFlightsOnRoute: flightsOnThisRoute,
                
                // ✅ WICHTIG: Das hier brauchen wir für die Entwirrung!
                stackIndex: indexInRoute, 
                // ✅ WICHTIG: Hash für verschiedene Routen, die ähnlich liegen
                hash: (flight.arrival.charCodeAt(0) + flight.arrival.charCodeAt(1)) % 10,
                
                isActive: isActiveFlight
            });

            // (Länder & Airports Logik wie gehabt...)
            const depCountry = airportData[flight.departure]?.country_code;
            const arrCountry = airportData[flight.arrival]?.country_code;
            if (depCountry) visitedCountries.add(depCountry);
            if (arrCountry) visitedCountries.add(arrCountry);

            [flight.departure, flight.arrival].forEach((iata) => {
                const airport = airportData[iata];
                if (!airport) return;
                if (!airportUsage[iata]) {
                    airportUsage[iata] = { code: iata, name: airport.name || iata, lat: airport.lat, lon: airport.lon, count: 1 };
                } else {
                    airportUsage[iata].count++;
                }
            });
        });
    }

    const airportPointsData = Object.values(airportUsage);
    const maxCount = Math.max(0, ...airportPointsData.map((d) => d.count));
    
    return { arcData, visitedCountries: Array.from(visitedCountries), airportPointsData, maxCount };
}

async function getGlobeData() {
  // 1. Alle Flüge abrufen
  const allFlights = await getFlights();
  // 2. Alle verarbeiten und zurückgeben
  return processGlobeData(allFlights);
}

async function openGlobeModal() {
  // --- 1. PAYWALL CHECK ANPASSEN ---
  // Vorher: Blockiert alle Free-User
  // if (currentUserSubscription === "free") { ... }
  
  // Neu: Wir lassen Demo-User IMMER durch.
  // (Wenn du später Step 2 "Globus für alle" machst, löschen wir diesen Block ganz)
  if (currentUserSubscription === "free" && !isDemoMode) {
    // Optional: Wenn du willst, dass Free-User den Globus sehen (Step 2),
    // kommentiere diese Zeilen einfach aus!
    openPremiumModal("globe"); 
    return;
  }
  // ----------------------------------

  let countries;
  document.getElementById("globe-modal").classList.remove("hidden");
  
  // CONTAINER GRÖSSE FIXEN ---
    const container = document.getElementById("globe-container");
    
    // Wir warten einen winzigen Moment (10ms), damit der Browser das CSS (hidden removed) 
    // verarbeitet hat und die wahre Größe des Containers kennt.
    setTimeout(() => {
        if (globeInstance) {
            globeInstance.width(container.clientWidth);
            globeInstance.height(container.clientHeight);
        }
    }, 10);
    // --- ENDE ---

  const sliderEl = document.getElementById("globe-time-slider");
  const labelEl = document.getElementById("globe-time-label");
  const sliderContainer = document.getElementById("globe-slider-container");

  // Wenn Demo-Modus: Nimm die Daten aus der globalen Variable (die startDemoMode gefüllt hat)
  if (isDemoMode && typeof flights !== 'undefined') {
      console.log("Globus: Nutze Demo-Daten");
      allFlightsUnfiltered = flights; 
  } else {
      // Sonst: Lade frisch vom Server (oder Cache)
      allFlightsUnfiltered = await getFlights();
  }
  // ------------------------------------------
  const sortedFlights = resequenceAndAssignNumbers(allFlightsUnfiltered);

  if (sortedFlights.length === 0) sliderContainer.classList.add("hidden");
  else sliderContainer.classList.remove("hidden");

  sliderEl.min = 0;
  sliderEl.max = sortedFlights.length - 1;
  sliderEl.value = sortedFlights.length - 1;

  const lastFlight = sortedFlights[sortedFlights.length - 1];
  if (lastFlight)
    labelEl.textContent = `${lastFlight.date} (#${lastFlight.flightLogNumber})`;
  else labelEl.textContent = getTranslation("globe.noFlights") || "No flights available";

  const initialData = processGlobeData(sortedFlights);
  const progressiveFlightSlice = sortedFlights.slice(-50);
  const progressiveData = processGlobeData(progressiveFlightSlice);

  if (!globeInstance) {
    countries = await (
      await fetch(
        "https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson"
      )
    ).json();
    countriesGeoJSON = countries;

    globeInstance = Globe({ rendererConfig: { preserveDrawingBuffer: true } })(document.getElementById("globe-container"))
      .backgroundColor("#000000")
      .atmosphereColor("#000000")
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .arcsData(progressiveData.arcData)
      .arcLabel("name")
            
            // --- 1. FARBE (Jetzt: Bunt aber Transparent) ---
            .arcColor((d) => {
                if (isStoryModeActive) {
                    // AKTIV: Leuchtendes Cyan/Weiß (knallt raus)
                    if (d.isActive) return "#00ffff"; 
                    
                    // INAKTIV (Ghost Trails):
                    // Wir nehmen die Originalfarbe (d.color) und machen sie 40% deckend.
                    // Das erhält die Information "Kurzstrecke/Langstrecke", ist aber dezent.
                    return hexToRgba(d.color, 0.4); 
                }
                // NORMALER MODUS: Volle Farbe
                return d.color;
            })

            // --- 2. HÖHE (Proportionale Bögen) ---
            .arcAltitude((d) => {
                // Natürliche Bogenhöhe
                let naturalArch = d.distance < 1000 ? 0.05 : Math.min(0.5, d.distance / 15000);
                
                // Offsets
                let stackOffset = d.stackIndex * 0.02; 
                let routeVariation = d.hash * 0.01;

                if (isStoryModeActive) {
                    if (d.isActive) {
                        // Hero: Hoch drüber
                        return naturalArch + 0.25 + stackOffset;
                    } else {
                        // Ghosts: 60% Höhe + Sicherheitsabstand
                        return (naturalArch * 0.6) + 0.05 + (d.stackIndex * 0.005);
                    }
                }
                // Normal
                return naturalArch + routeVariation + stackOffset;
            })

            // --- 3. DICKE (Konsistent halten!) ---
            .arcStroke((d) => {
                if (isStoryModeActive) {
                    // Aktiv: 2.5 (Fett)
                    // Inaktiv: 0.8 (Vorher 0.6 - etwas dicker für die Farbe)
                    return d.isActive ? 2.5 : 0.8;
                }
                // Normal: 0.5
                return 0.5;
            })

            // --- 4. ANIMATION ---
            .arcDashLength((d) => {
                if (isStoryModeActive) return d.isActive ? 0.4 : 1; 
                return 0.1;
            })
            .arcDashGap((d) => {
                if (isStoryModeActive) return d.isActive ? 0.1 : 0;
                return 0.02; 
            })
            .arcDashAnimateTime((d) => {
                if (isStoryModeActive) return d.isActive ? 4000 : 0; 
                return d.distance < 1000 ? 8000 : 12000;
            })
      .polygonsData(countries.features)
      .polygonCapColor((feat) => {
        const isVisited = initialData.visitedCountries.includes(
          feat.properties.ISO_A2
        );
        return isVisited
          ? "rgba(147, 51, 234, 0.5)"
          : "rgba(100, 100, 100, 0.2)";
      })
      .polygonSideColor(() => "rgba(255, 255, 255, 0.05)")
      .polygonStrokeColor(() => "#ffffff")
      .polygonAltitude(0.01)
      .pointsData(progressiveData.airportPointsData)
      .pointLat("lat")
      .pointLng("lon")
      .pointLabel((d) => {
    const visitText = d.count > 1 ? getTranslation("globe.visits") : getTranslation("globe.visit");
    return `${d.name} (${d.count} ${visitText})`;
})
      .pointColor(() => "#fde047")
      .pointRadius(
        (d) =>
          0.1 +
          (progressiveData.maxCount > 0
            ? (d.count / progressiveData.maxCount) * 0.4
            : 0)
      )
      .pointAltitude((d) =>
        progressiveData.maxCount > 0
          ? (d.count / progressiveData.maxCount) * 0.2
          : 0.01
      )
      .pointsTransitionDuration(0)
      .htmlElementsData(progressiveData.airportPointsData)
      .htmlLat("lat")
      .htmlLng("lon")
      .htmlAltitude(
        (d) =>
          (progressiveData.maxCount > 0
            ? (d.count / progressiveData.maxCount) * 0.2
            : 0.01) + 0.03
      )
      .htmlElement((d) => {
        const el = document.createElement("div");
        el.innerHTML = d.code;
        el.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
        el.style.color = "white";
        el.style.padding = "1px 3px";
        el.style.borderRadius = "2px";
        el.style.fontSize = "10px";
        el.style.fontFamily = '"Inter", sans-serif';
        el.style.pointerEvents = "none";
        return el;
      })
      .htmlTransitionDuration(0)

      // +++ NEU: EVENT-HANDLER FÜR FOKUS-MODUS +++

      /**
       * EVENT 1: Klick auf eine Flughafen-Säule (Point)
       */
      .onPointClick((point) => {
        // ✅ NEU: Story-Modus automatisch beenden
        if (isStoryModeActive) {
          toggleStoryMode();
        }
        console.log("Fokus auf:", point.code);
        // 1. Rotation stoppen & Slider deaktivieren
        globeInstance.controls().autoRotate = false;
        sliderEl.disabled = true;
        labelEl.textContent = `${getTranslation("globe.focus") || "Focus"}: ${point.name} (${point.code})`;

        // 2. Zur Säule fliegen
        globeInstance.pointOfView(
          { lat: point.lat, lng: point.lon, altitude: 1.5 },
          1000
        );

        // 3. Flüge nur für diesen Punkt filtern
        const focusedFlights = sortedFlights.filter(
          (f) => f.departure === point.code || f.arrival === point.code
        );

        // 4. Daten neu verarbeiten (zeigt nur noch diesen Punkt und verbundene an)
        const { arcData, visitedCountries, airportPointsData, maxCount } =
          processGlobeData(focusedFlights);

        // 5. Globus mit den FOKUSSIERTEN Daten aktualisieren
        globeInstance.arcsData(arcData);
        globeInstance
          .polygonsData(countries.features)
          .polygonCapColor((feat) => {
            const isVisited = visitedCountries.includes(feat.properties.ISO_A2);
            return isVisited
              ? "rgba(147, 51, 234, 0.5)"
              : "rgba(100, 100, 100, 0.2)";
          });
        globeInstance
          .pointsData(airportPointsData)
          .pointRadius(
            (d) => 0.1 + (maxCount > 0 ? (d.count / maxCount) * 0.4 : 0)
          )
          .pointAltitude((d) =>
            maxCount > 0 ? (d.count / maxCount) * 0.2 : 0.01
          );
        globeInstance
          .htmlElementsData(airportPointsData)
          .htmlAltitude(
            (d) => (maxCount > 0 ? (d.count / maxCount) * 0.2 : 0.01) + 0.03
          );
      })

      /**
       * EVENT 2: Klick auf den Globus-Hintergrund (Reset)
       */
      .onGlobeClick(() => {
        // Wenn der Story-Modus aktiv war, beende ihn jetzt vollständig.
        if (isStoryModeActive) {
          toggleStoryMode(); // Setzt Button, Linien & Status zurück
        }

        console.log("Fokus zurücksetzen");
        // 1. Slider aktivieren und auf MAX setzen
        sliderEl.disabled = false;
        sliderEl.value = sortedFlights.length - 1;
        if (lastFlight) {
          // Zeigt den Label-Text für den letzten Flug
          labelEl.textContent = `${lastFlight.date} (#${lastFlight.flightLogNumber})`;
        }

        // 2. Globus mit den SCHNELLEN Daten (progressiveData) zurücksetzen
        globeInstance.arcsData(progressiveData.arcData);
        globeInstance
          .polygonsData(countries.features)
          .polygonCapColor((feat) => {
            const isVisited = initialData.visitedCountries.includes(
              feat.properties.ISO_A2
            );
            return isVisited
              ? "rgba(147, 51, 234, 0.5)"
              : "rgba(100, 100, 100, 0.2)";
          });
        globeInstance
          .pointsData(progressiveData.airportPointsData) // <-- Korrekt
          .pointRadius(
            (d) =>
              0.1 +
              (progressiveData.maxCount > 0 // ✅ KORRIGIERT
                ? (d.count / progressiveData.maxCount) * 0.4 // ✅ KORRIGIERT
                : 0)
          )
          .pointAltitude((d) =>
            progressiveData.maxCount > 0 // ✅ KORRIGIERT
              ? (d.count / progressiveData.maxCount) * 0.2 // ✅ KORRIGIERT
              : 0.01
          );
        globeInstance
          .htmlElementsData(progressiveData.airportPointsData) // <-- Korrekt
          .htmlAltitude(
            (d) =>
              (progressiveData.maxCount > 0 // ✅ KORRIGIERT
                ? (d.count / progressiveData.maxCount) * 0.2 // ✅ KORRIGIERT
                : 0.01) + 0.03
          );

        // 3. Ansicht herauszoomen und Rotation starten
        globeInstance.pointOfView({ altitude: 3.5 }, 1000); // Zoomt auf globale Ansicht
        globeInstance.controls().autoRotate = true;
      })

      /**
       * EVENT 3: Klick auf ein Land (Polygon)
       */
      .onPolygonClick((polygon) => {
        // ✅ NEU: Story-Modus automatisch beenden
        if (isStoryModeActive) {
          toggleStoryMode();
        }
        console.log("Fokus auf Land:", polygon.properties.ADMIN);

        // 1. Rotation stoppen & Slider deaktivieren
        globeInstance.controls().autoRotate = false;
        sliderEl.disabled = true;

        const countryCode = polygon.properties.ISO_A2; // z.B. "ES" für Spanien
        const countryName = polygon.properties.ADMIN; // z.B. "Spain"
        labelEl.textContent = `${getTranslation("globe.focus") || "Focus"}: ${countryName} (${countryCode})`;

        // 2. Zur Polygon fliegen (Kamerasteuerung)
        let centerCoords;
        const geometryType = polygon.geometry.type;

        if (geometryType === "MultiPolygon") {
          // Nimm den ersten Punkt des ersten Polygons der Inselgruppe (z.B. für Japan)
          centerCoords = polygon.geometry.coordinates[0][0][0];
        } else if (geometryType === "Polygon") {
          // Nimm den ersten Punkt des Polygons (z.B. für Spanien)
          centerCoords = polygon.geometry.coordinates[0][0];
        }

        if (centerCoords && centerCoords.length === 2) {
          // WICHTIG: GeoJSON ist [lng, lat], pointOfView ist { lat, lng }
          globeInstance.pointOfView(
            { lat: centerCoords[1], lng: centerCoords[0], altitude: 2.5 },
            1000
          );
        } else {
          // Fallback, falls die Koordinaten ungültig sind
          console.error(
            "Konnte keinen Mittelpunkt für das Polygon finden:",
            polygon.properties.ADMIN
          );
        }

        // 3. Flüge nur für dieses Land filtern
        // 'sortedFlights' ist die globale Liste aus openGlobeModal
        const focusedFlights = sortedFlights.filter((f) => {
          // Prüfe, ob der Ländercode im airportData-Cache existiert
          const depCountry = airportData[f.departure]?.country_code;
          const arrCountry = airportData[f.arrival]?.country_code;
          return depCountry === countryCode || arrCountry === countryCode;
        });

        // 4. Daten neu verarbeiten (zeigt nur noch Flüge & Punkte für dieses Land an)
        const { arcData, visitedCountries, airportPointsData, maxCount } =
          processGlobeData(focusedFlights);

        // 5. Globus mit den FOKUSSIERTEN Daten aktualisieren
        globeInstance.arcsData(arcData);
        globeInstance
          .polygonsData(countries.features)
          .polygonCapColor((feat) => {
            // Hebe das geklickte Land ODER besuchte Länder hervor
            const isClicked = feat.properties.ISO_A2 === countryCode;
            const isVisited = visitedCountries.includes(feat.properties.ISO_A2);
            // Geklicktes Land bekommt eine andere Farbe (z.B. Pink)
            return isClicked
              ? "rgba(236, 72, 153, 0.7)"
              : isVisited
                ? "rgba(147, 51, 234, 0.5)"
                : "rgba(100, 100, 100, 0.2)";
          });
        globeInstance
          .pointsData(airportPointsData)
          .pointRadius(
            (d) => 0.1 + (maxCount > 0 ? (d.count / maxCount) * 0.4 : 0)
          )
          .pointAltitude((d) =>
            maxCount > 0 ? (d.count / maxCount) * 0.2 : 0.01
          );
        globeInstance
          .htmlElementsData(airportPointsData)
          .htmlAltitude(
            (d) => (maxCount > 0 ? (d.count / maxCount) * 0.2 : 0.01) + 0.03
          );
      })

      /**
       * EVENT 4: Klick auf eine Flugroute (Arc)
       */
      .onArcClick((arc) => {
        // ✅ NEUE PRÜFUNG:
        // Im "Normalen Modus" (Präsentation) passiert bei Klick nichts.
        if (!isStoryModeActive) {
          return;
        }

        if (!arc) return; // Sicherheitsabfrage

        // Wir prüfen das neue Array, das wir in Schritt 1 hinzugefügt haben
        if (arc.allFlightsOnRoute && arc.allFlightsOnRoute.length > 1) {
          // --- MEHRERE FLÜGE (STAPEL) GEFUNDEN ---
          // Rufe eine neue Funktion auf, um die Auswahlliste zu zeigen
          showFlightDisambiguationModal(arc.allFlightsOnRoute);
        } else if (arc.originalFlight) {
          // --- NUR EIN FLUG GEFUNDEN ---
          // Rufe die normale Detail-Funktion auf
          showFlightDetailsInModal(arc.originalFlight);
        } else {
          console.warn("Arc-Klick ohne originalFlight-Daten:", arc);
        }
      })

      /**
       * NEU: EVENT 5: Hover über eine Flugroute (Arc)
       */
      // --- 5. HOVER EFFEKT (Bugfix: Reset muss identisch sein!) ---
            .onArcHover((arc) => {
                const globeContainer = document.getElementById("globe-container");
                globeContainer.style.cursor = arc ? "pointer" : "grab";

                if (arc) {
                    // +++ HOVER (Maus drauf) +++
                    globeInstance.arcColor((d) => d === arc ? "#ffffff" : (
                        isStoryModeActive 
                            ? (d.isActive ? "#00ffff" : hexToRgba(d.color, 0.4)) // ✅ Korrigiert
                            : d.color
                    ));
                    
                    globeInstance.arcStroke((d) => d === arc ? 1.5 : (
                        isStoryModeActive ? (d.isActive ? 2.5 : 0.8) : 0.5 // ✅ Korrigiert (0.8 statt 0.3)
                    ));

                    globeInstance.arcLabel((d) => d === arc ? d.name : "");

                } else {
                    // +++ RESET (Maus weg) - HIER WAR DER FEHLER +++
                    
                    globeInstance.arcColor((d) => {
                        if (isStoryModeActive) {
                            return d.isActive ? "#00ffff" : hexToRgba(d.color, 0.4); // ✅ Jetzt identisch zu oben
                        }
                        return d.color;
                    });
                    
                    globeInstance.arcStroke((d) => {
                        if (isStoryModeActive) {
                            return d.isActive ? 2.5 : 0.8; // ✅ Jetzt identisch zu oben (0.8)
                        }
                        return 0.5;
                    });
                    
                    globeInstance.arcLabel((d) => d.name);
                }
            })
    // +++ ENDE EVENT-HANDLER +++

    globeInstance.controls().autoRotate = true;
    globeInstance.controls().autoRotateSpeed = 0.2;
    globeInstance.controls().enableZoom = true;

    // --- EVENT LISTENER FÜR SLIDER (Wird nur einmal hinzugefügt) ---
    sliderEl.addEventListener("input", () => {
      // Wenn der Story-Modus aktiv war, beende ihn jetzt vollständig.
      if (isStoryModeActive) {
        toggleStoryMode(); // Dies setzt den Button-Text und den Status zurück
      }

      // +++ ANPASSUNG: Slider-Bewegung bricht den Fokus-Modus +++
      globeInstance.controls().autoRotate = true; // Rotation wieder starten
      sliderEl.disabled = false; // Slider (falls deaktiviert) wieder aktivieren

      const selectedIndex = parseInt(sliderEl.value, 10);
      const currentFlight = sortedFlights[selectedIndex];

      const newLabelText = `${currentFlight.date} (#${currentFlight.flightLogNumber}: ${currentFlight.departure} → ${currentFlight.arrival})`;

      // Den "normalen" Text immer speichern, falls wir ihn brauchen
      normalGlobeLabelText = newLabelText;

      // Das Label nur aktualisieren, wenn der Story-Modus NICHT aktiv ist
      if (!isStoryModeActive) {
        labelEl.textContent = newLabelText;
      }

      const filteredFlights = sortedFlights.slice(0, selectedIndex + 1);
      const { arcData, visitedCountries, airportPointsData, maxCount } =
        processGlobeData(filteredFlights);

      // 4. Globus-Schichten mit den neuen Daten aktualisieren
      globeInstance.arcsData(arcData);
      globeInstance.polygonsData(countries.features).polygonCapColor((feat) => {
        const isVisited = visitedCountries.includes(feat.properties.ISO_A2);
        return isVisited
          ? "rgba(147, 51, 234, 0.5)"
          : "rgba(100, 100, 100, 0.2)";
      });
      globeInstance
        .pointsData(airportPointsData)
        .pointRadius(
          (d) => 0.1 + (maxCount > 0 ? (d.count / maxCount) * 0.4 : 0)
        )
        .pointAltitude((d) =>
          maxCount > 0 ? (d.count / maxCount) * 0.2 : 0.01
        );
      globeInstance
        .htmlElementsData(airportPointsData)
        .htmlAltitude(
          (d) => (maxCount > 0 ? (d.count / maxCount) * 0.2 : 0.01) + 0.03
        );
    });
  }

  // --- 3. DATEN-UPDATE (Läuft bei jedem Öffnen) ---
  else {
    // ✅ NEU: 'else' hinzugefügt

    // Setzt den Globus auf den "vollen" Zustand zurück
    sliderEl.disabled = false; // Sicherstellen, dass Slider aktiv ist
    sliderEl.value = sortedFlights.length - 1; // Sicherstellen, dass Slider auf MAX steht
    if (lastFlight) {
      labelEl.textContent = `${lastFlight.date} (#${lastFlight.flightLogNumber})`;
    }

    //// globeInstance.arcsData(initialData.arcData);
    globeInstance.arcsData(progressiveData.arcData); // <-- HIER
    globeInstance
      .polygonsData(countriesGeoJSON.features)
      .polygonCapColor((feat) => {
        const isVisited = initialData.visitedCountries.includes(
          feat.properties.ISO_A2
        );
        return isVisited
          ? "rgba(147, 51, 234, 0.5)"
          : "rgba(100, 100, 100, 0.2)";
      });
    globeInstance
      //// .pointsData(initialData.airportPointsData)
      .pointsData(progressiveData.airportPointsData) // <-- HIER
      .pointRadius(
        (d) =>
          0.1 +
          (progressiveData.maxCount > 0 // ✅ KORRIGIERT
            ? (d.count / progressiveData.maxCount) * 0.4 // ✅ KORRIGIERT
            : 0)
      )
      .pointAltitude((d) =>
        //// initialData.maxCount > 0
        progressiveData.maxCount > 0 // <-- HIER
          ? (d.count / progressiveData.maxCount) * 0.2
          : 0.01
      );
    globeInstance
      //// .htmlElementsData(initialData.airportPointsData)
      .htmlElementsData(progressiveData.airportPointsData) // <-- HIER
      .htmlAltitude(
        (d) =>
          ////(initialData.maxCount > 0
          (progressiveData.maxCount > 0 // <-- HIER
            ? (d.count / progressiveData.maxCount) * 0.2
            : 0.01) + 0.03
      );

	// RESPONSIVE RESIZE
        // ✅ NEU: Robuster Resize-Listener mit Delay & Zentrierung
        const handleResize = () => {
            const container = document.getElementById("globe-container");
            if (globeInstance && container) {
                // 1. Neue Dimensionen holen
                const w = container.clientWidth;
                const h = container.clientHeight;

                // 2. Dem Globus die neuen Maße geben
                globeInstance.width(w);
                globeInstance.height(h);
                
                // 3. WICHTIG: Erzwinge ein Kamera-Update, um Verzerrungen zu vermeiden
                // Wir lesen die aktuelle Position und setzen sie neu. Das triggert intern ein Update der Projektionsmatrix.
                const currentPos = globeInstance.pointOfView();
                globeInstance.pointOfView(currentPos); 
            }
        };

        // A) Event Listener für Fenster-Größenänderung (Drehen)
        window.addEventListener('resize', handleResize);
        
        // B) Einmaliger Aufruf kurz nach dem Start (Fängt initiale Layout-Verschiebungen ab)
        setTimeout(handleResize, 200);

    globeInstance.controls().autoRotate = true;
  } // Ende des 'else'
  window.globeDebugLogged = false;
}

function closeGlobeModal() {
  document.getElementById("globe-modal").classList.add("hidden");
  if (globeInstance) globeInstance.controls().autoRotate = false;
  if (isStoryModeActive) toggleStoryMode();
}

function toggleStoryMode() {
  if (!globeInstance) return;
  isStoryModeActive = !isStoryModeActive;
  const btn = document.getElementById("globe-story-mode-btn");
  const label = document.getElementById("globe-time-label");

  if (isStoryModeActive) {
    globeInstance.controls().autoRotate = false;
    btn.textContent =
      getTranslation("globe.buttonNormalMode") || "🚀 Normaler Modus";
    label.textContent =
      getTranslation("globe.storyModeHint") ||
      "Story-Modus: Flüge anklicken...";
    btn.classList.remove("bg-blue-600", "hover:bg-blue-700");
    btn.classList.add("bg-green-600", "hover:bg-green-700");
    normalGlobeLabelText = label.textContent;
    globeInstance.arcStroke((d) => (d.distance < 1000 ? 2.0 : 1.5));
  } else {
    globeInstance.controls().autoRotate = true;
    btn.textContent =
      getTranslation("globe.buttonStoryMode") || "📖 Story-Modus";
    btn.classList.remove("bg-green-600", "hover:bg-green-700");
    btn.classList.add("bg-blue-600", "hover:bg-blue-700");
    label.textContent = normalGlobeLabelText;
    globeInstance.arcStroke((d) => (d.distance < 1000 ? 0.6 : 0.5));
  }
}

// CHRONIK ANIMATION HELPER
function interpolatePoints(startLat, startLng, endLat, endLng, steps) {
  const points = [];
  const deltaLat = (endLat - startLat) / steps;
  const deltaLng = (endLng - startLng) / steps;
  for (let i = 0; i <= steps; i++) {
    points.push([startLat + deltaLat * i, startLng + deltaLng * i]);
  }
  return points;
}

function stopAnimation() {
  animationState = "stopped";
  animationStartIndex = 0;
  const btn = document.getElementById("play-chronicle-btn");
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = getTranslation("flights.playChronicle");
  }
}

async function animateTravelChronicle() {
  const btn = document.getElementById("play-chronicle-btn");
  if (animationState === "stopped") {
    map.invalidateSize();
    map.setView([20, 0], 2);
    await delay(150);
  }
  if (animationState === "running") {
    animationState = "paused";
    btn.innerHTML = getTranslation("flights.continueChronicle");
    return;
  }
  if (animationState === "paused") {
    animationState = "running";
    btn.innerHTML = getTranslation("flights.pauseChronicle");
    runAnimationLoop();
    return;
  }
  animationState = "running";
  animationStartIndex = 0;
  btn.innerHTML = getTranslation("flights.pauseChronicle");
  runAnimationLoop();
}

/**
 * Die Haupt-Animationsschleife (ausgelagert für Pause/Fortsetzen).
 */
async function runAnimationLoop() {
  const mapInfo = document.getElementById("map-info");

  // Nur beim allerersten Start (Reset) die Karte leeren
  if (animationStartIndex === 0) {
    routeLayer.clearLayers();
    map.setView([20, 0], 2);
    await delay(100); // Kurze Pause nach dem Reset
  }

  const allFlights = await getFlights();
  if (allFlights.length === 0) {
    mapInfo.textContent = getTranslation("anim.noFlights");
    stopAnimation();
    return;
  }

  const sortedFlights = resequenceAndAssignNumbers(allFlights);
  const chronicleColors = [
    "#312E81",
    "#10B981",
    "#E11D48",
    "#14B8A6",
    "#D97706",
  ];

  try {
    // Starte die Schleife bei dem Flug, bei dem pausiert wurde (oder 0)
    for (let i = animationStartIndex; i < sortedFlights.length; i++) {
      // KORREKTUR 2 (PAUSE-FIX):
      // Die Prüfung findet jetzt VOR dem Zeichnen des nächsten Flugs statt.
      if (animationState !== "running") {
        animationStartIndex = i; // Speichere den Index des NÄCHSTEN Flugs

        if (animationState === "paused") {
          //mapInfo.textContent = `Animation pausiert. Bereit für Flug #${sortedFlights[i].flightLogNumber}.`;
          mapInfo.textContent = getTranslation("anim.paused").replace("{count}", sortedFlights[i].flightLogNumber);
        }
        return; // Beende die Funktion, die Schleife wird hier unterbrochen
      }

      const flight = sortedFlights[i];
      const color = chronicleColors[i % chronicleColors.length];

      if (flight.depLat && flight.arrLat) {
        mapInfo.textContent = `Flug ${flight.flightLogNumber} / ${sortedFlights.length}: ${flight.date} von ${flight.departure} nach ${flight.arrival}`;

        L.marker([flight.depLat, flight.depLon]).addTo(routeLayer);
        L.marker([flight.arrLat, flight.arrLon]).addTo(routeLayer);

        // Der Zoom-Fix (durch das Warten in animateTravelChronicle) sollte jetzt greifen
        map.fitBounds(
          [
            [flight.depLat, flight.depLon],
            [flight.arrLat, flight.arrLon],
          ],
          { padding: [50, 50] }
        );

        const animationSteps = 40;
        const animationDurationMs = 3000;
        const delayPerStep = animationDurationMs / animationSteps;
        const points = interpolatePoints(
          flight.depLat,
          flight.depLon,
          flight.arrLat,
          flight.arrLon,
          animationSteps
        );

        const animatedPath = L.polyline([], {
          color: color,
          weight: 2.5,
          opacity: 0.8,
        }).addTo(routeLayer);
        const decorator = L.polylineDecorator(animatedPath, {
          patterns: [
            {
              offset: "100%",
              repeat: 0,
              symbol: L.Symbol.arrowHead({
                pixelSize: 12,
                pathOptions: { color: color, fillOpacity: 1, weight: 0 },
              }),
            },
          ],
        }).addTo(routeLayer);

        const iconHtml = `<span style="color: ${color};">#${flight.flightLogNumber}</span>`;
        const flightMarkerIcon = L.divIcon({
          html: iconHtml,
          className: "animated-flight-marker",
          iconSize: [30, 20],
        });
        const flightMarker = L.marker(points[0], {
          icon: flightMarkerIcon,
        }).addTo(routeLayer);

        // Diese innere Schleife läuft jetzt immer bis zum Ende durch
        for (let p = 0; p < points.length; p++) {
          animatedPath.addLatLng(points[p]);
          decorator.setPaths(animatedPath);
          flightMarker.setLatLng(points[p]);
          await delay(delayPerStep);
        }

        const centerLatLng = animatedPath.getCenter();
        flightMarker.setLatLng(centerLatLng);
      }
    } // Ende der 'for'-Schleife

    if (animationState === "running") {
      mapInfo.textContent = getTranslation("anim.finished").replace("{count}", sortedFlights.length);
    }
  } catch (error) {
    console.error("Fehler bei der Reise-Chronik Animation:", error);
    mapInfo.textContent = "Animation fehlgeschlagen.";
  } finally {
    // Setzt den Zustand zurück, WENN die Animation nicht pausiert wurde
    if (animationState !== "paused") {
      stopAnimation();
    }
  }
}

// map.js - Am Ende der Datei einfügen

async function takeGlobeScreenshot() {
  if (!globeInstance) return;

  // 1. Visuelles Feedback
  showMessage(
      getTranslation("globe.screenshotWaitTitle") || "Moment...", 
      getTranslation("globe.screenshotWaitMsg") || "Screenshot wird erstellt 📸", 
      "info"
  );

  // 2. Kurz warten & Rendern erzwingen
  // (Verhindert schwarze Bilder bei preserveDrawingBuffer)
  globeInstance.renderer().render(globeInstance.scene(), globeInstance.camera());

  // 3. Bilddaten holen
  const dataURL = globeInstance.renderer().domElement.toDataURL("image/png");

  // 4. Prüfen: Native App oder Browser?
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

  if (isNative) {
    // --- ANDROID / NATIVE: ÜBER DATEISYSTEM TEILEN ---
    try {
        const { Share, Filesystem } = Capacitor.Plugins;

        if (!Filesystem) {
            throw new Error("Filesystem Plugin fehlt. Bitte installieren.");
        }

        // A) Base64 Header entfernen, um reine Daten zu bekommen
        const base64Data = dataURL.split(',')[1];
        const fileName = 'aviosphere_' + new Date().getTime() + '.png';

        // B) Bild als Datei in den Cache schreiben
        const result = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: 'CACHE' // Speichert im temporären Cache-Ordner der App
        });

        // C) Den Pfad (URI) dieser Datei teilen
        await Share.share({
            title: 'AvioSphere 3D',
            text: 'Schau dir meine Flüge auf AvioSphere an! ✈️🌍',
            files: [result.uri] 
        });

    } catch (e) {
        console.error("Fehler beim nativen Teilen:", e);
        // Nur Fehler anzeigen, wenn es nicht der User selbst abgebrochen hat
        if (e.message !== 'Share canceled') {
             showMessage(
                getTranslation("globe.screenshotErrorGenericTitle") || "Ups", 
                "Fehler beim Teilen: " + e.message, // Zeigt den echten Grund an
                "error"
            );
        }
    }

  } else {
    // --- WEB BROWSER: EINFACHER DOWNLOAD ---
    const link = document.createElement("a");
    link.download = `aviosphere_globe_${new Date().toISOString().slice(0,10)}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showMessage(
        getTranslation("globe.screenshotSuccessTitle") || "Gespeichert", 
        getTranslation("globe.screenshotSuccessMsg") || "Screenshot wurde heruntergeladen.", 
        "success"
    );
  }
}
