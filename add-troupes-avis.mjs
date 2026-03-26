#!/usr/bin/env node
// Ajoute les tables "troupes" (enrichie) et "avis_troupes" à Scriptorium NocoDB.
// Si la table troupes existe déjà, les colonnes manquantes sont ajoutées.
// Usage : node --env-file=site/.env add-troupes-avis.mjs

const BASE_URL  = process.env.NOCODB_URL     ?? 'http://localhost:8080';
const API_TOKEN = process.env.NOCODB_TOKEN;
const BASE_ID   = process.env.NOCODB_BASE_ID;

const HEADERS = { 'xc-token': API_TOKEN, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Helpers ────────────────────────────────────────────────────────────────────
async function apiGet(path) {
  const res  = await fetch(`${BASE_URL}${path}`, { headers: HEADERS });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${JSON.stringify(data)}`);
  return data;
}

async function apiPost(path, body) {
  const res  = await fetch(`${BASE_URL}${path}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${JSON.stringify(data)}`);
  return data;
}

function isAlreadyExists(msg) {
  return ['already', 'duplicate', 'Duplicate', 'existe'].some(s => msg.includes(s));
}

async function getTableId(name) {
  const data = await apiGet(`/api/v1/db/meta/projects/${BASE_ID}/tables`);
  return (data.list ?? data ?? []).find(t => t.title === name)?.id ?? null;
}

// ── IDs collectés au fil de l'exécution ───────────────────────────────────────
const TABLE_IDS = {};

// ── Créer une table (ou récupérer l'ID si elle existe) ───────────────────────
async function createTable(name, columns) {
  try {
    const result = await apiPost(`/api/v1/db/meta/projects/${BASE_ID}/tables`, { title: name, columns });
    TABLE_IDS[name] = result.id;
    console.log(`✓  Table "${name}" créée (id: ${result.id})`);
  } catch (err) {
    if (isAlreadyExists(err.message ?? '')) {
      const id = await getTableId(name);
      if (id) TABLE_IDS[name] = id;
      console.log(`⚠  Table "${name}" existe déjà — id récupéré: ${id ?? '?'}`);
    } else {
      console.error(`✗  Table "${name}" — ${err.message}`);
      throw err;
    }
  }
  await sleep(500);
}

// ── Ajouter une colonne (ignore si elle existe déjà) ─────────────────────────
async function addColumn(tableName, colDef) {
  const tableId = TABLE_IDS[tableName];
  if (!tableId) { console.warn(`  ⚠  Colonne ignorée — table "${tableName}" introuvable`); return; }
  try {
    await apiPost(`/api/v1/db/meta/tables/${tableId}/columns`, colDef);
    console.log(`  ✓ "${colDef.title}" ajouté`);
  } catch (err) {
    if (isAlreadyExists(err.message ?? '')) {
      console.log(`  –  "${colDef.title}" existe déjà`);
    } else {
      console.warn(`  ✗ "${colDef.title}" — ${err.message}`);
    }
  }
  await sleep(300);
}

// ── Ajouter un lien entre tables ──────────────────────────────────────────────
async function addLink(tableName, colDef) {
  const tableId = TABLE_IDS[tableName];
  if (!tableId) { console.warn(`  ⚠  Lien "${colDef.title}" ignoré — table "${tableName}" introuvable`); return; }
  try {
    await apiPost(`/api/v1/db/meta/tables/${tableId}/columns`, colDef);
    console.log(`  ↳  Lien "${colDef.title}" ajouté à "${tableName}"`);
  } catch (err) {
    console.warn(`  ⚠  Lien "${colDef.title}" sur "${tableName}" — ${err.message}`);
  }
  await sleep(300);
}

// ── Point d'entrée ─────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Scriptorium — tables troupes (enrichie) + avis_troupes');
  console.log(`  Base : ${BASE_ID}  ·  Serveur : ${BASE_URL}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── Phase 0 : récupérer les IDs des tables existantes ────────────────────
  console.log('── Phase 0 : tables existantes ─────────────────────────────────\n');
  for (const name of ['membres', 'ressources']) {
    const id = await getTableId(name);
    if (id) { TABLE_IDS[name] = id; console.log(`✓  "${name}" trouvé (id: ${id})`); }
    else    { console.warn(`⚠  "${name}" introuvable — certains liens seront ignorés`); }
  }

  // ── Phase 1 : créer les tables ────────────────────────────────────────────
  console.log('\n── Phase 1 : création des tables ───────────────────────────────\n');

  // Colonnes de base (toujours présentes)
  await createTable('troupes', [
    { title: 'nom',                uidt: 'SingleLineText', rqd: true },
    { title: 'type',               uidt: 'MultiSelect',
      dtxp: "'annuaire','troupe_documentee','prestataire'" },
    { title: 'description',        uidt: 'LongText' },
    { title: 'url_site',           uidt: 'URL' },
    { title: 'url_reseaux',        uidt: 'LongText' },
    { title: 'periodes_couvertes', uidt: 'MultiSelect',
      dtxp: "'haut_MA','Xe_XIe','XIIe_XIIIe','XIVe','XVe','tout_MA'" },
    { title: 'regions',            uidt: 'MultiSelect',
      dtxp: "'france','angleterre','italie','empire','iberique','byzance','scandinavie','autres'" },
    { title: 'langues',            uidt: 'MultiSelect',
      dtxp: "'fr','en','de','it','es','autre'" },
    { title: 'statut',             uidt: 'SingleSelect', cdf: 'soumis',
      dtxp: "'soumis','verifie','signale','inactif'" },
    { title: 'date_soumission',    uidt: 'Date' },
    // Bloc documentaire
    { title: 'niveau_rigueur',         uidt: 'SingleSelect',
      dtxp: "'source_primaire','academique','communautaire','experience'" },
    { title: 'description_recherche',  uidt: 'LongText' },
    // Bloc prestataire
    { title: 'types_prestations',  uidt: 'MultiSelect',
      dtxp: "'campement_civil','campement_militaire','combat_choreographie','combat_sportif','musique_historique','jonglerie','cuisine_historique','artisanat_demonstration','equestre','conference','atelier_pedagogique'" },
    { title: 'types_public',       uidt: 'MultiSelect',
      dtxp: "'grand_public','scolaires','reconstituteurs','touristes','evenement_prive'" },
    { title: 'taille_groupe',      uidt: 'SingleSelect',
      dtxp: "'solo_duo','petit_groupe','troupe','grande_compagnie'" },
    { title: 'tarification',       uidt: 'SingleSelect',
      dtxp: "'association','sur_devis','tarif_fixe'" },
    { title: 'deplacement_national',      uidt: 'Checkbox', cdf: 'false' },
    { title: 'deplacement_international', uidt: 'Checkbox', cdf: 'false' },
    { title: 'zone_intervention',  uidt: 'SingleLineText' },
    { title: 'contact_prestation', uidt: 'SingleLineText' },
    { title: 'langues_prestation', uidt: 'MultiSelect',
      dtxp: "'fr','en','de','it','es','autre'" },
  ]);

  await createTable('avis_troupes', [
    { title: 'note',        uidt: 'Number', rqd: true },
    { title: 'commentaire', uidt: 'LongText' },
    { title: 'contexte',    uidt: 'SingleSelect',
      dtxp: "'animation','collaboration_recherche','stage','autre'" },
    { title: 'date_avis',   uidt: 'Date' },
  ]);

  // ── Phase 1b : colonnes manquantes si troupes existait déjà ──────────────
  console.log('\n── Phase 1b : colonnes supplémentaires sur troupes ─────────────\n');
  const missingTroupesCols = [
    { title: 'url_reseaux',               uidt: 'LongText' },
    { title: 'periodes_couvertes',        uidt: 'MultiSelect',
      dtxp: "'haut_MA','Xe_XIe','XIIe_XIIIe','XIVe','XVe','tout_MA'" },
    { title: 'langues',                   uidt: 'MultiSelect',
      dtxp: "'fr','en','de','it','es','autre'" },
    { title: 'niveau_rigueur',            uidt: 'SingleSelect',
      dtxp: "'source_primaire','academique','communautaire','experience'" },
    { title: 'description_recherche',     uidt: 'LongText' },
    { title: 'types_prestations',         uidt: 'MultiSelect',
      dtxp: "'campement_civil','campement_militaire','combat_choreographie','combat_sportif','musique_historique','jonglerie','cuisine_historique','artisanat_demonstration','equestre','conference','atelier_pedagogique'" },
    { title: 'types_public',              uidt: 'MultiSelect',
      dtxp: "'grand_public','scolaires','reconstituteurs','touristes','evenement_prive'" },
    { title: 'taille_groupe',             uidt: 'SingleSelect',
      dtxp: "'solo_duo','petit_groupe','troupe','grande_compagnie'" },
    { title: 'tarification',              uidt: 'SingleSelect',
      dtxp: "'association','sur_devis','tarif_fixe'" },
    { title: 'deplacement_national',      uidt: 'Checkbox', cdf: 'false' },
    { title: 'deplacement_international', uidt: 'Checkbox', cdf: 'false' },
    { title: 'zone_intervention',         uidt: 'SingleLineText' },
    { title: 'contact_prestation',        uidt: 'SingleLineText' },
    { title: 'langues_prestation',        uidt: 'MultiSelect',
      dtxp: "'fr','en','de','it','es','autre'" },
  ];
  for (const col of missingTroupesCols) {
    await addColumn('troupes', col);
  }

  // ── Phase 2 : relations ───────────────────────────────────────────────────
  console.log('\n── Phase 2 : ajout des relations ───────────────────────────────\n');
  const ids = TABLE_IDS;

  const links = [
    // troupes ← membres (soumis_par)
    ids.membres && { table: 'troupes', col: {
      title: 'soumis_par', uidt: 'LinkToAnotherRecord',
      parentId: ids.membres, childId: ids.troupes, type: 'bt',
    }},
    // troupes ↔ ressources (ressources_produites, many-to-many)
    ids.ressources && { table: 'troupes', col: {
      title: 'ressources_produites', uidt: 'LinkToAnotherRecord',
      parentId: ids.troupes, childId: ids.ressources, type: 'mm',
    }},
    // avis_troupes ← troupes
    ids.troupes && { table: 'avis_troupes', col: {
      title: 'troupe', uidt: 'LinkToAnotherRecord',
      parentId: ids.troupes, childId: ids.avis_troupes, type: 'bt',
    }},
    // avis_troupes ← membres
    ids.membres && { table: 'avis_troupes', col: {
      title: 'membre', uidt: 'LinkToAnotherRecord',
      parentId: ids.membres, childId: ids.avis_troupes, type: 'bt',
    }},
  ].filter(Boolean);

  for (const { table, col } of links) {
    await addLink(table, col);
  }

  console.log('\n✓ Tables troupes et avis_troupes créées avec succès');
}

main().catch(err => {
  console.error('\n✗ Erreur fatale :', err.message);
  process.exit(1);
});
