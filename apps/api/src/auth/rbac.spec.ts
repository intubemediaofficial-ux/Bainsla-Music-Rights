import { assignableRoles, permissionsFor } from './rbac.js';

describe('rbac', () => {
  it('owner has every permission including billing and approval', () => {
    const p = permissionsFor('OWNER', false);
    expect(p.has('billing.manage')).toBe(true);
    expect(p.has('rights.approve')).toBe(true);
    expect(p.has('members.manage')).toBe(true);
  });

  it('rights manager can approve ownership only when flagged', () => {
    expect(permissionsFor('RIGHTS_MANAGER', false).has('rights.approve')).toBe(false);
    expect(permissionsFor('RIGHTS_MANAGER', true).has('rights.approve')).toBe(true);
  });

  it('viewer is read-only', () => {
    const p = permissionsFor('VIEWER', true);
    for (const perm of p) expect(perm).toMatch(/\.read$/);
    expect(p.has('rights.approve')).toBe(false);
  });

  it('catalog editor cannot approve rights or manage members', () => {
    const p = permissionsFor('CATALOG_EDITOR', true);
    expect(p.has('catalog.write')).toBe(true);
    expect(p.has('rights.approve')).toBe(false);
    expect(p.has('members.manage')).toBe(false);
  });

  it('admins cannot assign the owner role', () => {
    expect(assignableRoles('ADMIN')).not.toContain('OWNER');
    expect(assignableRoles('OWNER')).toContain('ADMIN');
    expect(assignableRoles('VIEWER')).toEqual([]);
  });
});
