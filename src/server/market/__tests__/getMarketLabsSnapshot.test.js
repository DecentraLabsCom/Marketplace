// Mock enrichment helpers to return simple objects
jest.mock('@/hooks/lab/labEnrichmentHelpers', () => ({
  buildEnrichedLab: ({ lab, isListed, reputation, ownerAddress, providerMapping }) => ({
    ...lab,
    isListed,
    reputation,
    ownerAddress,
    providerMapping,
  }),
  collectMetadataImages: () => [],
}));
// Mock next/cache unstable_cache to bypass caching in tests
jest.mock('next/cache', () => ({
  unstable_cache: (fn) => fn,
}));

// Polyfill global Request for Next.js server code in Jest
if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor() {}
  };
}


// Mock the contract instance using the alias path
const mockGetLabsPaginated = jest.fn();
const mockGetLabProviders = jest.fn();
const mockGetLab = jest.fn();
const mockOwnerOf = jest.fn();
const mockIsTokenListed = jest.fn();
const mockGetLabReputation = jest.fn();

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: async () => ({
    getLabsPaginated: mockGetLabsPaginated,
    getLabProviders: mockGetLabProviders,
    getLab: mockGetLab,
    ownerOf: mockOwnerOf,
    isTokenListed: mockIsTokenListed,
    getLabReputation: mockGetLabReputation,
  }),
}));


// Always clear the require cache for getMarketLabsSnapshot.js before each test
let getMarketLabsSnapshot;

beforeEach(() => {
  jest.resetModules();
  getMarketLabsSnapshot = require('../getMarketLabsSnapshot').getMarketLabsSnapshot;
});


// Test: Llama a todos los métodos del contrato y transforma los datos correctamente

describe('getMarketLabsSnapshot - integración de contrato y transformación', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('llama a todos los métodos del contrato y transforma los datos', async () => {
    // Arrange: mocks para 2 labs
    mockGetLabsPaginated.mockResolvedValue([[1, 2]]);
    mockGetLabProviders.mockResolvedValue([{ account: '0xProvider', name: 'Provider', email: 'mail', country: 'ES' }]);
    mockGetLab.mockImplementation(async (id) => [id, [{}, 100, '', 0, 1234567890]]);
    mockOwnerOf.mockImplementation(async (id) => `0xOwner${id}`);
    mockIsTokenListed.mockResolvedValue(true);
    mockGetLabReputation.mockImplementation(async (id) => ({ score: 5, totalEvents: 10, ownerCancellations: 1, institutionalCancellations: 0, lastUpdated: 1234567890 }));

    // Act
    const result = await getMarketLabsSnapshot();

    // Assert: se llamaron los métodos correctos
    expect(mockGetLabsPaginated).toHaveBeenCalled();
    expect(mockGetLabProviders).toHaveBeenCalled();
    expect(mockGetLab).toHaveBeenCalledTimes(2);
    expect(mockOwnerOf).toHaveBeenCalledTimes(2);
    expect(mockIsTokenListed).toHaveBeenCalledTimes(2);
    expect(mockGetLabReputation).toHaveBeenCalledTimes(2);

    // Assert: estructura de datos transformada
    expect(result).toHaveProperty('labs');
    expect(Array.isArray(result.labs)).toBe(true);
    expect(result.labs.length).toBe(2);
    expect(result.labs[0]).toMatchObject({
      labId: 1,
      base: expect.any(Object),
      isListed: true,
      reputation: expect.any(Object),
      ownerAddress: '0xOwner1',
      providerMapping: expect.any(Object),
    });
    expect(result.labs[1].labId).toBe(2);
    expect(result).toHaveProperty('totalLabs', 2);
    expect(result).toHaveProperty('snapshotAt');
  });
});
