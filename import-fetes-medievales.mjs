#!/usr/bin/env node
// Importe les événements à venir depuis fetes-medievales.com dans NocoDB.
// Usage : node --env-file=site/.env import-fetes-medievales.mjs

const BASE_URL  = process.env.NOCODB_URL     ?? 'http://localhost:8080';
const API_TOKEN = process.env.NOCODB_TOKEN;
const BASE_ID   = process.env.NOCODB_BASE_ID;
const TABLE_ID  = 'm72t0konedv041r'; // evenements

const HEADERS = { 'xc-token': API_TOKEN, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SOURCE = 'https://www.fetes-medievales.com';

// ── Mapping types → slugs NocoDB ──────────────────────────────────────────────
const TYPE_MAP = {
  'fête médiévale':       'marche',
  'fete medievale':       'marche',
  'marché médiéval':      'marche',
  'marche medieval':      'marche',
  'festival':             'festival',
  'fête viking':          'festival',
  'fete viking':          'festival',
  'banquet médiéval':     'festival',
  'banquet medieval':     'festival',
  'spectacle médiéval':   'festival',
  'spectacle medieval':   'festival',
  'réveillon médiéval':   'festival',
  'reveillon medieval':   'festival',
  'tournoi de combat':    'tournoi',
  'tournoi':              'tournoi',
  'jeux de rôle':         'festival',
  'jeux de role':         'festival',
  'concert':              'conference',
  'exposition':           'conference',
  'conférence':           'conference',
  'conference':           'conference',
  'autres animations':    'festival',
  'stage':                'stage',
  'atelier':              'stage',
};

function mapType(raw) {
  if (!raw) return 'marche';
  return TYPE_MAP[raw.toLowerCase().trim()] ?? 'marche';
}

// ── Utilitaires HTML ──────────────────────────────────────────────────────────
function decodeEntities(str) {
  return str
    .replace(/&amp;/g,   '&')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&#039;/g,  "'")
    .replace(/&apos;/g,  "'")
    .replace(/&eacute;/g,'é').replace(/&Eacute;/g,'É')
    .replace(/&egrave;/g,'è').replace(/&Egrave;/g,'È')
    .replace(/&ecirc;/g, 'ê').replace(/&Ecirc;/g, 'Ê')
    .replace(/&euml;/g,  'ë')
    .replace(/&agrave;/g,'à').replace(/&Agrave;/g,'À')
    .replace(/&acirc;/g, 'â').replace(/&Acirc;/g, 'Â')
    .replace(/&auml;/g,  'ä')
    .replace(/&ocirc;/g, 'ô').replace(/&Ocirc;/g, 'Ô')
    .replace(/&ouml;/g,  'ö')
    .replace(/&ucirc;/g, 'û').replace(/&Ucirc;/g, 'Û')
    .replace(/&uuml;/g,  'ü')
    .replace(/&ugrave;/g,'ù')
    .replace(/&icirc;/g, 'î').replace(/&iuml;/g, 'ï')
    .replace(/&ccedil;/g,'ç').replace(/&Ccedil;/g,'Ç')
    .replace(/&oelig;/g, 'œ').replace(/&OElig;/g, 'Œ')
    .replace(/&aelig;/g, 'æ').replace(/&AElig;/g, 'Æ')
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&nbsp;/g,  ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)));
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function between(html, open, close) {
  const i = html.indexOf(open);
  if (i === -1) return null;
  const j = html.indexOf(close, i + open.length);
  if (j === -1) return null;
  return html.slice(i + open.length, j).trim();
}

// ── Fetch avec retry ──────────────────────────────────────────────────────────
async function fetchHtml(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Scriptorium/1.0 (collecte événements médiévaux)',
          'Accept': 'text/html',
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Lire en buffer pour gérer l'encodage explicitement
      const buf     = await res.arrayBuffer();
      const charset = res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8';
      return new TextDecoder(charset).decode(buf);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(2000);
    }
  }
}

// ── Scrape liste des événements sur une page ──────────────────────────────────
function parseListPage(html) {
  const events = [];

  // Chaque événement est dans un bloc article ou div avec lien /site/...
  const slugRe = /href="(\/site\/[^"]+)"/g;
  const seen   = new Set();
  let m;
  while ((m = slugRe.exec(html)) !== null) {
    const slug = m[1];
    if (!seen.has(slug)) {
      seen.add(slug);
      events.push(slug);
    }
  }
  return events;
}

