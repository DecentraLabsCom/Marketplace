import { getContractInstance } from './contractInstance';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userWallet } = req.body;
  if (!userWallet) {
    res.status(200).json([]);
  }

  // Check other required params are also provided

  try {
    const contract = await getContractInstance();

    // Call contract
    // ...

    // Return data to client
    res.status(200).json(labs);
  } catch (error) {
    console.error('Error when trying to add a new lab:', error);
  }
}