// Example: Next.js API route with fine-grained admin permission (admin:manage-users)
import type { NextApiRequest, NextApiResponse } from 'next';
import { nextAdminAuth, requireAdminPermission } from '../../../middleware/next-admin-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await nextAdminAuth(req, res, async () => {
    await requireAdminPermission('admin:manage-users')(req, res, async () => {
      // Only admins with 'admin:manage-users' permission can access this route
      if (req.method === 'GET') {
        // Example: return list of users (mocked)
        res.status(200).json({ users: [
          { id: 'admin-uuid', email: 'admin@example.com', role: 'super_admin' }
        ] });
      } else {
        res.status(405).json({ error: 'Method Not Allowed' });
      }
    });
  });
}
