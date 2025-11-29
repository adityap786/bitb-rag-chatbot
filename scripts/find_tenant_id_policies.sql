-- Find all RLS policies referencing tenant_id and show their definitions
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE qual ILIKE '%tenant_id%' OR with_check ILIKE '%tenant_id%';
