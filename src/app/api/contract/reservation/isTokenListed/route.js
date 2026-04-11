import { createContractHandler } from '../../utils/createContractHandler'

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const isMissingLabError = (error) => {
  const details = String(
    error?.reason ||
    error?.shortMessage ||
    error?.message ||
    ''
  ).toLowerCase();

  return (
    details.includes('lab does not exist') ||
    details.includes('erc721nonexistenttoken') ||
    details.includes('nonexistent token') ||
    details.includes('token does not exist')
  );
};

export const { GET } = createContractHandler({
  params: [{ name: 'labId', type: 'number' }],
  method: 'isTokenListed',
  headers: { 'Cache-Control': 'no-store, max-age=0' },
  transform: (isListed, { labId }) => ({
    labId,
    isListed,
    timestamp: new Date().toISOString()
  }),
  onError: (error) => {
    if (isMissingLabError(error)) {
      return Response.json(
        { error: 'Lab not found', type: 'NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }
  }
})
