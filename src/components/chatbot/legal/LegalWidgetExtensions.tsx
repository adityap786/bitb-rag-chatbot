import React, { useState } from 'react';
import { legalTenantConfig } from '@/app/tenant/legal';

interface LegalWidgetExtensionsProps {
  onSendMessage: (message: string) => void;
  tenantId: string;
}

export function LegalWidgetExtensions({ onSendMessage, tenantId }: LegalWidgetExtensionsProps) {
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const handleAnalyzeDocument = async () => {
    const text = prompt('Paste document text to analyze:');
    if (!text) return;
    setAnalysisResult('Analyzing...');
    try {
      const response = await fetch('/api/legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          action: 'analyze_document',
          payload: { text }
        })
      });
      const data = await response.json();
      setAnalysisResult(data.analysis);
    } catch (error) {
      setAnalysisResult('Error analyzing document.');
    }
  };

  return (
    <div className="p-4 border-t border-gray-200 bg-yellow-50">
      <div className="text-xs text-gray-700 mb-2 italic">
        {legalTenantConfig.disclaimer}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {legalTenantConfig.supportedDocs.map((doc, idx) => (
          <button
            key={idx}
            onClick={() => onSendMessage(`Analyze this ${doc}`)}
            className="text-xs bg-white border border-yellow-200 text-yellow-700 px-2 py-1 rounded-full hover:bg-yellow-100 transition-colors"
          >
            {`Analyze ${doc}`}
          </button>
        ))}
      </div>
      <div className="mt-2">
        <button
          onClick={handleAnalyzeDocument}
          className="w-full bg-yellow-600 text-white text-sm py-2 rounded hover:bg-yellow-700 transition-colors"
        >
          Analyze Document
        </button>
        {analysisResult && (
          <p className="text-xs text-center mt-1 font-medium text-yellow-800">
            {analysisResult}
          </p>
        )}
      </div>
    </div>
  );
}
