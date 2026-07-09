import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Mascot } from './Mascot';

type Mode = 'signin' | 'signup';

/** The first screen: sign in or create an account (email + password). */
export function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage('Account created. Check your email to confirm, then log in.');
          setMode('signin');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wikara-popup wk-center">
      <div className="wikara-popup-stripe" />
      <Mascot size={88} />
      <h1>Wikara</h1>
      <p className="wk-sub">{mode === 'signin' ? 'Log in to your account' : 'Create your account'}</p>

      <form className="wk-form" onSubmit={handleSubmit}>
        <input
          className="wk-input"
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="wk-input"
          type="password"
          placeholder="Password (6+ characters)"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        <button className="wk-btn" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Sign up'}
        </button>
      </form>

      {error && <p className="wk-error">{error}</p>}
      {message && <p className="wk-info">{message}</p>}

      <button
        className="wk-link"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
          setError(null);
          setMessage(null);
        }}
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
      </button>
    </div>
  );
}
