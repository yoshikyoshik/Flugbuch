// api_service.js

window.fetchExternalAirport = async function(input) {
    const normalizedInput = input.trim();

    if (normalizedInput.length < 3) {
        return []; // Gib immer ein leeres Array zurück, wenn die Eingabe zu kurz ist
    }
    
    const API_ENDPOINT = `/.netlify/functions/fetch-airport?query=${encodeURIComponent(normalizedInput)}`; 

    try {
        const response = await fetch(API_ENDPOINT);
        if (!response.ok) {
            console.warn(`API-Abfrage für '${input}' fehlgeschlagen: Status ${response.status}`);
            return [];
        }
        
        const data = await response.json();

        if (data && data.length > 0) {
            // Gib die komplette, formatierte Liste der Ergebnisse zurück
            return data.map(result => ({ 
                code: result.iata, 
                name: result.name, 
                lat: parseFloat(result.latitude), 
                lon: parseFloat(result.longitude)
            }));
        } else {
            return []; // Kein Ergebnis gefunden, gib ein leeres Array zurück
        }
    } catch (error) {
        console.error("Netzwerkfehler beim Aufruf der Netlify Function:", error);
        return [];
    }
};