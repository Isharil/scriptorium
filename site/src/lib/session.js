import { createHmac } from 'node:crypto';

const TITRE_LABELS = {
  enlumineur:         'Enlumineur',
  clerc:              'Clerc',
  maitre_atelier:     "Maître d'atelier",
  maitre_guilde:      'Maître de guilde',
  medieviste_verifie: 'Médiéviste vérifié',
};

/**
 * Lit et vérifie le cookie de session signé.
 * @returns {object|null} Données de session ou null si absent/invalide.
 */
export function getSession(cookies) {
  const secret = import.meta.env.DISCOURSE_SSO_SECRET;
  const raw    = cookies.get('scriptorium_session')?.value;
  if (!raw || !secret) return null;

  const dot = raw.lastIndexOf('.');
  if (dot === -1) return null;

  const b64 = raw.slice(0, dot);
  const sig  = raw.slice(dot + 1);

  const expected = createHmac('sha256', secret).update(b64).digest('hex');
  if (expected !== sig) return null;

  try {
    const session = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
    session.titreLabel = TITRE_LABELS[session.titre] ?? session.titre;
    return session;
  } catch {
    return null;
  }
}
