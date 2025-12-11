'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import MultiStepLoader from './MultiStepLoader';

interface ContinueWithLoaderProps {
  loading: boolean;
  progress?: number;
  jobId?: string | null;
  tenantId?: string | null;
  setupToken?: string | null;
  error?: string | null;
  expired?: boolean;
  expirationMessage?: string | null;
  onUpgrade?: () => void;
  upgradeLabel?: string;
  upgradeUrl?: string;
  onLoaderComplete?: () => void;
  onLoaderFailure?: (message: string) => void;
  onLoaderProgress?: (value: number) => void;
}

export default function ContinueWithLoader({
  loading,
  progress = 0,
  jobId,
  setupToken,
  error,
  expired = false,
  expirationMessage = null,
  tenantId,
  onUpgrade,
  upgradeLabel,
  upgradeUrl,
  onLoaderComplete,
  onLoaderFailure,
  onLoaderProgress,
}: ContinueWithLoaderProps) {
  if (!loading && !error && !expired) return null;

  const upgradeLink = upgradeUrl || 'https://bitb.ltd/subscription';
  const upgradeButtonLabel = upgradeLabel || 'Refresh session';
  const canStream = Boolean(jobId && setupToken);
  const safeProgress = Math.min(Math.max(progress ?? 0, 0), 100);

  const handleUpgradeClick = () => {
    if (onUpgrade) {
      onUpgrade();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const loaderContent = canStream ? (
    <MultiStepLoader
      jobId={jobId!}
      tenantId={tenantId!}
      token={setupToken!}
      initialProgress={safeProgress}
      onProgress={onLoaderProgress}
      onComplete={onLoaderComplete}
      onFailure={onLoaderFailure}
    />
  ) : (
    <div className="flex flex-col items-center justify-center text-center space-y-4">
      <div className="rounded-full bg-slate-900/60 p-3">
        <Loader2 className="h-12 w-12 text-indigo-400 animate-spin" />
      </div>
      <div>
        <p className="text-lg font-semibold text-white">Processing your trial</p>
        <p className="text-xs text-slate-400">{safeProgress.toFixed(0)}% complete</p>
      </div>
      <Progress
        value={safeProgress}
        className="h-2 w-full bg-slate-700"
        indicatorClassName="bg-indigo-500"
      />
      <p className="text-xs text-slate-400">Please wait…</p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full max-w-md mx-auto mt-6"
    >
      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          {error ? (
            <div className="text-red-400 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-2">
                <span className="text-2xl">⚠️</span>
              </div>
              <p className="font-medium">{error}</p>
            </div>
          ) : expired ? (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold text-rose-100">
                {expirationMessage || 'Your trial has expired. Reload or upgrade to keep going.'}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                <button
                  type="button"
                  onClick={handleUpgradeClick}
                  className="px-4 py-2 rounded-full bg-rose-500 text-white font-semibold transition hover:bg-rose-400"
                >
                  {upgradeButtonLabel}
                </button>
                <a
                  href={upgradeLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold uppercase tracking-wide text-rose-200 hover:text-white"
                >
                  Upgrade plan
                </a>
              </div>
            </div>
          ) : (
            loaderContent
          )}
        </div>
      </div>
    </motion.div>
  );
}
