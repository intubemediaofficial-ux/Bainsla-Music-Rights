import { Role } from '@prisma/client';

export const PERMISSIONS = [
  'org.read',
  'org.manage',
  'members.read',
  'members.manage',
  'billing.manage',
  'catalog.read',
  'catalog.write',
  'catalog.import',
  'rights.read',
  'rights.write',
  'rights.approve',
  'documents.read',
  'documents.write',
  'documents.review',
  'templates.manage',
  'agreements.write',
  'registrations.read',
  'registrations.write',
  'disputes.read',
  'disputes.write',
  'packages.generate',
  'shares.manage',
  'audit.read',
  'data.export',
  'notifications.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ: Permission[] = [
  'org.read',
  'members.read',
  'catalog.read',
  'rights.read',
  'documents.read',
  'registrations.read',
  'disputes.read',
  'notifications.read',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [...PERMISSIONS],
  ADMIN: [...PERMISSIONS],
  RIGHTS_MANAGER: [
    ...READ,
    'catalog.write',
    'catalog.import',
    'rights.write',
    'documents.write',
    'agreements.write',
    'registrations.write',
    'disputes.write',
    'packages.generate',
    'shares.manage',
    'audit.read',
    'data.export',
  ],
  LEGAL_REVIEWER: [...READ, 'documents.review', 'templates.manage', 'agreements.write', 'packages.generate', 'audit.read'],
  CATALOG_EDITOR: [...READ, 'catalog.write', 'catalog.import', 'documents.write'],
  VIEWER: ['org.read', 'catalog.read', 'rights.read', 'documents.read', 'registrations.read', 'disputes.read', 'notifications.read'],
};

/** Read-only set granted to a platform admin during an audited break-glass window. */
export const BREAK_GLASS_PERMISSIONS: Permission[] = READ.concat(['audit.read']);

export function permissionsFor(role: Role, canApproveOwnership: boolean): Set<Permission> {
  const set = new Set<Permission>(ROLE_PERMISSIONS[role]);
  // Rights managers approve ownership only with configured authority.
  if (role === 'RIGHTS_MANAGER' && canApproveOwnership) set.add('rights.approve');
  return set;
}

export const PRIVILEGED_ROLES: Role[] = ['OWNER', 'ADMIN'];

/** Roles a given actor may assign. Only owners can create owners/admins. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === 'OWNER') return ['OWNER', 'ADMIN', 'RIGHTS_MANAGER', 'LEGAL_REVIEWER', 'CATALOG_EDITOR', 'VIEWER'];
  if (actor === 'ADMIN') return ['RIGHTS_MANAGER', 'LEGAL_REVIEWER', 'CATALOG_EDITOR', 'VIEWER'];
  return [];
}
