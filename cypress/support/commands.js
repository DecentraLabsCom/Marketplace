/**
 * Cypress Custom Commands
 *
 * This file defines reusable Cypress custom commands that can be
 * utilized across multiple test files.
 *
 * Usage example:
 *   cy.customCommand()
 *
 * For more information on custom commands:
 * https://docs.cypress.io/api/cypress-api/custom-commands
 */

/**
 * Intercept LAB token balance API call with mocked data
 *
 * @param {string} balance - Mocked balance value (default: "10.0")
 * @example
 *   cy.mockLabTokenBalance("100.0");
 */
Cypress.Commands.add("mockLabTokenBalance", (balance = "10.0") => {
  cy.intercept("GET", "/api/contract/labtoken/balance*", {
    body: { balance },
  }).as("getBalance");
});

const DEFAULT_LABS = [
  {
    id: 1,
    owner: "0xprovider1230000000000000000000000000000000000",
    providerName: "Test University",
    providerEmail: "provider@test.edu",
    providerCountry: "ES",
    uri: "Lab-Test-University-1.json",
    price: "1000000000000000000",
    isListed: true,
    // Keep the default mock reservable. A zero close timestamp means 1970 to
    // the availability code, which correctly makes every current slot invalid.
    closes: 2_000_000_000,
    reputation: {
      score: 0,
      totalEvents: 0,
      ownerCancellations: 0,
      institutionalCancellations: 0,
      lastUpdated: 0,
    },
    metadata: {
      name: "Physics Lab",
      description: "Advanced physics experiments",
      attributes: [],
    },
  },
];

const getQueryParam = (url, key) => {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get(key);
  } catch (error) {
    return null;
  }
};

const isFmuResource = (lab) => {
  const resourceType = String(lab?.resourceType ?? "").trim().toLowerCase();
  return lab?.resourceType === 1 || resourceType === "1" || resourceType === "fmu";
};

/**
 * Mock lab and provider APIs used by market, lab detail, reservation,
 * and provider dashboard views.
 *
 * @param {Array} labs - Lab definitions to return (defaults to a single lab)
 */
