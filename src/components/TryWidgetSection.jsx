/**
 * TryWidgetSection.jsx
 * React component for "Try Widget - 3 Days Free Trial" flow
 * Features: File upload, site URL crawl, theme config, trial creation
 */

"use client";

import { useState, useRef } from 'react';
import { Upload, Check, Copy, Loader2, AlertCircle, X } from 'lucide-react';
import { toast } from 'sonner';

export default function TryWidgetSection() {
  const [step, setStep] = useState(1);
  const [dataSource, setDataSource] = useState('url');
  const [files, setFiles] = useState([]);
  const [formData, setFormData] = useState({
    siteUrl: '',
    primaryColor: '#DD1111',
    chatName: 'Support Assistant',
    adminEmail: '',
    agreeToTerms: false,
  });
  const [trialToken, setTrialToken] = useState('');
  const [embedSnippet, setEmbedSnippet] = useState('');
  const [jobId, setJobId] = useState('');
  const [ingestStatus, setIngestStatus] = useState('idle');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validFiles = selectedFiles.filter(file => {
      const validTypes = ['.pdf', '.docx', '.txt', '.html'];
      const ext = '.' + file.name.split('.').pop();
      return validTypes.includes(ext) && file.size <= 10 * 1024 * 1024;
    });
    setFiles(validFiles);
  };

  // Start trial
  const handleStartTrial = async () => {
    setError('');
    setLoading(true);

    try {
      // Call /api/start-trial
      const response = await fetch('/api/start-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_origin: formData.siteUrl || window.location.origin,
          admin_email: formData.adminEmail,
          display_name: formData.chatName,
          theme: { primary: formData.primaryColor },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start trial');
      }

      setTrialToken(data.trial_token);
      setEmbedSnippet(data.embed_code);

  toast.success('Trial created. Starting ingestion...');
      
      // Start ingestion
      await handleIngest(data.trial_token);

    } catch (err) {
      setError(err.message);
      toast.error(err.message);
      setLoading(false);
    }
  };

  // Start ingestion
  const handleIngest = async (token) => {
    try {
      const formDataObj = new FormData();
      formDataObj.append('trial_token', token);

      if (dataSource === 'url') {
        formDataObj.append('site_url', formData.siteUrl);
      } else {
        files.forEach(file => formDataObj.append('files', file));
      }

      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formDataObj,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start ingestion');
      }

      setJobId(data.job_id);
      setIngestStatus('processing');
      
      // Poll status
      pollIngestStatus(data.job_id);
      setStep(4);

    } catch (err) {
      setError(err.message);
      toast.error(err.message);
      setLoading(false);
    }
  };

  // Poll ingestion status
  const pollIngestStatus = async (jobId) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/ingest/status/${jobId}`);
        const data = await response.json();

        setIngestStatus(data.status);

        if (data.status === 'completed') {
          setLoading(false);
          toast.success('Ingestion completed. Widget ready!');
          return;
        }

        if (data.status === 'failed') {
          setError('Ingestion failed. Please try again.');
          toast.error('Ingestion failed. Please try again.');
          setLoading(false);
          return;
        }

        // Continue polling
        setTimeout(checkStatus, 2000);
      } catch (err) {
        setError('Failed to check status');
        toast.error('Failed to check ingestion status');
        setLoading(false);
      }
    };

    checkStatus();
  };

  // Copy embed code
  const copyToClipboard = () => {
    navigator.clipboard.writeText(embedSnippet);
    toast.success('Embed code copied to clipboard');
  };

  return (
    <div className="max-w-3xl mx-auto rounded-3xl border border-white/15 bg-black/40 p-6 text-white">
      {/* Progress Steps */}
      <div className="mb-8 flex items-center justify-between">
        {[1, 2, 3, 4].map((num) => (
          <div key={num} className="flex items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold transition ${
                step >= num ? 'bg-white text-black' : 'bg-white/10 text-white/50'
              }`}
            >
              {num}
            </div>
            {num < 4 && (
              <div className={`h-1 w-16 transition ${step > num ? 'bg-white' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Data Source */}
      {step === 1 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Choose data source</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setDataSource('url')}
              className={`rounded-2xl border p-6 text-left transition ${
                dataSource === 'url' ? 'border-white/60 bg-white/10' : 'border-white/10 hover:border-white/30 hover:bg-white/5'
              }`}
            >
              <div className="text-lg font-semibold">Website URL</div>
              <div className="mt-2 text-sm text-white/60">Crawl your website</div>
            </button>

            <button
              onClick={() => setDataSource('files')}
              className={`rounded-2xl border p-6 text-left transition ${
                dataSource === 'files' ? 'border-white/60 bg-white/10' : 'border-white/10 hover:border-white/30 hover:bg-white/5'
              }`}
            >
              <div className="text-lg font-semibold">Upload files</div>
              <div className="mt-2 text-sm text-white/60">PDF, DOCX, TXT, HTML</div>
            </button>
          </div>

          {dataSource === 'url' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-white/80">Website URL</label>
              <input
                type="url"
                value={formData.siteUrl}
                onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
                placeholder="https://example.com"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
              />
              <p className="mt-1 text-xs text-white/40">Max 50 pages, depth 2</p>
            </div>
          )}

          {dataSource === 'files' && (
            <div>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-2xl border border-dashed border-white/20 p-8 text-center transition hover:border-white/40 hover:bg-white/5"
              >
                <Upload className="mx-auto mb-3 h-12 w-12 text-white/50" />
                <p className="text-sm font-medium">Click to upload files</p>
                <p className="mt-1 text-xs text-white/50">PDF, DOCX, TXT, HTML (max 10MB each, 5 files)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.html"
                onChange={handleFileChange}
                className="hidden"
              />
              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                      <span className="text-white/80">{file.name}</span>
                      <button
                        onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                        className="text-red-300 transition hover:text-red-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setStep(2)}
            disabled={dataSource === 'url' ? !formData.siteUrl : files.length === 0}
            className="w-full rounded-xl bg-white/90 py-3 text-sm font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next: Customize Widget
          </button>
        </div>
      )}

      {/* Step 2: Theme Configuration */}
      {step === 2 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Customize widget</h2>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/80">Primary color</label>
            <input
              type="color"
              value={formData.primaryColor}
              onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
              className="h-12 w-full rounded border border-white/10 bg-black/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/80">Chat name</label>
            <input
              type="text"
              value={formData.chatName}
              onChange={(e) => setFormData({ ...formData, chatName: e.target.value })}
              placeholder="Support Assistant"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep(1)}
              className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 rounded-xl bg-white/90 px-4 py-3 text-sm font-semibold text-black transition hover:bg-white"
            >
              Next: Admin details
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Admin Details */}
      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Admin details</h2>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/80">Admin email</label>
            <input
              type="email"
              value={formData.adminEmail}
              onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
              placeholder="admin@example.com"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
            />
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            <input
              type="checkbox"
              checked={formData.agreeToTerms}
              onChange={(e) => setFormData({ ...formData, agreeToTerms: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border border-white/30 bg-black"
            />
            <label className="text-sm text-white/80">
              I agree to BiTB Terms of Service and understand trial data auto-deletes after 3 days.
            </label>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep(2)}
              className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
            >
              Back
            </button>
            <button
              onClick={handleStartTrial}
              disabled={!formData.adminEmail || !formData.agreeToTerms || loading}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-white/90 px-4 py-3 text-sm font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Create Trial
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Embed Code */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-400/10">
              {ingestStatus === 'completed' ? (
                <Check className="h-10 w-10 text-emerald-300" />
              ) : (
                <Loader2 className="h-10 w-10 animate-spin text-white" />
              )}
            </div>
            <h2 className="text-2xl font-bold mb-2">
              {ingestStatus === 'completed' ? 'Trial Created!' : 'Processing...'}
            </h2>
            <p className="text-white/70">
              {ingestStatus === 'completed' 
                ? 'Your widget is ready to use' 
                : 'Ingesting your content...'}
            </p>
          </div>

          {ingestStatus === 'completed' && (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Embed code:</label>
                <div className="relative">
                  <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/50 p-4 text-xs text-white/80">
                    {embedSnippet}
                  </pre>
                  <button
                    onClick={copyToClipboard}
                    className="absolute right-2 top-2 rounded-lg border border-white/10 bg-white/10 p-2 text-white transition hover:border-white/30 hover:bg-white/20"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="mb-2 text-sm font-semibold text-white">Installation</h4>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-white/70">
                  <li>Paste this code before the closing &lt;/body&gt; tag</li>
                  <li>Widget appears automatically on all pages</li>
                  <li>Trial expires in 3 days</li>
                </ol>
              </div>
            </>
          )}

          {ingestStatus === 'completed' && (
            <button
              onClick={() => {
                setStep(1);
                setFormData({ siteUrl: '', primaryColor: '#DD1111', chatName: 'Support Assistant', adminEmail: '', agreeToTerms: false });
                setFiles([]);
                setTrialToken('');
                setEmbedSnippet('');
                setJobId('');
                setIngestStatus('idle');
                setError('');
              }}
              className="w-full rounded-xl bg-white/90 py-3 text-sm font-semibold text-black transition hover:bg-white"
            >
              Create Another Trial
            </button>
          )}
        </div>
      )}
    </div>
  );
}
