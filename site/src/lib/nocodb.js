// ── Configuration ─────────────────────────────────────────────────────────────
const BASE_URL  = import.meta.env.NOCODB_URL    ?? 'http://localhost:8080';
const BASE_ID   = import.meta.env.NOCODB_BASE_ID ?? 'pxtcxb6mls0lwey';
const API_TOKEN = import.meta.env.NOCODB_TOKEN;

const TABLE_IDS = {
  ressources:      'm1zhtljc7u09gp3',
  boutiques:       'mznghgj1ksmg1g8',
  tutoriels:       'mdb6d04p0cbqv3f',
  evenements:      'm72t0konedv041r',
};

// ── Client interne ────────────────────────────────────────────────────────────
/**
 * @param {string} tableId
 * @param {Record<string, string>} [params]
 */
async function fetchRows(tableId, params = {}) {
  const url = new URL(`/api/v1/db/data/noco/${BASE_ID}/${tableId}`, BASE_URL);
  url.searchParams.set('limit', params.limit ?? '100');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { 'xc-token': API_TOKEN },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NocoDB ${res.status} [${tableId}]: ${text}`);
  }

  const data = await res.json();
  return data.list ?? [];
}

/**
 * @param {string} tableId
 * @param {string|number} id
 */
async function fetchRowById(tableId, id) {
  const url = `${BASE_URL}/api/v1/db/data/noco/${BASE_ID}/${tableId}/${id}`;

  const res = await fetch(url, {
    headers: { 'xc-token': API_TOKEN },
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NocoDB ${res.status} [${tableId}/${id}]: ${text}`);
  }

  return res.json();
}

// ── API publique ──────────────────────────────────────────────────────────────

/** Toutes les ressources approuvées */
export async function getRessources() {
  return fetchRows(TABLE_IDS.ressources, {
    where: '(statut,eq,approuve)',
    sort:  '-date_validation',
  });
}

/** Une ressource par son ID (retourne null si introuvable) */
export async function getRessourceById(id) {
  return fetchRowById(TABLE_IDS.ressources, id);
}

/** Toutes les boutiques approuvées */
export async function getBoutiques() {
  return fetchRows(TABLE_IDS.boutiques, {
    where: '(statut,eq,approuve)',
    sort:  'nom',
  });
}

/** Tous les tutoriels approuvés */
export async function getTutoriels() {
  return fetchRows(TABLE_IDS.tutoriels, {
    where: '(statut,eq,approuve)',
    sort:  '-date_soumission',
  });
}

/** Tous les événements approuvés */
export async function getEvenements() {
  return fetchRows(TABLE_IDS.evenements, {
    where: '(statut,eq,approuve)',
    sort:  'date_debut',
  });
}

/** Une boutique par son ID */
export async function getBoutiqueById(id) {
  return fetchRowById(TABLE_IDS.boutiques, id);
}

/** Un tutoriel par son ID */
export async function getTutorielById(id) {
  return fetchRowById(TABLE_IDS.tutoriels, id);
}

/** Avis d'une boutique (table avis_boutiques) */
export async function getAvisBoutique(boutiqueId) {
  return fetchRows('mpjvjgzy8nr2yoq', {
    where: `(boutique,eq,${boutiqueId})`,
    sort:  '-date_avis',
    limit: '50',
  });
}

/** Toutes les boutiques avec coordonnées (pour la carte) */
export async function getBoutiquesAvecCoords() {
  return fetchRows(TABLE_IDS.boutiques, {
    where: '(statut,eq,approuve)',
    sort:  'nom',
    limit: '500',
  });
}

/** Tous les événements avec coordonnées (pour la carte) */
export async function getEvenementsAvecCoords() {
  return fetchRows(TABLE_IDS.evenements, {
    where: '(statut,eq,approuve)',
    sort:  'date_debut',
    limit: '500',
  });
}

/** Soumet une URL dans la file d'attente IA */
export async function soumettreRessource(payload) {
  const url = `${BASE_URL}/api/v1/db/data/noco/${BASE_ID}/mlz3k9jtdc1obyf`;
  const res = await fetch(url, {
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