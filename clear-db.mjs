#!/usr/bin/env node
// Supprime toutes les lignes des tables ressources, tutoriels, boutiques

const BASE_URL  = process.env.NOCODB_URL     ?? 'http://localhost:8080';
const API_TOKEN = process.env.NOCODB_TOKEN;
const BASE_ID   = process.env.NOCODB_BASE_ID;

const HEADERS = { 'xc-token': API_TOKEN, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TABLES = [
  { name: 'ressources', id: 'm1zhtljc7u09gp3' },
  { name: 'tutoriels',  id: 'mdb6d04p0cbqv3f' },
  { name: 'boutiques',  id: 'mznghgj1ksmg1g8' },
];

async function fetchIds(tableId) {
  const ids = [];
  let offset = 0;
  while (true) {
    const url = `${BASE_URL}/api/v1/db/data/noco/${BASE_ID}/${tableId}?limit=100&offset=${offset}&fields=Id`;
    const res  = await fetch(url, { headers: HEADERS });
    const data = await res.json();
    const list = data.list ?? [];
    ids.push(...list.map(r => r.Id));
    if (list.length < 100) break;
    offset += 100;
  }
  return ids;
}

async function deleteRow(tableId, id) {
  const res = await fetch(`${BASE_URL}/api/v1/db/data/noco/${BASE_ID}/${tableId}/${id}`, {
    method: 'DELETE',
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function clearTable({ name, id }) {
  console.log(`\n── ${name} ──────────────────────────────────`);
  const ids = await fetchIds(id);
  if (ids.length === 0) { console.log('  (déjà vide)'); return; }
  console.log(`  ${ids.length} ligne(s) à supprimer…`);
  let ok = 0;
  for (const rowId of ids) {
    try {
      await deleteRow(id, rowId);
      ok++;
    } catch (e) {
      console.error(`  ✗ id ${rowId} — ${e.message}`);
    }
    await sleep(50);
  }
  console.log(`  ✓ ${ok}/${ids.length} supprimées`);
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Scriptorium — nettoyage des tables');
  console.log('═══════════════════════════════════════════════');
  for (const table of TABLES) await clearTable(table);
  console.log('\n✓ Tables vidées — prêt pour le nouvel import');
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
