import { getContractInstance } from '../utils/contractInstance';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, wallet, country  } = req.body;
  if (!name || !email || !wallet || !country) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const contract = await getContractInstance();

    // Call contract
    const tx = await contract.addProvider(name, wallet, email, country);
    await tx.wait();

    // Return ok signal to client
    res.status(200);
  } catch (error) {
    console.error('Error when trying to add a new provider:', error);
  }
}