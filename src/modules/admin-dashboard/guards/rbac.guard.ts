import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RBACService, Permission } from '../services/rbac.service';
import { SecurityEventService, SecurityEventType } from '../services/security-event.service';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PERMISSION_LOGIC_KEY = 'permission_logic';
export const PermissionLogic = (logic: 'AND' | 'OR') =>
  SetMetadata(PERMISSION_LOGIC_KEY, logic);

@Injectable()
export class RBACGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbacService: RBACService,
    private securityEventService: SecurityEventService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permissions from metadata
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Get permission logic (default to AND)
    const logic = this.reflector.getAllAndOverride<'AND' | 'OR'>(
      PERMISSION_LOGIC_KEY,
      [context.getHandler(), context.getClass()],
    ) || 'AND';

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // No user = no access
    if (!user) {
      await this.logDeniedAccess(context, 'No user');
      throw new ForbiddenException('Authentication required');
    }

    // Check permissions
    const hasAccess = this.checkPermissions(
      user.role,
      user.permissions || [],
      requiredPermissions,
      logic,
    );

    if (!hasAccess) {
      await this.logDeniedAccess(context, 'Insufficient permissions', user);
      throw new ForbiddenException(
        `Required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }

  private checkPermissions(
    userRole: string,
    userPermissions: Permission[],
    requiredPermissions: Permission[],
    logic: 'AND' | 'OR',
  ): boolean {
    // Super admin always has access
    if (userRole === 'super_admin') {
      return true;
    }

    // Use RBAC service to check role permissions
    const rolePermissions = this.rbacService.getPermissionsForRole(userRole as any);
    const allUserPermissions = new Set([...userPermissions, ...rolePermissions]);

    if (logic === 'AND') {
      return requiredPermissions.every(permission => allUserPermissions.has(permission));
    } else {
      return requiredPermissions.some(permission => allUserPermissions.has(permission));
    }
  }

  private async logDeniedAccess(
    context: ExecutionContext,
    reason: string,
    user?: any,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();
    const controller = context.getClass();

    await this.securityEventService.logEvent({
      type: SecurityEventType.PERMISSION_DENIED,
      userId: user?.userId,
      sessionId: user?.sessionId,
      ipAddress: request.ip || 'unknown',
      userAgent: request.headers['user-agent'],
      details: {
        reason,
        controller: controller.name,
        handler: handler.name,
        method: request.method,
        path: request.path,
        requiredPermissions: this.reflector.getAllAndOverride<Permission[]>(
          PERMISSIONS_KEY,
          [handler, controller],
        ),
        userRole: user?.role,
        userPermissions: user?.permissions,
      },
    });
  }
}