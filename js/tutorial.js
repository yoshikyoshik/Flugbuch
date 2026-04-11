// =================================================================
// NEUES APP-TOUR TUTORIAL (First Start)
// =================================================================

/**
 * Prüft, ob die neue App-Tour angezeigt werden soll.
 */
function showFirstStepsTutorial() {
  // Neuer Key: So sehen auch bestehende Nutzer die neue Tour genau 1x nach dem Update!
  if (localStorage.getItem("hasSeenAppTour_v1") === "true") {
    return; // Nutzer hat die neue Tour schon gesehen
  }

  // Das neue Modal einfach einblenden
  const tourModal = document.getElementById("tour-modal-overlay");
  if (tourModal) {
      tourModal.classList.remove("hidden");
  }
}

/**
 * Schließt die Tour und merkt sich, dass sie gesehen wurde.
 * Wird sowohl vom "First Start" als auch vom manuellen Aufruf im Profil genutzt.
 */
window.closeAppTour = function() {
  localStorage.setItem("hasSeenAppTour_v1", "true");
  
  const tourModal = document.getElementById("tour-modal-overlay");
  if (tourModal) {
      tourModal.classList.add("hidden");
  }
}