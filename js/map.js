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

// --- NEU: Custom Tooltip CSS für die 2D-Karte injizieren ---
if (!document.getElementById('custom-map-tooltip-style')) {
    const style = document.createElement('style');
    style.id = 'custom-map-tooltip-style';
    style.innerHTML = `
        .custom-map-tooltip {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
        }
        .custom-map-tooltip::before, .custom-map-tooltip::after {
            display: none !important; /* Entfernt den weißen Pfeil von Leaflet */
        }
    `;
    document.head.appendChild(style);
}

// --- NEU: Wunderschöner HTML-Tooltip Generator für Strecken ---
window.buildMapTooltipHtml = function(flight, count) {
    const flightsLabel = (getTranslation("map.flightsCount") || "{count} Flüge").replace("{count}", count);
    const countText = count > 1 ? `<div style="background: #4f46e5; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; display: inline-block; margin-top: 5px; font-weight: bold;">${flightsLabel}</div>` : '';
    
    let imgHtml = "";
    if (flight.planespotters_url) {
        // Planespotters Bild
        imgHtml = `<div style="position: relative;"><img src="${flight.planespotters_url}" style="width: 100%; height: 90px; object-fit: cover; border-bottom: 1px solid #374151;"></div>`;
    } else if (flight.photo_url && flight.photo_url.length > 0) {
        // Eigenes Bild
        imgHtml = `<img src="${flight.photo_url[0]}" style="width: 100%; height: 90px; object-fit: cover; border-bottom: 1px solid #374151;">`;
    } else {
         // Eleganter Fallback-Farbverlauf ohne Bild
         imgHtml = `<div style="width: 100%; height: 35px; background: linear-gradient(to right, #4f46e5, #ec4899); border-bottom: 1px solid #374151;"></div>`;
    }

    return `
        <div style="background: rgba(17, 24, 39, 0.95); border: 1px solid #374151; border-radius: 10px; min-width: 170px; text-align: center; font-family: 'Inter', sans-serif; box-shadow: 0 10px 25px rgba(0,0,0,0.5); overflow: hidden; pointer-events: none;">
            ${imgHtml}
            <div style="padding: 10px 12px 12px 12px; line-height: 1.3;">
                <div style="font-weight: 900; color: white; font-size: 15px; letter-spacing: 0.5px;">${flight.departure} <span style="color: #6366f1;">➔</span> ${flight.arrival}</div>
                ${flight.airline ? `<div style="color: #d1d5db; font-size: 12px; font-weight: 600; margin-top: 4px;">${flight.airline}</div>` : ''}
                ${flight.aircraftType ? `<div style="color: #9ca3af; font-size: 10px; margin-top: 1px;">${flight.aircraftType}</div>` : ''}
                ${countText}
            </div>
        </div>
    `;
};

// --- NEU: Wunderschöner HTML-Tooltip Generator für Flughäfen ---
window.buildAirportTooltipHtml = function(name, code, subtitle) {
    return `
        <div style="background: rgba(17, 24, 39, 0.95); border: 1px solid #374151; border-radius: 8px; padding: 10px 14px; text-align: center; font-family: 'Inter', sans-serif; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); pointer-events: none;">
            <div style="font-weight: 900; color: white; font-size: 15px;">${name} <span style="color: #9ca3af; font-weight: normal;">(${code})</span></div>
            ${subtitle ? `<div style="color: #6366f1; font-size: 13px; margin-top: 4px; font-weight: bold;">${subtitle}</div>` : ''}
        </div>
    `;
};