// ── Scrape détail d'un événement ──────────────────────────────────────────────
function parseDetailPage(html, slug) {
  // Titre — <h1 class="title-event">...</h1>
  const nomRaw = between(html, '<h1 class="title-event">', '</h1>');
  const nom    = nomRaw ? stripTags(nomRaw) : null;

  // Dates — "A lieu du DD/MM/YYYY au DD/MM/YYYY" dans <div class="date"> ou <p>
  const dateBlock = between(html, 'A lieu du ', '</');
  let date_debut = null, date_fin = null;
  if (dateBlock) {
    const m = dateBlock.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})(?:.*?au.*?(\d{1,2})\/(\d{1,2})\/(20\d{2}))?/);
    if (m) {
      date_debut = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      if (m[4]) {
        date_fin = `${m[6]}-${m[5].padStart(2,'0')}-${m[4].padStart(2,'0')}`;
        if (date_fin === date_debut) date_fin = null;
      }
    }
  }

  // Coordonnées GPS — JSON-LD "latitude":XX,"longitude":XX
  let latitude = null, longitude = null;
  const latM = html.match(/"latitude"\s*:\s*([-\d.]+)/);
  const lngM = html.match(/"longitude"\s*:\s*([-\d.]+)/);
  if (latM) latitude  = parseFloat(latM[1]);
  if (lngM) longitude = parseFloat(lngM[1]);
  // Fallback Leaflet L.marker([lat, lng])
  if (!latitude) {
    const markerM = html.match(/L\.marker\(\[([-\d.]+),\s*([-\d.]+)\]\)/);
    if (markerM) { latitude = parseFloat(markerM[1]); longitude = parseFloat(markerM[2]); }
  }

  // Localisation — <div class="comments m-0">..Ville / Région / Pays..</div>
  let ville = null, pays = null;
  const locBlock = between(html, '<div class="comments m-0">', '</div>');
  if (locBlock) {
    const parts = stripTags(locBlock).split('/').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 1) ville = parts[0];
    if (parts.length >= 3) pays  = parts[parts.length - 1];
  }

  // Type — JSON-LD "@type" ou classe dans la page
  const typeM = html.match(/"@type"\s*:\s*"([^"]+)"/);
  let typeRaw = typeM?.[1] ?? '';
  // Fallback : chercher le libellé de catégorie visible
  if (!typeRaw || typeRaw === 'Event') {
    const catM = html.match(/class="[^"]*categor[^"]*"[^>]*>([^<]+)/i)
      || html.match(/class="[^"]*animation[^"]*"[^>]*>([^<]+)/i);
    typeRaw = catM?.[1] ?? '';
  }
  const type = mapType(typeRaw);

  // Description — meta description
  const descM = html.match(/<meta[^>]+name="description"[^>]*content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i);
  const description = descM ? decodeEntities(descM[1]).slice(0, 1000) : null;

  // URL source
  const url = `${SOURCE}${slug}`;

  return {
    nom:         nom || null,
    type,
    date_debut,
    date_fin,
    ville:       ville ? decodeEntities(ville) : null,
    pays:        pays  ? decodeEntities(pays)  : null,
    description,
    url,
    latitude,
    longitude,
    statut:      'approuve',
  };
}

// ── Insérer dans NocoDB ───────────────────────────────────────────────────────
async function insertEvent(record) {
  const res = await fetch(`${BASE_URL}/api/v1/db/data/noco/${BASE_ID}/${TABLE_ID}`, {
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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Scriptorium — import fetes-medievales.com');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Collecter tous les slugs d'événements
  const allSlugs = [];
  console.log('── Collecte des événements…');

  for (let page = 1; page <= 15; page++) {
    const url = page === 1
      ? `${SOURCE}/evenements-a-venir`
      : `${SOURCE}/evenements-a-venir/${page}`;

    let html;
    try {
      html = await fetchHtml(url);
    } catch {
      console.log(`  Page ${page} inaccessible, arrêt.`);
      break;
    }

    const slugs = parseListPage(html);
    if (slugs.length === 0) {
      console.log(`  Page ${page} vide, arrêt.`);
      break;
    }

    allSlugs.push(...slugs);
    console.log(`  Page ${page} : ${slugs.length} événements`);
    await sleep(1000);
  }

  // Dédoublonner
  const uniqueSlugs = [...new Set(allSlugs)];
  console.log(`\nTotal : ${uniqueSlugs.length} événements uniques\n`);

  // 2. Scraper chaque fiche et insérer
  console.log('── Import dans NocoDB…');
  let ok = 0, skipped = 0, errors = 0;

  for (const slug of uniqueSlugs) {
    let html;
    try {
      html = await fetchHtml(`${SOURCE}${slug}`);
    } catch (err) {
      console.error(`  ✗  ${slug} — fetch échoué : ${err.message}`);
      errors++;
      await sleep(1000);
      continue;
    }

    const evt = parseDetailPage(html, slug);

    if (!evt.nom) {
      console.warn(`  ⚠  ${slug} — nom introuvable, ignoré`);
      skipped++;
      await sleep(800);
      continue;
    }

    // Ignorer si pas de date
    if (!evt.date_debut) {
      console.warn(`  ⚠  ${evt.nom} — date introuvable, ignoré`);
      skipped++;
      await sleep(800);
      continue;
    }

    try {
      await insertEvent(evt);
      const lieu = [evt.ville, evt.pays].filter(Boolean).join(', ');
      console.log(`  ✓  ${evt.date_debut}  ${evt.nom}${lieu ? ` (${lieu})` : ''}`);
      ok++;
    } catch (err) {
      console.error(`  ✗  ${evt.nom} — ${err.message}`);
      errors++;
    }

    await sleep(800); // politesse : ~1 req/s
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Terminé : ${ok} importés, ${skipped} ignorés, ${errors} erreurs`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => { console.error('✗ Erreur fatale :', err.message); process.exit(1); });
