// =================================================================
// ✈️ AVIOSPHERE AIRCRAFT DATABASE (STAGE 1: LOCAL HIGH-SPEED DB)
// =================================================================

const LOCAL_AIRCRAFT_DB = {
    // === AIRBUS A220 / C-SERIES ===
    "BCS1": { name: "Airbus A220-100", manufacturer: "Airbus / Bombardier", engine: "2× PW1500G Geared Turbofan", speed: "871 km/h (Mach 0.82)", range: "6.390 km", length: "35,0 m", wingspan: "35,1 m", alt: "12.500 m", weight: "63.100 kg", seats: "100–135 (2-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A220" },
    "BCS3": { name: "Airbus A220-300", manufacturer: "Airbus / Bombardier", engine: "2× PW1500G Geared Turbofan", speed: "871 km/h (Mach 0.82)", range: "6.297 km", length: "38,7 m", wingspan: "35,1 m", alt: "12.500 m", weight: "70.900 kg", seats: "120–160 (2-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A220" },

    // === AIRBUS NARROWBODY (A320 FAMILY) ===
    "A318": { name: "Airbus A318", manufacturer: "Airbus", engine: "2× CFM56 / PW6000", speed: "828 km/h (Mach 0.78)", range: "5.750 km", length: "31,4 m", wingspan: "34,1 m", alt: "12.000 m", weight: "68.000 kg", seats: "107–132 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus-A320-Familie#A318" },
    "A319": { name: "Airbus A319-100", manufacturer: "Airbus", engine: "2× CFM56 / IAE V2500", speed: "828 km/h (Mach 0.78)", range: "6.950 km", length: "33,8 m", wingspan: "35,8 m", alt: "12.000 m", weight: "75.500 kg", seats: "124–156 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus-A320-Familie#A319" },
    "A19N": { name: "Airbus A319neo", manufacturer: "Airbus", engine: "2× CFM LEAP-1A / PW1100G", speed: "833 km/h (Mach 0.78)", range: "6.850 km", length: "33,8 m", wingspan: "35,8 m", alt: "12.100 m", weight: "75.500 kg", seats: "140–160 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A320neo" },
    "A320": { name: "Airbus A320-200", manufacturer: "Airbus", engine: "2× CFM56 / IAE V2500", speed: "828 km/h (Mach 0.78)", range: "6.100 km", length: "37,6 m", wingspan: "35,8 m", alt: "12.000 m", weight: "78.000 kg", seats: "150–186 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus-A320-Familie#A320" },
    "A20N": { name: "Airbus A320neo", manufacturer: "Airbus", engine: "2× CFM LEAP-1A / PW1100G", speed: "833 km/h (Mach 0.78)", range: "6.300 km", length: "37,6 m", wingspan: "35,8 m", alt: "12.100 m", weight: "79.000 kg", seats: "150–194 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A320neo" },
    "A321": { name: "Airbus A321-200", manufacturer: "Airbus", engine: "2× CFM56 / IAE V2500", speed: "828 km/h (Mach 0.78)", range: "5.950 km", length: "44,5 m", wingspan: "35,8 m", alt: "12.000 m", weight: "93.500 kg", seats: "185–230 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus-A320-Familie#A321" },
    "A21N": { name: "Airbus A321neo / XLR", manufacturer: "Airbus", engine: "2× CFM LEAP-1A / PW1100G", speed: "833 km/h (Mach 0.78)", range: "7.400 km", length: "44,5 m", wingspan: "35,8 m", alt: "12.100 m", weight: "97.000 kg", seats: "180–244 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A320neo#A321neo" },

    // === AIRBUS WIDEBODY ===
    "A306": { name: "Airbus A300-600", manufacturer: "Airbus", engine: "2× GE CF6 / PW4000", speed: "854 km/h", range: "7.500 km", length: "54,1 m", wingspan: "44,8 m", alt: "12.200 m", weight: "171.700 kg", seats: "266–360 (2-4-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A300" },
    "A310": { name: "Airbus A310-300", manufacturer: "Airbus", engine: "2× GE CF6 / PW4000", speed: "850 km/h", range: "9.540 km", length: "46,7 m", wingspan: "43,9 m", alt: "12.500 m", weight: "164.000 kg", seats: "220–280 (2-4-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A310" },
    "A332": { name: "Airbus A330-200", manufacturer: "Airbus", engine: "2× Trent 700 / CF6 / PW4000", speed: "871 km/h (Mach 0.82)", range: "13.450 km", length: "58,8 m", wingspan: "60,3 m", alt: "12.500 m", weight: "242.000 kg", seats: "246–406 (2-4-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A330" },
    "A333": { name: "Airbus A330-300", manufacturer: "Airbus", engine: "2× Trent 700 / CF6 / PW4000", speed: "871 km/h (Mach 0.82)", range: "11.750 km", length: "63,7 m", wingspan: "60,3 m", alt: "12.500 m", weight: "242.000 kg", seats: "277–440 (2-4-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A330" },
    "A338": { name: "Airbus A330-800neo", manufacturer: "Airbus", engine: "2× Rolls-Royce Trent 7000", speed: "871 km/h (Mach 0.82)", range: "15.094 km", length: "58,8 m", wingspan: "64,0 m", alt: "13.100 m", weight: "251.000 kg", seats: "220–406 (2-4-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A330neo" },
    "A339": { name: "Airbus A330-900neo", manufacturer: "Airbus", engine: "2× Rolls-Royce Trent 7000", speed: "871 km/h (Mach 0.82)", range: "13.334 km", length: "63,7 m", wingspan: "64,0 m", alt: "13.100 m", weight: "251.000 kg", seats: "287–440 (2-4-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A330neo" },
    "A342": { name: "Airbus A340-200", manufacturer: "Airbus", engine: "4× CFM56-5C", speed: "871 km/h (Mach 0.82)", range: "14.800 km", length: "59,4 m", wingspan: "60,3 m", alt: "12.500 m", weight: "275.000 kg", seats: "261–300 (2-4-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A340" },
    "A343": { name: "Airbus A340-300", manufacturer: "Airbus", engine: "4× CFM56-5C", speed: "871 km/h (Mach 0.82)", range: "13.500 km", length: "63,6 m", wingspan: "60,3 m", alt: "12.500 m", weight: "276.500 kg", seats: "295–375 (2-4-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A340" },
    "A345": { name: "Airbus A340-500", manufacturer: "Airbus", engine: "4× Rolls-Royce Trent 500", speed: "881 km/h (Mach 0.83)", range: "16.670 km", length: "67,9 m", wingspan: "63,5 m", alt: "12.500 m", weight: "380.000 kg", seats: "313–375 (2-4-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A340" },
    "A346": { name: "Airbus A340-600", manufacturer: "Airbus", engine: "4× Rolls-Royce Trent 500", speed: "881 km/h (Mach 0.83)", range: "14.450 km", length: "75,4 m", wingspan: "63,5 m", alt: "12.500 m", weight: "380.000 kg", seats: "320–440 (2-4-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A340#A340-600" },
    "A359": { name: "Airbus A350-900", manufacturer: "Airbus", engine: "2× Rolls-Royce Trent XWB-84", speed: "903 km/h (Mach 0.85)", range: "15.000 km", length: "66,8 m", wingspan: "64,8 m", alt: "13.100 m", weight: "283.000 kg", seats: "300–350 (3-3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A350" },
    "A35K": { name: "Airbus A350-1000", manufacturer: "Airbus", engine: "2× Rolls-Royce Trent XWB-97", speed: "903 km/h (Mach 0.85)", range: "16.100 km", length: "73,8 m", wingspan: "64,8 m", alt: "13.100 m", weight: "319.000 kg", seats: "350–410 (3-3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Airbus_A350#A350-1000" },
    "A388": { name: "Airbus A380-800", manufacturer: "Airbus", engine: "4× Trent 900 / GP7200", speed: "903 km/h (Mach 0.85)", range: "15.200 km", length: "72,7 m", wingspan: "79,8 m", alt: "13.100 m", weight: "575.000 kg", seats: "500–853 (Doppeldecker)", wiki: "https://de.wikipedia.org/wiki/Airbus_A380" },

    // === BOEING NARROWBODY ===
    "B712": { name: "Boeing 717-200", manufacturer: "Boeing", engine: "2× Rolls-Royce BR715", speed: "811 km/h (Mach 0.77)", range: "3.815 km", length: "37,8 m", wingspan: "28,5 m", alt: "11.300 m", weight: "54.900 kg", seats: "106–134 (2-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_717" },
    "B733": { name: "Boeing 737-300", manufacturer: "Boeing", engine: "2× CFM56-3", speed: "794 km/h", range: "4.175 km", length: "33,4 m", wingspan: "28,9 m", alt: "11.300 m", weight: "62.800 kg", seats: "126–149 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737" },
    "B734": { name: "Boeing 737-400", manufacturer: "Boeing", engine: "2× CFM56-3", speed: "794 km/h", range: "3.820 km", length: "36,4 m", wingspan: "28,9 m", alt: "11.300 m", weight: "68.000 kg", seats: "146–188 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737" },
    "B735": { name: "Boeing 737-500", manufacturer: "Boeing", engine: "2× CFM56-3", speed: "794 km/h", range: "4.395 km", length: "31,0 m", wingspan: "28,9 m", alt: "11.300 m", weight: "60.500 kg", seats: "110–138 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737" },
    "B736": { name: "Boeing 737-600", manufacturer: "Boeing", engine: "2× CFM56-7B", speed: "838 km/h (Mach 0.78)", range: "5.990 km", length: "31,2 m", wingspan: "34,3 m", alt: "12.500 m", weight: "65.500 kg", seats: "110–132 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737" },
    "B737": { name: "Boeing 737-700", manufacturer: "Boeing", engine: "2× CFM56-7B", speed: "838 km/h (Mach 0.78)", range: "5.570 km", length: "33,6 m", wingspan: "34,3 m", alt: "12.500 m", weight: "70.080 kg", seats: "126–149 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737" },
    "B738": { name: "Boeing 737-800", manufacturer: "Boeing", engine: "2× CFM56-7B", speed: "838 km/h (Mach 0.78)", range: "5.436 km", length: "39,5 m", wingspan: "35,8 m", alt: "12.500 m", weight: "79.010 kg", seats: "162–189 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737#737-800" },
    "B739": { name: "Boeing 737-900ER", manufacturer: "Boeing", engine: "2× CFM56-7B", speed: "838 km/h (Mach 0.78)", range: "5.460 km", length: "42,1 m", wingspan: "35,8 m", alt: "12.500 m", weight: "85.130 kg", seats: "178–220 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737#737-900" },
    "B37M": { name: "Boeing 737 MAX 7", manufacturer: "Boeing", engine: "2× CFM LEAP-1B", speed: "839 km/h (Mach 0.79)", range: "7.040 km", length: "35,6 m", wingspan: "35,9 m", alt: "12.500 m", weight: "80.285 kg", seats: "138–172 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737_MAX" },
    "B38M": { name: "Boeing 737 MAX 8", manufacturer: "Boeing", engine: "2× CFM LEAP-1B", speed: "839 km/h (Mach 0.79)", range: "6.570 km", length: "39,5 m", wingspan: "35,9 m", alt: "12.500 m", weight: "82.190 kg", seats: "162–210 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737_MAX" },
    "B39M": { name: "Boeing 737 MAX 9", manufacturer: "Boeing", engine: "2× CFM LEAP-1B", speed: "839 km/h (Mach 0.79)", range: "6.110 km", length: "42,2 m", wingspan: "35,9 m", alt: "12.500 m", weight: "88.310 kg", seats: "178–220 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737_MAX" },
    "B3XM": { name: "Boeing 737 MAX 10", manufacturer: "Boeing", engine: "2× CFM LEAP-1B", speed: "839 km/h (Mach 0.79)", range: "5.740 km", length: "43,8 m", wingspan: "35,9 m", alt: "12.500 m", weight: "89.765 kg", seats: "188–230 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_737_MAX" },
    "B752": { name: "Boeing 757-200", manufacturer: "Boeing", engine: "2× RB211 / PW2000", speed: "850 km/h (Mach 0.80)", range: "7.250 km", length: "47,3 m", wingspan: "38,1 m", alt: "12.800 m", weight: "115.680 kg", seats: "200–239 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_757" },
    "B753": { name: "Boeing 757-300", manufacturer: "Boeing", engine: "2× RB211 / PW2000", speed: "850 km/h (Mach 0.80)", range: "6.295 km", length: "54,4 m", wingspan: "38,1 m", alt: "12.800 m", weight: "123.600 kg", seats: "243–295 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_757" },

    // === BOEING WIDEBODY ===
    "B762": { name: "Boeing 767-200ER", manufacturer: "Boeing", engine: "2× CF6 / PW4000", speed: "850 km/h (Mach 0.80)", range: "12.200 km", length: "48,5 m", wingspan: "47,6 m", alt: "13.100 m", weight: "179.170 kg", seats: "181–255 (2-3-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_767" },
    "B763": { name: "Boeing 767-300ER", manufacturer: "Boeing", engine: "2× CF6 / PW4000 / RB211", speed: "850 km/h (Mach 0.80)", range: "11.070 km", length: "54,9 m", wingspan: "47,6 m", alt: "13.100 m", weight: "186.880 kg", seats: "218–300 (2-3-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_767" },
    "B764": { name: "Boeing 767-400ER", manufacturer: "Boeing", engine: "2× GE CF6-80C2", speed: "850 km/h (Mach 0.80)", range: "10.415 km", length: "61,4 m", wingspan: "51,9 m", alt: "13.100 m", weight: "204.120 kg", seats: "245–375 (2-3-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_767" },
    "B772": { name: "Boeing 777-200ER", manufacturer: "Boeing", engine: "2× GE90 / Trent 800 / PW4000", speed: "892 km/h (Mach 0.84)", range: "13.080 km", length: "63,7 m", wingspan: "60,9 m", alt: "13.140 m", weight: "297.550 kg", seats: "301–400 (3-3-3 / 3-4-3)", wiki: "https://de.wikipedia.org/wiki/Boeing_777" },
    "B77L": { name: "Boeing 777-200LR", manufacturer: "Boeing", engine: "2× General Electric GE90-110B1", speed: "892 km/h (Mach 0.84)", range: "15.843 km", length: "63,7 m", wingspan: "64,8 m", alt: "13.140 m", weight: "347.450 kg", seats: "301–317 (3-3-3 / 3-4-3)", wiki: "https://de.wikipedia.org/wiki/Boeing_777#777-200LR" },
    "B773": { name: "Boeing 777-300", manufacturer: "Boeing", engine: "2× Trent 800 / PW4000", speed: "892 km/h (Mach 0.84)", range: "11.165 km", length: "73,9 m", wingspan: "60,9 m", alt: "13.140 m", weight: "299.370 kg", seats: "368–500 (3-4-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_777" },
    "B77W": { name: "Boeing 777-300ER", manufacturer: "Boeing", engine: "2× General Electric GE90-115B", speed: "892 km/h (Mach 0.84)", range: "13.649 km", length: "73,9 m", wingspan: "64,8 m", alt: "13.140 m", weight: "351.500 kg", seats: "350–400 (3-4-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_777#777-300ER" },
    "B788": { name: "Boeing 787-8 Dreamliner", manufacturer: "Boeing", engine: "2× GEnx-1B / Trent 1000", speed: "903 km/h (Mach 0.85)", range: "13.620 km", length: "56,7 m", wingspan: "60,1 m", alt: "13.100 m", weight: "227.930 kg", seats: "242–290 (3-3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_787" },
    "B789": { name: "Boeing 787-9 Dreamliner", manufacturer: "Boeing", engine: "2× GEnx-1B / Trent 1000", speed: "903 km/h (Mach 0.85)", range: "14.140 km", length: "63,0 m", wingspan: "60,1 m", alt: "13.100 m", weight: "254.000 kg", seats: "280–330 (3-3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_787#787-9" },
    "B78X": { name: "Boeing 787-10 Dreamliner", manufacturer: "Boeing", engine: "2× GEnx-1B / Trent 1000", speed: "903 km/h (Mach 0.85)", range: "11.910 km", length: "68,3 m", wingspan: "60,1 m", alt: "13.100 m", weight: "254.000 kg", seats: "318–370 (3-3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Boeing_787#787-10" },
    "B744": { name: "Boeing 747-400", manufacturer: "Boeing", engine: "4× CF6 / PW4000 / RB211", speed: "907 km/h (Mach 0.85)", range: "13.450 km", length: "70,6 m", wingspan: "64,4 m", alt: "13.700 m", weight: "396.890 kg", seats: "416–524 (3-4-3 + Oberdeck)", wiki: "https://de.wikipedia.org/wiki/Boeing_747#747-400" },
    "B748": { name: "Boeing 747-8 Intercontinental", manufacturer: "Boeing", engine: "4× General Electric GEnx-2B67", speed: "914 km/h (Mach 0.86)", range: "14.310 km", length: "76,3 m", wingspan: "68,4 m", alt: "13.100 m", weight: "447.700 kg", seats: "364–467 (3-4-3 + Oberdeck)", wiki: "https://de.wikipedia.org/wiki/Boeing_747-8" },

    // === EMBRAER E-JETS & E-JETS E2 ===
    "E170": { name: "Embraer E170", manufacturer: "Embraer", engine: "2× GE CF34-8E", speed: "829 km/h (Mach 0.78)", range: "3.982 km", length: "29,9 m", wingspan: "26,0 m", alt: "12.500 m", weight: "38.600 kg", seats: "66–78 (2-2, kein Mittelsitz)", wiki: "https://de.wikipedia.org/wiki/Embraer_E-Jet-Familie" },
    "E75L": { name: "Embraer E175", manufacturer: "Embraer", engine: "2× GE CF34-8E", speed: "829 km/h (Mach 0.78)", range: "4.074 km", length: "31,7 m", wingspan: "28,7 m", alt: "12.500 m", weight: "40.370 kg", seats: "76–88 (2-2, kein Mittelsitz)", wiki: "https://de.wikipedia.org/wiki/Embraer_E-Jet-Familie" },
    "E75S": { name: "Embraer E175", manufacturer: "Embraer", engine: "2× GE CF34-8E", speed: "829 km/h (Mach 0.78)", range: "3.704 km", length: "31,7 m", wingspan: "26,0 m", alt: "12.500 m", weight: "38.790 kg", seats: "76–88 (2-2, kein Mittelsitz)", wiki: "https://de.wikipedia.org/wiki/Embraer_E-Jet-Familie" },
    "E175": { name: "Embraer E175", manufacturer: "Embraer", engine: "2× GE CF34-8E", speed: "829 km/h (Mach 0.78)", range: "4.074 km", length: "31,7 m", wingspan: "28,7 m", alt: "12.500 m", weight: "40.370 kg", seats: "76–88 (2-2, kein Mittelsitz)", wiki: "https://de.wikipedia.org/wiki/Embraer_E-Jet-Familie" },
    "E190": { name: "Embraer E190", manufacturer: "Embraer", engine: "2× GE CF34-10E", speed: "829 km/h (Mach 0.78)", range: "4.537 km", length: "36,2 m", wingspan: "28,7 m", alt: "12.500 m", weight: "51.800 kg", seats: "96–114 (2-2, kein Mittelsitz)", wiki: "https://de.wikipedia.org/wiki/Embraer_E-Jet-Familie" },
    "E195": { name: "Embraer E195", manufacturer: "Embraer", engine: "2× GE CF34-10E", speed: "829 km/h (Mach 0.78)", range: "4.260 km", length: "38,7 m", wingspan: "28,7 m", alt: "12.500 m", weight: "52.290 kg", seats: "108–124 (2-2, kein Mittelsitz)", wiki: "https://de.wikipedia.org/wiki/Embraer_E-Jet-Familie" },
    "E290": { name: "Embraer E190-E2", manufacturer: "Embraer", engine: "2× PW1900G Geared Turbofan", speed: "876 km/h (Mach 0.82)", range: "5.278 km", length: "36,2 m", wingspan: "33,7 m", alt: "12.500 m", weight: "56.400 kg", seats: "97–114 (2-2, kein Mittelsitz)", wiki: "https://de.wikipedia.org/wiki/Embraer_E-Jet_E2" },
    "E295": { name: "Embraer E195-E2", manufacturer: "Embraer", engine: "2× PW1900G Geared Turbofan", speed: "876 km/h (Mach 0.82)", range: "4.815 km", length: "41,5 m", wingspan: "35,1 m", alt: "12.500 m", weight: "62.000 kg", seats: "120–146 (2-2, kein Mittelsitz)", wiki: "https://de.wikipedia.org/wiki/Embraer_E-Jet_E2" },
    "E145": { name: "Embraer ERJ 145", manufacturer: "Embraer", engine: "2× Rolls-Royce AE 3007", speed: "833 km/h", range: "2.873 km", length: "29,9 m", wingspan: "20,0 m", alt: "11.275 m", weight: "22.000 kg", seats: "50 (1-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Embraer_ERJ_145" },

    // === BOMBARDIER CRJ & TURBOPROPS (DASH 8 / ATR) ===
    "CRJ2": { name: "Bombardier CRJ-200", manufacturer: "Bombardier", engine: "2× GE CF34-3B1", speed: "786 km/h", range: "3.045 km", length: "26,8 m", wingspan: "21,2 m", alt: "12.500 m", weight: "24.040 kg", seats: "50 (2-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Bombardier_Canadair_Regional_Jet" },
    "CRJ7": { name: "Bombardier CRJ-700", manufacturer: "Bombardier", engine: "2× GE CF34-8C5", speed: "829 km/h", range: "2.553 km", length: "32,5 m", wingspan: "23,2 m", alt: "12.500 m", weight: "34.019 kg", seats: "66–78 (2-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Bombardier_Canadair_Regional_Jet" },
    "CRJ9": { name: "Bombardier CRJ-900", manufacturer: "Bombardier", engine: "2× GE CF34-8C5", speed: "829 km/h (Mach 0.78)", range: "2.876 km", length: "36,4 m", wingspan: "24,9 m", alt: "12.500 m", weight: "38.330 kg", seats: "76–90 (2-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Bombardier_Canadair_Regional_Jet" },
    "CRJX": { name: "Bombardier CRJ-1000", manufacturer: "Bombardier", engine: "2× GE CF34-8C5A1", speed: "829 km/h (Mach 0.78)", range: "3.004 km", length: "39,1 m", wingspan: "26,2 m", alt: "12.500 m", weight: "41.640 kg", seats: "100–104 (2-2 Layout)", wiki: "https://de.wikipedia.org/wiki/Bombardier_Canadair_Regional_Jet" },
    "DH8D": { name: "De Havilland Dash 8-400 (Q400)", manufacturer: "De Havilland / Bombardier", engine: "2× PW150A Turboprop", speed: "667 km/h", range: "2.040 km", length: "32,8 m", wingspan: "28,4 m", alt: "8.230 m", weight: "29.574 kg", seats: "68–90 (2-2 Layout)", wiki: "https://de.wikipedia.org/wiki/De_Havilland_Canada_DHC-8" },
    "AT72": { name: "ATR 72", manufacturer: "ATR", engine: "2× PW127 Turboprop", speed: "510 km/h", range: "1.528 km", length: "27,2 m", wingspan: "27,1 m", alt: "7.600 m", weight: "23.000 kg", seats: "68–78 (2-2 Layout)", wiki: "https://de.wikipedia.org/wiki/ATR_72" },
    "AT75": { name: "ATR 72-500", manufacturer: "ATR", engine: "2× PW127F/M Turboprop", speed: "510 km/h", range: "1.528 km", length: "27,2 m", wingspan: "27,1 m", alt: "7.600 m", weight: "22.800 kg", seats: "68–74 (2-2 Layout)", wiki: "https://de.wikipedia.org/wiki/ATR_72" },
    "AT76": { name: "ATR 72-600", manufacturer: "ATR", engine: "2× PW127M/XT Turboprop", speed: "510 km/h", range: "1.528 km", length: "27,2 m", wingspan: "27,1 m", alt: "7.600 m", weight: "23.000 kg", seats: "68–78 (2-2 Layout)", wiki: "https://de.wikipedia.org/wiki/ATR_72" },
    "AT45": { name: "ATR 42-500", manufacturer: "ATR", engine: "2× PW127E Turboprop", speed: "556 km/h", range: "1.326 km", length: "22,7 m", wingspan: "24,6 m", alt: "7.600 m", weight: "18.600 kg", seats: "46–50 (2-2 Layout)", wiki: "https://de.wikipedia.org/wiki/ATR_42" },

    // === KLASSIKER & WEITERE TYPEN ===
    "RJ85": { name: "Avro RJ85 / BAe 146-200", manufacturer: "British Aerospace", engine: "4× Lycoming ALF 502 / LF 507", speed: "763 km/h", range: "2.909 km", length: "28,6 m", wingspan: "26,3 m", alt: "10.670 m", weight: "43.998 kg", seats: "85–112 (2-3 / 3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/BAe_146" },
    "RJ1H": { name: "Avro RJ100 / BAe 146-300", manufacturer: "British Aerospace", engine: "4× Honeywell LF 507", speed: "763 km/h", range: "2.760 km", length: "31,0 m", wingspan: "26,3 m", alt: "10.670 m", weight: "46.040 kg", seats: "100–118 (2-3 / 3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/BAe_146" },
    "MD82": { name: "McDonnell Douglas MD-82", manufacturer: "McDonnell Douglas", engine: "2× Pratt & Whitney JT8D-217", speed: "811 km/h", range: "3.798 km", length: "45,1 m", wingspan: "32,8 m", alt: "11.300 m", weight: "67.812 kg", seats: "155–172 (2-3 Layout)", wiki: "https://de.wikipedia.org/wiki/McDonnell_Douglas_MD-80" },
    "MD83": { name: "McDonnell Douglas MD-83", manufacturer: "McDonnell Douglas", engine: "2× Pratt & Whitney JT8D-219", speed: "811 km/h", range: "4.635 km", length: "45,1 m", wingspan: "32,8 m", alt: "11.300 m", weight: "72.575 kg", seats: "155–172 (2-3 Layout)", wiki: "https://de.wikipedia.org/wiki/McDonnell_Douglas_MD-80" },
    "MD11": { name: "McDonnell Douglas MD-11", manufacturer: "McDonnell Douglas", engine: "3× CF6-80C2 / PW4460", speed: "876 km/h (Mach 0.83)", range: "12.270 km", length: "61,2 m", wingspan: "51,7 m", alt: "13.100 m", weight: "285.990 kg", seats: "293–410 (2-5-2 / 3-4-2)", wiki: "https://de.wikipedia.org/wiki/McDonnell_Douglas_MD-11" },
    "F100": { name: "Fokker 100", manufacturer: "Fokker", engine: "2× Rolls-Royce Tay Mk 650", speed: "755 km/h", range: "3.170 km", length: "35,5 m", wingspan: "28,1 m", alt: "10.670 m", weight: "45.810 kg", seats: "97–122 (2-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Fokker_100" },
    "F70":  { name: "Fokker 70", manufacturer: "Fokker", engine: "2× Rolls-Royce Tay Mk 620", speed: "743 km/h", range: "3.410 km", length: "30,9 m", wingspan: "28,1 m", alt: "10.670 m", weight: "41.730 kg", seats: "70–85 (2-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Fokker_70" },
    "SU95": { name: "Sukhoi Superjet 100", manufacturer: "Sukhoi", engine: "2× PowerJet SaM146", speed: "828 km/h", range: "3.048 km", length: "29,9 m", wingspan: "27,8 m", alt: "12.200 m", weight: "45.880 kg", seats: "87–108 (2-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Suchoi_Superjet_100" },
    "C919": { name: "COMAC C919", manufacturer: "COMAC", engine: "2× CFM LEAP-1C", speed: "834 km/h (Mach 0.78)", range: "5.555 km", length: "38,9 m", wingspan: "35,8 m", alt: "12.100 m", weight: "77.300 kg", seats: "158–192 (3-3 Layout)", wiki: "https://de.wikipedia.org/wiki/Comac_C919" }
};

