                    it('transforma correctamente los campos base del lab', async () => {
                      mockGetLabsPaginated.mockResolvedValue([[1]]);
                      mockGetLabProviders.mockResolvedValue([]);
                      mockGetLab.mockImplementation(async (id) => [
                        id,
                        ['uri-test', 123.45, 'accessURI-test', 'accessKey-test', 9876543210]
                      ]);
                      mockOwnerOf.mockImplementation(async (id) => `0xOwner${id}`);
                      mockIsTokenListed.mockResolvedValue(true);
                      mockGetLabReputation.mockImplementation(async (id) => ({ score: 5 }));

                      const result = await getMarketLabsSnapshot();
                      expect(result.labs.length).toBe(1);
                      const base = result.labs[0].base;
                      expect(base).toMatchObject({
                        uri: 'uri-test',
                        price: '123.45',
                        accessURI: 'accessURI-test',
                        accessKey: 'accessKey-test',
                        createdAt: 9876543210
                      });
                    });
                  it('providerMapping asocia ownerAddress al provider correcto', async () => {
                    mockGetLabsPaginated.mockResolvedValue([[1]]);
                    mockGetLabProviders.mockResolvedValue([
                      { account: '0xOwner1', name: 'Provider1', email: 'mail1', country: 'ES' },
                      { account: '0xOwner2', name: 'Provider2', email: 'mail2', country: 'FR' }
                    ]);
                    mockGetLab.mockImplementation(async (id) => [id, [{}, 100, '', 0, 1234567890]]);
                    mockOwnerOf.mockImplementation(async (id) => '0xOwner1');
                    mockIsTokenListed.mockResolvedValue(true);
                    mockGetLabReputation.mockImplementation(async (id) => ({ score: 5 }));

                    const result = await getMarketLabsSnapshot();
                    expect(result.labs.length).toBe(1);
                    const provider = result.labs[0].providerMapping.mapOwnerToProvider('0xOwner1');
                    expect(provider).toMatchObject({ name: 'Provider1', email: 'mail1', country: 'ES', account: '0xOwner1' });
                  });
                it('snapshotAt es siempre una fecha ISO válida', async () => {
                  mockGetLabsPaginated.mockResolvedValue([[1]]);
                  mockGetLabProviders.mockResolvedValue([]);
                  mockGetLab.mockImplementation(async (id) => [id, [{}, 100, '', 0, 1234567890]]);
                  mockOwnerOf.mockImplementation(async (id) => `0xOwner${id}`);
                  mockIsTokenListed.mockResolvedValue(true);
                  mockGetLabReputation.mockImplementation(async (id) => ({ score: 5 }));

                  const result = await getMarketLabsSnapshot();
                  expect(result.snapshotAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
                  expect(new Date(result.snapshotAt).toString()).not.toBe('Invalid Date');
                });
              it('incluye labs aunque loadMetadataDocument falle (sin metadata ni imágenes)', async () => {
                mockGetLabsPaginated.mockResolvedValue([[1]]);
                mockGetLabProviders.mockResolvedValue([]);
                mockGetLab.mockImplementation(async (id) => [id, ['Lab-1', 100, '', 0, 1234567890]]);
                mockOwnerOf.mockImplementation(async (id) => `0xOwner${id}`);
                mockIsTokenListed.mockResolvedValue(true);
                mockGetLabReputation.mockImplementation(async (id) => ({ score: 5 }));

                // Mock enrichment helpers para simular error en loadMetadataDocument
                jest.doMock('../getMarketLabsSnapshot', () => {
                  const original = jest.requireActual('../getMarketLabsSnapshot');
                  return {
                    ...original,
                    loadMetadataDocument: async () => { throw new Error('Metadata error'); },
                  };
                });

                const result = await getMarketLabsSnapshot();
                expect(result.labs.length).toBe(1);
                expect(result.labs[0].metadata).toBeUndefined();
                expect([undefined, []]).toContainEqual(result.labs[0].imageUrls);
              });
            it('incluye labs aunque getLabProviders falle (sin provider info)', async () => {
              mockGetLabsPaginated.mockResolvedValue([[1]]);
              mockGetLabProviders.mockRejectedValue(new Error('Providers error'));
              mockGetLab.mockImplementation(async (id) => [id, [{}, 100, '', 0, 1234567890]]);
              mockOwnerOf.mockImplementation(async (id) => `0xOwner${id}`);
              mockIsTokenListed.mockResolvedValue(true);
              mockGetLabReputation.mockImplementation(async (id) => ({ score: 5 }));

              const result = await getMarketLabsSnapshot();
              expect(result.labs.length).toBe(1);
              // providerMapping debe existir pero no asociar nada
              expect(result.labs[0].providerMapping).toBeDefined();
              expect(result.labs[0].providerMapping.mapOwnerToProvider('0xOwner1')).toBeNull();
            });
          it('incluye labs cuyo getLabReputation falla, pero con reputation null', async () => {
            mockGetLabsPaginated.mockResolvedValue([[1]]);
            mockGetLabProviders.mockResolvedValue([]);
            mockGetLab.mockImplementation(async (id) => [id, [{}, 100, '', 0, 1234567890]]);
            mockOwnerOf.mockImplementation(async (id) => `0xOwner${id}`);
            mockIsTokenListed.mockResolvedValue(true);
            mockGetLabReputation.mockRejectedValue(new Error('Reputation error'));

            const result = await getMarketLabsSnapshot();
            expect(result.labs.length).toBe(1);
            expect(result.labs[0].reputation).toBeNull();
          });
        it('considera listado el lab si isTokenListed falla', async () => {
          mockGetLabsPaginated.mockResolvedValue([[1]]);
          mockGetLabProviders.mockResolvedValue([]);
          mockGetLab.mockImplementation(async (id) => [id, [{}, 100, '', 0, 1234567890]]);
          mockOwnerOf.mockImplementation(async (id) => `0xOwner${id}`);
          mockIsTokenListed.mockRejectedValue(new Error('TokenListed error'));
          mockGetLabReputation.mockImplementation(async (id) => ({ score: 5 }));

          const result = await getMarketLabsSnapshot();
          expect(result.labs.length).toBe(1);
          expect(result.labs[0].isListed).toBe(true);
        });
      it('incluye labs cuyo ownerOf falla, pero con ownerAddress null', async () => {
        mockGetLabsPaginated.mockResolvedValue([[1, 2]]);
        mockGetLabProviders.mockResolvedValue([]);
        mockGetLab.mockImplementation(async (id) => [id, [{}, 100, '', 0, 1234567890]]);
        // ownerOf falla para el lab 2
        mockOwnerOf.mockImplementation(async (id) => {
          if (id === 2) throw new Error('Owner error');
          return `0xOwner${id}`;
        });
        mockIsTokenListed.mockResolvedValue(true);
        mockGetLabReputation.mockImplementation(async (id) => ({ score: 5 }));

        const result = await getMarketLabsSnapshot();
        // Ambos labs deben aparecer, pero el lab 2 con ownerAddress null
        expect(result.labs.length).toBe(2);
        expect(result.labs.find(l => l.labId === 1).ownerAddress).toBe('0xOwner1');
        expect(result.labs.find(l => l.labId === 2).ownerAddress).toBeNull();
      });
    it('excluye labs cuyo getLab falla, pero incluye los válidos', async () => {
      mockGetLabsPaginated.mockResolvedValue([[1, 2, 3]]);
      mockGetLabProviders.mockResolvedValue([]);
      // getLab falla para el lab 2
      mockGetLab.mockImplementation(async (id) => {
        if (id === 2) throw new Error('Lab error');
        return [id, [{}, 100, '', 0, 1234567890]];
      });
      mockOwnerOf.mockImplementation(async (id) => `0xOwner${id}`);
      mockIsTokenListed.mockResolvedValue(true);
      mockGetLabReputation.mockImplementation(async (id) => ({ score: 5 }));

      const result = await getMarketLabsSnapshot();
      // Solo labs 1 y 3 deben aparecer
      expect(result.labs.length).toBe(2);
      expect(result.labs.map(l => l.labId).sort()).toEqual([1, 3]);
    });
  it('devuelve snapshot vacía si getLabsPaginated falla', async () => {
    mockGetLabsPaginated.mockRejectedValue(new Error('Contract error'));
    mockGetLabProviders.mockResolvedValue([]);
    // No se deben llamar los otros mocks
    const result = await getMarketLabsSnapshot();
    expect(result).toMatchObject({ labs: [], totalLabs: 0 });
  });
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
  
    it('excluye labs no listados por defecto', async () => {
      mockGetLabsPaginated.mockResolvedValue([[1, 2, 3]]);
      mockGetLabProviders.mockResolvedValue([]);
      mockGetLab.mockImplementation(async (id) => [id, [{}, 100, '', 0, 1234567890]]);
      mockOwnerOf.mockImplementation(async (id) => `0xOwner${id}`);
      // Alterna listado: solo el lab 2 está listado
      mockIsTokenListed.mockImplementation(async (id) => id === 2);
      mockGetLabReputation.mockImplementation(async (id) => ({ score: 5 }));

      const result = await getMarketLabsSnapshot();
      // Solo el lab 2 debe aparecer
      expect(result.labs.length).toBe(1);
      expect(result.labs[0].labId).toBe(2);
    });

    it('incluye labs no listados si includeUnlisted=true', async () => {
      mockGetLabsPaginated.mockResolvedValue([[1, 2, 3]]);
      mockGetLabProviders.mockResolvedValue([]);
      mockGetLab.mockImplementation(async (id) => [id, [{}, 100, '', 0, 1234567890]]);
      mockOwnerOf.mockImplementation(async (id) => `0xOwner${id}`);
      // Alterna listado: solo el lab 2 está listado
      mockIsTokenListed.mockImplementation(async (id) => id === 2);
      mockGetLabReputation.mockImplementation(async (id) => ({ score: 5 }));

      const result = await getMarketLabsSnapshot({ includeUnlisted: true });
      // Deben aparecer todos los labs
      expect(result.labs.length).toBe(3);
      expect(result.labs.map(l => l.labId).sort()).toEqual([1, 2, 3]);
    });
});
