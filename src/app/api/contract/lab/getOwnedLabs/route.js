import devLog from '@/utils/logger';

import { getContractInstance } from '../../utils/contractInstance';

export async function GET(request) {
  const { wallet } = await request.json();
  if (!wallet) {
    return Response.json({ error: 'Missing wallet address' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();
    const labList = await Promise.race([
      contract.getAllLabs(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getAllLabs timeout')), 15000)
      )
    ]);

    const ownedLabs = [];
    for (const lab of labList) {
      const labId = lab.labId.toString();
      const owner = await Promise.race([
        contract.ownerOf(labId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`ownerOf timeout for ${labId}`)), 5000)
        )
      ]);
      if (owner.toLowerCase() === wallet.toLowerCase()) {
        let name = "Unnamed Lab";
        // Fetch metadata from URI
        try {
          const response = await fetch(lab.base.uri);
          if (response.ok) {
            const metadata = await response.json();
            name = metadata?.name ?? name;
          }
        } catch (err) {
          devLog.warn(`Failed to fetch metadata for lab ${labId} from ${lab.base.uri}:`, err.message);
          // Keep default name and continue
        }
        ownedLabs.push({
          id: labId,
          name
        });
      }
    }

    return Response.json(ownedLabs, { status: 200 });
  } catch (error) {
    devLog.error('Error fetching list of owned labs:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
