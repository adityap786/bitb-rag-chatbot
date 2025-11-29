'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { CheckCircle2, Upload, Globe, FileText, Palette, Code } from 'lucide-react';

type BusinessType = 'service' | 'ecommerce' | 'saas' | 'other';

interface TrialState {
  step: number;
  tenantId: string | null;
  setupToken: string | null;
  trialExpiresAt: string | null;
  email: string;
  businessName: string;
  businessType: BusinessType;
  primaryColor: string;
  secondaryColor: string;
  chatTone: 'professional' | 'friendly' | 'casual';
  welcomeMessage: string;
  embedCode: string | null;
  assignedTools: string[];
}

const STEPS = [
  { number: 1, title: 'Get Started', icon: FileText },
  { number: 2, title: 'Knowledge Base', icon: Upload },
  { number: 3, title: 'Branding', icon: Palette },
  { number: 4, title: 'Get Widget', icon: Code },
];

export default function TrialOnboardingWizard() {
  const [state, setState] = useState<TrialState>({
    step: 1,
    tenantId: null,
    setupToken: null,
    trialExpiresAt: null,
    email: '',
    businessName: '',
    businessType: 'service',
    primaryColor: '#6366f1',
    secondaryColor: '#8b5cf6',
    chatTone: 'professional',
    welcomeMessage: 'Hello! How can I help you today?',
    embedCode: null,
    assignedTools: [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kbMethod, setKbMethod] = useState<'upload' | 'manual'>('manual');
  const [companyInfo, setCompanyInfo] = useState('');

  // Step 1: Start Trial
  const handleStartTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: state.email,
          businessName: state.businessName,
          businessType: state.businessType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start trial');
      }

      const data = await response.json();
      setState(prev => ({
        ...prev,
        tenantId: data.tenantId,
        setupToken: data.setupToken,
        trialExpiresAt: data.trialExpiresAt,
        step: 2,
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Upload Knowledge Base
  const handleKBSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (kbMethod === 'manual') {
        const response = await fetch('/api/trial/kb/manual', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.setupToken}`,
          },
          body: JSON.stringify({ companyInfo }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to save knowledge base');
        }
      }

      setState(prev => ({ ...prev, step: 3 }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Configure Branding
  const handleBrandingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/trial/branding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.setupToken}`,
        },
        body: JSON.stringify({
          primaryColor: state.primaryColor,
          secondaryColor: state.secondaryColor,
          tone: state.chatTone,
          welcomeMessage: state.welcomeMessage,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save branding');
      }

      const data = await response.json();
      setState(prev => ({
        ...prev,
        assignedTools: data.config.assignedTools,
        step: 4,
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Generate Widget
  const handleGenerateWidget = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/trial/generate-widget', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.setupToken}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.status === 'processing') {
          setError(data.message);
          return;
        }
        throw new Error(data.error || 'Failed to generate widget');
      }

      const data = await response.json();
      setState(prev => ({
        ...prev,
        embedCode: data.embedCode,
        assignedTools: data.assignedTools,
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#312e81] to-[#6366f1] py-12 px-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #312e81 50%, #6366f1 100%)' }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h1 className="text-5xl font-extrabold text-white mb-2 drop-shadow-lg tracking-tight">
            Plug & Play Chatbot Onboarding
          </h1>
          <p className="text-xl text-white/80 font-medium">
            Experience user ecstasy. Set up your AI chatbot in minutes.
          </p>
        </motion.div>

        {/* Progress Steps */}
        <motion.div className="flex justify-between mb-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.3 }}>
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = state.step === step.number;
            const isCompleted = state.step > step.number;
            return (
              <motion.div
                key={step.number}
                className="flex flex-col items-center flex-1"
                whileHover={{ scale: 1.08 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <motion.div
                  className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 shadow-lg border-2 ${
                    isCompleted
                      ? 'bg-gradient-to-br from-green-400 to-emerald-600 text-white border-green-400'
                      : isActive
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-indigo-400'
                      : 'bg-gradient-to-br from-gray-800 to-gray-700 text-gray-400 border-gray-600'
                  }`}
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  {isCompleted ? <CheckCircle2 className="w-7 h-7" /> : <Icon className="w-7 h-7" />}
                </motion.div>
                <span className={`text-base font-semibold ${isActive ? 'text-indigo-300' : 'text-gray-400'}`}>
                  {step.title}
                </span>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Error Alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 1: Get Started */}
        <AnimatePresence>
        {state.step === 1 && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} transition={{ duration: 0.5 }}>
          <Card className="p-8 glassmorphism-card">
            <h2 className="text-2xl font-bold mb-6">Tell us about your business</h2>
            <form onSubmit={handleStartTrial} className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={state.email}
                  onChange={(e) => setState(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="you@company.com"
                  required
                />
              </div>

              <div>
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  value={state.businessName}
                  onChange={(e) => setState(prev => ({ ...prev, businessName: e.target.value }))}
                  placeholder="Acme Inc."
                  required
                />
              </div>

              <div>
                <Label htmlFor="businessType">Business Type</Label>
                <Select
                  value={state.businessType}
                  onValueChange={(value: BusinessType) => setState(prev => ({ ...prev, businessType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">Service Business</SelectItem>
                    <SelectItem value="ecommerce">E-commerce</SelectItem>
                    <SelectItem value="saas">SaaS Product</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Spinner className="mr-2" /> : null}
                Start Free Trial
              </Button>
            </form>
          </Card>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Step 2: Knowledge Base */}
        <AnimatePresence>
        {state.step === 2 && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} transition={{ duration: 0.5 }}>
          <Card className="p-8 glassmorphism-card">
            <h2 className="text-2xl font-bold mb-6">Add Your Knowledge Base</h2>
            <form onSubmit={handleKBSubmit} className="space-y-4">
              <div>
                <Label htmlFor="companyInfo">Company Information</Label>
                <Textarea
                  id="companyInfo"
                  value={companyInfo}
                  onChange={(e) => setCompanyInfo(e.target.value)}
                  placeholder="Tell us about your company, products, services, and common questions..."
                  rows={8}
                  maxLength={10000}
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  {companyInfo.length} / 10,000 characters
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Spinner className="mr-2" /> : null}
                Continue to Branding
              </Button>
            </form>
          </Card>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Step 3: Branding */}
        <AnimatePresence>
        {state.step === 3 && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} transition={{ duration: 0.5 }}>
          <Card className="p-8 glassmorphism-card">
            <h2 className="text-2xl font-bold mb-6">Customize Your Chatbot</h2>
            <form onSubmit={handleBrandingSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <Input
                    id="primaryColor"
                    type="color"
                    value={state.primaryColor}
                    onChange={(e) => setState(prev => ({ ...prev, primaryColor: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="secondaryColor">Secondary Color</Label>
                  <Input
                    id="secondaryColor"
                    type="color"
                    value={state.secondaryColor}
                    onChange={(e) => setState(prev => ({ ...prev, secondaryColor: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="chatTone">Chat Tone</Label>
                <Select
                  value={state.chatTone}
                  onValueChange={(value: any) => setState(prev => ({ ...prev, chatTone: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="welcomeMessage">Welcome Message</Label>
                <Textarea
                  id="welcomeMessage"
                  value={state.welcomeMessage}
                  onChange={(e) => setState(prev => ({ ...prev, welcomeMessage: e.target.value }))}
                  rows={2}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Spinner className="mr-2" /> : null}
                Continue to Widget
              </Button>
            </form>
          </Card>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Step 4: Get Widget Code */}
        <AnimatePresence>
        {state.step === 4 && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} transition={{ duration: 0.5 }}>
          <Card className="p-8 glassmorphism-card">
            <h2 className="text-2xl font-bold mb-6">Your Chatbot is Ready!</h2>

            {!state.embedCode ? (
              <Button onClick={handleGenerateWidget} className="w-full mb-4" disabled={loading}>
                {loading ? <Spinner className="mr-2" /> : null}
                Generate Widget Code
              </Button>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Assigned Tools</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {state.assignedTools.map(tool => (
                      <span key={tool} className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">
                        {tool.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Embed Code</Label>
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto mt-2">
                    <code>{state.embedCode}</code>
                  </pre>
                  <Button
                    onClick={() => navigator.clipboard.writeText(state.embedCode!)}
                    className="mt-2"
                    variant="outline"
                  >
                    Copy to Clipboard
                  </Button>
                </div>

                <Alert>
                  <AlertDescription>
                    Add this code to your website before the closing <code>&lt;/body&gt;</code> tag.
                    Your trial expires on {new Date(state.trialExpiresAt!).toLocaleDateString()}.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </Card>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
