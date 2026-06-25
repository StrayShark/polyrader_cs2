import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type AuditStatus = 'pass' | 'fail' | 'partial' | 'exception';

export interface AuditEntry {
  page: string;
  module: string;
  theme?: string;
  status: AuditStatus;
  note?: string;
}

const REPORT_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../docs/report');

export function writeAuditReport(filename: string, entries: AuditEntry[], title: string): void {
  mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = join(REPORT_DIR, filename);
  writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));

  const pass = entries.filter((e) => e.status === 'pass').length;
  const fail = entries.filter((e) => e.status === 'fail').length;
  const partial = entries.filter((e) => e.status === 'partial').length;
  const exception = entries.filter((e) => e.status === 'exception').length;

  const rows = entries
    .map(
      (e) =>
        `<tr><td>${e.page}</td><td>${e.module}</td><td>${e.theme ?? '-'}</td><td class="${e.status}">${e.status}</td><td>${e.note ?? ''}</td></tr>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; background: #f7f7f4; color: #26251e; padding: 32px; }
    h1 { font-weight: 400; letter-spacing: -0.02em; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .pill { padding: 8px 14px; border: 1px solid #e6e5e0; border-radius: 8px; background: #fff; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e6e5e0; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #efeee8; text-align: left; font-size: 14px; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #807d72; }
    .pass { color: #1f8a65; }
    .fail { color: #cf2d56; }
    .partial { color: #c08532; }
    .exception { color: #807d72; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="summary">
    <div class="pill">Pass: ${pass}</div>
    <div class="pill">Fail: ${fail}</div>
    <div class="pill">Partial: ${partial}</div>
    <div class="pill">Exception: ${exception}</div>
  </div>
  <table>
    <thead><tr><th>Page</th><th>Module</th><th>Theme</th><th>Status</th><th>Note</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  writeFileSync(join(REPORT_DIR, filename.replace('.json', '.html')), html);
}
