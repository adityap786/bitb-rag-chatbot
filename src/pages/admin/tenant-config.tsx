import { useState, useEffect } from 'react';

export default function AdminTenantConfig() {
  const [tenants, setTenants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [branding, setBranding] = useState({ logo: '', color: '' });
  const [features, setFeatures] = useState({});

  useEffect(() => {
    fetch('/api/tenants/list').then(r => r.json()).then(data => setTenants(data.tenants || []));
  }, []);

  const loadConfig = async (tenantId) => {
    setSelected(tenantId);
    const b = await fetch(`/api/branding?tenantId=${tenantId}`).then(r => r.json());
    setBranding(b.branding || {});
    // ...load features, plugins, etc.
  };

  const saveBranding = async () => {
    await fetch(`/api/branding?tenantId=${selected}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branding }),
    });
  };

  return (
    <div>
      <h2>Tenant Config Admin</h2>
      <select onChange={e => loadConfig(e.target.value)}>
        <option value=''>Select Tenant</option>
        {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {selected && (
        <div>
          <h3>Branding</h3>
          <input value={branding.logo} onChange={e => setBranding({ ...branding, logo: e.target.value })} placeholder='Logo URL' />
          <input value={branding.color} onChange={e => setBranding({ ...branding, color: e.target.value })} placeholder='Color' />
          <button onClick={saveBranding}>Save Branding</button>
        </div>
      )}
    </div>
  );
}
