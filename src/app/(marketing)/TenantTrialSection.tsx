import { useState } from "react";
import Link from "next/link";
import { Upload, Globe, Palette, Settings, Timer, CheckCircle } from "lucide-react";

export default function TenantTrialSection() {
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(180); // seconds
  const [embedCode, setEmbedCode] = useState("");

  // Simulate progress and time remaining
  function startSetup() {
    setStep(2);
    setProgress(20);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setStep(5);
          setEmbedCode(`<script src=\"https://bitb.ltd/bitb-widget.js\" data-trial-token=\"tr_demo\" data-theme=\"auto\"></script>`);
          return 100;
        }
        return p + 8;
      });
      setTimeRemaining((t) => (t > 0 ? t - 8 : 0));
    }, 800);
  }

  return (
    <section className="rounded-3xl border border-emerald-400/30 bg-black/80 p-8 my-12 shadow-lg">
      <h2 className="text-3xl font-bold text-emerald-300 mb-4">Plug & Play: 3-Day Chatbot Trial Setup</h2>
      <p className="text-white/80 mb-6">Upload docs, crawl your site, customize branding, set tone, and generate your embeddable RAG/MCP chatbot widget. Setup is tenant-isolated, secure, and expires after 3 days.</p>
      <div className="grid gap-6 md:grid-cols-5 mb-8">
        <div className={`flex flex-col items-center ${step >= 1 ? 'opacity-100' : 'opacity-50'}`}>
          <Upload className="h-8 w-8 text-emerald-400 mb-2" />
          <span className="text-white">Upload Docs</span>
        </div>
        <div className={`flex flex-col items-center ${step >= 2 ? 'opacity-100' : 'opacity-50'}`}>
          <Globe className="h-8 w-8 text-sky-400 mb-2" />
          <span className="text-white">Crawl Website</span>
        </div>
        <div className={`flex flex-col items-center ${step >= 3 ? 'opacity-100' : 'opacity-50'}`}>
          <Palette className="h-8 w-8 text-pink-400 mb-2" />
          <span className="text-white">Branding & Tone</span>
        </div>
        <div className={`flex flex-col items-center ${step >= 4 ? 'opacity-100' : 'opacity-50'}`}>
          <Settings className="h-8 w-8 text-indigo-400 mb-2" />
          <span className="text-white">Configure Behaviour</span>
        </div>
        <div className={`flex flex-col items-center ${step === 5 ? 'opacity-100' : 'opacity-50'}`}>
          <CheckCircle className="h-8 w-8 text-green-400 mb-2" />
          <span className="text-white">Get Embed Code</span>
        </div>
      </div>
      {step < 5 ? (
        <div className="flex flex-col items-center">
          <button
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-6 rounded-lg mb-4"
            onClick={startSetup}
            disabled={step !== 1}
          >
            Start Setup
          </button>
          <div className="w-full max-w-md bg-white/10 rounded-lg p-4 mb-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-white/70">Setup Progress</span>
              <span className="text-white/70">{progress}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-3">
              <div
                className="bg-emerald-400 h-3 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="text-white/60 mb-2">Time remaining: <Timer className="inline h-4 w-4 mr-1" /> {timeRemaining}s</div>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="bg-black/80 border border-emerald-400/30 rounded-lg p-4 mb-4">
            <span className="text-white/70">Your embeddable code:</span>
            <pre className="bg-black/90 text-green-300 p-2 rounded mt-2 text-xs overflow-x-auto">{embedCode}</pre>
          </div>
          <Link href="/documentation" className="text-emerald-400 underline">See integration guide</Link>
        </div>
      )}
      <p className="text-xs text-white/40 mt-6">Trial is restricted to 3 days per tenant. All data is isolated and auto-purged after expiry.</p>
    </section>
  );
}
