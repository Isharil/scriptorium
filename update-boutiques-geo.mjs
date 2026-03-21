#!/usr/bin/env node
// Met à jour adresse + coordonnées des boutiques dans NocoDB depuis le fichier Excel.
// Géocode via Nominatim (OSM) les lignes sans coordonnées exactes.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const BASE_URL  = process.env.NOCODB_URL     ?? 'http://localhost:8080';
const API_TOKEN = process.env.NOCODB_TOKEN;
const BASE_ID   = process.env.NOCODB_BASE_ID;
const TABLE_ID  = 'mznghgj1ksmg1g8'; // boutiques

const HEADERS = { 'xc-token': API_TOKEN, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function norm(s) { return (s ?? '').toString().trim(); }

// ── Lecture Excel ──────────────────────────────────────────────────────────────
function parseBoutiquesFromExcel(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets['Ressources'];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });

  const boutiques = [];
  for (const row of rows.slice(2)) {
    const type = norm(row[2]).toLowerCase();
    if (type !== 'marchand/fournisseur') continue;
    const nom = norm(row[0]);
    if (!nom || nom.startsWith('—')) continue;

    const adresse   = norm(row[10]);
    const latRaw    = norm(row[11]);
    const lngRaw    = norm(row[12]);

    // Coordonnées exactes = chiffre sans ~ ni —
    const isExact = v => v && v !== '—' && !v.startsWith('~') && !isNaN(parseFloat(v));
    const lat = isExact(latRaw) ? parseFloat(latRaw) : null;
    const lng = isExact(lngRaw) ? parseFloat(lngRaw) : null;

    boutiques.push({ nom, adresse, lat, lng });
  }
  return boutiques;
}

// ── Géocodage Nominatim ────────────────────────────────────────────────────────
async function geocode(adresse) {
  if (!adresse) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(adresse)}&format=json&limit=1`;
  try {
    const res  = await fetch(url, { headers: { 'User-Agent': 'Scriptorium/1.0' } });
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {}
  return null;
}

// ── NocoDB : lire toutes les boutiques ────────────────────────────────────────
async function fetchAllBoutiques() {
  const url = `${BASE_URL}/api/v1/db/data/noco/${BASE_ID}/${TABLE_ID}?limit=500&fields=Id,nom`;
  const res  = await fetch(url, { headers: HEADERS });
  const data = await res.json();
  return data.list ?? [];
}

// ── NocoDB : mettre à jour une boutique ───────────────────────────────────────
async function updateBoutique(id, payload) {
  const res = await fetch(`${BASE_URL}/api/v1/db/data/noco/${BASE_ID}/${TABLE_ID}/${id}`, {
    method:  'PATCH',
    headers: HEADERS,
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status} — ${err}`);
  }
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Scriptorium — mise à jour géo des boutiques');
  console.log('═══════════════════════════════════════════════════════\n');

  const xlsBoutiques = parseBoutiquesFromExcel('scriptorium_ressources.xlsx');
  console.log(`Excel : ${xlsBoutiques.length} boutiques trouvées\n`);

  const dbBoutiques  = await fetchAllBoutiques();
  // Index par nom (minuscule) pour correspondance souple
  const dbByNom = new Map(dbBoutiques.map(b => [b.nom?.toLowerCase().trim(), b.Id]));

  let ok = 0, skipped = 0, errors = 0;

  for (const b of xlsBoutiques) {
    const id = dbByNom.get(b.nom.toLowerCase());
    if (!id) {
      console.warn(`  ⚠  Introuvable en DB : "${b.nom}"`);
      skipped++;
      continue;
    }

    let { lat, lng } = b;

    // Géocoder si coordonnées manquantes
    if ((lat === null || lng === null) && b.adresse) {
      process.stdout.write(`  ⏳ Géocodage : ${b.nom} …`);
      await sleep(1100); // politesse Nominatim : max 1 req/s
      const coords = await geocode(b.adresse);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
        process.stdout.write(` → ${lat.toFixed(4)}, ${lng.toFixed(4)}\n`);
      } else {
        process.stdout.write(' → échec\n');
      }
    }

    const payload = {};
    if (b.adresse) payload.adresse   = b.adresse;
    if (lat !== null) payload.latitude  = lat;
    if (lng !== null) payload.longitude = lng;

    if (Object.keys(payload).length === 0) {
      console.log(`  –  Pas de données geo : ${b.nom}`);
      skipped++;
      continue;
    }

    try {
      await updateBoutique(id, payload);
      console.log(`  ✓  ${b.nom}${lat ? ` (${lat.toFixed(4)}, ${lng.toFixed(4)})` : ''}`);
      ok++;
    } catch (err) {
      console.error(`  ✗  ${b.nom} — ${err.message}`);
      errors++;
    }

    await sleep(100);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Terminé : ${ok} mis à jour, ${skipped} ignorés, ${errors} erreurs`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => { console.error('✗ Erreur fatale :', err.message); process.exit(1); });