Cypress.Commands.add("mockLabApis", (labs = DEFAULT_LABS) => {
  const normalizedLabs = Array.isArray(labs) && labs.length > 0 ? labs : DEFAULT_LABS;
  const labsById = new Map(normalizedLabs.map((lab) => [String(lab.id), lab]));

  const providers = normalizedLabs.map((lab) => ({
    account: lab.owner,
    name: lab.providerName || "Mock Provider",
    email: lab.providerEmail || "provider@example.com",
    country: lab.providerCountry || "ES",
    authURI: lab.providerAuthURI || "",
  }));

  const publicLabs = normalizedLabs.map((lab) => {
    const resourceTypeAttribute = lab.metadata?.attributes?.find(
      (attribute) => attribute?.trait_type === "resourceType",
    );

    return {
      id: Number(lab.id),
      name: lab.metadata?.name || `Lab ${lab.id}`,
      description: lab.metadata?.description || "",
      provider: lab.providerName || "Mock Provider",
      image: lab.image || "",
      price: String(lab.price || "0"),
      priceUnit: lab.priceUnit || "hour",
      category: lab.category || lab.metadata?.category || [],
      keywords: lab.metadata?.keywords || [],
      rating: lab.rating || lab.reputation || null,
      resourceType: lab.resourceType || resourceTypeAttribute?.value || 0,
      isListed: lab.isListed ?? true,
      demoEnabled: lab.demoEnabled === true,
    };
  });

  cy.intercept("GET", "/api/market/labs*", (req) => {
    const includeUnlisted = String(req.query?.includeUnlisted) === "true";
    const cursor = Math.max(Number(req.query?.cursor || 0), 0);
    const limit = Math.max(Number(req.query?.limit || 24), 1);
    const visibleLabs = includeUnlisted
      ? publicLabs
      : publicLabs.filter((lab) => lab.isListed);
    const query = String(req.query?.q || "").trim().toLowerCase();
    const searchField = String(req.query?.searchField || "keyword");
    const category = String(req.query?.category || "").trim().toLowerCase();
    const provider = String(req.query?.provider || "").trim().toLowerCase();
    const resourceType = String(req.query?.resourceType || "").trim().toLowerCase();
    const sort = String(req.query?.sort || "").trim().toLowerCase();
    const matchesQuery = (lab) => {
      if (!query) return true;
      if (searchField === "name") return String(lab.name || "").toLowerCase().includes(query);
      return [
        lab.name,
        lab.provider,
        lab.description,
        ...(Array.isArray(lab.category) ? lab.category : [lab.category]),
        ...(Array.isArray(lab.keywords) ? lab.keywords : [lab.keywords]),
      ].some((value) => String(value || "").toLowerCase().includes(query));
    };
    const filteredLabs = visibleLabs
      .filter((lab) => matchesQuery(lab))
      .filter((lab) => !category || (Array.isArray(lab.category) ? lab.category : [lab.category])
        .some((value) => String(value || "").toLowerCase() === category))
      .filter((lab) => !provider || String(lab.provider || "").toLowerCase() === provider)
      .filter((lab) => !resourceType || (resourceType === "fmu" ? isFmuResource(lab) : !isFmuResource(lab)));
    if (sort === "price_asc" || sort === "price_desc") {
      filteredLabs.sort((left, right) => {
        const comparison = BigInt(left.price || "0") - BigInt(right.price || "0");
        if (comparison === 0n) return left.id - right.id;
        return (comparison > 0n ? 1 : -1) * (sort === "price_desc" ? -1 : 1);
      });
    }
    const pageLabs = filteredLabs.slice(cursor, cursor + limit);
    const nextCursor = cursor + pageLabs.length < filteredLabs.length
      ? String(cursor + pageLabs.length)
      : null;

    req.reply({
      statusCode: 200,
      body: {
        labs: pageLabs,
        totalLabs: filteredLabs.length,
        returnedLabs: pageLabs.length,
        cursor,
        nextCursor,
        snapshotAt: new Date().toISOString(),
        facets: {
          categories: [...new Set(visibleLabs.flatMap((lab) => Array.isArray(lab.category) ? lab.category : [lab.category]).filter(Boolean))].sort(),
          providers: [...new Set(visibleLabs.map((lab) => lab.provider).filter(Boolean))].sort(),
        },
      },
    });
  }).as("getAllLabs");

  cy.intercept("GET", "/api/contract/lab/getAllLabs*", {
    body: normalizedLabs.map((lab) => Number(lab.id)),
  }).as("getAllLabs");

  cy.intercept("GET", "/api/contract/provider/getLabProviders*", {
    body: {
      providers,
      count: providers.length,
      timestamp: new Date().toISOString(),
    },
  }).as("getLabProviders");

  cy.intercept("GET", "/api/contract/lab/getLab*", (req) => {
    const labId = req.query?.labId || getQueryParam(req.url, "labId");
    const lab = labsById.get(String(labId));
    if (!lab) {
      req.reply({ statusCode: 404, body: { error: "Lab not found" } });
      return;
    }
    req.reply({
      statusCode: 200,
      body: {
        labId: Number(labId),
        base: {
          uri: lab.uri || "",
          price: lab.price || "0",
          accessURI: lab.accessURI || "",
          accessKey: lab.accessKey || "",
          createdAt: lab.createdAt || 0,
          opens: lab.opens ?? 0,
          closes: lab.closes ?? 0,
        },
      },
    });
  }).as("getLab");

  cy.intercept("GET", "/api/contract/lab/ownerOf*", (req) => {
    const labId = req.query?.labId || getQueryParam(req.url, "labId");
    const lab = labsById.get(String(labId));
    req.reply({
      statusCode: 200,
      body: {
        labId: Number(labId),
        owner: lab?.owner || "0x0000000000000000000000000000000000000000",
      },
    });
  }).as("ownerOf");

  cy.intercept("GET", "/api/contract/reservation/isTokenListed*", (req) => {
    const labId = req.query?.labId || getQueryParam(req.url, "labId");
    const lab = labsById.get(String(labId));
    req.reply({
      statusCode: 200,
      body: {
        labId: Number(labId),
        isListed: lab?.isListed ?? true,
        timestamp: new Date().toISOString(),
        processingTime: 1,
      },
    });
  }).as("isTokenListed");

  cy.intercept("GET", "/api/contract/lab/getLabReputation*", (req) => {
    const labId = req.query?.labId || getQueryParam(req.url, "labId");
    const lab = labsById.get(String(labId));
    req.reply({
      statusCode: 200,
      body: lab?.reputation || {
        score: 0,
        totalEvents: 0,
        ownerCancellations: 0,
        institutionalCancellations: 0,
        lastUpdated: 0,
      },
    });
  }).as("getLabReputation");

  cy.intercept("GET", "/api/metadata*", (req) => {
    const uri = req.query?.uri || getQueryParam(req.url, "uri");
    const lab = normalizedLabs.find((item) => item.uri === uri) || normalizedLabs[0];
    const metadata = lab?.metadata || {
      name: `Lab ${lab?.id ?? "unknown"}`,
      description: "Mock lab description",
      attributes: [],
    };

    req.reply({ statusCode: 200, body: metadata });
  }).as("getMetadata");

  cy.intercept("GET", "/api/contract/reservation/getLabCreditAddress*", {
    statusCode: 200,
    body: {
      labCreditAddress: "0x0000000000000000000000000000000000000000",
    },
  }).as("getLabCreditAddress");
});

