const TRIAL_DAYS = 14;

type ProfileAccess = {
  is_subscriber: boolean;
  created_at: string;
};

export function isTrialActive(createdAt: string): boolean {
  const trialEnd = new Date(createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  return new Date() < trialEnd;
}

export function hasPremiumAccess(profile: ProfileAccess): boolean {
  if (profile.is_subscriber) return true;
  return isTrialActive(profile.created_at);
}

export function getTrialDaysRemaining(createdAt: string): number {
  const trialEnd = new Date(createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  const msRemaining = trialEnd.getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
}
