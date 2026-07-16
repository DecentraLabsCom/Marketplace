import { getAllLabProviders } from '../getAllLabProviders';

describe('getAllLabProviders', () => {
  test('reads every provider page through the canonical paginated selector', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ account: `provider-${index}` }));
    const secondPage = [{ account: 'provider-100' }];
    const contract = {
      getLabProvidersPaginated: jest.fn()
        .mockResolvedValueOnce([firstPage, 101])
        .mockResolvedValueOnce([secondPage, 101]),
    };

    const providers = await getAllLabProviders(contract);

    expect(providers).toHaveLength(101);
    expect(contract.getLabProvidersPaginated).toHaveBeenNthCalledWith(1, 0, 100);
    expect(contract.getLabProvidersPaginated).toHaveBeenNthCalledWith(2, 100, 100);
  });
});
