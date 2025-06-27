export interface UserSession {
  sessionId: string;
  whatsappId: string;
  phoneNumber: string;
  flashUserId?: string;
  flashAuthToken?: string;
  isVerified: boolean;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  mfaVerified: boolean;
  mfaExpiresAt?: Date;
  consentGiven: boolean;
  consentTimestamp?: Date;
  profileName?: string;
  metadata?: Record<string, any>;
}
