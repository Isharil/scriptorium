#!/usr/bin/env node
// Crée la table "groupes" dans NocoDB avec tous ses champs.
// Usage : node --env-file=site/.env add-groupes-table.mjs

const BASE_URL  = process.env.NOCODB_URL     ?? 'http://localhost:8080';
const API_TOKEN = process.env.NOCODB_TOKEN;
const BASE_ID   = process.env.NOCODB_BASE_ID;

const HEADERS = { 'xc-token': API_TOKEN, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  console.log('Création de la table groupes…\n');

  // 1. Créer la table
  const table = await api('POST', `/api/v1/db/meta/projects/${BASE_ID}/tables`, {
    title: 'groupes',
    columns: [
      { title: 'nom',           uidt: 'SingleLineText' },
      { title: 'type',          uidt: 'SingleSelect',
        colOptions: { options: [
          { title: 'troupe_reconstitution' },
          { title: 'musique'               },
          { title: 'theatre_spectacle'     },
          { title: 'confrerie'             },
          { title: 'association'           },
        ]}},
      { title: 'description',   uidt: 'LongText'       },
      { title: 'periodes',      uidt: 'MultiSelect',
        colOptions: { options: [
          { title: 'tout_MA'     },
          { title: 'haut_MA'    },
          { title: 'Xe_XIe'     },
          { title: 'XIIe_XIIIe' },
          { title: 'XIVe'       },
          { title: 'XVe'        },
        ]}},
      { title: 'regions',       uidt: 'MultiSelect',
        colOptions: { options: [
          { title: 'france'       },
          { title: 'empire'       },
          { title: 'italie'       },
          { title: 'iberique'     },
          { title: 'angleterre'   },
          { title: 'scandinavie'  },
          { title: 'byzance'      },
        ]}},
      { title: 'specialites',   uidt: 'LongText'       },
      { title: 'ville',         uidt: 'SingleLineText' },
      { title: 'pays',          uidt: 'SingleLineText' },
      { title: 'url_site',      uidt: 'URL'            },
      { title: 'url_facebook',  uidt: 'URL'            },
      { title: 'url_instagram', uidt: 'URL'            },
      { title: 'url_youtube',   uidt: 'URL'            },
      { title: 'contact',       uidt: 'SingleLineText' },
      { title: 'statut',        uidt: 'SingleSelect',
        colOptions: { options: [
          { title: 'soumis'   },
          { title: 'approuve' },
          { title: 'rejete'   },
        ]}},
      { title: 'date_soumission', uidt: 'Date' },
    ],
  });

  console.log(`✓ Table créée — ID : ${table.id}`);
  console.log('\nAjoute cet ID dans site/src/lib/nocodb.js :');
  console.log(`  groupes: '${table.id}',`);
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
