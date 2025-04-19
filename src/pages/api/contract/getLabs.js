import { simLabsData } from '../../../utils/simLabsData';
import { getContractInstance } from './contractInstance';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const contract = await getContractInstance();

    // Get list of labs
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
          price: parseFloat(lab.base.price),
          description: metadata.description,
          provider: metadata.provider,
          auth: metadata.auth,              // Move to contract! Optional; if not present, use DecentraLabs Auth service
          accessURI: metadata.accessURI,    // Move to contract!
          accessKey: metadata.accessKey,    // Move to contract!
          timeSlots: metadata.timeSlots,    // Optional; if not present, use 60 (minutes)
          opens: metadata.opens,            // Optional
          closes: metadata.closes,          // Optional
          docs: metadata.docs,              // Optional
          images: metadata.images,
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