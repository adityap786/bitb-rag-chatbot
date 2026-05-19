import type { NextApiRequest, NextApiResponse } from 'next';
import { setTenantPluginConfig } from '../../../../plugins/pluginTenantConfig';

// POST: Set plugin config for a tenant
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tenantId, pluginId, config, enabled } = req.body;
  if (!tenantId || !pluginId) {
    return res.status(400).json({ error: 'tenantId and pluginId required' });
  }
  try {
    await setTenantPluginConfig(tenantId, pluginId, config, enabled);
    return res.status(200).json({ success: true });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
}
