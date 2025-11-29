import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import { createHash } from 'crypto';
import type { GenerateWidgetResponse } from '@/types/trial';
import { buildRAGPipeline } from '@/lib/trial/rag-pipeline';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const WIDGET_CDN_URL = process.env.NEXT_PUBLIC_WIDGET_CDN_URL || 'https://cdn.yourcompany.com/widget/v1/widget.js';
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function verifyToken(token: string): { tenantId: string } | null {
  try {
    const decoded = verify(token, JWT_SECRET) as { tenantId: string };
    return decoded;
  } catch {
    return null;
  }
}

  const hash = createHash('sha384').update(content).digest('base64');
  return `sha384-${hash}`;
}

// SRI hash for widget integrity (not embedding-related)
function computeSRI(content: string): string {
  const hash = createHash('sha384').update(content).digest('base64');
  return `sha384-${hash}`;
}

export async function POST(req: any, context: { params: Promise<{}> }) {
  try {
    // Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { tenantId } = decoded;

    // Check if tenant exists
    const { data: tenant } = await supabase
      .from('trial_tenants')
      .select('rag_status, status')
      .eq('tenant_id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    if (tenant.status !== 'active') {
      return NextResponse.json({ error: 'Trial is not active' }, { status: 403 });
    }

    // Get widget config
    const { data: config } = await supabase
      .from('widget_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (!config) {
      return NextResponse.json(
        { error: 'Widget configuration not found. Please complete branding step first.' },
        { status: 400 }
      );
    }

    // Check if RAG pipeline is ready, if not trigger build
    if (tenant.rag_status !== 'ready') {
      // Trigger RAG pipeline build asynchronously
      buildRAGPipeline(tenantId, {
        tenantId,
        chunkSize: 512,
        chunkOverlap: 50,
        embeddingModel: 'text-embedding-ada-002',
      }).catch(error => {
        console.error('RAG pipeline build failed:', error);
      });

      return NextResponse.json({
        status: 'processing',
        message: 'Widget is being prepared. This may take 2-5 minutes. Please check back shortly.',
        tenantId,
      });
    }

    // Generate embed code
    const embedCode = `<!-- Chatbot Widget -->
<script
  src="${WIDGET_CDN_URL}"
  crossorigin="anonymous"
  data-tenant-id="${tenantId}"
  data-primary-color="${config.primary_color}"
  data-secondary-color="${config.secondary_color}"
  data-welcome-message="${encodeURIComponent(config.welcome_message)}"
  async
></script>`;

    const response: GenerateWidgetResponse = {
      embedCode,
      widgetUrl: WIDGET_CDN_URL,
      previewUrl: `${APP_BASE_URL}/widget-preview/${tenantId}`,
      assignedTools: config.assigned_tools,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Generate widget error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
