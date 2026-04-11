import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  contractType: 'lab',
  method: 'decimals',
  transform: (result) => ({ decimals: Number(result) }),
  onError: () =>
    Response.json({ decimals: 6, fallback: true }, { status: 200 })
})