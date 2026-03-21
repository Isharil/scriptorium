#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const wb   = XLSX.readFile('scriptorium_ressources.xlsx');
const ws   = wb.Sheets['Ressources'];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });

console.log('── En-têtes (ligne 2) ──');
console.log(rows[1].map((h, i) => `[${i}] ${h}`).join('\n'));

console.log('\n── Premières boutiques ──');
const boutiques = rows.slice(2).filter(r => r[2]?.toString().toLowerCase().includes('marchand'));
for (const r of boutiques.slice(0, 5)) {
  console.log(r.map((v, i) => v ? `[${i}]=${v}` : null).filter(Boolean).join('  '));
}
