import { createContractHandler } from '../../utils/createContractHandler'

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
  method: 'getLab',
  transform: (labData, { labId }) => ({
    labId: Number(labData[0] || labId),
    base: {
      uri: String(labData[1]?.[0] || ''),
      price: labData[1]?.[1] ? labData[1][1].toString() : '0',
      accessURI: String(labData[1]?.[2] || ''),
      accessKey: String(labData[1]?.[3] || ''),
      createdAt: labData[1]?.[4] ? Number(labData[1][4]) : 0,
      resourceType: labData[1]?.[5] ? Number(labData[1][5]) : 0,
    }
  }),
  onError: (error) => {
    if (isMissingLabError(error)) {
      return Response.json(
        { error: 'Lab does not exist', type: 'NOT_FOUND' },
        { status: 404 }
      )
    }
  }
})
