import devLog from '@/utils/logger';

import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';
import { ethers } from 'ethers';

export async function POST(request) {
  const body = await request.json();
  const { email } = body;
  
  if (!email) {
    return Response.json({ error: 'Missing email address' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();
    
    // For SSO providers, labs are owned by the server wallet
    const serverWallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
    const serverWalletAddress = serverWallet.address;
    
    const labList = await retry(() => contract.getAllLabs());

    const ownedLabs = [];
    for (const lab of labList) {
      const labId = lab.labId.toString();
      const owner = await retry(() => contract.ownerOf(labId));
      
      // Check if this lab is owned by the server wallet
      if (owner.toLowerCase() === serverWalletAddress.toLowerCase()) {
        // Additional check: verify this lab belongs to the SSO provider by checking metadata
        let labMetadata = null;
        try {
          const response = await fetch(lab.base.uri);
          if (response.ok) {
            labMetadata = await response.json();
          }
        } catch (err) {
          devLog.warn(`Failed to fetch metadata for SSO lab ${labId} from ${lab.base.uri}:`, err.message);
          // Continue with default metadata
        }

        // Check if this lab's metadata indicates it belongs to this email/provider
        // This assumes lab metadata includes provider email or we'll include all server-owned labs
        let name = "Unnamed Lab";
        if (labMetadata?.name) {
          name = labMetadata.name;
        }

        ownedLabs.push({
          id: labId,
          name: name,
          opens: lab.base.opens.toString(),
          closes: lab.base.closes.toString(),
          price: lab.base.price.toString(),
          uri: lab.base.uri,
          isPrivate: lab.base.isPrivate,
          owner: owner
        });
      }
    }

    return Response.json({ labs: ownedLabs }, { status: 200 });
  } catch (error) {
    devLog.error('Error getting SSO owned labs:', error);
    return Response.json({ error: 'Failed to get owned labs' }, { status: 500 });
  }
}
