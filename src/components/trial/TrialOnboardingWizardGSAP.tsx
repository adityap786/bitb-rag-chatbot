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

const STEPS = [
  { number: 1, title: 'Business & Knowledge Base' },
  { number: 2, title: 'Branding & Platform' },
  { number: 3, title: 'Playground' },
  { number: 4, title: 'Widget Code' },
];

export default function TrialOnboardingWizardGSAP() {
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
  const [trialToken, setTrialToken] = useState('demo_token');

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
          <form onSubmit={e => { e.preventDefault(); nextStep(); }} className="space-y-4 max-h-[65vh] overflow-y-auto">
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
                  <SelectTrigger id="businessType" name="businessType" autoComplete="organization-type" className="bg-black text-white border-white/20"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger id="kbSource" name="kbSource" autoComplete="off" className="bg-black text-white border-white/20"><SelectValue placeholder="Select source" /></SelectTrigger>
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

            <Button type="submit" className="w-full bg-white text-black font-bold">Continue</Button>
          </form>
        </Card>
      )}
      {step === 2 && (
        <Card className="bg-black border border-white/10 p-6" ref={el => { stepRefs.current[1] = el; }}>
          <form onSubmit={e => { e.preventDefault(); nextStep(); }} className="space-y-4 max-h-[65vh] overflow-y-auto">
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
                <SelectTrigger className="bg-black text-white border-white/20"><SelectValue /></SelectTrigger>
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

            <Button type="submit" className="w-full bg-white text-black font-bold mt-6" disabled={!selectedPlatform}>Continue</Button>
          </form>
        </Card>
      )}
      {step === 3 && (
        <Card className="border border-white/10 p-6 bg-transparent" ref={el => { stepRefs.current[2] = el; }}>
          <TrialPlayground formData={{ primaryColor, chatName: businessName || 'Support Assistant' }} trialToken={trialToken} />
          <div className="mt-6">
            <Button className="w-full bg-white text-black font-bold" onClick={() => nextStep()}>Continue to Widget Code</Button>
          </div>
        </Card>
      )}
      {step === 4 && (
        <Card className="border border-white/10 p-6 bg-transparent text-center" ref={el => { stepRefs.current[3] = el; }}>
          {!showEmbed && (
            <Button className="bg-white text-black font-bold w-full" onClick={() => setShowEmbed(true)}>
              Generate Plug & Play embedding
            </Button>
          )}
          {showEmbed && (
            <>
              <div className="flex justify-end mb-1">
                <Button size="sm" variant="outline" className="text-xs px-2 py-1 h-7" onClick={() => {
                  navigator.clipboard.writeText(embedCodeGen(selectedPlatform));
                }}>Copy to Clipboard</Button>
              </div>
              <pre className="bg-black text-white border border-white/20 rounded-lg p-4 mb-4 text-xs overflow-x-auto">{embedCodeGen(selectedPlatform)}</pre>
            </>
          )}
          <div className="mt-4 text-white/40 text-xs">Trial is restricted to 3 days per tenant. All data is isolated and auto-purged after expiry.</div>
        </Card>
      )}
    </div>
  );
}

function embedCodeGen(platform: string | null) {
  const tn = 'tn_demo';
  const theme = 'auto';
  const p = platform ?? 'generic';
  if (p === 'Shopify') {
    return `<script src=\"https://cdn.example.com/bitb-widget.v1.js\" data-tenant-id=\"${tn}\" data-platform=\"shopify\" async></script>`;
  }
  if (p === 'WordPress') {
    return `<script src=\"https://cdn.example.com/bitb-widget.v1.js\" data-tenant-id=\"${tn}\" data-platform=\"wordpress\" async></script>`;
  }
  if (p === 'Wix') {
    return `<script src=\"https://cdn.example.com/bitb-widget.v1.js\" data-tenant-id=\"${tn}\" data-platform=\"wix\" async></script>`;
  }
  if (p === 'Framer') {
    return `<script src=\"https://cdn.example.com/bitb-widget.v1.js\" data-tenant-id=\"${tn}\" data-platform=\"framer\" async></script>`;
  }
  if (p === 'Next.js') {
    return `<script src=\"/bitb-widget.v1.js\" data-tenant-id=\"${tn}\" data-platform=\"next\" defer></script>`;
  }
  return `<script src=\"https://cdn.example.com/bitb-widget.v1.js\" data-tenant-id=\"${tn}\" data-theme=\"${theme}\"></script>`;
}
