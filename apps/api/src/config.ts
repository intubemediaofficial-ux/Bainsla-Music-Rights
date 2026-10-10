function bool(v: string | undefined, d: boolean) {
  if (v === undefined || v === '') return d;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.API_PORT ?? process.env.PORT ?? 3281),
  appUrl: process.env.APP_URL ?? 'http://localhost:3280',
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 168),
  sessionIdleHours: Number(process.env.SESSION_IDLE_HOURS ?? 24),
  enforceAdminMfa: bool(process.env.ENFORCE_ADMIN_MFA, false),
  allowSignup: bool(process.env.ALLOW_SIGNUP, true),
  /** 32-byte key (hex or base64) used to encrypt MFA secrets at rest */
  encryptionKey: process.env.APP_ENCRYPTION_KEY ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  storageDir: process.env.STORAGE_DIR ?? './storage',
  loginMaxFailures: Number(process.env.LOGIN_MAX_FAILURES ?? 8),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES ?? 15),
};

export const SESSION_COOKIE = 'mrc_session';
export const CSRF_COOKIE = 'mrc_csrf';
