#!/usr/bin/env node
// Nécessite : npm install xlsx  (déjà fait)

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX    = require('xlsx');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL  = process.env.NOCODB_URL     ?? 'http://localhost:8080';
const API_TOKEN = process.env.NOCODB_TOKEN;
const BASE_ID   = process.env.NOCODB_BASE_ID;

const HEADERS = {
  'xc-token': API_TOKEN,
  'Content-Type': 'application/json',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── API NocoDB ────────────────────────────────────────────────────────────────
async function getTableIds() {
  const res  = await fetch(`${BASE_URL}/api/v1/db/meta/projects/${BASE_ID}/tables`, { headers: HEADERS });
  const data = await res.json();
  const list = data.list ?? [];
  const find = name => list.find(t => t.title === name)?.id ?? null;
  return {
    ressources: find('ressources'),
    tutoriels:  find('tutoriels'),
    boutiques:  find('boutiques'),
    troupes:    find('troupes'),
  };
}

async function insert(tableId, record) {
  const res = await fetch(`${BASE_URL}/api/v1/db/data/noco/${BASE_ID}/${tableId}`, {
    method:  'POST',
    headers: HEADERS,
    body:    JSON.stringify(record),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status} — ${err}`);
  }
  return res.json();
}

// ── Mappings de normalisation ─────────────────────────────────────────────────

// Colonne "Rigueur" → niveau_fiabilite
const RIGUEUR_MAP = {
  'académique':          'academique',
  'primaire':            'source_primaire',
  'praticien documenté': 'communautaire',
  'praticien documente': 'communautaire',
  'commercial':          'communautaire',
};

// Colonne "Type" → type_source (pour ressources uniquement)
const TYPE_SOURCE_MAP = {
  'portail/agrégateur':       'autre',
  'portail/agregateur':       'autre',
  'publication académique':   'article',
  'publication academique':   'article',
  'source primaire écrite':   'manuscrit',
  'source primaire ecrite':   'manuscrit',
  'source iconographique':    'iconographie',
};

// Colonne "Aire géo" → regions (slugs NocoDB)
const REGIONS_MAP = {
  'france & domaine capétien':        'france',
  'france & domaine capetien':        'france',
  'france':                           'france',
  'italie & méditerranée':            'italie',
  'italie & mediterranee':            'italie',
  'saint-empire / espace germanique': 'empire',
  'saint-empire':                     'empire',
  'îles britanniques':                'angleterre',
  'iles britanniques':                'angleterre',
  'scandinavie':                      'scandinavie',
  'péninsule ibérique':               'iberique',
  'peninsule iberique':               'iberique',
  'byzance':                          'byzance',
  'transversal':                      null,   // pas de région unique
};

// Colonne "Période" → periodes (slugs NocoDB)
const PERIODES_MAP = {
  'transversal': 'tout_MA',
  'haut ma':     'haut_MA',
  'xe-xie':      'Xe_XIe',
  'xe–xie':      'Xe_XIe',
  'xiie-xiiie':  'XIIe_XIIIe',
  'xiie–xiiie':  'XIIe_XIIIe',
  'xive':        'XIVe',
  'xve':         'XVe',
};

// Colonne "Thématique" → categories (slugs NocoDB) par mots-clés
const CAT_RULES = [
  { keys: ['couture','textile','tissu','vêtement','costume','broderie','teinture',
            'laine','lin','soie','chanvre','patronage','herjolfsnes','tressage',
            'maroquinerie','chaussure','mercerie','fibres','filage'],       slug: 'tenues'      },
  { keys: ['armement','arme ','épée','hallebarde','arc '],                  slug: 'armes'       },
  { keys: ['armure','maille','cotte de mail'],                              slug: 'armures'     },
  { keys: ['bijou','orfèvr','joaill','fibule','cuir'],                      slug: 'objets'      },
  { keys: ['forge','ferronnerie','métallurgie'],                            slug: 'metiers'     },
  { keys: ['gastronomie','cuisine','recette','alimentation'],               slug: 'gastronomie' },
  { keys: ['musique','instrument'],                                         slug: 'musique'     },
  { keys: ['architecture','château','construction'],                        slug: 'architecture'},
];

// Colonne "Thématique" → specialites boutique (slugs différents de categories !)
const SPECIALITES_RULES = [
  { keys: ['tissu','textile','laine','lin','soie','chanvre','couture','vêtement',
            'vetement','costume','tressage','fibres','filage'], slug: 'textiles'    },
  { keys: ['armement','arme ','épée','hallebarde'],             slug: 'armes'       },
  { keys: ['armure','maille','cotte de mail','plate'],          slug: 'armures'     },
  { keys: ['maroquinerie','cuir','chaussure','selle'],          slug: 'maroquinerie'},
  { keys: ['bijou','orfèvr','joaill','fibule','bague'],         slug: 'bijoux'      },
  { keys: ['forge','ferronnerie','métal'],                      slug: 'forge'       },
  { keys: ['mercerie','fil','aiguille','bouton'],               slug: 'mercerie'    },
  { keys: ['livre','bibliographie','publication'],              slug: 'livres'      },
];

function mapSpecialites(thema) {
  if (!norm(thema)) return 'autre';
  const text = norm(thema).toLowerCase();
  const matched = new Set();
  for (const { keys, slug } of SPECIALITES_RULES) {
    if (keys.some(k => text.includes(k))) matched.add(slug);
  }
  return matched.size ? [...matched].join(',') : 'autre';
}

// Colonne "Thématique" → domaine tutoriel par mots-clés
const DOMAINE_RULES = [
  { keys: ['broderie'],           slug: 'broderie'     },
  { keys: ['couture','costume','vêtement','patronage','herjolfsnes','tissu'], slug: 'couture' },
  { keys: ['maroquinerie','cuir','chaussure'],                              slug: 'maroquinerie'},
  { keys: ['teinture'],           slug: 'teinture'     },
  { keys: ['forge','métal'],      slug: 'forge'        },
  { keys: ['menuiserie','bois'],  slug: 'menuiserie'   },
  { keys: ['cotte de mail','maille'], slug: 'cotte_mailles'},
];

// Colonne "Langue(s)" → langues_source (slugs NocoDB)
const LANGUES_MAP = {
  fr: 'fr', en: 'en', de: 'de', it: 'it', es: 'es', la: 'la',
  nl: 'autre', multilingue: 'autre',
};

// ── Fonctions de normalisation ────────────────────────────────────────────────
function norm(s) { return (s ?? '').toString().trim(); }

function mapMulti(raw, map) {
  if (!norm(raw)) return null;
  const slugs = [...new Set(
    norm(raw).split(/[·,]+/)
      .map(s => map[s.trim().toLowerCase()] ?? null)
      .filter(Boolean)
  )];
  return slugs.length ? slugs.join(',') : null;
}

function mapCategories(raw) {
  if (!norm(raw)) return 'autre';
  const text = norm(raw).toLowerCase();
  const matched = new Set();
  for (const { keys, slug } of CAT_RULES) {
    if (keys.some(k => text.includes(k))) matched.add(slug);
  }
  return matched.size ? [...matched].join(',') : 'autre';
}

function mapDomaine(raw) {
  if (!norm(raw)) return 'autre';
  const text = norm(raw).toLowerCase();
  for (const { keys, slug } of DOMAINE_RULES) {
    if (keys.some(k => text.includes(k))) return slug;
  }
  return 'autre';
}

function mapNiveau(raw) {
  return RIGUEUR_MAP[norm(raw).toLowerCase()] ?? 'communautaire';
}

function mapStatut(raw) {
  return norm(raw).toLowerCase() === 'validé' || norm(raw).toLowerCase() === 'valide'
    ? 'approuve' : 'soumis';
}

function mapStatutTroupe(raw) {
  return norm(raw).toLowerCase() === 'validé' || norm(raw).toLowerCase() === 'valide'
    ? 'verifie' : 'soumis';
}

function mapAcces(raw) {
  return norm(raw).toLowerCase().includes('gratuit');
}

function mapTypeMedia(url) {
  const u = norm(url).toLowerCase();
  if (u.includes('youtube') || u.includes('youtu.be') || u.includes('vimeo')) return 'video';
  if (u.endsWith('.pdf')) return 'pdf';
  return 'article';
}

function mapSourcesCitees(rigueur) {
  const r = norm(rigueur).toLowerCase();
  return r === 'primaire' || r === 'académique';
}

// ── Lecture du fichier Excel ──────────────────────────────────────────────────
function parseExcel(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets['Ressources'];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });

  // Ligne 1 (index 1) = en-têtes ; lignes suivantes = données
  const ressources = [], tutoriels = [], boutiques = [], troupes = [];

  for (const row of rows.slice(2)) {
    const nom       = norm(row[0]);
    if (!nom || nom.startsWith('—')) continue;   // sauter les séparateurs de section

    const url       = norm(row[1]).split('\n')[0].trim();  // première URL seulement
    const type      = norm(row[2]);
    const periode   = norm(row[3]);
    const aireGeo   = norm(row[5]);
    const thema     = norm(row[6]);
    const langue    = norm(row[7]);
    const acces     = norm(row[8]);
    const rigueur   = norm(row[9]);
    const commentaire = norm(row[10]);
    const statut    = norm(row[11]);
    const date      = norm(row[13]) || '2025-03-21';

    const typeLC = type.toLowerCase();

    const themaLC = thema.toLowerCase();

    // ── TROUPE — prestataire (marchand/fournisseur avec thema "Prestataire ·") ──
    if (typeLC === 'marchand/fournisseur' && themaLC.startsWith('prestataire')) {
      troupes.push({
        nom:             nom,
        type:            'prestataire',
        url_site:        url,
        description:     commentaire || null,
        regions:         mapMulti(aireGeo, REGIONS_MAP),
        statut:          mapStatutTroupe(statut),
        date_soumission: date,
      });

    // ── BOUTIQUE ──────────────────────────────────────────────────────────────
    } else if (typeLC === 'marchand/fournisseur') {
      boutiques.push({
        nom:              nom,
        url_site:         url,
        description:      commentaire || null,
        specialites:      mapSpecialites(thema),
        statut:           mapStatut(statut),
        acces_libre:      mapAcces(acces),
        date_soumission:  date,
      });

    // ── TROUPE — troupe documentée ou groupe de musique ───────────────────────
    } else if ((typeLC === 'reconstitution documentée' || typeLC === 'reconstitution documentee')
            && (themaLC.startsWith('reconstitution') || themaLC.startsWith('musique médiévale') || themaLC.startsWith('musique medievale'))) {
      troupes.push({
        nom:                  nom,
        type:                 'troupe_documentee',
        url_site:             url,
        description:          commentaire || null,
        periodes_couvertes:   mapMulti(periode, PERIODES_MAP) ?? null,
        regions:              mapMulti(aireGeo, REGIONS_MAP),
        statut:               mapStatutTroupe(statut),
        date_soumission:      date,
      });

    // ── TUTORIEL ──────────────────────────────────────────────────────────────
    } else if (typeLC === 'reconstitution documentée' || typeLC === 'reconstitution documentee'
            || typeLC === 'site de tutoriels'         || typeLC === 'site tutoriels') {
      const isSite = typeLC.includes('site');
      tutoriels.push({
        titre:           nom,
        url:             url,
        type_media:      mapTypeMedia(url),
        type_contenu:    isSite ? 'site_tutoriels' : 'tutoriel',
        domaine:         mapDomaine(thema),
        sources_citees:  mapSourcesCitees(rigueur),
        statut:          mapStatut(statut),
        date_soumission: date,
      });

    // ── TROUPE — annuaire de troupes (portail/agrégateur sur la reconstitution) ─
    } else if ((typeLC === 'portail/agrégateur' || typeLC === 'portail/agregateur')
            && (
              (themaLC.includes('reconstitution') && (themaLC.includes('associations') || themaLC.includes('groupes')))
              || themaLC.includes('troupes festives')
              || (themaLC.includes('troupes') && themaLC.includes('reconstitution'))
            )) {
      troupes.push({
        nom:             nom,
        type:            'annuaire',
        url_site:        url,
        description:     commentaire || null,
        regions:         mapMulti(aireGeo, REGIONS_MAP),
        statut:          mapStatutTroupe(statut),
        date_soumission: date,
      });

    // ── RESSOURCE (portail, publication, source primaire, iconographie) ────────
    } else {
      ressources.push({
        titre:            nom,
        url_source:       url,
        type_source:      TYPE_SOURCE_MAP[typeLC] ?? 'autre',
        niveau_fiabilite: mapNiveau(rigueur),
        certitude_historique: 'atteste',
        categories:       mapCategories(thema),
        regions:          mapMulti(aireGeo, REGIONS_MAP),
        periodes:         mapMulti(periode, PERIODES_MAP) ?? 'tout_MA',
        langues_source:   mapMulti(langue, LANGUES_MAP),
        acces_libre:      mapAcces(acces),
        description:      commentaire || null,
        statut:           mapStatut(statut),
        date_soumission:  date,
      });
    }
  }

  return { ressources, tutoriels, boutiques, troupes };
}

// ── Import ────────────────────────────────────────────────────────────────────
async function importTable(tableId, tableName, records) {
  console.log(`\n── ${tableName} (${records.length} entrées) ─────────────────`);
  let ok = 0, errors = 0;
  for (const r of records) {
    try {
      await insert(tableId, r);
      console.log(`  ✓  ${r.titre ?? r.nom}`);
      ok++;
    } catch (err) {
      console.error(`  ✗  ${r.titre ?? r.nom} — ${err.message}`);
      errors++;
    }
    await sleep(200);
  }
  console.log(`  → ${ok} succès, ${errors} erreurs`);
  return { ok, errors };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Scriptorium — import depuis scriptorium_ressources.xlsx');
  console.log('═══════════════════════════════════════════════════════\n');

  // Lire le Excel
  const { ressources, tutoriels, boutiques, troupes } = parseExcel('scriptorium_ressources.xlsx');
  console.log(`Parsé : ${ressources.length} ressources, ${tutoriels.length} tutoriels, ${boutiques.length} boutiques, ${troupes.length} troupes`);

  // Récupérer les IDs de tables
  const ids = await getTableIds();
  const manquantes = Object.entries(ids).filter(([, v]) => !v).map(([k]) => k);
  if (manquantes.length) {
    console.error(`✗ Tables introuvables : ${manquantes.join(', ')}`);
    process.exit(1);
  }
  console.log('Tables NocoDB trouvées ✓');

  // Import
  const r1 = await importTable(ids.ressources, 'Ressources', ressources);
  const r2 = await importTable(ids.tutoriels,  'Tutoriels',  tutoriels);
  const r3 = await importTable(ids.boutiques,  'Boutiques',  boutiques);
  const r4 = await importTable(ids.troupes,    'Troupes',    troupes);

  const total = r1.ok + r2.ok + r3.ok + r4.ok;
  const totalErr = r1.errors + r2.errors + r3.errors + r4.errors;

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Import terminé : ${total} succès, ${totalErr} erreurs`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n✗ Erreur fatale :', err.message);
  process.exit(1);
});
