import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to Argon2id (OWASP params below).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, OPTS);

export const verifyPassword = (stored: string, pw: string) => verify(stored, pw).catch(() => false);
