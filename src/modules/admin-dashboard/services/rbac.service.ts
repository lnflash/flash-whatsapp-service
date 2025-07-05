import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

export interface RoleDefinition {
  name: string;
  description: string;
  permissions: Permission[];
  inherits?: UserRole[];
}

@Injectable()
export class RBACService {
  private roleDefinitions: Map<UserRole, RoleDefinition>;

  constructor(private readonly configService: ConfigService) {
    this.roleDefinitions = this.initializeRoles();
  }

  /**
   * Check if a role has a specific permission
   */
  hasPermission(role: UserRole, permission: Permission): boolean {
    const permissions = this.getPermissionsForRole(role);
    return permissions.includes(permission);
  }

  /**
   * Check if a user can perform an action on a resource
   */
  canAccess(
    userRole: UserRole,
    resource: string,
    action: string,
  ): boolean {
    const permission = `${resource}:${action}` as Permission;
    return this.hasPermission(userRole, permission);
  }

  /**
   * Enforce permission check - throws if not allowed
   */
  enforcePermission(
    userRole: UserRole,
    permission: Permission,
    message?: string,
  ): void {
    if (!this.hasPermission(userRole, permission)) {
      throw new ForbiddenException(
        message || `Permission denied: ${permission} required`,
      );
    }
  }

  /**
   * Get all permissions for a role (including inherited)
   */
  getPermissionsForRole(role: UserRole): Permission[] {
    const roleDefinition = this.roleDefinitions.get(role);
    if (!roleDefinition) {
      return [];
    }

    const permissions = new Set<Permission>(roleDefinition.permissions);

    // Add inherited permissions
    if (roleDefinition.inherits) {
      roleDefinition.inherits.forEach(inheritedRole => {
        const inheritedPermissions = this.getPermissionsForRole(inheritedRole);
        inheritedPermissions.forEach(p => permissions.add(p));
      });
    }

    return Array.from(permissions);
  }

  /**
   * Get role hierarchy
   */
  getRoleHierarchy(): Map<UserRole, UserRole[]> {
    const hierarchy = new Map<UserRole, UserRole[]>();

    this.roleDefinitions.forEach((definition, role) => {
      hierarchy.set(role, definition.inherits || []);
    });

    return hierarchy;
  }

  /**
   * Check if one role is higher than another
   */
  isRoleHigherOrEqual(role1: UserRole, role2: UserRole): boolean {
    if (role1 === role2) return true;

    const hierarchy = {
      [UserRole.SUPER_ADMIN]: 4,
      [UserRole.ADMIN]: 3,
      [UserRole.MODERATOR]: 2,
      [UserRole.READ_ONLY]: 1,
    };

    return (hierarchy[role1] || 0) >= (hierarchy[role2] || 0);
  }

  /**
   * Get all available roles
   */
  getAllRoles(): RoleDefinition[] {
    return Array.from(this.roleDefinitions.values());
  }

  /**
   * Create custom permission check
   */
  createPermissionCheck(
    requiredPermissions: Permission[],
    requireAll = true,
  ): (role: UserRole) => boolean {
    return (role: UserRole) => {
      const userPermissions = this.getPermissionsForRole(role);
      
      if (requireAll) {
        return requiredPermissions.every(p => userPermissions.includes(p));
      } else {
        return requiredPermissions.some(p => userPermissions.includes(p));
      }
    };
  }

  /**
   * Initialize role definitions
   */
  private initializeRoles(): Map<UserRole, RoleDefinition> {
    const roles = new Map<UserRole, RoleDefinition>();

    // Super Admin - Full access
    roles.set(UserRole.SUPER_ADMIN, {
      name: 'Super Administrator',
      description: 'Full system access with all permissions',
      permissions: Object.values(Permission),
    });

    // Admin - Most permissions except system config
    roles.set(UserRole.ADMIN, {
      name: 'Administrator',
      description: 'Administrative access with user and session management',
      permissions: [
        Permission.USER_VIEW,
        Permission.USER_EDIT,
        Permission.USER_DELETE,
        Permission.SESSION_VIEW,
        Permission.SESSION_DELETE,
        Permission.WHATSAPP_VIEW,
        Permission.WHATSAPP_MANAGE,
        Permission.ANNOUNCEMENT_SEND,
        Permission.ANNOUNCEMENT_SCHEDULE,
        Permission.SYSTEM_LOGS_VIEW,
        Permission.SYSTEM_HEALTH_VIEW,
        Permission.COMMAND_EXECUTE,
        Permission.COMMAND_HISTORY_VIEW,
      ],
    });

    // Moderator - Limited management capabilities
    roles.set(UserRole.MODERATOR, {
      name: 'Moderator',
      description: 'Moderate users and send announcements',
      permissions: [
        Permission.USER_VIEW,
        Permission.SESSION_VIEW,
        Permission.SESSION_DELETE,
        Permission.WHATSAPP_VIEW,
        Permission.ANNOUNCEMENT_SEND,
        Permission.SYSTEM_HEALTH_VIEW,
        Permission.COMMAND_HISTORY_VIEW,
      ],
    });

    // Read Only - View only access
    roles.set(UserRole.READ_ONLY, {
      name: 'Read Only',
      description: 'View-only access to dashboard',
      permissions: [
        Permission.USER_VIEW,
        Permission.SESSION_VIEW,
        Permission.WHATSAPP_VIEW,
        Permission.SYSTEM_HEALTH_VIEW,
        Permission.COMMAND_HISTORY_VIEW,
      ],
    });

    // Load custom role definitions from config if available
    const customRoles = this.configService.get<string>('CUSTOM_ROLES');
    if (customRoles) {
      try {
        const parsed = JSON.parse(customRoles);
        Object.entries(parsed).forEach(([role, definition]) => {
          roles.set(role as UserRole, definition as RoleDefinition);
        });
      } catch (error) {
        console.error('Failed to parse custom roles:', error);
      }
    }

    return roles;
  }

  /**
   * Generate permission matrix for UI
   */
  getPermissionMatrix(): Record<UserRole, Record<Permission, boolean>> {
    const matrix: Record<UserRole, Record<Permission, boolean>> = {} as any;

    Object.values(UserRole).forEach(role => {
      matrix[role] = {} as Record<Permission, boolean>;
      const rolePermissions = this.getPermissionsForRole(role);
      
      Object.values(Permission).forEach(permission => {
        matrix[role][permission] = rolePermissions.includes(permission);
      });
    });

    return matrix;
  }

  /**
   * Check multiple permissions with custom logic
   */
  checkPermissions(
    userRole: UserRole,
    checks: {
      permissions: Permission[];
      logic: 'AND' | 'OR';
    }[],
  ): boolean {
    const userPermissions = this.getPermissionsForRole(userRole);

    return checks.every(check => {
      if (check.logic === 'AND') {
        return check.permissions.every(p => userPermissions.includes(p));
      } else {
        return check.permissions.some(p => userPermissions.includes(p));
      }
    });
  }
}