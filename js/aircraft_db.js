// js/aircraft_db.js

const LOCAL_AIRCRAFT_DB = {
    // === BOEING NARROWBODY ===
    "B737": { name: "Boeing 737-700", manufacturer: "Boeing", engine: "Twin-Jet", speed: "838 km/h", range: "5.570 km", length: "33.6 m", wingspan: "34.3 m", alt: "12.500 m", weight: "70.080 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_737" },
    "B738": { name: "Boeing 737-800", manufacturer: "Boeing", engine: "Twin-Jet", speed: "838 km/h", range: "5.436 km", length: "39.5 m", wingspan: "34.3 m", alt: "12.500 m", weight: "79.010 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_737#737-800" },
    "B739": { name: "Boeing 737-900", manufacturer: "Boeing", engine: "Twin-Jet", speed: "838 km/h", range: "5.460 km", length: "42.1 m", wingspan: "34.3 m", alt: "12.500 m", weight: "85.130 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_737#737-900" },
    "B38M": { name: "Boeing 737 MAX 8", manufacturer: "Boeing", engine: "Twin-Jet", speed: "839 km/h", range: "6.570 km", length: "39.5 m", wingspan: "35.9 m", alt: "12.500 m", weight: "82.190 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_737_MAX" },
    "B39M": { name: "Boeing 737 MAX 9", manufacturer: "Boeing", engine: "Twin-Jet", speed: "839 km/h", range: "6.570 km", length: "42.1 m", wingspan: "35.9 m", alt: "12.500 m", weight: "88.310 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_737_MAX" },

    // === BOEING WIDEBODY ===
    "B744": { name: "Boeing 747-400", manufacturer: "Boeing", engine: "Quad-Jet", speed: "920 km/h", range: "13.450 km", length: "70.6 m", wingspan: "64.4 m", alt: "13.700 m", weight: "396.890 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_747#747-400" },
    "B748": { name: "Boeing 747-8", manufacturer: "Boeing", engine: "Quad-Jet", speed: "914 km/h", range: "14.310 km", length: "76.3 m", wingspan: "68.4 m", alt: "13.100 m", weight: "447.700 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_747-8" },
    "B772": { name: "Boeing 777-200", manufacturer: "Boeing", engine: "Twin-Jet", speed: "905 km/h", range: "9.700 km", length: "63.7 m", wingspan: "60.9 m", alt: "13.140 m", weight: "247.200 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_777" },
    "B77W": { name: "Boeing 777-300ER", manufacturer: "Boeing", engine: "Twin-Jet", speed: "896 km/h", range: "13.649 km", length: "73.9 m", wingspan: "64.8 m", alt: "13.140 m", weight: "351.500 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_777#777-300ER" },
    "B788": { name: "Boeing 787-8 Dreamliner", manufacturer: "Boeing", engine: "Twin-Jet", speed: "903 km/h", range: "13.620 km", length: "56.7 m", wingspan: "60.1 m", alt: "13.100 m", weight: "227.930 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_787" },
    "B789": { name: "Boeing 787-9 Dreamliner", manufacturer: "Boeing", engine: "Twin-Jet", speed: "903 km/h", range: "14.140 km", length: "63.0 m", wingspan: "60.1 m", alt: "13.100 m", weight: "254.000 kg", wiki: "https://de.wikipedia.org/wiki/Boeing_787#787-9" },

    // === AIRBUS NARROWBODY ===
    "A319": { name: "Airbus A319", manufacturer: "Airbus", engine: "Twin-Jet", speed: "828 km/h", range: "6.950 km", length: "33.8 m", wingspan: "35.8 m", alt: "11.900 m", weight: "75.500 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A320-Familie#A319" },
    "A320": { name: "Airbus A320", manufacturer: "Airbus", engine: "Twin-Jet", speed: "828 km/h", range: "6.100 km", length: "37.6 m", wingspan: "35.8 m", alt: "11.900 m", weight: "78.000 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A320-Familie" },
    "A20N": { name: "Airbus A320neo", manufacturer: "Airbus", engine: "Twin-Jet", speed: "833 km/h", range: "6.300 km", length: "37.6 m", wingspan: "35.8 m", alt: "11.900 m", weight: "79.000 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A320neo" },
    "A321": { name: "Airbus A321", manufacturer: "Airbus", engine: "Twin-Jet", speed: "828 km/h", range: "5.950 km", length: "44.5 m", wingspan: "35.8 m", alt: "11.900 m", weight: "93.500 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A320-Familie#A321" },
    "A21N": { name: "Airbus A321neo", manufacturer: "Airbus", engine: "Twin-Jet", speed: "833 km/h", range: "7.400 km", length: "44.5 m", wingspan: "35.8 m", alt: "11.900 m", weight: "97.000 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A320neo#A321neo" },

    // === AIRBUS WIDEBODY ===
    "A332": { name: "Airbus A330-200", manufacturer: "Airbus", engine: "Twin-Jet", speed: "871 km/h", range: "13.450 km", length: "58.8 m", wingspan: "60.3 m", alt: "12.500 m", weight: "242.000 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A330" },
    "A333": { name: "Airbus A330-300", manufacturer: "Airbus", engine: "Twin-Jet", speed: "871 km/h", range: "11.750 km", length: "63.7 m", wingspan: "60.3 m", alt: "12.500 m", weight: "242.000 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A330" },
    "A343": { name: "Airbus A340-300", manufacturer: "Airbus", engine: "Quad-Jet", speed: "871 km/h", range: "13.500 km", length: "63.6 m", wingspan: "60.3 m", alt: "12.500 m", weight: "276.500 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A340" },
    "A359": { name: "Airbus A350-900", manufacturer: "Airbus", engine: "Twin-Jet", speed: "903 km/h", range: "15.000 km", length: "66.8 m", wingspan: "64.7 m", alt: "13.100 m", weight: "280.000 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A350" },
    "A388": { name: "Airbus A380-800", manufacturer: "Airbus", engine: "Quad-Jet", speed: "903 km/h", range: "15.200 km", length: "72.7 m", wingspan: "79.8 m", alt: "13.100 m", weight: "575.000 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A380" },

    // === REGIONAL ===
    "E190": { name: "Embraer E190", manufacturer: "Embraer", engine: "Twin-Jet", speed: "829 km/h", range: "4.537 km", length: "36.2 m", wingspan: "28.7 m", alt: "12.500 m", weight: "51.800 kg", wiki: "https://de.wikipedia.org/wiki/Embraer_E-Jet-Familie" },
    "BCS3": { name: "Airbus A220-300", manufacturer: "Airbus/Bombardier", engine: "Twin-Jet", speed: "829 km/h", range: "6.297 km", length: "38.7 m", wingspan: "35.1 m", alt: "12.500 m", weight: "67.585 kg", wiki: "https://de.wikipedia.org/wiki/Airbus_A220" }
};