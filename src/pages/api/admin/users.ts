// Example: Next.js API route with fine-grained admin permission (admin:manage-users)
import type { NextApiRequest, NextApiResponse } from 'next';
import { nextAdminAuth, requireAdminPermission } from '../../../middleware/next-admin-auth';
import { AdminAuthService } from '../../../lib/auth/admin-jwt';
import { getServiceClient } from '../../../lib/supabase-client';

const authService = new AdminAuthService({ jwtSecret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await nextAdminAuth(req, res, async () => {
    await requireAdminPermission('admin:manage-users')(req, res, async () => {
      try {
        if (req.method === 'GET') {
          const limit = Number(req.query.limit || 50);
          const offset = Number(req.query.offset || 0);
          const users = await authService.listUsers(limit, offset);
          return res.status(200).json({ users });
        }

        if (req.method === 'POST') {
          const { email, password, role, full_name } = req.body ?? {};
          if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
          const user = await authService.createUser(String(email), String(password), (role as any) || 'admin', full_name ?? null);
          return res.status(201).json({ user });
        }

        if (req.method === 'PUT') {
          const { id, full_name, role, is_active } = req.body ?? {};
          if (!id) return res.status(400).json({ error: 'id required' });
          const supabase = getServiceClient();
          const updates: Record<string, unknown> = {};
          if (full_name !== undefined) updates.full_name = full_name;
          if (role !== undefined) updates.role = role;
          if (is_active !== undefined) updates.is_active = is_active;
          const { error } = await supabase.from('admin_users').update(updates).eq('id', id);
          if (error) return res.status(500).json({ error: error.message });
          return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
          const { id } = req.body ?? {};
          if (!id) return res.status(400).json({ error: 'id required' });
          const supabase = getServiceClient();
          const { error } = await supabase.from('admin_users').update({ is_active: false }).eq('id', id);
          if (error) return res.status(500).json({ error: error.message });
          await authService.revokeTokensForUser(id);
          return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return res.status(500).json({ error: msg });
      }
    });
  });
}
