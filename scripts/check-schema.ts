
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking schema for table: embeddings');
    // We can't query information_schema directly via supabase-js easily without Rpc or raw sql if not enabled.
    // But we can try to select * limit 1 and see the returned keys, or use a known RPC if available.
    // Better: valid RPC "get_schema_info" or similar if we had it.
    // Fallback: Just try to select one row.

    const { data, error } = await supabase.from('embeddings').select('*').limit(1);

    if (error) {
        console.error('Error selecting from embeddings:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns found based on first row:', Object.keys(data[0]));
        console.log('Sample data:', data[0]);
    } else {
        console.log('Table is empty. Cannot infer columns from data.');
        // Try to insert a dummy row with just required fields known from 001 migration to see if it works?
        // Or assume 001 migration + 768 update is source of truth.
        // Let's assume 001 is truth: 
        // tenant_id: text, chunk_text: text, embedding: vector, metadata: jsonb
        console.log('Assuming defaults from 001_create_embeddings_with_rls.sql');
    }
}

checkSchema();
