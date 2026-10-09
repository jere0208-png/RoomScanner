/**
 * LES MESSAGES QUI VOYAGENT AVEC L'APPLICATION.
 *
 * La boîte de réception ne doit pas être vide le premier jour, ni dépendre
 * du réseau pour dire ce qu'une mise à jour apporte : un message de
 * bienvenue, puis une note par version, embarqués ici. Ils arrivent avec la
 * mise à jour elle-même — le jour où l'App Store l'installe, la note est
 * dans la boîte, non lue, et la pastille de la cloche le dit.
 *
 * Les messages ENVOYÉS par le patron, eux, viennent du serveur (voir
 * `net/messages.ts`) et s'ajoutent à ceux-ci. Pour annoncer une version,
 * on ajoute une entrée EN TÊTE de `NOUVEAUTES`, avec un identifiant neuf.
 */
import type { Message } from '../net/messages';

export const BIENVENUE: Message = {
  id: 'bienvenue',
  date: Date.UTC(2026, 9, 10, 8),
  titre: 'Bienvenue sur EchoPlan',
  genre: 'info',
  texte:
    'C’est ici qu’arrivent les nouveautés de l’application, des astuces pour bien relever ' +
    'votre logement et les annonces importantes.\n\n' +
    'Une notification se lit d’un appui ; balayez-la vers la gauche pour la supprimer. ' +
    'La pastille de la cloche, sur l’accueil, vous dit quand il y a du nouveau.',
  action: { libelle: 'Visiter l’appartement exemple', ecran: 'exemple' },
};

export const NOUVEAUTES: Message[] = [
  {
    id: 'version-2026-10',
    date: Date.UTC(2026, 9, 10, 9),
    titre: 'Nouveau : un accueil, un exemple et des cotes au millimètre',
    genre: 'nouveaute',
    texte:
      'L’accueil a été refait : vos derniers plans sont visibles d’un coup d’œil, et un ' +
      'appartement d’exemple se visite en 3D sans rien scanner.\n\n' +
      'Les murs, les cloisons, les portes, les fenêtres et les meubles se placent ' +
      'maintenant aux cotes de votre mètre ruban, d’une face à l’autre — l’épaisseur ' +
      'de chaque mur est prise en compte.\n\n' +
      'Les étages se recalent au centimètre et au demi-degré, et les spots se cotent ' +
      'depuis le mur le plus proche.',
  },
];

/** Tout ce que l'application porte en elle, du plus récent au plus ancien. */
export const MESSAGES_EMBARQUES: Message[] = [...NOUVEAUTES, BIENVENUE];
