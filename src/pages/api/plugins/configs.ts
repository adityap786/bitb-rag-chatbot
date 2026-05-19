import { NextApiRequest, NextApiResponse } from 'next';
import { getTenantPluginConfig } from '../../../../plugins/pluginTenantConfig';

// GET: Get all plugin configs for a tenant
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tenantId } = req.query;
  if (!tenantId || typeof tenantId !== 'string') {
    return res.status(400).json({ error: 'tenantId required' });
  }
  try {
    const configs = await getTenantPluginConfig(tenantId);
    return res.status(200).json({ configs });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
}
