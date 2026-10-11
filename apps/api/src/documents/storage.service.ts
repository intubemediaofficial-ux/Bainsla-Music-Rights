import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { config } from '../config.js';
import { key } from '../common/crypto.js';


/**
 * Private object storage. Files live outside the web root, are AES-256-GCM encrypted at rest
 * and are keyed by organization so a key can never resolve into another tenant's prefix.
 */
@Injectable()
export class StorageService {
  private root = resolve(config.storageDir);

  private path(storageKey: string) {
    if (!/^org\/[a-z0-9]+\/[a-z0-9]+$/.test(storageKey)) throw new Error('Invalid storage key');
    return join(this.root, storageKey);
  }

  async put(orgId: string, data: Buffer) {
    const storageKey = `org/${orgId}/${randomBytes(16).toString('hex').replace(/[^a-z0-9]/g, '')}`;
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key(), iv);
    const enc = Buffer.concat([c.update(data), c.final()]);
    const file = this.path(storageKey);
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, Buffer.concat([Buffer.from('MRC1'), iv, c.getAuthTag(), enc]), { mode: 0o600 });
    return { storageKey, sha256: createHash('sha256').update(data).digest('hex'), sizeBytes: data.length };
  }

  async get(orgId: string, storageKey: string): Promise<Buffer> {
    if (!storageKey.startsWith(`org/${orgId}/`)) throw new Error('Storage key does not belong to this organization');
    const raw = await readFile(this.path(storageKey));
    if (raw.subarray(0, 4).toString() !== 'MRC1') throw new Error('Unknown storage format');
    const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(4, 16));
    d.setAuthTag(raw.subarray(16, 32));
    return Buffer.concat([d.update(raw.subarray(32)), d.final()]);
  }

  /** Re-hash stored bytes and compare with the recorded checksum. */
  async verify(orgId: string, storageKey: string, sha256: string) {
    const buf = await this.get(orgId, storageKey);
    return createHash('sha256').update(buf).digest('hex') === sha256;
  }

  sign(purpose: string, id: string, ttlSeconds = 300) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = createHmac('sha256', key()).update(`${purpose}:${id}:${exp}`).digest('hex');
    return { exp, sig };
  }

  checkSignature(purpose: string, id: string, exp: number, sig: string) {
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    const want = createHmac('sha256', key()).update(`${purpose}:${id}:${exp}`).digest();
    const got = Buffer.from(String(sig), 'hex');
    return got.length === want.length && timingSafeEqual(got, want);
  }
}
