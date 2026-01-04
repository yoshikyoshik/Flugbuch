// =================================================================
// BILLING LOGIC (RevenueCat & Supabase Sync)
// =================================================================

let isBillingInitialized = false;

/**
 * Initialisiert das Abrechnungssystem (RevenueCat für App).
 */
async function initializeBilling(userId) {
    if (isBillingInitialized) return;
    
    if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
        console.log("Billing: Native Umgebung erkannt. Starte RevenueCat...");
        try {
            const { Purchases } = Capacitor.Plugins;

            // Debug Logs für Testphase
            await Purchases.setLogLevel({ level: "DEBUG" });

            // 1. Konfigurieren (DEIN API KEY)
            await Purchases.configure({ apiKey: "goog_EfxrsdCgCxHiDvkvWYBemInPHxn" });

            // 2. Login mit Supabase ID
            if (userId) {
                await Purchases.logIn({ appUserID: userId });
            }

            // 3. Status prüfen
            await checkNativeSubscriptionStatus();

            // 4. Listener für Updates (Kauf, Verlängerung, Ablauf)
            Purchases.addCustomerInfoUpdateListener(async (info) => {
                console.log("Billing: Listener Event empfangen", info);
                await handleCustomerInfo(info);
            });

            isBillingInitialized = true;
        } catch (error) {
            console.error("Billing: Init Fehler:", error);
        }
    } else {
        console.log("Billing: Web Umgebung (Stripe).");
    }
}

/**
 * Prüft den aktuellen Status bei RevenueCat manuell.
 */
async function checkNativeSubscriptionStatus() {
    if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform()) return;

    try {
        const { Purchases } = Capacitor.Plugins;
        const customerInfo = await Purchases.getCustomerInfo();
        await handleCustomerInfo(customerInfo);
    } catch (e) {
        console.error("Billing: Fehler beim Status-Check:", e);
    }
}

/**
 * ZENTRALE FUNKTION: Verarbeitet den Status und updated ALLES (DB + UI)
 */
async function handleCustomerInfo(customerInfo) {
    const entitlement = customerInfo.entitlements.all["pro_access"]; // Name muss stimmen!
    const isProActive = entitlement && entitlement.isActive;

    // 1. Globalen Status setzen
    currentUserSubscription = isProActive ? "pro" : "free";
    console.log(`Billing: Status Update -> ${currentUserSubscription.toUpperCase()}`);

    // 2. UI Elemente aktualisieren (Schlösser & Menü)
    updateUI(isProActive);

    // 3. Supabase Synchronisation
    if (isProActive) {
        const expirationDate = entitlement.expirationDate; 

        // --- ✅ WICHTIG: GLOBALE VARIABLE FÜR DEN LIVE-CHECK UPDATEN! ---
        if (expirationDate) {
            // Wir aktualisieren die globale Variable, die app.js nutzt
            currentSubscriptionEnd = Math.floor(new Date(expirationDate).getTime() / 1000);
            console.log("Billing: Neues Ablaufdatum gesetzt:", new Date(expirationDate));
        }
        // ---------------------------------------------------------------

        const { error } = await supabaseClient.auth.updateUser({
            data: { 
                subscription_status: 'pro',
                subscription_source: 'google_play',
                subscription_end: expirationDate ? Math.floor(new Date(expirationDate).getTime() / 1000) : null 
            }
        });
        if (error) console.error("Billing: Supabase Sync Fehler:", error);
    } else {
        // Optional: Status in Supabase auf free setzen, wenn abgelaufen
        // (Oder wir lassen das den 'Live-Check' in app.js machen)
    }
}

/**
 * Aktualisiert die gesamte UI sofort (Badge, Buttons, Schlösser)
 */
function updateUI(isPro) {
    // A) Schlösser entfernen/hinzufügen
    updateLockVisuals(); 

    // B) Burger Menü Elemente finden
    const statusBadge = document.getElementById("subscription-status-badge");
    const upgradeBtn = document.getElementById("menu-upgrade-btn");
    const manageBtn = document.getElementById("menu-manage-sub-btn");

    // C) Menü aktualisieren
    if (statusBadge) {
        if (isPro) {
            // PRO STATUS
            statusBadge.textContent = "PRO";
            statusBadge.className = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold mt-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800";
            
            if (upgradeBtn) upgradeBtn.classList.add("hidden");
            if (manageBtn) manageBtn.classList.remove("hidden");
        } else {
            // FREE STATUS
            statusBadge.textContent = "FREE";
            statusBadge.className = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-600";
            
            if (upgradeBtn) upgradeBtn.classList.remove("hidden"); // Button wieder zeigen!
            if (manageBtn) manageBtn.classList.add("hidden");
        }
    }
}

/**
 * Kauf starten
 */
async function buyNative(planKey) {
    const { Purchases } = Capacitor.Plugins;
    
    try {
        const offerings = await Purchases.getOfferings();
        
        if (offerings.current && offerings.current.availablePackages.length > 0) {
            let packageToBuy = null;
            if (planKey === 'monthly') packageToBuy = offerings.current.monthly;
            else packageToBuy = offerings.current.annual;

            if (!packageToBuy) {
                showMessage("Fehler", "Paket nicht gefunden.", "error");
                return;
            }

            // Kauf
            const { customerInfo } = await Purchases.purchasePackage({ aPackage: packageToBuy });
            
            // Check
            if (customerInfo.entitlements.all["pro_access"]?.isActive) {
                showMessage("Erfolg!", "Willkommen bei AvioSphere Pro!", "success");
                closePremiumModal();
                // UI Update wird automatisch durch den Listener (handleCustomerInfo) ausgelöst!
            }
        } else {
            showMessage("Fehler", "Keine Verbindung zum Store.", "error");
        }
    } catch (error) {
        if (!error.userCancelled) {
            console.error("Billing: Kauf Fehler:", error);
            // Spezifische Meldung für den Fehler im Screenshot
            if(error.message && error.message.includes("acknowledge")) {
                 showMessage("Hinweis", "Kauf wird verarbeitet. Bitte App kurz offen lassen.", "info");
            } else {
                 showMessage("Kauf fehlgeschlagen", error.message || "Bitte erneut versuchen.", "error");
            }
        }
    }
}

/**
 * Restore
 */
async function restorePurchases() {
    if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform()) return;
    const btn = document.getElementById('restore-btn');
    if(btn) btn.textContent = "⏳...";

    try {
        const { Purchases } = Capacitor.Plugins;
        const customerInfo = await Purchases.restorePurchases();
        
        // Listener erledigt den Rest, aber wir geben Feedback
        if (customerInfo.entitlements.all["pro_access"]?.isActive) {
            showMessage("Erfolg", "Einkäufe wiederhergestellt.", "success");
            closePremiumModal();
        } else {
            showMessage("Info", "Keine aktiven Abos gefunden.", "info");
        }
    } catch (e) {
        showMessage("Fehler", "Wiederherstellung fehlgeschlagen.", "error");
    }
    if(btn) btn.textContent = "Einkäufe wiederherstellen";
}