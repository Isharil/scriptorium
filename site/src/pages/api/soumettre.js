/**
 * POST /api/soumettre
 * Reçoit les données du formulaire et les insère dans NocoDB.
 * Nécessite output: 'server' ou 'hybrid' dans astro.config.mjs
 */

export const prerender = false;

const BASE_URL  = import.meta.env.NOCODB_URL     ?? 'http://localhost:8080';
const BASE_ID   = import.meta.env.NOCODB_BASE_ID ?? 'pxtcxb6mls0lwey';
const API_TOKEN = import.meta.env.NOCODB_TOKEN;

const TABLE_IDS = {
  soumissions_file: 'mlz3k9jtdc1obyf',
  boutiques:        'mznghgj1ksmg1g8',
};

async function nocoPost(tableId, payload) {
  const url = `${BASE_URL}/api/v1/db/data/noco/${BASE_ID}/${tableId}`;
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'xc-token': API_TOKEN, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NocoDB ${res.status}: ${text}`);
  }
  return res.json();
}

export async function POST({ request, redirect }) {
  let data;
  try {
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      data = await request.json();
    } else {
      const form = await request.formData();
      data = Object.fromEntries(form.entries());
      // Les champs multiple (checkboxes) reviennent comme entrée unique — récupérer tous
      const specialites = form.getAll('specialites');
      if (specialites.length) data.specialites = specialites.join(',');
    }
  } catch {
    return redirect('/soumettre?err=' + encodeURIComponent('Données invalides.'));
  }

  const type = data.type ?? 'ressource';

  try {
    if (type === 'boutique') {
      // ── Insertion dans boutiques ───────────────────────────────────────────
      await nocoPost(TABLE_IDS.boutiques, {
        nom:              String(data.nom ?? '').trim(),
        url_site:         String(data.url_site ?? '').trim(),
        description:      String(data.description ?? '').trim() || null,
        type:             data.type_boutique || null,
        specialites:      data.specialites || null,
        pays:             String(data.pays ?? '').trim() || null,
        ville:            String(data.ville ?? '').trim() || null,
        livraison_europe: data.livraison_europe === '1' || data.livraison_europe === true,
        statut:           'soumis',
        date_soumission:  new Date().toISOString().slice(0, 10),
      });
    } else {
      // ── Insertion dans soumissions_file (ressource ou tutoriel) ───────────
      const url = String(data.url_soumise ?? '').trim();
      if (!url) {
        return redirect('/soumettre?err=' + encodeURIComponent('L\'URL est requise.'));
      }

      await nocoPost(TABLE_IDS.soumissions_file, {
        url_soumise:     url,
        statut_ia:       'en_attente',
        niveau_propose:  data.niveau_propose || null,
        tags_proposes:   data.tags_proposes  ? String(data.tags_proposes).trim() : null,
        resume_ia:       data.commentaire    ? String(data.commentaire).trim()   : null,
        date_soumission: new Date().toISOString().slice(0, 10),
      });
    }

    return redirect('/soumettre?ok=1');

  } catch (err) {
    console.error('[api/soumettre]', err.message);
    return redirect('/soumettre?err=' + encodeURIComponent('Erreur serveur. Réessayez dans un instant.'));
  }
}
