import TrialManagementPanel from '@/components/admin/TrialManagementPanel';

export default function ChatbotAdminTenantsPage() {
  return (
    <>
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Tenants</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Trial Management</h1>
        <p className="text-sm text-slate-400">
          Monitor and manage all trial accounts, extend trials, upgrade to paid plans, and track conversion metrics.
        </p>
      </header>

      <TrialManagementPanel />
    </>
  );
}
