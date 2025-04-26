export interface UserContext {
  whatsappId: string;
  phoneNumber: string;
  flashUserId?: string;
  accountLinked: boolean;
  lastInteraction: Date;
  sessionId?: string;
}