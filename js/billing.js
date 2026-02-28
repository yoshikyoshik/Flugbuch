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

            await Purchases.setLogLevel({ level: "DEBUG" });
            
            // API Key konfigurieren (Vergiss nicht, deinen Key hier einzusetzen!)
            await Purchases.configure({ apiKey: "goog_EfxrsdCgCxHiDvkvWYBemInPHxn" });

            // Login mit Supabase ID
            if (userId) {
                await Purchases.logIn({ appUserID: userId });
            }

            // --- ✅ NEU: CACHE ZWINGEND LÖSCHEN ---
            // Das sorgt dafür, dass RevenueCat sofort eine Netzwerk-Anfrage an Google sendet,
            // statt die alten (gespeicherten) Daten zu nutzen.
            // Das simuliert exakt dein "Manuelles Cache Löschen"!
            await Purchases.invalidateCustomerInfoCache();
            // ----------------------------------------

            // Jetzt den Status prüfen (diesmal holt er garantiert frische Daten)
            await checkNativeSubscriptionStatus();

            // Listener registrieren
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
        
        // Versuchen, die aktuellsten Infos zu holen (statt Cache)
        // Hinweis: getCustomerInfo nutzt oft Cache, aber wir vertrauen darauf, 
        // dass RevenueCat expired-Daten invalidiert.
        const customerInfo = await Purchases.getCustomerInfo();
        
        // Wir loggen das Datum zur Kontrolle
        const ent = customerInfo.entitlements.all["pro_access"];
        if (ent) {
             console.log("RevenueCat sagt: Expire Date ist", ent.expirationDate);
        }
        
        await handleCustomerInfo(customerInfo);
    } catch (e) {
        console.error("Billing: Fehler beim Status-Check:", e);
    }
}

/**
 * ZENTRALE FUNKTION: Verarbeitet den Status und updated ALLES (DB + UI)
 */
async function handleCustomerInfo(customerInfo) {
    // Sicherstellen, dass wir auf das richtige Entitlement prüfen
    const entitlement = customerInfo.entitlements.all["pro_access"];
    const isProActive = entitlement && entitlement.isActive;

    // 1. Globalen Status setzen
    currentUserSubscription = isProActive ? "pro" : "free";
    console.log(`Billing: Status Update -> ${currentUserSubscription.toUpperCase()}`);

    // 2. UI Elemente aktualisieren
    updateUI(isProActive);

    // 3. Supabase Synchronisation (Der entscheidende Teil!)
    if (isProActive) {
        // --- FALL: USER IST PRO ---
        const expirationDate = entitlement.expirationDate; 
        
        // Globale Variable für den Live-Check updaten
        if (expirationDate) {
            currentSubscriptionEnd = Math.floor(new Date(expirationDate).getTime() / 1000);
        } else {
            currentSubscriptionEnd = null; // Lifetime oder Fehler
        }

        // Datenbank auf PRO setzen
        const { error } = await supabaseClient.auth.updateUser({
            data: { 
                subscription_status: 'pro',
                subscription_source: 'google_play',
                // Speichere das Datum als Unix Timestamp
                subscription_end: currentSubscriptionEnd
            }
        });
        if (error) console.error("Billing: Supabase Pro-Sync Fehler:", error);

    } else {
        // --- FALL: USER IST FREE (ABGELAUFEN) ---
        // Hier fehlte bisher der Datenbank-Update!
        console.log("Billing: Abo abgelaufen/inaktiv. Setze DB auf Free.");

        // Globale Variable resetten
        currentSubscriptionEnd = null;

        // Datenbank HART auf FREE setzen
        const { error } = await supabaseClient.auth.updateUser({
            data: { 
                subscription_status: 'free',
                subscription_end: null 
            }
        });
        if (error) console.error("Billing: Supabase Downgrade Fehler:", error);
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
                 showMessage(
                    getTranslation("toast.infoTitle") || "Hinweis", 
                    getTranslation("premium.processingPurchase") || "Kauf wird verarbeitet. Bitte App kurz offen lassen.", 
                    "info"
                    );
            } else {
                 showMessage(
                    getTranslation("premium.purchaseFailedTitle") || "Kauf fehlgeschlagen", 
                    error.message || getTranslation("premium.tryAgain") || "Bitte erneut versuchen.", 
                    "error"
                    );
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
            showMessage(
                getTranslation("billing.restoreSuccessTitle") || "Erfolg",
                getTranslation("billing.restoreSuccessDesc") || "Einkäufe wiederhergestellt.",
                "success"
            );
            closePremiumModal();
        } else {
            showMessage(
                getTranslation("billing.restoreInfoTitle") || "Info",
                getTranslation("billing.noSubFound") || "Keine aktiven Abos gefunden.",
                "info"
            );
        }
    } catch (e) {
        showMessage(
            getTranslation("toast.errorTitle") || "Fehler",
            getTranslation("billing.restoreFailed") || "Wiederherstellung fehlgeschlagen.",
            "error"
        );
    }
    if(btn) btn.textContent = getTranslation("premium.restoreBtn") || "Einkäufe wiederherstellen";
}

/**
 * Zwingt RevenueCat, sofort den aktuellen Status von Google zu holen.
 * Wird beim "Aufwachen" der App oder durch den Timer genutzt.
 */
async function refreshSubscriptionStatus() {
    if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform()) return;

    console.log("Billing: Prüfe Status (Refresh)...");
    try {
        const { Purchases } = Capacitor.Plugins;
        
        // WICHTIG: Cache invalidieren, damit wir nicht alte Daten bekommen
        await Purchases.invalidateCustomerInfoCache();
        
        // Status abrufen (das triggert dann updateUI und DB-Sync via handleCustomerInfo)
        const customerInfo = await Purchases.getCustomerInfo();
        await handleCustomerInfo(customerInfo);
        
    } catch (error) {
        console.error("Billing: Refresh Fehler:", error);
    }
}