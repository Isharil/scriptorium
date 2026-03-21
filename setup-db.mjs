#!/usr/bin/env node

// ── Configuration ─────────────────────────────────────────────────────────────
const BASE_URL  = process.env.NOCODB_URL    ?? 'http://localhost:8080';
const API_TOKEN = process.env.NOCODB_TOKEN;
const BASE_ID   = process.env.NOCODB_BASE_ID;

const HEADERS = {
  'xc-token': API_TOKEN,
  'Content-Type': 'application/json',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiPost(path, body) {
  const res  = await fetch(`${BASE_URL}${path}`, {
    method:  'POST',
    headers: HEADERS,
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${typeof data === 'object' ? JSON.stringify(data) : data}`);
  return data;
}

async function apiGet(path) {
  const res  = await fetch(`${BASE_URL}${path}`, { headers: HEADERS });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${typeof data === 'object' ? JSON.stringify(data) : data}`);
  return data;
}

// Récupère l'ID d'une table existante par son nom
async function fetchTableId(name) {
  const data = await apiGet(`/api/v1/db/meta/projects/${BASE_ID}/tables`);
  const list  = data.list ?? data ?? [];
  const found = list.find((t) => t.title === name);
  return found?.id ?? null;
}

// ── IDs retenus après création (nécessaires pour les relations) ───────────────
const TABLE_IDS = {};

// ── Phase 1 : créer une table avec ses colonnes de base ───────────────────────
async function createTable(name, columns) {
  try {
    const result = await apiPost(`/api/v1/db/meta/projects/${BASE_ID}/tables`, {
      title: name,
      columns,
    });
    TABLE_IDS[name] = result.id;
    console.log(`✓  Table "${name}" créée (id: ${result.id})`);
  } catch (err) {
    const msg = err.message ?? '';
    const alreadyExists =
      msg.includes('already exist') ||
      msg.includes('duplicate') ||
      msg.includes('existe') ||
      msg.includes('Duplicate');

    if (alreadyExists) {
      const existingId = await fetchTableId(name);
      if (existingId) TABLE_IDS[name] = existingId;
      console.log(`⚠   Table "${name}" existe déjà — id récupéré: ${existingId ?? '?'}`);
    } else {
      console.error(`✗  Table "${name}" — ${err.message}`);
      throw err;
    }
  }
  await sleep(500);
}

// ── Phase 2 : ajouter une colonne de lien ─────────────────────────────────────
async function addLinkColumn(tableName, colDef) {
  const tableId = TABLE_IDS[tableName];
  if (!tableId) {
    console.warn(`  ⚠   Lien "${colDef.title}" ignoré — table "${tableName}" introuvable`);
    return;
  }
  try {
    await apiPost(`/api/v1/db/meta/tables/${tableId}/columns`, colDef);
    console.log(`  ↳  Lien "${colDef.title}" ajouté à "${tableName}"`);
  } catch (err) {
    console.warn(`  ⚠   Lien "${colDef.title}" sur "${tableName}" — ${err.message}`);
  }
  await sleep(300);
}

// ── Définitions des tables (colonnes sans liens) ──────────────────────────────
const TABLES = [
  // ── membres ────────────────────────────────────────────────────────────────
  {
    name: 'membres',
    columns: [
      { title: 'pseudo',               uidt: 'SingleLineText', rqd: true },
      { title: 'discourse_username',   uidt: 'SingleLineText' },
      { title: 'profil_type',          uidt: 'SingleSelect',
        dtxp: "'reconstituteur','médiéviste','artisan','curieux'" },
      { title: 'titre_communaute',     uidt: 'SingleSelect',
        dtxp: "'enlumineur','clerc','maitre_atelier','maitre_guilde','medieviste_verifie'" },
      { title: 'points_reputation',    uidt: 'Number',   cdf: '0' },
      { title: 'nb_soumissions',       uidt: 'Number',   cdf: '0' },
      { title: 'nb_validations',       uidt: 'Number',   cdf: '0' },
      { title: 'medieviste_verifie',   uidt: 'Checkbox', cdf: 'false' },
      { title: 'affiliation',          uidt: 'SingleLineText' },
      { title: 'date_inscription',     uidt: 'Date' },
      { title: 'derniere_activite',    uidt: 'Date' },
    ],
  },

  // ── ressources ─────────────────────────────────────────────────────────────
  {
    name: 'ressources',
    columns: [
      { title: 'titre',               uidt: 'SingleLineText', rqd: true },
      { title: 'description',         uidt: 'LongText' },
      { title: 'url_source',          uidt: 'URL',           rqd: true },
      { title: 'niveau_fiabilite',    uidt: 'SingleSelect',  rqd: true,
        dtxp: "'source_primaire','academique','communautaire','experience'" },
      { title: 'type_source',         uidt: 'SingleSelect',
        dtxp: "'manuscrit','archeologie','iconographie','traite','article','tutoriel','video','patron','autre'" },
      { title: 'statut',              uidt: 'SingleSelect',  cdf: 'soumis',
        dtxp: "'soumis','en_revision','approuve','conteste','archive','refuse'" },
      { title: 'certitude_historique',uidt: 'SingleSelect',
        dtxp: "'atteste','probable','hypothese','experimental'" },
      { title: 'categories',          uidt: 'MultiSelect',
        dtxp: "'tenues','armes','armures','objets','metiers','gastronomie','musique','architecture','autre'" },
      { title: 'periodes',            uidt: 'MultiSelect',
        dtxp: "'haut_MA','Xe_XIe','XIIe_XIIIe','XIVe','XVe','tout_MA'" },
      { title: 'regions',             uidt: 'MultiSelect',
        dtxp: "'france','angleterre','italie','empire','iberique','byzance','scandinavie','autres'" },
      { title: 'langues_source',      uidt: 'MultiSelect',
        dtxp: "'fr','en','de','it','es','la','autre'" },
      { title: 'auteur_source',       uidt: 'SingleLineText' },
      { title: 'date_source',         uidt: 'SingleLineText' },
      { title: 'cote_reference',      uidt: 'SingleLineText' },
      { title: 'url_numerisation',    uidt: 'URL' },
      { title: 'acces_libre',         uidt: 'Checkbox', cdf: 'true' },
      { title: 'note_validateur',     uidt: 'LongText' },
      { title: 'date_soumission',     uidt: 'Date' },
      { title: 'date_validation',     uidt: 'Date' },
      { title: 'date_revision',       uidt: 'Date' },
      { title: 'score_communaute',    uidt: 'Number',   cdf: '0' },
      { title: 'nb_vues',             uidt: 'Number',   cdf: '0' },
      { title: 'en_contestation',     uidt: 'Checkbox', cdf: 'false' },
      { title: 'discourse_thread_id', uidt: 'SingleLineText' },
      { title: 'tags_libres',         uidt: 'LongText' },
    ],
  },

  // ── tutoriels ──────────────────────────────────────────────────────────────
  {
    name: 'tutoriels',
    columns: [
      { title: 'titre',          uidt: 'SingleLineText', rqd: true },
      { title: 'url',            uidt: 'URL',            rqd: true },
      { title: 'type_media',     uidt: 'SingleSelect',
        dtxp: "'video','article','pdf','image_serie'" },
      { title: 'difficulte',     uidt: 'SingleSelect',
        dtxp: "'debutant','intermediaire','avance','expert'" },
      { title: 'domaine',        uidt: 'SingleSelect',
        dtxp: "'couture','cotte_mailles','forge','teinture','broderie','maroquinerie','menuiserie','autre'" },
      { title: 'sources_citees', uidt: 'Checkbox',    cdf: 'false' },
      { title: 'materiaux',      uidt: 'MultiSelect',
        dtxp: "'laine','lin','soie','cuir','metal','bois','autre'" },
      { title: 'statut',         uidt: 'SingleSelect', cdf: 'soumis',
        dtxp: "'soumis','approuve','archive'" },
      { title: 'date_soumission',uidt: 'Date' },
    ],
  },

  // ── boutiques ──────────────────────────────────────────────────────────────
  {
    name: 'boutiques',
    columns: [
      { title: 'nom',              uidt: 'SingleLineText', rqd: true },
      { title: 'url_site',         uidt: 'URL',            rqd: true },
      { title: 'description',      uidt: 'LongText' },
      { title: 'specialites',      uidt: 'MultiSelect',
        dtxp: "'textiles','armes','armures','maroquinerie','bijoux','forge','mercerie','livres','autre'" },
      { title: 'type',             uidt: 'SingleSelect',
        dtxp: "'boutique_en_ligne','atelier_physique','les_deux','marche_uniquement'" },
      { title: 'pays',             uidt: 'SingleLineText' },
      { title: 'ville',            uidt: 'SingleLineText' },
      { title: 'latitude',         uidt: 'Decimal' },
      { title: 'longitude',        uidt: 'Decimal' },
      { title: 'note_moyenne',     uidt: 'Decimal' },
      { title: 'lien_verifie',     uidt: 'Checkbox', cdf: 'false' },
      { title: 'livraison_europe', uidt: 'Checkbox', cdf: 'false' },
      { title: 'statut',           uidt: 'SingleSelect', cdf: 'soumis',
        dtxp: "'soumis','approuve','signale','ferme'" },
      { title: 'date_soumission',  uidt: 'Date' },
    ],
  },

  // ── avis_boutiques ─────────────────────────────────────────────────────────
  {
    name: 'avis_boutiques',
    columns: [
      { title: 'note',        uidt: 'Number', rqd: true },
      { title: 'commentaire', uidt: 'LongText' },
      { title: 'date_avis',   uidt: 'Date' },
    ],
  },

  // ── evenements ─────────────────────────────────────────────────────────────
  {
    name: 'evenements',
    columns: [
      { title: 'nom',         uidt: 'SingleLineText', rqd: true },
      { title: 'date_debut',  uidt: 'Date' },
      { title: 'date_fin',    uidt: 'Date' },
      { title: 'lieu',        uidt: 'SingleLineText' },
      { title: 'ville',       uidt: 'SingleLineText' },
      { title: 'pays',        uidt: 'SingleLineText' },
      { title: 'latitude',    uidt: 'Decimal' },
      { title: 'longitude',   uidt: 'Decimal' },
      { title: 'type',        uidt: 'SingleSelect',
        dtxp: "'marche','stage','tournoi','conference','festival'" },
      { title: 'url',         uidt: 'URL' },
      { title: 'description', uidt: 'LongText' },
      { title: 'statut',      uidt: 'SingleSelect', cdf: 'soumis',
        dtxp: "'soumis','approuve','passe'" },
    ],
  },

  // ── votes_ressources ───────────────────────────────────────────────────────
  {
    name: 'votes_ressources',
    columns: [
      { title: 'valeur',     uidt: 'Number', cdf: '1' },
      { title: 'date_vote',  uidt: 'Date' },
    ],
  },

  // ── journaux_projet ────────────────────────────────────────────────────────
  {
    name: 'journaux_projet',
    columns: [
      { title: 'titre',            uidt: 'SingleLineText', rqd: true },
      { title: 'description',      uidt: 'LongText' },
      { title: 'photos_urls',      uidt: 'LongText' },
      { title: 'statut',           uidt: 'SingleSelect', cdf: 'en_cours',
        dtxp: "'en_cours','termine','abandonne'" },
      { title: 'date_creation',    uidt: 'Date' },
      { title: 'date_mise_a_jour', uidt: 'Date' },
    ],
  },

  // ── soumissions_file ───────────────────────────────────────────────────────
  {
    name: 'soumissions_file',
    columns: [
      { title: 'url_soumise',      uidt: 'URL',          rqd: true },
      { title: 'statut_ia',        uidt: 'SingleSelect', cdf: 'en_attente',
        dtxp: "'en_attente','traite','erreur'" },
      { title: 'tags_proposes',    uidt: 'LongText' },
      { title: 'resume_ia',        uidt: 'LongText' },
      { title: 'niveau_propose',   uidt: 'SingleSelect',
        dtxp: "'source_primaire','academique','communautaire','experience'" },
      { title: 'date_soumission',  uidt: 'Date' },
    ],
  },

  // ── contestations ──────────────────────────────────────────────────────────
  {
    name: 'contestations',
    columns: [
      { title: 'motif',                uidt: 'LongText', rqd: true },
      { title: 'source_contestation',  uidt: 'URL' },
      { title: 'statut',               uidt: 'SingleSelect', cdf: 'ouverte',
        dtxp: "'ouverte','en_examen','resolue','rejetee'" },
      { title: 'discourse_thread_id',  uidt: 'SingleLineText' },
      { title: 'date_ouverture',       uidt: 'Date' },
      { title: 'date_resolution',      uidt: 'Date' },
    ],
  },
];

// ── Définitions des liens (créés après toutes les tables) ─────────────────────
// type 'bt' = belongs-to  (FK dans la table courante → table parent)
// type 'mm' = many-to-many (table de jonction auto-créée)
function buildLinks() {
  const ids = TABLE_IDS;
  return [
    // ── ressources ──────────────────────────────────────────────────────────
    { table: 'ressources', col: { title: 'soumis_par',        uidt: 'LinkToAnotherRecord', parentId: ids.membres,    childId: ids.ressources,    type: 'bt' } },
    { table: 'ressources', col: { title: 'valide_par',        uidt: 'LinkToAnotherRecord', parentId: ids.membres,    childId: ids.ressources,    type: 'bt' } },

    // ── tutoriels ───────────────────────────────────────────────────────────
    { table: 'tutoriels',  col: { title: 'soumis_par',        uidt: 'LinkToAnotherRecord', parentId: ids.membres,    childId: ids.tutoriels,     type: 'bt' } },
    { table: 'tutoriels',  col: { title: 'ressources_liees',  uidt: 'LinkToAnotherRecord', parentId: ids.tutoriels,  childId: ids.ressources,    type: 'mm' } },

    // ── boutiques ───────────────────────────────────────────────────────────
    { table: 'boutiques',  col: { title: 'soumis_par',        uidt: 'LinkToAnotherRecord', parentId: ids.membres,    childId: ids.boutiques,     type: 'bt' } },

    // ── avis_boutiques ──────────────────────────────────────────────────────
    { table: 'avis_boutiques', col: { title: 'boutique', uidt: 'LinkToAnotherRecord', parentId: ids.boutiques, childId: ids.avis_boutiques, type: 'bt' } },
    { table: 'avis_boutiques', col: { title: 'membre',   uidt: 'LinkToAnotherRecord', parentId: ids.membres,   childId: ids.avis_boutiques, type: 'bt' } },

    // ── evenements ──────────────────────────────────────────────────────────
    { table: 'evenements', col: { title: 'soumis_par',        uidt: 'LinkToAnotherRecord', parentId: ids.membres,    childId: ids.evenements,    type: 'bt' } },

    // ── votes_ressources ────────────────────────────────────────────────────
    { table: 'votes_ressources', col: { title: 'ressource', uidt: 'LinkToAnotherRecord', parentId: ids.ressources, childId: ids.votes_ressources, type: 'bt' } },
    { table: 'votes_ressources', col: { title: 'membre',    uidt: 'LinkToAnotherRecord', parentId: ids.membres,    childId: ids.votes_ressources, type: 'bt' } },

    // ── journaux_projet ─────────────────────────────────────────────────────
    { table: 'journaux_projet', col: { title: 'membre',          uidt: 'LinkToAnotherRecord', parentId: ids.membres,          childId: ids.journaux_projet, type: 'bt' } },
    { table: 'journaux_projet', col: { title: 'ressources_liees', uidt: 'LinkToAnotherRecord', parentId: ids.journaux_projet,  childId: ids.ressources,      type: 'mm' } },

    // ── soumissions_file ────────────────────────────────────────────────────
    { table: 'soumissions_file', col: { title: 'soumis_par', uidt: 'LinkToAnotherRecord', parentId: ids.membres, childId: ids.soumissions_file, type: 'bt' } },

    // ── contestations ───────────────────────────────────────────────────────
    { table: 'contestations', col: { title: 'ressource', uidt: 'LinkToAnotherRecord', parentId: ids.ressources, childId: ids.contestations, type: 'bt' } },
    { table: 'contestations', col: { title: 'membre',    uidt: 'LinkToAnotherRecord', parentId: ids.membres,    childId: ids.contestations, type: 'bt' } },
  ];
}

// ── Point d'entrée ────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Scriptorium — initialisation de la base NocoDB');
  console.log(`  Base : ${BASE_ID}  ·  Serveur : ${BASE_URL}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── Phase 1 : tables ──────────────────────────────────────────────────────
  console.log('── Phase 1 : création des tables ───────────────────────────────\n');
  for (const table of TABLES) {
    await createTable(table.name, table.columns);
  }

  // ── Phase 2 : relations ───────────────────────────────────────────────────
  console.log('\n── Phase 2 : ajout des relations ───────────────────────────────\n');
  for (const { table, col } of buildLinks()) {
    await addLinkColumn(table, col);
  }

  console.log('\n✓ Structure Scriptorium créée avec succès');
}

main().catch((err) => {
  console.error('\n✗ Erreur fatale :', err.message);
  process.exit(1);
});
