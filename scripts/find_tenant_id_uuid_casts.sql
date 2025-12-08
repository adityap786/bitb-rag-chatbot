-- Find all functions and triggers referencing tenant_id as uuid or with casts
SELECT n.nspname as schema,
       p.proname as function,
       pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE pg_get_functiondef(p.oid) ILIKE '%tenant_id::uuid%'
   OR pg_get_functiondef(p.oid) ILIKE '%::uuid%tenant_id%'
   OR pg_get_functiondef(p.oid) ILIKE '%uuid%tenant_id%';

-- Find all trigger functions referencing tenant_id as uuid or with casts
SELECT event_object_schema as table_schema,
       event_object_table as table_name,
       trigger_name,
       action_statement
FROM information_schema.triggers
WHERE action_statement ILIKE '%tenant_id::uuid%'
   OR action_statement ILIKE '%::uuid%tenant_id%'
   OR action_statement ILIKE '%uuid%tenant_id%';
