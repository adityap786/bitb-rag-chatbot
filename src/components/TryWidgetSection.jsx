/**
 * TryWidgetSection.jsx
 * React component for "Try Widget - 3 Days Free Trial" flow
 * Features: File upload, site URL crawl, theme config, trial creation
 */

"use client";

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Check, Copy, Loader2, AlertCircle, X, MessageCircle } from 'lucide-react';
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

  // Trial expiry UI state
  const [trialExpired, setTrialExpired] = useState(false);
  const [expiryDate, setExpiryDate] = useState(null);

  // RAG query state
  const [ragQuery, setRagQuery] = useState('');
  const [ragAnswer, setRagAnswer] = useState('');
  const [ragSources, setRagSources] = useState([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter((file) => {
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
      if (!response.ok) throw new Error(data.error || 'Failed to start trial');

      setTrialToken(data.trial_token || '');
      setEmbedSnippet(data.embed_code || '');

      if (data.ingestion_job_id) {
        setJobId(data.ingestion_job_id);
        setIngestStatus('processing');
        setStep(4);
      } else if (data.status === 'completed') {
        setIngestStatus('completed');
        setStep(4);
      }

      toast.success('Trial created. Ingestion started!');
    } catch (err) {
      const msg = err?.message || String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Poll ingestion status when a jobId exists
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`/api/ingest/status/${jobId}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.status) setIngestStatus(data.status);
        if (data.progress !== undefined) setIngestStatus(`processing (${data.progress}%)`);

        if (data.status === 'completed') {
          setIngestStatus('completed');
          setLoading(false);
          toast.success('Ingestion completed. Test your chatbot now!');
          return;
        }

        if (data.status === 'failed') {
          setError('Ingestion failed. Please try again.');
          toast.error('Ingestion failed. Please try again.');
          setLoading(false);
          return;
        }

        // poll again
        setTimeout(() => { if (!cancelled) check(); }, 3000);
      } catch (err) {
        if (cancelled) return;
        setError('Failed to check ingestion status');
        toast.error('Failed to check ingestion status');
        setLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [jobId]);

  // Poll trial status (expiry) when token is set
  useEffect(() => {
    if (!trialToken) return;
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`/api/check-trial?trial_token=${encodeURIComponent(trialToken)}`);
        const data = await res.json();
        if (cancelled) return;
        setTrialExpired(data.status === 'expired');
        setExpiryDate(data.expires_at || null);
      } catch (err) {
        // ignore polling errors
      }
      if (!cancelled) setTimeout(check, 60000);
    };

    check();
    return () => { cancelled = true; };
  }, [trialToken]);

  const handleRagQuery = async () => {
    setRagLoading(true);
    setRagAnswer('');
    setRagSources([]);
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: trialToken,
          trial_token: trialToken,
          query: ragQuery,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'RAG query failed');
      setRagAnswer(data.answer);
      setRagSources(data.sources || []);
    } catch (err) {
      setRagAnswer('Error: ' + (err?.message || String(err)));
    }
    setRagLoading(false);
  };

  // Copy embed code with visual feedback
  const copyToClipboard = () => {
    if (!embedSnippet) return;
    navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    toast.success('Embed code copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  // Trigger preview refresh when theme changes
  useEffect(() => {
    if (step === 2) {
      setPreviewKey(prev => prev + 1);
    }
  }, [formData.primaryColor, formData.chatName, step]);

  const isInputDisabled = trialExpired;

  const renderExpiryBanner = () => {
    if (!trialExpired && !expiryDate) return null;
    if (trialExpired) {
      return (
        <div className="bg-red-100 border border-red-300 text-red-800 rounded-lg p-4 mb-4 flex items-center justify-between">
          <span>Your trial has expired. Upgrade to continue using the chatbot.</span>
          <button className="bg-red-600 text-white px-4 py-2 rounded" onClick={() => window.open('/upgrade', '_blank')}>Upgrade Now</button>
        </div>
      );
    }
    return (
      <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-lg p-4 mb-4 flex items-center justify-between">
        <span>Trial expires on {expiryDate ? new Date(expiryDate).toLocaleString() : 'soon'}. Upgrade anytime to keep your data.</span>
        <button className="bg-yellow-600 text-white px-4 py-2 rounded" onClick={() => window.open('/upgrade', '_blank')}>Upgrade</button>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto rounded-3xl border border-white/15 bg-black/40 p-6 text-white">
      {renderExpiryBanner()}

      {/* Stepper Progress */}
      <div className="mb-8 flex items-center justify-between">
        {[1, 2, 3, 4, 5].map((num) => (
          <div key={num} className="flex items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold transition ${
                step >= num ? 'bg-white text-black' : 'bg-white/10 text-white/50'
              }`}
            >
              {num}
            </div>
            {num < 5 && (
              <div className={`h-1 w-12 transition ${step > num ? 'bg-white' : 'bg-white/10'}`} />
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
        <motion.div key="step-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Choose data source</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setDataSource('url')}
              className={`rounded-2xl border p-6 text-left transition ${
                dataSource === 'url' ? 'border-white/60 bg-white/10' : 'border-white/10 hover:border-white/30 hover:bg-white/5'
              }`}
              aria-label="Choose website URL as data source"
              disabled={isInputDisabled}
            >
              <div className="text-lg font-semibold">Website URL</div>
              <div className="mt-2 text-sm text-white/60">Crawl your website</div>
            </button>

            <button
              onClick={() => setDataSource('files')}
              className={`rounded-2xl border p-6 text-left transition ${
                dataSource === 'files' ? 'border-white/60 bg-white/10' : 'border-white/10 hover:border-white/30 hover:bg-white/5'
              }`}
              aria-label="Choose file upload as data source"
              disabled={isInputDisabled}
            >
              <div className="text-lg font-semibold">Upload files</div>
              <div className="mt-2 text-sm text-white/60">PDF, DOCX, TXT, HTML</div>
            </button>
          </div>

          {dataSource === 'url' && (
            <div>
              <label htmlFor="siteUrl" className="mb-2 block text-sm font-medium text-white/80">Website URL</label>
              <input
                id="siteUrl"
                name="siteUrl"
                type="url"
                value={formData.siteUrl}
                onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
                placeholder="https://example.com"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
                aria-label="Website URL input"
                disabled={isInputDisabled}
              />
              <p className="mt-1 text-xs text-white/40">Max 50 pages, depth 2</p>
            </div>
          )}

          {dataSource === 'files' && (
            <div>
              <div
                onClick={() => !isInputDisabled && fileInputRef.current?.click()}
                className={`cursor-pointer rounded-2xl border border-dashed border-white/20 p-8 text-center transition ${isInputDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-white/40 hover:bg-white/5'}`}
                aria-label="Upload files"
              >
                <Upload className="mx-auto mb-3 h-12 w-12 text-white/50" />
                <p className="text-sm font-medium">Click to upload files</p>
                <p className="mt-1 text-xs text-white/50">PDF, DOCX, TXT, HTML (max 10MB each, 5 files)</p>
              </div>
              <input
                ref={fileInputRef}
                id="fileUpload"
                name="fileUpload"
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.html"
                onChange={handleFileChange}
                className="hidden"
                disabled={isInputDisabled}
              />
              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                      <span className="text-white/80">{file.name}</span>
                      <button
                        onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                        className="text-red-300 transition hover:text-red-200"
                        aria-label={`Remove file ${file.name}`}
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
            aria-label="Next: Customize Widget"
          >
            Next: Customize Widget
          </button>
        </motion.div>
      )}

      {/* Step 2: Theme Configuration */}
      {step === 2 && (
        <motion.div key="step-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Customize widget</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Configuration */}
            <div className="space-y-4">
              <div>
                <label htmlFor="primaryColor" className="mb-2 block text-sm font-medium text-white/80">Primary color</label>
                <div className="flex items-center gap-3">
                  <input
                    id="primaryColor"
                    name="primaryColor"
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                    className="h-12 w-20 rounded border border-white/10 bg-black/40 cursor-pointer"
                    disabled={isInputDisabled}
                  />
                  <input
                    id="primaryColorText"
                    name="primaryColorText"
                    type="text"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                    className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none font-mono"
                    disabled={isInputDisabled}
                    aria-label="Primary color hex value"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="chatName" className="mb-2 block text-sm font-medium text-white/80">Chat name</label>
                <input
                  id="chatName"
                  name="chatName"
                  type="text"
                  value={formData.chatName}
                  onChange={(e) => setFormData({ ...formData, chatName: e.target.value })}
                  placeholder="Support Assistant"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
                  disabled={isInputDisabled}
                />
              </div>
            </div>

            {/* Right: Live Preview */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80">Live Preview</label>
              <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/10 p-6 min-h-[280px] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50"></div>
                <div className="relative">
                  {/* Widget Preview Mockup */}
                  <div 
                    key={previewKey}
                    className="w-[320px] h-[400px] rounded-2xl shadow-2xl overflow-hidden border border-white/20 bg-white"
                    style={{ 
                      animation: 'fadeIn 0.3s ease-in-out'
                    }}
                  >
                    {/* Widget Header */}
                    <div 
                      className="flex items-center justify-between p-4 text-white"
                      style={{ backgroundColor: formData.primaryColor }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                          <MessageCircle className="w-5 h-5" />
                        </div>
                        <span className="font-semibold">{formData.chatName || 'Support Assistant'}</span>
                      </div>
                      <button className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 transition flex items-center justify-center">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    {/* Widget Body */}
                    <div className="p-4 h-[280px] bg-gray-50 overflow-y-auto space-y-3">
                      <div className="flex gap-2">
                        <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: formData.primaryColor + '20' }}>
                          <div className="w-full h-full rounded-full flex items-center justify-center text-xs" style={{ color: formData.primaryColor }}>AI</div>
                        </div>
                        <div className="bg-white rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-gray-800 max-w-[220px]">
                          Hi! I'm {formData.chatName || 'Support Assistant'}. How can I help you today?
                        </div>
                      </div>
                    </div>
                    
                    {/* Widget Input */}
                    <div className="p-3 bg-white border-t border-gray-200">
                      <div className="flex gap-2">
                        <input 
                          id="previewInput"
                          name="previewInput"
                          type="text" 
                          placeholder="Type your message..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                          disabled
                          aria-label="Preview chat input (disabled)"
                        />
                        <button 
                          className="px-4 py-2 rounded-xl text-white font-medium text-sm transition"
                          style={{ backgroundColor: formData.primaryColor }}
                          disabled
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-white/50 text-center">Preview updates as you customize</p>
            </div>
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
        </motion.div>
      )}

      {/* Step 3: Admin Details */}
      {step === 3 && (
        <motion.div key="step-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Admin details</h2>

          <div>
            <label htmlFor="adminEmail" className="mb-2 block text-sm font-medium text-white/80">Admin email</label>
            <input
              id="adminEmail"
              name="adminEmail"
              type="email"
              value={formData.adminEmail}
              onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
              placeholder="admin@example.com"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
              disabled={isInputDisabled}
            />
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            <input
              id="agreeToTerms"
              name="agreeToTerms"
              type="checkbox"
              checked={formData.agreeToTerms}
              onChange={(e) => setFormData({ ...formData, agreeToTerms: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border border-white/30 bg-black"
              disabled={isInputDisabled}
            />
            <label htmlFor="agreeToTerms" className="text-sm text-white/80">
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
              disabled={!formData.adminEmail || !formData.agreeToTerms || loading || isInputDisabled}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-white/90 px-4 py-3 text-sm font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Create Trial
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 4: Processing/Playground */}
      {step === 4 && (
        <motion.div key="step-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-400/10">
              {ingestStatus === 'completed' ? (
                <Check className="h-10 w-10 text-emerald-300" />
              ) : (
                <Loader2 className="h-10 w-10 animate-spin text-white" />
              )}
            </div>
            <h2 className="text-2xl font-bold mb-2">
              {ingestStatus === 'completed' ? 'Try Your Chatbot!' : 'Processing...'}
            </h2>
            <p className="text-white/70">{ingestStatus === 'completed' ? 'Test the chatbot with real questions' : 'Ingesting your content...'}</p>
          </div>

          {ingestStatus === 'completed' && (
            <>
              <div className="space-y-4">
                <label className="block text-sm font-medium text-white/80">Interactive Playground</label>
                <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/10 p-6 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50"></div>
                  <div className="relative w-full max-w-md">
                    <div 
                      key={previewKey}
                      className="w-full rounded-2xl shadow-2xl overflow-hidden border border-white/20 bg-white"
                    >
                      {/* Widget Header */}
                      <div 
                        className="flex items-center justify-between p-4 text-white"
                        style={{ backgroundColor: formData.primaryColor }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">💬</div>
                          <span className="font-semibold">{formData.chatName || 'Support Assistant'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                          <span className="text-xs text-white/80">Live</span>
                        </div>
                      </div>
                      
                      {/* Chat Messages Area */}
                      <div className="p-4 h-[320px] bg-gray-50 overflow-y-auto space-y-3">
                        <div className="flex gap-2">
                          <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: formData.primaryColor + '20' }}>
                            <div className="w-full h-full rounded-full flex items-center justify-center text-xs font-semibold" style={{ color: formData.primaryColor }}>AI</div>
                          </div>
                          <div className="bg-white rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-gray-800 max-w-[85%]">
                            Hi! I'm {formData.chatName || 'Support Assistant'}. I'm ready to answer questions about your content. Try asking me something!
                          </div>
                        </div>
                        {ragAnswer && (
                          <>
                            <div className="flex gap-2 justify-end">
                              <div className="bg-blue-500 text-white rounded-2xl rounded-tr-none p-3 shadow-sm text-sm max-w-[85%]">
                                {ragQuery}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: formData.primaryColor + '20' }}>
                                <div className="w-full h-full rounded-full flex items-center justify-center text-xs font-semibold" style={{ color: formData.primaryColor }}>AI</div>
                              </div>
                              <div className="bg-white rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-gray-800 max-w-[85%]">
                                {ragAnswer}
                              </div>
                            </div>
                          </>
                        )}
                        {ragLoading && (
                          <div className="flex gap-2">
                            <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: formData.primaryColor + '20' }}>
                              <div className="w-full h-full rounded-full flex items-center justify-center text-xs font-semibold" style={{ color: formData.primaryColor }}>AI</div>
                            </div>
                            <div className="bg-white rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-gray-500 flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Thinking...
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Chat Input */}
                      <div className="p-3 bg-white border-t border-gray-200">
                        <div className="flex gap-2">
                          <label htmlFor="ragQueryInput" className="sr-only">Ask a question about your content</label>
                          <input 
                            id="ragQueryInput"
                            name="ragQuery"
                            type="text" 
                            placeholder="Ask a question..."
                            value={ragQuery}
                            onChange={(e) => setRagQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && !ragLoading && ragQuery && handleRagQuery()}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-gray-400 text-gray-800"
                            disabled={ragLoading}
                          />
                          <button 
                            onClick={handleRagQuery}
                            disabled={ragLoading || !ragQuery}
                            className="px-4 py-2 rounded-xl text-white font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: formData.primaryColor }}
                          >
                            {ragLoading ? 'Sending...' : 'Send'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-white/50 text-center">Try asking questions about your content</p>
              </div>

              {ragSources.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                  <div className="text-sm font-semibold text-white/90">Sources:</div>
                  <ul className="space-y-2">
                    {ragSources.map((src, i) => (
                      <li key={i} className="text-xs text-white/60 border-l-2 border-emerald-500/30 pl-3">
                        <span className="font-semibold text-white/80">{src.metadata?.title || src.metadata?.url || `Source ${i + 1}`}</span>
                        <br />
                        {src.content?.slice(0, 120)}...
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-4">
                <button 
                  onClick={() => setStep(3)} 
                  className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
                >
                  Back
                </button>
                <button 
                  onClick={() => setStep(5)} 
                  className="flex-1 rounded-xl bg-white/90 px-4 py-3 text-sm font-semibold text-black transition hover:bg-white"
                >
                  Get Embed Code
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* Step 5: Embed Code */}
      {step === 5 && (
        <motion.div key="step-5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-400/10">
              <Check className="h-10 w-10 text-emerald-300" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Get Your Embed Code</h2>
            <p className="text-white/70">Copy and paste this code to add the chatbot to your website</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/80">Embed code:</label>
            <div className="relative">
              <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/50 p-4 pr-12 text-xs text-white/80">{embedSnippet}</pre>
              <button 
                onClick={copyToClipboard} 
                className={`absolute right-2 top-2 rounded-lg border p-2 text-white transition flex items-center gap-1.5 ${
                  copied 
                    ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-300' 
                    : 'border-white/10 bg-white/10 hover:border-white/30 hover:bg-white/20'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span className="text-xs font-medium">Copied!</span>
                  </>
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h4 className="mb-2 text-sm font-semibold text-white">Installation Steps</h4>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-white/70">
              <li>Copy the embed code above</li>
              <li>Paste it before the closing &lt;/body&gt; tag in your HTML</li>
              <li>The widget will appear automatically on all pages</li>
              <li>Trial expires in 3 days - upgrade anytime to keep your data</li>
            </ol>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <h4 className="mb-2 text-sm font-semibold text-emerald-300 flex items-center gap-2">
              <Check className="h-4 w-4" />
              What's Next?
            </h4>
            <ul className="space-y-1 text-sm text-white/70">
              <li>• Your chatbot is live and ready to use</li>
              <li>• Add the embed code to your website</li>
              <li>• Monitor usage from your admin dashboard</li>
              <li>• Upgrade before trial expires to keep your data</li>
            </ul>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => setStep(4)} 
              className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
            >
              Back to Playground
            </button>
            <button 
              onClick={() => window.open('/dashboard', '_blank')} 
              className="flex-1 rounded-xl bg-emerald-500/90 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-500"
            >
              Go to Dashboard
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 6: Advanced Testing (old step 5) */}
      {step === 6 && (
        <motion.div key="step-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Advanced Testing</h2>
          <label htmlFor="advancedRagQuery" className="sr-only">Ask a question</label>
          <input 
            id="advancedRagQuery"
            name="advancedRagQuery"
            type="text" 
            placeholder="Ask a question..." 
            value={ragQuery} 
            onChange={(e) => setRagQuery(e.target.value)} 
            className="p-3 w-full rounded-xl border border-white/10 bg-black/40 text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none" 
          />
          <button 
            onClick={handleRagQuery} 
            disabled={ragLoading || !ragQuery} 
            className="w-full rounded-xl bg-emerald-500/90 py-3 text-sm font-semibold text-black transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {ragLoading ? 'Asking...' : 'Ask'}
          </button>
          {ragLoading && (
            <div className="flex items-center justify-center gap-2 text-white/70">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Searching knowledge base...</span>
            </div>
          )}
          {ragAnswer && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div>
                <div className="text-sm font-bold text-white/90 mb-2">Answer:</div>
                <div className="text-white/80 leading-relaxed">{ragAnswer}</div>
              </div>
              {ragSources.length > 0 && (
                <div>
                  <div className="text-sm font-bold text-white/90 mb-2">Sources:</div>
                  <ul className="space-y-2">
                    {ragSources.map((src, i) => (
                      <li key={i} className="text-xs text-white/60 border-l-2 border-emerald-500/30 pl-3">
                        <span className="font-semibold text-white/80">{src.metadata?.title || src.metadata?.url || `Source ${i + 1}`}</span>
                        <br />
                        {src.content?.slice(0, 150)}...
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
