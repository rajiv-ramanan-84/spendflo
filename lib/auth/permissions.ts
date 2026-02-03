// Role and Permission Definitions

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  FPA_ADMIN: 'fpa_admin',
  FPA_USER: 'fpa_user',
  BUSINESS_USER: 'business_user',
  API_SYSTEM: 'api_system',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Permission format: resource.action
export const PERMISSIONS = {
  // Budget permissions
  BUDGET_CREATE: 'budget.create',
  BUDGET_READ: 'budget.read',
  BUDGET_UPDATE: 'budget.update',
  BUDGET_DELETE: 'budget.delete',

  // Request permissions
  REQUEST_CREATE: 'request.create',
  REQUEST_READ: 'request.read',
  REQUEST_APPROVE: 'request.approve',
  REQUEST_REJECT: 'request.reject',

  // Import permissions
  IMPORT_CREATE: 'import.create',
  IMPORT_READ: 'import.read',

  // Comment permissions
  COMMENT_CREATE: 'comment.create',
  COMMENT_READ: 'comment.read',
  COMMENT_UPDATE: 'comment.update',
  COMMENT_DELETE: 'comment.delete',

  // Template permissions
  TEMPLATE_CREATE: 'template.create',
  TEMPLATE_READ: 'template.read',
  TEMPLATE_UPDATE: 'template.update',
  TEMPLATE_DELETE: 'template.delete',

  // API Key permissions
  API_KEY_CREATE: 'api-key.create',
  API_KEY_READ: 'api-key.read',
  API_KEY_REVOKE: 'api-key.revoke',

  // User permissions
  USER_READ: 'user.read',
  USER_INVITE: 'user.invite',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Role-based permission mappings
export const ROLE_PERMISSIONS: Record<Role, Permission[] | '*'> = {
  [ROLES.SUPER_ADMIN]: '*', // All permissions

  [ROLES.FPA_ADMIN]: [
    PERMISSIONS.BUDGET_CREATE,
    PERMISSIONS.BUDGET_READ,
    PERMISSIONS.BUDGET_UPDATE,
    PERMISSIONS.BUDGET_DELETE,
    PERMISSIONS.REQUEST_CREATE,
    PERMISSIONS.REQUEST_READ,
    PERMISSIONS.REQUEST_APPROVE,
    PERMISSIONS.REQUEST_REJECT,
    PERMISSIONS.IMPORT_CREATE,
    PERMISSIONS.IMPORT_READ,
    PERMISSIONS.COMMENT_CREATE,
    PERMISSIONS.COMMENT_READ,
    PERMISSIONS.COMMENT_UPDATE,
    PERMISSIONS.COMMENT_DELETE,
    PERMISSIONS.TEMPLATE_CREATE,
    PERMISSIONS.TEMPLATE_READ,
    PERMISSIONS.TEMPLATE_UPDATE,
    PERMISSIONS.TEMPLATE_DELETE,
    PERMISSIONS.API_KEY_CREATE,
    PERMISSIONS.API_KEY_READ,
    PERMISSIONS.API_KEY_REVOKE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_INVITE,
  ],

  [ROLES.FPA_USER]: [
    PERMISSIONS.BUDGET_READ,
    PERMISSIONS.BUDGET_UPDATE,
    PERMISSIONS.REQUEST_READ,
    PERMISSIONS.REQUEST_APPROVE,
    PERMISSIONS.IMPORT_CREATE,
    PERMISSIONS.IMPORT_READ,
    PERMISSIONS.COMMENT_CREATE,
    PERMISSIONS.COMMENT_READ,
    PERMISSIONS.TEMPLATE_CREATE,
    PERMISSIONS.TEMPLATE_READ,
  ],

  [ROLES.BUSINESS_USER]: [
    PERMISSIONS.BUDGET_READ,
    PERMISSIONS.REQUEST_CREATE,
    PERMISSIONS.REQUEST_READ,
    PERMISSIONS.COMMENT_CREATE,
    PERMISSIONS.COMMENT_READ,
  ],

  [ROLES.API_SYSTEM]: [
    // API system permissions are defined per API key
    // Default minimal permissions
    PERMISSIONS.BUDGET_READ,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission, customPermissions?: string[]): boolean {
  // Super admin has all permissions
  if (role === ROLES.SUPER_ADMIN) {
    return true;
  }

  // Check custom permissions first (for API keys)
  if (customPermissions && customPermissions.length > 0) {
    return customPermissions.includes(permission) || customPermissions.includes('*');
  }

  // Check role-based permissions
  const rolePerms = ROLE_PERMISSIONS[role];
  if (rolePerms === '*') {
    return true;
  }

  return rolePerms.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: Role, permissions: Permission[], customPermissions?: string[]): boolean {
  return permissions.some(permission => hasPermission(role, permission, customPermissions));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: Role, permissions: Permission[], customPermissions?: string[]): boolean {
  return permissions.every(permission => hasPermission(role, permission, customPermissions));
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: Role): Permission[] {
  const rolePerms = ROLE_PERMISSIONS[role];
  if (rolePerms === '*') {
    return Object.values(PERMISSIONS);
  }
  return rolePerms;
}
