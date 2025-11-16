// Trial lifecycle logic
export interface TrialStatus {
  startTime: string;
  expiryTime: string;
  notificationsSent: boolean;
  dataRetention: 'ephemeral' | 'optedIn';
}

export function getTrialStatus(startTime: string, optedIn: boolean): TrialStatus {
  const expiryTime = new Date(new Date(startTime).getTime() + 72*60*60*1000).toISOString();
  return {
    startTime,
    expiryTime,
    notificationsSent: false,
    dataRetention: optedIn ? 'optedIn' : 'ephemeral'
  };
}
