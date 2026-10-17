/**
 * CE QU'« ANNULER » VIENT DE DÉFAIRE, EN TOUTES LETTRES.
 *
 * Revue experte « Édition 2D » : le bouton « Annuler » restaurait un
 * instantané sans un mot. Quand le changement défait était hors de l'écran
 * (plan zoomé ailleurs) ou discret (une épaisseur, une nature de mur, une
 * hauteur), rien ne bougeait à l'œil : on retouchait « Annuler », et l'on
 * défaisait un geste de trop.
 *
 * Le magasin connaît pourtant la nature de chaque geste : `pushHistory`
 * reçoit une clé (`setWallLength:mur-3`, `epaisseur:mur-3`, `removeWall`…).
 * On la garde dans l'instantané, et cette table la traduit. Le préfixe est
 * ce qui précède le premier « : » ou « - » (`teinte-r1` → `teinte`). Une
 * clé inconnue ne dit pas de bêtise : « dernière retouche ».
 */
import { astuce } from '../ui/astuce';

const LIBELLES: Record<string, string> = {
  // Murs.
  setWallLength: 'longueur du mur',
  setWallAngle: 'angle du mur',
  move: 'coin du mur',
  moveWall: 'déplacement du mur',
  wallHeight: 'hauteur du mur',
  epaisseur: 'épaisseur du mur',
  natureMur: 'nature du mur',
  detacher: 'mur détaché',
  addWall: 'ajout du mur',
  removeWall: 'suppression du mur',
  // Pièces et niveaux.
  height: 'hauteur sous plafond',
  roomName: 'nom de la pièce',
  moveRoom: 'déplacement de la pièce',
  resizeRoom: 'dimensions de la pièce',
  resizeRoomSide: 'dimensions de la pièce',
  addRoom: 'ajout de la pièce',
  removeRoom: 'suppression de la pièce',
  duplicateRoom: 'copie de la pièce',
  splitRoom: 'pièce scindée',
  mergeRooms: 'pièces fusionnées',
  redetect: 'pièces recalculées',
  recalerNiveau: 'calage du niveau',
  retirerNiveau: 'suppression du niveau',
  ajouterEtage: 'ajout de l’étage',
  completerReleve: 'relevé complété',
  comblerTrou: 'trou comblé',
  declarerRecoin: 'recoin déclaré',
  north: 'orientation du nord',
  // Menuiseries.
  addOpening: 'pose de la menuiserie',
  removeOpening: 'suppression de la menuiserie',
  opening: 'taille de la menuiserie',
  coterOuverture: 'cotes de la menuiserie',
  nature: 'type de menuiserie',
  battant: 'sens d’ouverture',
  allege: 'hauteur d’allège',
  coffre: 'coffre du volet',
  teintePorte: 'teinte des portes',
  // Meubles.
  addObject: 'ajout du meuble',
  removeObject: 'suppression du meuble',
  retirerMeubles: 'meubles retirés',
  moveObject: 'déplacement du meuble',
  resize: 'taille du meuble',
  resizeSide: 'taille du meuble',
  rotate: 'rotation du meuble',
  yaw: 'rotation du meuble',
  objectHeight: 'hauteur du meuble',
  caler: 'meuble calé',
  meridienne: 'côté de la méridienne',
  assemblage: 'assemblage des meubles',
  // Électricité.
  addFixture: 'pose de l’appareil',
  removeFixture: 'suppression de l’appareil',
  fixture: 'déplacement de l’appareil',
  flip: 'côté de l’appareil',
  separer: 'appareils séparés',
  repeterFixture: 'appareil répété',
  restore: 'appareillage rétabli',
  setFixtureUsage: 'usage de l’appareil',
  fixtureCommand: 'commande de l’appareil',
  normesAuto: 'équipement aux normes',
  constituerLeTableau: 'tableau électrique',
  viderLeTableau: 'tableau vidé',
  detecteurOuverture: 'détecteur',
  // Plafond.
  addCeiling: 'pose au plafond',
  removeCeiling: 'suppression au plafond',
  ceiling: 'déplacement au plafond',
  ceilingRow: 'ligne de spots',
  removeCeilingRow: 'suppression de la ligne de spots',
  retirerLaRangee: 'suppression de la rangée',
  ceilingCommand: 'commande du plafond',
  lierPlafond: 'lien au plafond',
  delierPlafond: 'lien au plafond',
  basculerPontage: 'pontage',
  retracerRuban: 'tracé du ruban',
  // Décor.
  peinture: 'peinture',
  teinte: 'teinte',
  sol: 'sol',
  accent: 'mur d’accent',
  ambiance: 'ambiance',
  // Notes, mesures, photos.
  addNote: 'ajout de la note',
  removeNote: 'suppression de la note',
  editNote: 'texte de la note',
  moveNote: 'déplacement de la note',
  addMesure: 'ajout de la mesure',
  removeMesure: 'suppression de la mesure',
  photo: 'photo',
  confirmerLeReleve: 'relevé confirmé',
};

/** Le libellé d'un geste de l'historique, à partir de sa clé. */
export function libelleDuGeste(cle: string | undefined | null): string {
  if (!cle) return 'dernière retouche';
  const prefixe = cle.split(/[:-]/)[0];
  return LIBELLES[prefixe] ?? 'dernière retouche';
}

/**
 * Le mot qui passe après un appui sur « Annuler » ou « Refaire » : « Annulé :
 * longueur du mur ». Une seule famille (`historique`) : trois appuis rapides
 * ne laissent que le dernier à l'écran (voir `DonneesAstuce.famille`). Rien
 * à dire quand il n'y avait rien à défaire.
 */
export function direLeRetour(sens: 'annule' | 'retabli', cle: string | null): void {
  if (cle === null) return;
  const libelle = libelleDuGeste(cle);
  astuce(`${sens === 'annule' ? 'Annulé' : 'Rétabli'} : ${libelle}`, {
    icone: sens === 'annule' ? 'undo' : 'redo',
    famille: 'historique',
  });
}
