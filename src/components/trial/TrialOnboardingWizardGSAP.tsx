'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import gsap from 'gsap';
import PlatformDetector from '@/components/trial/PlatformDetector';
import TrialPlayground from '@/components/trial/TrialPlayground';
import MultiStepLoader from '@/components/trial/MultiStepLoader';

const STEPS = [
  { number: 1, title: 'Business & Knowledge Base' },
  { number: 2, title: 'Branding & Platform' },
  { number: 3, title: 'Playground' },
  { number: 4, title: 'Widget Code' },
];

export default function TrialOnboardingWizardGSAP() {
  const STORAGE_KEY = 'trial_onboarding_gsap_session_v1';

  // Knowledge Base step state
  const [kbSource, setKbSource] = useState<'manual' | 'upload' | 'crawl'>('manual');
  const [kbFiles, setKbFiles] = useState<File[]>([]);
  const [crawlUrls, setCrawlUrls] = useState('');
  const [crawlDepth, setCrawlDepth] = useState(2);
  // Show embed code only after button click
  const [showEmbed, setShowEmbed] = useState(false);

  // File input handler
  function handleKbFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setKbFiles(Array.from(e.target.files));
    }
  }
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('service');
  const [companyInfo, setCompanyInfo] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#000000');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');
  const [chatTone, setChatTone] = useState('professional');
  const [welcomeMessage, setWelcomeMessage] = useState('Hello! How can I help you today?');
  const [embedCode, setEmbedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [trialToken, setTrialToken] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [ingestionRunId, setIngestionRunId] = useState<string | null>(null);
  const [ingestionProgress, setIngestionProgress] = useState(0);
  const [ingestionComplete, setIngestionComplete] = useState(false);

  // Rehydrate onboarding state after reload (session-scoped).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      if (typeof parsed?.step === 'number') setStep(parsed.step);
      if (typeof parsed?.progress === 'number') setProgress(parsed.progress);

      if (typeof parsed?.email === 'string') setEmail(parsed.email);
      if (typeof parsed?.businessName === 'string') setBusinessName(parsed.businessName);
      if (typeof parsed?.businessType === 'string') setBusinessType(parsed.businessType);
      if (typeof parsed?.companyInfo === 'string') setCompanyInfo(parsed.companyInfo);

      if (typeof parsed?.primaryColor === 'string') setPrimaryColor(parsed.primaryColor);
      if (typeof parsed?.secondaryColor === 'string') setSecondaryColor(parsed.secondaryColor);
      if (typeof parsed?.chatTone === 'string') setChatTone(parsed.chatTone);
      if (typeof parsed?.welcomeMessage === 'string') setWelcomeMessage(parsed.welcomeMessage);

      if (typeof parsed?.kbSource === 'string') setKbSource(parsed.kbSource);
      if (typeof parsed?.crawlUrls === 'string') setCrawlUrls(parsed.crawlUrls);
      if (typeof parsed?.crawlDepth === 'number') setCrawlDepth(parsed.crawlDepth);

      if (typeof parsed?.selectedPlatform === 'string' || parsed?.selectedPlatform === null) {
        setSelectedPlatform(parsed.selectedPlatform);
      }
      if (typeof parsed?.showEmbed === 'boolean') setShowEmbed(parsed.showEmbed);

      if (typeof parsed?.trialToken === 'string') setTrialToken(parsed.trialToken);
      if (typeof parsed?.tenantId === 'string' || parsed?.tenantId === null) setTenantId(parsed.tenantId);
      if (typeof parsed?.embedCode === 'string' || parsed?.embedCode === null) setEmbedCode(parsed.embedCode);

      if (typeof parsed?.ingestionRunId === 'string' || parsed?.ingestionRunId === null) {
        setIngestionRunId(parsed.ingestionRunId);
      }
      if (typeof parsed?.ingestionProgress === 'number') setIngestionProgress(parsed.ingestionProgress);
      if (typeof parsed?.ingestionComplete === 'boolean') setIngestionComplete(parsed.ingestionComplete);
    } catch {
      // Ignore malformed session data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist onboarding state (session-scoped) so refresh keeps trial context.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload = {
        step,
        progress,
        email,
        businessName,
        businessType,
        companyInfo,
        primaryColor,
        secondaryColor,
        chatTone,
        welcomeMessage,
        kbSource,
        crawlUrls,
        crawlDepth,
        selectedPlatform,
        showEmbed,
        trialToken,
        tenantId,
        embedCode,
        ingestionRunId,
        ingestionProgress,
        ingestionComplete,
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota/unavailable
    }
  }, [
    step,
    progress,
    email,
    businessName,
    businessType,
    companyInfo,
    primaryColor,
    secondaryColor,
    chatTone,
    welcomeMessage,
    kbSource,
    crawlUrls,
    crawlDepth,
    selectedPlatform,
    showEmbed,
    trialToken,
    tenantId,
    embedCode,
    ingestionRunId,
    ingestionProgress,
    ingestionComplete,
  ]);

  // GSAP refs
  const wizardRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (wizardRef.current) {
      gsap.fromTo(
        wizardRef.current,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 1, ease: 'power3.out' }
      );
    }
  }, []);

  useEffect(() => {
    if (stepRefs.current[step - 1]) {
      gsap.fromTo(
        stepRefs.current[step - 1],
        { scale: 0.95, boxShadow: '0 0 0 0 rgba(255,255,255,0)' },
        { scale: 1, boxShadow: '0 8px 32px 0 rgba(255,255,255,0.12)', duration: 0.6, ease: 'power2.out' }
      );
    }
  }, [step]);

  function nextStep() {
    setStep((s) => Math.min(s + 1, STEPS.length));
    setProgress((p) => Math.min(p + 100 / STEPS.length, 100));
  }

  async function handleStep2Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!trialToken || !tenantId) {
      setError('Missing trial session. Please restart onboarding.');
      return;
    }

    if (!selectedPlatform) {
      setError('Please select a platform');
      return;
    }

    setLoading(true);
    try {
      const brandingRes = await fetch('/api/trial/branding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${trialToken}`,
        },
        body: JSON.stringify({
          primaryColor,
          secondaryColor,
          tone: chatTone,
          welcomeMessage,
          platform: selectedPlatform,
        }),
      });

      const brandingData = await brandingRes.json().catch(() => null);
      if (!brandingRes.ok) {
        throw new Error(brandingData?.error || 'Failed to save branding');
      }

      const jobId = brandingData?.pipeline?.jobId ?? null;
      if (typeof jobId === 'string' && jobId.length > 0) {
        setIngestionRunId(jobId);
      }

      nextStep();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateEmbed() {
    setError(null);

    if (!trialToken || !tenantId) {
      setError('Missing trial session. Please restart onboarding.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/trial/generate-widget', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${trialToken}`,
        },
      });

      const data = await res.json().catch(() => null);

      if (res.status === 202 && data?.jobId) {
        setIngestionRunId(data.jobId);
        setIngestionComplete(false);
        setError('Your widget is still being prepared. Please finish ingestion in the Playground step.');
        setStep(3);
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to generate widget code');
      }

      if (!data?.embedCode) {
        throw new Error('Widget response did not include embed code');
      }

      setEmbedCode(data.embedCode);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate inputs
      if (!email || !businessName || !businessType) {
        setError('Please fill in all required fields');
        setLoading(false);
        return;
      }

      if (kbSource === 'manual' && !companyInfo) {
        setError('Please provide business description');
        setLoading(false);
        return;
      }

      if (kbSource === 'crawl' && !crawlUrls) {
        setError('Please provide at least one website URL to crawl');
        setLoading(false);
        return;
      }

      if (kbSource === 'upload' && kbFiles.length === 0) {
        setError('Please upload at least one document');
        setLoading(false);
        return;
      }

      // Step 1a: Create trial account
      const trialStartRes = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          businessName,
          businessType,
        }),
      });

      if (!trialStartRes.ok) {
        const errData = await trialStartRes.json();
        throw new Error(errData.error || 'Failed to create trial account');
      }

      const trialStartData = await trialStartRes.json();
      const { tenantId: newTenantId, setupToken } = trialStartData;

      // Store for later use
      setTrialToken(setupToken);
      setTenantId(newTenantId);

      // Step 1b: Submit knowledge base
      if (kbSource === 'manual') {
        // No-op here; manual KB is submitted below.
      } else if (kbSource === 'upload' && kbFiles.length > 0) {
        const formData = new FormData();
        kbFiles.forEach(file => formData.append('files', file));

        const kbRes = await fetch('/api/trial/kb/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${setupToken}`,
          },
          body: formData,
        });

        if (!kbRes.ok) {
          const errData = await kbRes.json();
          throw new Error(errData.error || 'Failed to upload knowledge base');
        }
      } else if (kbSource === 'crawl' && crawlUrls) {
        const urls = crawlUrls.split(',').map(u => u.trim()).filter(Boolean);

        const kbRes = await fetch('/api/trial/kb/crawl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${setupToken}`,
          },
          body: JSON.stringify({ urls, depth: crawlDepth }),
        });

        if (!kbRes.ok) {
          const errData = await kbRes.json();
          throw new Error(errData.error || 'Failed to crawl website');
        }
      }

      // Submit manual KB if that's the source
      if (kbSource === 'manual') {
        const kbRes = await fetch('/api/trial/kb/manual', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${setupToken}`,
          },
          body: JSON.stringify({
            companyInfo,
            faqs: [],
          }),
        });

        if (!kbRes.ok) {
          const errData = await kbRes.json();
          throw new Error(errData.error || 'Failed to submit knowledge base');
        }
      }

      // Step 1c: Start ingestion pipeline (or attach to existing run)
      try {
        const ingestRes = await fetch(`/api/tenants/${newTenantId}/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${setupToken}`,
          },
          body: JSON.stringify({
            source: kbSource,
            metadata: {
              kbSource,
              crawlDepth: kbSource === 'crawl' ? crawlDepth : undefined,
              crawlUrls: kbSource === 'crawl' ? crawlUrls : undefined,
              uploadFileCount: kbSource === 'upload' ? kbFiles.length : undefined,
            },
          }),
        });

        const ingestData = await ingestRes.json().catch(() => null);
        if (ingestRes.status === 409 && ingestData?.runId) {
          setIngestionRunId(ingestData.runId);
          setIngestionComplete(false);
        } else if (ingestRes.ok && ingestData?.runId) {
          setIngestionRunId(ingestData.runId);
          setIngestionComplete(false);
        } else if (!ingestRes.ok) {
          // Non-fatal: Playground has its own readiness checks, but we log for visibility.
          console.warn('Failed to start ingestion pipeline', { status: ingestRes.status, ingestData });
        }
      } catch (err) {
        console.warn('Failed to start ingestion pipeline', err);
      }

      // Success - move to next step
      nextStep();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      console.error('Step 1 error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={wizardRef} className="w-full max-w-4xl mx-auto bg-black rounded-3xl border border-white/10 p-8 shadow-2xl">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          {STEPS.map((s, idx) => (
            <div
              key={s.number}
              ref={el => { stepRefs.current[idx] = el; }}
              className={`flex-1 text-center transition-all duration-300 ${step === s.number ? 'text-white font-bold scale-105' : 'text-white/40'}`}
              style={{ cursor: 'pointer' }}
              onClick={() => setStep(s.number)}
            >
              {s.title}
            </div>
          ))}
        </div>
        <Progress value={progress} className="bg-white/10 h-2" />
      </div>
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {step === 1 && (
        <Card className="bg-black border border-white/10 p-6" ref={el => { stepRefs.current[0] = el; }}>
          <form onSubmit={handleStep1Submit} className="space-y-4 max-h-[65vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="email" className="text-sm">Email Address</Label>
                <Input id="email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" className="bg-black text-white border-white/20" />
              </div>
              <div>
                <Label htmlFor="businessName" className="text-sm">Business Name</Label>
                <Input id="businessName" name="businessName" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Acme Inc." required autoComplete="organization" className="bg-black text-white border-white/20" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="businessType" className="text-sm">Business Type</Label>
                <Select value={businessType} onValueChange={setBusinessType}>
                  <SelectTrigger id="businessType" name="businessType" className="bg-black text-white border-white/20"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-black text-white">
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="ecommerce">E-commerce</SelectItem>
                    <SelectItem value="saas">SaaS</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="kbSource" className="text-sm mb-2">Knowledge Base Source</Label>
                <Select value={kbSource} onValueChange={v => setKbSource(v as 'manual' | 'upload' | 'crawl')}>
                  <SelectTrigger id="kbSource" name="kbSource" className="bg-black text-white border-white/20"><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent className="bg-black text-white">
                    <SelectItem value="manual">Manual Input</SelectItem>
                    <SelectItem value="upload">Document Upload</SelectItem>
                    <SelectItem value="crawl">Website Crawl</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {kbSource === 'manual' && (
              <div className="space-y-2">
                <Label htmlFor="companyInfo" className="text-sm">Business Description</Label>
                <Textarea id="companyInfo" value={companyInfo} onChange={e => setCompanyInfo(e.target.value)} placeholder="Describe your company, products, services..." rows={3} className="bg-black text-white border-white/20" required />
              </div>
            )}

            {kbSource === 'upload' && (
              <div className="space-y-4">
                <Label htmlFor="kbFiles">Upload Documents (PDF, DOCX, TXT, HTML)</Label>
                <Input id="kbFiles" type="file" multiple accept=".pdf,.docx,.txt,.html" className="bg-black text-white border-white/20" onChange={handleKbFilesChange} />
                {kbFiles.length > 0 && (
                  <div className="text-white/70 text-xs">{kbFiles.length} file(s) selected</div>
                )}
              </div>
            )}

            {kbSource === 'crawl' && (
              <div className="space-y-2">
                <div>
                  <Label htmlFor="crawlUrls" className="text-sm">Website URLs (comma separated)</Label>
                  <Input id="crawlUrls" type="text" value={crawlUrls} onChange={e => setCrawlUrls(e.target.value)} placeholder="https://example.com, https://docs.example.com" className="bg-black text-white border-white/20" />
                </div>
                <div>
                  <Label htmlFor="crawlDepth" className="text-sm">Crawl Depth</Label>
                  <Input id="crawlDepth" type="number" min={1} max={5} value={crawlDepth} onChange={e => setCrawlDepth(Number(e.target.value))} className="bg-black text-white border-white/20 w-24" />
                </div>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full bg-white text-black font-bold disabled:opacity-50">{loading ? 'Creating Trial...' : 'Continue'}</Button>
          </form>
        </Card>
      )}
      {step === 2 && (
        <Card className="bg-black border border-white/10 p-6" ref={el => { stepRefs.current[1] = el; }}>
          <form onSubmit={handleStep2Submit} className="space-y-4 max-h-[65vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="primaryColor" className="text-sm">Primary Color</Label>
                <Input id="primaryColor" type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-16 h-8" />
              </div>
              <div>
                <Label htmlFor="secondaryColor" className="text-sm">Secondary Color</Label>
                <Input id="secondaryColor" type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-16 h-8" />
              </div>
            </div>
            <div>
              <Label htmlFor="chatTone" className="text-sm">Chat Tone</Label>
              <Select value={chatTone} onValueChange={setChatTone}>
                <SelectTrigger id="chatTone" className="bg-black text-white border-white/20"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-black text-white">
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="welcomeMessage" className="text-sm">Welcome Message</Label>
              <Textarea id="welcomeMessage" value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} rows={2} className="bg-black text-white border-white/20" />
            </div>

            <div className="mt-6 mb-3 text-white text-base font-semibold">Where is your website hosted?</div>
            <PlatformDetector selectedPlatform={selectedPlatform} setSelectedPlatform={setSelectedPlatform} />

            <Button type="submit" className="w-full bg-white text-black font-bold mt-6" disabled={!selectedPlatform || loading}>
              {loading ? 'Saving…' : 'Continue'}
            </Button>
          </form>
        </Card>
      )}
      {step === 3 && (
        <Card className="border border-white/10 p-6 bg-transparent" ref={el => { stepRefs.current[2] = el; }}>
          {tenantId && trialToken && ingestionRunId && !ingestionComplete ? (
            <div className="mb-6">
              <MultiStepLoader
                jobId={ingestionRunId}
                tenantId={tenantId}
                token={trialToken}
                initialProgress={ingestionProgress}
                onProgress={(value) => setIngestionProgress(value)}
                onComplete={() => {
                  setIngestionComplete(true);
                  setIngestionProgress(100);
                }}
                onFailure={(message) => setError(message)}
              />
            </div>
          ) : null}

          {ingestionRunId && !ingestionComplete ? null : (
            <TrialPlayground
              formData={{ primaryColor, secondaryColor, chatName: businessName || 'Support Assistant' }}
              trialToken={trialToken}
              tenantId={tenantId || process.env.NEXT_PUBLIC_DEMO_TENANT_ID || undefined}
            />
          )}
          <div className="mt-6">
            <Button
              className="w-full bg-white text-black font-bold"
              onClick={() => nextStep()}
              disabled={Boolean(ingestionRunId && !ingestionComplete)}
            >
              Continue to Widget Code
            </Button>
          </div>
        </Card>
      )}
      {step === 4 && (
        <Card className="border border-white/10 p-6 bg-transparent text-center" ref={el => { stepRefs.current[3] = el; }}>
          {!showEmbed && (
            <Button
              className="bg-white text-black font-bold w-full"
              onClick={async () => {
                setShowEmbed(true);
                if (!embedCode) {
                  await handleGenerateEmbed();
                }
              }}
              disabled={loading}
            >
              Generate Plug & Play embedding
            </Button>
          )}
          {showEmbed && (
            <>
              <div className="flex justify-end mb-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs px-2 py-1 h-7"
                  onClick={async () => {
                    if (!embedCode) {
                      await handleGenerateEmbed();
                    }
                    if (embedCode) {
                      await navigator.clipboard.writeText(embedCode);
                    }
                  }}
                  disabled={loading}
                >
                  Copy to Clipboard
                </Button>
              </div>
              <pre className="bg-black text-white border border-white/20 rounded-lg p-4 mb-4 text-xs overflow-x-auto">{embedCode || 'Generating widget code…'}</pre>
            </>
          )}
          <div className="mt-4 text-white/40 text-xs">Trial is restricted to 3 days per tenant. All data is isolated and auto-purged after expiry.</div>
        </Card>
      )}
    </div>
  );
}

// embed code is generated by /api/trial/generate-widget
