/**
 * FMU Concurrent Calendar Bookings E2E Tests
 *
 * Verifies that the booking calendar correctly handles concurrent reservations
 * for FMU resources (maxConcurrentUsers > 1):
 *  - Time slots show occupancy labels (N/M) instead of simple available/blocked
 *  - Slots are only disabled when fully booked (occupancy >= maxConcurrent)
 *  - Regular labs (maxConcurrentUsers = 1) block slots normally
 */

describe("FMU Concurrent Calendar Bookings", () => {
  // Helper: compute Unix timestamp for a specific hour today (or tomorrow if past)
  function futureTimestamp(hour, minuteOffset = 0) {
    const d = new Date();
    d.setHours(hour, minuteOffset, 0, 0);
    // If the time is in the past, move to tomorrow
    if (d.getTime() < Date.now()) {
      d.setDate(d.getDate() + 1);
    }
    return Math.floor(d.getTime() / 1000);
  }

  // Reservations that occupy the 14:00-14:30 slot (two concurrent users)
  const reservationKeyA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const reservationKeyB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  const startTs = futureTimestamp(14, 0);
  const endTs = futureTimestamp(14, 30);

  const FMU_LAB = {
    id: 5,
    owner: "0xprovider567890123456789012345678901234567890",
    providerName: "Simulation University",
    providerEmail: "sim@test.edu",
    providerCountry: "DE",
    uri: "fmu-concurrent-5.json",
    price: "500000000000000000",
    isListed: true,
    accessKey: "spring-damper.fmu",
    metadata: {
      name: "Spring-Damper Simulation",
      description: "Concurrent FMU test",
      keywords: ["fmu"],
      attributes: [
        { trait_type: "resourceType", value: "fmu" },
        { trait_type: "maxConcurrentUsers", value: 3 },
        { trait_type: "fmiVersion", value: "2.0" },
        { trait_type: "fmuFileName", value: "spring-damper.fmu" },
        { trait_type: "simulationType", value: "CoSimulation" },
        {
          trait_type: "timeSlots",
          value: [{ startHour: 0, endHour: 24 }],
        },
        {
          trait_type: "availability",
          value: [
            { day: "monday", enabled: true },
            { day: "tuesday", enabled: true },
            { day: "wednesday", enabled: true },
            { day: "thursday", enabled: true },
            { day: "friday", enabled: true },
            { day: "saturday", enabled: true },
            { day: "sunday", enabled: true },
          ],
        },
      ],
    },
  };

  const REGULAR_LAB = {
    id: 6,
    owner: "0xprovider567890123456789012345678901234567890",
    providerName: "Physics University",
    providerEmail: "phys@test.edu",
    providerCountry: "ES",
    uri: "lab-regular-6.json",
    price: "1000000000000000000",
    isListed: true,
    metadata: {
      name: "Physics Lab",
      description: "Regular lab (exclusive access)",
      keywords: ["physics"],
      attributes: [
        {
          trait_type: "timeSlots",
          value: [{ startHour: 0, endHour: 24 }],
        },
        {
          trait_type: "availability",
          value: [
            { day: "monday", enabled: true },
            { day: "tuesday", enabled: true },
            { day: "wednesday", enabled: true },
            { day: "thursday", enabled: true },
            { day: "friday", enabled: true },
            { day: "saturday", enabled: true },
            { day: "sunday", enabled: true },
          ],
        },
      ],
    },
  };

  function setupAuth() {
    cy.fixture("sso-session.json").then((sessionData) => {
      cy.intercept("GET", "/api/auth/sso/session*", {
        statusCode: 200,
        body: sessionData,
      }).as("getSession");
    });

    cy.intercept("GET", "/api/contract/provider/isLabProvider*", {
      statusCode: 200,
      body: { isLabProvider: false },
    }).as("checkProvider");

    cy.mockInstitutionBookingApis({
      count: 0,
      reservationKeys: [],
      hasActiveBooking: false,
    });
  }

  /**
   * Mock the 3-step lab bookings pipeline (count → keys → full reservations).
   */
  function mockLabBookings(labId, reservations) {
    // Step 1: reservation count
    cy.intercept("GET", "/api/contract/reservation/getReservationsOfToken*", (req) => {
      const qLabId = req.query?.labId || new URL(req.url).searchParams.get("labId");
      if (String(qLabId) === String(labId)) {
        req.reply({ statusCode: 200, body: { count: reservations.length, labId } });
      } else {
        req.reply({ statusCode: 200, body: { count: 0, labId: qLabId } });
      }
    }).as("getReservationCount");

    // Step 2: reservation key by index
    cy.intercept("GET", "/api/contract/reservation/getReservationOfTokenByIndex*", (req) => {
      const index = parseInt(req.query?.index ?? new URL(req.url).searchParams.get("index"), 10);
      const key = reservations[index]?.reservationKey || "0x0000000000000000000000000000000000000000000000000000000000000000";
      req.reply({ statusCode: 200, body: { reservationKey: key, labId, index } });
    }).as("getReservationByIndex");

    // Step 3: full reservation details
    cy.intercept("GET", "/api/contract/reservation/getReservation*", (req) => {
      const qKey = req.query?.reservationKey || new URL(req.url).searchParams.get("reservationKey");
      const reservation = reservations.find((r) => r.reservationKey === qKey);
      if (reservation) {
        req.reply({ statusCode: 200, body: reservation });
      } else {
        req.reply({ statusCode: 404, body: { error: "Not found" } });
      }
    }).as("getReservation");
  }

  describe("FMU resource with concurrent bookings", () => {
    beforeEach(() => {
      cy.clearCookies();
      cy.clearLocalStorage();
      setupAuth();
      cy.mockLabApis([FMU_LAB, REGULAR_LAB]);

      // Two concurrent bookings for the FMU lab at 14:00-14:30
      mockLabBookings(5, [
        {
          reservationKey: reservationKeyA,
          labId: 5,
          status: 1,
          start: startTs,
          end: endTs,
          renter: "0x1111111111111111111111111111111111111111",
        },
        {
          reservationKey: reservationKeyB,
          labId: 5,
          status: 1,
          start: startTs,
          end: endTs,
          renter: "0x2222222222222222222222222222222222222222",
        },
      ]);
    });

    it("should render reservation form for FMU resource", () => {
      cy.visit("/reservation/5");
      cy.wait("@getSession");
      cy.wait("@getAllLabs");
      cy.wait("@getLab");
      cy.wait("@getMetadata");

      cy.contains("Book a Lab").should("be.visible");
      cy.get("#time-select").should("be.visible");
    });

    it("should show occupancy labels (N/M) in the time dropdown for FMU", () => {
      cy.visit("/reservation/5");
      cy.wait("@getSession");
      cy.wait("@getAllLabs");
      cy.wait("@getLab");
      cy.wait("@getMetadata");

      // Wait for bookings to load
      cy.wait("@getReservationCount");

      // The time select should contain occupancy notation
      // FMU with maxConcurrentUsers=3 → slots show (N/3)
      cy.get("#time-select").should("be.visible");
      cy.get("#time-select option").then(($options) => {
        // At least some options should contain the occupancy pattern (N/3)
        const occupancyOptions = $options.filter((_, el) => /\(\d+\/3\)/.test(el.textContent));
        expect(occupancyOptions.length).to.be.greaterThan(0);
      });
    });

    it("should allow selection of partially occupied FMU slot", () => {
      cy.visit("/reservation/5");
      cy.wait("@getSession");
      cy.wait("@getAllLabs");
      cy.wait("@getLab");
      cy.wait("@getMetadata");
      cy.wait("@getReservationCount");

      // The 14:00 slot should have 2/3 occupancy but NOT be disabled
      // (since 2 < 3 maxConcurrent)
      cy.get("#time-select option").then(($options) => {
        const occupiedNotFull = $options.filter((_, el) => {
          return /\(2\/3\)/.test(el.textContent) && !el.disabled;
        });
        // There should be at least one slot with 2/3 that is still selectable
        expect(occupiedNotFull.length).to.be.greaterThan(0);
      });
    });
  });

  describe("Regular lab blocks concurrent bookings", () => {
    beforeEach(() => {
      cy.clearCookies();
      cy.clearLocalStorage();
      setupAuth();
      cy.mockLabApis([FMU_LAB, REGULAR_LAB]);

      // One booking for the regular lab at 14:00-14:30
      mockLabBookings(6, [
        {
          reservationKey: reservationKeyA,
          labId: 6,
          status: 1,
          start: startTs,
          end: endTs,
          renter: "0x1111111111111111111111111111111111111111",
        },
      ]);
    });

    it("should NOT show occupancy labels for regular lab (maxConcurrentUsers = 1)", () => {
      cy.visit("/reservation/6");
      cy.wait("@getSession");
      cy.wait("@getAllLabs");
      cy.wait("@getLab");
      cy.wait("@getMetadata");
      cy.wait("@getReservationCount");

      cy.get("#time-select").should("be.visible");
      cy.get("#time-select option").then(($options) => {
        // Regular labs should NOT have (N/M) notation
        const occupancyOptions = $options.filter((_, el) => /\(\d+\/\d+\)/.test(el.textContent));
        expect(occupancyOptions.length).to.equal(0);
      });
    });

    it("should disable booked slots entirely for regular lab", () => {
      cy.visit("/reservation/6");
      cy.wait("@getSession");
      cy.wait("@getAllLabs");
      cy.wait("@getLab");
      cy.wait("@getMetadata");
      cy.wait("@getReservationCount");

      cy.get("#time-select").should("be.visible");
      // Verify that at least one option is disabled (the booked slot)
      cy.get("#time-select option:disabled").should("have.length.greaterThan", 0);
    });
  });
});
