import type { NextApiRequest, NextApiResponse } from 'next';
import { listTenants } from '../../../lib/tenants/listTenants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const tenants = await listTenants();
    return res.status(200).json({ tenants });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
}
