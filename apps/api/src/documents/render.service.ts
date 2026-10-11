import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type Vars = Record<string, unknown>;

function lookup(vars: Vars, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Vars)[k] : undefined), vars);
}

/**
 * Minimal mustache: `{{var}}` (HTML-escaped), `{{{var}}}` (trusted, server-built HTML only),
 * `{{#list}}…{{/list}}` loops over arrays. Unknown variables render as a visible blank line.
 */
export function renderTemplate(body: string, vars: Vars): string {
  const sections = body.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k: string, inner: string) => {
    const v = lookup(vars, k);
    if (Array.isArray(v)) return v.map((item, i) => renderTemplate(inner, { ...vars, ...(item as Vars), index: i + 1 })).join('');
    return v ? renderTemplate(inner, vars) : '';
  });
  return sections
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k: string) => String(lookup(vars, k) ?? ''))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => {
      const v = lookup(vars, k);
      return v === undefined || v === null || v === '' ? '<span class="blank">________________</span>' : esc(v);
    });
}

export function templateVariables(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\{\{\{?\s*[#/]?([\w.]+)\s*\}?\}\}/g)) out.add(m[1]);
  return [...out];
}

const FONT_DIR = [resolve(process.cwd(), 'assets/fonts'), resolve(process.cwd(), 'apps/api/assets/fonts')].find((d) => existsSync(d)) ?? resolve('assets/fonts');
const fontCache = new Map<string, string>();
// Inline as data: URIs — Chromium blocks file:// fonts from setContent (about:blank) pages, which made Hindi render as tofu.
const font = (f: string) => {
  let uri = fontCache.get(f);
  if (!uri) {
    const file = resolve(FONT_DIR, f);
    uri = existsSync(file) ? `data:font/ttf;base64,${readFileSync(file).toString('base64')}` : pathToFileURL(file).href;
    fontCache.set(f, uri);
  }
  return uri;
};

export function page(title: string, content: string, opts: { watermark?: string } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@font-face{font-family:Doc;src:url('${font('NotoSans-Regular.ttf')}');font-weight:400}
@font-face{font-family:Doc;src:url('${font('NotoSans-Bold.ttf')}');font-weight:700}
@font-face{font-family:DocHi;src:url('${font('NotoSansDevanagari-Regular.ttf')}');font-weight:400}
@font-face{font-family:DocHi;src:url('${font('NotoSansDevanagari-Bold.ttf')}');font-weight:700}
@page{size:A4;margin:18mm 16mm 20mm}
body{font-family:Doc,DocHi,sans-serif;font-size:11pt;line-height:1.55;color:#111}
h1{font-size:16pt;text-align:center;margin:0 0 4mm}h2{font-size:12.5pt;margin:6mm 0 2mm}
table{width:100%;border-collapse:collapse;font-size:9.5pt;page-break-inside:auto}tr{page-break-inside:avoid}
th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1f1f1}
thead{display:table-header-group}.blank{color:#888}.sig{margin-top:14mm;display:flex;gap:12mm;flex-wrap:wrap}
.sig div{flex:1;min-width:60mm;border-top:1px solid #333;padding-top:2mm;font-size:10pt}
.notice{border:1px solid #c77;background:#fff6f6;color:#933;padding:2mm 3mm;font-size:8.5pt;margin-bottom:5mm}
.wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:54pt;color:rgba(200,0,0,.08);transform:rotate(-30deg);z-index:-1}
.pb{page-break-before:always}
</style></head><body>${opts.watermark ? `<div class="wm">${esc(opts.watermark)}</div>` : ''}${content}</body></html>`;
}

/** HTML → PDF via headless Chromium (needed for correct Devanagari shaping). */
@Injectable()
export class RenderService {
  private log = new Logger('RenderService');

  executable() {
    return process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  }

  async pdf(html: string, footer = ''): Promise<Buffer> {
    const exe = this.executable();
    if (!exe) throw new ServiceUnavailableException('PDF renderer is not configured (set CHROME_PATH).');
    const { default: puppeteer } = await import('puppeteer-core');
    const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] });
    try {
      const p = await browser.newPage();
      await p.setJavaScriptEnabled(false);
      await p.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      await p.evaluateHandle('document.fonts.ready').catch(() => undefined);
      const out = await p.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="font-size:7pt;width:100%;padding:0 16mm;color:#666;display:flex;justify-content:space-between"><span>${esc(footer)}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
      });
      return Buffer.from(out);
    } catch (e) {
      this.log.error(e);
      throw e;
    } finally {
      await browser.close();
    }
  }
}