/**
 * Navigate to lab detail page with mocked API response
 *
 * @param {string} id - Lab ID (default: "1")
 * @example
 *   cy.visitLabDetail("2");
 */
Cypress.Commands.add("visitLabDetail", (id = "1") => {
  cy.mockLabApis([
    {
      ...DEFAULT_LABS[0],
      id: Number(id),
    },
  ]);
  cy.visit(`/lab/${id}`);
  cy.wait("@getLab");
});

/**
 * Mock institutional booking endpoints used by SSO dashboard flows.
 * This avoids hitting guarded API routes that require a real signed cookie.
 *
 * @param {Object} options
 * @param {number} [options.count=0] - Number of institutional reservations
 * @param {string[]} [options.reservationKeys=[]] - Reservation keys by index
 * @param {boolean} [options.hasActiveBooking=false] - Whether user has active booking
 */
Cypress.Commands.add(
  "mockInstitutionBookingApis",
  ({
    count = 0,
    reservationKeys = [],
    hasActiveBooking = false,
  } = {}) => {
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    const keys =
      Array.isArray(reservationKeys) && reservationKeys.length > 0
        ? reservationKeys
        : [];

    cy.intercept("GET", "/api/contract/institution/getUserReservationCount*", {
      statusCode: 200,
      body: { count: safeCount },
    }).as("getUserReservationCount");

    cy.intercept(
      "GET",
      "/api/contract/institution/getUserReservationByIndex*",
      (req) => {
        const indexRaw = req.query?.index ?? getQueryParam(req.url, "index");
        const index = Number(indexRaw);
        const reservationKey =
          Number.isInteger(index) && index >= 0 && index < keys.length
            ? keys[index]
            : "0x0000000000000000000000000000000000000000000000000000000000000000";

        req.reply({
          statusCode: 200,
          body: { reservationKey, index },
        });
      }
    ).as("getUserReservationByIndex");

    cy.intercept("GET", "/api/contract/institution/hasUserActiveBooking*", {
      statusCode: 200,
      body: { hasActiveBooking },
    }).as("hasUserActiveBooking");

  }
);
