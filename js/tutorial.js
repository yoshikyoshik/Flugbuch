// =================================================================
// TUTORIAL
// =================================================================

/**
 * NEU: Prüft, ob das Tutorial angezeigt werden soll.
 */
function showFirstStepsTutorial() {
  // Wir verwenden v2, falls wir das Tutorial später aktualisieren wollen
  if (localStorage.getItem("hasSeenTutorial_v1") === "true") {
    return; // Nutzer hat es schon gesehen
  }

  // Übersetzungen holen
  const title = getTranslation("tutorial.title") || "Willkommen!";
  const content = `
        <p class="mb-4">${getTranslation("tutorial.intro")}</p>
        <ul class="space-y-3 list-disc list-inside">
          <li><strong>${getTranslation("tutorial.step1.title")}:</strong> ${getTranslation("tutorial.step1.desc")}</li>
          <li><strong>${getTranslation("tutorial.step2.title")}:</strong> ${getTranslation("tutorial.step2.desc")}</li>
          <li><strong>${getTranslation("tutorial.step3.title")}:</strong> ${getTranslation("tutorial.step3.desc")}</li>
        </ul>
        <button 
          id="tutorial-close-btn" 
          class="w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition mt-6">
          ${getTranslation("tutorial.button")}
        </button>
      `;

  // Modal füllen und öffnen
  document.getElementById("info-modal-title").textContent = title;
  document.getElementById("info-modal-content").innerHTML = content;
  openInfoModal(); // Öffnet das existierende Modal

  // Event-Listener für den neuen Button
  document
    .getElementById("tutorial-close-btn")
    .addEventListener("click", closeFirstStepsTutorial);
}

/**
 * NEU: Schließt das Tutorial und merkt sich, dass es gesehen wurde.
 */
function closeFirstStepsTutorial() {
  localStorage.setItem("hasSeenTutorial_v1", "true");
  closeInfoModal();
}
