import { useState } from 'react';
import type { Plan } from '@wikara/shared';
import { supabase } from '../lib/supabase';
import { Mascot } from './Mascot';

const PLAN_LABELS: Record<Plan, string> = {
  free: 'Free plan',
  pro: 'Pro',
  team: 'Team',
};

/** The signed-in, onboarded view: who you are, your plan, and sign out. */
export function Account({ email, plan }: { email: string; plan: Plan }) {
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
      <span className={`wk-plan wk-plan-${plan}`}>{PLAN_LABELS[plan]}</span>
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
