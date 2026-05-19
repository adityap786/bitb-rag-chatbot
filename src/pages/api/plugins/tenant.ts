import type { NextApiRequest, NextApiResponse } from 'next';
import { pluginRegistry } from '../../../../plugins/registry';

// GET: List plugins enabled for a tenant
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tenantId } = req.query;
  if (!tenantId || typeof tenantId !== 'string') {
    return res.status(400).json({ error: 'tenantId required' });
  }
  const plugins = pluginRegistry.getPluginsForTenant(tenantId).map(p => p.meta);
  return res.status(200).json({ plugins });
}
