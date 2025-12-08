import React, { useState } from 'react';
import { realEstateTenantConfig } from '@/app/tenant/realestate';

interface RealEstateWidgetExtensionsProps {
  onSendMessage: (message: string) => void;
  tenantId: string;
  lastMessageMetadata?: any;
}

export function RealEstateWidgetExtensions({ onSendMessage, tenantId, lastMessageMetadata }: RealEstateWidgetExtensionsProps) {
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [schedulingStatus, setSchedulingStatus] = useState<string | null>(null);

  // Sync with chat metadata
  React.useEffect(() => {
    if (lastMessageMetadata?.propertyResults) {
      setSearchResults(lastMessageMetadata.propertyResults);
    }
  }, [lastMessageMetadata]);

  const handleSearch = async () => {
    const q = prompt('Search for (e.g., 2 bedroom Manhattan):');
    if (!q) return;
    try {
      const resp = await fetch('/api/realestate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, action: 'property_search', payload: { query: q, location: undefined } })
      });
      const data = await resp.json();
      setSearchResults(data.results || []);
    } catch (err) {
      setSearchResults([]);
    }
  };

  const handleSchedule = async (listingId: string) => {
    const date = prompt('Enter preferred date/time (ISO):');
    if (!date) return;
    setSchedulingStatus('Scheduling...');
    try {
      const resp = await fetch('/api/realestate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, action: 'schedule_viewing', payload: { listingId, date, visitorName: 'Guest' } })
      });
      const data = await resp.json();
      setSchedulingStatus(data.message || 'Scheduled');
    } catch (err) {
      setSchedulingStatus('Error scheduling viewing.');
    }
  };

  return (
    <div className="p-4 border-t border-gray-200 bg-white/5">
      <div className="text-xs text-gray-300 mb-2 italic">{realEstateTenantConfig.disclaimer}</div>

      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={handleSearch} className="text-xs bg-white border border-slate-700 text-slate-200 px-2 py-1 rounded-full hover:bg-slate-800 transition-colors">Find Listings</button>
        <button onClick={() => onSendMessage('Show market trends near me')} className="text-xs bg-white border border-slate-700 text-slate-200 px-2 py-1 rounded-full hover:bg-slate-800 transition-colors">Market Trends</button>
      </div>

      {searchResults && (
        <div className="space-y-2">
          {searchResults.length === 0 && <div className="text-xs text-gray-400">No results found.</div>}
          {searchResults.map((r, idx) => (
            <div key={idx} className="p-2 border rounded bg-slate-900/30">
              <div className="text-sm font-semibold">{r.title}</div>
              <div className="text-xs text-gray-400">{r.address} • {r.bedrooms}bd • ${r.price}/{r.currency}</div>
              {realEstateTenantConfig.allowScheduling && (
                <div className="mt-2">
                  <button onClick={() => handleSchedule(r.id)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Schedule Viewing</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {schedulingStatus && <div className="mt-2 text-xs text-green-300">{schedulingStatus}</div>}
    </div>
  );
}
