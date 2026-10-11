import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config.js';
import { sniff } from './scanner.js';
import { renderTemplate, templateVariables } from './render.service.js';
import { StorageService } from './storage.service.js';
import { annexureRows } from './agreements.controller.js';

describe('document storage', () => {
  config.storageDir = mkdtempSync(join(tmpdir(), 'mrc-store-'));
  const s = new StorageService();

  it('encrypts, round-trips, verifies and isolates tenants', async () => {
    const data = Buffer.from('%PDF-1.4 hello');
    const put = await s.put('orga', data);
    expect(put.storageKey).toMatch(/^org\/orga\//);
    expect((await s.get('orga', put.storageKey)).equals(data)).toBe(true);
    expect(await s.verify('orga', put.storageKey, put.sha256)).toBe(true);
    expect(await s.verify('orga', put.storageKey, '0'.repeat(64))).toBe(false);
    await expect(s.get('orgb', put.storageKey)).rejects.toThrow();
    await expect(s.get('orga', 'org/orga/../../etc')).rejects.toThrow();
  });

  it('signs links with expiry', () => {
    const { exp, sig } = s.sign('dl', 'v1');
    expect(s.checkSignature('dl', 'v1', exp, sig)).toBe(true);
    expect(s.checkSignature('dl', 'v2', exp, sig)).toBe(false);
    expect(s.checkSignature('dl', 'v1', exp + 1, sig)).toBe(false);
    const old = s.sign('dl', 'v1', -10);
    expect(s.checkSignature('dl', 'v1', old.exp, old.sig)).toBe(false);
  });
});

describe('file sniffing', () => {
  it('detects real types from magic bytes', () => {
    expect(sniff(Buffer.from('%PDF-1.7'))).toBe('pdf');
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('png');
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniff(Buffer.from('MZ\x90\x00\x03'))).toBeNull();
  });
});

describe('template rendering', () => {
  it('escapes variables, supports sections and trusted html', () => {
    const out = renderTemplate('<h1>{{a.title}}</h1>{{#parties}}<p>{{name}}</p>{{/parties}}{{{table}}}', {
      a: { title: '<b>गीत</b>' }, parties: [{ name: 'राम' }, { name: 'O\'Neil & Co' }], table: '<table></table>',
    });
    expect(out).toContain('&lt;b&gt;गीत&lt;/b&gt;');
    expect(out).toContain('<p>राम</p>');
    expect(out).toContain('&amp; Co');
    expect(out).toContain('<table></table>');
    expect(templateVariables('{{a.title}} {{#parties}}{{name}}{{/parties}} {{{table}}}')).toEqual(expect.arrayContaining(['a.title', 'parties', 'table']));
  });

  it('builds ordered annexure rows', () => {
    const rows = annexureRows({ assets: [
      { sortOrder: 0, work: { id: 'w', title: 'A', iswc: null }, recording: null },
      { sortOrder: 1, work: null, recording: { id: 'r', title: 'B', isrc: 'INZ9Z2400001', durationSec: 185 } },
    ] } as never);
    expect(rows.map((r) => [r.no, r.kind, r.title, r.code])).toEqual([[1, 'Work', 'A', ''], [2, 'Recording', 'B', 'INZ9Z2400001']]);
    expect(rows[1].duration).toBe('3:05');
  });
});

describe('pdf page fonts', () => {
  it('inlines Noto fonts as data URIs so Chromium can load them from setContent', async () => {
    const { page } = await import('./render.service.js');
    const html = page('t', '<p>नमस्ते</p>');
    expect(html).toContain("font-family:DocHi;src:url('data:font/ttf;base64,");
    expect(html).not.toContain('file://');
  });
});

