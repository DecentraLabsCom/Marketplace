import { createContractHandler } from '../../utils/createContractHandler'

export const { GET } = createContractHandler({
  params: [
    { name: 'labId' },
    { name: 'start' },
    { name: 'end' },
  ],
  method: 'checkAvailable',
  transform: (result, p) => ({ labId: p.labId, start: p.start, end: p.end, isAvailable: result }),
})

