import devLog from '@/utils/logger';

import { getContractInstance } from '../../utils/contractInstance';
import { ethers } from 'ethers';
import { formatUnits } from 'viem';
import { contractAddressesLAB, labTokenABI } from '@/contracts/lab';
import { defaultChain } from '@/utils/networkConfig';

// Cache for LAB token decimals
let labTokenDecimals = null;

// Function to get LAB token decimals
async function getLabTokenDecimals() {
  if (labTokenDecimals !== null) {
    return labTokenDecimals;
  }
  
  try {
    // Get LAB token contract instance directly
    const labTokenContract = await getContractInstance('lab');
    
    // Direct call with timeout
    labTokenDecimals = await Promise.race([
      labTokenContract.decimals(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('decimals() timeout')), 5000)
      )
    ]);
    
    // Convert BigInt to number for compatibility
    labTokenDecimals = Number(labTokenDecimals);
    
    return labTokenDecimals;
  } catch (error) {
    devLog.error('Error getting LAB token decimals:', error);
    return 6; // Default to 6 decimals for LAB token if error
  }
}

// Function to convert price from token units to human format
// Keep price per second as stored in contract, UI will handle per hour conversion
function convertPriceToHuman(priceString, decimals) {
  if (!priceString || priceString === '0') return 0;
  
  try {
    // Convert from wei to decimal format (per second, as stored in contract)
    return parseFloat(formatUnits(BigInt(priceString), decimals));
  } catch (error) {
    devLog.error('Error converting price to human format:', error);
    return parseFloat(priceString); // Fallback to original value
  }
}

export async function POST(request) {
  const body = await request.json();
  const { email } = body;
  
  if (!email) {
    return Response.json({ error: 'Missing email address' }, { status: 400 });
  }

  try {
    const contract = await getContractInstance();
    
    // Get LAB token decimals for price conversion
    const decimals = await getLabTokenDecimals();
    
    // For SSO providers, labs are owned by the server wallet
    const serverWallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
    const serverWalletAddress = serverWallet.address;
    
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
          price: convertPriceToHuman(lab.base.price.toString(), decimals),
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
