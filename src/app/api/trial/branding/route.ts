import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import type { BrandingRequest, WidgetConfig } from '@/types/trial';
import { assignTools, analyzeKnowledgeBase, generatePromptTemplate } from '@/lib/trial/tool-assignment';
import {
  validateHexColor,
  validateChatTone,
  validateWelcomeMessage,
} from '@/lib/trial/validation';
import {
  AuthenticationError,
  NotFoundError,
  InternalError,
  ValidationError,
} from '@/lib/trial/errors';
import { verifyBearerToken, verifyTenantOwnership } from '@/lib/trial/auth';
import TrialLogger from '@/lib/trial/logger';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

export async function POST(req: any, context: { params: Promise<{}> }) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Verify authentication
    let token;
    try {
      token = verifyBearerToken(req);
    } catch (err: any) {
      TrialLogger.logAuth('failure', undefined, { requestId, error: err.message });
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode || 401 }
      );
    }

    const { tenantId } = token;
    const body = await req.json();

    // Validate inputs
    try {
      validateHexColor(body.primaryColor);
      validateHexColor(body.secondaryColor);
      validateChatTone(body.tone);
      if (body.welcomeMessage) {
        validateWelcomeMessage(body.welcomeMessage);
      }
    } catch (err: any) {
      if (err instanceof ValidationError) {
        TrialLogger.logRequest('POST', '/api/trial/branding', 400, Date.now() - startTime, {
          requestId,
          tenantId,
        });
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    // Get tenant info for business type
    const { data: tenant, error: tenantError } = await supabase
      .from('trial_tenants')
      .select('business_type, status')
      .eq('tenant_id', tenantId)
      .single();

    if (tenantError || !tenant) {
      throw new NotFoundError('Tenant');
    }

    if (tenant.status !== 'active') {
      TrialLogger.warn('Attempting to brand inactive trial', { requestId, tenantId });
      throw new ValidationError('Trial is not active');
    }

    // Get KB documents for tool assignment
    const { data: kbDocs, error: kbError } = await supabase
      .from('knowledge_base')
      .select('raw_text')
      .eq('tenant_id', tenantId);

    if (kbError && kbError.code !== 'PGRST116') {
      throw new InternalError('Failed to fetch knowledge base', new Error(kbError.message));
    }

    const documents = (kbDocs || []).map(doc => doc.raw_text);
    const kbAnalysis = analyzeKnowledgeBase(documents);
    const tools = assignTools(tenant.business_type, kbAnalysis);
    const promptTemplate = generatePromptTemplate(tenant.business_type, tools);

    // Check if widget config already exists
    const { data: existing, error: existingError } = await supabase
      .from('widget_configs')
      .select('config_id')
      .eq('tenant_id', tenantId)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      throw new InternalError('Failed to check widget config', new Error(existingError.message));
    }

    let config: WidgetConfig;

    if (existing) {
      // Update existing config
      const { data, error } = await supabase
        .from('widget_configs')
        .update({
          primary_color: body.primaryColor,
          secondary_color: body.secondaryColor,
          chat_tone: body.tone,
          welcome_message: body.welcomeMessage || 'Hello! How can I help you today?',
          assigned_tools: tools,
          prompt_template: promptTemplate,
        })
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error || !data) {
        throw new InternalError('Failed to update widget config', new Error(error?.message || 'Unknown'));
      }

      config = data;
      TrialLogger.logModification('widget_config', 'update', config.config_id, tenantId, { requestId });
    } else {
      // Create new config
      const { data, error } = await supabase
        .from('widget_configs')
        .insert({
          tenant_id: tenantId,
          primary_color: body.primaryColor,
          secondary_color: body.secondaryColor,
          chat_tone: body.tone,
          welcome_message: body.welcomeMessage || 'Hello! How can I help you today?',
          assigned_tools: tools,
          prompt_template: promptTemplate,
        })
        .select()
        .single();

      if (error || !data) {
        throw new InternalError('Failed to create widget config', new Error(error?.message || 'Unknown'));
      }

      config = data;
      TrialLogger.logModification('widget_config', 'create', config.config_id, tenantId, { requestId });
    }

    TrialLogger.logRequest('POST', '/api/trial/branding', 200, Date.now() - startTime, { requestId, tenantId });

    return NextResponse.json({
      success: true,
      config: {
        primaryColor: config.primary_color,
        secondaryColor: config.secondary_color,
        tone: config.chat_tone,
        welcomeMessage: config.welcome_message,
        assignedTools: config.assigned_tools,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof AuthenticationError) {
      TrialLogger.logRequest('POST', '/api/trial/branding', error.statusCode, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    if (error instanceof ValidationError) {
      TrialLogger.logRequest('POST', '/api/trial/branding', error.statusCode, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    if (error instanceof NotFoundError) {
      TrialLogger.logRequest('POST', '/api/trial/branding', 404, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof InternalError) {
      TrialLogger.error(error.message, error, { requestId });
      TrialLogger.logRequest('POST', '/api/trial/branding', 500, duration, { requestId });
      return NextResponse.json(
        { error: 'Failed to save branding configuration' },
        { status: 500 }
      );
    }

    TrialLogger.error('Unexpected error in branding', error as Error, { requestId });
    TrialLogger.logRequest('POST', '/api/trial/branding', 500, duration, { requestId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
