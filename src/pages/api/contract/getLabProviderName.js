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
    const providerList = await contract.getLabProviders();

    const provider = providerList.find(
      (p) => p.account.toLowerCase() === wallet.toLowerCase()
    );

    if (provider) {
      return res.status(200).json({ name: provider.base.name });
    } else {
      return res.status(404).json({ error: 'Provider not found' });
    }
  } catch (error) {
    console.error('Error when trying to check provider status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}