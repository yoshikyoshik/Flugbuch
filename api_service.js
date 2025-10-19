// api_service.js
window.fetchExternalAirport = async function(input) {
    const { CapacitorHttp } = Capacitor; // Capacitor-Plugin laden
    const normalizedInput = input.trim();

    if (normalizedInput.length < 3) return [];

    const url = `https://aesthetic-strudel-ecfe50.netlify.app/.netlify/functions/fetch-airport?query=${encodeURIComponent(normalizedInput)}`;

    const options = {
        url: url,
        headers: { 'Content-Type': 'application/json' }
    };

    try {
        const response = await CapacitorHttp.get(options);

        if (response.data && response.data.length > 0) {
            return response.data.map(result => ({ 
                code: result.iata, 
                name: result.name, 
                city: result.city,
                lat: parseFloat(result.latitude), 
                lon: parseFloat(result.longitude)
            }));
        }
        return [];
    } catch (error) {
        console.error("Fehler bei der Capacitor HTTP-Anfrage (Flughafen):", error);
        return [];
    }
};
