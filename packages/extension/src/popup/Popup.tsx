import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getOnboarding } from '../lib/storage';
import { SignIn } from './SignIn';
import { Onboarding } from './Onboarding';
import { Account } from './Account';

/**
 * The toolbar popup, as a small state machine:
 *   not signed in        -> SignIn
 *   signed in, new user  -> Onboarding
 *   signed in, onboarded -> Account
 */
export function Popup() {
  const [session, setSession] = useState<Session | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const [sessionResult, onboarding] = await Promise.all([
        supabase.auth.getSession(),
        getOnboarding(),
      ]);
      if (!active) return;
      setSession(sessionResult.data.session);
      setOnboarded(onboarding.completed);
      setReady(true);
    }
    void load();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <div className="wikara-popup wk-center">
        <div className="wikara-popup-stripe" />
        <p className="wk-sub">Loading…</p>
      </div>
    );
  }

  if (!session) return <SignIn />;
  if (!onboarded) {
    return <Onboarding email={session.user.email ?? ''} onDone={() => setOnboarded(true)} />;
  }
  return <Account email={session.user.email ?? ''} />;
}
