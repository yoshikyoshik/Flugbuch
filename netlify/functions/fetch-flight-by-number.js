// 🔥 Ein perfekter Zeitstempel (12:00 Uhr am gesuchten Tag)
                const dummyTimestamp = Math.floor(new Date(`${date}T12:00:00Z`).getTime() / 1000);

                const mappedData = {
                    _debug: debugLogs,
                    result: {
                        request: {
                            query: flight_number
                        },
                        response: {
                            data: [{
                                identification: {
                                    number: { default: liveFlight.flight || flight_number, alternative: null },
                                    callsign: liveFlight.callsign || ""
                                },
                                aircraft: {
                                    model: { text: liveFlight.type || "", code: liveFlight.type || "" },
                                    registration: liveFlight.reg || "",
                                    country: { name: "" }
                                },
                                airline: {
                                    name: liveFlight.operating_as || "Unknown",
                                    code: { iata: liveFlight.operating_as || "", icao: liveFlight.operating_as || "" }
                                },
                                airport: {
                                    origin: {
                                        name: liveFlight.orig_iata || "",
                                        code: { iata: liveFlight.orig_iata || "", icao: liveFlight.orig_icao || "" },
                                        position: { country: { name: "" }, region: { city: "" } },
                                        timezone: { name: "UTC", offset: 0 }
                                    },
                                    destination: {
                                        name: liveFlight.dest_iata || "",
                                        code: { iata: liveFlight.dest_iata || "", icao: liveFlight.dest_icao || "" },
                                        position: { country: { name: "" }, region: { city: "" } },
                                        timezone: { name: "UTC", offset: 0 }
                                    }
                                },
                                status: {
                                    live: true,
                                    text: "Live / In Air",
                                    icon: "green",
                                    estimated: null,
                                    ambiguous: false,
                                    generic: { status: { text: "estimated", type: "arrival" } }
                                },
                                time: {
                                    scheduled: { 
                                        departure: dummyTimestamp, 
                                        arrival: dummyTimestamp + 7200 
                                    },
                                    real: { 
                                        departure: dummyTimestamp, 
                                        arrival: null 
                                    },
                                    estimated: { 
                                        departure: dummyTimestamp,
                                        arrival: liveFlight.eta ? Math.floor(new Date(liveFlight.eta).getTime() / 1000) : dummyTimestamp + 7200 
                                    }
                                }
                            }]
                        }
                    }
                };