// api_service.js

window.fetchExternalAirport = function(input) {
    const normalizedInput = input.trim().toUpperCase();

    if (normalizedInput.length !== 3) {
        return Promise.resolve(null);
    }
    
    // NEU: Ruft die sichere Netlify Function anstelle der externen API auf
    const API_ENDPOINT = `/.netlify/functions/fetch-airport?iata=${normalizedInput}`; 

    return new Promise((resolve, reject) => {
        fetch(API_ENDPOINT)
        .then(response => {
            if (!response.ok) {
                console.warn(`Netlify Function Abfrage für '${input}' fehlgeschlagen: Status ${response.status}`);
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
                resolve(null);
            }
        })
        .catch(error => {
            console.error("Netzwerkfehler beim Aufruf der Netlify Function:", error);
            resolve(null);
        });
    });
};