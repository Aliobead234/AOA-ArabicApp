import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

const BACKEND = 'http://localhost:8081';

export function TochkaCallbackPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const code  = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      setStatus('error');
      setDetail(`Tochka denied: ${error} — ${params.get('error_description') ?? ''}`);
      return;
    }
    if (!code || !state) {
      setStatus('error');
      setDetail('Missing code or state in callback URL.');
      return;
    }

    fetch(`${BACKEND}/tochka/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.status === 'authorized') {
          setStatus('ok');
          setDetail(`Token saved. Expires: ${data.expires_at}`);
        } else {
          setStatus('error');
          setDetail(data.error ?? data.detail ?? JSON.stringify(data));
        }
      })
      .catch(err => {
        setStatus('error');
        setDetail(`Could not reach backend at ${BACKEND}: ${err.message}`);
      });
  }, []);

  return (
    <div style={{ fontFamily: 'monospace', padding: 40, background: '#1a1a1a', color: '#fff', minHeight: '100vh' }}>
      <h2>Tochka OAuth2 Callback</h2>
      {status === 'loading' && <p>Exchanging token with backend...</p>}
      {status === 'ok'      && <p style={{ color: '#7ec8a9' }}>✓ {detail}<br /><br />You can close this tab.</p>}
      {status === 'error'   && <p style={{ color: '#f87171' }}>✗ {detail}</p>}
    </div>
  );
}
