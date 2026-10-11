export const contentDisposition = (name: string) =>
  `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
export const fileName = (title: string, ext: string) => `${title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'package'}-verification.${ext}`;
