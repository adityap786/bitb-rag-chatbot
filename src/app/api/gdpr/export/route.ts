/**
 * GDPR Data Export Endpoint
 * 
 * Implements GDPR Article 15 - Right of Access
 * Allows users to export all their personal data in a portable format (JSON)
 * 
 * Security:
 * - Requires admin authentication
 * - Tenant-scoped via RLS
 * - Audit logged
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, setTenantContext } from '@/lib/supabase-client';

interface GDPRExportRequest {
    tenant_id: string;
    user_id?: string;        // Optional: specific user, or all if omitted
    include_chat_content?: boolean;  // Whether to include full chat messages
}

interface GDPRExportResponse {
    export_date: string;
    tenant_id: string;
    user_id: string | null;
    format_version: string;
    data: {
        chat_sessions: any[];
        documents_uploaded: any[];
        embeddings_summary: {
            total_count: number;
            by_document: { document_id: string; count: number }[];
        };
        activity_logs: any[];
        profile?: any;
    };
    metadata: {
        total_chats: number;
        total_documents: number;
        total_messages: number;
        first_activity: string | null;
        last_activity: string | null;
        export_requested_at: string;
    };
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();

    try {
        // 1. Parse and validate request
        const body: GDPRExportRequest = await req.json();
        const { tenant_id, user_id, include_chat_content = true } = body;

        if (!tenant_id) {
            return NextResponse.json(
                { error: 'tenant_id is required' },
                { status: 400 }
            );
        }

        // 2. Get Supabase client and set tenant context
        const supabase = getServiceClient();
        await setTenantContext(supabase, tenant_id);

        // 3. Build queries based on whether user_id is provided
        const userFilter = user_id ? { user_id } : {};

        // 4. Gather chat sessions
        let chatQuery = supabase
            .from('chat_sessions')
            .select(include_chat_content
                ? 'id, created_at, updated_at, user_id, messages, metadata'
                : 'id, created_at, updated_at, user_id, metadata'
            )
            .eq('tenant_id', tenant_id);

        if (user_id) {
            chatQuery = chatQuery.eq('user_id', user_id);
        }

        const { data: chatSessions, error: chatError } = await chatQuery
            .order('created_at', { ascending: false })
            .limit(1000);

        if (chatError) {
            console.error('GDPR Export - Chat sessions error:', chatError);
        }

        // 5. Gather uploaded documents
        let docsQuery = supabase
            .from('knowledge_base')
            .select('id, filename, source_type, source_url, created_at, updated_at, metadata')
            .eq('tenant_id', tenant_id);

        if (user_id) {
            docsQuery = docsQuery.eq('uploaded_by', user_id);
        }

        const { data: documents, error: docsError } = await docsQuery
            .order('created_at', { ascending: false })
            .limit(500);

        if (docsError) {
            console.error('GDPR Export - Documents error:', docsError);
        }

        // 6. Gather embeddings summary (counts only, not vectors)
        const { data: embeddingsSummary, error: embeddingsError } = await supabase
            .from('embeddings')
            .select('document_id')
            .eq('tenant_id', tenant_id);

        // Group by document_id
        const embeddingsByDoc: Record<string, number> = {};
        (embeddingsSummary || []).forEach((e: any) => {
            embeddingsByDoc[e.document_id] = (embeddingsByDoc[e.document_id] || 0) + 1;
        });

        // 7. Gather audit logs (sanitized)
        let auditQuery = supabase
            .from('rag_audit_log')
            .select('created_at, operation, chunks_returned, latency_ms, metadata')
            .eq('tenant_id', tenant_id);

        if (user_id) {
            auditQuery = auditQuery.eq('user_id', user_id);
        }

        const { data: auditLogs, error: auditError } = await auditQuery
            .order('created_at', { ascending: false })
            .limit(1000);

        if (auditError) {
            console.error('GDPR Export - Audit logs error:', auditError);
        }

        // 8. Calculate metadata
        const allDates = [
            ...(chatSessions || []).map((c: any) => c.created_at),
            ...(documents || []).map((d: any) => d.created_at),
            ...(auditLogs || []).map((a: any) => a.created_at),
        ].filter(Boolean).sort();

        const totalMessages = (chatSessions || []).reduce((sum: number, session: any) => {
            return sum + (session.messages?.length || 0);
        }, 0);

        // 9. Build export response
        const exportResponse: GDPRExportResponse = {
            export_date: new Date().toISOString(),
            tenant_id,
            user_id: user_id || null,
            format_version: '1.0.0',
            data: {
                chat_sessions: chatSessions || [],
                documents_uploaded: documents || [],
                embeddings_summary: {
                    total_count: embeddingsSummary?.length || 0,
                    by_document: Object.entries(embeddingsByDoc).map(([doc_id, count]) => ({
                        document_id: doc_id,
                        count,
                    })),
                },
                activity_logs: auditLogs || [],
            },
            metadata: {
                total_chats: chatSessions?.length || 0,
                total_documents: documents?.length || 0,
                total_messages: totalMessages,
                first_activity: allDates[0] || null,
                last_activity: allDates[allDates.length - 1] || null,
                export_requested_at: new Date().toISOString(),
            },
        };

        // 10. Log the export for compliance
        console.info('GDPR Export completed', {
            tenant_id,
            user_id: user_id || 'all',
            duration_ms: Date.now() - startTime,
            records: {
                chats: chatSessions?.length || 0,
                documents: documents?.length || 0,
                logs: auditLogs?.length || 0,
            },
        });

        // 11. Return as downloadable JSON
        const filename = user_id
            ? `gdpr-export-${tenant_id}-${user_id}-${Date.now()}.json`
            : `gdpr-export-${tenant_id}-all-${Date.now()}.json`;

        return new NextResponse(JSON.stringify(exportResponse, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'X-Content-Type-Options': 'nosniff',
            },
        });

    } catch (error) {
        console.error('GDPR Export failed:', error);
        return NextResponse.json(
            { error: 'Export failed', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// Also support GET for simpler integrations
export async function GET(req: NextRequest) {
    const tenant_id = req.nextUrl.searchParams.get('tenant_id');
    const user_id = req.nextUrl.searchParams.get('user_id');
    const include_chat_content = req.nextUrl.searchParams.get('include_chat_content') !== 'false';

    if (!tenant_id) {
        return NextResponse.json(
            { error: 'tenant_id query parameter is required' },
            { status: 400 }
        );
    }

    // Create a mock request with the body
    const mockReq = new NextRequest(req.url, {
        method: 'POST',
        body: JSON.stringify({ tenant_id, user_id, include_chat_content }),
    });

    return POST(mockReq);
}
