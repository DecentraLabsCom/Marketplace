const PROVIDER_PAGE_SIZE = 100;

const asArray = (value) => {
  if (!value || typeof value.length !== 'number') return [];
  return Array.from(value);
};

export const getAllLabProviders = async (contract) => {
  const providers = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const result = await contract.getLabProvidersPaginated(offset, PROVIDER_PAGE_SIZE);
    const page = asArray(result?.providers ?? result?.[0]);
    const parsedTotal = Number(result?.total ?? result?.[1]);
    total = Number.isSafeInteger(parsedTotal) && parsedTotal >= 0
      ? parsedTotal
      : offset + page.length;
    providers.push(...page);

    if (page.length === 0) break;
    offset += page.length;
  }

  return providers;
};
