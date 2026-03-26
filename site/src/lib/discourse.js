// ── Configuration ──────────────────────────────────────────────────────────────
// Les variables sont lues à l'appel pour respecter le cycle de vie Astro SSR.
function base()    { return (import.meta.env.DISCOURSE_URL ?? '').replace(/\/$/, ''); }
function apiKey()  { return import.meta.env.DISCOURSE_API_KEY ?? ''; }
function apiUser() { return import.meta.env.DISCOURSE_API_USERNAME ?? 'system'; }

function defaultHeaders(overrideKey) {
  return {
    'Api-Key':      overrideKey ?? apiKey(),
    'Api-Username': apiUser(),
    'Content-Type': 'application/json',
  };
}

async function get(path) {
  const res = await fetch(`${base()}${path}`, { headers: defaultHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discourse ${res.status} [${path}]: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── API publique ───────────────────────────────────────────────────────────────

/** Récupère les derniers sujets d'une catégorie (ID ou slug) */
export async function getTopicsByCategory(categoryId) {
  const data = await get(`/c/${categoryId}.json`);
  return data.topic_list?.topics ?? [];
}

/** Récupère un sujet et ses posts par ID */
export async function getTopic(topicId) {
  return get(`/t/${topicId}.json`);
}

/** Récupère les dernières discussions (toutes catégories) */
export async function getLatestTopics() {
  const data = await get('/latest.json');
  return data.topic_list?.topics ?? [];
}

/**
 * Crée un nouveau sujet dans Discourse.
 * @param {string} apiKey  Clé API de l'utilisateur qui poste (pas la clé système)
 */
export async function createTopic(title, content, categoryId, apiKey) {
  const res = await fetch(`${base()}/posts.json`, {
    method:  'POST',
    headers: defaultHeaders(apiKey),
    body:    JSON.stringify({ title, raw: content, category: categoryId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discourse ${res.status} [createTopic]: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Récupère un profil membre par pseudo */
export async function getUserByUsername(username) {
  return get(`/u/${username}.json`);
}
