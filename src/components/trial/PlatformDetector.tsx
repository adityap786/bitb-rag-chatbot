import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Candidate = { name: string; confidence: number; evidence: string[] };

export default function PlatformDetector({ selectedPlatform, setSelectedPlatform }: {
  selectedPlatform: string | null;
  setSelectedPlatform: (p: string | null) => void;
}) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function detect() {
    setError(null);
    setLoading(true);
    setCandidates([]);
    try {
      const res = await fetch('/api/onboarding/detect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Detection failed');
      setCandidates(body.candidates || []);
      if (body.candidates && body.candidates.length > 0) {
        setSelectedPlatform(body.candidates[0].name);
      }
    } catch (err: any) {
      setError(err?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Label>Website URL (optional)</Label>
      <div className="flex gap-2">
        <Input placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1 bg-black text-white border-white/20" />
        <Button onClick={detect} className="whitespace-nowrap" disabled={loading || !url.trim()}>{loading ? 'Detecting...' : 'Detect'}</Button>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {candidates.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-white/80">Detected platforms (highest confidence first):</div>
          <div className="grid grid-cols-1 gap-2">
            {candidates.map((c) => (
              <button key={c.name} className={`text-left p-2 rounded border ${selectedPlatform === c.name ? 'border-white' : 'border-white/10'}`} onClick={() => setSelectedPlatform(c.name)}>
                <div className="flex justify-between items-center">
                  <div className="text-white font-medium">{c.name}</div>
                  <div className="text-white/60 text-sm">{Math.round(c.confidence * 100)}%</div>
                </div>
                {c.evidence && <div className="text-xs text-white/60 mt-1">{c.evidence.join(', ')}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label>Or select manually</Label>
        <Select value={selectedPlatform ?? ''} onValueChange={(v) => setSelectedPlatform(v || null)}>
          <SelectTrigger className="bg-black text-white border-white/20"><SelectValue placeholder="Select platform" /></SelectTrigger>
          <SelectContent className="bg-black text-white">
            <SelectItem value="WordPress">WordPress</SelectItem>
            <SelectItem value="Shopify">Shopify</SelectItem>
            <SelectItem value="Wix">Wix</SelectItem>
            <SelectItem value="Framer">Framer</SelectItem>
            <SelectItem value="Next.js">Next.js</SelectItem>
            <SelectItem value="Nuxt">Nuxt</SelectItem>
            <SelectItem value="React (generic)">React (generic)</SelectItem>
            <SelectItem value="Svelte">Svelte</SelectItem>
            <SelectItem value="Other">Other / Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
