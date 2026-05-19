import type { NextApiRequest, NextApiResponse } from 'next';
import { pluginRegistry } from '../../../plugins/registry';

// GET: List all registered plugins (superuser only)
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const plugins = Array.from(pluginRegistry['plugins'].values()).map(p => p.meta);
    return res.status(200).json({ plugins });
  }
  res.setHeader('Allow', ['GET']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