// Intelligenter Alias-Resolver: Findet den passenden DB-Eintrag auch bei IATA-Codes oder ausgeschriebenen Namen
window.resolveAircraftFromLocalDB = function (rawCode) {
    if (!rawCode) return null;
    const clean = rawCode.trim().toUpperCase();

    if (LOCAL_AIRCRAFT_DB[clean]) return LOCAL_AIRCRAFT_DB[clean];

    // Häufige IATA-Codes & Schreibweisen auf ICAO-Keys mappen
    const aliasMap = {
        "318": "A318", "319": "A319", "320": "A320", "32A": "A320", "32N": "A20N",
        "321": "A321", "32B": "A321", "32Q": "A21N", "A321NEO": "A21N", "A320NEO": "A20N",
        "332": "A332", "333": "A333", "338": "A338", "339": "A339", "A330": "A333",
        "342": "A342", "343": "A343", "345": "A345", "346": "A346", "A340": "A343",
        "359": "A359", "351": "A35K", "35K": "A35K", "A350": "A359", "A350-900ULR": "A359",
        "388": "A388", "380": "A388", "A380": "A388",
        "221": "BCS1", "223": "BCS3", "A220": "BCS3", "CS100": "BCS1", "CS300": "BCS3",
        "717": "B712", "733": "B733", "734": "B734", "735": "B735", "736": "B736",
        "73G": "B737", "73W": "B737", "738": "B738", "73H": "B738", "739": "B739",
        "7M7": "B37M", "7M8": "B38M", "7M9": "B39M", "737 MAX 8": "B38M", "737 MAX 9": "B39M",
        "752": "B752", "753": "B753", "757": "B752",
        "762": "B762", "763": "B763", "764": "B764", "767": "B763",
        "772": "B772", "77L": "B77L", "773": "B773", "77W": "B77W", "777": "B77W",
        "788": "B788", "789": "B789", "781": "B78X", "78X": "B78X", "787": "B789",
        "744": "B744", "748": "B748", "747": "B744",
        "E70": "E170", "E75": "E175", "E7W": "E175", "E90": "E190", "E95": "E195",
        "290": "E290", "295": "E295", "E190-E2": "E290", "E195-E2": "E295", "ER4": "E145",
        "CR2": "CRJ2", "CR7": "CRJ7", "CR9": "CRJ9", "CRK": "CRJX", "CRJ900": "CRJ9",
        "DH4": "DH8D", "Q400": "DH8D", "DHC-8-400": "DH8D",
        "ATR": "AT76", "AT7": "AT76", "ATR 72": "AT76", "ATR 42": "AT45",
        "AR8": "RJ85", "AR1": "RJ1H", "100": "F100", "M82": "MD82", "M83": "MD83", "M11": "MD11"
    };

    if (aliasMap[clean] && LOCAL_AIRCRAFT_DB[aliasMap[clean]]) {
        return LOCAL_AIRCRAFT_DB[aliasMap[clean]];
    }

    // Fuzzy-Suche über Modellnamen (z.B. "Boeing 747-8" oder "Airbus A330-300")
    for (const key in LOCAL_AIRCRAFT_DB) {
        const item = LOCAL_AIRCRAFT_DB[key];
        if (
            item.name.toUpperCase() === clean ||
            item.name.toUpperCase().includes(clean) ||
            clean.includes(item.name.toUpperCase())
        ) {
            return item;
        }
    }

    return null;
};