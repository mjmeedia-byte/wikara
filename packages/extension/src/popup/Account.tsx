import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mascot } from './Mascot';

/** The signed-in, onboarded view: who you are + sign out. */
export function Account({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  }

  return (
    <div className="wikara-popup wk-center">
      <div className="wikara-popup-stripe" />
      <Mascot size={72} />
      <h1>Wikara</h1>
      <p className="wk-signed-in">
        Signed in as
        <br />
        <strong>{email}</strong>
      </p>
      <button className="wk-btn" onClick={() => void signOut()} disabled={busy}>
        {busy ? 'Please wait…' : 'Sign out'}
      </button>
    </div>
  );
}
