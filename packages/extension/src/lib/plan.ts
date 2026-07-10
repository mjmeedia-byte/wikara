import type { Plan } from '@wikara/shared';
import { supabase } from './supabase';
import { setCachedPlan } from './storage';

/**
 * Fetch the signed-in user's plan from Supabase and cache it locally.
 * Falls back to 'free' when signed out or if anything goes wrong.
 */
export async function fetchAndCachePlan(): Promise<Plan> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;

  if (!userId) {
    await setCachedPlan('free');
    return 'free';
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single();

  const plan: Plan = !error && data ? ((data.plan as Plan | null) ?? 'free') : 'free';
  await setCachedPlan(plan);
  return plan;
}
