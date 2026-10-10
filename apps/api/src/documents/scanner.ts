import { connect } from 'node:net';

export type ScanResult = { status: 'CLEAN' | 'INFECTED' | 'SKIPPED' | 'FAILED'; detail?: string };

export const ALLOWED_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/** Detect the real type from magic bytes; the client-supplied mime/extension is never trusted. */
export function sniff(buf: Buffer): string | null {
  const h = buf.subarray(0, 16);
  if (h.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  if (h[0] === 0x89 && h.subarray(1, 4).toString() === 'PNG') return 'png';
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'jpg';
  if (h.subarray(0, 4).toString() === 'RIFF' && h.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (h.subarray(0, 4).toString() === 'RIFF' && h.subarray(8, 12).toString() === 'WAVE') return 'wav';
  if (h.subarray(0, 3).toString() === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0)) return 'mp3';
  if (h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04) {
    const s = buf.subarray(0, Math.min(buf.length, 4096)).toString('latin1');
    if (s.includes('word/')) return 'docx';
    if (s.includes('xl/')) return 'xlsx';
    return null;
  }
  const sample = buf.subarray(0, Math.min(buf.length, 2048));
  if (sample.length && !sample.includes(0) && !/^\s*(<|#!|MZ)/.test(sample.toString('utf8'))) return 'txt';
  return null;
}

/** Stream to clamd (INSTREAM) when CLAMD_HOST is configured; otherwise mark SKIPPED, never CLEAN. */
export function scan(buf: Buffer): Promise<ScanResult> {
  const host = process.env.CLAMD_HOST;
  if (!host) return Promise.resolve({ status: 'SKIPPED', detail: 'No malware scanner configured' });
  const port = Number(process.env.CLAMD_PORT ?? 3310);
  return new Promise((done) => {
    const sock = connect(port, host);
    let out = '';
    const finish = (r: ScanResult) => { sock.destroy(); done(r); };
    sock.setTimeout(30_000, () => finish({ status: 'FAILED', detail: 'Scanner timeout' }));
    sock.on('error', (e) => finish({ status: 'FAILED', detail: e.message }));
    sock.on('data', (d) => (out += d.toString()));
    sock.on('end', () => finish(/OK\0?$/.test(out.trim()) ? { status: 'CLEAN' } : /FOUND/.test(out) ? { status: 'INFECTED', detail: out.trim() } : { status: 'FAILED', detail: out.trim() }));
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
  });
}
