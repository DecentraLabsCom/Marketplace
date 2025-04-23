import { getContractInstance } from './contractInstance';

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
    // ...

    // Return data to client
    res.status(200).json(labs);
  } catch (error) {
    console.error('Error when trying to add a new provider:', error);
  }
}