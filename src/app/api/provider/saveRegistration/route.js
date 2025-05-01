import fs from 'fs';
import path from 'path';

const DATA_FILE = path.resolve(process.cwd(), 'data', 'pendingProviders.json');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const provider = req.body;

  try {
    // Read existing registers from the file
    let providers = [];
    if (fs.existsSync(DATA_FILE)) {
      const file = fs.readFileSync(DATA_FILE, 'utf-8');
      providers = JSON.parse(file);
    }

    // Add a new one
    providers.push({ ...provider, createdAt: new Date().toISOString() });

    // Save the updated list back to the file
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(providers, null, 2));

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving provider:', error);
    res.status(500).json({ error: 'Failed to save provider' });
  }
}