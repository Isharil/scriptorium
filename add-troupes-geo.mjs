#!/usr/bin/env node
// Ajoute les champs adresse, latitude, longitude à la table troupes.
// Usage : node --env-file=site/.env add-troupes-geo.mjs

const BASE_URL  = process.env.NOCODB_URL     ?? 'http://localhost:8080';
const API_TOKEN = process.env.NOCODB_TOKEN;
const TABLE_ID  = 'myq4pxo3t8o9ax6'; // troupes

const HEADERS = { 'xc-token': API_TOKEN, 'Content-Type': 'application/json' };

async function addColumn(body) {
  const res = await fetch(`${BASE_URL}/api/v1/db/meta/tables/${TABLE_ID}/columns`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok && !JSON.stringify(data).includes('already exist')) {
    throw new Error(`HTTP ${res.status} — ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  await addColumn({ title: 'adresse',   uidt: 'SingleLineText' });
  console.log('✓ adresse');
  await addColumn({ title: 'latitude',  uidt: 'Decimal' });
  console.log('✓ latitude');
  await addColumn({ title: 'longitude', uidt: 'Decimal' });
  console.log('✓ longitude');
  console.log('\nChamps ajoutés à la table troupes.');
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
