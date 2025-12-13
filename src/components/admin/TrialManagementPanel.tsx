'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  Users, 
  Calendar,
  Search,
  Filter,
  Download,
  RefreshCw
} from 'lucide-react';

interface TrialTenant {
  tenant_id: string;
  email: string;
  business_name: string;
  business_type: string;
  created_at: string;
  expires_at: string;
  trial_expires_at?: string;
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'active' | 'expired' | 'upgraded' | 'cancelled';
  plan: string | null;
  plan_upgraded_to?: string | null;
  rag_status?: string;
  kb_count?: number;
  chat_count?: number;
  assigned_tools?: string[];
}

interface TrialStats {
  total: number;
  active: number;
  expired: number;
  upgraded: number;
  cancelled: number;
  conversionRate: number;
}

export default function TrialManagementPanel() {
  const [trials, setTrials] = useState<TrialTenant[]>([]);
  const [stats, setStats] = useState<TrialStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [businessTypeFilter, setBusinessTypeFilter] = useState<string>('all');

  useEffect(() => {
    fetchTrials();
  }, [statusFilter, businessTypeFilter]);

  const fetchTrials = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (businessTypeFilter !== 'all') params.append('businessType', businessTypeFilter);

      const response = await fetch(`/api/admin/trials?${params}`);
      const data = await response.json();
      
      setTrials(data.trials || []);
      setStats(data.stats || null);
    } catch (error) {
      console.error('Failed to fetch trials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExtendTrial = async (tenantId: string, days: number) => {
    try {
      await fetch(`/api/admin/trials/${tenantId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      fetchTrials();
    } catch (error) {
      console.error('Failed to extend trial:', error);
    }
  };

  const handleUpgradeTrial = async (tenantId: string, plan: string) => {
    try {
      await fetch(`/api/admin/trials/${tenantId}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      fetchTrials();
    } catch (error) {
      console.error('Failed to upgrade trial:', error);
    }
  };

  const filteredTrials = trials.filter(trial => {
    const matchesSearch = 
      trial.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trial.business_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      active: { variant: 'default', icon: Clock },
      expired: { variant: 'secondary', icon: XCircle },
      upgraded: { variant: 'default', icon: CheckCircle2 },
      cancelled: { variant: 'destructive', icon: XCircle },
    };
    const config = variants[status] || variants.active;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  const getExpiryDate = (trial: TrialTenant) => trial.expires_at || trial.trial_expires_at || '';

  const getDaysRemaining = (expiresAt: string) => {
    if (!expiresAt) return 0;
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const exportToCSV = () => {
    const headers = ['Email', 'Business Name', 'Type', 'Status', 'Created', 'Expires', 'KB Docs', 'Chats'];
    const rows = filteredTrials.map(t => [
      t.email,
      t.business_name || '',
      t.business_type,
      t.status,
      new Date(t.created_at).toLocaleDateString(),
      getExpiryDate(t) ? new Date(getExpiryDate(t)).toLocaleDateString() : '',
      t.kb_count || 0,
      t.chat_count || 0,
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trials-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="p-4 bg-slate-900/70 border-white/10">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Total Trials</p>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-slate-900/70 border-white/10">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Active</p>
                <p className="text-2xl font-bold text-white">{stats.active}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-slate-900/70 border-white/10">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Upgraded</p>
                <p className="text-2xl font-bold text-white">{stats.upgraded}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-slate-900/70 border-white/10">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-orange-400" />
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Expired</p>
                <p className="text-2xl font-bold text-white">{stats.expired}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-slate-900/70 border-white/10">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-indigo-400" />
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Conversion</p>
                <p className="text-2xl font-bold text-white">{stats.conversionRate}%</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters & Search */}
      <Card className="p-4 bg-slate-900/70 border-white/10">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by email or business name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="upgraded">Upgraded</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={businessTypeFilter} onValueChange={setBusinessTypeFilter}>
            <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="service">Service</SelectItem>
              <SelectItem value="ecommerce">E-commerce</SelectItem>
              <SelectItem value="saas">SaaS</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={fetchTrials} variant="outline" size="icon">
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Button onClick={exportToCSV} variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </Card>

      {/* Trials Table */}
      <Card className="bg-slate-900/70 border-white/10">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800">
                <TableHead className="text-slate-300">Email</TableHead>
                <TableHead className="text-slate-300">Business</TableHead>
                <TableHead className="text-slate-300">Type</TableHead>
                <TableHead className="text-slate-300">Status</TableHead>
                <TableHead className="text-slate-300">RAG</TableHead>
                <TableHead className="text-slate-300">KB Docs</TableHead>
                <TableHead className="text-slate-300">Chats</TableHead>
                <TableHead className="text-slate-300">Days Left</TableHead>
                <TableHead className="text-slate-300">Created</TableHead>
                <TableHead className="text-slate-300">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-slate-400">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredTrials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-slate-400">
                    No trials found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTrials.map((trial) => (
                  <TableRow key={trial.tenant_id} className="border-slate-800">
                    <TableCell className="text-slate-300 font-medium">{trial.email}</TableCell>
                    <TableCell className="text-slate-300">{trial.business_name || '-'}</TableCell>
                    <TableCell className="text-slate-300 capitalize">{trial.business_type}</TableCell>
                    <TableCell>{getStatusBadge(trial.status)}</TableCell>
                    <TableCell>
                      <Badge variant={(trial.rag_status || trial.status) === 'ready' ? 'default' : 'secondary'}>
                        {trial.rag_status || trial.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-300">{trial.kb_count || 0}</TableCell>
                    <TableCell className="text-slate-300">{trial.chat_count || 0}</TableCell>
                    <TableCell className="text-slate-300">
                      {getExpiryDate(trial) ? (
                        <span className={getDaysRemaining(getExpiryDate(trial)) <= 1 ? 'text-red-400 font-bold' : ''}>
                          {getDaysRemaining(getExpiryDate(trial))}d
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {new Date(trial.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {trial.status === 'active' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleExtendTrial(trial.tenant_id, 7)}
                            >
                              +7d
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleUpgradeTrial(trial.tenant_id, 'potential')}
                            >
                              Upgrade
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
