import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Plan } from '@wikara/shared';
import { supabase } from '../lib/supabase';
import { getOnboarding, getCachedPlan } from '../lib/storage';
import { fetchAndCachePlan } from '../lib/plan';
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
  const [plan, setPlan] = useState<Plan>('free');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const [sessionResult, onboarding, cachedPlan] = await Promise.all([
        supabase.auth.getSession(),
        getOnboarding(),
        getCachedPlan(),
      ]);
      if (!active) return;
      setSession(sessionResult.data.session);
      setOnboarded(onboarding.completed);
      setPlan(cachedPlan);
      setReady(true);

      // Refresh the plan from the server when signed in.
      if (sessionResult.data.session) {
        const fresh = await fetchAndCachePlan();
        if (active) setPlan(fresh);
      }
    }
    void load();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        void fetchAndCachePlan().then((p) => {
          if (active) setPlan(p);
        });
      }
    });

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
  return <Account email={session.user.email ?? ''} plan={plan} />;
}
