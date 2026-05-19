import type { NextApiRequest, NextApiResponse } from 'next';
import { createTenant } from '../../../lib/tenants/onboarding';

// POST: Create a new tenant (superuser only)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { name, branding, features } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const tenant = await createTenant({ name, branding, features });
    return res.status(200).json({ tenant });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
}
