export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  READ_ONLY = 'read_only',
}

export enum Permission {
  // User management
  USER_VIEW = 'user:view',
  USER_EDIT = 'user:edit',
  USER_DELETE = 'user:delete',
  
  // Session management
  SESSION_VIEW = 'session:view',
  SESSION_DELETE = 'session:delete',
  
  // WhatsApp management
  WHATSAPP_VIEW = 'whatsapp:view',
  WHATSAPP_MANAGE = 'whatsapp:manage',
  
  // Announcements
  ANNOUNCEMENT_SEND = 'announcement:send',
  ANNOUNCEMENT_SCHEDULE = 'announcement:schedule',
  
  // System
  SYSTEM_LOGS_VIEW = 'system:logs:view',
  SYSTEM_HEALTH_VIEW = 'system:health:view',
  SYSTEM_CONFIG_EDIT = 'system:config:edit',
  
  // Admin commands
  COMMAND_EXECUTE = 'command:execute',
  COMMAND_HISTORY_VIEW = 'command:history:view',
}