window.drawRouteOnMap = async function (
  depLat,
  depLon,
  arrLat,
  arrLon,
  depCode,
  arrCode,
  depName,
  arrName,
  flightData // <-- NEU: Das Flug-Objekt für den Tooltip
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

  // --- NEU: Schicke Hover-Tooltips für Abflug und Ankunft ---
  const depHtml = window.buildAirportTooltipHtml(depName, depCode, `🛫 ${getTranslation("map.departure") || "Abflug"}`);
  const arrHtml = window.buildAirportTooltipHtml(arrName, arrCode, `🛬 ${getTranslation("map.arrival") || "Ankunft"}`);

  // bindTooltip statt bindPopup macht es zum Hover-Effekt!
  const depMarker = L.marker([depLat, depLon]).bindTooltip(depHtml, { sticky: true, className: 'custom-map-tooltip' });
  const arrMarker = L.marker([arrLat, arrLon]).bindTooltip(arrHtml, { sticky: true, className: 'custom-map-tooltip' });

  const flightPath = L.polyline(
    [
      [depLat, depLon],
      [arrLat, arrLon],
    ],
    { color: "#10B981", weight: 3 }
  );

  // --- 🎯 DER TRICK: Unsichtbare, extra dicke Hitbox für fette Finger ---
  const hitBox = L.polyline(
    [
      [depLat, depLon],
      [arrLat, arrLon],
    ],
    { color: "transparent", weight: 30, opacity: 0 } // 30px breiter Klick-Bereich!
  );

  // --- NEU: Hover & Klick hängen jetzt an der dicken Hitbox ---
  if (flightData) {
      const popupHtml = window.buildMapTooltipHtml(flightData, 1);
      hitBox.bindTooltip(popupHtml, { sticky: true, className: 'custom-map-tooltip' });
      hitBox.on('click', () => {
          if (typeof showFlightDetailsInModal === 'function') {
              showFlightDetailsInModal(flightData);
          }
      });
  }
  // ----------------------------------------------

  routeLayer.addLayer(depMarker);
  routeLayer.addLayer(arrMarker);
  routeLayer.addLayer(flightPath);
  routeLayer.addLayer(hitBox); // <--- WICHTIG: Die Hitbox zur Karte hinzufügen

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

  const returnFlightContainer = document.getElementById("return-flight-container");
  const returnFlightBtn = document.getElementById("return-flight-btn");
  returnFlightBtn.setAttribute("onclick", `prefillReturnFlight('${arrCode}', '${depCode}')`);
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
          flights: []
        };
      }
      routeGroups[routeKey].flightNumbers.push(flight.flightLogNumber);
      routeGroups[routeKey].flights.push(flight);
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

    // --- 🎯 DER TRICK: Unsichtbare Hitbox für die Gesamtansicht ---
    const hitBox = L.polyline(group.latLngs, {
      color: "transparent",
      weight: 35, // Noch etwas dicker (35px), da man hier öfter rauszoomt
      opacity: 0
    });

    // --- Schicker Tooltip & Klick-Action hängen an der Hitbox ---
    const sampleFlight = group.flights[0];
    const popupHtml = window.buildMapTooltipHtml(sampleFlight, group.flights.length);
    
    hitBox.bindTooltip(popupHtml, { 
        sticky: true, 
        className: 'custom-map-tooltip' 
    });

    hitBox.on('click', () => {
        if (group.flights.length > 1) {
            showFlightDisambiguationModal(group.flights);
        } else {
            showFlightDetailsInModal(sampleFlight); 
        }
    });
    // -------------------------------------------------------------
    
    flightPath.addTo(routeLayer);
    hitBox.addTo(routeLayer); // <--- Hitbox als unsichtbaren Layer drauflegen

    bounds.push(group.latLngs[0]);
    bounds.push(group.latLngs[1]);
  });

  Object.keys(uniqueAirports).forEach((iataCode) => {
    const airport = uniqueAirports[iataCode];
    const marker = L.marker([airport.lat, airport.lon]);
    
    // NEU: Schicker Hover-Tooltip für alle Flughäfen
    const popupHtml = window.buildAirportTooltipHtml(airport.name, iataCode, "📍 " + (getTranslation("map.airport") || "Flughafen"));
    marker.bindTooltip(popupHtml, { sticky: true, className: 'custom-map-tooltip' });
    
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
      //.globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .globeImageUrl("pictures/earth-night.jpg")
      .arcsData(progressiveData.arcData)
      // --- NEU: Reichhaltiger Tooltip für die Routen (Hover) ---
      .arcLabel((d) => window.buildMapTooltipHtml(d.originalFlight, d.allFlightsOnRoute ? d.allFlightsOnRoute.length : 1))
            
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
          const visitText = d.count > 1 ? getTranslation("globe.visits") || "Besuche" : getTranslation("globe.visit") || "Besuch";
          return `
              <div style="background: rgba(17, 24, 39, 0.95); border: 1px solid #374151; border-radius: 8px; padding: 10px 14px; text-align: center; font-family: 'Inter', sans-serif; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);">
                  <div style="font-weight: 900; color: white; font-size: 15px;">${d.name} <span style="color: #9ca3af; font-weight: normal;">(${d.code})</span></div>
                  <div style="color: #6366f1; font-size: 13px; margin-top: 4px; font-weight: bold;">📍 ${d.count} ${visitText}</div>
              </div>
          `;
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

                    // --- NEU: Tooltip Update (Hover State) ---
                    globeInstance.arcLabel((d) => d === arc ? window.buildMapTooltipHtml(d.originalFlight, d.allFlightsOnRoute ? d.allFlightsOnRoute.length : 1) : "");

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
                    
                    // --- NEU: Tooltip Reset ---
                    globeInstance.arcLabel((d) => window.buildMapTooltipHtml(d.originalFlight, d.allFlightsOnRoute ? d.allFlightsOnRoute.length : 1));
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

// ==========================================
// CHRONIK ANIMATION HELPER (Perfektioniert)
// ==========================================

// Globale Variablen für den Animations-Status
window.animationState = "stopped";
window.animationStartIndex = 0;

function interpolatePoints(startLat, startLng, endLat, endLng, steps) {
  const points = [];
  const deltaLat = (endLat - startLat) / steps;
  const deltaLng = (endLng - startLng) / steps;
  for (let i = 0; i <= steps; i++) {
    points.push([startLat + deltaLat * i, startLng + deltaLng * i]);
  }
  return points;
}

// 🚀 NEU: Echte, dedizierte Steuerungs-Funktionen
window.stopTravelChronicle = function() {
  window.animationState = "stopped";
  window.animationStartIndex = 0;
};

window.pauseTravelChronicle = function() {
  if (window.animationState === "running") {
      window.animationState = "paused";
  }
};

window.resumeTravelChronicle = function() {
  if (window.animationState === "paused") {
      window.animationState = "running";
      // 🚀 BUGHUNT FIX: KEIN neuer Aufruf von runAnimationLoop() hier! 
      // Die ursprüngliche Schleife schläft ja nur und wacht jetzt von selbst auf.
  }
};

// Fallback für alte Aufrufe (falls noch vorhanden)
window.stopAnimation = window.stopTravelChronicle;

window.animateTravelChronicle = async function() {
  if (window.animationState === "stopped") {
    map.invalidateSize();
    map.setView([20, 0], 2);
    await delay(150);
  }
  window.animationState = "running";
  window.animationStartIndex = 0; // Immer bei 0 anfangen, wenn "Start" gedrückt wird
  runAnimationLoop();
};

/**
 * Die Haupt-Animationsschleife.
 */
async function runAnimationLoop() {
  const mapInfo = document.getElementById("map-info");

  // Nur beim allerersten Start (Reset) die Karte leeren
  if (window.animationStartIndex === 0) {
    routeLayer.clearLayers();
    map.setView([20, 0], 2);
    await delay(100); 
  }

  // 🚀 BUGHUNT FIX: Flüge intelligent laden (Demo vs. Filter vs. Datenbank)
  const allFlights = (typeof isDemoMode !== 'undefined' && isDemoMode && window.flights) 
        ? window.flights 
        : (typeof currentlyFilteredFlights !== 'undefined' && currentlyFilteredFlights ? currentlyFilteredFlights : await getFlights());

  if (!allFlights || allFlights.length === 0) {
    if(mapInfo) mapInfo.textContent = getTranslation("anim.noFlights") || "Keine Flüge vorhanden.";
    window.stopTravelChronicle();
    if (typeof updateChronicleUI === 'function') updateChronicleUI('stopped');
    return;
  }

  const sortedFlights = typeof resequenceAndAssignNumbers === 'function' ? resequenceAndAssignNumbers(allFlights) : allFlights;
  const chronicleColors = [
    "#312E81",
    "#10B981",
    "#E11D48",
    "#14B8A6",
    "#D97706",
  ];

  try {
    for (let i = window.animationStartIndex; i < sortedFlights.length; i++) {
      
      // --- ALTE, FALSCHE LOGIK LÖSCHEN ---
      // if (window.animationState !== "running") {
      //   window.animationStartIndex = i; 
      //   if (window.animationState === "paused") { ... }
      //   return; 
      // }
      // -----------------------------------

      // 🚀 BUGHUNT FIX: RICHTIGE LOGIK (Einfach schlafen, anstatt abzubrechen!)
      while (window.animationState === "paused") {
          if(mapInfo) mapInfo.textContent = (getTranslation("anim.paused") || "Pausiert").replace("{count}", sortedFlights[i].flightLogNumber || (i+1));
          await delay(100);
      }
      if (window.animationState === "stopped") return;

      const flight = sortedFlights[i];
      const color = chronicleColors[i % chronicleColors.length];

      if (flight.depLat && flight.arrLat) {
        if(mapInfo) mapInfo.textContent = (getTranslation("map.animationProgress") || "Flug {number} / {total}: {date} von {dep} nach {arr}")
          .replace("{number}", flight.flightLogNumber || (i+1))
          .replace("{total}", sortedFlights.length)
          .replace("{date}", flight.date)
          .replace("{dep}", flight.departure)
          .replace("{arr}", flight.arrival);

        L.marker([flight.depLat, flight.depLon]).addTo(routeLayer);
        L.marker([flight.arrLat, flight.arrLon]).addTo(routeLayer);

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

        const iconHtml = `<span style="color: ${color};">#${flight.flightLogNumber || (i+1)}</span>`;
        const flightMarkerIcon = L.divIcon({
          html: iconHtml,
          className: "animated-flight-marker",
          iconSize: [30, 20],
        });
        const flightMarker = L.marker(points[0], {
          icon: flightMarkerIcon,
        }).addTo(routeLayer);

        // Die innere Schleife (Schritt für Schritt fliegen)
        for (let p = 0; p < points.length; p++) {
          
          // 🚀 BUGHUNT FIX: Harter Abbruch WÄHREND des Flugs, falls Stop gedrückt wird!
          if (window.animationState === "stopped") {
              return; 
          }
          
          // 🚀 BUGHUNT FIX: Millisekunden-genaue Pause WÄHREND das Flugzeug in der Luft ist!
          while (window.animationState === "paused") {
              await delay(100);
              if (window.animationState === "stopped") return;
          }

          animatedPath.addLatLng(points[p]);
          decorator.setPaths(animatedPath);
          flightMarker.setLatLng(points[p]);
          await delay(delayPerStep);
        }

        // 🚀 BUGHUNT FIX (Der getCenter Crash): 
        // Prüfe, ob die Map die Line noch hat (falls in genau dieser Millisekunde Stopp gedrückt wurde),
        // bevor getCenter aufgerufen wird!
        if (window.animationState === "running" && map.hasLayer(animatedPath) && animatedPath.getLatLngs().length > 0) {
            const centerLatLng = animatedPath.getCenter();
            flightMarker.setLatLng(centerLatLng);
        }
      }
    } // Ende for-Schleife

    // Wenn er komplett durchgelaufen ist:
    if (window.animationState === "running") {
      if(mapInfo) mapInfo.textContent = (getTranslation("anim.finished") || "Fertig").replace("{count}", sortedFlights.length);
      window.animationState = "stopped";
      window.animationStartIndex = 0;
      if (typeof updateChronicleUI === 'function') updateChronicleUI('stopped');
    }
    
  } catch (error) {
    console.error("Fehler bei der Reise-Chronik Animation:", error);
    if(mapInfo) mapInfo.textContent = getTranslation("map.animationFailed") || "Animation fehlgeschlagen.";
    window.animationState = "stopped";
    if (typeof updateChronicleUI === 'function') updateChronicleUI('stopped');
  }
}

async function takeGlobeScreenshot() {
  const modalElement = document.getElementById("globe-modal");
  if (!modalElement || modalElement.classList.contains("hidden")) return;

  // 1. UI-Elemente temporär verstecken (damit sie nicht auf dem Foto sind)
  // Wir wählen Buttons, Slider und das Label aus
  const uiElements = modalElement.querySelectorAll('button, #globe-slider-container');
  uiElements.forEach(el => el.style.visibility = 'hidden');

  try {
      // 2. Screenshot vom GESAMTEN Modal machen (inkl. Labels & Hintergrund)
      // Wir erzwingen Schwarz als Hintergrund, falls Transparenz Probleme macht
      const canvas = await html2canvas(modalElement, {
          useCORS: true,
          backgroundColor: '#000000', 
          scale: 2, // Hohe Qualität
          ignoreElements: (element) => {
              // Sicherstellen, dass keine Buttons versehentlich doch drauf sind
              return element.tagName === 'BUTTON';
          }
      });

      const dataURL = canvas.toDataURL("image/png");

      // 3. Zentrale Teilen-Funktion aufrufen
      if (typeof shareImageBase64 === 'function') {
          await shareImageBase64(dataURL, "aviosphere_globe");
      }

  } catch (err) {
      console.error("Fehler bei Globus-Screenshot:", err);
      if (typeof showMessage === 'function') {
          showMessage(
            getTranslation("toast.errorTitle") || "Fehler",
            getTranslation("messages.globeScreenshotError") || "Konnte Globus-Bild nicht erstellen.",
            "error"
          );
      }
  } finally {
      // 4. WICHTIG: UI-Elemente wieder sichtbar machen!
      uiElements.forEach(el => el.style.visibility = 'visible');
  }
}
