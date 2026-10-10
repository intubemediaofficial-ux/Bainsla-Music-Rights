import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';

export const MFA_ISSUER = process.env.MFA_ISSUER ?? 'Music Rights Cloud';

export function newMfaSecret(): string {
  return generateSecret();
}

export async function mfaQr(email: string, secret: string) {
  const uri = generateURI({ issuer: MFA_ISSUER, label: email, secret });
  return { uri, qrDataUrl: await QRCode.toDataURL(uri) };
}

export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  const clean = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const res = await verify({ secret, token: clean, epochTolerance: 30 });
  return res.valid;
}
