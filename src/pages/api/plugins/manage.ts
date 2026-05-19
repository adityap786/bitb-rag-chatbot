import type { NextApiRequest, NextApiResponse } from 'next';
import { pluginRegistry } from '../../../../plugins/registry';

// POST: Enable/disable plugin for a tenant (admin/superuser)
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tenantId, pluginId, action } = req.body;
  if (!tenantId || !pluginId || !['enable', 'disable'].includes(action)) {
    return res.status(400).json({ error: 'tenantId, pluginId, action required' });
  }
  try {
    if (action === 'enable') pluginRegistry.enableForTenant(pluginId, tenantId);
    else pluginRegistry.disableForTenant(pluginId, tenantId);
    return res.status(200).json({ success: true });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
}
