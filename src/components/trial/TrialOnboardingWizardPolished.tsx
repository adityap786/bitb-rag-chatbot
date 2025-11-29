import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';

// No childish icons, only clean UI

const STEPS = [
  { number: 1, title: 'Business Info' },
  { number: 2, title: 'Knowledge Base' },
  { number: 3, title: 'Branding' },
  { number: 4, title: 'Widget Code' },
];

export default function TrialOnboardingWizardPolished() {
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

  // Simulate progress
  function nextStep() {
    setStep((s) => Math.min(s + 1, 4));
    setProgress((p) => Math.min(p + 25, 100));
  }

  return (
    <div className="w-full max-w-2xl mx-auto bg-black rounded-3xl border border-white/10 p-8 shadow-xl">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          {STEPS.map((s) => (
            <div key={s.number} className={`flex-1 text-center ${step === s.number ? 'text-white font-bold' : 'text-white/40'}`}>{s.title}</div>
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
        <Card className="bg-black border border-white/10 p-6">
          <form onSubmit={e => { e.preventDefault(); nextStep(); }} className="space-y-4">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required className="bg-black text-white border-white/20" />
            <Label htmlFor="businessName">Business Name</Label>
            <Input id="businessName" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Acme Inc." required className="bg-black text-white border-white/20" />
            <Label htmlFor="businessType">Business Type</Label>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger id="businessType" className="bg-black text-white border-white/20"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-black text-white">
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="ecommerce">E-commerce</SelectItem>
                <SelectItem value="saas">SaaS</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" className="w-full bg-white text-black font-bold">Continue</Button>
          </form>
        </Card>
      )}
      {step === 2 && (
        <Card className="bg-black border border-white/10 p-6">
          <form onSubmit={e => { e.preventDefault(); nextStep(); }} className="space-y-4">
            <Label htmlFor="companyInfo">Knowledge Base</Label>
            <Textarea id="companyInfo" value={companyInfo} onChange={e => setCompanyInfo(e.target.value)} placeholder="Describe your company, products, services..." rows={6} className="bg-black text-white border-white/20" required />
            <Button type="submit" className="w-full bg-white text-black font-bold">Continue</Button>
          </form>
        </Card>
      )}
      {step === 3 && (
        <Card className="bg-black border border-white/10 p-6">
          <form onSubmit={e => { e.preventDefault(); nextStep(); }} className="space-y-4">
            <Label htmlFor="primaryColor">Primary Color</Label>
            <Input id="primaryColor" type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-16 h-8" />
            <Label htmlFor="secondaryColor">Secondary Color</Label>
            <Input id="secondaryColor" type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-16 h-8" />
            <Label htmlFor="chatTone">Chat Tone</Label>
            <Select value={chatTone} onValueChange={setChatTone}>
              <SelectTrigger className="bg-black text-white border-white/20"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-black text-white">
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
              </SelectContent>
            </Select>
            <Label htmlFor="welcomeMessage">Welcome Message</Label>
            <Textarea id="welcomeMessage" value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} rows={2} className="bg-black text-white border-white/20" />
            <Button type="submit" className="w-full bg-white text-black font-bold">Continue</Button>
          </form>
        </Card>
      )}
      {step === 4 && (
        <Card className="bg-black border border-white/10 p-6 text-center">
          <div className="mb-4 text-white text-lg font-semibold">Your embeddable widget code:</div>
          <pre className="bg-black text-white border border-white/20 rounded-lg p-4 mb-4 text-xs overflow-x-auto">{`<script src="https://bitb.ltd/bitb-widget.js" data-trial-token="tr_demo" data-theme="auto"></script>`}</pre>
          <Button className="bg-white text-black font-bold w-full" onClick={() => navigator.clipboard.writeText('<script src="https://bitb.ltd/bitb-widget.js" data-trial-token="tr_demo" data-theme="auto"></script>')}>Copy to Clipboard</Button>
          <div className="mt-4 text-white/40 text-xs">Trial is restricted to 3 days per tenant. All data is isolated and auto-purged after expiry.</div>
        </Card>
      )}
    </div>
  );
}
