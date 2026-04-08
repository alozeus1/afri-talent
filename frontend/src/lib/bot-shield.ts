export interface BotShieldPayload {
  website: string;
  startedAt: number;
}

export function createBotShieldPayload(startedAt: number, website: string): BotShieldPayload {
  return {
    website,
    startedAt,
  };
}
