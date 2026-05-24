// SMOKE ROUTE — placeholder for Subtask 1.1.2.
// Subtask 1.1.5 will replace this with the real, designed sign-in screen
// (per docs/design-system.md and the Story-1.1 mockup). Do not extend this
// file with styling, validation polish, or copy work — delete and rewrite.

'use client';

import { useState } from 'react';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [status, setStatus] = useState<string>('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('…');
    const endpoint = mode === 'sign-in' ? '/api/auth/sign-in/email' : '/api/auth/sign-up/email';
    const body = mode === 'sign-in' ? { email, password } : { email, password, name: email };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setStatus('ok — redirecting');
      window.location.href = '/dashboard';
    } else {
      const text = await res.text();
      setStatus(`error ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Sign in (smoke route)</h1>
      <p style={{ color: '#888', fontSize: 14 }}>
        Placeholder for Subtask 1.1.2. Real UI lands in 1.1.5.
      </p>
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setMode('sign-in')}
          style={{ fontWeight: mode === 'sign-in' ? 700 : 400 }}
        >
          Sign in
        </button>
        {' / '}
        <button
          type="button"
          onClick={() => setMode('sign-up')}
          style={{ fontWeight: mode === 'sign-up' ? 700 : 400 }}
        >
          Sign up
        </button>
      </div>
      <form
        onSubmit={submit}
        style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}
      >
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <button type="submit">{mode === 'sign-in' ? 'Sign in' : 'Sign up'}</button>
      </form>
      {status && <p style={{ marginTop: 12, fontFamily: 'monospace' }}>{status}</p>}
    </main>
  );
}
