// api_finder.js
// Enthält das ASYNCHRONE Gerüst für die externe API-Abfrage (mittels Fetch Promise).

window.fetchExternalAirport = function(input) {
    const API_KEY = '2PdgUZ+cxg5qrmoZW7YgBA==d729ghIozYCX7zto';
    const API_HOST = 'api-ninjas.com';
    const API_ENDPOINT = `https://${API_HOST}/v1/airports?iata=${input.trim().toUpperCase()}`; 

    const normalizedInput = input.trim();
    if (normalizedInput.length !== 3) return Promise.resolve(null);

    // Gibt ein Promise zurück, um asynchrones Warten in logFlight zu ermöglichen
    return new Promise((resolve, reject) => {
        fetch(API_ENDPOINT, {
            method: 'GET',
            headers: {
                'X-Api-Key': API_KEY,
                // 'x-rapidapi-host' ist für API-Ninjas nicht nötig, aber 'host' wird manchmal automatisch gesetzt
            }
        })
        .then(response => {
            if (!response.ok) {
                // Bei 404 oder anderen Fehlern: Keine Daten gefunden
                console.warn(`Externe API-Abfrage für '${input}' fehlgeschlagen: Status ${response.status}`);
                return []; 
            }
            return response.json();
        })
        .then(data => {
            // API-Ninjas gibt ein Array von Objekten zurück (auch wenn nur eines erwartet wird)
            if (data && data.length > 0) {
                const result = data[0];
                
                // API-Ninjas verwendet 'latitude' und 'longitude'
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