import { getSupabaseAdmin } from '../../supabase/client'

export interface RolloutState {
  tenant_id: string
  feature: string
  percentage: number
  updated_by?: string
  updated_at?: string
}

export interface RolloutAudit {
  id?: number
  tenant_id: string
  feature: string
  old_percentage?: number
  new_percentage?: number
  actor?: string
  reason?: string
  created_at?: string
}

/**
 * Production-grade Supabase adapter for rollout state and audit persistence.
 * All writes use the admin client (service role key).
 */
export class SupabaseRolloutStore {
  private supabase = getSupabaseAdmin()

  /** Get rollout state for a tenant/feature. */
  async getState(tenant_id: string, feature: string): Promise<RolloutState | null> {
    const { data, error } = await this.supabase
      .from('rollout_state')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('feature', feature)
      .maybeSingle()
    if (error) throw error
    return data || null
  }

  /** Set rollout state for a tenant/feature. */
  async setState(state: RolloutState): Promise<void> {
    // Supabase requires onConflict as comma-separated string
    const { error } = await this.supabase
      .from('rollout_state')
      .upsert([state], { onConflict: 'tenant_id,feature' })
    if (error) throw error
  }

  /** Append an audit row for a rollout change. */
  async appendAudit(audit: RolloutAudit): Promise<void> {
    const { error } = await this.supabase
      .from('rollout_audit')
      .insert([audit])
    if (error) throw error
  }

  /** Get audit history for a tenant/feature (most recent first). */
  async getAuditHistory(tenant_id: string, feature?: string, limit = 50): Promise<RolloutAudit[]> {
    let query = this.supabase
      .from('rollout_audit')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (feature) query = query.eq('feature', feature)
    const { data, error } = await query
    if (error) throw error
    return data || []
  }
}
