import { getContractInstance } from '../../utils/contractInstance'
import { readLabCreatorPucHash } from '@/utils/blockchain/labCreatorHash'

export async function GET(request) {
  const url = new URL(request.url)
  const labId = url.searchParams.get('labId')

  if (!labId) {
    return Response.json({ error: 'Missing labId parameter' }, { status: 400 })
  }

  const numericLabId = Number(labId)
  if (isNaN(numericLabId) || numericLabId < 0) {
    return Response.json(
      {
        error: 'Invalid labId format - must be a positive number',
        providedLabId: labId,
      },
      { status: 400 }
    )
  }

  try {
    const contract = await getContractInstance()
    const creatorPucHash = await readLabCreatorPucHash(contract, numericLabId)

    return Response.json(
      {
        labId: numericLabId,
        creatorPucHash,
      },
      { status: 200 }
    )
  } catch (error) {
    return Response.json(
      {
        error: `Failed to fetch creator hash for lab ${numericLabId}`,
        labId: numericLabId,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
