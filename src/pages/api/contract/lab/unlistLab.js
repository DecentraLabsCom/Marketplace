import { getContractInstance } from '../utils/contractInstance';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet, labId } = req.body;
  if (!wallet || !labId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Check other required params are also provided

  try {
    const contract = await getContractInstance();

    // Call contract
    // ...

    // Return data to client
    res.status(200).json(labs);
  } catch (error) {
    console.error('Error when trying to unlist a lab:', error);
  }
}