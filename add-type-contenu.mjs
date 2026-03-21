#!/usr/bin/env node
// Ajoute le champ type_contenu (SingleSelect) à la table tutoriels

const BASE_URL  = process.env.NOCODB_URL     ?? 'http://localhost:8080';
const API_TOKEN = process.env.NOCODB_TOKEN;
const BASE_ID   = process.env.NOCODB_BASE_ID;
const TABLE_ID  = 'mdb6d04p0cbqv3f'; // tutoriels

const HEADERS = { 'xc-token': API_TOKEN, 'Content-Type': 'application/json' };

async function main() {
  const res = await fetch(`${BASE_URL}/api/v1/db/meta/tables/${TABLE_ID}/columns`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      title: 'type_contenu',
      uidt:  'SingleSelect',
      colOptions: {
        options: [
          { title: 'tutoriel',       color: '#d4edda' },
          { title: 'site_tutoriels', color: '#d1ecf1' },
        ],
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    // Champ déjà existant = pas grave
    if (err.includes('already exist') || res.status === 400) {
      console.log('Champ type_contenu déjà existant, rien à faire.');
      return;
    }
    throw new Error(`HTTP ${res.status} — ${err}`);
  }

  console.log('✓ Champ type_contenu ajouté à la table tutoriels.');
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
