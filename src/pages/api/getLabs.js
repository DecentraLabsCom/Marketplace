import { ethers } from 'ethers';
import { contractABI, contractAddresses } from '../../contracts/diamond';
import getProvider from './getProvider';
import { defaultChain } from '../../utils/networkConfig.js';
import { simLabsData } from '../../utils/simLabsData';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const provider = await getProvider(defaultChain);

    const contract = new ethers.Contract(
            contractAddresses[defaultChain.name.toLowerCase()], contractABI
        ).connect(provider);

    // Get list of lab IDs
    const labList = await contract.getAllCPSs();

    // Get lab metadata
    const labs = await Promise.all(
      labList.map(async (lab) => {
        const labId = lab.CPSId.toString();
        // Fetch metadata from URI
        const metadataURI = lab.base.uri;
        const response = await fetch(metadataURI);
        if (!response.ok) {
          throw new Error(`Failed to fetch metadata for lab ${labId}: ${response.statusText}`);
        }
        const metadata = await response.json();

        return {
          id: labId,
          name: metadata.name,
          category: metadata.category,
          keywords: metadata.keywords,
          price: parseFloat(labData.base.price),
          description: metadata.description,
          provider: metadata.provider,
          auth: metadata.auth,
          image: metadata.images,
          docs: metadata.docs,
        };
      })
    );

    // Return data to client
    res.status(200).json(labs);
  } catch (error) {
    console.error('Error fetching labs metadata:', error);
    try {
      const fallbackLabs = simLabsData();
      res.status(200).json(fallbackLabs);
    } catch (fallbackError) {
      console.error('Error fetching fallback labs data:', fallbackError);
      res.status(500).json({ error: 'Failed to fetch labs metadata and fallback data' });
    }
  }
}