export type BricktimeConfigPublic = {
  userUuid: string | null;
  apiKeyMasked: string | null;
  apiKeyExpiresAt: string | null;
  updatedAt: string | null;
  hasApiKey: boolean;
  isExpired: boolean;
};
