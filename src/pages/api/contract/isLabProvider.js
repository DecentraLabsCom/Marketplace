import { getContractInstance } from './contractInstance';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet } = req.body;
  if (!wallet) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const contract = await getContractInstance();

    const isLabProvider = await contract.isLabProvider(wallet);
    
    res.status(200).json({ isLabProvider });
  } catch (error) {
    console.error('Error when trying to check provider status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}