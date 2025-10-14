// api_service.js
// Enthält die asynchrone Logik für die Abfrage der API-Ninjas Airports API.

/**
 * Ruft IATA-Flughafendaten von der externen API-Ninjas-Schnittstelle ab.
 * @param {string} input - Der IATA-Code (z.B. "LHR") oder Name.
 * @returns {Promise<object|null>} Ein Promise, das mit dem Flughafenobjekt aufgelöst wird oder null bei Fehler/Nichtfund.
 */
window.fetchExternalAirport = function(input) {
    // API Key: Beachten Sie, dass dieser Key öffentlich sichtbar ist. 
    // Für eine echte Anwendung müsste dies serverseitig gelöst werden.
    const API_KEY = '2PdgUZ+cxg5qrmoZW7YgBA==d729ghIozYCX7zto';
    const normalizedInput = input.trim().toUpperCase();

    if (normalizedInput.length !== 3) {
        // Externe API nur für exakte 3-stellige IATA-Codes abfragen
        return Promise.resolve(null);
    }
    
    const API_ENDPOINT = `https://api.api-ninjas.com/v1/airports?iata=${normalizedInput}`; 

    return new Promise((resolve, reject) => {
        fetch(API_ENDPOINT, {
            method: 'GET',
            headers: {
                'X-Api-Key': API_KEY,
            }
        })
        .then(response => {
            if (!response.ok) {
                console.warn(`Externe API-Abfrage für '${input}' fehlgeschlagen: Status ${response.status}`);
                return []; 
            }
            return response.json();
        })
        .then(data => {
            if (data && data.length > 0) {
                const result = data[0];
                
                resolve({ 
                    code: result.iata, 
                    name: result.name, 
                    lat: parseFloat(result.latitude), 
                    lon: parseFloat(result.longitude)
                });
            } else {
                resolve(null); // Kein Ergebnis gefunden
            }
        })
        .catch(error => {
            console.error("Netzwerkfehler beim API-Aufruf:", error);
            resolve(null);
        });
    });
};