// Example Next.js API route using admin RBAC middleware
import type { NextApiRequest, NextApiResponse } from 'next';
import { nextAdminAuth, requireAdminPermission } from '../../../middleware/next-admin-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await nextAdminAuth(req, res, async () => {
    await requireAdminPermission('admin:read')(req, res, async () => {
      // Your protected admin logic here
      res.status(200).json({ message: 'Admin access granted', user: (req as any).adminUser });
    });
  });
}
