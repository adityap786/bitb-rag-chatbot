import type { NextApiRequest, NextApiResponse } from 'next';
import { getTenantBranding, setTenantBranding } from '../../../lib/branding/tenantBranding';

// GET: Get branding for a tenant
// POST: Set branding for a tenant (admin only)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tenantId } = req.query;
  if (!tenantId || typeof tenantId !== 'string') return res.status(400).json({ error: 'tenantId required' });
  if (req.method === 'GET') {
    try {
      const branding = await getTenantBranding(tenantId);
      return res.status(200).json({ branding });
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  }
  if (req.method === 'POST') {
    const { branding } = req.body;
    try {
      await setTenantBranding(tenantId, branding);
      return res.status(200).json({ success: true });
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  }
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
