/**
 * LES MESSAGES DE L'ÉDITEUR — ce que le patron envoie aux utilisateurs.
 *
 * Relevé du patron : « un bouton de notifications où l'on pourra suivre les
 * avancées des mises à jour, si on souhaite envoyer aux utilisateurs. Un
 * vrai système, comme les autres applications : une sorte de mail intra
 * app. »
 *
 * D'OÙ ILS VIENNENT. Un fichier statique, `messages.json`, posé sur le
 * serveur à côté de `api.php` et écrit par la page d'administration
 * (`server/echoplan-messages.php`). La leçon des tarifs vaut ici : un fichier
 * ne se désynchronise pas, un script si — et une boîte de réception qui
 * tomberait avec la base de données serait muette le jour où l'on a quelque
 * chose à dire.
 *
 * CE QUI ARRIVE EST LU COMME UNE DONNÉE, PAS COMME UNE CONSIGNE : chaque
 * champ est vérifié, borné, et un message qui ne tient pas debout est écarté
 * plutôt que d'être affiché à moitié.
 */
import { SERVEUR } from '../config/serveur';

/** La nature d'un message : elle choisit son pictogramme et sa teinte. */
export type GenreMessage = 'nouveaute' | 'astuce' | 'info' | 'offre';

/** Les écrans qu'un message peut ouvrir — et seulement ceux-là. */
export const ECRANS_MESSAGE = ['pro', 'exemple', 'bibliotheque', 'profil'] as const;
export type EcranMessage = (typeof ECRANS_MESSAGE)[number];

export interface Message {
  id: string;
  /** L'instant de publication (ms). */
  date: number;
  titre: string;
  texte: string;
  genre: GenreMessage;
  /** Le bouton au pied du message : un écran de l'app, ou une adresse web. */
  action?: { libelle: string; ecran?: EcranMessage; url?: string };
}

const GENRES: GenreMessage[] = ['nouveaute', 'astuce', 'info', 'offre'];
const DELAI = 6000;
/** Au-delà, on ne lit plus : un fichier de mille messages est une erreur. */
const MAX_MESSAGES = 100;

const texte = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** Un message reçu, vérifié champ par champ — ou rien. */
export function lireMessage(brut: unknown): Message | null {
  if (!brut || typeof brut !== 'object') return null;
  const m = brut as Record<string, unknown>;
  const id = texte(m.id, 80);
  const titre = texte(m.titre, 120);
  const corps = texte(m.texte, 4000);
  const date = typeof m.date === 'string' ? Date.parse(m.date) : typeof m.date === 'number' ? m.date : NaN;
  if (!id || !titre || !corps || !Number.isFinite(date)) return null;
  const genre = GENRES.includes(m.genre as GenreMessage) ? (m.genre as GenreMessage) : 'info';
  let action: Message['action'];
  if (m.action && typeof m.action === 'object') {
    const a = m.action as Record<string, unknown>;
    const libelle = texte(a.libelle, 40);
    const ecran = ECRANS_MESSAGE.includes(a.ecran as EcranMessage) ? (a.ecran as EcranMessage) : undefined;
    // Une adresse web seulement en https : un message ne doit pas pouvoir
    // ouvrir n'importe quoi depuis l'application.
    const url = typeof a.url === 'string' && /^https:\/\/[^\s]+$/i.test(a.url.trim()) ? a.url.trim() : undefined;
    if (libelle && (ecran || url)) action = { libelle, ...(ecran ? { ecran } : { url }) };
  }
  return { id, date, titre, texte: corps, genre, ...(action ? { action } : {}) };
}

/** Le fichier entier : `{ messages: [...] }`, ou une liste nue. */
export function lireMessages(brut: unknown): Message[] | null {
  const liste = Array.isArray(brut)
    ? brut
    : brut && typeof brut === 'object' && Array.isArray((brut as { messages?: unknown }).messages)
      ? (brut as { messages: unknown[] }).messages
      : null;
  if (!liste) return null;
  const vus = new Set<string>();
  const out: Message[] = [];
  for (const b of liste.slice(0, MAX_MESSAGES)) {
    const m = lireMessage(b);
    if (!m || vus.has(m.id)) continue;
    vus.add(m.id);
    out.push(m);
  }
  return out;
}

/**
 * Demande les messages au serveur. `null` : pas de réponse (hors ligne,
 * serveur muet, fichier illisible) — et ce n'est pas « aucun message » :
 * la boîte garde alors ce qu'elle avait.
 */
export async function demanderLesMessages(): Promise<Message[] | null> {
  if (!SERVEUR.url) return null;
  let jeton: ReturnType<typeof setTimeout> | null = null;
  const delai = new Promise<null>((fin) => {
    jeton = setTimeout(() => fin(null), DELAI);
  });
  const lecture = (async () => {
    try {
      // Le cache des intermédiaires ne doit pas rendre une boîte d'hier.
      const r = await fetch(`${SERVEUR.url}/messages.json?t=${Date.now()}`);
      if (!r.ok) return null;
      return lireMessages(await r.json());
    } catch {
      return null;
    }
  })();
  try {
    return await Promise.race([lecture, delai]);
  } finally {
    if (jeton !== null) clearTimeout(jeton);
  }
}
