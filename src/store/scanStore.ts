import { NOM_EXEMPLE, appartementExemple } from '../data/exemple';
import type { PlanLu } from '../geometry/lecturePlan';
import type { Mesure } from '../geometry/regle';
import { photosDesMurs } from '../geometry/photosAuto';
import { trajetDe } from '../geometry/traversee';
import { create } from 'zustand';
import { HEIGHT_RULES, estCuisine, heightRuleAt, worktopsOnWall } from '../geometry/nfc15100';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pasDeGeste } from './geste';
import { catalogueDesPlans, deposerPlan, reprendrePlan, type Identite, retirerPlan } from '../net/coffrePlans';
import { implanter, rattacher, sansLaRangee, type DepartExistant, type TableauExistant } from '../geometry/existant';
import { plafondDeLaPiece, solReleveDe, type PlafondDeLaPiece } from '../geometry/fichePiece';

export type { TableauExistant };
import {
  cleanModelFiles,
  deletePhotoFiles,
  reposerDuCoffre,
} from '../ui/photos';
import { bornerCalage, CALAGE_NEUTRE, type Calage } from '../ui/calage';
import { ACCENT_DEFAUT, estUnAccent } from '../ui/accents';
import { ICONE_DEFAUT, estUneIcone, poserIcone } from '../ui/icone';
import { astuce } from '../ui/astuce';
import { identiteDuCompte, useAccountStore } from './accountStore';
import {
  CEILINGS,
  insetOnRing,
  type CeilingFixture,
  type CeilingKind,
  type SpotAxis,
} from '../geometry/ceiling';
import type {
  FloorData,
  ObjectData,
  ScanResult,
  ScanUpdate,
} from 'react-native-room-scan';
import {
  DEFAULT_ROOM_ID,
  detectRooms,
  massifsTechniques,
  mergeColinear,
  sansEclats,
  baiesVitrees,
  portesVuesOuvertes,
  baiesHorsDesAngles,
  lesPortesDeGarage,
  porteDeGarage,
  LARGEUR_DE_BAIE,
  solDesMurs,
  openingsOn,
  pointOnSeg,
  murDeLOuverture,
  pushOutOfObjects,
  separerMeubles,
  castToWall,
  pushOutOfWalls,
  nearestOnRing,
  snapSideToWalls,
  hauteurDeLaPiece,
  roomOf,
  roomParts,
  coupeDePiece,
  type SaisieCoupe,
  ouvertureCotee,
  type SaisieOuverture,
  WALL_T,
  planFrameAngle,
  marquerLesFacesVues,
  reprojectOpenings,
  segLength,
  snapAngle,
  snapToNeighbours,
  soudureAuBout,
  splitAtJunctions,
  straightenWalls,
  toSegment,
  wallQuadsOf,
  wallRuns,
  weldCorners,
  joindreLesCoins,
  preEquerrage,
  epaisseursAccordees,
  facadesDePlacard,
  fusionnerMursDoubles,
  estDessine,
  longueurCotee,
  repereDePiece,
  demiFacesDe,
  epaisseurDe,
  faceDuCote,
  facesDesMurs,
  NIVEAU_RDC,
  niveauDe,
  niveauxPresents,
  niveauDeReference,
  souderLesRecouvrements,
  filtrerAuNiveau,
  partRecouverte,
  estRecouvert,
  murPorteurDe,
  recadrerAuCadre,
  type RoomPart,
  reporterOuverture,
  deplacerNiveau,
  pivoterNiveau,
  pivoterPoint,
  centreDuNiveau,
  COFFRE_H,
  type TrouDeReleve,
  type Pt,
  type WallSeg,
} from '../geometry/floorplan';
import { avecCoffresDuLidar } from '../geometry/coffreLidar';
import { avecLesBordsDuLidar, releveLogique, sansMeublesEnDouble } from '../geometry/logique';
import type { MurDouteux } from '../geometry/murDouteux';
import { reunirLesCanapesDAngle } from '../geometry/canapeAngle';
import { calerDansLaNiche, calerLesMeubles } from '../geometry/niche';
import {
  SUR_MESURE,
  catalogTransform,
  type CatalogItem,
} from '../geometry/catalogue';
import {
  COMMANDES_MURALES,
  FIXTURES,
  ENTRAXE,
  placeRepetee,
  faceX,
  fromFaceX,
  masonryRuns,
  snapToMasonry,
  interiorSide,
  newFixture,
  reprojectAnchors,
  reprojectFixtures,
  overlaps,
  seCommande,
  wallFace,
  type Fixture,
  type FixtureKind,
} from '../geometry/electrical';
import { GAMMES, type GammeId } from '../geometry/prix';
import { TAUX_DE_TVA, type LigneLibre } from '../geometry/mainDOeuvre';
import { equilibrerLaScene, pointInPolygon } from '../geometry/appearance';
import { ancrerElec } from '../geometry/viseur';
import { poserLibre } from '../geometry/poser';
import { orienterLesSieges } from '../geometry/sieges';
import type { SurfaceTexture } from 'react-native-room-scan';
import {
  deduceRoomKind, deduireLaPiece,
  roomKindLabel,
  type RoomKind,
} from '../geometry/furniture';

export type Screen =
  | 'home'
  | 'scan'
  | 'result'
  | 'library'
  | 'export'
  | 'devis'
  // Le catalogue : une PAGE entière, comme le devis, et pour la même
  // raison — une liste de cent cinquante articles doit défiler.
  | 'magasin'
  /*
    LE CHOIX DE GAMME — une page, et non plus la première marche d'un tunnel.

    Il ouvrait le devis : on choisissait sa marque d'appareillage AVANT
    d'avoir vu le moindre prix, c'est-à-dire avant d'avoir la seule
    information qui permette de choisir. Il s'ouvre maintenant depuis
    l'estimation, quand on voit le total qu'il va faire bouger.
  */
  | 'gamme'
  | 'camera'
  | 'profil'
  | 'notifications'
  | 'confidentialite'
  /*
    LA LECTURE D'UN PLAN PAPIER — une page : l'invitation, le scanner, la
    lecture, et ce qu'on a lu, à vérifier avant d'en faire un plan (voir
    `LecturePlanScreen`).
  */
  | 'lecture'
  /*
    LE DIAGNOSTIC D'UN PLAN — une page, pas une feuille : une liste de
    problèmes, une liste à cocher et un champ de texte doivent défiler.
  */
  | 'diagnostic';

/**
 * Une pièce du scan. La géométrie reste À PLAT dans `walls`/`openings`/
 * `objects` — chaque élément porte son `roomId` — parce que tout le rendu
 * (plan, 3D, PDF) travaille sur des listes de murs. Ici on ne garde que ce
 * qui est propre à la pièce : son nom et le relevé de son sol.
 */
export interface RoomEntry {
  /**
   * ELLE VIENT D'ETRE POSEE ET N'EST PAS ENCORE ARRETEE.
   *
   * Releve du patron : « on doit faire une piece basique modifiable comme un
   * meuble sur ses cotes, EN POINTILLES ». Le pointille dit ce qu'aucun mot
   * ne dirait aussi vite : ceci n'est pas encore un mur, c'est une intention
   * qu'on est en train de regler.
   *
   * Absent partout ailleurs : une piece scannee ou rouverte est arretee par
   * definition.
   */
  neuve?: boolean;
  id: string;
  /** Nom affiché sur le plan ; vide = pièce non nommée. */
  name: string;
  /**
   * Murs qui bordent la pièce. C'est la pièce qui liste ses murs, et non
   * l'inverse : un refend borde deux pièces, il figure dans les deux listes.
   * Absent sur les scans d'avant la détection automatique.
   */
  wallIds?: string[];
  /** Type déduit du mobilier (`kitchen`, `bedroom`…), si déduction il y a. */
  kind?: RoomKind;
  /** Couleurs du sol relevées au scan. */
  floor?: FloorData | null;
  /**
   * LA PEINTURE CHOISIE POUR SES MURS — une clé de `ui/peintures`.
   *
   * Absent = le mur reste tel que le relevé l'a vu, ou au blanc du dessin.
   * On garde la CLÉ et non la teinte : une palette qui s'ajuste d'une
   * version à l'autre repeint alors les dossiers déjà faits, au lieu de les
   * laisser avec un hexadécimal orphelin dont plus personne ne sait le nom.
   */
  peinture?: string;
  /**
   * LE SOL CHOISI — une clé de `ui/habillage` (`SOLS`). Absent : la
   * maquette le devine d'après le nom de la pièce (parquet, carrelage).
   */
  sol?: string;
  /**
   * LES MURS D'ACCENT — identifiant de mur → clé de peinture. Seule la face
   * qui regarde CETTE pièce prend la teinte : le mur d'accent du séjour ne
   * déborde pas dans la chambre voisine.
   */
  accents?: Record<string, string>;
  /**
   * L'ÉTAGE de la pièce. Absent = rez-de-chaussée, comme pour les murs.
   * Ne pas confondre avec `floor`, qui est la couleur du SOL.
   */
  niveau?: number;
  /**
   * UN RECOIN QU'ON A DIT ÊTRE UNE PIÈCE — revue « Karim » : un placard
   * fermé, sans porte et sous 1,2 m², se lisait comme une gaine technique —
   * poché en noir, hors des surfaces. « C'est un placard » le déclare : il
   * reste une pièce à chaque redétection.
   */
  declaree?: boolean;
  /**
   * SA HAUTEUR SOUS PLAFOND À ELLE (m) — un faux plafond qui ne touche pas
   * aux murs partagés avec ses voisines. Voir `hauteurDeLaPiece`.
   */
  hauteur?: number;
  /**
   * CE QUE LE SCAN A MESURÉ DE LA PIÈCE, au-delà de ses murs : son plafond
   * relevé au LiDAR (hauteurs, rampant, surface habitable) et la surface de
   * son sol selon RoomPlan. Absent sur un relevé d'avant, ou dessiné.
   */
  releve?: { plafond?: PlafondDeLaPiece | null; surfaceSol?: number | null };
}

/**
 * LE RELEVÉ D'UNE PIÈCE, TIRÉ DU SCAN — le plafond dans son contour, le sol
 * que RoomPlan y a mesuré. `undefined` quand le scan n'en dit rien.
 */
/** Les portes qui mènent à une pièce non relevée (voir `geometry/traversee`). */
function marquerLesPortes<O extends WallSeg>(openings: O[], r: ScanResult): O[] {
  const ids = new Set(r.portesVersNonReleve ?? []);
  if (ids.size === 0) return openings;
  return openings.map((o) => (ids.has(o.id) ? { ...o, versNonReleve: true } : o));
}

function releveDeLaPiece(
  r: ScanResult,
  contour: { x: number; z: number }[],
  aire: number,
  /** Les murs de la pièce, dans le repère du scan : ses jambettes (voir `plafondDeLaPiece`). */
  murs: readonly { a: Pt; b: Pt; height: number }[] = [],
): RoomEntry['releve'] | undefined {
  const plafond = plafondDeLaPiece(r.maillage?.volume, contour, aire, murs);
  const surfaceSol = solReleveDe(r.sols, contour, murs);
  return plafond || surfaceSol ? { plafond, surfaceSol } : undefined;
}

/** Un dossier de la bibliothèque. Il ne porte qu'un nom : ce sont les scans
 *  qui désignent le dossier où ils sont rangés. */
export interface ScanFolder {
  id: string;
  name: string;
}

/**
 * Photo de repérage, punaisée sur un mur.
 *
 * Un relevé se fait vite ; sa relecture, trois jours plus tard, achoppe
 * toujours sur la même question — « c'était quoi, ce mur ? ». Le chemin
 * pointe un fichier des Documents de l'app : il ne survit PAS à une
 * réinstallation, comme le `.usdz` du scan, et l'app doit donc supporter
 * qu'il ait disparu.
 */
export interface ScanPhoto {
  id: string;
  wallId: string;
  /** Cote sur le mur (m depuis A), pour la punaise du plan. */
  along: number;
  /**
   * Le fichier de cache, dans les Documents de l'app. Il ne survit PAS à une
   * réinstallation : c'est `asset` qui le reconstruit.
   */
  path: string;
  /**
   * L'IDENTIFIANT DURABLE de l'image dans la photothèque de l'utilisateur.
   *
   * Les Documents de l'app disparaissent avec l'app ; la photothèque, elle,
   * appartient à l'utilisateur — l'image y survit à la réinstallation, part
   * dans sa sauvegarde iCloud et se retrouve dans ses Photos. Absent sur les
   * photos d'avant le coffre, et sur celles prises quand l'accès a été
   * refusé : le fichier est alors tout ce qu'on a.
   */
  asset?: string;
  /** Horodatage de la prise de vue. */
  at: number;
  /**
   * SON CALAGE SUR L'ÉLÉVATION DU MUR — absent tant qu'on ne l'a pas bougée.
   *
   * En fractions du mur, jamais en points d'écran : un calage retenu en
   * points ne veut plus rien dire sur un autre téléphone ni après une
   * rotation. Voir `ui/calage`.
   */
  calage?: Calage;
  /**
   * La FACE du mur qu'elle montre, quand on la connaît : une photo prise et
   * redressée par le scan regarde un côté précis du mur, et ne se pose que
   * derrière l'élévation de ce côté-là.
   */
  side?: 1 | -1;
  /**
   * PRISE ET REDRESSÉE PAR LE SCAN (voir `geometry/photosAuto`) : cadrée au
   * centimètre, elle couvre son mur ; elle n'a pas de punaise sur le plan —
   * chaque mur en a une.
   */
  auto?: boolean;
  /** Une photo du scan qu'on a recalée à la main : elle n'est plus garantie à l'échelle. */
  calageManuel?: boolean;
}

/** Ce qu'un brouillon retient : de quoi reprendre là où l'on s'est arrêté. */
export interface BrouillonScan {
  /** Horodatage de l'écriture : c'est lui qu'on montre à l'utilisateur. */
  at: number;
  name: string;
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  rooms: RoomEntry[];
  fixtures: Fixture[];
  ceiling: CeilingFixture[];
  /**
   * Absentes des brouillons écrits par les versions d'avant les notes : un
   * relevé sauvé il y a dix minutes par l'ancienne app doit se rouvrir.
   */
  notes?: PlanNote[];
  /** Les cotes posées à la règle. Absentes des brouillons d'avant. */
  mesures?: Mesure[];
  photos: ScanPhoto[];
  modelPath: string | null;
  /**
   * Le tableau relevé sur place, s'il y en a un. Le brouillon existe pour
   * qu'un téléphone qui meurt ne coûte pas la visite : le quart d'heure
   * passé à noter les départs d'un tableau en fait partie.
   */
  existant?: TableauExistant;
  /**
   * Et le chiffrage, pour la même raison — le filet retient tout ou il ment.
   *
   * Un devis touché rend le plan « à enregistrer » (voir `DevisEnregistre`),
   * donc le brouillon se réécrit à chaque geste sur le ticket : sans cette
   * ligne, il rendrait le plan sans son caddie, et l'on croirait avoir tout
   * retrouvé.
   */
  devis?: DevisEnregistre;
  /**
   * LE CARTOUCHE ET LE NORD — revue « Agathe » : la reprise d'un relevé
   * interrompu rendait un client, une adresse et un nord VIDES, et le premier
   * enregistrement les effaçait du dossier. Le PDF partait sans cartouche.
   * Absents des brouillons d'avant : on les reprend alors au dossier.
   */
  client?: string;
  address?: string;
  north?: number;
  /** Voir `cleDuReleve` : les passages de l'iPhone se reconnaissent après une reprise. */
  cleDuReleve?: string;
  /**
   * LE DOSSIER DONT CE BROUILLON EST LA RETOUCHE, s'il en a un.
   *
   * Sans lui, la reprise d'un dossier de bibliothèque renaissait en plan
   * SANS entrée : on enregistrait, et la bibliothèque portait deux « Maison
   * Dupont » — l'ancien sans les prises, le nouveau sans l'historique.
   * Absent des brouillons d'avant, et des relevés jamais enregistrés.
   */
  saveId?: string;
}

/**
 * UNE NOTE POSÉE SUR LE PLAN — le mot qu'on écrivait au crayon dans la marge.
 *
 * « Colonne montante ici », « attente TV à confirmer avec le client »,
 * « gaine à reprendre ». Ces phrases existent sur tous les plans papier du
 * métier, et l'application n'avait aucun endroit pour elles : le nom de
 * pièce nomme, le nom du plan est unique, l'appareillage se compte au métré.
 * Faute de place elles finissaient dans le nom du plan — « T3 Pasteur
 * (vérifier colonne) » — ou nulle part, c'est-à-dire dans la tête de celui
 * qui a fait le relevé, et qui n'est pas toujours celui qui pose.
 *
 * ELLE TIENT À UN POINT, PAS À UNE PIÈCE : ce qu'on signale est souvent
 * justement ce qui n'a pas encore de pièce — une arrivée dans un couloir,
 * un percement dans une cloison qu'on n'a pas fini de tracer.
 */
export interface PlanNote {
  id: string;
  /** Le texte, tel qu'il a été tapé. */
  text: string;
  /** Où elle est posée, dans le repère du plan. */
  at: Pt;
  /** L'étage qui la porte. Absent = le rez, comme partout ailleurs. */
  niveau?: number;
}

/** Un plan porte des mots, pas des paragraphes : au-delà, plus rien ne se lit. */
export const NOTE_MAX = 140;

/** Le chiffrage attaché à un plan : ce que l'écran du devis a retenu. */
export interface DevisEnregistre {
  gamme: GammeId;
  /** Clés des lignes écartées du ticket. */
  ecartes: string[];
  /** Quantités corrigées à la main, par clé de ligne. */
  quantites: Record<string, number>;
  /** Ce qu'on a pris au magasin. */
  ajouts: { code: string; quantite: number }[];
  /** Prix unitaires corrigés à la main, par clé de ligne. */
  prix?: Record<string, number>;
  /** Le numéro donné au devis à son premier envoi (voir `numeroterUnDevis`). */
  numero?: string;
  /** Les lignes libres de l'artisan (voir `LigneLibre`). */
  libres?: LigneLibre[];
  /** Les heures de pose corrigées, par famille. */
  heures?: Record<string, number>;
  /** Le taux de TVA choisi pour ce devis ; absent = celui du chantier. */
  tva?: number;
}

/**
 * UNE LIGNE LIBRE LUE SUR LE DISQUE, OU RIEN — un dossier abîmé ou d'une
 * autre version ne doit pas glisser un prix illisible dans un total.
 */
function ligneLibrePropre(x: unknown): LigneLibre | null {
  if (!x || typeof x !== 'object') return null;
  const l = x as Record<string, unknown>;
  if (typeof l.id !== 'string' || typeof l.designation !== 'string') return null;
  const nombre = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : null);
  const quantite = nombre(l.quantite);
  const puHt = nombre(l.puHt);
  if (quantite === null || puHt === null) return null;
  const type = l.type === 'mainDOeuvre' || l.type === 'forfait' ? l.type : 'fourniture';
  return {
    id: l.id,
    designation: l.designation,
    quantite,
    unite: typeof l.unite === 'string' ? l.unite : 'u',
    puHt: Math.round(puHt * 100) / 100,
    type,
  };
}

/**
 * LE TRAVAIL NON ENREGISTRÉ NE DEMANDE PLUS RIEN EN PARTANT — il se range.
 *
 * Relevé du patron : « lorsqu'on quitte un plan pas enregistré, on ne doit
 * plus voir le message pop-up qui embête ; on doit juste afficher dans la
 * liste des plans ce plan non enregistré, avec un "autosuppression dans", et
 * il s'autosupprime dans les 12 h, si c'est un plan qui n'a jamais été créé
 * avant. Si c'est une modification apportée à un plan existant, trouve un
 * moyen peu gênant de faire comprendre qu'il faut sauvegarder son plan pour
 * ne pas risquer de le perdre. »
 *
 * Douze heures : la journée de chantier, et la soirée où l'on reprend ses
 * relevés au calme. Au-delà, ce qu'on n'a pas voulu garder s'en va seul.
 */
export const GARDE_NON_ENREGISTRE_MS = 12 * 3600 * 1000;

/** Ce qu'un plan contient — ce qu'une retouche remplace en entier. */
export type ContenuDuPlan = Pick<
  SavedScan,
  | 'name'
  | 'client'
  | 'address'
  | 'rooms'
  | 'walls'
  | 'openings'
  | 'objects'
  | 'fixtures'
  | 'photos'
  | 'ceiling'
  | 'notes'
  | 'mesures'
  | 'north'
  | 'modelPath'
  | 'devis'
  | 'existant'
  | 'cleDuReleve'
>;

/**
 * LES MODIFICATIONS D'UN PLAN ENREGISTRÉ, GARDÉES À CÔTÉ DE LUI.
 *
 * On ne les écrit PAS dans le plan : il reste tel qu'on l'a enregistré, et
 * c'est ce qu'un export, une copie ou le compte en ligne en voient. Elles
 * attendent ici qu'on les enregistre — d'un appui sur la pastille qui le
 * propose en sortant, sur le « … » de la ligne, ou en rouvrant le plan, qui
 * les reprend telles quelles. Sinon elles s'en vont à `jusqua`.
 */
export interface RetoucheEnAttente {
  /** Quand on les a laissées. */
  at: number;
  /** Quand elles s'en iront, si personne ne les enregistre. */
  jusqua: number;
  plan: ContenuDuPlan;
}

export interface SavedScan {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /**
   * UN PLAN JAMAIS ENREGISTRÉ, rangé en partant : il s'efface seul à cette
   * date. Absent = un plan enregistré, qui ne s'efface jamais seul.
   */
  supprimeLe?: number;
  /**
   * MIS À LA CORBEILLE CE JOUR-LÀ (ms) — revues « Fatou » et « Hugo ».
   * Supprimer effaçait pour de bon, copie en ligne comprise, après un
   * bandeau de 4,5 s ; en supprimer un second pendant ce temps emportait le
   * premier sans retour. Le plan attend désormais 30 jours à la corbeille,
   * sa copie en ligne avec lui, et se restaure d'un geste.
   */
  corbeille?: number;
  /** Des modifications laissées sans être enregistrées. */
  retouche?: RetoucheEnAttente;
  modelPath: string | null;
  rooms: RoomEntry[];
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  /** Appareillage électrique ajouté à la main. Absent des scans d'avant. */
  fixtures?: Fixture[];
  /** Photos de repérage. Absentes des scans d'avant. */
  photos?: ScanPhoto[];
  /** Appareils de plafond — points lumineux, détecteurs, VMC. */
  ceiling?: CeilingFixture[];
  /** Notes écrites sur le plan. Absentes des relevés d'avant. */
  notes?: PlanNote[];
  /** Cotes posées à la règle libre. Absentes des relevés d'avant. */
  mesures?: Mesure[];
  /**
   * LE TABLEAU QU'ON A TROUVÉ EN ARRIVANT.
   *
   * Un relevé de rénovation porte deux installations : celle qui existe et
   * celle qu'on va poser. La première ne se dessine pas sur le plan — c'est
   * une liste de départs — mais elle voyage avec le scan et s'imprime dans
   * le dossier. Absente sur un chantier neuf, et sur tous les scans d'avant
   * la rénovation.
   */
  existant?: TableauExistant;
  /**
   * LE CHIFFRAGE FAIT SUR CE PLAN — gamme, écartés, quantités, caddie.
   *
   * Relevé du patron : « fais en sorte que le devis soit sauvegardé avec le
   * plan actuel ». Tout cela vivait dans le magasin de l'application et nulle
   * part ailleurs : un dossier rouvert le lendemain revenait en Céliane avec
   * un ticket vierge, et le travail de chiffrage était à refaire.
   *
   * PIRE, IL PASSAIT D'UN CHANTIER À L'AUTRE : les articles pris au magasin
   * pour un logement se retrouvaient sur le devis du suivant, puisque rien ne
   * les effaçait entre deux relevés. Un devis faux dans le sens qui coûte.
   *
   * Absent des relevés d'avant ce jour : ils s'ouvrent sur un ticket neuf,
   * comme ils l'ont toujours fait.
   */
  devis?: DevisEnregistre;
  /**
   * L'IDENTITÉ DU RELEVÉ SCANNÉ, telle que les passages de l'iPhone la
   * portent (voir `passagesNatifs`). Un dossier rouvert dans la même session
   * se reconnaît : « Scanner une pièce » y réunit ses passages. Absent des
   * plans dessinés et des relevés d'avant.
   */
  cleDuReleve?: string;
  /** Dossier qui contient ce scan. Absent = à la racine. */
  folderId?: string;
  /**
   * À QUI EST CE RELEVÉ : le client, et l'adresse du chantier.
   *
   * Un scan ne s'appelait que « Scan du 17/08 à 11h54 ». À trente relevés,
   * plus personne ne sait lequel est le T3 de la rue Pasteur — et le
   * dossier remis au client ne portait que le nom du fichier, là où un
   * devis porte toujours le nom de celui qui le reçoit.
   */
  client?: string;
  address?: string;
  /**
   * Cap de l'axe −Z du repère de scan, en degrés depuis le nord. Absent
   * quand le magnétomètre n'a rien donné de sûr — et sur tous les scans
   * d'avant la boussole.
   */
  north?: number;
  /** Scans d'avant le multi-pièces : nom unique de la pièce. */
  roomName?: string;
  /** Scans d'avant le multi-pièces : sol unique. */
  floor?: FloorData | null;
}

/**
 * Nomme les pièces d'un scan.
 *
 * Le type vient du mobilier (`deduceRoomKind`) ; deux chambres dans le même
 * appartement deviennent « Chambre » et « Chambre 2 ». Quand rien n'est assez
 * net pour trancher, la pièce prend son rang : « Pièce 3 ».
 */
/**
 * UN COULOIR SE RECONNAÎT À SA FORME — revues « Thomas » et « Gérard » :
 * RoomPlan ne nomme jamais un couloir, qui n'a pas de meuble ; il restait
 * « Pièce 2 », et le tableau et le détecteur de fumée, qui vont en
 * circulation, partaient au séjour. Une pièce de 2 m² au moins, large de
 * 1,60 m au plus et deux fois et demie plus longue que large en est un. La
 * largeur se lit de l'aire et du tour : un couloir en L aussi.
 */
function estUnCouloir(contour: Pt[]): boolean {
  if (contour.length < 3) return false;
  let aire = 0;
  let tour = 0;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    aire += contour[j].x * contour[i].z - contour[i].x * contour[j].z;
    tour += Math.hypot(contour[i].x - contour[j].x, contour[i].z - contour[j].z);
  }
  aire = Math.abs(aire) / 2;
  const demi = tour / 2;
  const disc = demi * demi - 4 * aire;
  if (aire < 2 || disc < 0) return false;
  const largeur = (demi - Math.sqrt(disc)) / 2;
  return largeur <= 1.6 && demi - largeur >= 2.5 * largeur;
}

/**
 * LES GARAGES — voir `porteDeGarage`. Une pièce dont rien ne dit l'usage,
 * ou que seuls un congélateur, un lave-linge disent cellier ou cuisine, et
 * qui s'ouvre sur la rue par une porte de garage, est un garage. Le type
 * est réécrit sur place ; rend les portes de garage trouvées.
 */
function nommerLesGarages(
  kinds: (RoomKind | null)[],
  contours: Pt[][],
  categoriesDe: (i: number) => string[],
  openings: WallSeg[],
  walls: WallSeg[],
): Set<string> {
  const portes = new Set<string>();
  kinds.forEach((k, i) => {
    const categories = categoriesDe(i);
    const cuisine = categories.some((c) => /stove|oven|dishwasher|sink/i.test(c));
    if (k && k !== 'cellier' && !(k === 'kitchen' && !cuisine)) return;
    const porte = porteDeGarage(contours[i] ?? [], contours, openings, categories, walls);
    if (!porte) return;
    kinds[i] = 'garage';
    portes.add(porte);
  });
  return portes;
}

/**
 * LA NICHE FERMÉE PAR UNE FAÇADE DE PLACARD S'APPELLE « PLACARD » — revue
 * d'un expert : elle ressortait « Pièce 2 », 1,2 m², avec l'alerte « pièce
 * minuscule ». Une petite pièce sans meuble parlant, dont un mur porte une
 * façade de placard et aucune autre porte.
 */
function nommerLesPlacards(
  names: string[],
  kinds: (RoomKind | null)[],
  shapes: { outline: Pt[]; wallIds: string[]; area: number }[],
  walls: WallSeg[],
  openings: WallSeg[],
): string[] {
  const facades = openings.filter((o) => o.placard);
  if (facades.length === 0) return names;
  return names.map((nom, i) => {
    const sh = shapes[i];
    if (kinds[i] || !sh || sh.area <= 0 || sh.area >= 3) return nom;
    const siens = walls.filter((w) => sh.wallIds.includes(w.id));
    const surSesMurs = (o: WallSeg) => {
      const mur = murDeLOuverture(o, siens);
      return !!mur && pointOnSeg({ x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 }, mur.a, mur.b).dist < 0.1;
    };
    if (!facades.some(surSesMurs)) return nom;
    if (openings.some((o) => !o.placard && o.type !== 'window' && surSesMurs(o))) return nom;
    return 'Placard';
  });
}

function nameRooms(kinds: (RoomKind | null)[], contours?: Pt[][]): string[] {
  const taken: string[] = [];
  return kinds.map((kind, i) => {
    const couloir = !kind && !!contours?.[i] && estUnCouloir(contours[i]);
    if (!kind && !couloir) return `Pièce ${i + 1}`;
    const base = kind ? roomKindLabel(kind) : 'Couloir';
    const same = taken.filter(
      (n) => n === base || n.startsWith(`${base} `),
    ).length;
    const name = same === 0 ? base : `${base} ${same + 1}`;
    taken.push(name);
    return name;
  });
}

/**
 * LE MEUBLE NE VOTE QUE CHEZ LUI — revue « Camille » : le séjour manqué au
 * scan, son lit, son canapé et sa table se rattachaient à la pièce la plus
 * proche — et le dégagement s'appelait « Cuisine 2 ». Le rattachement au
 * plus proche reste (une télé plaquée au mur a son centre dehors), mais
 * seul ce qui est dans la pièce, ou à moins d'un demi-mètre de son
 * contour, dit ce qu'elle est.
 */
function voteDansLaPiece(o: { transform: number[] }, contour: Pt[]): boolean {
  // Sans contour (rien ne se referme), tout ce qui est relevé parle encore.
  if (contour.length < 3) return true;
  const p = { x: o.transform[12], z: o.transform[14] };
  if (pointInPolygon(p, contour)) return true;
  for (let a = 0, b = contour.length - 1; a < contour.length; b = a++) {
    if (pointOnSeg(p, contour[b], contour[a]).dist < 0.5) return true;
  }
  return false;
}

/**
 * UN SEUL EXEMPLAIRE DE CHAQUE NOM — revue « Camille » : deux « Cuisine 2 »
 * renumérotées donnaient « Cuisine 2 2 ». Le premier garde son nom ; le
 * suivant prend le premier numéro libre de la même base (« Cuisine 3 »).
 */
function sansNomEnDouble(rooms: RoomEntry[]): void {
  const pris = new Set<string>();
  for (const r of rooms) {
    if (!r.name || !pris.has(r.name)) {
      if (r.name) pris.add(r.name);
      continue;
    }
    const base = r.name.replace(/ \d+$/, '');
    let k = 2;
    while (pris.has(`${base} ${k}`)) k++;
    r.name = `${base} ${k}`;
    pris.add(r.name);
  }
}

/**
 * Premier point où un rayon parti de `from` rencontre le contour d'une pièce.
 * Sert à poser une cloison qui touche pile les murs, des deux côtés.
 */
function castToOutline(
  from: { x: number; z: number },
  dir: { x: number; z: number },
  poly: { x: number; z: number }[],
): { x: number; z: number } | null {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j];
    const q = poly[i];
    const ex = q.x - p.x;
    const ez = q.z - p.z;
    const den = dir.x * ez - dir.z * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p.x - from.x) * ez - (p.z - from.z) * ex) / den;
    const u = ((p.x - from.x) * dir.z - (p.z - from.z) * dir.x) / den;
    if (t > 1e-4 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
  }
  if (!isFinite(best)) return null;
  return { x: from.x + dir.x * best, z: from.z + dir.z * best };
}

/**
 * REMPLACE UNE TRANCHE D'UNE LISTE, À SA PLACE.
 *
 * Un geste fait sur un niveau rend la tranche de ce niveau refaite ; le
 * reste de la liste ne bouge pas, et la tranche reprend la place qu'elle
 * avait — un plan de plain-pied garde l'ordre exact d'avant.
 */
function remplacer<T>(tout: T[], tranche: T[], neufs: T[]): T[] {
  if (tranche.length === tout.length) return neufs;
  const dedans = new Set(tranche);
  const reste = tout.filter((x) => !dedans.has(x));
  const i = tout.findIndex((x) => dedans.has(x));
  const at = i < 0 ? reste.length : tout.slice(0, i).filter((x) => !dedans.has(x)).length;
  return [...reste.slice(0, at), ...neufs, ...reste.slice(at)];
}

/** Ce que montre un niveau du plan à l'écran : le filtre du plan lui-même. */
function jeuDuNiveau(
  st: Pick<ScanState, 'walls' | 'openings' | 'rooms' | 'fixtures' | 'photos' | 'objects' | 'ceiling'>,
  n: number,
) {
  return filtrerAuNiveau(
    {
      walls: st.walls,
      openings: st.openings,
      rooms: st.rooms,
      fixtures: st.fixtures,
      photos: st.photos,
      objects: st.objects,
      ceiling: st.ceiling,
    },
    n,
  );
}

/**
 * CE QUI VIENT DU RELEVÉ porte l'identifiant que RoomPlan lui a donné — un
 * UUID, suffixé quand un étage ou un découpage l'a repris. Ce qui a été
 * tracé ou posé à la main porte le nôtre (`mur-`, `cl-`, `mb-`…).
 */
export function duReleve(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(id);
}

/**
 * Le groupe (`roomId`) que portent les murs d'une pièce, s'ils en portent un
 * — celui du plus grand nombre. Une pièce scannée n'en a pas : rien.
 */
function groupeDesMurs(murs: { roomId?: string }[]): { roomId?: string } {
  const compte = new Map<string, number>();
  for (const w of murs) if (w.roomId) compte.set(w.roomId, (compte.get(w.roomId) ?? 0) + 1);
  let roomId: string | undefined;
  let max = 0;
  for (const [id, k] of compte) if (k > max) [roomId, max] = [id, k];
  return roomId ? { roomId } : {};
}

/**
 * LA HAUTEUR D'UNE PIÈCE NEUVE : celle de SON niveau — revue « Léa » : les
 * pièces dessinées à l'étage prenaient la hauteur du rez-de-chaussée (le
 * premier mur du plan). Sans mur à ce niveau, celle du plan ; sans plan,
 * 2,50 m.
 */
function hauteurDuNiveau(walls: WallSeg[], n: number): number {
  return (walls.find((w) => w.type === 'wall' && niveauDe(w) === n) ?? walls[0])?.height ?? 2.5;
}

/** Le temps qu'un plan attend à la corbeille avant de s'effacer : 30 jours. */
export const CORBEILLE_MS = 30 * 24 * 3600 * 1000;

/** Les plans de la bibliothèque, hors corbeille. */
export const horsCorbeille = <T extends { corbeille?: number }>(saves: T[]): T[] =>
  saves.some((x) => x.corbeille) ? saves.filter((x) => !x.corbeille) : saves;

/**
 * COUPER UN NOM SANS CASSER UN CARACTÈRE — revue « Hugo » : la coupe à 40
 * laissait la moitié d'un émoji (`\ud83d` orphelin).
 */
export function couperLeNom(nom: string, max: number): string {
  const lettres = Array.from(nom);
  return lettres.length <= max ? nom : lettres.slice(0, max).join('').trimEnd();
}

/**
 * UN NOM DE PIÈCE QUE PERSONNE NE PORTE ENCORE — revues « Hugo » et
 * « Inès ». On comptait les homonymes au lieu de chercher un rang libre
 * (« Chambre, Bureau, Chambre 3, Chambre 3 », une « Chambre 4 » sans 2 ni
 * 3), la coupe à 40 venait après le numéro (deux noms longs identiques),
 * et deux gabarits « Salle de bains » le restaient. Le premier rang libre,
 * et le numéro après la coupe.
 */
export function nomDePieceLibre(nom: string, pris: string[], max = 40): string {
  const propre = couperLeNom(nom.trim(), max);
  if (!propre) return '';
  const deja = new Set(pris.map((x) => x.trim().toLowerCase()));
  if (!deja.has(propre.toLowerCase())) return propre;
  const base = propre.replace(/ \d+$/, '');
  for (let k = 2; ; k++) {
    const suffixe = ` ${k}`;
    const essai = `${couperLeNom(base, max - suffixe.length)}${suffixe}`;
    if (!deja.has(essai.toLowerCase())) return essai;
  }
}

/**
 * Un nom de plan que personne ne porte encore : « Version A », sinon
 * « Version A — version 2 », « — version 3 »…
 */
export function nomDeVersion(nom: string, pris: string[]): string {
  const deja = new Set(pris.map((x) => x.trim().toLowerCase()));
  if (!deja.has(nom.trim().toLowerCase())) return nom.trim();
  const base = nom.trim().replace(/ — version \d+$/, '');
  let k = 2;
  while (deja.has(`${base} — version ${k}`.toLowerCase())) k++;
  return `${base} — version ${k}`;
}

/**
 * UN APPAREIL DE PLAFOND BOUGE AVEC SON TRACÉ — le ruban LED n'est pas un
 * point : quand la pièce glisse, se recadre ou tourne, chaque point de son
 * tracé suit le même chemin que son ancre.
 */
function avecSaTrace(cl: CeilingFixture, f: (p: Pt) => Pt): CeilingFixture {
  return cl.trace ? { ...cl, at: f(cl.at), trace: cl.trace.map(f) } : { ...cl, at: f(cl.at) };
}

/** Une clé de relevé : unique, courte, sans signification. */
function nouvelleCle(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Pièce à laquelle rattacher un point. Un meuble plaqué contre un mur — une
 * télé, une étagère — a souvent son centre HORS du contour : on prend alors
 * la pièce la plus proche, et non la première venue.
 */
function roomIndexAt(p: { x: number; z: number }, outlines: Pt[][]): number {
  const inside = outlines.findIndex(
    (o) => o.length >= 3 && pointInPolygon(p, o),
  );
  if (inside >= 0) return inside;
  let best = 0;
  let bestD = Infinity;
  outlines.forEach((o, i) => {
    for (let a = 0, b = o.length - 1; a < o.length; b = a++) {
      const d = pointOnSeg(p, o[b], o[a]).dist;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  });
  return best;
}

/**
 * CE QUI EST ACCROCHÉ AU MUR DESCEND AVEC LUI.
 *
 * Abaisser un mur sans rien d'autre laisse une prise flottant DANS le
 * plafond et une porte qui dépasse du toit. Ni l'une ni l'autre ne se voit
 * sur le plan 2D — on ne s'en aperçoit qu'en élévation, ou au métré,
 * c'est-à-dire trop tard.
 *
 * LE RÉGLAGE PAR MUR LE FAISAIT, LE RÉGLAGE PAR PIÈCE NON. Le second posait
 * la hauteur sur ses murs et s'arrêtait là : abaisser une pièce de 2,50 à
 * 2,00 — un sous-sol, un comble aménagé, un plafond mal vu par RoomPlan —
 * laissait toutes les prises hautes et les portes entières dans un logement
 * qui ne les contenait plus. Trouvé en relisant les deux actions côte à
 * côte, après avoir ajouté « la même hauteur partout », qui héritait du
 * même silence. Un seul calcul, une seule correction, trois actions.
 *
 * On reçoit les murs dans leur hauteur NEUVE : c'est leur plafond qui sert
 * de règle, et leur sol qui reste où il est.
 */
function rabattreSousLePlafond(
  murs: WallSeg[],
  fixtures: Fixture[],
  openings: WallSeg[],
): { fixtures: Fixture[]; openings: WallSeg[] } {
  const parId = new Map(murs.map((w) => [w.id, w]));
  const murDe = new Map<string, WallSeg>();
  for (const w of murs) {
    // Les baies de SON niveau : une chambre de l'étage mise à 2,20 rabotait
    // les fenêtres du séjour en dessous (revue « Léa »).
    for (const o of openingsOn([w], openings.filter((x) => niveauDe(x) === niveauDe(w)))) murDe.set(o.id, w);
  }
  return {
    fixtures: fixtures.map((f) => {
      const w = parId.get(f.wallId ?? '');
      if (!w) return f;
      const sol = w.yCenter - w.height / 2;
      // C'est son AXE qu'on range, pas son bord : un appareil a une taille.
      const demi = (FIXTURES[f.kind]?.h ?? 0.1) / 2;
      const haut = sol + w.height - demi;
      const bas = sol + demi;
      if (f.height <= haut) return f;
      return { ...f, height: Math.max(bas, haut) };
    }),
    openings: openings.map((o) => {
      const w = murDe.get(o.id);
      if (!w) return o;
      const sol = w.yCenter - w.height / 2;
      const base = o.yCenter - o.height / 2;
      const plafond = sol + w.height;
      if (base + o.height <= plafond) return o;
      // On rabat d'abord le linteau ; si l'allège elle-même est au-dessus
      // du nouveau plafond, la baie redescend jusqu'au sol.
      const h = Math.max(0.2, Math.min(o.height, plafond - base));
      const b = Math.min(base, plafond - h);
      return { ...o, height: h, yCenter: b + h / 2 };
    }),
  };
}

/**
 * LES COTES DU BÂTIMENT COURANT, par nature de menuiserie.
 *
 * Une ouverture posée à la main prenait 60 % de la longueur du mur et 85 %
 * de sa hauteur : sur un mur de cinq mètres, une baie de trois mètres sur
 * deux dix. Ce ne sont les proportions d'aucune menuiserie — c'était un
 * trou, à recoter entièrement à la main.
 *
 * On pose donc ce qu'un électricien retrouve sur neuf chantiers sur dix :
 * le passage de circulation 83, la fenêtre à allège 95. Rien ici n'est un
 * réglage d'application : ce sont des cotes de catalogue, un point de
 * départ qu'on corrige au bandeau quand le mètre dit autre chose.
 */
export const COTES_MENUISERIE: Record<
  'door' | 'window' | 'opening',
  { largeur: number; hauteur: number; allege: number }
> = {
  door: { largeur: 0.83, hauteur: 2.04, allege: 0 },
  window: { largeur: 1.2, hauteur: 1.15, allege: 0.95 },
  // Une baie libre est un passage : la largeur d'une porte double moins un
  // dormant, et la hauteur d'un linteau de circulation.
  opening: { largeur: 0.9, hauteur: 2.1, allege: 0 },
};

/** Mur le plus proche d'une ouverture, et à quelle distance. */
function nearestWall(o: WallSeg, walls: WallSeg[]): { dist: number } {
  const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
  let dist = Infinity;
  for (const w of walls) {
    dist = Math.min(dist, pointOnSeg(mid, w.a, w.b).dist);
  }
  return { dist };
}

/**
 * REMET LE BLANC D'APLOMB SUR TOUT UN RELEVÉ.
 *
 * Relevé du patron : « mon mur blanc devient marron ». Le relevé est fidèle
 * — une caméra ne voit pas une couleur, elle voit une couleur ÉCLAIRÉE — et
 * c'est justement pour ça qu'il faut le corriger avant de le montrer.
 *
 * ICI ET PAS AU RENDU : la 3D, le plan 2D, le PDF et l'export lisent tous
 * les mêmes champs. Corrigé une fois à l'arrivée du scan, tout le monde voit
 * la même chose, et personne n'a à se souvenir d'appliquer un gain.
 */
function blancsDAplomb<
  W extends { color?: string; texture?: SurfaceTexture },
  O extends { color?: string; texture?: SurfaceTexture },
>(walls: W[], objects: O[]): { walls: W[]; objects: O[] } {
  return equilibrerLaScene({ walls, objects });
}

/** Relevés de sol indexés par pièce, tels que `buildScene` les attend. */
export function floorsOf(
  rooms: RoomEntry[],
): Record<string, FloorData | null | undefined> {
  const out: Record<string, FloorData | null | undefined> = {};
  for (const r of rooms) out[r.id] = r.floor;
  return out;
}

/** Scans enregistrés avant le multi-pièces : une seule pièce, implicite. */
/**
 * DÉSENCHÊTRE LE MOBILIER D'UN RELEVÉ.
 *
 * Appelé à l'ouverture d'un scan, une fois pour toutes : deux meubles que le
 * scanner a fait se traverser sont écartés du strict nécessaire. Voir
 * `separerMeubles` pour les trois garde-fous — chevauchement franc seulement,
 * le plus petit cède, jamais plus que la pénétration.
 *
 * C'est une modification du relevé, demandée en connaissance de cause : sur le
 * modèle, une table qui traverse un canapé coûte plus cher en crédibilité
 * qu'un meuble déplacé de trois centimètres.
 */
function separerLeMobilier(
  objects: ObjectData[],
  /*
    NIVEAU PAR NIVEAU — revue « Nadia » : à la réouverture d'une maison,
    les meubles des deux étages, recalés l'un au-dessus de l'autre, se
    poussaient mutuellement. Le WC du bas reculait de 68 cm, le lit de la
    chambre traversait la façade, et la retouche suivante l'enregistrait.
    Avec ses pièces, chaque étage ne se sépare que de lui-même.
  */
  rooms?: readonly { id: string; niveau?: number }[],
): ObjectData[] {
  if (rooms && objects.length >= 2) {
    const niveauDuMeuble = (o: ObjectData) => niveauDe(rooms.find((r) => r.id === o.roomId));
    const niveaux = [...new Set(objects.map(niveauDuMeuble))];
    if (niveaux.length > 1) {
      const suite = objects.map((o) => o);
      for (const n of niveaux) {
        const indices = objects.map((o, i) => (niveauDuMeuble(o) === n ? i : -1)).filter((i) => i >= 0);
        const separes = separerLeMobilier(indices.map((i) => objects[i]));
        indices.forEach((i, k) => {
          suite[i] = separes[k];
        });
      }
      return suite;
    }
  }
  if (objects.length < 2) return objects;
  const bouges = separerMeubles(
    objects.map((o) => ({
      category: o.category,
      cx: o.transform[12],
      cz: o.transform[14],
      width: o.width,
      depth: o.depth,
      yaw: Math.atan2(o.transform[2], o.transform[0]),
      y0: o.transform[13] - o.height / 2,
      y1: o.transform[13] + o.height / 2,
    })),
  );
  if (bouges.length === 0) return objects;
  const suite = objects.map((o) => o);
  for (const b of bouges) {
    const o = suite[b.index];
    const t = [...o.transform];
    t[12] += b.dx;
    t[14] += b.dz;
    suite[b.index] = { ...o, transform: t };
  }
  return suite;
}

function migrateSave(brut: SavedScan): SavedScan {
  /*
    LES ÉCLATS D'UN PLAN D'AVANT S'EN VONT À L'OUVERTURE — un « mur » de
    0 cm sur un coin empêchait sa pièce de se fermer (voir `ECLAT`). Le
    plan et ses retouches en attente.
  */
  const propre = sansEclats(brut.walls ?? [], brut.rooms ?? []);
  let s: SavedScan =
    propre.walls === (brut.walls ?? []) ? brut : { ...brut, walls: propre.walls, rooms: propre.rooms };
  /*
    D'ABORD, LES BAIES D'AVANT PRENNENT LE NIVEAU DE LEUR MUR — tout ce qui
    suit se fait étage par étage (revue « Nadia »).

    LES BAIES D'AVANT PRENNENT LE NIVEAU DE LEUR MUR — revue « Léa » : posées
    à l'étage, elles n'en portaient aucun et se rangeaient au
    rez-de-chaussée. On ne tranche que quand un seul niveau a un mur sous la
    baie ; deux niveaux superposés au même endroit, on ne devine pas.
  */
  if ((s.openings ?? []).some((o) => o.niveau === undefined) && (s.walls ?? []).some((w) => niveauDe(w) !== NIVEAU_RDC)) {
    const murs = (s.walls ?? []).filter((w) => w.type === 'wall');
    let change = false;
    const baies = s.openings.map((o) => {
      if (o.niveau !== undefined) return o;
      const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
      const niveaux = new Set(murs.filter((w) => pointOnSeg(mid, w.a, w.b).dist < 0.3).map((w) => niveauDe(w)));
      if (niveaux.size !== 1) return o;
      const n = [...niveaux][0];
      if (n === NIVEAU_RDC) return o;
      change = true;
      return { ...o, niveau: n };
    });
    if (change) s = { ...s, openings: baies };
  }
  /*
    LA BAIE VITRÉE D'UN PLAN D'AVANT, rangée parmi les portes : elle balayait
    le séjour d'un vantail de 2,40 m (voir `baiesVitrees`). Les contours sont
    ceux des pièces DE SON ÉTAGE : celles du dessous ne disent pas si elle
    donne dehors.
  */
  if ((s.openings ?? []).some((o) => o.type === 'door' && segLength(o) >= LARGEUR_DE_BAIE)) {
    const niveaux = [...new Set(s.openings.map((o) => niveauDe(o)))];
    let ouvertures = s.openings;
    for (const n of niveaux) {
      const murs = (s.walls ?? []).filter((w) => niveauDe(w) === n);
      const contours = roomParts(murs, (s.rooms ?? []).filter((r) => niveauDe(r) === n))
        .map((p) => p.surface?.pts ?? [])
        .filter((c) => c.length >= 3);
      const ici = ouvertures.filter((o) => niveauDe(o) === n);
      const revues = baiesVitrees(ici, murs, contours);
      if (revues !== ici) {
        const parId = new Map(revues.map((o) => [o.id, o]));
        ouvertures = ouvertures.map((o) => parId.get(o.id) ?? o);
      }
    }
    if (ouvertures !== s.openings) s = { ...s, openings: ouvertures };
  }
  /*
    LA PORTE D'UN PLAN D'AVANT, ENFONCÉE DANS LE MUR D'ANGLE — relevé du
    patron : « la porte est imbriquée dans le mur, cachant une partie ». Elle
    se dégage à l'ouverture du plan (voir `baiesHorsDesAngles`).
  */
  if ((s.openings ?? []).length > 0) {
    const recalees = baiesHorsDesAngles(s.openings, s.walls ?? []);
    if (recalees !== s.openings) s = { ...s, openings: recalees };
  }
  if (s.retouche?.plan?.walls) {
    const r = sansEclats(s.retouche.plan.walls, s.retouche.plan.rooms ?? []);
    if (r.walls !== s.retouche.plan.walls) {
      s = { ...s, retouche: { ...s.retouche, plan: { ...s.retouche.plan, walls: r.walls, rooms: r.rooms } } };
    }
  }
  const fixtures = Array.isArray(s.fixtures) ? s.fixtures : [];
  if (Array.isArray(s.rooms) && s.rooms.length > 0) {
    return s.fixtures === fixtures ? s : { ...s, fixtures };
  }
  return {
    ...s,
    fixtures,
    rooms: [
      { id: DEFAULT_ROOM_ID, name: s.roomName ?? '', floor: s.floor ?? null },
    ],
  };
}

/**
 * L'ancienne clé : TOUTE la bibliothèque dans une seule chaîne JSON.
 *
 * Elle n'est plus écrite, seulement lue une dernière fois pour reprendre les
 * scans d'avant. On la garde nommée ici : un jour où l'autre quelqu'un se
 * demandera pourquoi il traîne une clé « v1 » dans le stockage.
 */
/**
 * PURGE LES LIENS MORTS — par TOUS les chemins de suppression.
 *
 * `removeFixture` faisait le ménage, mais un interrupteur part aussi avec
 * son mur ou sa pièce : les `commands` gardaient alors son id, le contrôle
 * croyait le point « commandé » à jamais, et le constat « sans commande »
 * ne tombait plus. La règle vit ici, et chaque suppression la traverse.
 */
function sansLiensMorts(
  fixtures: Fixture[],
  ceiling: CeilingFixture[],
): { fixtures: Fixture[]; ceiling: CeilingFixture[] } {
  const vivants = new Set(fixtures.map((f) => f.id));
  const purge = (commands?: string[]) => {
    if (!commands) return commands;
    const restants = commands.filter((x) => vivants.has(x));
    if (restants.length === commands.length) return commands;
    return restants.length > 0 ? restants : undefined;
  };
  return {
    fixtures: fixtures.map((f) => ({ ...f, commands: purge(f.commands) })),
    ceiling: ceiling.map((c) => ({ ...c, commands: purge(c.commands) })),
  };
}

const STORAGE_KEY = 'roomscanner.saves.v1';
/** L'ordre des scans. Le contenu, lui, vit une clé par scan. */
const INDEX_KEY = 'roomscanner.index.v2';
const scanKey = (id: string) => `roomscanner.scan.v2.${id}`;
/**
 * LE BROUILLON — le relevé en cours, écrit sans qu'on le demande.
 *
 * Un scan tenait entièrement en mémoire tant qu'on n'avait pas touché
 * « Enregistrer ». Une app tuée par le système — un appel, une photo, un
 * téléphone à court de mémoire — et la visite était à refaire. C'est le seul
 * défaut de cette application qui coûte un déplacement.
 *
 * Il ne remplace pas la bibliothèque : c'est un filet, effacé dès que le
 * relevé est enregistré pour de bon.
 */
const DRAFT_KEY = 'roomscanner.brouillon.v1';
const FOLDERS_KEY = 'roomscanner.folders.v1';
/** La plus grande cote qu'un mur puisse recevoir. Voir `setWallLength`. */
const MUR_MAX_M = 60;
/*
  LA LONGUEUR DES NOMS, BORNÉE À LA SAISIE.

  Le cartouche d'une pièce fait quelques centimètres sur le plan, et la
  ligne d'un scan dans la bibliothèque une largeur d'écran. Deux cents
  caractères n'y tiennent pas : ils se tronquent à l'affichage, mais on les
  traîne dans chaque export, dans chaque sauvegarde et dans le courrier du
  support. On coupe donc une fois pour toutes, là où le nom entre.
*/
/** Les longueurs permises d'un nom : une pièce, un plan (revue « Hugo »). */
export const NOM_PIECE_MAX = 40;
export const NOM_PLAN_MAX = 60;
const THEME_KEY = 'roomscanner.themePref.v1';
const ACCENT_KEY = 'roomscanner.accentPref.v1';
const ICONE_KEY = 'roomscanner.iconePref.v1';
const COLORS_KEY = 'roomscanner.openingColors.v1';
const FURNITURE_KEY = 'roomscanner.showFurniture.v1';
const SURFACES_KEY = 'roomscanner.showSurfaces.v1';
const TEXTURES_KEY = 'roomscanner.showTextures.v1';
/**
 * LE MARQUEUR « J'AI DÉJÀ REPRIS MES PLANS ICI ».
 *
 * Il vit dans le stockage de l'application — donc il PART avec elle. C'est
 * exactement ce qu'on veut : une réinstallation le perd, et la reprise se
 * refait ; une app qui tourne depuis six mois le garde, et ne redemande
 * jamais rien au serveur.
 *
 * Sans lui, chaque lancement reposerait les plans que l'électricien a
 * supprimés la veille : le contraire d'un service.
 */
const REPRISE_KEY = 'roomscanner.reprise.v1';

/**
 * TROIS CHOIX, ET « SYSTÈME » EN FAIT PARTIE.
 *
 * Le thème se bornait à clair ou sombre, choisis à la main sur l'accueil.
 * Un électricien passe sa journée dehors et sa soirée dans un tableau
 * électrique : c'est le téléphone qui sait quand basculer, pas nous. Le
 * réglage rejoint donc la page profil avec l'option qui manquait — suivre
 * l'appareil — et c'est elle qui accueille les nouveaux venus.
 */
export type ThemePref = 'system' | 'light' | 'dark';

/**
 * CE QUI EST DÉJÀ SUR LE DISQUE, par scan — pour n'écrire QUE ce qui change.
 *
 * On gardait le JSON ENTIER de chaque plan, et chaque sauvegarde
 * resérialisait TOUTE la bibliothèque pour la comparer à ces copies : trente
 * plans, plus d'un mégaoctet de JSON fabriqué sur le fil de l'interface à
 * chaque renommage — et surtout à la sortie du plan, en pleine transition
 * vers l'accueil. La copie elle-même doublait la bibliothèque en mémoire.
 *
 * Un plan modifié est un NOUVEL objet (le magasin ne mute jamais un plan en
 * place) : un plan dont la référence et la date n'ont pas bougé depuis la
 * dernière écriture n'est donc pas resérialisé. Pour les autres, on ne garde
 * qu'une empreinte du JSON (sa longueur et un hachage), pas le texte.
 */
interface Ecrit {
  ref: SavedScan | null;
  quand: number | undefined;
  empreinte: string;
}
const ecrits = new Map<string, Ecrit>();
/*
  RIEN NE S'EFFACE AVANT QUE TOUT SOIT LU — revue « bibliothèque » : un seul
  plan qui faisait lever `migrateSave` faisait tomber tout le chargement ;
  `saves` restait vide alors qu'`ecrits` connaissait déjà chaque plan, et le
  premier enregistrement effaçait du disque les clés de TOUS les autres. La
  bibliothèque entière, pour un plan abîmé.

  Deux garde-fous, indépendants :
  - `bibliothequeChargee` : tant que le chargement n'a pas abouti, aucune
    clé de plan ne s'efface et l'index ne fait que S'AGRANDIR ;
  - `gardes` : les plans présents sur le disque mais absents de la
    bibliothèque (illisibles, ou pas encore lus). Ils restent dans l'index
    et sur le disque : une mise à jour qui saura les relire les rendra.
*/
let bibliothequeChargee = false;
const gardes = new Set<string>();
/**
 * Remis à zéro par les tests qui repartent à neuf : une bibliothèque neuve
 * est vide ET entièrement connue.
 */
export function resetPersistCache() {
  ecrits.clear();
  gardes.clear();
  bibliothequeChargee = true;
}

/**
 * UN PLAN LU EST-IL UN PLAN ? Un objet, à son propre identifiant, aux listes
 * qui sont des listes : le reste de l'app ne se demande plus si `walls` est
 * un tableau. Ce qui n'y ressemble pas est GARDÉ sur le disque, pas chargé.
 */
function planValide(x: unknown, id: string): x is SavedScan {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  if (p.id !== id) return false;
  for (const champ of ['walls', 'openings', 'objects', 'rooms']) {
    if (p[champ] !== undefined && !Array.isArray(p[champ])) return false;
  }
  return true;
}

/** L'empreinte d'un texte : sa longueur et un hachage FNV-1a sur 32 bits. */
export function empreinteDe(texte: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${texte.length}:${(h >>> 0).toString(36)}`;
}

/**
 * LES CLÉS DE LA BIBLIOTHÈQUE, EN UN SEUL ALLER-RETOUR.
 *
 * Un `getItem` par plan, l'un après l'autre : trente plans, trente
 * allers-retours au stockage natif avant que l'accueil puisse les montrer.
 * `multiGet` les demande d'un coup ; sans lui (banc d'essai), on retombe sur
 * la boucle.
 */
async function lireLesCles(cles: string[]): Promise<(string | null)[]> {
  const multi = (
    AsyncStorage as {
      multiGet?: (k: string[]) => Promise<readonly (readonly [string, string | null])[]>;
    }
  ).multiGet;
  if (multi && cles.length > 1) {
    try {
      const paires = await multi(cles);
      const parCle = new Map(paires.map(([k, v]) => [k, v] as const));
      return cles.map((k) => parCle.get(k) ?? null);
    } catch {
      // Le stockage refuse le lot : la boucle, plus lente, reste sûre.
    }
  }
  const out: (string | null)[] = [];
  for (const k of cles) out.push(await AsyncStorage.getItem(k));
  return out;
}

/**
 * Relit la bibliothèque, et reprend au passage celle de l'ancien format.
 *
 * L'ancienne clé unique est lue une dernière fois, éclatée en une clé par
 * scan, puis effacée — mais seulement après que tout a été réécrit. Une
 * migration qui efface avant d'avoir fini est une migration qui perd des
 * données le jour où le téléphone s'éteint au mauvais moment.
 */
async function loadLibrary(): Promise<SavedScan[] | null> {
  const index = await AsyncStorage.getItem(INDEX_KEY);
  if (index) {
    let ids: string[] | null = null;
    try {
      const lu = JSON.parse(index) as string[];
      if (Array.isArray(lu)) ids = lu;
    } catch {
      // Un index illisible n'est pas une bibliothèque perdue : voir plus bas.
    }
    /*
      L'INDEX SAIT SE REBÂTIR. Il ne donne que l'ORDRE ; les scans, eux,
      portent chacun leur clé. Un index corrompu — une écriture coupée par
      une extinction — se reconstruit donc en les énumérant, du plus récent
      au plus ancien, et se réécrit pour que le prochain démarrage reprenne
      le chemin normal. Abandonner trente chantiers pour un kilooctet abîmé
      serait la pire réponse possible.
    */
    const rebati = ids === null;
    if (ids === null) {
      const prefixe = scanKey('');
      const enumerer = (
        AsyncStorage as { getAllKeys?: () => Promise<string[]> }
      ).getAllKeys;
      const toutes = enumerer ? await enumerer().catch(() => []) : [];
      ids = toutes
        .filter((k) => k.startsWith(prefixe))
        .map((k) => k.slice(prefixe.length));
    }
    // Tout ce que l'index connaît est gardé tant qu'il n'est pas chargé.
    for (const id of ids) gardes.add(id);
    const out: SavedScan[] = [];
    const bruts = await lireLesCles(ids.map(scanKey));
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const raw = bruts[i];
      if (!raw) {
        gardes.delete(id);
        continue;
      }
      /*
        CHAQUE PLAN DANS SA GARDE, MIGRATION COMPRISE. Un plan corrompu — ou
        qu'une migration ne sait pas lire — est sauté et reste sur le disque ;
        les autres se chargent. `ecrits` ne connaît que ce qui est chargé.
      */
      try {
        const lu: unknown = JSON.parse(raw);
        if (!planValide(lu, id)) continue;
        const plan = migrateSave(lu);
        out.push(plan);
        ecrits.set(id, { ref: lu, quand: lu.updatedAt, empreinte: empreinteDe(raw) });
        gardes.delete(id);
      } catch {
        // Un scan corrompu est sauté, les autres restent lisibles — c'est
        // tout l'intérêt de ne plus tout mettre dans la même chaîne.
      }
    }
    if (rebati) {
      // L'ordre exact de l'index est perdu ; les scans, non. Les plus
      // récents remontent en tête, comme partout dans la bibliothèque — et
      // l'index se réécrit pour que le prochain démarrage soit ordinaire.
      out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      // Les plans illisibles restent listés, en queue : rien ne s'oublie.
      await AsyncStorage.setItem(
        INDEX_KEY,
        JSON.stringify([...out.map((x) => x.id), ...ids.filter((id) => gardes.has(id))]),
      ).catch(() => {});
    }
    return out;
  }

  // --------------------------------------------- reprise de l'ancien format
  const legacy = await AsyncStorage.getItem(STORAGE_KEY);
  if (!legacy) return null;
  let saves: SavedScan[];
  try {
    saves = JSON.parse(legacy) as SavedScan[];
  } catch {
    return null;
  }
  if (!Array.isArray(saves)) return null;
  // Ce qui n'a pas d'identifiant ne peut pas avoir de clé : on n'éclate
  // que les vrais plans, et l'ancienne clé ne part que si TOUS l'ont été.
  const eclates = saves.filter(
    (s): s is SavedScan => !!s && typeof s === 'object' && typeof s.id === 'string' && s.id !== '',
  );
  const charges: SavedScan[] = [];
  for (const s of eclates) {
    const json = JSON.stringify(s);
    await AsyncStorage.setItem(scanKey(s.id), json);
    try {
      if (!planValide(s, s.id)) throw new Error('plan invalide');
      charges.push(migrateSave(s));
      ecrits.set(s.id, { ref: s, quand: s.updatedAt, empreinte: empreinteDe(json) });
    } catch {
      // Écrit à sa clé, gardé, mais pas chargé : voir `gardes`.
      gardes.add(s.id);
    }
  }
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(eclates.map((s) => s.id)));
  if (eclates.length === saves.length) await AsyncStorage.removeItem(STORAGE_KEY);
  return charges;
}

/**
 * Charge la bibliothèque dans le magasin, et ne déclare la bibliothèque
 * « entièrement chargée » — ce qui autorise enfin les effacements — que si
 * tout s'est passé jusqu'au bout.
 */
async function chargerLaBibliotheque(poser: (saves: SavedScan[]) => void): Promise<void> {
  const saves = await loadLibrary();
  if (saves) poser(saves);
  bibliothequeChargee = true;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Enregistrer un scan ne réécrit plus la bibliothèque entière.
 *
 * Tout tenait dans une seule clé : renommer un scan de 40 ko en réécrivait
 * trente autres avec lui, à chaque sauvegarde, soit plusieurs mégaoctets
 * sérialisés puis écrits sur le disque pour un mot changé. Sur un iPhone
 * chargé de relevés, ça se sent — et c'est le genre d'écriture qui, coupée
 * en plein vol, emporte la bibliothèque plutôt qu'un scan.
 *
 * Désormais : une clé par scan, plus un index qui donne l'ordre. On compare
 * au dernier état écrit et on ne touche qu'aux scans réellement modifiés.
 */
/**
 * UNE ÉCRITURE PERDUE SE DIT.
 *
 * Le disque d'un téléphone se remplit, et le stockage de l'app a ses limites :
 * un relevé chargé en photos peut ne PAS s'écrire. Jusqu'ici, l'échec était
 * avalé en silence — trois `catch` vides — et l'électricien repartait du
 * chantier en croyant son dossier enregistré. C'est le seul défaut de cette
 * application qui pouvait lui coûter une visite entière.
 *
 * Le store porte donc un témoin d'échec, que l'écran affiche. On ne prévient
 * qu'UNE FOIS par incident : une alerte à chaque tentative rendrait l'app
 * inutilisable précisément au moment où il faut sauver ce qui peut l'être.
 */
export type PanneEcriture = { quand: number; message: string } | null;
let signalerPanne: (p: PanneEcriture) => void = () => {};

/**
 * TOUTES LES TRENTE SECONDES, PAS PLUS SOUVENT.
 *
 * Un relevé produit des murs en continu ; écrire à chaque image userait le
 * stockage pour rien. Trente secondes, c'est ce qu'on accepte de refaire —
 * quelques pas dans un couloir — et c'est assez rare pour ne pas peser sur
 * la cadence du scan.
 */
const DRAFT_PERIODE = 30000;
let draftTimer: ReturnType<typeof setInterval> | null = null;
/** Ce qui est déjà écrit : on ne réécrit pas un relevé qui n'a pas bougé. */
let draftEcrit = '';

function arreterBrouillon() {
  if (draftTimer) clearInterval(draftTimer);
  draftTimer = null;
}

/**
 * ARME LE FILET DES TRENTE SECONDES — et le RÉARME, toujours.
 *
 * On ne se contente pas de « s'il n'y en a pas déjà un » : une minuterie
 * retenue par une référence morte — un retour de veille, un cycle de vie qui
 * a coupé les horloges — laisserait le relevé sans filet, et rien ne le
 * dirait.
 *
 * ELLE S'ARME À CHAQUE PORTE DE L'ÉDITEUR, pas seulement au scan. Elle ne
 * vivait que dans `setScanning` : « Dessiner un plan », un dossier rouvert
 * depuis la bibliothèque et le brouillon repris lui-même travaillaient SANS
 * filet — une heure de pose au clavier, l'app jetée par iOS pendant un
 * appel, et tout était perdu. Exactement le scénario que le brouillon avait
 * été construit pour empêcher.
 */
/**
 * LE BROUILLON S'ÉCRIT QUAND L'APP PASSE EN ARRIÈRE-PLAN — revue « Agathe » :
 * il ne s'écrivait que toutes les trente secondes, et un appel, une batterie
 * à plat ou iOS qui ferme l'app coûtaient jusqu'à trente secondes de pose.
 * Seulement quand le filet est armé : un plan ouvert, pas l'accueil.
 */
export function brouillonAuDepart(): void {
  if (draftTimer) useScanStore.getState().ecrireBrouillon();
}

function armerBrouillon(tick: () => void) {
  arreterBrouillon();
  draftTimer = setInterval(tick, DRAFT_PERIODE);
  // Sous Node (les bancs), une minuterie vivante retient le processus ;
  // `unref` la laisse mourir avec lui. N'existe pas sur téléphone : tant pis.
  (draftTimer as { unref?: () => void }).unref?.();
}

/**
 * DEUX SECONDES APRÈS LE DERNIER GESTE, LE PLAN MONTE.
 *
 * Enregistrer, renommer, dupliquer : trois gestes qui se suivent souvent à
 * la seconde près, pour un seul et même relevé. Sans ce délai, le même
 * texte partirait trois fois — trois fois le forfait de données du patron,
 * sur un chantier où le réseau est déjà mauvais.
 *
 * Le délai est court exprès : ce qui compte, c'est que le plan soit AU
 * COMPTE avant que le téléphone ne soit rangé dans la poche.
 */
const DEPOT_DELAI = 2000;
/** Un dépôt en attente par plan : deux plans différents ne s'annulent pas. */
const depots = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * DES NOMBRES QUI EN SONT VRAIMENT.
 *
 * LA PORTE DU MAGASIN EST LE SEUL ENDROIT OÙ ÇA SE VÉRIFIE. Un NaN qui entre
 * ici ne repart plus : il nourrit le dessin 2D, le volume 3D, le métré et le
 * PDF, et finit en coordonnées `NaN,NaN` dans un tracé SVG — ce qui fait
 * tomber la couche native, c'est-à-dire l'application, sans un mot.
 *
 * ET IL FAUT L'ÉCRIRE AINSI, EN EXIGEANT. Une garde qui cherche ce qu'elle
 * REFUSE — `x <= 0`, `Math.max(0.1, Math.min(6, x))` — laisse toujours passer
 * NaN, parce que toute comparaison avec NaN est fausse et que `Math.min` le
 * propage. C'est le défaut qu'un banc de balayage a trouvé quatorze fois dans
 * ce fichier (`aucunnombrefou`), sur les gestes les plus utilisés de
 * l'application : pousser un mur, tirer un coin, déplacer une pièce.
 */
function sontFinis(...v: (number | undefined)[]): boolean {
  return v.every((x) => x === undefined || Number.isFinite(x));
}

/*
  LE MEUBLE TEL QUE LE DOIGT LE TIENT — calculé, PAS ÉCRIT.

  Relevé du patron sur iPhone : « optimise la fluidité des déplacements de
  meubles ». Mesuré sur l'exemple : chaque image d'un glisser écrivait le
  magasin, et l'écran du plan tout entier se rendait — ses sept feuilles,
  ses bandeaux, le métré, les plans de travail, les portes bloquées —, pour
  un meuble qui bougeait de deux pixels. Le doigt tient désormais le meuble
  « en vol » (`store/geste`) ; le magasin n'est écrit qu'au lâcher.

  Ces trois calculs sont ceux des actions du même nom, sortis tels quels
  pour que la poignée montre EXACTEMENT ce que l'action écrira : une seule
  formule, deux usages, aucune divergence possible.
*/
/** `setObjectCenter(…, auDoigt)` sans l'écriture. `null` : rien à poser. */
export function meubleAuDoigt(
  obj: ObjectData,
  x: number,
  z: number,
  walls: WallSeg[],
  faces?: ReturnType<typeof facesDesMurs>,
): ObjectData | null {
  if (!sontFinis(x, z)) return null;
  const pose = poserLibre(
    { x, z },
    {
      width: obj.baseWidth ?? obj.width,
      depth: obj.baseDepth ?? obj.depth,
      yaw: Math.atan2(obj.transform[2], obj.transform[0]),
    },
    walls,
    faces,
  );
  const t = [...obj.transform];
  t[12] = pose.centre.x;
  t[14] = pose.centre.z;
  return {
    ...obj,
    transform: t,
    // Les cotes du catalogue, toujours : on ne rabote plus.
    width: obj.baseWidth ?? obj.width,
    depth: obj.baseDepth ?? obj.depth,
  };
}

/** `setObjectYaw` sans l'écriture. */
export function meubleTourne(obj: ObjectData, yaw: number): ObjectData | null {
  if (!sontFinis(yaw)) return null;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const t = [...obj.transform];
  t[0] = cos;
  t[2] = sin;
  t[8] = -sin;
  t[10] = cos;
  return { ...obj, transform: t };
}

/** `resizeObjectSide` sans l'écriture : le meuble étiré, et l'aimant a-t-il pris ? */
export function meubleEtire(
  st: { walls: WallSeg[]; rooms: ScanState['rooms'] },
  obj: ObjectData,
  cote: 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-',
  distance: number,
  depuis?: { width: number; depth: number; cx: number; cz: number },
): { objet: ObjectData; accroche: boolean } {
  const yaw = Math.atan2(obj.transform[2], obj.transform[0]);
  // Axe de la largeur, puis celui de la profondeur : la même convention
  // que le plaquage et la poussée.
  const axe =
    cote === 'largeur+' || cote === 'largeur-'
      ? { x: Math.cos(yaw), z: Math.sin(yaw) }
      : { x: -Math.sin(yaw), z: Math.cos(yaw) };
  const sens = cote.endsWith('+') ? 1 : -1;
  const n = { x: axe.x * sens, z: axe.z * sens };
  // La direction du bord lui-même : elle sert aux rayons de butée.
  const leLong = { x: -n.z, z: n.x };
  const surLargeur = cote.startsWith('largeur');
  // Tout se calcule depuis l'état du DÉBUT du geste : sans ce point
  // fixe, les corrections de l'aimant et de la butée se cumulent d'une
  // image à l'autre, et le meuble part en vrille.
  const base = depuis ?? {
    width: obj.width,
    depth: obj.depth,
    cx: obj.transform[12],
    cz: obj.transform[14],
  };
  const avant = surLargeur ? base.width : base.depth;
  const long = surLargeur ? base.depth : base.width;
  // Dix centimètres au minimum : en deçà, le meuble devient un trait
  // qu'on ne sait plus attraper.
  let apres = Math.max(0.1, Math.min(12, avant + distance));
  /*
    LE BORD OPPOSÉ NE BOUGE PAS : c'est lui le point fixe du geste, et
    c'est de lui qu'on mesure tout le reste.
  */
  const fixe = {
    x: base.cx - n.x * (avant / 2),
    z: base.cz - n.z * (avant / 2),
  };
  const parts = roomParts(st.walls, st.rooms);
  const ici = { x: base.cx, z: base.cz };
  const part =
    parts.find((p) => p.roomId === obj.roomId) ??
    parts.find((p) => pointInPolygon(ici, p.surface?.pts ?? []));
  const murs = part?.walls ?? st.walls;
  /*
    ET LA MAÇONNERIE ARRÊTE LE GESTE.

    Un meuble qu'on agrandit contre un mur le traversait : on tirait, il
    entrait dans la cloison, et le plan montrait un caisson au milieu du
    béton. Sur le chantier, un meuble qui bute est un meuble qui bute.

    Trois rayons plutôt qu'un — le milieu du bord fixe et ses deux
    bouts : un seul rayon manque le mur qu'un coin touche déjà, sur un
    logement dont les angles ne sont jamais droits.
  */
  if (distance > 0) {
    let libre = Infinity;
    for (const k of [-0.5, 0, 0.5]) {
      const de = {
        x: fixe.x + leLong.x * (long * k),
        z: fixe.z + leLong.z * (long * k),
      };
      const d = castToWall(de, n, murs, facesDesMurs(st.walls));
      if (d !== null) libre = Math.min(libre, d);
    }
    // Une butée qui vaudrait zéro — un bord déjà dans la maçonnerie —
    // écraserait le meuble : on ne la retient que si elle laisse de quoi
    // exister.
    if (isFinite(libre) && libre > 0.1) apres = Math.min(apres, libre);
  }
  // L'aimant : le bord tiré se pose sur le nu du mur qu'il longe, ou sur
  // le bout de celui qui se termine.
  const bord = {
    x: fixe.x + n.x * apres,
    z: fixe.z + n.z * apres,
  };
  const colle = snapSideToWalls(bord, n, long / 2, murs, undefined, facesDesMurs(st.walls));
  if (colle !== 0) {
    apres = Math.max(0.1, Math.min(12, apres + colle));
  }
  const centre = {
    x: fixe.x + n.x * (apres / 2),
    z: fixe.z + n.z * (apres / 2),
  };
  const t = [...obj.transform];
  t[12] = centre.x;
  t[14] = centre.z;
  const width = surLargeur ? apres : obj.width;
  const depth = surLargeur ? obj.depth : apres;
  // La cote tirée à la main devient LA référence, comme celle qu'on
  // tape : elle ne doit pas être reprise par l'ajustement en niche.
  return {
    objet: { ...obj, width, depth, baseWidth: width, baseDepth: depth, transform: t },
    accroche: colle !== 0,
  };
}

/**
 * UNE COTE VALABLE : un nombre fini, strictement positif, et pas délirant.
 *
 * Douze mètres est la borne haute de tout ce qui se saisit dans cette
 * application — un mur, un meuble, une pièce. Au-delà, ce n'est plus une
 * faute de frappe, c'est un calcul qui a dérapé.
 */
function estUneCote(v: number): boolean {
  return Number.isFinite(v) && v > 0 && v < 12;
}

/**
 * CE QUE L'ÉCRITURE A DONNÉ — revue « Agathe ».
 *
 * Le plan se disait enregistré, et le brouillon s'effaçait, AVANT que
 * l'écriture ait lieu (elle part six cents millisecondes plus tard) — et
 * même quand elle échouait : disque plein, le message disait « touchez
 * Enregistrer » sous un bouton déjà disparu, et le filet n'était plus là.
 * `apresEcriture` dit, une fois sur le disque, si tout ce qui a été demandé
 * jusqu'ici y est ; `surEchecDEcriture` rend le plan « à enregistrer ».
 */
let ecritureEnVol: Promise<boolean> = Promise.resolve(true);
let enAttenteDEcriture: ((ok: boolean) => void)[] = [];
let surEchecDEcriture: (id: string) => void = () => {};
function apresEcriture(): Promise<boolean> {
  if (persistTimer) return new Promise((r) => enAttenteDEcriture.push(r));
  return ecritureEnVol;
}

function persistSoon(saves: SavedScan[]) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const attente = enAttenteDEcriture;
    enAttenteDEcriture = [];
    const ecritures: Promise<boolean>[] = [];
    try {
      const vus = new Set<string>();
      for (const s of saves) {
        vus.add(s.id);
        // Revenu dans la bibliothèque (repris du compte…) : plus à garder.
        gardes.delete(s.id);
        const deja = ecrits.get(s.id);
        // Le même objet, à la même date : rien n'a bougé, rien à sérialiser.
        if (deja && deja.ref === s && deja.quand === s.updatedAt) continue;
        const json = JSON.stringify(s);
        const empreinte = empreinteDe(json);
        if (deja && deja.empreinte === empreinte) {
          ecrits.set(s.id, { ref: s, quand: s.updatedAt, empreinte });
          continue;
        }
        ecrits.set(s.id, { ref: s, quand: s.updatedAt, empreinte });
        ecritures.push(
          AsyncStorage.setItem(scanKey(s.id), json).then(
            () => true,
            (e) => {
              // Écriture perdue : on oublie ce qu'on croyait avoir écrit, la
              // prochaine sauvegarde réessaiera — et on le DIT.
              ecrits.delete(s.id);
              // « Enregistrer » revient : la consigne du message se suit.
              surEchecDEcriture(s.id);
              signalerPanne({
                quand: Date.now(),
                message:
                  `« ${s.name} » n'a pas pu être enregistré : ` +
                  `${e?.message ?? 'stockage indisponible'}. ` +
                  'Libérez de la place, puis touchez Enregistrer.',
              });
              return false;
            },
          ),
        );
      }
      // Un plan disparu de la bibliothèque s'efface — mais JAMAIS avant
      // qu'elle soit entièrement chargée, ni un plan gardé (voir `gardes`).
      if (bibliothequeChargee) {
        for (const id of [...ecrits.keys()]) {
          if (vus.has(id) || gardes.has(id)) continue;
          ecrits.delete(id);
          AsyncStorage.removeItem(scanKey(id)).catch(() => {});
        }
      }
      const liste = [...saves.map((s) => s.id), ...[...gardes].filter((id) => !vus.has(id))];
      // Pas encore tout lu : l'index sur le disque ne perd aucun de ses ids.
      const ecrireIndex = (ids: string[]) =>
        AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids));
      const index = bibliothequeChargee
        ? ecrireIndex(liste)
        : AsyncStorage.getItem(INDEX_KEY).then(
            (brut) => {
              let avant: unknown = null;
              try {
                avant = brut ? JSON.parse(brut) : null;
              } catch {
                avant = null;
              }
              const anciens = Array.isArray(avant)
                ? avant.filter((x): x is string => typeof x === 'string' && !liste.includes(x))
                : [];
              return [...liste, ...anciens];
            },
            () => liste,
          ).then(ecrireIndex);
      ecritures.push(
        index.then(
          () => true,
          (e) => {
            signalerPanne({
              quand: Date.now(),
              message:
                `La liste des scans n'a pas pu être écrite : ` +
                `${e?.message ?? 'stockage indisponible'}.`,
            });
            return false;
          },
        ),
      );
    } catch {
      // Un scan illisible ne doit pas emporter les autres.
      ecritures.push(Promise.resolve(false));
    }
    ecritureEnVol = Promise.all(ecritures).then((oks) => oks.every(Boolean));
    ecritureEnVol.then((ok) => attente.forEach((f) => f(ok)));
  }, 600);
}

/**
 * Historique d'annulation : une pile de photos du plan, bornée.
 *
 * Les gestes continus (déplacer un coin, glisser un meuble) appellent leur
 * action des dizaines de fois par seconde : on ne photographie qu'une fois
 * par geste, en regroupant les appels de même nature rapprochés.
 */
interface Snapshot {
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  rooms: RoomEntry[];
  fixtures: Fixture[];
  photos: ScanPhoto[];
  ceiling: CeilingFixture[];
  notes: PlanNote[];
  mesures: Mesure[];
}
const HISTORY_MAX = 40;
const history: Snapshot[] = [];
/**
 * LA MENUISERIE QU'ON VIENT DE POSER, et le point de reprise de sa pose —
 * revue « Sophie » : poser une fenêtre puis taper ses cotes demandait deux
 * « Annuler » pour la retirer. Tant que rien d'autre n'est venu s'inscrire
 * dans l'historique, ses cotes complètent la pose au lieu d'en être un
 * geste de plus.
 */
let ouverturePosee: { id: string; reprise: Snapshot | undefined } | null = null;
let lastKey = '';
let lastAt = 0;

const two = (n: number) => String(n).padStart(2, '0');
/**
 * LE NOM D'UN RELEVÉ NEUF — assez court pour tenir.
 *
 * Il s'appelait « Scan du 25/08 à 23h45 » : vingt et un caractères, quand
 * l'en-tête du plan en affiche dix-huit. Il était donc tronqué À CHAQUE
 * FOIS — « Scan du 25/08 à 2… » —, dès la première seconde, sur l'écran où
 * l'on passe le plus de temps, et pareil dans la bibliothèque.
 *
 * Trois mots n'y servaient à rien : « du », « à », et la place qu'ils
 * prennent. « Scan 25/08 · 23h45 » dit exactement la même chose et tient.
 *
 * LES RELEVÉS EXISTANTS NE SONT PAS RENOMMÉS : un nom est ce que
 * l'électricien a sous les yeux depuis des semaines, parfois ce qu'il a
 * dicté au client. Seuls les nouveaux prennent la forme courte.
 */
/**
 * APRÈS « ANNULER » OU « REFAIRE », ON VOIT CE QUI A CHANGÉ — revue
 * « Hugo » : annuler le scan de l'étage laissait la vue sur un niveau vidé
 * (« Aucun mur détecté », et le seul bouton remettait tout à zéro) ;
 * annuler un renommage de l'étage, depuis le rez-de-chaussée, ne montrait
 * rien. La vue va au niveau touché ; s'il est vide, au plus proche qui ne
 * l'est pas.
 */
export function niveauApresRetour(
  avant: readonly WallSeg[],
  apres: readonly WallSeg[],
  courant: number,
  piecesAvant: readonly { niveau?: number }[] = [],
  piecesApres: readonly { niveau?: number }[] = [],
): number {
  const deja = new Set<unknown>(avant);
  const nouveaux = new Set<unknown>(apres);
  const memesPieces = new Set<unknown>(piecesAvant);
  const touche =
    apres.find((w) => w.type === 'wall' && !deja.has(w)) ??
    avant.find((w) => w.type === 'wall' && !nouveaux.has(w)) ??
    piecesApres.find((r) => !memesPieces.has(r));
  let cible = touche ? niveauDe(touche) : courant;
  const niveaux = [...new Set(apres.filter((w) => w.type === 'wall').map((w) => niveauDe(w)))];
  if (niveaux.length > 0 && !niveaux.includes(cible)) {
    cible = niveaux.reduce((m, n) => (Math.abs(n - cible) < Math.abs(m - cible) ? n : m), niveaux[0]);
  }
  return niveaux.length === 0 ? courant : cible;
}

/** Le niveau où s'ouvre un plan : le rez-de-chaussée s'il a des murs, sinon le plus bas. */
export function niveauDeDepart(walls: readonly WallSeg[]): number {
  const niveaux = [...new Set(walls.filter((w) => w.type === 'wall').map((w) => niveauDe(w)))];
  if (niveaux.length === 0 || niveaux.includes(NIVEAU_RDC)) return NIVEAU_RDC;
  return Math.min(...niveaux);
}

export function defaultName(d: Date, pieces?: { name?: string; kind?: RoomKind | null }[]): string {
  /*
    CE QU'ON A RELEVÉ, PLUTÔT QUE L'HEURE — revue « Bernard » : la pièce
    était reconnue « Chambre », le plan s'appelait « Scan 13/10 · 21h31 ».
    Une pièce nommée donne son nom, plusieurs leur nombre ; la date reste.
  */
  const jour = `${two(d.getDate())}/${two(d.getMonth() + 1)}`;
  const nommees = (pieces ?? []).filter((p) => (p.name ?? '').trim() !== '');
  if (pieces && pieces.length === 1 && nommees.length === 1) {
    const nom = nommees[0].name!.trim();
    if (nom.length + 8 <= 18) return `${nom} · ${jour}`;
  }
  /*
    UN T2 EST UN T2 — revue « Yasmine », agente immobilière : « 5 pièces »
    pour un séjour, une chambre, une salle de bains, un WC et un couloir ;
    en immobilier, c'est un T5. On compte les pièces PRINCIPALES : séjour,
    chambres, salle à manger, et toute pièce qu'on n'a pas su nommer.
  */
  if (pieces && pieces.length > 1) {
    const principales = pieces.filter((p) =>
      p.kind
        ? p.kind === 'living' || p.kind === 'bedroom' || p.kind === 'sejourCuisine' || p.kind === 'dining'
        : !/couloir|entr[ée]e|d[ée]gagement|placard|dressing|cellier|buanderie|garage|wc|toilette|bain|eau|cuisine/i.test(p.name ?? ''),
    ).length;
    return principales > 0 ? `T${principales} · ${jour}` : `${pieces.length} pièces · ${jour}`;
  }
  return `Scan ${jour} · ${two(d.getHours())}h${two(d.getMinutes())}`;
}

interface ScanState {
  screen: Screen;
  /** Le plan que la page du diagnostic examine (voir `ouvrirDiagnostic`). */
  diagnosticId: string | null;
  /**
   * ON A TOUCHÉ LE PRIX SUR LE PLAN : le devis doit ALLER VOIR.
   *
   * Relevé du patron : « une récupération des prix mise à jour à chaque clic
   * sur le prix du devis sur le plan 2D ». La pastille ouvrait le devis, qui
   * ne redemandait au serveur qu'au bout d'un jour — on pouvait donc toucher
   * le prix dix fois sans que rien n'aille voir.
   *
   * Le drapeau voyage par le magasin parce que le devis s'ouvre par une
   * ROUTE, pas par un appel : `setScreen('devis')` ne porte pas d'argument, et
   * lui en inventer un pour ce seul cas ferait un chemin de plus à tenir.
   * Il se CONSOMME à la lecture (`consommerLaDemandeDeTarifs`) : un drapeau
   * qu'on oublie de baisser force à chaque ouverture, y compris celles où
   * personne n'a rien demandé.
   */
  forcerTarifs: boolean;
  supported: boolean | null;
  scanning: boolean;
  paused: boolean;
  processing: boolean;
  error: string | null;

  // Pendant le scan (aperçu temps réel)
  instruction: string;
  /**
   * MURS QUE ROOMPLAN VOIT MAL, en direct.
   *
   * Chaque surface arrive avec la confiance qu'il lui accorde, deux fois
   * par seconde — et l'app n'en gardait que le NOMBRE de murs. C'est
   * pourtant là que tout se joue : un mur douteux se repasse en dix
   * secondes tant qu'on est dans la pièce, et coûte une demi-heure de
   * retouches une fois rentré (trous à combler, linteaux à remonter,
   * pièces qui ne se referment pas).
   */
  mursDouteux: number;
  /** Le plus proche des murs mal vus, nommé (voir `murDouteux`). */
  murDouteux: MurDouteux | null;
  /** L'instant où le mur désigné a été bien vu : l'écran le fête. */
  murValideA: number;
  /**
   * LE MUR QUI MANQUE, en direct — le plus grand trou du contour (m), zéro
   * quand la pièce est fermée. On le dit au moment de terminer, pendant
   * qu'on peut encore aller le balayer (voir `ScanScreen`).
   */
  trouContour: number;
  /**
   * Le scan en cours COMPLÈTE le relevé au lieu de le remplacer : c'est
   * une pièce de plus, et l'appareillage déjà posé doit survivre.
   */
  complementEnCours: boolean;
  /**
   * L'IDENTITÉ DU RELEVÉ À L'ÉCRAN, côté passages de l'iPhone.
   *
   * Revue « Agathe » : « Scanner une pièce » réunissait la pièce du jour aux
   * passages que l'iPhone gardait EN MÉMOIRE — ceux de la veille avant un
   * redémarrage (aucun), ceux d'un autre chantier scanné entre-temps. Le
   * plan ne montrait plus que la pièce neuve, ou les pièces d'un autre
   * client. Un relevé scanné reçoit une clé ; les passages de l'iPhone
   * portent celle du relevé qui les a faits (`passagesNatifs`). Seuls des
   * passages À CE PLAN se réunissent.
   */
  cleDuReleve: string | null;
  /**
   * Les passages que l'iPhone garde : de quel relevé, de quel niveau, et de
   * combien ils ont été décalés en entrant dans le plan (le pré-calage d'un
   * étage). Non persisté : un redémarrage les efface, côté iPhone aussi.
   */
  /**
   * LES PIÈCES RETIRÉES D'UN PLAN SCANNÉ — revue « Thomas » : la pièce du
   * voisin, scannée par erreur puis retirée, revenait à chaque passage, car
   * l'iPhone relivre tous les passages faits. On garde son contour ; ce que
   * le passage suivant y relivre ne revient pas. Comme les passages, non
   * enregistré : un redémarrage les efface, côté iPhone aussi.
   */
  piecesEcartees: { cle: string; niveau: number; contour: Pt[] }[];
  passagesNatifs: {
    cle: string;
    niveau: number;
    dx: number;
    dz: number;
    /**
     * LA ROTATION DU RECALAGE (radians) — revue « Nadia » : un étage tourné
     * de 7° pour se poser sur le rez-de-chaussée gardait ses passages à 0°.
     * Le passage brut tourne d'abord autour de l'origine de sa session,
     * puis glisse de (dx, dz). Absente : pas de rotation.
     */
    angle?: number;
  } | null;
  /** Les passages de l'iPhone sont ceux du plan et du niveau à l'écran. */
  passagesDuPlanOuvert: () => boolean;
  /**
   * L'ÉTAGE qu'on regarde. Le plan, le métré et l'établi ne montrent que
   * lui ; le niveau du dessous s'affiche en filigrane, pour se repérer.
   */
  niveauCourant: number;
  /**
   * Le niveau que le prochain scan viendra remplir, quand on a demandé
   * « Ajouter un étage ». `null` = un scan ordinaire.
   */
  etageEnCours: number | null;
  /**
   * LE TABLEAU TROUVÉ SUR PLACE. `null` tant qu'on n'en a pas relevé un :
   * un chantier neuf ne porte pas de feuille « existant ».
   */
  existant: TableauExistant | null;
  /** Note un départ de plus sur le rail ; rend son identifiant. */
  ajouterDepart: (d: Omit<DepartExistant, 'id'>) => string;
  /** Corrige un départ déjà noté. */
  modifierDepart: (id: string, champs: Partial<DepartExistant>) => void;
  retirerDepart: (id: string) => void;
  /** Décrit le contenant : rangées, modules par rangée, note libre. */
  decrireTableau: (t: Partial<Omit<TableauExistant, 'departs'>>) => void;
  /**
   * CONSTITUE LE TABLEAU D'APRÈS CELUI QU'ON VOYAIT — relevé du patron : la
   * feuille d'édition s'ouvrait vide quand la 3D montrait le tableau que le
   * plan appelle. Ne fait rien si un tableau est déjà constitué.
   */
  constituerLeTableau: (t: TableauExistant) => void;
  /** Repart d'un tableau vide (qui reste constitué : vide, il se dessine vide). */
  viderLeTableau: () => void;
  /** Le tableau déduit du plan a été vérifié sur place : il devient un relevé. */
  confirmerLeReleve: () => void;
  /**
   * Retire la rangée `k`, VIDE, où qu'elle soit : celles du dessous
   * remontent (voir `sansLaRangee`). Une rangée garnie ne bouge pas.
   */
  retirerLaRangee: (k: number) => void;
  /**
   * Déplace un organe sur le rail : d'une place à gauche ou à droite dans sa
   * rangée (`pas`), ou dans une autre rangée, à la suite de ce qui y est.
   */
  deplacerDepart: (id: string, vers: { pas?: -1 | 1; rangee?: number }) => void;
  /** Change d'étage. */
  allerAuNiveau: (n: number) => void;
  /** Arme le prochain scan pour cet étage ; `null` désarme. */
  scannerUnEtage: (n: number | null) => void;
  /**
   * Glisse un étage entier au-dessus de celui du dessous, murs, meubles et
   * plafonniers compris. Les autres niveaux ne bougent pas.
   */
  recalerNiveau: (n: number, dx: number, dz: number) => void;
  /**
   * TOURNE UN ÉTAGE de `angle` radians autour de son centre — tout ce qui
   * y vit le suit : murs, menuiseries, meubles, plafond, notes.
   */
  tournerNiveau: (n: number, angle: number) => void;
  /**
   * RETIRE UN ÉTAGE DU DOSSIER, avec tout ce qui vit dessus.
   *
   * Relevé du patron : « rien ne peut se séparer ». Le menu savait ajouter
   * un étage et le recaler, jamais le retirer — un relevé raté restait dans
   * le dossier pour toujours, et c'est justement le relevé qu'on rate le
   * plus souvent : on monte un escalier, on scanne trois murs de travers,
   * et il n'y a plus qu'à recommencer le dossier entier.
   *
   * Le dernier niveau ne se retire pas : un dossier sans un seul mur n'est
   * pas un dossier, c'est un plan vierge — et cela se demande autrement.
   */
  retirerNiveau: (n: number) => void;
  /**
   * Range le relevé qui arrive à l'étage `n`, sans toucher aux niveaux déjà
   * présents. C'est « compléter le relevé » à l'envers : rien à fusionner,
   * ce ne sont pas les mêmes murs.
   */
  finalizeEtage: (r: ScanResult, n: number) => void;
  setComplement: (v: boolean) => void;
  wallCount: number;
  objectCount: number;
  doorCount: number;
  windowCount: number;
  /** Remet à zéro les compteurs au démarrage d'un scan. */
  beginScan: () => void;

  // Scan courant — SOURCE DE VÉRITÉ paramétrique :
  // le plan 2D et la vue 3D se dérivent de `walls`, jamais du maillage.
  modelPath: string | null;
  scanName: string;
  /** Client et adresse du chantier courant (vides = non renseignés). */
  client: string;
  address: string;
  currentSaveId: string | null;
  /** Modifications du plan non enregistrées (bouton de sauvegarde visible). */
  dirty: boolean;
  /** Pièces du scan courant, dans l'ordre de capture. */
  rooms: RoomEntry[];
  /** Renomme une pièce ; nom vide = plus de cartouche nommé. */
  setRoomName: (roomId: string, name: string) => void;
  /** Peint les murs d'une pièce. `null` la ramène au blanc du dessin. */
  setRoomPeinture: (roomId: string, cle: string | null) => void;
  /** Choisit le sol d'une pièce. `null` le rend à la maquette. */
  setRoomSol: (roomId: string, cle: string | null) => void;
  /** Une ambiance : murs et sol de plusieurs pièces, en UN geste annulable. */
  appliquerAmbiance: (roomIds: string[], peinture: string | null, sol: string | null) => void;
  /** Peint un mur d'une pièce, côté pièce. `null` lui rend la teinte de la pièce. */
  setMurAccent: (roomId: string, wallId: string, cle: string | null) => void;
  /** Teinte un meuble (#RRGGBB). `null` lui rend sa couleur d'origine. */
  setObjectTeinte: (objectId: string, hex: string | null) => void;
  /** Cale une photo sur l'élévation de son mur. `null` la remet au neutre. */
  setPhotoCalage: (photoId: string, calage: Calage | null) => void;
  /** Retire une pièce du scan (sa géométrie part avec elle). */
  removeRoom: (roomId: string) => void;
  /**
   * DÉPLACE UNE PIÈCE ENTIÈRE, avec ce qu'elle porte.
   *
   * Une pièce ajoutée tombe à côté du plan : il faut pouvoir la pousser
   * contre celle qui la jouxte. On translate donc ses murs, son mobilier,
   * son appareillage et ses points lumineux d'un bloc — tout ce qui la
   * compose reste à sa place DANS la pièce.
   *
   * Et à l'arrivée, elle S'AIMANTE : si l'un de ses murs se retrouve à
   * moins de vingt-cinq centimètres d'un mur parallèle du plan, elle se cale
   * dessus exactement. C'est ce qui permet de construire un appartement sans
   * jamais viser au pixel.
   *
   * Une pièce qui PARTAGE déjà un mur ne bouge pas : la déplacer
   * déchirerait sa voisine. Elle est déjà à sa place, par construction.
   */
  /**
   * Glisse une pièce. `aimant` (par défaut) : l'aimant et la soudure des
   * murs qui se recouvrent — au LÂCHER seulement pendant un glisser au doigt.
   */
  moveRoom: (roomId: string, dx: number, dz: number, aimant?: boolean) => void;
  /** Réunit deux pièces en une : la cloison qui les sépare cesse de les séparer. */
  mergeRooms: (a: string, b: string) => void;
  /** Oublie le chantier d'avant (voir `reset`) sans changer d'écran : un scan neuf commence. */
  repartirANeuf: () => void;
  /** Pose une cloison en travers d'une pièce, puis redétecte : elle se scinde. */
  splitRoom: (roomId: string) => void;
  /**
   * COUPE LA PIÈCE À UNE COTE DONNÉE, d'une cloison de l'épaisseur donnée —
   * voir `coupeDePiece`. Rend faux quand la coupe ne tombe pas dans la
   * pièce (rien n'est alors touché, pas même l'historique).
   */
  couperPiece: (roomId: string, saisie: SaisieCoupe) => boolean;
  /**
   * Relit le graphe des murs et refait la liste des pièces — d'UN niveau,
   * celui qu'on regarde à défaut d'un autre. Les autres n'en savent rien.
   */
  redetectRooms: (niveau?: number) => void;
  /** Redresse le niveau affiché sur sa propre trame : les angles redeviennent droits. */
  straightenPlan: () => void;
  /** Hauteur sous plafond d'une pièce (applique à tous ses murs). */
  setRoomHeight: (roomId: string, height: number) => void;
  /**
   * LA MÊME HAUTEUR PARTOUT — un plancher est coulé d'un seul tenant.
   *
   * Le réglage par pièce reste juste, mais sur un T4 c'est huit fois le
   * même geste. Voir l'action pour ce qui suit, et ce qui ne suit pas.
   */
  setAllRoomHeights: (height: number) => void;
  /**
   * La hauteur d'UN mur, sans toucher aux autres.
   *
   * Une retombée de poutre, une sous-pente, un muret de cuisine à 1,10 m :
   * la hauteur d'un logement n'est pas une constante par pièce, et c'est
   * elle qui commande le métré du mur, sa surface à peindre et la place
   * qu'on a pour poser un appareil.
   */
  setWallHeight: (wallId: string, height: number) => void;
  /** Retire un mur du plan (et les ouvertures qu'il portait). */
  removeWall: (wallId: string) => void;
  /**
   * COPIE UNE PIÈCE ET TOUT CE QU'ELLE PORTE, à côté d'elle.
   *
   * Trois chambres qui se ressemblent, deux WC : on les équipait une par
   * une, aux mêmes cotes. Le gain n'est pas la géométrie — quatre murs se
   * retracent vite — c'est l'APPAREILLAGE.
   */
  duplicateRoom: (roomId: string) => string | null;
  /**
   * Repose une pièce RECTANGULAIRE à ses cotes, coin haut-gauche fixe.
   *
   * Un contour libre n'a pas de « largeur × profondeur » unique : le geste
   * ne s'applique qu'aux rectangles, et les autres gardent leurs murs.
   */
  /**
   * Repose une pièce rectangulaire à ses cotes. `auNu` : ce sont des cotes
   * INTÉRIEURES, de mur à mur (une pièce dessinée, voir `contourAuNu`).
   */
  resizeRoom: (roomId: string, largeur: number, profondeur: number, opts?: { auNu?: boolean }) => void;
  /**
   * Etire une piece RECTANGULAIRE par un de ses bords, le bord oppose fixe.
   *
   * `depuis` porte l'emprise au DEBUT du geste, et la poignee envoie la
   * distance TOTALE parcourue : sans ce point fixe, chaque image repart
   * d'une cote deja bornee et la piece part en vrille — le defaut filme sur
   * le chantier avec les meubles (voir `resizeObjectSide`).
   */
  resizeRoomSide: (
    roomId: string,
    cote: 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-',
    distance: number,
    depuis?: { x0: number; z0: number; largeur: number; profondeur: number },
  ) => void;
  /**
   * Trace un mur entre deux points choisis sur le plan. Le premier est
   * généralement l'extrémité d'un mur existant, pour que le nouveau s'y
   * raccroche ; le second se déplace ensuite par sa poignée.
   *
   * `epaisseur` : celle qu'on a choisie à la pose (absente, celle de tous).
   * `depuis` : le mur de départ — le neuf entre dans SA pièce, sans quoi
   * l'onglet et la jonction en T ne se feraient pas (`wallQuads` n'assemble
   * que les murs d'une même pièce). Rend l'identifiant du mur posé.
   */
  addWallBetween: (
    a: Pt,
    b: Pt,
    opts?: { epaisseur?: number; depuis?: string },
  ) => string | undefined;
  /**
   * L'ÉPAISSEUR D'UN MUR — cloison, doublage, mur, porteur. Voir
   * `EPAISSEURS` et `WallSeg.epaisseur`.
   */
  setEpaisseurMur: (id: string, epaisseur: number) => void;
  /**
   * COMBLE UN TROU DU RELEVÉ — le mur manquant, et la porte avec.
   *
   * Le défaut de scan le plus courant : une porte ouverte que la caméra
   * traverse, et le logement sort en deux morceaux. Le geste tend le mur
   * d'un bout à l'autre et, si l'écart a la taille d'une menuiserie, y
   * pose la porte que le scan n'a pas vue — le tout en UN pas d'histoire.
   */
  comblerTrou: (trou: TrouDeReleve) => void;
  /**
   * « C'EST UN PLACARD » — le recoin fermé qui contient `at`, poché en noir
   * comme une gaine, devient une pièce (`RoomEntry.declaree`), sous un seul
   * « Annuler ».
   */
  declarerRecoin: (at: Pt, nom?: string) => void;
  /**
   * AJOUTE UNE PIÈCE RECTANGULAIRE au plan, et rend son identifiant.
   *
   * Un logement ne se scanne pas toujours d'un trait : on relève le séjour,
   * on est appelé ailleurs, on revient pour la chambre. Jusqu'ici, la seule
   * porte de sortie était « Nouveau scan » — qui efface tout. On pose donc
   * une pièce de la taille demandée, accolée au plan existant, qu'on ajuste
   * ensuite au doigt comme n'importe quel mur.
   */
  /**
   * Cree une piece RECTANGULAIRE entre deux coins tires au doigt.
   *
   * Rend son identifiant, ou `null` si le rectangle est trop petit pour
   * etre une piece. Voir l'action pour le pourquoi du geste.
   */
  /**
   * Pose une piece rectangulaire AU MILIEU de ce qui existe, prete a etre
   * poussee et etiree. Rend son identifiant.
   */
  addRoomLibre: (largeur: number, profondeur: number, nom?: string, opts?: { auNu?: boolean }) => string | null;
  /** La piece cesse d'etre neuve : son trait se ferme. */
  arreterPiece: (roomId: string) => void;
  addRoomRect: (
    a: Pt,
    b: Pt,
    nom?: string,
  ) => string | null;
  addRoomBox: (
    largeur: number,
    profondeur: number,
    nom: string,
    /**
     * LE MUR CONTRE LEQUEL ON L'ACCOLE, s'il y en a un.
     *
     * C'est ce qui permet de bâtir un appartement de proche en proche :
     * on touche un mur, on ajoute une pièce, elle se pose de l'autre côté
     * en PARTAGEANT ce mur — pas à côté, pas par-dessus, accolée. Le mur
     * mitoyen appartient alors aux deux pièces, comme dans un vrai
     * logement, et la cloison ne se dessine qu'une fois.
     */
    contreWallId?: string | null,
    /** `auNu` : largeur et profondeur sont intérieures (voir `resizeRoom`). */
    opts?: { auNu?: boolean },
  ) => string;
  /** Appareillage électrique posé sur les murs (prises, commandes, RJ45…). */
  fixtures: Fixture[];
  /** Cap du scan : d'où vient le nord. `null` = boussole muette. */
  north: number | null;
  /**
   * Pose un appareil sur un mur, à 20 cm du coin bas gauche de la face qui
   * regarde la pièce. Renvoie son identifiant, pour l'ouvrir aussitôt.
   */
  /**
   * Pose un appareil sur un mur.
   *
   * `at` vise une abscisse précise SUR LA FACE, en mètres : c'est ce que
   * donne un retour de mur choisi au plan. Sans elle, l'appareil se pose au
   * milieu, comme avant.
   */
  /**
   * `cote` : la face où poser (+1 / −1). À défaut, celle de la pièce que le
   * mur borde — sur une cloison, la première trouvée, d'où l'intérêt de la dire.
   */
  addFixture: (kind: FixtureKind, wallId: string, at?: number, cote?: 1 | -1) => string | null;
  /** Déplace un appareil sur sa face : cote depuis le bord, hauteur d'axe. */
  /**
   * RÉPÈTE UN APPAREIL LE LONG DE SON MUR, AU PAS DE LA SÉRIE.
   *
   * Relevé du patron : « duplication d'un appareil — six socles identiques,
   * c'est six poses ; il n'existe aucun geste de duplication ».
   *
   * Rend l'identifiant de la copie, ou `null` quand il n'y a de place nulle
   * part : un appareil posé dans une baie vitrée ou hors du mur est pire
   * qu'une copie qu'on refait à la main.
   */
  repeterFixture: (id: string) => string | null;
  moveFixture: (id: string, along: number, height: number) => void;
  /** Bascule l'appareil sur l'autre face du mur, sans le déplacer. */
  flipFixture: (id: string) => void;
  /**
   * L'APPAREIL QU'ELLE DESSERT (« LV », « PL »…, voir `USAGES`) — il
   * s'écrit dans son symbole. `undefined` le retire.
   */
  setFixtureUsage: (id: string, usage: string | undefined) => void;
  /**
   * Repose les DEUX appareils d'un ensemble d'un coup.
   *
   * Choisir « ensemble centré » déplace aussi le premier : il faut donc
   * pouvoir écrire les deux positions dans la même retouche, sinon
   * l'annulation en défait la moitié.
   */
  placeAssembly: (
    baseId: string,
    movedId: string,
    base: { along: number; height: number },
    moved: { along: number; height: number },
  ) => void;
  /** Sort un appareil de son ensemble et l'écarte franchement. */
  splitFixture: (id: string, along: number) => void;
  /** Photos de repérage du scan courant. */
  /**
   * Le PLAFOND : points lumineux, détecteurs, caméras, bouches de VMC.
   *
   * Une liste à part de l'appareillage mural, parce que ce n'est pas le
   * même objet : un appareil de plafond se repère à deux coordonnées dans
   * la pièce, pas sur une face de mur à une hauteur.
   */
  ceiling: CeilingFixture[];
  /**
   * Les mots écrits sur le plan — voir {@link PlanNote}.
   *
   * Ils ne comptent dans aucun métré et ne pèsent sur aucun contrôle : ce
   * sont des mots pour l'humain qui posera. C'est précisément pour ça
   * qu'ils n'avaient nulle part où aller.
   */
  notes: PlanNote[];
  /** Écrit une note à un point du plan. Un texte vide n'en crée aucune. */
  addNote: (text: string, at: Pt) => void;
  /** Déplace une note. */
  moveNote: (id: string, at: Pt) => void;
  /** Corrige le texte d'une note. Le vider la retire. */
  editNote: (id: string, text: string) => void;
  /** Retire une note. */
  removeNote: (id: string) => void;
  /**
   * LES COTES DE LA RÈGLE LIBRE — relevé du patron, point 7 de la réflexion
   * « grand public » : mesurer entre deux points du plan, et garder la cote.
   */
  mesures: Mesure[];
  /** Garde une cote, à l'étage affiché. Une cote nulle n'en crée aucune. */
  addMesure: (a: Pt, b: Pt) => void;
  /** Retire une cote gardée. */
  removeMesure: (id: string) => void;
  /** Pose un appareil au plafond, dans la pièce dont on donne le contour. */
  addCeiling: (
    kind: CeilingKind,
    roomId: string,
    at: Pt,
    /** La ligne à laquelle il appartient, quand on pose en série. */
    ligne?: { row: string; axe: SpotAxis },
  ) => string;
  moveCeiling: (id: string, at: Pt) => void;
  /**
   * POSE UN RUBAN LED — un tracé ouvert ou fermé dans la pièce (voir
   * `ruban.ts`). Rend son identifiant, ou `undefined` sans tracé valable.
   */
  addRuban: (roomId: string, trace: Pt[], ferme: boolean, retrait?: number) => string | undefined;
  /** Retrace un ruban à un autre retrait, sous un seul « Annuler ». */
  retracerRuban: (id: string, trace: Pt[], retrait?: number) => void;
  removeCeiling: (id: string) => void;
  /** Repose toute une ligne de spots : nouvelles places, nouvel axe. */
  setCeilingRow: (row: string, pts: Pt[], axe: SpotAxis) => void;
  /** Retire la ligne entière, d'un seul repentir. */
  removeCeilingRow: (row: string) => void;
  /**
   * Relie une commande murale à un point de plafond, ou défait le lien.
   *
   * C'est LE trait du plan d'électricien : celui qui dit quel interrupteur
   * allume quoi. Sans lui, un plan montre six commandes et huit points sans
   * jamais dire lequel va avec lequel.
   */
  toggleCeilingCommand: (ceilingId: string, fixtureId: string) => void;
  photos: ScanPhoto[];
  /** Punaise une photo sur un mur, à la cote donnée. */
  /**
   * Punaise une photo sur un mur. `asset` est son identifiant durable dans
   * la photothèque, quand l'utilisateur a laissé l'application l'y ranger.
   */
  addPhoto: (
    wallId: string,
    along: number,
    path: string,
    asset?: string,
  ) => string;
  /**
   * Redemande au coffre l'image d'une photo dont le fichier a disparu —
   * après une réinstallation, typiquement — et réécrit le cache.
   */
  reposerPhoto: (id: string) => Promise<void>;
  /**
   * Dépose un relevé sous le compte, pour qu'il survive au téléphone.
   *
   * Silencieux : sans compte, sans serveur ou sans réseau, il ne se passe
   * rien — c'est un filet, jamais une condition pour travailler.
   */
  deposerAuCompte: (id: string, qui: Identite | null) => Promise<void>;
  /**
   * Redescend les relevés que le compte garde et que ce téléphone n'a pas,
   * et rend leur nombre. C'est le geste d'après une réinstallation.
   */
  reprendreDuCompte: (qui: Identite | null) => Promise<number>;
  removePhoto: (id: string) => void;
  /**
   * Presse-papier d'appareillage : le relevé d'un mur, cotes comprises.
   *
   * Dans un couloir ou une chambre symétrique, on repose trois fois le même
   * équipement, à la même cote du coin. Le refaire à la main, c'est trois
   * fois l'occasion de se tromper d'un centimètre.
   */
  /** Relève l'appareillage d'un mur (face intérieure). */
  /**
   * Noue ou dénoue le lien entre un appareil mural et sa commande — le
   * même geste qu'au plafond. Refuse ce qui ne se commande pas (courant
   * faible, circuits spécialisés) et ce qui ne commande pas (une prise
   * n'allume rien) : la garde vit ICI, quel que soit le chemin.
   */
  toggleFixtureCommand: (fixtureId: string, commandeId: string) => void;
  /**
   * NOUER (OU DÉNOUER) LE LIEN ENTRE DEUX ÉLÉMENTS, DANS N'IMPORTE QUEL SENS.
   *
   * Relevé du patron : « si on clique sur un interrupteur, on ne voit pas
   * "lier", alors que sur prise et éclairage si. »
   *
   * Le geste n'existait que dans UN sens : on tenait la prise, on désignait
   * l'interrupteur. L'inverse — tenir l'interrupteur et désigner ce qu'il
   * allume — était impossible, alors que c'est le sens naturel quand on pose
   * une installation : on sait qu'il y a une commande à l'entrée, on cherche
   * ce qu'elle commandera.
   *
   * LA RÈGLE VIT DONC ICI, SUR LA PAIRE, et non dans l'écran à l'endroit du
   * geste. On donne deux identifiants, le magasin trouve lequel commande et
   * lequel s'allume — et l'ordre des appuis cesse d'avoir un sens, ce qui est
   * la bonne réponse puisqu'il n'en a jamais eu pour l'utilisateur.
   *
   * Rend FAUX quand la paire n'a pas de sens : deux interrupteurs, deux
   * prises, un courant faible. L'écran s'en sert pour le dire.
   */
  lierElements: (aId: string, bId: string) => boolean;
  /** Repose le relevé sur un autre mur. Renvoie le nombre d'appareils posés. */
  /**
   * Un appareil vient d'être rangé à côté d'un autre, sous une plaque
   * commune : l'écran de face le propose à l'utilisateur, qui choisit le
   * côté ou recentre l'ensemble. Consommé une fois lu.
   */
  pendingJoin: { moved: string; base: string } | null;
  clearPendingJoin: () => void;
  /**
   * Oriente le plan à la main, quand le scan n'a pas de cap.
   *
   * Les relevés d'avant la boussole n'en ont pas, et refaire le scan d'un
   * appartement pour une aiguille serait absurde. La valeur suit la même
   * convention que celle du magnétomètre : cap de l'axe −Z du repère de
   * scan, en degrés horaires depuis le nord.
   */
  setNorth: (deg: number | null) => void;
  /** Renseigne le client et l'adresse du chantier courant. */
  setClientInfo: (client: string, address: string) => void;
  /** Renomme une entrée de la bibliothèque sans l'ouvrir. */
  renameSave: (id: string, name: string) => void;
  /** Copie une entrée : même plan, autre nom, autre vie. */
  duplicateSave: (id: string) => void;
  /**
   * Remet l'appareillage tel qu'il était — pour abandonner ce qu'on vient
   * de poser sur un mur sans toucher au reste du plan.
   */
  restoreFixtures: (list: Fixture[]) => void;
  /**
   * ACCEPTER OU REFUSER LE PONTAGE D'UNE PRISE.
   *
   * Relevé du patron, sur la fiche de pose : « on propose de lier le câblage
   * élec des prises entre elles ; on peut refuser pour faire un circuit
   * indépendant par prise ». Le pontage est proposé par défaut — c'est
   * l'installation courante — et ce geste le retire.
   */
  basculerPontage: (id: string) => void;
  /**
   * LIER DES SPOTS EN UNE LIGNE, OU EN SORTIR UN.
   *
   * Relevé du patron : « on doit pouvoir lier des spots entre eux pour la
   * logique de pontage, et délier un spot sur une ligne ». Une ligne, c'est
   * un pontage : les spots s'y tirent de proche en proche au lieu de
   * redescendre chacun au tableau (voir `planRoutes`).
   *
   * `lierPlafond` rattache un spot à la ligne d'un autre — et crée la ligne
   * si le voisin n'en a pas encore. `delierPlafond` l'en sort, et il repart
   * seul du tableau.
   */
  lierPlafond: (id: string, voisin: string) => void;
  delierPlafond: (id: string) => void;
  removeFixture: (id: string) => void;
  /** Annule la dernière retouche. Vide = plus rien à annuler. */
  undo: () => void;
  /** Refait ce qu'une annulation vient de retirer. Voir `avenir`. */
  redo: () => void;
  canUndo: boolean;
  /** Y a-t-il quelque chose à refaire ? (une annulation, non suivie d'un
   *  geste neuf) */
  canRedo: boolean;
  /** D'où vient l'écran résultat : le bouton retour y renvoie. */
  resultOrigin: 'scan' | 'library';
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];

  // Bibliothèque persistée
  saves: SavedScan[];
  /**
   * La bibliothèque du téléphone a été RELUE depuis le stockage.
   *
   * Tant que c'est faux, `saves` est vide parce qu'on n'a pas encore lu —
   * pas parce qu'il n'y a rien. La reprise du compte s'y fie : comparer le
   * coffre à une bibliothèque pas encore lue redescendrait en double des
   * plans déjà là.
   */
  savesCharges: boolean;
  /** Dossiers de la bibliothèque, dans l'ordre de création. */
  folders: ScanFolder[];
  /** Crée un dossier et renvoie son identifiant. */
  addFolder: (name?: string) => string;
  renameFolder: (id: string, name: string) => void;
  /** Supprime le dossier ; les scans qu'il contenait reviennent à la racine. */
  removeFolder: (id: string) => void;
  /** Range un scan dans un dossier, ou l'en sort (`null`). */
  moveToFolder: (scanId: string, folderId: string | null) => void;

  // Apparence : clair par défaut, bascule manuelle.
  themePref: ThemePref;
  /**
   * LA TEINTE D'ACCENT — voir `ui/accents`.
   *
   * Une CLÉ, jamais une couleur : une palette qui s'ajuste d'une version
   * à l'autre suit alors le réglage, au lieu de le laisser figé sur un
   * hexadécimal dont plus personne ne sait le nom.
   */
  accentPref: string;
  /**
   * L'ICÔNE DE L'APPLICATION — voir `ui/icone`.
   *
   * À PART de la teinte, et c'est iOS qui l'impose : changer d'icône fait
   * apparaître une alerte du système, qu'on ne veut pas voir surgir trois
   * fois pendant qu'on compare des teintes.
   */
  iconePref: string;
  setThemePref: (p: ThemePref) => void;
  setAccentPref: (cle: string) => void;
  setIconePref: (cle: string) => void;

  // Couleur des portes/fenêtres (2D, 3D, PDF). Décoché par défaut.
  showOpeningColors: boolean;
  setShowOpeningColors: (v: boolean) => void;

  // Meubles visibles (sinon : murs et sols seuls). Activé par défaut.
  showFurniture: boolean;
  setShowFurniture: (v: boolean) => void;
  /**
   * LA GAMME D'APPAREILLAGE RETENUE POUR LE DEVIS.
   *
   * Elle vit ici et non dans l'écran du devis parce que DEUX endroits la
   * lisent : la page, et le bouton du plan qui affiche le total. Rangée dans
   * l'écran, le bouton aurait chiffré une gamme et la page une autre.
   */
  gammeDevis: GammeId;
  setGammeDevis: (g: GammeId) => void;
  /**
   * OÙ L'ON EN EST DANS LE DEVIS — et pourquoi ce rang vit ICI.
   *
   * Relevé du patron : « ajouter un article au magasin l'ajoute mais on
   * retourne sur la première page ». Aller au magasin DÉMONTE l'écran du
   * devis ; le rang vivait dans le composant, il repartait donc à zéro. On
   * revenait deux écrans avant l'article qu'on venait d'ajouter — le geste le
   * plus courant de la page punissait celui qui le faisait.
   *
   * Il ne voyage PAS avec le plan (voir `SavedScan`) : c'est une position de
   * lecture, pas un relevé. Un dossier rouvert repart de l'avertissement, et
   * c'est bien : on ne saute pas la page qui dit ce que le prix ne contient
   * pas à qui ne l'a jamais lue.
   */
  etapeDevis: number;
  setEtapeDevis: (n: number) => void;
  /**
   * LES ARTICLES ÉCARTÉS DU DEVIS.
   *
   * Ici et non dans l'écran, pour la même raison que la gamme : le bouton du
   * plan affiche le total, et il doit afficher CELUI qu'on a sous les yeux.
   * Rangée dans l'écran, la liste aurait laissé le bouton chiffrer un devis
   * que la page n'annonce plus.
   */
  devisEcartes: string[];
  basculerArticleDevis: (cle: string) => void;
  remettreLesArticlesDevis: () => void;
  /**
   * LES QUANTITÉS CORRIGÉES À LA MAIN, par clé de ligne.
   *
   * Relevé du patron : « ajoute la possibilité d'augmenter ou diminuer le
   * nombre de produits dans le devis ». Un métré est une estimation ; celui
   * qui connaît la maison sait qu'il faudra une couronne de plus.
   */
  devisQuantites: Record<string, number>;
  reglerQuantiteDevis: (cle: string, quantite: number) => void;
  /** Ce qu'on a pris au magasin, et que le plan ne pouvait pas deviner. */
  devisAjouts: { code: string; quantite: number }[];
  ajouterAuDevis: (code: string, quantite?: number) => void;
  /**
   * LES PRIX UNITAIRES CORRIGÉS À LA MAIN, par clé de ligne — correctif de
   * l'audit : ils ne se modifiaient pas. `null` rend le prix du catalogue.
   */
  devisPrix: Record<string, number>;
  reglerPrixDevis: (cle: string, pu: number | null) => void;
  /**
   * LE NUMÉRO DU DEVIS DE CE PLAN — donné au premier envoi, gardé ensuite :
   * renvoyer le même devis ne lui en donne pas un autre.
   */
  devisNumero: string | null;
  setDevisNumero: (numero: string | null) => void;
  retirerDuDevis: (code: string) => void;
  /**
   * LES LIGNES LIBRES — relevé d'un électricien artisan : « Dépose ancien
   * tableau », « Déplacement », « Consuel », « Mise en service ». Ni au plan
   * ni au magasin : l'artisan les écrit, les corrige, les retire.
   */
  devisLignesLibres: LigneLibre[];
  /** Ajoute la ligne, ou remplace celle qui porte le même `id`. */
  ecrireLigneLibre: (l: LigneLibre) => void;
  retirerLigneLibre: (id: string) => void;
  /**
   * LES HEURES DE POSE CORRIGÉES, par famille — le barème est une
   * estimation, l'artisan connaît son chantier. `null` rend l'estimation.
   */
  devisHeures: Record<string, number>;
  reglerHeuresDevis: (famille: string, heures: number | null) => void;
  /** Le taux de TVA du devis (20 %, 10 %, 5,5 %) ; `null` = celui du chantier. */
  devisTva: number | null;
  reglerTvaDevis: (taux: number | null) => void;

  // Surface au sol : fond pointillé + valeur en m². Activée par défaut.
  showSurfaces: boolean;
  setShowSurfaces: (v: boolean) => void;
  /**
   * LES SURFACES DE LA MAQUETTE, à part de celles du plan — comme les cotes.
   * Le plan s'ouvre avec ses pièces nommées ; la 3D, sur ses meubles et ses
   * murs seulement (relevé du patron).
   */
  show3DSurfaces: boolean;
  setShow3DSurfaces: (v: boolean) => void;
  /**
   * LE SOL EN 3D, INDÉPENDANT DES SURFACES — relevé du patron : « Sol (activé
   * par défaut, et doit être indépendant de “Surfaces”, qui doit afficher les
   * surfaces uniquement) ». « Surfaces » ne pose plus que les étiquettes des
   * pièces et leurs mètres carrés ; le sol, ses lattes ou son image relevée
   * ont leur propre calque.
   */
  showSol: boolean;
  setShowSol: (v: boolean) => void;
  /** Les notes écrites sur le plan, affichées ou non (hors édition). */
  showNotes: boolean;
  setShowNotes: (v: boolean) => void;
  /** Les repères des photos sur le plan, affichés ou non (hors édition). */
  showPhotos: boolean;
  setShowPhotos: (v: boolean) => void;
  /** Une grille de cinquante centimètres sous le plan, pour estimer d'un coup d'œil. */
  showGrille: boolean;
  setShowGrille: (v: boolean) => void;

  // Couleurs et textures relevées au scan (2D, 3D, PDF). Décoché par défaut.
  showTextures: boolean;
  /**
   * Murs pleins en 3D, ou écorché.
   *
   * L'écorché efface le mur qui nous fait face pour montrer la pièce ; c'est
   * le bon réglage neuf fois sur dix, mais pas quand on veut juger un volume
   * bâti ou montrer une façade. Le choix reste donc à l'utilisateur.
   */
  solidWalls: boolean;
  toggleSolidWalls: () => void;
  setShowTextures: (v: boolean) => void;

  setScreen: (s: Screen) => void;
  /** Ouvre la page du diagnostic d'un plan enregistré. */
  ouvrirDiagnostic: (id: string) => void;
  /** Le prix du plan a été touché : la prochaine ouverture du devis ira voir. */
  demanderLesTarifs: () => void;
  /** Lit la demande ET la baisse : elle ne vaut que pour une ouverture. */
  consommerLaDemandeDeTarifs: () => boolean;
  /**
   * UN RACCOURCI A DEMANDÉ UN RELEVÉ — voir `ui/raccourci`.
   *
   * Le drapeau vit ici et non dans l'accueil parce que la demande peut
   * arriver alors que l'accueil n'est même pas monté : on dit la phrase
   * en marchant, l'app était restée sur un plan. L'accueil le consomme
   * quand il paraît, et le scan part par SON chemin — celui du bouton.
   */
  raccourciEnAttente: boolean;
  setRaccourciEnAttente: (v: boolean) => void;
  setSupported: (v: boolean) => void;
  setScanning: (v: boolean) => void;
  setPaused: (v: boolean) => void;
  setProcessing: (v: boolean) => void;
  setError: (m: string | null) => void;
  setInstruction: (i: string) => void;
  applyLiveUpdate: (u: ScanUpdate) => void;
  finalize: (r: ScanResult) => void;
  /**
   * UN PASSAGE DE PLUS, réuni au relevé courant.
   *
   * Le logement se scanne pièce par pièce, et `StructureBuilder` (iOS 17)
   * aligne les passages : le résultat REMPLACE la géométrie DU NIVEAU
   * affiché. Mais l'électricien a pu poser vingt prises entre-temps — les
   * perdre parce qu'il ajoute une chambre serait pire que tout. On remplace
   * donc les murs, les ouvertures et les meubles du relevé ; on GARDE
   * l'appareillage, le plafond, les photos, ce qui a été tracé ou posé à la
   * main, et les autres niveaux.
   *
   * Des passages qui ne sont pas ceux du plan (l'iPhone les a oubliés, ou
   * ce sont ceux d'un autre) ne remplacent rien : la pièce s'ajoute à côté.
   *
   * Et l'on ne consomme aucun essai : c'est le MÊME plan qu'on complète.
   */
  finalizeMerge: (r: ScanResult) => void;
  /**
   * L'ARRIVAGE d'un scan qui vient de finir : ce que le popup de choix
   * propose d'intégrer. RoomPlan DÉTECTE les meubles ; l'électricité, elle,
   * ne peut être que PROPOSÉE (l'implantation NF C 15-100, hors meubles) —
   * une prise fait trois centimètres, le LiDAR voit des meubles. `null` =
   * rien à demander (scan vide, ou choix déjà fait).
   */
  arrivage: { meubles: number; posesViseur?: number } | null;
  oublierArrivage: () => void;
  /** Le patron a décoché les meubles : le plan s'en sépare d'un coup. */
  retirerMeubles: () => void;
  moveWallPoint: (id: string, end: 'a' | 'b', p: { x: number; z: number }) => void;
  /**
   * POUSSE un mur entier, ses voisins restant accrochés.
   *
   * Un mur ne se retouchait que par ses coins, un par un : pour décaler une
   * cloison de dix centimètres, il fallait viser deux fois le même
   * déplacement au doigt — ce qui ne donne jamais deux fois le même, et le
   * mur arrivait de travers.
   *
   * `aimant` à faux : le décalage tapé au chiffre se pose tel quel, sans
   * être rattrapé par la cloison voisine.
   */
  moveWall: (id: string, dx: number, dz: number, aimant?: boolean, cle?: string) => void;
  /**
   * DESSOUDE UN MUR DE SES VOISINS.
   *
   * Deux murs qui partagent un point bougent ensemble : c'est ce qu'il faut
   * pour le coin d'une pièce — sans quoi le contour s'ouvre, la surface
   * disparaît et le métré avec elle. Mais pour un retour qu'on veut
   * simplement allonger, c'est l'inverse : « si j'essaye de prolonger ce
   * retour, c'est le long mur qui est impacté ».
   *
   * On ne devine pas laquelle des deux intentions on a : on la DIT. Détaché,
   * le mur se déplace seul — et l'aimant le raccroche dès qu'on ramène son
   * extrémité à moins de vingt-cinq centimètres d'une autre.
   */
  detacherMur: (id: string) => void;
  /**
   * POSE l'angle du mur, en degrés absolus, sans rien accrocher.
   *
   * Le geste de rotation empilait des petits pas, chacun re-collé aux crans
   * de quinze degrés : le mur restait scotché à l'équerre pendant que le
   * doigt continuait, et les arrondis dérivaient. L'angle se pose donc
   * d'un coup, tel que le doigt le désigne — c'est le GESTE qui décide de
   * l'accroche, une seule fois, sur l'angle voulu.
   */
  setWallAngle: (id: string, deg: number) => void;
  /**
   * Avec `opts` (quelle que soit la valeur d'`auNu`) : la longueur tapée se
   * lit sur la cote que l'écran affiche (`longueurCotee`) — intérieure, de nu
   * à nu, quand le plan la donne ainsi. Sans `opts` : la longueur à l'axe.
   */
  setWallLength: (id: string, length: number, opts?: { auNu?: boolean }) => void;
  renameCurrent: (name: string) => void;
  saveAsCopy: (name: string) => void;
  /** Enregistre les modifications du plan dans la bibliothèque. */
  commitCurrent: () => void;
  /**
   * RANGE LE TRAVAIL NON ENREGISTRÉ, sans rien demander — voir
   * `GARDE_NON_ENREGISTRE_MS`. Un plan neuf entre dans la bibliothèque pour
   * douze heures (`nouveau`) ; les modifications d'un plan enregistré sont
   * gardées à côté de lui (`retouche`). Rien à perdre : `rien`.
   */
  mettreDeCote: () => 'rien' | 'nouveau' | 'retouche';
  /**
   * LE PLAN S'ENREGISTRE TOUT SEUL — relevé du patron, point 4 de la
   * réflexion « grand public ». Écrit le plan dans la bibliothèque, comme
   * « Enregistrer », s'il y a quelque chose à écrire ; rend `true` s'il l'a
   * fait. Ni un plan vide, ni l'appartement d'exemple qu'on visite.
   */
  enregistrerAuto: () => boolean;
  /** Écrit dans le plan les modifications qui l'attendaient. */
  enregistrerRetouche: (id: string) => void;
  /** Laisse le plan tel qu'il a été enregistré. */
  jeterRetouche: (id: string) => void;
  /** Un plan gardé douze heures devient un plan enregistré. */
  garderLePlan: (id: string) => void;
  /** Efface ce dont l'échéance est passée. Rend le nombre de plans partis. */
  purgerLesEchus: (maintenant?: number) => number;
  /**
   * Pose une menuiserie au milieu d'un mur, aux cotes de sa nature
   * (`COTES_MENUISERIE`). Sans nature dite, c'est une baie libre.
   */
  addOpening: (
    wallId: string,
    nature?: 'door' | 'window' | 'opening',
  ) => string | undefined;
  /**
   * TOUTES LES COTES D'UNE OUVERTURE, EN UN GESTE — largeur, hauteur,
   * allège, et la position depuis le nu du coin. Voir `OuvertureSheet`.
   * Une seule annulation les défait toutes.
   */
  coterOuverture: (id: string, s: SaisieOuverture) => void;
  /**
   * Retaille une ouverture. La largeur se prend autour de son axe, la
   * hauteur depuis son allège : une fenêtre monte, elle ne descend pas.
   */
  resizeOpening: (id: string, width?: number, height?: number) => void;
  /**
   * Replace une ouverture sur son mur : `bord` est la cote DU TABLEAU
   * depuis le début du mur, en mètres. Voir l'action pour le pourquoi.
   */
  moveOpening: (id: string, bord: number) => void;
  /**
   * Retourne le battant d'une porte : son bord de pivot, ou la pièce vers
   * laquelle il s'ouvre. Sans effet sur une fenêtre, qui n'en dessine pas.
   */
  flipBattant: (id: string, quoi: 'pivot' | 'sens') => void;
  /**
   * Pose l'allège d'une fenêtre à la cote donnée, du sol au repos de la
   * baie. La menuiserie MONTE, elle ne se rogne pas. Sans effet sur une
   * porte, dont l'allège est le sol par définition.
   */
  setAllege: (id: string, h: number) => void;
  /**
   * Déclare ce qu'est une ouverture : porte, fenêtre ou baie libre.
   *
   * Ce n'est pas une étiquette — la nature commande le dessin (le battant
   * d'une porte) et les cotes (l'allège d'une fenêtre). Voir l'action.
   */
  setOpeningType: (id: string, type: 'door' | 'window' | 'opening') => void;
  /**
   * DÉCLARE (ou retire) LE COFFRE DE VOLET qui coiffe cette menuiserie.
   *
   * Le scan ne le voit pas — c'est un accident de maçonnerie au-dessus de
   * la baie, pas une surface qu'ARKit sait nommer. Un geste le pose, à la
   * hauteur courante d'un tunnel ; on la corrige ensuite si le chantier
   * en décide autrement.
   */
  toggleCoffre: (id: string, hauteur?: number) => void;
  /** Pose ou retire le détecteur d'ouverture d'une menuiserie (alarme). */
  toggleDetecteurOuverture: (id: string) => void;
  removeOpening: (id: string) => void;
  /**
   * Pose un meuble du catalogue au point donné. Renvoie son identifiant,
   * pour le sélectionner aussitôt : un meuble qu'on vient de poser, on va
   * le déplacer.
   */
  addObject: (item: CatalogItem, x: number, z: number) => string;
  /** Fait pivoter un meuble d'un quart de tour. */
  rotateObject: (id: string, quarts?: number) => void;
  /** Déplace toute une ligne de spots d'un bloc, sans la sortir de sa pièce. */
  moveCeilingRow: (row: string, dx: number, dz: number) => void;
  /** Le côté de la méridienne d'un canapé d'angle (revue « Yasmine »). */
  setMeridienne: (id: string, cote: 'gauche' | 'droite') => void;
  /** Oriente un meuble à l'angle donné (radians). */
  setObjectYaw: (id: string, yaw: number) => void;
  /**
   * La dernière écriture qui a échoué, tant que l'électricien ne l'a pas lue.
   * `null` = tout va bien.
   */
  panne: PanneEcriture;
  /** Il a lu l'avertissement : on l'oublie jusqu'au prochain incident. */
  oublierPanne: () => void;
  /**
   * Octets rendus par le dernier balayage des modèles 3D, `null` si rien
   * n'a été effacé. La bibliothèque le dit une fois, puis l'oublie : un
   * ménage muet laisse l'électricien devant le même téléphone plein.
   */
  placeRendue: number | null;
  /** Il a lu le chiffre : on n'y revient pas. */
  oublierPlaceRendue: () => void;
  removeObject: (id: string) => void;
  /**
   * UN MEUBLE DE PLUS, LE MÊME — quatre chaises autour d'une table, deux
   * chevets. Rend l'identifiant de la copie, posée à côté de l'original.
   */
  dupliquerMeuble: (id: string) => string | null;
  /** Pose en une fois ce que « Normes auto » propose. */
  poserDAuto: (fixtures: Fixture[], ceiling: CeilingFixture[]) => void;
  /**
   * Pose le meuble à cet endroit.
   *
   * `aimant` commande le PLAQUAGE : au doigt il vaut mieux le garder — on
   * vise à peu près, et un jour de trois centimètres contre un mur n'existe
   * pas sur un chantier. À la flèche, non : le pas d'un centimètre est une
   * demande explicite, et l'aimant le reprenait aussitôt. Le meuble revenait
   * se coller, et le bouton paraissait mort.
   */
  /**
   * Pose un meuble. `libre` = LE DOIGT COMMANDE : aucune aide, aucun
   * rabotage, on peut traverser les murs — voir `poserLibre`.
   */
  setObjectCenter: (
    id: string,
    x: number,
    z: number,
    /**
     * `true` = LE DOIGT TIENT ENCORE LE MEUBLE : on pose brut, sans
     * collision, pour que l'écran puisse montrer le refus en rouge. Au
     * lâcher, c'est `rangerMeuble` qui range.
     *
     * `false` (ou omis) = la flèche, qui range aussitôt.
     */
    libre?: boolean,
  ) => void;
  /**
   * RANGE LE MEUBLE LÀ OÙ LE DOIGT L'A LÂCHÉ — par collision, sans aimant.
   *
   * Le mur l'arrête, le contour de la pièce le recadre, les autres meubles
   * ne se traversent pas. Rien ne l'attire : au large, il ne bouge pas d'un
   * millimètre. Voir l'implémentation pour l'ordre des quatre passes.
   */
  /**
   * Range un meuble lâché en (x, z) : hors des murs, hors des voisins. `cle`
   * : la clé d'historique du geste dont il est la queue (le glisser par
   * défaut, la rotation quand on vient de tourner).
   */
  rangerMeuble: (id: string, x: number, z: number, cle?: string, sansHistorique?: boolean) => void;
  resizeObject: (id: string, width: number, depth: number) => void;
  /**
   * LA TROISIÈME COTE, et la hauteur à laquelle elle commence.
   *
   * `height` est la hauteur du meuble, `base` celle de son DESSOUS au-dessus
   * du sol. Les deux sont indépendantes : rehausser un meuble haut de
   * cuisine ne doit pas décoller son fond du plan de travail, et le monter
   * de dix centimètres ne doit pas le rendre plus grand. Omettre l'une la
   * laisse telle quelle.
   */
  /** Cale le meuble dans sa niche (voir `calerDansLaNiche`). */
  calerMeuble: (id: string) => void;
  setObjectHeight: (id: string, height?: number, base?: number) => void;
  /**
   * ÉTIRE UN MEUBLE PAR UN DE SES CÔTÉS, le côté opposé restant en place.
   *
   * C'est le geste du mètre ruban : on prend un bord et on le tire. Régler
   * une largeur au clavier oblige à faire le calcul dans sa tête — on veut
   * que le meuble aille JUSQU'AU MUR, pas qu'il fasse 1,47 m.
   *
   * `cote` désigne le bord tiré dans le repère du meuble : `largeur+` est
   * celui vers lequel pointe son axe de largeur, `profondeur-` le bord
   * arrière. `distance` est le déplacement de ce bord, en mètres, compté
   * vers l'extérieur : positif, le meuble grandit.
   *
   * Le bord s'accroche au nu des murs qu'il longe (voir `snapSideToWalls`) :
   * viser l'affleurement au doigt, à trois millimètres près, n'est pas un
   * geste humain.
   */
  resizeObjectSide: (
    id: string,
    cote: 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-',
    distance: number,
    /**
     * L'ÉTAT AU DÉBUT DU GESTE — et pourquoi il ne peut pas s'en passer.
     *
     * Le premier jet appliquait des pas RELATIFS : « agrandis de trois
     * millimètres de plus ». Chaque image repartait donc de la taille que le
     * store venait d'écrire — c'est-à-dire d'une taille déjà corrigée par
     * l'aimant ou par la butée. La correction se rajoutait à la suivante, et
     * le meuble partait en vrille : 0,44 m, puis 1,53, puis 1,93, en
     * traversant les murs. C'est le défaut filmé sur le chantier.
     *
     * La poignée retient donc la taille et le centre à l'appui, et envoie la
     * distance TOTALE parcourue depuis. Rien ne se cumule : à doigt égal,
     * résultat égal, quelle que soit la cadence des images.
     */
    depuis?: { width: number; depth: number; cx: number; cz: number },
  ) => { accroche: boolean };
  /** Abandonne les modifications : recharge la dernière sauvegarde. */
  revertCurrent: () => void;
  /**
   * Le relevé retrouvé au démarrage, en attente d'une réponse.
   *
   * `null` = rien à reprendre. Sinon, l'écran d'accueil le propose : c'est
   * un choix, jamais une reprise d'office — l'utilisateur peut avoir quitté
   * volontairement un essai raté.
   */
  brouillon: BrouillonScan | null;
  /** Écrit le relevé en cours. Appelée par la minuterie, et à la demande. */
  ecrireBrouillon: () => void;
  /** Reprend le relevé retrouvé : il redevient le scan courant. */
  reprendreBrouillon: () => void;
  /** Jette le brouillon : la question ne se reposera plus. */
  oublierBrouillon: () => void;
  loadSaves: () => Promise<void>;
  /**
   * REDESCEND LES PLANS DU COMPTE, UNE FOIS, APRÈS UNE RÉINSTALLATION.
   *
   * Rend le nombre de relevés repris. Ne fait rien tant que la
   * bibliothèque locale n'est pas relue, ni sans compte connecté — et pose
   * alors son marqueur, pour ne plus jamais reposer un plan que
   * l'électricien aurait supprimé depuis.
   */
  repriseAuBesoin: () => Promise<number>;
  openSave: (id: string) => void;
  deleteSave: (id: string) => void;
  /** Met un plan à la corbeille : il y attend 30 jours (`CORBEILLE_MS`). */
  mettreALaCorbeille: (id: string) => void;
  /** Le rend à la bibliothèque. */
  restaurerDeLaCorbeille: (id: string) => void;
  /** Efface pour de bon tout ce qui est à la corbeille. */
  viderLaCorbeille: () => void;
  reset: () => void;
  /**
   * OUVRE UN PLAN VIERGE, SANS SCANNER.
   *
   * Trois besoins, une seule réponse. Les appareils SANS LiDAR — iPhone non
   * Pro, iPad d'entrée de gamme, Android — n'avaient accès à rien :
   * l'accueil annonçait « appareil non compatible » et l'application
   * s'arrêtait là, alors que les neuf dixièmes de sa valeur — les normes,
   * les circuits, le métré, le tableau existant, le dossier — ne demandent
   * aucun capteur. Les PETITES INTERVENTIONS ensuite : pour ajouter deux
   * prises dans une cuisine, on ne relève pas l'appartement, on trace la
   * pièce et l'on chiffre. Les ARCHITECTES enfin, qui esquissent au mètre
   * avant d'avoir mis un pied sur le chantier.
   *
   * Le magasin savait déjà bâtir un logement de proche en proche
   * (`addRoomBox`) : il n'y manquait que la porte d'entrée.
   */
  commencerAuClavier: () => void;
  /**
   * L'APPARTEMENT D'EXEMPLE, ouvert comme un relevé — voir `src/data/exemple`.
   * Rien n'est enregistré tant qu'on ne touche pas « Enregistrer » : c'est
   * une visite, pas un plan de plus dans la bibliothèque.
   */
  ouvrirExemple: () => void;
  /**
   * OUVRE LE PLAN LU SUR UNE FEUILLE — comme un relevé qui vient de finir :
   * un plan neuf, non enregistré, sous le même filet qu'un scan (le
   * brouillon). Ce qu'il porte vient de `reconstruirePlan`.
   */
  ouvrirPlanLu: (plan: PlanLu, nom: string) => void;
  /**
   * Vrai quand le plan a été ouvert AU CLAVIER, sans scanner.
   *
   * L écran vide n a pas le même sens dans les deux cas : après un scan
   * raté, il faut conseiller de balayer autrement ; après « Dessiner un
   * plan », ce conseil n a aucun sens et le geste attendu est d ajouter une
   * pièce. Un booléen franc vaut mieux qu une déduction fragile tirée du
   * nom du dossier ou de la présence d un modèle 3D.
   */
  planVierge: boolean;
}

/** Altitude du sol : le pied du mur le plus bas. */
const solDe = (walls: WallSeg[]) =>
  walls.length > 0
    ? Math.min(...walls.map((w) => w.yCenter - w.height / 2))
    : 0;

/**
 * LES CALQUES D'UN PLAN QUI S'OUVRE.
 *
 * Relevé du patron, deux fois : « sur la vue 3D de base au scan, on coche
 * les boutons pour afficher les meubles et les murs seulement », puis, la
 * chose n'ayant pas tenu sur l'appareil : « sur le plan 3D, de base on doit
 * avoir actif les meubles et les murs ».
 *
 * Elle n'avait pas tenu pour une raison qu'aucun banc ne voyait : le calque
 * des meubles est GARDÉ d'une session à l'autre. Éteint une fois, sur un
 * plan quelconque, il restait éteint — sur le scan suivant, et sur tous les
 * suivants. Le réglage était juste ; ce qui ne l'était plus, c'est le
 * défaut sur lequel il s'appliquait.
 *
 * Un plan qui s'ouvre repose donc ses calques. Ce qu'on éteint ensuite vaut
 * pour la séance, pas pour la vie de l'application : un plan s'ouvre sur ce
 * qu'il montre, pas sur ce qu'on cachait la dernière fois.
 */
const CALQUES_DE_BASE = {
  showFurniture: true,
  solidWalls: true,
  /*
    LE PLAN PARLE DÈS L'OUVERTURE — correctif de l'audit : il s'ouvrait sans
    un nom de pièce ni un mètre carré, parce que le calque des surfaces était
    commun à la 2D et à la 3D. Ils sont séparés : la 2D s'ouvre nommée, la 3D
    reste sur ses meubles et ses murs.
  */
  showSurfaces: true,
  show3DSurfaces: false,
  showTextures: false,
  showSol: true,
  showNotes: true,
  showPhotos: true,
  showGrille: false,
} as const;

/**
 * LE TABLEAU, RANGÉ APRÈS CHAQUE GESTE — chaque organe reçoit la rangée où
 * il se trouve (un relevé ancien, rangé dans l'ordre, s'y fixe) et le
 * différentiel qui le précède sur le rail (voir `rattacher`) : on ne demande
 * plus « sous quel différentiel ? », on le lit sur le tableau.
 */
function rangerLeTableau(t: TableauExistant): TableauExistant {
  const impl = implanter(t);
  const rangeeDe = new Map(impl.modules.map((m) => [m.depart.id, m.rangee]));
  const places = t.departs.map((d) => {
    const r = rangeeDe.get(d.id);
    return r === undefined || r === d.rangee ? d : { ...d, rangee: r };
  });
  return { ...t, departs: rattacher(places, impl) };
}

export const useScanStore = create<ScanState>((set, get) => {
  // Le pont entre l'écriture différée — qui vit hors du store — et l'état que
  // l'écran observe. Une seule alerte par incident : voir `persistSoon`.
  signalerPanne = (p) => {
    if (p && get().panne) return;
    set({ panne: p });
  };
  surEchecDEcriture = (id) => {
    if (get().currentSaveId === id) set({ dirty: true });
  };
  /**
   * Photographie le plan avant de le modifier. `key` regroupe les appels
   * rapprochés d'un même geste : un glissement de coin ne doit produire
   * qu'UNE entrée d'historique, pas une par image.
   */
  const pushHistory = (key: string) => {
    const now = Date.now();
    /*
      LA FUSION NE VAUT QUE POUR LES GESTES CONTINUS.

      Trouvé en simulant un utilisateur qui équipe un mur : on pose deux
      prises l'une après l'autre, on touche « Annuler »… et les DEUX
      disparaissent. Deux gestes distincts n'en faisaient qu'un.

      La fusion a pourtant une bonne raison d'être, et il faut la garder :
      un mur qu'on fait glisser envoie cinquante états par seconde, et sans
      elle il faudrait cinquante annulations pour revenir en arrière d'un
      seul geste. Mais elle ne concerne QUE ces gestes-là, ceux qui suivent
      le doigt — et ils se reconnaissent à leur clé, qui désigne l'objet
      manipulé (`move:mur-3:a`, `moveObject:o1`).

      Un geste DISCRET — poser une prise, ajouter une pièce, supprimer un
      mur — porte une clé simple, sans deux-points, et ne se fusionne
      jamais avec le suivant : si rapide soit-il, c'est un geste de plus, et
      « Annuler » lui doit un retour en arrière.
    */
    const continu = key.includes(':');
    // Le doigt bouge : les analyses de l'écran attendent qu'il se lève.
    if (continu) pasDeGeste();
    if (continu && key === lastKey && now - lastAt < 800) {
      lastAt = now;
      return;
    }
    lastKey = key;
    lastAt = now;
    // Un geste neuf ferme l'avenir : voir `avenir`.
    if (avenir.length > 0) {
      avenir.length = 0;
      if (get().canRedo) set({ canRedo: false });
    }
    const st = get();
    history.push({
      walls: st.walls,
      openings: st.openings,
      objects: st.objects,
      rooms: st.rooms,
      fixtures: st.fixtures,
      photos: st.photos,
      ceiling: st.ceiling,
      notes: st.notes,
      mesures: st.mesures,
    });
    if (history.length > HISTORY_MAX) {
      history.shift();
      /*
        LA MARQUE D'ENREGISTREMENT GLISSE AVEC L'HISTORIQUE — revue « Hugo » :
        après cinquante gestes et quarante « Annuler », l'app disait « rien à
        enregistrer » sur un plan qui n'était PAS celui enregistré (la
        hauteur à 2,60 au lieu de la sienne), et « Revenir à la version
        enregistrée » disparaissait. L'état enregistré recule d'un cran avec
        le plus ancien point ; sorti de l'historique, il n'est plus jamais
        « retrouvé » par un « Annuler ».
      */
      savedDepth = savedDepth > 0 ? savedDepth - 1 : -1;
    }
    if (!st.canUndo) set({ canUndo: true });
  };

  /**
   * LE CHIFFRAGE COURANT, TEL QU'IL S'ÉCRIT DANS UNE ENTRÉE.
   *
   * Une seule lecture pour les quatre endroits qui enregistrent — mise à jour
   * du dossier courant, copie, création à la volée, brouillon. Quatre
   * recopies finiraient par diverger au premier champ ajouté, et l'on
   * perdrait le caddie d'un chemin sur deux sans que rien ne casse.
   */
  const devisDuPlan = (st: {
    gammeDevis: GammeId;
    devisEcartes: string[];
    devisQuantites: Record<string, number>;
    devisAjouts: { code: string; quantite: number }[];
    devisPrix: Record<string, number>;
    devisNumero: string | null;
    devisLignesLibres?: LigneLibre[];
    devisHeures?: Record<string, number>;
    devisTva?: number | null;
  }): DevisEnregistre => ({
    gamme: st.gammeDevis,
    ecartes: st.devisEcartes,
    quantites: st.devisQuantites,
    ajouts: st.devisAjouts,
    ...(Object.keys(st.devisPrix).length > 0 ? { prix: st.devisPrix } : {}),
    ...(st.devisNumero ? { numero: st.devisNumero } : {}),
    ...(st.devisLignesLibres && st.devisLignesLibres.length > 0 ? { libres: st.devisLignesLibres } : {}),
    ...(st.devisHeures && Object.keys(st.devisHeures).length > 0 ? { heures: st.devisHeures } : {}),
    ...(typeof st.devisTva === 'number' ? { tva: st.devisTva } : {}),
  });

  /**
   * ET CE QU'ON REMET DANS LE MAGASIN EN OUVRANT UN PLAN.
   *
   * Un relevé d'avant ce jour n'en porte pas : il s'ouvre sur un ticket NEUF,
   * et surtout pas sur celui qu'on avait sous les yeux — c'est exactement la
   * panne qu'on corrige, un devis qui passe d'un chantier à l'autre.
   */
  const devisRepose = (devis?: DevisEnregistre) => ({
    gammeDevis: devis?.gamme ?? GAMMES[0].id,
    devisEcartes: devis?.ecartes ?? [],
    devisQuantites: devis?.quantites ?? {},
    devisAjouts: devis?.ajouts ?? [],
    devisPrix: devis?.prix ?? {},
    devisNumero: devis?.numero ?? null,
    devisLignesLibres: Array.isArray(devis?.libres)
      ? devis.libres.map(ligneLibrePropre).filter((l): l is LigneLibre => l !== null)
      : [],
    devisHeures: devis?.heures ?? {},
    devisTva: TAUX_DE_TVA.find((t) => t === devis?.tva) ?? null,
    // Un dossier qu'on ouvre n'a pas lu l'avertissement du devis.
    etapeDevis: 0,
  });

  /**
   * La profondeur d'historique au moment du dernier enregistrement.
   *
   * C'est elle qui dit si le plan a VRAIMENT changé. `dirty` était posé à
   * vrai par chaque retouche et jamais repris : en annulant jusqu'à
   * revenir à l'état enregistré, le bouton de sauvegarde restait affiché,
   * proposant d'enregistrer ce qui l'était déjà. Comparer la profondeur
   * répond exactement à la question — et sans effacer l'historique, donc
   * sans priver d'annulation ce qui a été fait avant la sauvegarde.
   */
  let savedDepth = 0;

  /**
   * UNE ENTRÉE DE BIBLIOTHÈQUE DE PLUS — le palier gratuit décide, et paie.
   *
   * Relevé du patron : « vérifie que pour un utilisateur pas abonné, il ne
   * peut scanner qu'un seul plan ». Deux gestes créaient une entrée sans
   * jamais consulter la règle NI la débiter : « Dupliquer » dans la
   * bibliothèque, et « Enregistrer une copie » dans le bandeau du plan. Un
   * plan dupliqué dix fois faisait dix plans, et le compteur en voyait
   * toujours un.
   *
   * Une copie EST un plan : elle se chiffre à part, elle s'exporte à part,
   * elle vit sa vie. Elle se compte donc comme un plan.
   */
  const placePourUnPlanDePlus = (): boolean => {
    const compte = useAccountStore.getState();
    if (!compte.peutCreerPlan()) return false;
    compte.noterPlanCree();
    return true;
  };

  /*
    CE PLAN A-T-IL DÉJÀ ÉTÉ COMPTÉ ?

    Le palier gratuit se consomme quand une entrée de bibliothèque naît. Or
    on peut supprimer cette entrée et garder le plan sous les yeux — c'est
    voulu, « on ne retire pas la 3D des mains de qui la regarde ». Le
    ré-enregistrer créait alors une SECONDE entrée, et débitait une seconde
    fois : un relevé payé deux fois.

    La règle du projet dit que supprimer ne REND pas le quota ; elle ne dit
    pas qu'il peut se prendre deux fois pour le même travail. La marque
    suit donc le plan à l'écran, et ne se lève qu'en repartant d'un plan
    neuf (`reset`, qui est le passage obligé de tout nouveau relevé).
  */
  let dejaCompte = false;

  /*
    L'AVENIR : CE QU'UNE ANNULATION A RETIRÉ.

    L'application savait revenir en arrière, jamais repartir en avant. Sur
    un chantier, on annule d'un geste de trop — le doigt appuie deux fois,
    ou l'on se ravise — et le travail était perdu pour de bon : le seul
    chemin pour le retrouver était de le refaire à la main. C'est encore une
    perte de travail, et la plus vicieuse : elle vient d'un bouton dont le
    rôle est précisément de rattraper les erreurs.

    Un geste NEUF vide cette pile : on ne refait pas ce qui n'a plus de sens
    dans un plan qui a changé de branche. C'est la règle de tous les
    éditeurs, et l'inverse produirait des états impossibles.
  */
  const avenir: Snapshot[] = [];

  /** Repart d'un plan vierge d'historique (nouveau scan, ouverture, revert). */
  const clearHistory = () => {
    history.length = 0;
    /*
      L'AVENIR PART AVEC LE PASSÉ.

      Sans cette ligne, « Refaire » ressortirait des morceaux du relevé
      PRÉCÉDENT dans le plan qu'on vient d'ouvrir : la pile survit au
      changement de dossier, elle, et rien n'irait dire à l'utilisateur d'où
      sortent ces murs.
    */
    avenir.length = 0;
    lastKey = '';
    savedDepth = 0;
    set({ canUndo: false, canRedo: false });
  };

  /*
    LE DÉCLENCHEUR DE LA MONTÉE.

    Le coffre et le geste `deposerAuCompte` existaient déjà, mais personne
    ne les appelait : le patron pouvait réinstaller l'application et
    retrouver une bibliothèque vide alors qu'il avait un compte. On accroche
    donc le dépôt à l'ENREGISTREMENT — le geste par lequel un relevé devient
    un dossier, et le seul moment où l'électricien considère son travail
    comme acquis.

    Rien n'est attendu : la fonction rend la main tout de suite, et un
    serveur injoignable ne se voit nulle part. Le plan est déjà écrit dans
    le téléphone quand on arrive ici.
  */
  const deposerPlusTard = (id: string) => {
    const enCours = depots.get(id);
    if (enCours) clearTimeout(enCours);
    depots.set(
      id,
      setTimeout(() => {
        depots.delete(id);
        // La sauvegarde en ligne est Pro : sans abonnement, le plan reste
        // dans le téléphone (il y est déjà écrit), et rien ne monte.
        if (!useAccountStore.getState().pro) return;
        // Un plan gardé douze heures n'est pas enregistré : il ne monte pas.
        // Un plan à la corbeille non plus : sa copie en ligne l'attend telle quelle.
        const plan = get().saves.find((x) => x.id === id);
        if (plan?.supprimeLe || plan?.corbeille) return;
        get()
          .deposerAuCompte(id, identiteDuCompte())
          .catch(() => {
            // Un dépôt manqué ne se dit pas : le prochain enregistrement
            // remontera le plan, et l'original n'a jamais quitté le
            // téléphone.
          });
      }, DEPOT_DELAI),
    );
  };

  /** Ce que le plan à l'écran contient — tel qu'une entrée le garderait. */
  const contenuCourant = (): ContenuDuPlan => {
    const st = get();
    return {
      name: st.scanName,
      client: st.client || undefined,
      address: st.address || undefined,
      rooms: st.rooms,
      walls: st.walls,
      openings: st.openings,
      objects: st.objects,
      fixtures: st.fixtures,
      photos: st.photos,
      ceiling: st.ceiling,
      notes: st.notes,
      mesures: st.mesures,
      north: st.north ?? undefined,
      modelPath: st.modelPath,
      // Le chiffrage suit le plan : voir `DevisEnregistre`.
      devis: devisDuPlan(st),
      /*
        LE TABLEAU EXISTANT S'ENREGISTRE AVEC LE PLAN — revue « Agathe » :
        « Enregistrer » sur un plan déjà en bibliothèque (c'est le cas de
        tout plan scanné) écrivait tout SAUF lui. L'écran disait « Dernière
        MAJ », le brouillon s'effaçait, et le relevé des départs — ce quart
        d'heure devant le tableau — manquait à la réouverture.
      */
      existant: st.existant ?? undefined,
      cleDuReleve: st.cleDuReleve ?? undefined,
    };
  };

  /** Recopie le scan courant dans son entrée de bibliothèque et persiste. */
  const syncCurrent = () => {
    const st = get();
    if (!st.currentSaveId) return;
    const contenu = contenuCourant();
    const saves = st.saves.map((s) =>
      s.id === st.currentSaveId
        ? {
            ...s,
            ...contenu,
            /*
              ENREGISTRER, C'EST GARDER POUR DE BON : le plan rangé pour
              douze heures ne s'efface plus, et les modifications qui
              attendaient sont celles qu'on vient d'écrire.
            */
            supprimeLe: undefined,
            retouche: undefined,
            updatedAt: Date.now(),
          }
        : s,
    );
    set({ saves });
    persistSoon(saves);
    deposerPlusTard(st.currentSaveId);
  };

  /**
   * LA REDÉTECTION D'UN NIVEAU — et d'un seul.
   *
   * Revue « Inès », vérifiée sur le vrai magasin : la redétection nettoyait
   * et cherchait les pièces sur les murs de TOUS les niveaux mélangés, puis
   * renumérotait `room-1…` sans niveau. Avec trois niveaux, il ne restait
   * qu'une pièce, au rez-de-chaussée ; l'étage et la cave perdaient leurs
   * pièces, leurs surfaces et leurs meubles. Et ce sont précisément les
   * gestes de correction — « Redétecter », « Redresser », « Scinder ».
   *
   * On prend la tranche du niveau (le filtre du plan : murs et pièces à leur
   * niveau, le reste suit son support), on la refait, et on la remet à sa
   * place. Les identifiants d'étage portent leur niveau (`room-1-2`), comme
   * ceux d'un étage scanné.
   */
  const redetecterUnNiveau = (n: number, historique = true, declarerEn?: Pt): boolean => {
    const st = get();
    const jeu = jeuDuNiveau(st, n);
    const olds = roomParts(jeu.walls, jeu.rooms);
    // Les recoins déclarés restent des pièces : un point dans chacun.
    const declarees = olds
      .filter((p) => jeu.rooms.find((r) => r.id === p.roomId)?.declaree)
      .map((p) => p.labelAt);
    if (declarerEn) declarees.push(declarerEn);
    // Le graphe a pu changer (cloison ajoutée, coin déplacé) : on le
    // renettoie avant d'y rechercher les faces.
    const walls = sansEclats(mergeColinear(splitAtJunctions(weldCorners(jeu.walls))), []).walls.map(
      (w) => (n === NIVEAU_RDC || w.niveau === n ? w : { ...w, niveau: n }),
    );
    // Les menuiseries départagent une petite PIÈCE d'une gaine technique :
    // ce qui s'ouvre est une pièce, si petit soit-il. La cloison de deux
    // pièces fusionnées ne sépare plus rien (voir `nonSeparateur`).
    const shapes = detectRooms(walls.filter((w) => !w.nonSeparateur), undefined, jeu.openings, declarees);
    if (shapes.length === 0) return false;
    /*
      LA GARDE PASSE AVANT LE POINT DE REPRISE.

      `pushHistory` veut dire « retiens l'état d'avant ». Appelé puis suivi
      d'un renoncement, il laisse dans l'historique un point qui ne
      correspond à AUCUN changement — et au doigt, cela donne : on touche
      « Annuler », il ne se passe rien, on touche une seconde fois, et là
      ça revient en arrière.

      C'est l'un des rares défauts qu'on ne signale jamais, parce qu'on
      croit avoir mal appuyé. Voir `annulerunefois`.

      Un geste qui a déjà le sien (le mur qui referme une pièce) n'en
      ajoute pas : un appui sur « Annuler » défait le tout.
    */
    if (historique) pushHistory('redetect');
    const idPiece = (i: number) => (n === NIVEAU_RDC ? `room-${i + 1}` : `room-${n}-${i + 1}`);
    /**
     * Le graphe vient d'être recousu : un mur coupé en deux ne garde son
     * identifiant que sur le premier morceau, un mur fusionné que celui
     * du plus long. Tout ce qui s'accroche à un mur doit donc être
     * reporté sur le nouveau jeu, par sa POSITION — sans quoi une prise
     * de la seconde moitié d'un mur se dessine hors du mur, et une prise
     * de mur fusionné disparaît de l'écran, des comptages et du métré.
     */
    const fixtures = reprojectFixtures(jeu.walls, walls, jeu.fixtures);
    const photos = reprojectAnchors(jeu.walls, walls, jeu.photos);
    const floor = jeu.rooms[0]?.floor ?? st.rooms[0]?.floor ?? null;
    const contours = shapes.map((s) => s.outline);
    const objects = jeu.objects.map((o) => ({
      ...o,
      roomId: idPiece(roomIndexAt({ x: o.transform[12], z: o.transform[14] }, contours)),
    }));
    const categoriesDe = (i: number) =>
      objects.filter((o) => o.roomId === idPiece(i) && voteDansLaPiece(o, shapes[i].outline)).map((o) => o.category);
    const kinds = shapes.map((_, i) => deduceRoomKind(categoriesDe(i)));
    const ouvertures = lesPortesDeGarage(jeu.openings, nommerLesGarages(kinds, contours, categoriesDe, jeu.openings, walls));
    const auto = nameRooms(kinds, shapes.map((s) => s.outline));
    // Les noms donnés à la main survivent : on rattache chaque nouvelle
    // pièce à l'ancienne dont le point de cartouche tombe dedans.
    /*
      QUELLE ANCIENNE PIÈCE DEVIENT QUELLE NOUVELLE : le lien sert deux
      fois — garder les noms donnés à la main, et REPOSER le plafond. La
      soudure des coins (`weldCorners`) vient peut-être de tirer un pan de
      mur de plusieurs centimètres pour refermer un interstice : la pièce
      s'est recalée, ses spots doivent se recaler du même coup.
    */
    const liens = shapes.map((s) =>
      olds.find((p) => pointInPolygon(p.labelAt, s.outline)),
    );
    /*
      LA DÉCO SURVIT AU RECALCUL — revue « Yasmine » : « Redétecter » et
      « Redresser » ne reportaient que le nom et le type. Peinture Lin, sol
      Chêne, mur d'accent terracotta : tout repartait au blanc, et seul un
      « Annuler » remarqué à temps le rendait. Un mur d'accent se retrouve
      par son identifiant, ou à défaut par sa place (le graphe recousu a pu
      le renommer).
    */
    const accentsRepris = (accents: Record<string, string>, siens: string[]) => {
      const out: Record<string, string> = {};
      for (const [id, cle] of Object.entries(accents)) {
        if (siens.includes(id)) {
          out[id] = cle;
          continue;
        }
        const vieux = jeu.walls.find((w) => w.id === id);
        if (!vieux) continue;
        const m = { x: (vieux.a.x + vieux.b.x) / 2, z: (vieux.a.z + vieux.b.z) / 2 };
        const neuf = walls.find((w) => siens.includes(w.id) && pointOnSeg(m, w.a, w.b).dist < 0.05);
        if (neuf) out[neuf.id] = cle;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };
    const rooms: RoomEntry[] = shapes.map((s, i) => {
      const previous = liens[i];
      const kept = previous
        ? jeu.rooms.find((r) => r.id === previous.roomId)
        : undefined;
      const declaree =
        kept?.declaree || declarees.some((p) => pointInPolygon(p, s.outline));
      const accents = kept?.accents ? accentsRepris(kept.accents, s.wallIds) : undefined;
      // Le relevé du plafond ne vaut que pour la même pièce, pas pour ses moitiés.
      const seule = !!previous && liens.filter((x) => x === previous).length === 1;
      return {
        id: idPiece(i),
        name: kept?.name || auto[i],
        wallIds: s.wallIds,
        // Le type relevé par RoomPlan au scan survit au recalcul : les
        // meubles seuls en savent moins que lui.
        kind: kept?.kind ?? kinds[i] ?? undefined,
        floor,
        ...(n === NIVEAU_RDC ? {} : { niveau: n }),
        ...(declaree ? { declaree: true } : {}),
        ...(kept?.peinture ? { peinture: kept.peinture } : {}),
        ...(kept?.hauteur ? { hauteur: kept.hauteur } : {}),
        ...(kept?.sol ? { sol: kept.sol } : {}),
        ...(accents ? { accents } : {}),
        ...(seule && kept?.releve ? { releve: kept.releve } : {}),
      };
    });
    // Deux pièces peuvent hériter du même nom : on renumérote les doublons.
    sansNomEnDouble(rooms);
    /*
      LE PLAFOND SUIT LA RENUMÉROTATION. Les pièces reçoivent de
      nouveaux identifiants : un point lumineux qui garderait l'ancien
      deviendrait orphelin — la pièce ressortait « sans point lumineux »
      avec un DCL au plafond, et « Poser le DCL » en posait un deuxième.
      Chaque point se rattache à la pièce qui contient son ancrage.
    */
    const ceiling = jeu.ceiling.map((cl) => {
      /*
        LE POINT SE REPOSE D'ABORD, PUIS SE RATTACHE. Sa pièce d'avant se
        retrouve par son identifiant, ou à défaut par le polygone qui le
        contient (les identifiants d'avant la détection) ; sa pièce
        d'après est celle que le lien désigne. Entre les deux boîtes, il
        garde sa position relative — le centre reste le centre.
      */
      const vieille =
        olds.find((r) => r.roomId === cl.roomId) ??
        olds.find((r) => r.surface && pointInPolygon(cl.at, r.surface.pts));
      const j = vieille ? liens.findIndex((l) => l === vieille) : -1;
      const at =
        vieille?.surface && j >= 0
          ? recadrerAuCadre(cl.at, vieille.surface.pts, shapes[j].outline)
          : cl.at;
      // Le tracé d'un ruban suit le même recadrage que son ancre.
      const deplace = vieille?.surface && j >= 0
        ? avecSaTrace(cl, (p) => recadrerAuCadre(p, vieille!.surface!.pts, shapes[j].outline))
        : cl;
      return { ...deplace, at, roomId: idPiece(roomIndexAt(at, contours)) };
    });
    set({
      walls: remplacer(st.walls, jeu.walls, walls),
      ...(ouvertures !== jeu.openings ? { openings: remplacer(st.openings, jeu.openings, ouvertures) } : {}),
      rooms: remplacer(st.rooms, jeu.rooms, rooms),
      objects: remplacer(st.objects, jeu.objects, objects),
      fixtures: remplacer(st.fixtures, jeu.fixtures, fixtures),
      photos: remplacer(st.photos, jeu.photos, photos),
      ceiling: remplacer(st.ceiling, jeu.ceiling, ceiling),
      dirty: true,
    });
    return true;
  };

  /**
   * UN RELEVÉ QUI S'AJOUTE AU DOSSIER SANS RIEN REMPLACER.
   *
   * Deux chemins y mènent : l'ÉTAGE qu'on monte (`finalizeEtage`), pré-calé
   * centre sur centre sur le niveau du dessous ; et la PIÈCE que l'iPhone ne
   * sait plus réunir au plan (`finalizeMerge`, passages oubliés ou
   * étrangers) — elle se pose à droite de ce qui existe, comme une pièce
   * dessinée, et se glisse ensuite à sa place.
   *
   * Deux précautions qui viennent du terrain :
   *
   * — les identifiants portent le niveau (`room-1-3`) — et, pour la pièce
   *   posée à côté, une marque à elle : détectés séparément, deux relevés
   *   produisaient chacun un « room-1 », le meuble du salon se rattachait à
   *   la chambre du dessus, et le métré comptait deux fois la même pièce ;
   *
   * — l'étage est PRÉ-CALÉ sur celui du dessous. ARKit repart de l'endroit
   *   où l'on a appuyé sur « Scanner » : après l'escalier, le relevé du haut
   *   tombe à vingt mètres de celui du bas. On aligne les emprises pour
   *   partir d'un empilement plausible ; le recalage fin se fait ensuite à
   *   la main, sur le filigrane.
   */
  const empilerUnReleve = (r: ScanResult, n: number, aCote: boolean) => {
    const st = get();
    const surfaces = r.rooms?.length
      ? r.rooms.flatMap((x) => x.surfaces ?? [])
      : r.surfaces ?? [];
    const entrants = r.rooms?.length
      ? r.rooms.flatMap((x) => x.objects ?? [])
      : r.objects ?? [];
    // Le coffre de volet, que RoomPlan lisse, relu dans le maillage LiDAR ;
    // et l'encadrement réel de chaque baie (voir `geometry/logique`).
    // Les façades de placard, que RoomPlan range parmi les portes.
    const placardsEtage = facadesDePlacard(
      avecLesBordsDuLidar(avecCoffresDuLidar(surfaces.map((s) => toSegment(s)), r.dessus), r.dessus, r.tableaux),
      entrants,
    );
    const segments = placardsEtage.segments;
    const nettoyes = sansEclats(
      mergeColinear(
        splitAtJunctions(
          epaisseursAccordees(
            weldCorners(fusionnerMursDoubles(preEquerrage(segments.filter((s) => s.type === 'wall')))),
          ),
        ),
      ),
      [],
    ).walls;
    if (nettoyes.length === 0) {
      set({ processing: false, scanning: false, etageEnCours: null });
      return;
    }
    // La logique de construction : d'équerre, sur des niveaux communs.
    const logique = releveLogique(nettoyes, segments.filter((s) => s.type !== 'wall'));
    const bruts = logique.walls;
    const ouverturesBrutes = logique.openings;

    const emprise = (ws: WallSeg[]) => {
      const xs = ws.flatMap((w) => [w.a.x, w.b.x]);
      const zs = ws.flatMap((w) => [w.a.z, w.b.z]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    };
    const venu = emprise(bruts);
    let dx = 0;
    let dz = 0;
    if (aCote) {
      /* À droite du niveau, un demi-mètre plus loin, alignée sur son haut. */
      const ici = st.walls.filter((w) => niveauDe(w) === n);
      if (ici.length > 0) {
        const e = emprise(ici);
        dx = e.x1 + 0.5 - venu.x0;
        dz = e.z0 - venu.z0;
      }
    } else {
      /* Le pré-calage : les deux emprises, centre sur centre. */
      const dessous = st.walls.filter((w) => niveauDe(w) === n - 1);
      const reference = dessous.length > 0 ? dessous : st.walls;
      if (reference.length > 0) {
        const cible = emprise(reference);
        dx = (cible.x0 + cible.x1) / 2 - (venu.x0 + venu.x1) / 2;
        dz = (cible.z0 + cible.z1) / 2 - (venu.z0 + venu.z1) / 2;
      }
    }
    const marque = aCote ? `p${Date.now().toString(36)}` : `n${n}`;
    const pose = <T extends WallSeg>(ws: T[]): T[] =>
      ws.map((w) => ({
        ...w,
        id: `${w.id}-${marque}`,
        a: { x: w.a.x + dx, z: w.a.z + dz },
        b: { x: w.b.x + dx, z: w.b.z + dz },
        niveau: n,
      }));
    const walls = pose(bruts);
    let openings = baiesHorsDesAngles(baiesVitrees(portesVuesOuvertes(pose(ouverturesBrutes), walls), walls), walls);

    const detected = detectRooms(walls, undefined, openings);
    const shapes =
      detected.length > 0
        ? detected
        : [{ outline: [], wallIds: walls.map((w) => w.id), area: 0 }];
    const idPiece = (i: number) => (aCote ? `room-${n}-${marque}-${i + 1}` : `room-${n}-${i + 1}`);

    const objects: ObjectData[] = calerLesMeubles(orienterLesSieges(
      separerLeMobilier(
        // Le canapé d'angle d'abord : séparé, sa méridienne serait repoussée.
        reunirLesCanapesDAngle(sansMeublesEnDouble(entrants.filter((o) => !placardsEtage.meublesDuPlacard.has(o.id)))).map((o) => {
          const t = [...o.transform];
          t[12] += dx;
          t[14] += dz;
          return {
            ...o,
            id: `${o.id}-${marque}`,
            transform: t,
            roomId: idPiece(
              roomIndexAt(
                { x: t[12], z: t[14] },
                shapes.map((s) => s.outline),
              ),
            ),
          };
        }),
      ),
      walls,
    ), walls);
    const categoriesDe = (i: number) =>
      objects.filter((o) => o.roomId === idPiece(i) && voteDansLaPiece(o, shapes[i].outline)).map((o) => o.category);
    const kinds = shapes.map((sh, i) =>
      deduireLaPiece(
        // Les sections arrivent brutes : elles se décalent comme les murs.
        (r.sections ?? [])
          .filter(
            (x) => sh.outline.length >= 3 && pointInPolygon({ x: x.x + dx, z: x.z + dz }, sh.outline),
          )
          .map((x) => x.label),
        categoriesDe(i),
      ),
    );
    openings = lesPortesDeGarage(
      openings,
      nommerLesGarages(kinds, shapes.map((s) => s.outline), categoriesDe, openings, walls),
    );
    /*
      DEUX « CHAMBRE » D'UN NIVEAU À L'AUTRE — revue « Hugo » : l'étage
      reprenait les noms du rez-de-chaussée ; la coloc avait deux « Chambre »
      et deux « Chambre 2 » dans le plan, la liste et la vignette. Les noms
      se numérotent sur tout le logement.
    */
    const prisAilleurs = get().rooms.map((r) => r.name ?? '').filter(Boolean);
    const noms = nameRooms(kinds, shapes.map((s) => s.outline)).reduce<string[]>((acc, nom) => {
      acc.push(nom ? nomDePieceLibre(nom, [...prisAilleurs, ...acc]) || nom : nom);
      return acc;
    }, []);
    const pieces: RoomEntry[] = shapes.map((s, i) => {
      /*
        LE PLAFOND RELEVÉ À L'ÉTAGE AUSSI — revue « Malik » : le relevé du
        rez-de-chaussée gardait sa hauteur et son rampant, celui de l'étage
        les perdait. Le contour, décalé dans le plan, se relit dans le
        repère brut du scan.
      */
      const versLeBrutEtage = (p: Pt) => ({ x: p.x - dx, z: p.z - dz });
      const releve = releveDeLaPiece(
        r,
        s.outline.map(versLeBrutEtage),
        s.area,
        walls
          .filter((w) => s.wallIds.includes(w.id))
          .map((w) => ({ a: versLeBrutEtage(w.a), b: versLeBrutEtage(w.b), height: w.height })),
      );
      return {
        id: idPiece(i),
        name: noms[i],
        wallIds: s.wallIds,
        kind: kinds[i] ?? undefined,
        floor: r.floor ?? r.rooms?.[0]?.floor ?? null,
        niveau: n,
        ...(releve ? { releve } : {}),
      };
    });

    /* Ce que le viseur a posé pendant le relevé arrive avec lui. */
    const vise = ancrerElec(
      r.elec ?? [],
      walls,
      pieces.map((x, i) => ({ id: x.id, outline: shapes[i]?.outline })),
      (prefixe, k) => `${prefixe}-${Date.now().toString(36)}-${marque}-${k}`,
    );

    const cleDuPlan = st.cleDuReleve ?? nouvelleCle();
    /*
      LE NOM AUTOMATIQUE SUIT LE LOGEMENT — revue « Hugo » : la coloc de six
      pièces sur deux niveaux restait « T3 · 14/10 ». Tant que le plan porte
      le nom que l'app lui avait donné, il se recompte ; un nom choisi reste.
    */
    const creeLe = st.saves.find((x) => x.id === st.currentSaveId)?.createdAt;
    const nomRecompte =
      creeLe !== undefined && st.scanName === defaultName(new Date(creeLe), st.rooms)
        ? defaultName(new Date(creeLe), [...st.rooms, ...pieces])
        : null;
    pushHistory(aCote ? 'completerReleve' : 'ajouterEtage');
    set({
      ...(nomRecompte ? { scanName: nomRecompte } : {}),
      walls: [...st.walls, ...walls],
      openings: [...st.openings, ...openings],
      rooms: [...st.rooms, ...pieces],
      objects: [...st.objects, ...objects],
      fixtures: [...st.fixtures, ...vise.fixtures],
      ceiling: [...st.ceiling, ...vise.ceiling],
      photos: [
        ...st.photos,
        ...photosDesMurs(r.photosMurs ?? [], surfaces, walls, { decalage: { dx, dz } }),
      ],
      // On travaille au niveau qu'on vient de relever, pas à celui qu'on a
      // quitté.
      niveauCourant: n,
      etageEnCours: null,
      /*
        L'ÉTAGE A SA FENÊTRE DE FIN DE SCAN — revue « Nadia » : le
        rez-de-chaussée proposait ses meubles et l'électricité aux normes,
        l'étage rien. Pour une pièce posée à côté, on ne demande rien : elle
        n'est pas encore à sa place.
      */
      ...(aCote ? {} : { arrivage: { meubles: objects.length, posesViseur: vise.fixtures.length + vise.ceiling.length } }),
      processing: false,
      scanning: false,
      screen: 'result',
      planVierge: false,
      dirty: true,
      cleDuReleve: cleDuPlan,
      /*
        LES PASSAGES QUE GARDE L'IPHONE sont désormais ceux de cet étage,
        dans leur repère brut : un passage de plus y sera décalé du même
        pré-calage. La pièce posée à côté n'a pas de place sûre — le
        passage suivant repartira à neuf.
      */
      passagesNatifs: aCote ? null : { cle: cleDuPlan, niveau: n, dx, dz },
    });
    if (aCote) {
      astuce(
        'L’iPhone n’avait plus les passages de ce plan : la pièce est posée à côté. Glissez-la à sa place.',
        { icone: 'rooms' },
      );
    }
  };

  /**
   * LES MURS D'UNE PIÈCE — son contour d'abord, l'étiquette ensuite.
   *
   * Revue « Hugo » : « Cotes » de la pièce ne faisait plus rien dès qu'une
   * cloison était posée. Les gestes cherchaient les murs par l'étiquette
   * posée à la création (`roomId`) ; la redétection renomme les pièces
   * sans réécrire les murs, la cloison hérite de l'étiquette du studio, et
   * la pièce accolée partage un mur qui n'est pas « à elle ». Le contour
   * (`wallIds`) est ce que l'écran montre, et ce que le bouton « Cotes »
   * regarde déjà : le magasin regarde la même chose.
   */
  const mursDeLaPiece = (roomId: string): WallSeg[] => {
    const st = get();
    const piece = st.rooms.find((r) => r.id === roomId);
    if (piece?.wallIds?.length) {
      const ids = new Set(piece.wallIds);
      const contour = st.walls.filter((w) => ids.has(w.id));
      if (contour.length > 0) return contour;
    }
    return st.walls.filter((w) => w.roomId === roomId);
  };

  /**
   * REPOSE UNE PIECE RECTANGULAIRE a de nouvelles cotes.
   *
   * Le fond commun de deux gestes : taper « 5,18 x 4,05 » dans le
   * bandeau, et tirer un cote au doigt. Ils ne different que par le coin
   * qui ne bouge pas (`origine`) et par la cle d'historique — continue
   * pour le doigt, qui envoie cinquante images par seconde, discrete
   * pour le clavier, ou chaque saisie merite son « Annuler ».
   */
  const reposerPiece = (
    roomId: string,
    largeur: number,
    profondeur: number,
    origine: Pt | null,
    cle: string,
    auNu = false,
  ) => {
      const st = get();
      const murs = mursDeLaPiece(roomId);
      if (murs.length !== 4) return;
      // Une cote nulle ou négative n'est pas une intention, c'est une
      // saisie ratée : on ne la borne pas, on l'ignore.
      if (!(largeur > 0) || !(profondeur > 0)) return;
      let L = Math.min(MUR_MAX_M, Math.max(0.6, largeur));
      let P = Math.min(MUR_MAX_M, Math.max(0.6, profondeur));
      const xs = murs.flatMap((w) => [w.a.x, w.b.x]);
      const zs = murs.flatMap((w) => [w.a.z, w.b.z]);
      const x0 = Math.min(...xs);
      const z0 = Math.min(...zs);
      const x1 = Math.max(...xs);
      const z1 = Math.max(...zs);
      // Un contour qui n'est pas d'aplomb n'est pas un rectangle : on ne
      // touche pas à ce qu'on ne sait pas reconstruire.
      const droit = murs.every(
        (w) => Math.abs(w.a.x - w.b.x) < 1e-3 || Math.abs(w.a.z - w.b.z) < 1e-3,
      );
      if (!droit || x1 - x0 < 1e-3 || z1 - z0 < 1e-3) return;
      /*
        DES COTES INTÉRIEURES — décision du patron pour les plans dessinés :
        on tape ce que donne le mètre, de mur à mur. Le plan dessine les
        axes : chaque côté recule d'une demi-épaisseur de SON mur.
      */
      if (auNu && estDessine(murs)) {
        const demi = (garde: (w: WallSeg) => boolean) => {
          const w = murs.find(garde);
          return (w ? epaisseurDe(w) : WALL_T) / 2;
        };
        const enX = (x: number) => (w: WallSeg) => Math.abs(w.a.x - x) < 1e-3 && Math.abs(w.b.x - x) < 1e-3;
        const enZ = (z: number) => (w: WallSeg) => Math.abs(w.a.z - z) < 1e-3 && Math.abs(w.b.z - z) < 1e-3;
        L = Math.min(MUR_MAX_M, L + demi(enX(x0)) + demi(enX(x1)));
        P = Math.min(MUR_MAX_M, P + demi(enZ(z0)) + demi(enZ(z1)));
      }

      pushHistory(cle);
      /*
        LE COIN D'APPUI EST DONNE, il n'est plus toujours le haut-gauche.

        Poser des cotes au clavier fait grandir la piece vers la droite
        et vers le bas — rien ne saute a l'ecran. Mais TIRER un cote au
        doigt, c'est l'inverse : le bord qu'on tient doit rester sous le
        doigt, et c'est le bord OPPOSE qui ne bouge pas. Un seul calcul,
        deux gestes.
      */
      /*
        AU CLAVIER, LE CÔTÉ MITOYEN NE BOUGE PAS — revue « Théo » : retailler
        une pièce ne doit jamais retailler sa voisine. Le coin haut-gauche
        reste l'appui, sauf quand c'est le bord d'en face qui est partagé et
        que celui-ci ne l'est pas : on s'appuie alors sur le mitoyen.
      */
      const voisines = st.rooms.filter((r) => r.id !== roomId);
      const estPartage = (id: string) => voisines.some((r) => (r.wallIds ?? []).includes(id));
      const surX = (x: number) => (w: WallSeg) => Math.abs(w.a.x - x) < 1e-3 && Math.abs(w.b.x - x) < 1e-3;
      const surZ = (z: number) => (w: WallSeg) => Math.abs(w.a.z - z) < 1e-3 && Math.abs(w.b.z - z) < 1e-3;
      const bordPartage = (garde: (w: WallSeg) => boolean) => murs.some((w) => garde(w) && estPartage(w.id));
      let ax = origine?.x ?? x0;
      let az = origine?.z ?? z0;
      if (!origine) {
        if (bordPartage(surX(x1)) && !bordPartage(surX(x0))) ax = x1 - L;
        if (bordPartage(surZ(z1)) && !bordPartage(surZ(z0))) az = z1 - P;
      }
      const place = (
        v: number,
        min: number,
        max: number,
        taille: number,
        neuf: number,
      ) => (Math.abs(v - min) < Math.abs(v - max) ? neuf : neuf + taille);
      const murs2 = murs.map((w) => ({
        ...w,
        a: {
          x: place(w.a.x, x0, x1, L, ax),
          z: place(w.a.z, z0, z1, P, az),
        },
        b: {
          x: place(w.b.x, x0, x1, L, ax),
          z: place(w.b.z, z0, z1, P, az),
        },
      }));
      const apres = new Map(
        murs2.map((w) => [w.id, Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z)]),
      );
      const neufs = new Map(murs2.map((w) => [w.id, w]));

      /*
        UN MUR PARTAGÉ NE SE DÉFORME PAS POUR LA VOISINE — revues « Théo » et
        « Nicolas » : retailler la chambre accolée glissait les bouts du mur
        mitoyen ; le séjour prenait un mur en biais et passait de 25,00 à
        19,97 m².

        Quand un mur que borde une autre pièce change de LONGUEUR sans
        quitter sa ligne, la voisine le garde tel quel : on le coupe aux
        nouveaux coins, la pièce retaillée prend la part qui la borde (et un
        prolongement s'il le faut), et les bouts de la voisine ne bougent
        pas. Un mur partagé qu'on POUSSE (il quitte sa ligne) emmène la
        voisine, comme avant : c'est déplacer une cloison.
      */
      const fixes: Pt[] = [];
      const ajouts: WallSeg[] = [];
      const pourLaPiece = new Map<string, string[]>();
      const pourLesVoisines = new Map<string, string[]>();
      const pris = new Set(st.walls.map((w) => w.id));
      const nomLibre = (base: string) => {
        let k = 1;
        while (pris.has(`${base}#${k}`)) k++;
        const id = `${base}#${k}`;
        pris.add(id);
        return id;
      };
      for (const w of murs) {
        if (!estPartage(w.id)) continue;
        const w2 = neufs.get(w.id)!;
        const L0 = segLength(w);
        if (L0 < 1e-6) continue;
        const u = { x: (w.b.x - w.a.x) / L0, z: (w.b.z - w.a.z) / L0 };
        const ecart = (q: Pt) => Math.abs((q.x - w.a.x) * u.z - (q.z - w.a.z) * u.x);
        if (ecart(w2.a) > 1e-6 || ecart(w2.b) > 1e-6) continue;
        const t = (q: Pt) => (q.x - w.a.x) * u.x + (q.z - w.a.z) * u.z;
        const s0 = Math.min(t(w2.a), t(w2.b));
        const s1 = Math.max(t(w2.a), t(w2.b));
        if (Math.abs(s0) < 1e-6 && Math.abs(s1 - L0) < 1e-6) continue;
        fixes.push(w.a, w.b);
        const at = (s: number): Pt => ({ x: w.a.x + u.x * s, z: w.a.z + u.z * s });
        const coupes = [0, ...[s0, s1].filter((s) => s > 1e-6 && s < L0 - 1e-6), L0].sort((m, q) => m - q);
        const morceaux = coupes.slice(1).map((fin, i) => ({ de: coupes[i], a: fin }));
        const ids = morceaux.map((_, i) => (i === 0 ? w.id : nomLibre(w.id)));
        morceaux.forEach((m, i) => {
          const seg: WallSeg = { ...w, id: ids[i], a: at(m.de), b: at(m.a) };
          if (i === 0) neufs.set(w.id, seg);
          else ajouts.push(seg);
        });
        const prolongements: WallSeg[] = [];
        if (s0 < -1e-6) prolongements.push({ ...w, id: nomLibre(w.id), a: at(s0), b: at(0) });
        if (s1 > L0 + 1e-6) prolongements.push({ ...w, id: nomLibre(w.id), a: at(L0), b: at(s1) });
        ajouts.push(...prolongements);
        pourLaPiece.set(w.id, [
          ...ids.filter((_, i) => morceaux[i].de >= s0 - 1e-6 && morceaux[i].a <= s1 + 1e-6),
          ...prolongements.map((x) => x.id),
        ]);
        pourLesVoisines.set(w.id, ids);
      }
      const fixe = (q: Pt) => fixes.some((f) => Math.hypot(f.x - q.x, f.z - q.z) < 0.02);

      /*
        CE QUI EST POSÉ SUR UN MUR RACCOURCI REVIENT DEDANS.

        Une prise à 4,50 m sur un mur ramené à 2 m flotterait dans le vide —
        invisible sur le plan, mais bien comptée par le contrôle des normes.
        On la recale au plus près du bord, comme le fait déjà la pose.
      */
      const recaler = (along: number, wallId: string) => {
        const ap = apres.get(wallId) ?? 0;
        if (ap <= 0 || along <= ap) return along;
        return Math.max(0.05, ap - 0.05);
      };

      /*
        LE PLAN RESTE COUSU.

        Une pièce accolée PARTAGE sa cloison — une seule maçonnerie entre
        deux pièces, c'est la règle de `addRoomBox`. En redimensionnant, ce
        mur mitoyen partait avec la pièce et la voisine restait sur place :
        ses murs s'arrêtaient dix-huit centimètres avant, et le plan
        s'ouvrait par une fente. Sur le dessin, deux pièces qui ne se
        touchent plus ; dans le métré, un périmètre qui ne ferme pas ; en
        3D, deux pans qui ne se rejoignent pas.

        LA RÈGLE NE REGARDE NI LES PIÈCES NI LES IDENTIFIANTS, juste les
        POINTS : ce qui était accroché à un coin qui bouge suit le coin.
        C'est celle qu'applique déjà le déplacement d'un point de mur, et
        elle vaut ici pour les quatre coins à la fois. Ce qui ne touchait
        rien ne bouge pas : on recolle, on ne rassemble pas.
      */
      const SOUDE = 0.02;
      /** Le point d'arrivée d'un coin déplacé, s'il en est un. */
      const suivre = (p: Pt): Pt | null => {
        // Les bouts que garde la voisine ne suivent personne (voir plus haut).
        if (fixe(p)) return null;
        for (const w of murs) {
          for (const bout of [w.a, w.b] as const) {
            if (Math.hypot(bout.x - p.x, bout.z - p.z) > SOUDE) continue;
            const n = neufs.get(w.id)!;
            const cible = bout === w.a ? n.a : n.b;
            return { x: cible.x, z: cible.z };
          }
        }
        return null;
      };
      const recousu = (w: WallSeg): WallSeg => {
        if (neufs.has(w.id)) return neufs.get(w.id)!;
        const a = suivre(w.a);
        const b = suivre(w.b);
        return a || b ? { ...w, a: a ?? w.a, b: b ?? w.b } : w;
      };
      const mursApres = [...st.walls.map(recousu), ...ajouts];

      /*
        LES MENUISERIES SUIVENT LEUR MUR — relevé du patron : « au
        déplacement d'un mur, les ouvrants ne suivent pas ». Pousser un mur,
        tirer un coin, poser un angle : ces trois gestes emportaient déjà
        les percements. Le redimensionnement recalait l'appareillage… et
        oubliait les menuiseries, en coordonnées absolues : la fenêtre
        restait dans le vide.

        C'est la règle du coin tiré (`reporterOuverture`) : la cote se garde
        depuis le bout qui a le moins bougé, la largeur ne change pas — une
        porte de 83 ne devient pas une porte de 104 parce que le mur
        s'allonge — et ce qui déborde d'un mur raccourci revient dedans.
        Les murs RECOUSUS comptent aussi : la cloison mitoyenne d'une pièce
        voisine bouge avec ses percements.
      */
      const bouges: { avant: WallSeg; apres: WallSeg }[] = [];
      for (let i = 0; i < st.walls.length; i++) {
        // Un mur mitoyen coupé n'a pas bougé : ses percements restent où ils sont.
        if (st.walls[i] !== mursApres[i] && !pourLesVoisines.has(st.walls[i].id)) {
          bouges.push({ avant: st.walls[i], apres: mursApres[i] });
        }
      }
      const emporter = (o: WallSeg): WallSeg => {
        const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
        const sur = bouges.find(
          (m) => pointOnSeg(mid, m.avant.a, m.avant.b).dist < 0.4,
        );
        if (!sur) return o;
        // Le bout FIXE est celui qui a le moins bougé : c'est lui qui
        // garde la cote — la logique du chantier, mètre posé au coin.
        const da = Math.hypot(
          sur.apres.a.x - sur.avant.a.x,
          sur.apres.a.z - sur.avant.a.z,
        );
        const db = Math.hypot(
          sur.apres.b.x - sur.avant.b.x,
          sur.apres.b.z - sur.avant.b.z,
        );
        return reporterOuverture(o, sur.avant, sur.apres, da <= db ? 'a' : 'b');
      };

      /*
        LE PLAFOND GARDE SON CENTRAGE — relevé du patron : « il faut qu'ils
        gardent une cohérence de centrage si c'était voulu ». Le centre
        reste le centre, le quart reste le quart : la position RELATIVE dans
        la boîte de la pièce est ce qu'on a voulu en posant le semis.
      */
      const bAvant = [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
      ];
      const xs2 = murs2.flatMap((w) => [w.a.x, w.b.x]);
      const zs2 = murs2.flatMap((w) => [w.a.z, w.b.z]);
      const bApres = [
        { x: Math.min(...xs2), z: Math.min(...zs2) },
        { x: Math.max(...xs2), z: Math.min(...zs2) },
        { x: Math.max(...xs2), z: Math.max(...zs2) },
        { x: Math.min(...xs2), z: Math.max(...zs2) },
      ];

      // L'appareillage d'un mur mitoyen coupé passe sur son morceau, par sa position.
      const coupes = new Set(pourLesVoisines.keys());
      const reportes = new Map(
        reprojectFixtures(st.walls, mursApres, st.fixtures.filter((f) => coupes.has(f.wallId))).map((f) => [f.id, f]),
      );
      set({
        walls: mursApres,
        rooms:
          pourLesVoisines.size === 0
            ? st.rooms
            : st.rooms.map((r) =>
                !r.wallIds
                  ? r
                  : {
                      ...r,
                      wallIds: r.wallIds.flatMap((id) =>
                        (r.id === roomId ? pourLaPiece.get(id) : pourLesVoisines.get(id)) ?? [id],
                      ),
                    },
              ),
        openings: st.openings.map(emporter),
        ceiling: st.ceiling.map((cl) =>
          cl.roomId === roomId
            ? avecSaTrace(cl, (p) => recadrerAuCadre(p, bAvant, bApres))
            : cl,
        ),
        fixtures: st.fixtures.map((f) =>
          coupes.has(f.wallId)
            ? reportes.get(f.id) ?? f
            : neufs.has(f.wallId)
              ? { ...f, along: recaler(f.along, f.wallId) }
              : f,
        ),
        dirty: true,
      });
  };

  return {
    screen: 'home',
    diagnosticId: null,
    forcerTarifs: false,
    supported: null,
    scanning: false,
    brouillon: null,
    paused: false,
    processing: false,
    error: null,
    instruction: '',
    mursDouteux: 0,
    murDouteux: null,
    murValideA: 0,
    trouContour: 0,
    complementEnCours: false,
    cleDuReleve: null,
    passagesNatifs: null,
    piecesEcartees: [],
    passagesDuPlanOuvert: () => {
      const st = get();
      const p = st.passagesNatifs;
      return !!p && !!st.cleDuReleve && p.cle === st.cleDuReleve && p.niveau === st.niveauCourant;
    },
    wallCount: 0,
    objectCount: 0,
    doorCount: 0,
    windowCount: 0,
    modelPath: null,
    scanName: '',
    client: '',
    address: '',
    currentSaveId: null,
    pendingJoin: null,
    photos: [],
    ceiling: [],
    notes: [],
    mesures: [],
    existant: null,
    planVierge: false,
    dirty: false,
    resultOrigin: 'scan',
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    fixtures: [],
    north: null,
    canUndo: false,
    canRedo: false,
    saves: [],
    savesCharges: false,
    folders: [],
    themePref: 'system',
    accentPref: ACCENT_DEFAUT,
    iconePref: ICONE_DEFAUT,
    showOpeningColors: false,

    setThemePref: (themePref) => {
      set({ themePref });
      AsyncStorage.setItem(THEME_KEY, themePref).catch(() => {});
    },

    /**
     * CHOISIT LA TEINTE D'ACCENT.
     *
     * Une clé inconnue est REFUSÉE plutôt que posée : elle ressortirait à
     * chaque démarrage, l'app retomberait silencieusement sur le bleu, et le
     * réglage montrerait un choix qui n'a aucun effet.
     */
    setAccentPref: (cle) => {
      const sain = estUnAccent(cle) ? cle : ACCENT_DEFAUT;
      set({ accentPref: sain });
      AsyncStorage.setItem(ACCENT_KEY, sain).catch(() => {});
    },

    /**
     * CHOISIT L'ICÔNE DE L'APPLICATION.
     *
     * Le réglage est posé TOUT DE SUITE, sans attendre le système : la
     * pastille se marque à l'instant du doigt, et l'alerte d'iOS arrive
     * par-dessus. Si le système refuse — un contexte où les icônes
     * alternatives n'existent pas —, on revient à l'origine plutôt que de
     * montrer un réglage qui ne correspond à rien sur l'écran d'accueil.
     */
    setIconePref: (cle) => {
      const sain = estUneIcone(cle) ? cle : ICONE_DEFAUT;
      set({ iconePref: sain });
      AsyncStorage.setItem(ICONE_KEY, sain).catch(() => {});
      poserIcone(sain).then((pose) => {
        if (!pose && sain !== ICONE_DEFAUT) {
          set({ iconePref: ICONE_DEFAUT });
          AsyncStorage.setItem(ICONE_KEY, ICONE_DEFAUT).catch(() => {});
        }
      });
    },

    setShowOpeningColors: (showOpeningColors) => {
      set({ showOpeningColors });
      AsyncStorage.setItem(COLORS_KEY, showOpeningColors ? '1' : '0').catch(() => {});
    },

    showFurniture: true,
    setShowFurniture: (showFurniture) => {
      set({ showFurniture });
      AsyncStorage.setItem(FURNITURE_KEY, showFurniture ? '1' : '0').catch(() => {});
    },

    /*
      CHIFFRER, C'EST MODIFIER LE DOSSIER.

      Depuis que le devis voyage avec son plan (voir `DevisEnregistre`), le
      changer laisse le dossier différent de ce qui est écrit sur le disque —
      et l'électricien doit le voir. Sans ce drapeau, on chiffre une heure, on
      quitte, et rien ne prévient : c'est la faute la plus chère de cette
      application, celle qui coûte un déplacement.

      CE N'EST PAS UNE ENTRÉE D'HISTORIQUE, en revanche : « Annuler » sert à
      défaire un geste sur le PLAN. Reculer d'un cran après avoir touché à un
      ticket ramènerait un mur, ce que personne n'attend.
    */
    // La première du catalogue : la plus posée, voir `GAMMES`.
    gammeDevis: GAMMES[0].id,
    setGammeDevis: (gammeDevis) => set({ gammeDevis, dirty: true }),

    etapeDevis: 0,
    setEtapeDevis: (etapeDevis) => set({ etapeDevis }),

    devisEcartes: [],
    devisQuantites: {},
    devisAjouts: [],
    devisPrix: {},
    devisNumero: null,
    setDevisNumero: (devisNumero) => set({ devisNumero, dirty: true }),
    reglerPrixDevis: (cle, pu) =>
      set((e) => {
        const devisPrix = { ...e.devisPrix };
        if (pu === null || !isFinite(pu)) delete devisPrix[cle];
        else devisPrix[cle] = Math.max(0, Math.round(pu * 100) / 100);
        return { dirty: true, devisPrix };
      }),
    /*
      RÉGLER UNE QUANTITÉ, ET SAVOIR REVENIR EN ARRIÈRE.

      Une quantité remise à ce que le métré disait ne doit pas RESTER une
      quantité corrigée : la ligne cesserait de dire la vérité sur elle-même.
      L'écran ne sait pas quel était le chiffre d'origine — c'est le devis qui
      le sait — alors on garde le geste simple : ce qui est écrit ici est ce
      que l'électricien veut, et `retirerLaCorrection` efface la correction.
    */
    reglerQuantiteDevis: (cle, quantite) =>
      set((e) => ({
        dirty: true,
        devisQuantites: {
          ...e.devisQuantites,
          [cle]: !isFinite(quantite) || quantite < 0 ? 0 : quantite,
        },
      })),
    ajouterAuDevis: (code, quantite = 1) =>
      set((e) => {
        const deja = e.devisAjouts.find((a) => a.code === code);
        return {
          dirty: true,
          devisAjouts: deja
            ? e.devisAjouts.map((a) =>
                a.code === code
                  ? { ...a, quantite: Math.max(0, a.quantite + quantite) }
                  : a,
              )
            : [...e.devisAjouts, { code, quantite: Math.max(0, quantite) }],
        };
      }),
    /*
      RETIRER UN ARTICLE DU MAGASIN LE FAIT DISPARAÎTRE POUR DE BON — et c'est
      la différence avec une ligne du métré, qui reste barrée à zéro. Une ligne
      du métré qu'on ne voit plus est une ligne qu'on croit oubliée ; un
      article qu'on a pris au magasin et qu'on repose n'a jamais eu de raison
      d'être là.
    */
    retirerDuDevis: (code) =>
      set((e) => ({
        dirty: true,
        devisAjouts: e.devisAjouts.filter((a) => a.code !== code),
      })),
    basculerArticleDevis: (cle) =>
      set((e) => ({
        dirty: true,
        devisEcartes: e.devisEcartes.includes(cle)
          ? e.devisEcartes.filter((x) => x !== cle)
          : [...e.devisEcartes, cle],
      })),
    remettreLesArticlesDevis: () => set({ devisEcartes: [], dirty: true }),

    devisLignesLibres: [],
    ecrireLigneLibre: (l) =>
      set((e) => {
        const propre = ligneLibrePropre(l);
        if (!propre) return {};
        const deja = e.devisLignesLibres.some((x) => x.id === propre.id);
        return {
          dirty: true,
          devisLignesLibres: deja
            ? e.devisLignesLibres.map((x) => (x.id === propre.id ? propre : x))
            : [...e.devisLignesLibres, propre],
        };
      }),
    retirerLigneLibre: (id) =>
      set((e) => ({ dirty: true, devisLignesLibres: e.devisLignesLibres.filter((x) => x.id !== id) })),
    devisHeures: {},
    reglerHeuresDevis: (famille, heures) =>
      set((e) => {
        const devisHeures = { ...e.devisHeures };
        if (heures === null || !isFinite(heures) || heures < 0) delete devisHeures[famille];
        else devisHeures[famille] = Math.round(heures * 4) / 4;
        return { dirty: true, devisHeures };
      }),
    devisTva: null,
    reglerTvaDevis: (taux) => set({ dirty: true, devisTva: TAUX_DE_TVA.find((t) => t === taux) ?? null }),

    /*
      LE MODÈLE S'OUVRE SUR LE BÂTI — relevé du patron : « sur la vue 3D de
      base au scan, on coche les boutons pour afficher les meubles et les
      murs seulement, le reste reste décoché ».

      Les surfaces teintées, le plafond, les repères et les cotes répondent
      chacun à une question précise ; allumés d'office, ils couvrent ce
      qu'on vient regarder — la maçonnerie et ce qu'il y a dedans.
    */
    showSurfaces: true,
    show3DSurfaces: false,
    setShow3DSurfaces: (show3DSurfaces) => set({ show3DSurfaces }),
    setShowSurfaces: (showSurfaces) => {
      set({ showSurfaces });
      AsyncStorage.setItem(SURFACES_KEY, showSurfaces ? '1' : '0').catch(() => {});
    },
    showSol: true,
    setShowSol: (showSol) => set({ showSol }),
    showNotes: true,
    setShowNotes: (showNotes) => set({ showNotes }),
    showPhotos: true,
    setShowPhotos: (showPhotos) => set({ showPhotos }),
    showGrille: false,
    setShowGrille: (showGrille) => set({ showGrille }),

    showTextures: false,
    // Murs pleins d'office : c'est le bâti qu'on regarde en ouvrant un
    // relevé. L'écorché reste à un appui, pour voir dedans.
    solidWalls: true,
    toggleSolidWalls: () => set({ solidWalls: !get().solidWalls }),
    setShowTextures: (showTextures) => {
      set({ showTextures });
      AsyncStorage.setItem(TEXTURES_KEY, showTextures ? '1' : '0').catch(() => {});
    },

    setRoomName: (roomId, name) => {
      pushHistory(`roomName:${roomId}`);
      set({
        rooms: get().rooms.map((r) =>
          r.id === roomId
            ? { ...r, name: couperLeNom(name.trim(), NOM_PIECE_MAX) }
            : r,
        ),
        dirty: true,
      });
    },

    /**
     * PEINDRE LES MURS D'UNE PIÈCE.
     *
     * Un seul geste, annulable comme les autres. La clé s'enregistre avec
     * le dossier ; `null` retire la peinture, et le mur retrouve la teinte
     * que le scan lui avait relevée — ou le blanc du dessin.
     */
    /*
      UNE TEINTE, UN GESTE — revue « Hugo » : la clé portait « : », la marque
      des gestes continus ; deux teintes choisies en moins d'une seconde
      fusionnaient, et « Annuler » sautait la première.
    */
    setRoomPeinture: (roomId, cle) => {
      const st = get();
      const piece = st.rooms.find((r) => r.id === roomId);
      if (!piece || (piece.peinture ?? null) === cle) return;
      pushHistory(`peinture-${roomId}`);
      set({
        rooms: st.rooms.map((r) =>
          r.id === roomId
            ? cle
              ? { ...r, peinture: cle }
              // Le champ s'EFFACE plutot que de valoir « null » : un
              // dossier relu ne doit pas avoir deux facons de dire
              // « jamais peinte ».
              : (({ peinture: _retiree, ...reste }) => reste)(r)
            : r,
        ),
        dirty: true,
      });
    },

    /*
      L'HABILLAGE — relevé du patron, point 9 de la réflexion « grand
      public » : le sol, un mur d'accent, la couleur d'un meuble. Mêmes
      règles que la peinture : annulable, et le champ s'EFFACE plutôt que de
      valoir « null ».
    */
    setRoomSol: (roomId, cle) => {
      const st = get();
      const piece = st.rooms.find((r) => r.id === roomId);
      if (!piece || (piece.sol ?? null) === cle) return;
      pushHistory(`sol-${roomId}`);
      set({
        rooms: st.rooms.map((r) =>
          r.id === roomId ? (cle ? { ...r, sol: cle } : (({ sol: _retire, ...reste }) => reste)(r)) : r,
        ),
        dirty: true,
      });
    },

    /*
      UNE AMBIANCE, UN GESTE — les murs et le sol de chaque pièce visée
      changent ensemble, et « Annuler » les rend ensemble (deux entrées par
      pièce, sinon : quatre appuis pour défaire une ambiance sur deux pièces).
    */
    appliquerAmbiance: (roomIds, peinture, sol) => {
      const st = get();
      const vise = new Set(roomIds);
      const change = st.rooms.some(
        (r) => vise.has(r.id) && ((r.peinture ?? null) !== peinture || (r.sol ?? null) !== sol),
      );
      if (!change) return;
      pushHistory('ambiance');
      set({
        rooms: st.rooms.map((r) => {
          if (!vise.has(r.id)) return r;
          const reste = { ...r };
          delete reste.peinture;
          delete reste.sol;
          return { ...reste, ...(peinture ? { peinture } : {}), ...(sol ? { sol } : {}) };
        }),
        dirty: true,
      });
    },

    setMurAccent: (roomId, wallId, cle) => {
      const st = get();
      const piece = st.rooms.find((r) => r.id === roomId);
      if (!piece || (piece.accents?.[wallId] ?? null) === cle) return;
      pushHistory(`accent-${roomId}-${wallId}`);
      set({
        rooms: st.rooms.map((r) => {
          if (r.id !== roomId) return r;
          const accents = { ...(r.accents ?? {}) };
          delete accents[wallId];
          if (cle) accents[wallId] = cle;
          if (Object.keys(accents).length > 0) return { ...r, accents };
          // Plus aucun mur d'accent : le champ s'efface, comme la peinture.
          return (({ accents: _vides, ...reste }) => reste)(r);
        }),
        dirty: true,
      });
    },

    setObjectTeinte: (objectId, hex) => {
      const st = get();
      const meuble = st.objects.find((o) => o.id === objectId);
      if (!meuble || (meuble.teinte ?? null) === hex) return;
      pushHistory(`teinte-${objectId}`);
      set({
        objects: st.objects.map((o) =>
          o.id === objectId ? (hex ? { ...o, teinte: hex } : (({ teinte: _retiree, ...reste }) => reste)(o)) : o,
        ),
        dirty: true,
      });
    },

    /**
     * CALER UNE PHOTO SUR L'ÉLÉVATION DE SON MUR.
     *
     * Le calage est BORNÉ à l'entrée : ce qui s'enregistre doit être sain.
     * Un calage aberrant écrit dans le dossier ressort tel quel à la
     * réouverture, et le garde-fou du dessin n'aurait plus rien à corriger
     * si personne ne retouche la photo.
     *
     * Un calage de repérage n'entre PAS dans l'historique d'annulation : on
     * le règle au doigt, en continu, et vingt points de reprise pour un
     * geste rendraient le bouton « Annuler » inutilisable.
     */
    setPhotoCalage: (photoId, calage) => {
      const st = get();
      if (!st.photos.some((p) => p.id === photoId)) return;
      const sain = calage ? bornerCalage(calage) : null;
      const neutre =
        !sain ||
        (sain.dx === CALAGE_NEUTRE.dx &&
          sain.dy === CALAGE_NEUTRE.dy &&
          sain.k === CALAGE_NEUTRE.k);
      set({
        photos: st.photos.map((p) => {
          if (p.id !== photoId) return p;
          // Une photo du scan recalée à la main n'est plus « à l'échelle » :
          // c'est l'œil qui l'a posée, et l'établi le dira.
          if (p.auto) return { ...p, calage: sain ?? CALAGE_NEUTRE, calageManuel: true };
          // Le champ s'EFFACE au neutre : une photo jamais calée et une
          // photo remise à neuf se relisent pareil.
          if (neutre) {
            const copie = { ...p };
            delete copie.calage;
            return copie;
          }
          return { ...p, calage: sain };
        }),
        dirty: true,
      });
    },

    moveRoom: (roomId, dx, dz, aimant = true) => {
      if (!sontFinis(dx, dz)) return;
      const st = get();
      const piece = st.rooms.find((r) => r.id === roomId);
      if (!piece) return;
      const aMoi = new Set(
        piece.wallIds ??
          st.walls.filter((w) => roomOf(w) === roomId).map((w) => w.id),
      );
      if (aMoi.size === 0) return;

      /*
        DÉPLACER UNE PIÈCE MITOYENNE LA DÉTACHE.

        Le déplacement refusait tout net dès qu'un mur était partagé.
        Depuis que l'ajout accole toujours la nouvelle pièce, cela revenait
        à ne plus pouvoir en déplacer AUCUNE. Et laisser passer le geste tel
        quel serait pire : le mur mitoyen appartient aussi à la voisine, le
        tirer déchirerait son contour.

        La cloison se DÉDOUBLE donc — la pièce déplacée emporte sa copie, la
        voisine garde la sienne et ne bouge pas d'un millimètre. C'est ce qui
        arrive quand on décolle deux boîtes qui se touchaient, et c'est
        exactement l'inverse de la soudure qui les recollera.

        L'appareillage, lui, reste sur l'original : il est posé sur la
        maçonnerie qui n'a pas bougé.
      */
      const mitoyens = st.walls.filter(
        (w) =>
          aMoi.has(w.id) &&
          st.rooms.some(
            (r) => r.id !== roomId && (r.wallIds ?? []).includes(w.id),
          ),
      );
      let murs = st.walls;
      let pieces = st.rooms;
      let mesMurs = aMoi;
      if (mitoyens.length > 0) {
        const graine = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const copies = mitoyens.map((w, i) => ({
          ...w,
          id: `mur-${graine}-${i}`,
          roomId,
        }));
        const remap = new Map(mitoyens.map((w, i) => [w.id, copies[i].id]));
        murs = [...st.walls, ...copies];
        mesMurs = new Set([...aMoi].map((id) => remap.get(id) ?? id));
        pieces = st.rooms.map((r) =>
          r.id === roomId && r.wallIds
            ? { ...r, wallIds: r.wallIds.map((id) => remap.get(id) ?? id) }
            : r,
        );
      }

      /**
       * L'AIMANT : on cherche le petit réajustement qui aligne.
       *
       * Pour chaque mur déplacé et chaque mur du reste du plan, s'ils sont
       * PARALLÈLES et que leurs projections se recouvrent, l'écart
       * perpendiculaire donne le décalage à rattraper. On garde le plus
       * petit, et on ne l'applique que sous vingt-cinq centimètres : au-delà,
       * c'est que l'électricien voulait bien poser la pièce là.
       */
      const AIMANT = 0.25;
      const bouges = murs
        .filter((w) => mesMurs.has(w.id))
        .map((w) => ({
          a: { x: w.a.x + dx, z: w.a.z + dz },
          b: { x: w.b.x + dx, z: w.b.z + dz },
        }));
      // L'aimant ne cherche qu'à SON niveau (revue « Léa » : l'étage se soudait au rez-de-chaussée).
      const autres = murs.filter((w) => !mesMurs.has(w.id) && niveauDe(w) === niveauDe(piece));
      /*
        L'AIMANT AU LÂCHER, ET SUR LES DEUX AXES — revues « Sophie » et
        « Théo ». Appliqué à chaque image d'un glisser, il ramenait la pièce
        à chaque petit pas : un glissement lent d'un mètre ne la bougeait pas
        d'un centimètre. Et il ne rattrapait qu'un écart, le plus petit : il
        restait cinq centimètres de décalage sur l'autre axe.
      */
      const rattrapages: { n: Pt; e: number }[] = [];
      for (const m of bouges) {
        const lm = Math.hypot(m.b.x - m.a.x, m.b.z - m.a.z) || 1;
        const um = { x: (m.b.x - m.a.x) / lm, z: (m.b.z - m.a.z) / lm };
        for (const o of autres) {
          const lo = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1;
          const uo = { x: (o.b.x - o.a.x) / lo, z: (o.b.z - o.a.z) / lo };
          // Parallèles ? Le produit vectoriel des directions est nul.
          if (Math.abs(um.x * uo.z - um.z * uo.x) > 0.08) continue;
          // Les projections se recouvrent-elles ? Sinon les murs sont
          // alignés mais bout à bout, et il n'y a rien à aimanter.
          const t = (p: Pt) => (p.x - o.a.x) * uo.x + (p.z - o.a.z) * uo.z;
          const t0 = Math.min(t(m.a), t(m.b));
          const t1 = Math.max(t(m.a), t(m.b));
          if (t1 < -0.2 || t0 > lo + 0.2) continue;
          // L'écart perpendiculaire, signé.
          const n = { x: -uo.z, z: uo.x };
          const e = (m.a.x - o.a.x) * n.x + (m.a.z - o.a.z) * n.z;
          if (Math.abs(e) < AIMANT && Math.abs(e) > 1e-9) rattrapages.push({ n, e });
        }
      }
      let cale = { x: 0, z: 0 };
      if (aimant && rattrapages.length > 0) {
        rattrapages.sort((p, q) => Math.abs(p.e) - Math.abs(q.e));
        const premier = rattrapages[0];
        cale = { x: -premier.n.x * premier.e, z: -premier.n.z * premier.e };
        const second = rattrapages.find(
          (r) => Math.abs(r.n.x * premier.n.z - r.n.z * premier.n.x) > 0.5,
        );
        if (second) cale = { x: cale.x - second.n.x * second.e, z: cale.z - second.n.z * second.e };
      }
      const ddx = dx + cale.x;
      const ddz = dz + cale.z;

      /**
       * PUIS LA SOUDURE : deux murs superposés n'en font plus qu'un.
       *
       * L'aimant colle la pièce contre sa voisine — et laisse DEUX
       * maçonneries au même endroit, l'une à la nouvelle pièce, l'autre à
       * l'ancienne. Sur le dessin ça ne se voit pas ; dans le métré, si :
       * la cloison est comptée deux fois, et le dossier ment d'un mur.
       *
       * On soude donc ce qui se recouvre : le mur déplacé disparaît, et la
       * pièce récupère celui qui était déjà là. Le mitoyen appartient alors
       * aux deux, comme une cloison de vrai logement — et l'appareillage
       * qu'il portait le suit.
       */
      pushHistory(`moveRoom:${roomId}`);
      const deplaces = murs.map((w) =>
        mesMurs.has(w.id)
          ? {
              ...w,
              a: { x: w.a.x + ddx, z: w.a.z + ddz },
              b: { x: w.b.x + ddx, z: w.b.z + ddz },
            }
          : w,
      );
      // La soudure de tout recouvrement, partiel compris (voir `souderLesRecouvrements`).
      const soude = aimant
        ? souderLesRecouvrements(deplaces, pieces, mesMurs)
        : { walls: deplaces, rooms: pieces };
      set({
        walls: soude.walls,
        rooms: soude.rooms,
        // L'appareillage d'un mur soudé passe sur le mur conservé, par sa position.
        fixtures: soude.walls === deplaces ? st.fixtures : reprojectFixtures(deplaces, soude.walls, st.fixtures),
        photos: soude.walls === deplaces ? st.photos : reprojectAnchors(deplaces, soude.walls, st.photos),
        // Les menuiseries de ces murs suivent, sinon elles restent en l'air.
        openings: st.openings.map((o) => {
          const proche = nearestWall(o, murs.filter((w) => mesMurs.has(w.id)));
          return proche.dist < 0.4 && niveauDe(o) === niveauDe(piece)
            ? {
                ...o,
                a: { x: o.a.x + ddx, z: o.a.z + ddz },
                b: { x: o.b.x + ddx, z: o.b.z + ddz },
              }
            : o;
        }),
        // Le mobilier et le plafond de la pièce voyagent avec elle.
        objects: st.objects.map((o) =>
          roomOf(o) === roomId
            ? {
                ...o,
                transform: o.transform.map((v, i) =>
                  i === 12 ? v + ddx : i === 14 ? v + ddz : v,
                ),
              }
            : o,
        ),
        ceiling: st.ceiling.map((cl) =>
          cl.roomId === roomId
            ? avecSaTrace(cl, (p) => ({ x: p.x + ddx, z: p.z + ddz }))
            : cl,
        ),
        dirty: true,
      });
    },

    removeRoom: (roomId) => {
      const st = get();
      if (st.rooms.length <= 1) return;
      pushHistory('removeRoom');
      const gone = st.rooms.find((r) => r.id === roomId);
      // Une pièce retirée d'un plan scanné ne revient pas au passage suivant.
      const contour = st.cleDuReleve ? roomParts(st.walls, st.rooms).find((p) => p.roomId === roomId)?.surface?.pts : null;
      if (st.cleDuReleve && contour && contour.length >= 3) {
        set({
          piecesEcartees: [
            ...st.piecesEcartees,
            { cle: st.cleDuReleve, niveau: niveauDe(gone), contour: contour.map((q) => ({ ...q })) },
          ],
        });
      }
      const rooms = st.rooms.filter((r) => r.id !== roomId);
      // Un refend borde deux pièces : il ne part que si plus aucune autre
      // pièce ne s'appuie dessus.
      const stillUsed = new Set(rooms.flatMap((r) => r.wallIds ?? []));
      const doomed = new Set(
        gone?.wallIds
          ? gone.wallIds.filter((id) => !stillUsed.has(id))
          : st.walls.filter((w) => roomOf(w) === roomId).map((w) => w.id),
      );
      const walls = st.walls.filter((w) => !doomed.has(w.id));
      set({
        rooms,
        walls,
        // Les ouvertures des murs supprimés s'en vont avec eux.
        openings: st.openings.filter((o) => {
          const { dist } = nearestWall(o, walls);
          return dist < 0.6;
        }),
        objects: st.objects.filter((o) => roomOf(o) !== roomId),
        // Les appareils des murs partis, ET les liens qui les visaient.
        ...sansLiensMorts(
          st.fixtures.filter((f) => !doomed.has(f.wallId)),
          // Le plafond d'une pièce détruite n'a plus rien à éclairer —
          // il restait pourtant dessiné au-dessus du vide, et compté au
          // métré comme aux circuits.
          st.ceiling.filter((c) => c.roomId !== roomId),
        ),
        photos: st.photos.filter((p) => !doomed.has(p.wallId)),
        dirty: true,
      });
      {
        const partis = st.photos
          .filter((p) => doomed.has(p.wallId))
          .map((p) => p.path);
        const gardees = new Set([
          ...get().photos.map((p) => p.path),
          ...st.saves.flatMap((s) => (s.photos ?? []).map((p) => p.path)),
        ]);
        deletePhotoFiles(partis.filter((p) => !gardees.has(p)));
      }
    },

    mergeRooms: (aId, bId) => {
      const st = get();
      const a = st.rooms.find((r) => r.id === aId);
      const b = st.rooms.find((r) => r.id === bId);
      if (!a || !b || aId === bId) return;
      /*
        LA GARDE PASSE AVANT LE POINT DE REPRISE.

        `pushHistory` veut dire « retiens l'état d'avant ». Appelé puis suivi
        d'un renoncement, il laisse dans l'historique un point qui ne
        correspond à AUCUN changement — et au doigt, cela donne : on touche
        « Annuler », il ne se passe rien, on touche une seconde fois, et là
        ça revient en arrière.

        C'est l'un des rares défauts qu'on ne signale jamais, parce qu'on
        croit avoir mal appuyé. Voir `annulerunefois`.
      */
      // La cloison commune cesse de border : elle devient intérieure à la
      // pièce réunie, et le contour se referme sur l'enveloppe des deux.
      const inA = new Set(a.wallIds ?? []);
      const inB = new Set(b.wallIds ?? []);
      /*
        ON NE FUSIONNE QUE DES VOISINES.

        Sans mur commun, réunir les deux listes produit une pièce faite de
        deux contours DISJOINTS : plus de surface calculable, plus de métré,
        et à l'écran rien d'autre qu'un nom qui disparaît. C'est ce qu'on a
        pris pour « la fusion ne fait que renommer ».
      */
      const mitoyen = [...inA].some((id) => inB.has(id));
      if (!mitoyen) return;
      // Après la garde (revue « Hugo » : une fusion refusée laissait un
      // « Annuler » qui ne faisait rien).
      pushHistory('mergeRooms');
      const wallIds = [...new Set([...inA, ...inB])].filter(
        (id) => !(inA.has(id) && inB.has(id)),
      );
      // La cloison commune reste dessinée, mais ne sépare plus : la fusion
      // survit à « Redétecter » et à « Redresser » (voir `nonSeparateur`).
      const communs = new Set([...inA].filter((id) => inB.has(id)));
      set({
        walls: st.walls.map((w) => (communs.has(w.id) ? { ...w, nonSeparateur: true } : w)),
        rooms: st.rooms
          .filter((r) => r.id !== bId)
          .map((r) => (r.id === aId ? { ...r, wallIds } : r)),
        objects: st.objects.map((o) =>
          roomOf(o) === bId ? { ...o, roomId: aId } : o,
        ),
        // Le plafond de la pièce absorbée suit ses meubles : sans ça, la
        // pièce fusionnée était signalée « aucun point lumineux » alors
        // qu'elle en porte.
        ceiling: st.ceiling.map((c) =>
          c.roomId === bId ? { ...c, roomId: aId } : c,
        ),
        dirty: true,
      });
    },

    couperPiece: (roomId, saisie) => {
      const st = get();
      const part = roomParts(st.walls, st.rooms).find((p) => p.roomId === roomId);
      if (!part?.surface) return false;
      const seg = coupeDePiece(part, saisie, st.walls);
      // La garde AVANT le point de reprise : voir `splitRoom`.
      if (!seg) return false;
      pushHistory('splitRoom');
      const h = hauteurDeLaPiece(part) || 2.5;
      const e = saisie.epaisseur;
      const wall: WallSeg = {
        id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'wall',
        a: seg.a,
        b: seg.b,
        height: h,
        yCenter: h / 2,
        niveau: part.walls[0]?.niveau,
        // Le groupe de ses murs : voir `splitRoom`.
        ...groupeDesMurs(part.walls),
        ...(estDessine(part.walls) ? { auNu: true } : {}),
        ...(Math.abs(e - WALL_T) > 1e-6
          ? { epaisseur: Math.min(Math.max(e, 0.03), 0.6) }
          : {}),
      };
      set({ walls: [...st.walls, wall], dirty: true });
      // Sous le même point de reprise que la cloison : un « Annuler » défait le tout (revue « Nicolas »).
      redetecterUnNiveau(niveauDe(wall), false);
      return true;
    },

    splitRoom: (roomId) => {
      const st = get();
      const part = roomParts(st.walls, st.rooms).find((p) => p.roomId === roomId);
      if (!part?.surface) return;
      /*
        LA GARDE PASSE AVANT LE POINT DE REPRISE.

        `pushHistory` veut dire « retiens l'état d'avant ». Appelé puis suivi
        d'un renoncement, il laisse dans l'historique un point qui ne
        correspond à AUCUN changement — et au doigt, cela donne : on touche
        « Annuler », il ne se passe rien, on touche une seconde fois, et là
        ça revient en arrière.

        C'est l'un des rares défauts qu'on ne signale jamais, parce qu'on
        croit avoir mal appuyé. Voir `annulerunefois`.
      */
      pushHistory('splitRoom');
      // Cloison posée en travers, perpendiculaire au grand axe et passant par
      // le point le plus au large. Ses deux bouts s'arrêtent EXACTEMENT sur
      // le contour : sans ça rien ne se soude, aucun nœud n'apparaît et la
      // redétection ne voit pas la coupure. On la déplace ensuite au doigt.
      /*
        EN TRAVERS DU GRAND CÔTÉ — revue « Camille » : l'angle du contour
        suit l'arête retenue, pas le grand axe, et une pièce de 5,2 × 2,4 se
        coupait en deux bandes de 5,2 × 1,2. Le repère de « Couper » sait
        lequel est le grand côté.
      */
      const dir = repereDePiece(part.surface.pts).court;
      const a = castToOutline(part.labelAt, dir, part.surface.pts);
      const b = castToOutline(
        part.labelAt,
        { x: -dir.x, z: -dir.z },
        part.surface.pts,
      );
      if (!a || !b) return;
      const h = hauteurDeLaPiece(part) || 2.5;
      const wall: WallSeg = {
        id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'wall',
        a,
        b,
        height: h,
        yCenter: h / 2,
        // À L'ÉTAGE DE LA PIÈCE — revue « Inès » : sans niveau, la cloison
        // d'une chambre du premier tombait au rez-de-chaussée.
        niveau: part.walls[0]?.niveau,
        /*
          ET DANS LE GROUPE DE SES MURS. La redétection recoud les murs
          alignés groupe par groupe (`mergeColinear`) : une cloison sans
          groupe, posée dans une pièce DESSINÉE (dont les murs en ont un),
          ne comptait pas comme un bras au nœud — le mur coupé se recollait,
          et la pièce ne se scindait jamais. Seules les pièces scannées, sans
          groupe, le faisaient.
        */
        ...groupeDesMurs(part.walls),
        // Dans une pièce dessinée, elle se cote au nu comme les autres.
        ...(estDessine(part.walls) ? { auNu: true } : {}),
      };
      set({ walls: [...st.walls, wall], dirty: true });
      // Sous le même point de reprise que la cloison : un « Annuler » défait le tout (revue « Nicolas »).
      redetecterUnNiveau(niveauDe(wall), false);
    },

    straightenPlan: () => {
      const st = get();
      /*
        LE NIVEAU AFFICHÉ, ET LUI SEUL — revue « Inès » : redresser la maison
        entière cherchait UNE trame pour trois niveaux relevés à trois caps
        différents, et la redétection qui suit mêlait leurs murs.
      */
      const n = st.niveauCourant;
      const jeu = jeuDuNiveau(st, n);
      if (jeu.walls.length === 0) return;
      // Même clé que la redétection qui suit : les deux ne comptent que pour
      // une annulation, l'utilisateur n'a fait qu'un geste.
      pushHistory('redetect');
      /*
        JUSQU'À CE QUE ÇA TIENNE — revue « Camille » : la soudure des coins
        qui suit le redressement rebiaisait le plan (1,95° → 2,29°), et il
        fallait un second appui. On redresse et l'on soude jusqu'à ce que
        plus rien ne bouge, trois fois au plus.
      */
      let droits = straightenWalls(jeu.walls);
      for (let k = 0; k < 2; k++) {
        const soudes = straightenWalls(weldCorners(droits));
        const bouge = soudes.some((w, i) => {
          const v = droits[i];
          return !v || Math.hypot(w.a.x - v.a.x, w.a.z - v.a.z) > 1e-4 || Math.hypot(w.b.x - v.b.x, w.b.z - v.b.z) > 1e-4;
        });
        if (!bouge || soudes.length !== droits.length) break;
        droits = soudes;
      }
      /*
        LE PLAFOND PREND LE MÊME BLOC QUE SA PIÈCE — relevé du patron :
        « au redressage d'une pièce, les spots se décentrent ». Un spot est
        posé PAR RAPPORT à sa pièce (au centre, aux tiers) : quand l'équerre
        recale les murs, il garde sa position relative dans la boîte —
        `recadrerAuCadre`.
      */
      const avantParts = roomParts(jeu.walls, jeu.rooms);
      const apresParts = roomParts(droits, jeu.rooms);
      const cadreDe = (parts: RoomPart[], roomId: string) =>
        parts.find((r) => r.roomId === roomId)?.surface?.pts;
      set({
        walls: remplacer(st.walls, jeu.walls, droits),
        // Les portes et fenêtres suivent leur mur : sans ça elles restaient
        // sur place, décalées, et le rendu ne les rattachait plus.
        openings: remplacer(st.openings, jeu.openings, reprojectOpenings(jeu.walls, droits, jeu.openings)),
        // L'appareillage et les photos aussi : ils sont accrochés à un
        // identifiant de mur, et le redressement le change.
        fixtures: remplacer(st.fixtures, jeu.fixtures, reprojectFixtures(jeu.walls, droits, jeu.fixtures)),
        photos: remplacer(st.photos, jeu.photos, reprojectAnchors(jeu.walls, droits, jeu.photos)),
        ceiling: remplacer(
          st.ceiling,
          jeu.ceiling,
          jeu.ceiling.map((cl) => {
            const v = cadreDe(avantParts, cl.roomId);
            const nv = cadreDe(apresParts, cl.roomId);
            return v && nv ? avecSaTrace(cl, (p) => recadrerAuCadre(p, v, nv)) : cl;
          }),
        ),
        dirty: true,
      });
      get().redetectRooms(n);
    },

    redetectRooms: (niveau) => {
      redetecterUnNiveau(niveau ?? get().niveauCourant);
    },

    /*
      DUPLIQUER UNE PIÈCE — avec tout ce qu'on vient d'y poser.

      Un logement a trois chambres qui se ressemblent, deux WC, des combles
      découpés en cellules identiques. On les relevait une par une, et
      surtout on les ÉQUIPAIT une par une : cinq socles, un interrupteur, un
      point lumineux, à chaque fois, aux mêmes cotes.

      Le gain n'est pas la géométrie — quatre murs se retracent vite. C'est
      L'APPAREILLAGE : c'est lui qui prend le temps, et c'est lui que la
      copie emporte, avec les ouvertures, le mobilier et les points de
      plafond. Une chambre dupliquée est une chambre FINIE.
    */
    /*
      REDIMENSIONNER UNE PIÈCE À SES COTES.

      On pose un « Séjour 5,00 × 4,00 » depuis le catalogue, puis le mètre
      donne 5,18 × 4,05. Il fallait alors déplacer QUATRE murs à la main, un
      par un, en veillant à ne pas ouvrir les coins — pour une correction de
      dix-huit centimètres. Le bandeau affichait pourtant ces cotes, juste à
      côté d'une hauteur éditable d'un appui.

      LE GESTE N'A DE SENS QUE SUR UN RECTANGLE : redimensionner un contour
      en L à « largeur × profondeur » n'a pas de réponse unique, et l'on
      n'en invente pas. Les autres pièces gardent leurs murs, qu'on déplace
      un à un — c'est le prix d'une forme libre.

      LE COIN HAUT-GAUCHE NE BOUGE PAS : la pièce grandit vers la droite et
      vers le bas, donc ce qu'on regarde ne saute pas et les pièces voisines
      restent où elles sont.
    */
    resizeRoom: (roomId, largeur, profondeur, opts) =>
      reposerPiece(roomId, largeur, profondeur, null, 'resizeRoom', !!opts?.auNu),

    /*
      ET LE MEME RECTANGLE SE TIRE PAR UN BORD.

      Releve du patron sur la piece qu'on ajoute : « on doit faire une
      piece basique modifiable comme un meuble sur ses cotes ». C'est le
      geste du metre sur le chantier — on tire jusqu'a la maconnerie, on
      ne calcule pas une largeur dans sa tete.

      LE BORD OPPOSE EST LE POINT FIXE, comme pour un meuble : sans lui,
      la piece se decalerait a chaque image et le geste serait un
      deplacement, pas un etirement.
    */
    resizeRoomSide: (roomId, cote, distance, depuis) => {
      const murs = mursDeLaPiece(roomId);
      if (murs.length !== 4) return;
      const xs = murs.flatMap((w) => [w.a.x, w.b.x]);
      const zs = murs.flatMap((w) => [w.a.z, w.b.z]);
      // Tout se mesure depuis l'etat de l'APPUI : voir `resizeObjectSide`,
      // ou le cumul d'une image sur l'autre a ete filme sur le chantier.
      const base = depuis ?? {
        x0: Math.min(...xs),
        z0: Math.min(...zs),
        largeur: Math.max(...xs) - Math.min(...xs),
        profondeur: Math.max(...zs) - Math.min(...zs),
      };
      const surLargeur = cote.startsWith('largeur');
      const avant = surLargeur ? base.largeur : base.profondeur;
      const apres = Math.min(MUR_MAX_M, Math.max(0.6, avant + distance));
      // Le bord tire recule vers l'exterieur : le coin d'appui suit,
      // pour que l'autre bord reste exactement ou il est.
      const recul = cote.endsWith('-') ? apres - avant : 0;
      reposerPiece(
        roomId,
        surLargeur ? apres : base.largeur,
        surLargeur ? base.profondeur : apres,
        {
          x: base.x0 - (surLargeur ? recul : 0),
          z: base.z0 - (surLargeur ? 0 : recul),
        },
        `resizeRoomSide:${roomId}`,
      );
    },

    duplicateRoom: (roomId) => {
      const st = get();
      const source = st.rooms.find((r) => r.id === roomId);
      const mursSource = mursDeLaPiece(roomId);
      if (!source || mursSource.length === 0) return null;

      /*
        ELLE SE POSE À DROITE, comme une pièce neuve — jamais par-dessus
        l'originale : deux pièces au même endroit, c'est un métré qui double
        sans raison et deux cartouches illisibles l'un sur l'autre.
      */
      const xs = st.walls.flatMap((w) => [w.a.x, w.b.x]);
      const dx =
        Math.max(...xs) +
        0.5 -
        Math.min(...mursSource.flatMap((w) => [w.a.x, w.b.x]));
      // Elle se pose SUR LA MÊME LIGNE que l'originale : côte à côte, comme
      // deux chambres d'un couloir — pas en diagonale.
      const dz = 0;

      const cle = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const neufId = `piece-${cle}`;
      /** Chaque mur copié retient d'où il vient : l'appareillage suivra. */
      const parMur = new Map<string, string>();
      const murs = mursSource.map((w, i) => {
        const id = `mur-${cle}-${i}`;
        parMur.set(w.id, id);
        return {
          ...w,
          id,
          a: { x: w.a.x + dx, z: w.a.z + dz },
          b: { x: w.b.x + dx, z: w.b.z + dz },
          roomId: neufId,
          niveau: st.niveauCourant,
        };
      });

      /*
        LE NOM SE NUMÉROTE, il ne se répète pas : deux « Chambre » sur un
        plan, et le dossier ne dit plus laquelle porte quoi. On prend le
        premier rang libre — une troisième copie ne redevient pas « 2 ».
      */
      const base = (source.name || 'Pièce').replace(/\s+\d+$/, '');
      const pris = new Set(st.rooms.map((r) => r.name));
      let n = 2;
      while (pris.has(`${base} ${n}`)) n += 1;

      /*
        LES OUVERTURES SUIVENT LEUR MUR — et elles ne portent pas de pièce :
        c'est la PROXIMITÉ qui les rattache, la même règle que partout
        ailleurs (voir `nearestWall`). Une porte copiée reste une porte, au
        même endroit du même mur.
      */
      const baies = st.openings
        .filter((o) => nearestWall(o, mursSource).dist < 0.6)
        .map((o, i) => ({
          ...o,
          id: `op-${cle}-${i}`,
          a: { x: o.a.x + dx, z: o.a.z + dz },
          b: { x: o.b.x + dx, z: o.b.z + dz },
          roomId: neufId,
          niveau: st.niveauCourant,
        }));

      const appareils = st.fixtures
        .filter((f) => parMur.has(f.wallId))
        .map((f, i) => ({
          ...f,
          id: `fx-${cle}-${i}`,
          wallId: parMur.get(f.wallId)!,
          // Les liens vers une commande resteraient pendus vers l'original.
          commandes: undefined,
          group: undefined,
        }));

      const plafond = st.ceiling
        .filter((c) => c.roomId === roomId)
        .map((c, i) => ({
          ...c,
          id: `pl-${cle}-${i}`,
          roomId: neufId,
          at: c.at ? { x: c.at.x + dx, z: c.at.z + dz } : c.at,
        }));

      const meubles = st.objects
        .filter((o) => roomOf(o) === roomId)
        .map((o, i) => ({
          ...o,
          id: `ob-${cle}-${i}`,
          roomId: neufId,
          transform: o.transform
            ? o.transform.map((v, k) => (k === 12 ? v + dx : k === 14 ? v + dz : v))
            : o.transform,
        }));

      pushHistory('duplicateRoom');
      set({
        walls: [...st.walls, ...murs],
        openings: [...st.openings, ...baies],
        fixtures: [...st.fixtures, ...appareils],
        ceiling: [...st.ceiling, ...plafond],
        objects: [...st.objects, ...meubles],
        rooms: [
          ...st.rooms,
          {
            ...source,
            id: neufId,
            name: `${base} ${n}`,
            niveau: st.niveauCourant,
            wallIds: murs.map((w) => w.id),
          },
        ],
        dirty: true,
      });
      return neufId;
    },

    removeWall: (wallId) => {
      const st = get();
      pushHistory('removeWall');
      const walls = st.walls.filter((w) => w.id !== wallId);
      /*
        UNE PIÈCE SANS UN SEUL MUR N'EST PLUS UNE PIÈCE.

        Elle restait pourtant dans la liste : invisible sur le plan, mais
        bien présente au métré, au contrôle des normes (« Séjour : 0 socle
        sur 5 exigés ») et dans le dossier PDF. Un fantôme qu'on ne peut ni
        voir ni corriger, et qui reproche à l'électricien de ne pas l'avoir
        équipé.

        Elle s'en va donc avec son dernier mur — et elle seule : une pièce à
        qui il reste un pan est une pièce en cours de retouche, pas une
        pièce morte.
      */
      /*
        VIVANTE SI IL LUI RESTE UN MUR — par son contour (`wallIds`), et par
        l'étiquette seulement pour les pièces d'avant les contours. Revue
        « Camille » : la règle ne regardait que l'étiquette `roomId`, que les
        murs SCANNÉS n'ont pas — retirer un mur fantôme d'un relevé effaçait
        toutes les pièces, leurs noms et leurs rattachements.
      */
      const restants = new Set(walls.map((w) => w.id));
      const etiquettes = new Set(walls.map((w) => w.roomId).filter(Boolean));
      /*
        UN MUR DOUBLÉ QU'ON RETIRE LAISSE SA PLACE À L'AUTRE — revue
        « Sophie » : le contrôle conseille « gardez le plus long et
        supprimez l'autre », et le suivre ouvrait les pièces qui comptaient
        sur le mur supprimé (sept sur huit). Le mur confondu, sur la même
        ligne et le même niveau, prend sa place dans leur contour.
      */
      const parti = st.walls.find((w) => w.id === wallId);
      const confondu = parti
        ? walls.find((w) => {
            if (w.type !== 'wall' || niveauDe(w) !== niveauDe(parti)) return false;
            const L = segLength(parti);
            if (L < 1e-6) return false;
            const u = { x: (parti.b.x - parti.a.x) / L, z: (parti.b.z - parti.a.z) / L };
            const ecart = (q: Pt) => Math.abs((q.x - parti.a.x) * u.z - (q.z - parti.a.z) * u.x);
            if (ecart(w.a) > 0.03 || ecart(w.b) > 0.03) return false;
            const t = (q: Pt) => (q.x - parti.a.x) * u.x + (q.z - parti.a.z) * u.z;
            const o0 = Math.max(0, Math.min(t(w.a), t(w.b)));
            const o1 = Math.min(L, Math.max(t(w.a), t(w.b)));
            return o1 - o0 >= 0.5 * L;
          })
        : undefined;
      const rooms = st.rooms
        .map((r) => ({
          ...r,
          wallIds: r.wallIds?.includes(wallId) && confondu
            ? [...new Set(r.wallIds.map((id) => (id === wallId ? confondu.id : id)))]
            : r.wallIds?.filter((id) => id !== wallId),
        }))
        // Un seul mur ne fait pas une pièce : une pièce accolée qui a perdu
        // ses trois murs à elle s'en va, même s'il lui reste le mitoyen.
        .filter((r) =>
          r.wallIds ? r.wallIds.filter((id) => restants.has(id)).length >= 2 : etiquettes.has(r.id),
        );
      set({
        walls,
        rooms,
        // Une ouverture sans mur d'accueil n'a plus de sens.
        openings: st.openings.filter((o) => nearestWall(o, walls).dist < 0.6),
        // Une prise non plus : elle était posée sur la face de ce mur —
        // et les liens vers un interrupteur parti s'effacent avec lui.
        ...sansLiensMorts(
          st.fixtures.filter((f) => f.wallId !== wallId),
          st.ceiling,
        ),
        // La photo de repérage montrait CE mur : l'épingle n'a plus où
        // vivre, et son fichier part s'il ne sert à personne d'autre.
        photos: st.photos.filter((p) => p.wallId !== wallId),
        dirty: true,
      });
      {
        const partis = st.photos
          .filter((p) => p.wallId === wallId)
          .map((p) => p.path);
        const gardees = new Set([
          ...get().photos.map((p) => p.path),
          ...st.saves.flatMap((s) => (s.photos ?? []).map((p) => p.path)),
        ]);
        deletePhotoFiles(partis.filter((p) => !gardees.has(p)));
      }
    },

    addWallBetween: (a, b, opts) => {
      const st = get();
      if (!sontFinis(a.x, a.z, b.x, b.z)) return undefined;
      if (Math.hypot(b.x - a.x, b.z - a.z) < 0.2) return undefined;
      pushHistory('addWall');
      const depart = opts?.depuis
        ? st.walls.find((w) => w.id === opts.depuis)
        : undefined;
      // La hauteur de son mur de départ : un muret de cuisine prolongé
      // reste un muret. Sinon celle du plan.
      const h = depart?.height ?? hauteurDuNiveau(st.walls, st.niveauCourant);
      const id = `mur-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const e = opts?.epaisseur;
      const n = depart ? niveauDe(depart) : st.niveauCourant;
      /*
        LE BOUT QUI BUTE SUR LE NU D'UN MUR VA JUSQU'À SON AXE — revues
        « Sophie » et « Karim » : une cloison tapée nu à nu (6,00) jusqu'à un
        mur de 20 cm s'arrêtait à 10 cm de son axe, et rien ne se fermait ;
        une cloison en T contre le mur mitoyen d'une pièce accolée, à 7 cm.
        À moins d'une demi-épaisseur (et 3 cm) d'un mur de son niveau, le
        bout se pose sur l'axe de ce mur.
      */
      const versLAxe = (p: Pt): Pt => {
        let mieux: { q: Pt; d: number } | null = null;
        for (const w of st.walls) {
          if (w.type !== 'wall' || niveauDe(w) !== n) continue;
          const { dist, t } = pointOnSeg(p, w.a, w.b);
          if (t < -1e-6 || t > 1 + 1e-6 || dist > epaisseurDe(w) / 2 + 0.03 || dist < 1e-9) continue;
          if (!mieux || dist < mieux.d) {
            mieux = { q: { x: w.a.x + (w.b.x - w.a.x) * t, z: w.a.z + (w.b.z - w.a.z) * t }, d: dist };
          }
        }
        return mieux ? mieux.q : p;
      };
      /*
        UN MUR POSÉ AU BOUT D'UN AUTRE EN FAIT UN COIN — revues « Hugo » et
        « Karim ». La longueur tapée du premier pan allait jusqu'à son bout
        d'axe ; le second, centré sur ce bout, lui mangeait une
        demi-épaisseur : la salle d'eau tapée à 1,60 faisait 1,565 à
        l'intérieur, le L 29,825 m² au lieu de 30. Posé à l'équerre au bout
        LIBRE de son mur de départ, le mur neuf le prolonge d'une
        demi-épaisseur (la sienne), et se décale d'autant : la face
        intérieure tombe à la cote tapée.
      */
      let prolonge: WallSeg | null = null;
      if (depart && depart.type === 'wall') {
        const ldep = segLength(depart);
        const bout = Math.hypot(a.x - depart.b.x, a.z - depart.b.z) < 1e-3
          ? 'b'
          : Math.hypot(a.x - depart.a.x, a.z - depart.a.z) < 1e-3
            ? 'a'
            : null;
        const lneuf = Math.hypot(b.x - a.x, b.z - a.z);
        if (bout && ldep > 1e-6 && lneuf > 1e-6) {
          const E = depart[bout];
          const autre = bout === 'b' ? depart.a : depart.b;
          const libreAuBout = !st.walls.some(
            (w) => w.id !== depart.id && niveauDe(w) === n && pointOnSeg(E, w.a, w.b).dist < 1e-3,
          );
          const dehors = { x: (E.x - autre.x) / ldep, z: (E.z - autre.z) / ldep };
          const uNeuf = { x: (b.x - a.x) / lneuf, z: (b.z - a.z) / lneuf };
          if (libreAuBout && Math.abs(dehors.x * uNeuf.z - dehors.z * uNeuf.x) > 0.5) {
            const d = (e && e > 0 ? Math.min(Math.max(e, 0.03), 0.6) : WALL_T) / 2;
            const glisse = (q: Pt): Pt => ({ x: q.x + dehors.x * d, z: q.z + dehors.z * d });
            prolonge = { ...depart, [bout]: glisse(E) } as WallSeg;
            a = glisse(a);
            b = glisse(b);
          }
        }
      }
      a = versLAxe(a);
      b = versLAxe(b);
      /** Les murs de son niveau que touche ce bout. */
      const touche = (p: Pt) =>
        st.walls.filter(
          (w) => w.type === 'wall' && niveauDe(w) === n && pointOnSeg(p, w.a, w.b).dist < 0.08,
        );
      const auxBouts = [...touche(a), ...touche(b)];
      // Sans mur de départ, le groupe de ce qu'il touche : voir `splitRoom`.
      const groupe = depart?.roomId ? { roomId: depart.roomId } : groupeDesMurs(auxBouts);
      set({
        walls: [
          ...(prolonge ? st.walls.map((w) => (w.id === prolonge!.id ? prolonge! : w)) : st.walls),
          {
            id,
            type: 'wall',
            a,
            b,
            height: h,
            yCenter: h / 2,
            // Il naît à l'étage où l'on travaille : voir `addRoomBox`.
            niveau: depart?.niveau ?? st.niveauCourant,
            ...groupe,
            // Tracé à la main : voir `WallSeg.auNu`.
            auNu: true,
            ...(e && e > 0 && Math.abs(e - WALL_T) > 1e-6
              ? { epaisseur: Math.min(Math.max(e, 0.03), 0.6) }
              : {}),
          },
        ],
        dirty: true,
      });
      /*
        LE MUR QUI REFERME UNE PIÈCE LA FAIT APPARAÎTRE — revue « Hugo » :
        les deux pans de la cloison de sa salle d'eau posés, le plan disait
        toujours « 1 pièce, 24,0 m² ». Il fallait deviner « … » puis
        « Redétecter les pièces », et rien ne le suggérait.

        Un mur dont les DEUX bouts touchent le plan peut refermer une pièce :
        on relit son niveau, sous le même « Annuler » que le tracé, et on
        dit ce qui est apparu.
      */
      if (touche(a).length === 0 || touche(b).length === 0) {
        /*
          UNE CLOISON QUI NE FERME RIEN APPARTIENT À LA PIÈCE OÙ ELLE EST —
          revue « Karim » : le retour d'une niche n'était à personne, et la
          chambre gardait sous lui ses 6 dm² de sol. Elle entre dans la liste
          de la pièce qui la contient ; la surface au nu la retire.
        */
        const s = get();
        const milieu = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const jeu = jeuDuNiveau(s, n);
        const chez = new Set(
          roomParts(jeu.walls, jeu.rooms)
            .filter((p) => p.surface && pointInPolygon(milieu, p.surface.pts))
            .map((p) => p.roomId),
        );
        if (chez.size > 0) {
          set({
            rooms: s.rooms.map((r) =>
              chez.has(r.id) && r.wallIds && !r.wallIds.includes(id) ? { ...r, wallIds: [...r.wallIds, id] } : r,
            ),
          });
        }
        return id;
      }
      const avant = st.rooms.filter((r) => niveauDe(r) === n).length;
      if (!redetecterUnNiveau(n, false)) return id;
      const s = get();
      // Recousu, le mur a pu changer de nom : c'est celui qui porte son milieu.
      const milieu = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const lui =
        s.walls.find((w) => w.id === id) ??
        s.walls.find((w) => niveauDe(w) === n && pointOnSeg(milieu, w.a, w.b).dist < 0.01);
      if (s.rooms.filter((r) => niveauDe(r) === n).length > avant && lui) {
        const bordees = roomParts(s.walls, s.rooms).filter(
          (p) => p.surface && s.rooms.find((r) => r.id === p.roomId)?.wallIds?.includes(lui.id),
        );
        const neuve = bordees.reduce<RoomPart | null>(
          (m, p) => (!m || p.surface!.area < m.surface!.area ? p : m),
          null,
        );
        if (neuve?.surface) {
          astuce(
            `Nouvelle pièce : ${neuve.surface.area.toFixed(1).replace('.', ',')} m². Touchez-la pour la nommer.`,
            { icone: 'rooms' },
          );
        }
      } else if (lui) {
        /*
          LE PLACARD QU'ON VIENT DE FERMER — revue « Karim » : sans porte et
          sous 1,2 m², il se lit comme une gaine (poché noir, hors des
          surfaces), et rien ne le disait. On le dit, avec de quoi le compter.
        */
        const jeu = jeuDuNiveau(s, n);
        const recoin = massifsTechniques(jeu.walls, jeu.openings, jeu.rooms).find((c) =>
          c.some((p) => pointOnSeg(p, lui.a, lui.b).dist < 0.01),
        );
        if (recoin) {
          const at = {
            x: recoin.reduce((t, p) => t + p.x, 0) / recoin.length,
            z: recoin.reduce((t, p) => t + p.z, 0) / recoin.length,
          };
          astuce('Recoin fermé sans porte : compté comme une gaine, en noir.', {
            icone: 'rooms',
            action: { label: 'C’est un placard', faire: () => get().declarerRecoin(at) },
          });
        }
      }
      return lui?.id ?? id;
    },

    setEpaisseurMur: (id, epaisseur) => {
      if (!sontFinis(epaisseur) || epaisseur <= 0) return;
      const st = get();
      const w = st.walls.find((x) => x.id === id);
      if (!w) return;
      // Trois centimètres (une plaque collée) à soixante (un mur de pierre).
      const e = Math.min(Math.max(epaisseur, 0.03), 0.6);
      const e0 = w.epaisseur ?? WALL_T;
      if (Math.abs(e0 - e) < 1e-6) return;
      pushHistory(`epaisseur:${id}`);
      set({
        walls: st.walls.map((x) => {
          if (x.id !== id) return x;
          // Revenue à l'épaisseur de tous, elle ne s'écrit plus : le mur
          // redevient comme ceux que RoomPlan a relevés.
          const reste: WallSeg = { ...x };
          delete reste.epaisseur;
          return Math.abs(e - WALL_T) < 1e-6 ? reste : { ...reste, epaisseur: e };
        }),
        dirty: true,
      });
      /*
        LA FACE DE LA PIÈCE NE BOUGE PAS — revues « Sophie » et « Karim » : un
        mur dessiné aux cotes intérieures qu'on épaississait gardait son axe,
        et mordait la pièce (séjour 5,10 → 5,07, la maison −1 m²). Un mur qui
        ne borde qu'UNE pièce s'épaissit vers le dehors : son axe recule
        d'une demi-différence, et ses voisins le suivent. Une cloison entre
        deux pièces garde son axe : elle prend sur les deux.
      */
      if (w.auNu) {
        const bordees = st.rooms.filter((r) => (r.wallIds ?? []).includes(id) && niveauDe(r) === niveauDe(w));
        const L = segLength(w);
        if (bordees.length === 1 && L > 1e-6) {
          const dedans = interiorSide(w, st.walls, st.rooms);
          const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
          const recul = (e - e0) / 2;
          // `dedans` dit le côté de la pièce par rapport à (−uz, ux) : on recule de l'autre.
          get().moveWall(id, u.z * dedans * recul, -u.x * dedans * recul, false, `epaisseur:${id}`);
        }
      }
    },

    declarerRecoin: (at, nom = 'Placard') => {
      const n = get().niveauCourant;
      pushHistory('declarerRecoin');
      if (!redetecterUnNiveau(n, false, at)) return;
      const s = get();
      const lui = roomParts(s.walls, s.rooms).find(
        (p) =>
          p.surface &&
          pointInPolygon(at, p.surface.pts) &&
          s.rooms.find((r) => r.id === p.roomId && niveauDe(r) === n)?.declaree,
      );
      if (!lui) return;
      const pris = new Set(
        s.rooms.filter((r) => niveauDe(r) === n && r.id !== lui.roomId).map((r) => r.name),
      );
      let nomLibre = nom;
      for (let k = 2; pris.has(nomLibre); k++) nomLibre = `${nom} ${k}`;
      set({ rooms: s.rooms.map((r) => (r.id === lui.roomId ? { ...r, name: nomLibre } : r)) });
    },

    comblerTrou: (trou) => {
      const st = get();
      const ecart = Math.hypot(trou.b.x - trou.a.x, trou.b.z - trou.a.z);
      if (ecart < 0.02) return;
      pushHistory('comblerTrou');
      const n = niveauDe(st.walls.find((w) => w.id === trou.wallA));
      /*
        LE COIN RATÉ SE FERME EN PROLONGEANT LES DEUX MURS jusqu'à leur point
        de rencontre (voir `TrouDeReleve.coin`), et la pièce qu'il ouvrait
        réapparaît aussitôt, sous le même « Annuler ».
      */
      if (trou.coin) {
        const c = trou.coin;
        const pres = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-4;
        set({
          walls: st.walls.map((w) => {
            if (niveauDe(w) !== n) return w;
            const a = pres(w.a, trou.a) || pres(w.a, trou.b) ? { ...c } : w.a;
            const b = pres(w.b, trou.a) || pres(w.b, trou.b) ? { ...c } : w.b;
            return a === w.a && b === w.b ? w : { ...w, a, b };
          }),
          dirty: true,
        });
        redetecterUnNiveau(n, false);
        return;
      }
      const h = hauteurDuNiveau(st.walls, st.niveauCourant);
      const mur: WallSeg = {
        id: `mur-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'wall',
        a: { ...trou.a },
        b: { ...trou.b },
        height: h,
        yCenter: h / 2,
        // Le morceau neuf appartient à la pièce de ses voisins : sans ça
        // il flotterait hors de tout, et la surface ne se refermerait pas.
        roomId: st.walls.find((w) => w.id === trou.wallA)?.roomId,
      };
      /*
        UNE PORTE MANQUÉE RESTE UNE PORTE.

        Entre soixante centimètres et un mètre trente, un trou de relevé
        n'est pas un défaut de maçonnerie : c'est la menuiserie que la
        caméra a traversée. On la repose donc, sur toute la largeur du
        manque — et si l'on s'est trompé, « Fermer » la referme d'un
        appui, puisque le geste existe.
      */
      const porte: WallSeg[] =
        ecart >= 0.6 && ecart <= 1.3
          ? [
              {
                id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: 'door',
                roomId: mur.roomId,
                ...(niveauDe(mur) !== NIVEAU_RDC ? { niveau: niveauDe(mur) } : {}),
                a: { ...trou.a },
                b: { ...trou.b },
                height: Math.min(2.05, h * 0.85),
                yCenter: Math.min(2.05, h * 0.85) / 2,
              },
            ]
          : [];
      set({
        walls: [...st.walls, mur],
        openings: [...st.openings, ...porte],
        dirty: true,
      });
      // Le contour s'est refermé : la pièce se relit, sous le même « Annuler ».
      redetecterUnNiveau(n, false);
    },

    /*
      TIRER UNE PIECE AU DOIGT — releve du patron : « a la selection d'une
      piece a ajouter, elle se place automatiquement et impossible de creer
      des murs pour faire la piece facilement. Il faut repenser un systeme
      complet facile pour l'utilisateur ».

      L'application posait la piece TOUTE SEULE : elle cherchait le mur
      exterieur le plus long, s'accolait dessus, et prenait SA longueur. Le
      resultat est une piece qu'on n'a pas choisie, a un endroit qu'on n'a
      pas vise, aux cotes qu'on n'a pas demandees — une « chambre 3 x 3 »
      sortant en 5 x 3 parce que le mur d'appui faisait cinq metres.

      Deux coins suffisent a decrire un rectangle, et un rectangle decrit
      presque toutes les pieces d'un logement. Pour un L, on en tire deux et
      on les fusionne : l'application sait deja le faire.

      ET LA CLOISON RESTE PARTAGEE : un cote qui tombe sur un mur existant
      ne le double pas, il le REPREND. Une seule maconnerie entre deux
      pieces, cotee une fois, equipee des deux cotes — sans quoi le metre
      compte double et « fusionner » n'a plus rien a reunir.
    */
    /*
      UNE PIECE BASIQUE, POSEE DEVANT SOI.

      Releve du patron, apres essai du geste precedent : « le "ajouter une
      piece" ne montre pas qu'il faut creer la piece, et de plus au
      glissement, ca s'annule tout seul avec le deplacement du plan ».

      Tirer un rectangle dans le vide ne montre rien : un ecran qui attend un
      geste qu'il n'annonce pas est un ecran ou il ne se passe rien. On POSE
      donc la piece — on la voit, elle est la — et ce qui reste a faire se
      lit sur elle : des pointilles disent « pas encore arretee », ses cotes
      s'attrapent comme celles d'un meuble, et le doigt la pousse ou l'on
      veut. Trois gestes qu'on connait deja, sur un objet qu'on voit.

      AU MILIEU DE CE QUI EXISTE, parce que c'est la que l'oeil est deja
      pose. Sur un plan vierge, a l'origine — il n'y a pas d'ailleurs.
    */
    addRoomLibre: (largeur, profondeur, nom, opts) => {
      const st = get();
      // Des cotes intérieures : les axes passent une demi-épaisseur plus loin, de chaque côté.
      const t = opts?.auNu ? WALL_T : 0;
      const l = Math.min(MUR_MAX_M, Math.max(0.6, largeur) + t);
      const p = Math.min(MUR_MAX_M, Math.max(0.6, profondeur) + t);
      const auNiveau = st.walls.filter((w) => niveauDe(w) === st.niveauCourant);
      const xs = auNiveau.flatMap((w) => [w.a.x, w.b.x]);
      const zs = auNiveau.flatMap((w) => [w.a.z, w.b.z]);
      /*
        LA PREMIÈRE PIÈCE D'UN NIVEAU VIDE SE POSE D'APLOMB — revue « Léa » :
        elle se posait à onze mètres, à côté du rez-de-chaussée, et il
        fallait la ramener au doigt, à deux millimètres près. Elle part du
        coin de l'emprise du niveau de référence (le dessous, à défaut le
        dessus) : une enveloppe aux mêmes cotes tombe pile dessus.
      */
      const ref = auNiveau.length === 0
        ? niveauDeReference(niveauxPresents(st.walls, st.rooms), st.niveauCourant)
        : null;
      const sous = ref === null ? [] : st.walls.filter((w) => niveauDe(w) === ref);
      const cx = xs.length > 0
        ? (Math.min(...xs) + Math.max(...xs)) / 2
        : sous.length > 0
          ? Math.min(...sous.flatMap((w) => [w.a.x, w.b.x])) + l / 2
          : l / 2;
      const cz = zs.length > 0
        ? (Math.min(...zs) + Math.max(...zs)) / 2
        : sous.length > 0
          ? Math.min(...sous.flatMap((w) => [w.a.z, w.b.z])) + p / 2
          : p / 2;
      /*
        ELLE SE POSE SOUS LES YEUX, MAIS PAS SUR LES AUTRES.

        Essai au doigt sur un relevé : « Ajouter une pièce » → WC. Le milieu
        de l'emprise, c'est le séjour — le rectangle neuf tombait en plein
        dedans, ses pointillés mêlés aux murs, et le premier geste demandé
        était de l'en sortir.

        On garde le principe (le milieu, là où l'œil est déjà posé : le
        cadrage du plan est figé sur ce qui existait, une pièce posée au
        large ne se verrait pas) et l'on cherche la place libre la plus
        PROCHE de ce milieu. Si le logement est plein, elle revient au
        milieu : mieux vaut une pièce à déplacer qu'une pièce invisible.
      */
      // Les pièces de CE niveau seulement : celles des autres ne prennent pas la place.
      const jeuIci = jeuDuNiveau(st, st.niveauCourant);
      const prises = roomParts(jeuIci.walls, jeuIci.rooms)
        .filter((r) => r.surface && r.surface.pts.length > 2)
        .map((r) => {
          const px = r.surface!.pts.map((q) => q.x);
          const pz = r.surface!.pts.map((q) => q.z);
          return {
            x0: Math.min(...px),
            x1: Math.max(...px),
            z0: Math.min(...pz),
            z1: Math.max(...pz),
          };
        });
      const libre = (ax: number, az: number) =>
        prises.every(
          (r) =>
            ax + l / 2 <= r.x0 + 0.01 ||
            ax - l / 2 >= r.x1 - 0.01 ||
            az + p / 2 <= r.z0 + 0.01 ||
            az - p / 2 >= r.z1 - 0.01,
        );
      // Une spirale carrée, par pas d'une demi-pièce : la première place
      // libre trouvée est la plus proche du milieu.
      let ax = cx;
      let az = cz;
      chercher: for (let anneau = 0; anneau <= 6; anneau++) {
        const d = anneau * Math.max(0.8, Math.max(l, p) * 0.6);
        for (const [ux, uz] of [
          [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [-1, 1], [1, -1], [-1, -1],
        ]) {
          const qx = cx + ux * d;
          const qz = cz + uz * d;
          if (!libre(qx, qz)) continue;
          ax = qx;
          az = qz;
          break chercher;
        }
      }
      const id = get().addRoomRect(
        { x: ax - l / 2, z: az - p / 2 },
        { x: ax + l / 2, z: az + p / 2 },
        nom,
      );
      if (!id) return null;
      set({
        rooms: get().rooms.map((r) => (r.id === id ? { ...r, neuve: true } : r)),
      });
      return id;
    },

    /*
      « PAS DE BOUTON VALIDER » — deja tranche pour les meubles, et la regle
      vaut ici. La piece cesse d'etre neuve quand on la lache : le trait se
      ferme, et c'est le geste qu'on faisait de toute facon.
    */
    arreterPiece: (roomId) => {
      set({
        rooms: get().rooms.map((r) =>
          r.id === roomId ? { ...r, neuve: undefined } : r,
        ),
      });
    },

    addRoomRect: (a, b, nom) => {
      const st = get();
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const z0 = Math.min(a.z, b.z);
      const z1 = Math.max(a.z, b.z);
      // Un appui sans glissement n'est pas une piece, c'est un doigt pose.
      if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return null;

      pushHistory('addRoom');
      const h = hauteurDuNiveau(st.walls, st.niveauCourant);
      const cle = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const roomId = `piece-${cle}`;
      const coins: Pt[] = [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
      ];

      /**
       * LE MUR EXISTANT QUI PORTE DEJA CE COTE, s'il y en a un.
       *
       * On ne cherche pas une egalite parfaite : le doigt ne tombe jamais au
       * millimetre, et l'aimantage du geste amene « tout pres », pas
       * « exactement ». Colineaire, de meme longueur a dix centimetres pres,
       * et confondu de bout en bout : c'est le meme mur.
       */
      const dejaLa = (p: Pt, q: Pt) =>
        st.walls.find((w) => {
          // Un mur d'un autre niveau, même pile au-dessus, n'est pas celui-ci (revue « Léa »).
          if (w.type !== 'wall' || niveauDe(w) !== st.niveauCourant) return false;
          const memeSens =
            Math.hypot(w.a.x - p.x, w.a.z - p.z) < 0.12 &&
            Math.hypot(w.b.x - q.x, w.b.z - q.z) < 0.12;
          const sensInverse =
            Math.hypot(w.a.x - q.x, w.a.z - q.z) < 0.12 &&
            Math.hypot(w.b.x - p.x, w.b.z - p.z) < 0.12;
          return memeSens || sensInverse;
        });

      const neufs: WallSeg[] = [];
      const wallIds: string[] = [];
      coins.forEach((p, i) => {
        const q = coins[(i + 1) % coins.length];
        const repris = dejaLa(p, q);
        if (repris) {
          // Le mur mitoyen : il figure desormais dans les deux pieces.
          wallIds.push(repris.id);
          return;
        }
        const mur: WallSeg = {
          id: `mur-${cle}-${i}`,
          type: 'wall',
          a: p,
          b: q,
          height: h,
          yCenter: h / 2,
          roomId,
          // A l'etage ou l'on travaille : voir `addRoomBox`.
          niveau: st.niveauCourant,
          // Trace a la main : ses cotes sont interieures (voir `WallSeg.auNu`).
          auNu: true,
        };
        neufs.push(mur);
        wallIds.push(mur.id);
      });

      set({
        walls: [...st.walls, ...neufs],
        rooms: [
          ...st.rooms,
          {
            id: roomId,
            name: nomDePieceLibre(nom ?? '', st.rooms.map((r) => r.name), NOM_PIECE_MAX),
            floor: null,
            niveau: st.niveauCourant,
            wallIds,
          },
        ],
        dirty: true,
      });
      return roomId;
    },

    addRoomBox: (largeur, profondeur, nom, contreWallId, opts) => {
      const st = get();
      nom = nomDePieceLibre(nom ?? '', st.rooms.map((r) => r.name), NOM_PIECE_MAX);
      pushHistory('addRoom');
      const h = hauteurDuNiveau(st.walls, st.niveauCourant);
      const cle = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const roomId = `piece-${cle}`;

      /**
       * ACCOLÉE À UN MUR : elle en prend la longueur, et le partage.
       *
       * Le mur choisi devient la cloison mitoyenne — il figure dans les
       * listes des DEUX pièces. On n'ajoute donc que trois murs, et le plan
       * reste cohérent : une seule maçonnerie entre deux pièces, cotée une
       * fois, équipée des deux côtés.
       *
       * La nouvelle pièce prend la LONGUEUR du mur plutôt que celle du
       * modèle : c'est la seule façon d'avoir une cloison qui coïncide
       * exactement. Sa profondeur, elle, est bien celle qu'on a choisie.
       */
      /*
        ELLE S'ACCROCHE TOUJOURS À UN MUR.

        Sans mur choisi, elle se posait à droite de l'emprise avec un jeu
        d'un demi-mètre : une boîte flottant dans le vide, reliée à rien. Le
        plan montrait deux logements, la détection n'y voyait aucune cloison
        commune, et « fusionner » n'avait plus rien à réunir.

        À défaut de choix, on prend le mur EXTÉRIEUR LE PLUS LONG : c'est
        celui qui a le plus de chances d'avoir de la place derrière lui, et
        c'est là qu'on agrandit un logement dans la vraie vie. La pièce se
        pose de l'autre côté, et le mur devient mitoyen.
      */
      const choisi = contreWallId
        ? st.walls.find((w) => w.id === contreWallId)
        : undefined;
      const bordures = new Set(
        st.rooms.flatMap((r) => r.wallIds ?? []),
      );
      /*
        ON NE S'ACCOLE QU'À UN MUR DE SON PROPRE ÉTAGE.

        Le choix se faisait parmi TOUS les murs du plan, étages confondus :
        une chambre posée depuis le premier sortait avec trois murs à elle
        et un quatrième emprunté au rez-de-chaussée. La feuille du premier
        montrait alors une pièce OUVERTE — le filtre par étage retire le mur
        emprunté, le contour ne ferme plus, et sans contour il n'y a ni
        surface, ni métré, ni contrôle des normes. La feuille du rez, elle,
        montrait un mur bordant une pièce d'un autre niveau, et corriger les
        cotes de l'une déformait l'autre un étage plus bas.
      */
      const auto = [...st.walls]
        .filter((w) => w.type === 'wall' && niveauDe(w) === st.niveauCourant)
        .filter((w) => bordures.has(w.id))
        // Un mur qui borde DEUX pièces est un refend : lui accoler une
        // troisième pièce la poserait dans l'une des deux.
        .filter(
          (w) =>
            st.rooms.filter((r) => (r.wallIds ?? []).includes(w.id)).length === 1,
        )
        .sort((p, q) => segLength(q) - segLength(p))[0];
      const contre = choisi ?? auto;
      if (contre) {
        const len = Math.hypot(contre.b.x - contre.a.x, contre.b.z - contre.a.z);
        if (len > 0.4) {
          const u = {
            x: (contre.b.x - contre.a.x) / len,
            z: (contre.b.z - contre.a.z) / len,
          };
          // La normale qui S'ÉLOIGNE de la pièce existante : la nouvelle se
          // pose de l'autre côté, jamais par-dessus.
          // `interiorSide` dit de quel côté est la pièce, par rapport à
          // `perpOf(u)` = (−uz, ux). La nouvelle pièce va à l'OPPOSé.
          const dedans = interiorSide(contre, st.walls, st.rooms);
          const n = { x: u.z * dedans, z: -u.x * dedans };
          // Une profondeur intérieure : du nu du mur mitoyen au nu du mur du fond.
          // Le nu du mitoyen, de ce côté : à une demi-épaisseur de son axe,
          // ou à toute son épaisseur du trait d'un mur relevé de la pièce
          // voisine (`facesDesMurs`) — sinon la pièce gagnait le mur.
          const nuMitoyen = faceDuCote(demiFacesDe(st.walls, contre), -dedans);
          const p = Math.max(0.6, profondeur) + (opts?.auNu ? nuMitoyen + WALL_T / 2 : 0);
          /*
            LA LARGEUR TAPÉE EST TENUE — revues « Théo » et « Nicolas » : la
            pièce accolée prenait toute la longueur du mur choisi, et la
            largeur tapée était ignorée sans un mot (3,20 × 3,00 demandée,
            3,00 × 3,80 obtenue). Plus courte que le mur, elle part de son
            début, et le mur mitoyen se COUPE là où elle s'arrête : la part
            partagée garde son nom, le reste en prend un, et la voisine garde
            les deux — son contour ne bouge pas.
          */
          const W = Math.max(0.6, largeur) + (opts?.auNu ? WALL_T : 0);
          const partielle = !!opts?.auNu && W < len - 0.3;
          /*
            PLUS LARGE QUE LE MUR, ELLE LE PROLONGE — revue « Sophie » : une
            chambre tapée 2,90 contre un mur de 1,00 sortait en 1,00 × 3,10,
            sans un mot. Le mur choisi est partagé sur toute sa longueur, et
            un prolongement porte le reste ; s'il tombe sur le mur d'une
            autre pièce, il le partage aussi (voir `souderLesRecouvrements`).
          */
          const prolongee = !!opts?.auNu && W > len + 0.05;
          const fin = partielle || prolongee ? { x: contre.a.x + u.x * W, z: contre.a.z + u.z * W } : contre.b;
          const c1 = { x: fin.x + n.x * p, z: fin.z + n.z * p };
          const c2 = { x: contre.a.x + n.x * p, z: contre.a.z + n.z * p };
          const murs = [
            { a: fin, b: c1 },
            { a: c1, b: c2 },
            { a: c2, b: contre.a },
          ].map((seg, i) => ({
            id: `mur-${cle}-${i}`,
            type: 'wall' as const,
            a: seg.a,
            b: seg.b,
            height: h,
            yCenter: h / 2,
            roomId,
            // À L'ÉTAGE OÙ L'ON TRAVAILLE, pas au rez-de-chaussée.
            //
            // Seul le scan d'un étage posait le niveau ; tout ce qui se
            // dessine à la main l'ignorait — or c'est précisément le chemin
            // de ceux qui n'ont pas de caméra. La chambre ajoutée depuis le
            // premier étage arrivait donc AU REZ-DE-CHAUSSÉE, superposée au
            // séjour : deux pièces au même endroit, un métré faux, et une
            // surface au sol qui double sans raison.
            niveau: st.niveauCourant,
            // Tracé à la main : voir `WallSeg.auNu`.
            auNu: true,
          }));
          const prolongement: WallSeg[] = prolongee
            ? [{ ...murs[0], id: `mur-${cle}-p`, a: { ...contre.b }, b: { ...fin } }]
            : [];
          let walls: WallSeg[] = [...st.walls, ...murs, ...prolongement];
          let rooms = st.rooms;
          let fixtures = st.fixtures;
          let photos = st.photos;
          if (partielle) {
            const pris = new Set(st.walls.map((w) => w.id));
            let k = 1;
            while (pris.has(`${contre.id}#${k}`)) k++;
            const resteId = `${contre.id}#${k}`;
            const partage: WallSeg = { ...contre, b: fin };
            const reste: WallSeg = { ...contre, id: resteId, a: fin };
            walls = [...st.walls.flatMap((w) => (w.id === contre.id ? [partage, reste] : [w])), ...murs];
            rooms = st.rooms.map((r) =>
              r.wallIds?.includes(contre.id)
                ? { ...r, wallIds: r.wallIds.flatMap((id) => (id === contre.id ? [id, resteId] : [id])) }
                : r,
            );
            // Ce qui était posé sur le reste du mur passe sur son morceau.
            fixtures = reprojectFixtures(st.walls, walls, st.fixtures);
            photos = reprojectAnchors(st.walls, walls, st.photos);
          }
          // Un côté qui tombe sur le mur d'une autre pièce le partage (voir `souderLesRecouvrements`).
          const soude = souderLesRecouvrements(
            walls,
            [
              ...rooms,
              {
                id: roomId,
                name: nom,
                floor: null,
                niveau: st.niveauCourant,
                // Le mur mitoyen d'abord : c'est lui qui les relie.
                wallIds: [contre.id, ...prolongement.map((w) => w.id), ...murs.map((w) => w.id)],
              },
            ],
            new Set([...murs, ...prolongement].map((w) => w.id)),
          );
          set({
            walls: soude.walls,
            fixtures: soude.walls === walls ? fixtures : reprojectFixtures(walls, soude.walls, fixtures),
            photos,
            rooms: soude.rooms,
            dirty: true,
          });
          return roomId;
        }
      }
      /**
       * OÙ SE POSE LA NOUVELLE PIÈCE : À DROITE DE CE QUI EXISTE.
       *
       * Au centre, elle recouvrirait le plan ; au hasard, on la chercherait.
       * Collée au bord droit de l'emprise, avec un jeu d'un demi-mètre, elle
       * se voit d'emblée et se pousse ensuite où l'on veut. Le premier scan
       * d'un logement vide, lui, la pose à l'origine.
       */
      /*
        LA PREMIÈRE PIÈCE D'UN ÉTAGE VIDE SE POSE AU-DESSUS DE CELUI DU
        DESSOUS.

        « À droite de ce qui existe, avec un jeu d'un demi-mètre » est la
        bonne réponse pour une pièce de PLUS au même étage : elle se voit
        d'emblée et se pousse ensuite. Pour la première pièce d'un étage
        neuf, c'est la mauvaise : un étage se superpose à celui qu'il
        couvre, et la poser à côté oblige à la ramener à la main sur six
        mètres — après l'avoir cherchée au dézoom.

        On part donc du coin de l'emprise du niveau du dessous, et
        `recalerNiveau` ajuste ensuite au centimètre.
      */
      const memeNiveau = st.walls.filter(
        (w) => niveauDe(w) === st.niveauCourant,
      );
      const dessous = st.walls.filter((w) => niveauDe(w) === st.niveauCourant - 1);
      const reference = memeNiveau.length > 0 ? memeNiveau : dessous;
      const xs = reference.flatMap((w) => [w.a.x, w.b.x]);
      const zs = reference.flatMap((w) => [w.a.z, w.b.z]);
      const x0 =
        xs.length === 0
          ? 0
          : memeNiveau.length > 0
          ? Math.max(...xs) + 0.5
          : Math.min(...xs);
      const z0 = zs.length > 0 ? Math.min(...zs) : 0;
      const x1 = x0 + Math.max(0.6, largeur) + (opts?.auNu ? WALL_T : 0);
      const z1 = z0 + Math.max(0.6, profondeur) + (opts?.auNu ? WALL_T : 0);
      const coins: Pt[] = [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
      ];
      const murs = coins.map((p, i) => ({
        id: `mur-${cle}-${i}`,
        type: 'wall' as const,
        a: p,
        b: coins[(i + 1) % coins.length],
        height: h,
        yCenter: h / 2,
        roomId,
        // À l'étage où l'on travaille : voir le bloc accolé, plus haut.
        niveau: st.niveauCourant,
        // Tracé à la main : voir `WallSeg.auNu`.
        auNu: true,
      }));
      const soude = souderLesRecouvrements(
        [...st.walls, ...murs],
        [
          ...st.rooms,
          {
            id: roomId,
            name: nom,
            floor: null,
            niveau: st.niveauCourant,
            wallIds: murs.map((w) => w.id),
          },
        ],
        new Set(murs.map((w) => w.id)),
      );
      set({
        walls: soude.walls,
        rooms: soude.rooms,
        fixtures: reprojectFixtures([...st.walls, ...murs], soude.walls, st.fixtures),
        dirty: true,
      });
      return roomId;
    },

    addFixture: (kind, wallId, at, cote) => {
      const st = get();
      const wall = st.walls.find((w) => w.id === wallId);
      if (!wall) return null;
      pushHistory('addFixture');
      const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      /*
        LA FACE QU'ON REGARDE — revue « Nicolas » : sur une cloison, la face
        était celle du premier contour trouvé, et neuf poses sur trente-huit
        partaient chez le voisin ; dans l'établi, la vue basculait de pièce.
        Celui qui pose dit sa face ; à défaut, on la devine comme avant.
      */
      const side = cote ?? interiorSide(wall, st.walls, st.rooms);
      const quad = wallQuadsOf(st.walls).get(wallId);
      const f = newFixture(id, kind, wall, quad, side);

      /**
       * Un appareil posé là où il y en a déjà un ne s'EMPILE pas : il se
       * range à côté, à 71 mm d'entraxe, et les deux passent sous la même
       * plaque. C'est ce que fait l'électricien, et c'est ce qu'attend
       * quiconque pose une deuxième prise au même endroit — quatre prises
       * ajoutées de suite donnaient jusqu'ici quatre plaques superposées,
       * illisibles au plan comme en 3D.
       */
      const face = wallFace(wall, quad, side);
      const spec = FIXTURES[kind];
      const mine = st.fixtures.filter(
        (o) => o.wallId === wallId && o.side === side,
      );
      // « Tombe sur un autre » et « la place est prise » ne se mesurent pas
      // pareil : le premier compare les PLAQUES (82 mm, donc deux appareils
      // à 71 mm d'entraxe se chevauchent, et c'est normal — ils partagent
      // une plaque), le second compare les BOÎTES, une par poste.
      const surUnAutre = (px: number) =>
        mine.find((o) =>
          overlaps(
            { x: px, y: f.height, kind },
            { x: faceX(face, o.along), y: o.height, kind: o.kind },
          ),
        );
      const placePrise = (px: number) =>
        mine.some((o) => {
          const ox = faceX(face, o.along);
          return (
            Math.abs(px - ox) < ENTRAXE - 1e-6 &&
            Math.abs(f.height - o.height) < ENTRAXE - 1e-6
          );
        });
      let x = at ?? faceX(face, f.along);
      /*
        AU-DESSUS D'UN PLAN DE TRAVAIL, À 1,10 M — revue « Karim » : la
        prise de cuisine partait à 25 cm, derrière le meuble, et l'alerte
        « trop bas » tombait aussitôt. Là où le mur longe un plan de
        travail, elle se pose 20 cm au-dessus, dans la plage de la crédence.
      */
      {
        const piece = st.rooms.find((r) => r.id === roomOf(wall));
        const plans = worktopsOnWall(face, st.objects, estCuisine(piece?.name ?? '', piece?.kind), solDesMurs(st.walls));
        const regle = plans.length > 0 ? heightRuleAt(kind, x, plans) : null;
        const plan = plans.find((w) => x >= w.from - 0.05 && x <= w.to + 0.05);
        if (regle && plan && regle !== HEIGHT_RULES[kind]) {
          f.height = Math.min(regle.max ?? Infinity, Math.max(regle.min ?? 0, plan.height + 0.2));
        }
      }
      let group: string | undefined;
      const voisin = surUnAutre(x);
      /*
        SOUS UNE MÊME PLAQUE, SEULEMENT CE QUI S'Y MET — revue « Nicolas » :
        la prise 20 A du four, posée sur la prise de crédence, passait sans
        un mot sous sa plaque ; en la descendant à 25 cm, la crédence
        suivait. Des prises avec des prises (et leurs RJ, leurs TV), des
        commandes avec des commandes. Un circuit spécialisé, un tableau, une
        sortie de câble ont leur boîte à eux : ils s'écartent, sans plaque.
      */
      const familleDe = (k: FixtureKind): string | null =>
        ['prise', 'prise2', 'prise3', 'rj45', 'rj2', 'rjPrise', 'rjPrise2', 'tv', 'tvPrise'].includes(k)
          ? 'prise'
          : ['inter', 'inter2', 'inter3', 'va', 'poussoir', 'variateur', 'volet', 'interGeneral'].includes(k)
            ? 'commande'
            : null;
      if (voisin && (familleDe(kind) === null || familleDe(kind) !== familleDe(voisin.kind))) {
        for (let k = 1; k <= 30; k++) {
          const essais = [x + k * 0.05, x - k * 0.05].filter(
            (px) => px - spec.w / 2 >= 0 && px + spec.w / 2 <= face.len,
          );
          const libre = essais.find((px) => !surUnAutre(px));
          if (libre !== undefined) {
            x = libre;
            break;
          }
        }
      } else if (voisin) {
        // On cherche la place libre la plus proche, par pas d'entraxe, à
        // droite d'abord — le sens de lecture d'un tableau d'appareillage.
        let place: number | null = null;
        for (let k = 1; k <= 6 && place === null; k++) {
          for (const sens of [1, -1]) {
            const px = x + sens * k * ENTRAXE;
            if (px - spec.w / 2 < 0 || px + spec.w / 2 > face.len) continue;
            if (placePrise(px)) continue;
            place = px;
            break;
          }
        }
        if (place !== null) {
          x = place;
          group =
            voisin.group ??
            `pl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        } else {
          // Plus de place sous une plaque commune : on s'écarte franchement
          // plutôt que de superposer.
          x = Math.min(face.len - spec.w / 2, x + 0.4);
        }
      }

      /**
       * Et sur de la MAÇONNERIE, comme lors d'un déplacement.
       *
       * Un appareil posé au milieu d'un mur percé d'une porte-fenêtre
       * atterrissait dans la baie : il fallait le rattraper au doigt pour
       * qu'il tienne sur quelque chose.
       */
      const pleins = masonryRuns(
        wallRuns(wall, st.openings),
        segLength(wall),
        face,
      );
      if (pleins.length > 1) x = snapToMasonry(pleins, x, spec.w / 2, face.len);

      const pose = { ...f, along: fromFaceX(face, x), group };
      set({
        fixtures: [
          ...st.fixtures.map((o) =>
            group && voisin && o.id === voisin.id ? { ...o, group } : o,
          ),
          pose,
        ],
        // L'écran de face proposera le côté, ou de recentrer l'ensemble :
        // on range d'abord pour que rien ne se superpose, on demande ensuite.
        pendingJoin: group && voisin ? { moved: id, base: voisin.id } : null,
        dirty: true,
      });
      return id;
    },

    /**
     * RÉPÈTE UN APPAREIL LE LONG DE SON MUR — la série d'un plan de travail.
     *
     * UN « COPIER » A DÉJÀ VÉCU DANS CETTE APPLICATION, et il a été retiré :
     * relevé du patron, « enlève le bouton copier, remplace-le par un bouton
     * lien ». Ce geste-ci n'est pas celui-là. Un copier posait un jumeau à
     * côté et laissait l'électricien le traîner à sa place ; celui-ci pose la
     * copie LÀ OÙ LA SUIVANTE DOIT TOMBER — au pas de la série — et se
     * resélectionne. Six appuis font six socles régulièrement espacés, sans
     * un seul glissement au doigt.
     *
     * LE PAS SE DEVINE. La première copie prend `PAS_SERIE`, le module d'une
     * cuisine ; **dès la deuxième, on reprend l'écart réel du précédent** —
     * l'appareil de même type, même hauteur et même face le plus proche à
     * l'opposé du sens de pose. On règle donc le deuxième socle où on veut, et
     * les quatre suivants suivent.
     *
     * LES RÈGLES D'UNE POSE ORDINAIRE NE S'ASSOUPLISSENT PAS parce que le
     * geste est plus rapide : la copie reste dans son mur, sur la maçonnerie,
     * et ne s'empile pas sur une voisine. À droite d'abord — le sens de
     * lecture d'une série —, puis à gauche, puis on renonce.
     *
     * ET CE N'EST PAS UN POSTE DE PLUS SOUS LA MÊME PLAQUE : la copie ne
     * reprend pas le `group` de son modèle. Une série le long d'un plan de
     * travail, ce sont des boîtes séparées.
     */
    repeterFixture: (id) => {
      const st = get();
      const src = st.fixtures.find((f) => f.id === id);
      if (!src) return null;
      const wall = st.walls.find((w) => w.id === src.wallId);
      if (!wall) return null;
      const quad = wallQuadsOf(st.walls).get(src.wallId);
      const face = wallFace(wall, quad, src.side);
      const spec = FIXTURES[src.kind];
      const x0 = faceX(face, src.along);

      /*
        LES VOISINS DE LA MÊME SÉRIE : même type, même hauteur, même face. Un
        interrupteur posé à côté d'une prise ne dit rien du pas d'une série de
        prises, et une prise plinthe ne dit rien d'une prise de plan de
        travail — c'est la hauteur qui les sépare.
      */
      const memeSerie = st.fixtures
        .filter(
          (o) =>
            o.id !== src.id &&
            o.wallId === src.wallId &&
            o.side === src.side &&
            o.kind === src.kind &&
            Math.abs(o.height - src.height) < 0.02,
        )
        .map((o) => faceX(face, o.along));

      /** La maçonnerie du mur : une copie ne tombe pas dans une baie. */
      const pleins = masonryRuns(
        wallRuns(wall, st.openings),
        segLength(wall),
        face,
      );
      const place = placeRepetee({
        x0,
        hauteur: src.height,
        largeur: spec.w,
        longueur: face.len,
        serie: memeSerie,
        occupe: st.fixtures
          .filter((o) => o.wallId === src.wallId && o.side === src.side)
          .map((o) => ({ x: faceX(face, o.along), y: o.height })),
        pleins,
      });
      // Nulle part où la poser : on ne pose pas.
      if (place === null) return null;

      pushHistory('repeterFixture');
      const neuf: Fixture = {
        ...src,
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        along: fromFaceX(face, place),
        // Une série, ce sont des boîtes SÉPARÉES : la copie ne rejoint pas la
        // plaque de son modèle, et elle ne garde pas ses liens de commande —
        // un interrupteur qui commanderait six socles d'un coup parce qu'on a
        // appuyé six fois serait un câblage qu'on n'a pas demandé.
        group: undefined,
        commands: undefined,
      };
      set({ fixtures: [...st.fixtures, neuf], dirty: true });
      return neuf.id;
    },

    moveFixture: (id, along, height) => {
      if (!sontFinis(along, height)) return;
      const st = get();
      const f = st.fixtures.find((x) => x.id === id);
      const wall = f ? st.walls.find((w) => w.id === f.wallId) : null;
      if (!f || !wall) return;
      const face = wallFace(wall, wallQuadsOf(st.walls).get(wall.id), f.side);

      /**
       * Un ensemble se déplace D'UN BLOC.
       *
       * Deux prises sous une même plaque, ce n'est plus deux appareils :
       * c'est une plaque de 153 mm avec deux mécanismes. En déplacer un
       * seul cassait l'entraxe — l'ensemble n'existait que tant qu'on n'y
       * touchait pas. On déplace donc tout le lot du même vecteur, et on
       * borne le BLOC au mur, pas chaque poste séparément : sans quoi le
       * premier arrivé au bord écrase les autres contre lui.
       */
      const lot =
        f.group
          ? st.fixtures.filter(
              (o) => o.group === f.group && o.wallId === f.wallId && o.side === f.side,
            )
          : [f];

      // Emprise du bloc, mesurée sur la face.
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const o of lot) {
        const sp = FIXTURES[o.kind];
        const cx = faceX(face, o.along);
        x0 = Math.min(x0, cx - sp.w / 2);
        x1 = Math.max(x1, cx + sp.w / 2);
        y0 = Math.min(y0, o.height - sp.h / 2);
        y1 = Math.max(y1, o.height + sp.h / 2);
      }
      const largeur = x1 - x0;
      const hauteur = y1 - y0;

      // Le vecteur demandé, puis ce que le mur en laisse passer.
      const vise = { x: faceX(face, along), y: height };
      let dx = vise.x - faceX(face, f.along);
      let dy = vise.y - f.height;
      dx = Math.min(face.len - x1, Math.max(-x0, dx));
      dy = Math.min(wall.height - y1, Math.max(-y0, dy));
      // Un bloc plus large que son mur : on le colle au bord, sans pousser.
      if (largeur > face.len) dx = -x0;
      if (hauteur > wall.height) dy = -y0;

      /**
       * ET SUR DE LA MAÇONNERIE, pas dans une baie.
       *
       * Le mur vu de face montre bien ses ouvertures, mais le doigt les
       * traversait sans résistance : on posait une prise au milieu d'une
       * porte-fenêtre, et elle partait au métré comme si elle tenait sur
       * du vide. Or les RETOURS — les trente centimètres de mur entre
       * l'angle et l'huisserie — sont justement là où se pose
       * l'interrupteur d'entrée : ce sont des emplacements à viser, pas des
       * zones à éviter. Le bloc se recale donc sur le retour le plus proche
       * capable de l'accueillir en entier.
       */
      const pleins = masonryRuns(
        wallRuns(wall, st.openings),
        segLength(wall),
        face,
      );
      if (pleins.length > 1) {
        const centre = (x0 + x1) / 2 + dx;
        const cale = snapToMasonry(pleins, centre, largeur / 2, face.len);
        dx += cale - centre;
      }

      pushHistory(`fixture:${f.group ?? id}`);
      const ids = new Set(lot.map((o) => o.id));
      set({
        fixtures: st.fixtures.map((o) =>
          ids.has(o.id)
            ? {
                ...o,
                along: fromFaceX(face, faceX(face, o.along) + dx),
                height: o.height + dy,
              }
            : o,
        ),
        dirty: true,
      });
    },

    clearPendingJoin: () => set({ pendingJoin: null }),

    setNorth: (deg) => {
      pushHistory('north');
      set({ north: deg, dirty: true });
    },

    setClientInfo: (client, address) => {
      set({ client: client.trim(), address: address.trim(), dirty: true });
    },

    renameSave: (id, name) => {
      // Soixante caractères, comme l'en-tête (revue « Hugo » : 300 passaient).
      const clean = couperLeNom(name.trim(), NOM_PLAN_MAX);
      if (!clean) return;
      const st = get();
      const saves = st.saves.map((x) =>
        x.id === id ? { ...x, name: clean, updatedAt: Date.now() } : x,
      );
      set({
        saves,
        // Le scan ouvert est le même : son en-tête doit suivre.
        scanName: st.currentSaveId === id ? clean : st.scanName,
      });
      persistSoon(saves);
      // Le nouveau nom monte aussi en ligne (revue « Fatou »).
      deposerPlusTard(id);
    },

    /**
     * DUPLIQUER : chiffrer deux variantes de la même installation.
     *
     * On copie l'entrée telle quelle, sans l'ouvrir — les photos restent
     * partagées avec l'original, ce sont des fichiers sur le disque et
     * personne ne veut les voir doubler de poids à chaque copie.
     */
    duplicateSave: (id) => {
      const st = get();
      const source = st.saves.find((x) => x.id === id);
      if (!source) return;
      // Une copie est un plan : voir `placePourUnPlanDePlus`.
      if (!placePourUnPlanDePlus()) return;
      const now = Date.now();
      const copie: SavedScan = {
        ...source,
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        /*
          UN NOM À ELLE — revues « Fatou » et « Hugo » : deux copies
          s'appelaient « Plan (copie) », la copie d'une copie
          « Plan (copie) (copie) ».
        */
        name: nomDeVersion(
          `${source.name.replace(/ \(copie\)( — version \d+)?$/, '')} (copie)`,
          st.saves.map((x) => x.name),
        ),
        createdAt: now,
        updatedAt: now,
        // Copier, c'est vouloir garder : la copie est enregistrée, et
        // reprend ce qui l'a été — pas les modifications en attente.
        supprimeLe: undefined,
        retouche: undefined,
      };
      const i = st.saves.findIndex((x) => x.id === id);
      const saves = [...st.saves];
      saves.splice(i + 1, 0, copie);
      set({ saves });
      persistSoon(saves);
      // La copie a sa sauvegarde en ligne, comme tout plan (revue « Fatou »).
      deposerPlusTard(copie.id);
    },

    restoreFixtures: (list) => {
      pushHistory('restore');
      set({ fixtures: list, dirty: true });
    },

    addPhoto: (wallId, along, path, asset) => {
      pushHistory('photo');
      const id = `ph-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      set({
        photos: [
          ...get().photos,
          { id, wallId, along, path, at: Date.now(), ...(asset ? { asset } : null) },
        ],
        dirty: true,
      });
      return id;
    },

    /*
      REPOSE UNE PHOTO DONT LE FICHIER A DISPARU.

      Relevé du chantier : « que les photos soient lues même s'il réinstalle
      l'application ». Les Documents de l'app partent avec l'app ; la
      photothèque de l'utilisateur, non. On redemande donc l'image au coffre
      et l'on réécrit le cache — le reste de l'application ne voit qu'un
      fichier, comme avant.

      Rien à enregistrer au passage : reposer une photo n'est pas modifier le
      plan. Marquer le scan « modifié » ici ferait réclamer une sauvegarde à
      chaque ouverture, pour un travail que l'utilisateur n'a pas fait.
    */
    /*
      LE RELEVÉ MONTE AU COMPTE, LES IMAGES RESTENT AU TÉLÉPHONE.

      Un relevé de logement entier fait quelques dizaines de kilo-octets :
      des murs, des ouvertures, de l'appareillage et les IDENTIFIANTS des
      photos. C'est du texte, il monte sans rien coûter — et les images,
      elles, ne quittent jamais la photothèque de l'électricien.
    */
    deposerAuCompte: async (id, qui) => {
      if (!qui) return;
      const save = get().saves.find((s) => s.id === id);
      // Ce que le compte garde, c'est ce qu'on a ENREGISTRÉ : ni le plan
      // rangé pour douze heures, ni les modifications qui attendent.
      if (!save || save.supprimeLe) return;
      await deposerPlan(qui, {
        scan: save.id,
        nom: save.name,
        maj: save.updatedAt,
        contenu: JSON.stringify({ ...save, retouche: undefined }),
      });
    },

    /*
      CE QUE LE COMPTE GARDE ET QUE CE TÉLÉPHONE N'A PAS.

      On ne redescend QUE ce qui manque : un plan déjà présent ici a pu être
      retouché depuis, et l'écraser avec la version du serveur ferait perdre
      le travail de la matinée. En cas de doute, c'est le téléphone qui a
      raison — c'est lui qui était sur le chantier.
    */
    reprendreDuCompte: async (qui) => {
      if (!qui) return 0;
      const liste = await catalogueDesPlans(qui);
      // Le serveur n'a pas répondu : −1, pour que la reprise se retente.
      if (liste === null) return -1;
      if (!liste.length) return 0;
      const ici = new Set(get().saves.map((s) => s.id));
      let repris = 0;
      for (const p of liste) {
        if (ici.has(p.scan)) continue;
        const plan = await reprendrePlan(qui, p.scan);
        if (!plan) continue;
        try {
          const lu = JSON.parse(plan.contenu) as SavedScan;
          if (!lu?.id || !Array.isArray(lu.walls)) continue;
          const saves = [migrateSave(lu), ...get().saves];
          set({ saves });
          persistSoon(saves);
          repris += 1;
        } catch {
          // Un plan illisible ne doit pas arrêter les suivants : le compte
          // en garde peut-être neuf autres qui vont très bien.
        }
      }
      return repris;
    },

    reposerPhoto: async (id) => {
      const ph = get().photos.find((p) => p.id === id);
      if (!ph?.asset) return;
      const chemin = await reposerDuCoffre(ph.asset);
      if (!chemin) return;
      set({
        photos: get().photos.map((p) =>
          p.id === id ? { ...p, path: chemin } : p,
        ),
      });
    },

    addCeiling: (kind, roomId, at, ligne) => {
      pushHistory('addCeiling');
      const id = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      set({
        ceiling: [
          ...get().ceiling,
          { id, kind, roomId, at, ...(ligne ? { row: ligne.row, axe: ligne.axe } : {}) },
        ],
        dirty: true,
      });
      return id;
    },

    addRuban: (roomId, trace, ferme, retrait) => {
      if (trace.length < 2 || trace.some((p) => !sontFinis(p.x, p.z))) return undefined;
      pushHistory('addCeiling');
      const id = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      set({
        ceiling: [
          ...get().ceiling,
          {
            id,
            kind: 'led',
            roomId,
            at: { ...trace[0] },
            trace: trace.map((p) => ({ ...p })),
            ferme,
            ...(retrait !== undefined ? { retrait } : {}),
          },
        ],
        dirty: true,
      });
      return id;
    },

    /*
      LE RETRAIT D'UN RUBAN SE RETOUCHE — revue « Yasmine » : un caisson posé
      à 50 cm ne se ramenait pas à 40. Le bandeau proposait la « distance au
      mur de gauche » de son premier coin (230 cm) ; taper 40 faisait glisser
      tout le tracé de 1,90 m, deux sommets hors de la pièce. On retrace.
    */
    retracerRuban: (id, trace, retrait) => {
      const st = get();
      const cl = st.ceiling.find((c) => c.id === id);
      if (!cl || trace.length < 2 || trace.some((p) => !sontFinis(p.x, p.z))) return;
      pushHistory(`retracerRuban:${id}`);
      set({
        ceiling: st.ceiling.map((c) =>
          c.id === id
            ? {
                ...c,
                at: { ...trace[0] },
                trace: trace.map((p) => ({ ...p })),
                ...(retrait !== undefined ? { retrait } : {}),
              }
            : c,
        ),
        dirty: true,
      });
    },

    /**
     * REPOSER UNE LIGNE, d'un seul geste et d'un seul repentir.
     *
     * Retourner une ligne de six spots, c'était six déplacements au
     * centimètre — et six lignes dans l'historique, donc six annulations
     * pour revenir en arrière. Les spots gardent leur ordre : le premier
     * de la liste reçoit la première place, et les liens de commande
     * déjà tirés vers un interrupteur suivent leur point.
     */
    setCeilingRow: (row, pts, axe) => {
      const st = get();
      const dansLaLigne = st.ceiling.filter((c) => c.row === row);
      if (dansLaLigne.length === 0 || pts.length === 0) return;
      pushHistory(`ceilingRow:${row}`);
      let k = 0;
      set({
        ceiling: st.ceiling.map((c) =>
          c.row === row
            ? { ...c, at: pts[Math.min(k++, pts.length - 1)], axe }
            : c,
        ),
        dirty: true,
      });
    },

    removeCeilingRow: (row) => {
      pushHistory('removeCeilingRow');
      set({
        ceiling: get().ceiling.filter((c) => c.row !== row),
        dirty: true,
      });
    },

    /*
      UNE LIGNE DE SPOTS SE DÉPLACE D'UN BLOC — revue « Mehdi » : il fallait
      glisser les quatre spots un par un pour la recaler. Elle avance
      entière ; un pas qui en sortirait un de la pièce est refusé.
    */
    moveCeilingRow: (row, dx, dz) => {
      const st = get();
      const ligne = st.ceiling.filter((c) => c.row === row);
      if (ligne.length === 0 || (!dx && !dz)) return;
      const part = roomParts(st.walls, st.rooms).find((p) => p.roomId === ligne[0].roomId);
      const ring = part?.surface?.pts ?? [];
      if (ring.length >= 3 && ligne.some((c) => !pointInPolygon({ x: c.at.x + dx, z: c.at.z + dz }, ring))) return;
      pushHistory(`ceilingRow:${row}`);
      set({
        ceiling: st.ceiling.map((c) =>
          c.row === row ? avecSaTrace(c, (p) => ({ x: p.x + dx, z: p.z + dz })) : c,
        ),
        dirty: true,
      });
    },

    moveCeiling: (id, at) => {
      const st = get();
      const cl = st.ceiling.find((c) => c.id === id);
      if (!cl) return;
      /**
       * LES MURS L'ARRÊTENT, comme un meuble.
       *
       * Un point lumineux posé hors de sa pièce n'existe pas : il n'a ni
       * circuit, ni métré, ni sens sur le chantier. Le doigt dépasse
       * pourtant tout le temps — on vise le coin, on sort d'un
       * centimètre. Le contour de la pièce ramène donc la position sur
       * son bord le plus proche, légèrement en retrait pour que le
       * symbole ne chevauche pas la maçonnerie.
       */
      const part = roomParts(st.walls, st.rooms).find(
        (p) => p.roomId === cl.roomId,
      );
      const ring = part?.surface?.pts ?? [];
      const pose =
        ring.length >= 3 && !pointInPolygon(at, ring)
          ? insetOnRing(ring, at, WALL_T / 2 + 0.03)
          : at;
      pushHistory(`ceiling:${id}`);
      // Un ruban glisse en entier : son tracé suit son ancre.
      const dx = pose.x - cl.at.x;
      const dz = pose.z - cl.at.z;
      set({
        ceiling: st.ceiling.map((c) =>
          c.id === id ? avecSaTrace(c, (p) => ({ x: p.x + dx, z: p.z + dz })) : c,
        ),
        dirty: true,
      });
    },

    /*
      LES NOTES DU PLAN.

      Elles n'entrent dans aucun calcul : ni surface, ni métré, ni contrôle
      des normes. C'est ce qui les rend simples — et c'est aussi pourquoi
      elles ont attendu si longtemps, chaque fonction de l'app ayant préféré
      ce qui se compte.
    */
    addNote: (text, at) => {
      const propre = text.trim().slice(0, NOTE_MAX);
      // Un appui par mégarde ne sème pas de pastille muette sur le plan.
      if (!propre) return;
      pushHistory('addNote');
      const st = get();
      set({
        notes: [
          ...st.notes,
          {
            id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: propre,
            at,
            niveau: st.niveauCourant,
          },
        ],
        dirty: true,
      });
    },

    moveNote: (id, at) => {
      pushHistory(`moveNote:${id}`);
      set({
        notes: get().notes.map((n) => (n.id === id ? { ...n, at } : n)),
        dirty: true,
      });
    },

    editNote: (id, text) => {
      const propre = text.trim().slice(0, NOTE_MAX);
      // Effacer ce qu'on avait écrit, c'est retirer la note : une pastille
      // vide ne se lit plus et ne se vise plus.
      if (!propre) {
        get().removeNote(id);
        return;
      }
      pushHistory('editNote');
      set({
        notes: get().notes.map((n) => (n.id === id ? { ...n, text: propre } : n)),
        dirty: true,
      });
    },

    removeNote: (id) => {
      pushHistory('removeNote');
      set({ notes: get().notes.filter((n) => n.id !== id), dirty: true });
    },

    addMesure: (a, b) => {
      // Deux appuis au même endroit ne font pas une cote.
      if (Math.hypot(b.x - a.x, b.z - a.z) < 0.01) return;
      pushHistory('addMesure');
      const st = get();
      set({
        mesures: [
          ...st.mesures,
          {
            id: `mesure-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            a,
            b,
            niveau: st.niveauCourant,
          },
        ],
        dirty: true,
      });
    },

    removeMesure: (id) => {
      pushHistory('removeMesure');
      set({ mesures: get().mesures.filter((m) => m.id !== id), dirty: true });
    },

    removeCeiling: (id) => {
      pushHistory('removeCeiling');
      set({ ceiling: get().ceiling.filter((c) => c.id !== id), dirty: true });
    },

    toggleCeilingCommand: (ceilingId, fixtureId) => {
      const cl = get().ceiling.find((c) => c.id === ceilingId);
      if (!cl || !CEILINGS[cl.kind].commandable) return;
      /*
        UNE LIGNE DE SPOTS SE RELIE, ET SE DÉLIE, EN UN SEUL « ANNULER » —
        revue « Mehdi » : relier quatre spots à leur interrupteur en
        demandait quatre. La clé nomme la commande : les liens noués d'un
        même geste se fondent.
      */
      pushHistory(`ceilingCommand:${fixtureId}`);
      set({
        ceiling: get().ceiling.map((c) => {
          if (c.id !== ceilingId) return c;
          const cur = c.commands ?? [];
          return {
            ...c,
            commands: cur.includes(fixtureId)
              ? cur.filter((x) => x !== fixtureId)
              : [...cur, fixtureId],
          };
        }),
        dirty: true,
      });
    },

    removePhoto: (id) => {
      pushHistory('photo');
      set({ photos: get().photos.filter((p) => p.id !== id), dirty: true });
    },

    lierElements: (aId, bId) => {
      if (aId === bId) return false;
      const st = get();
      /*
        CE QUI COMMANDE, ET CE QUI S'ALLUME — les deux listes du modèle
        électrique, et pas une troisième écrite ici. `COMMANDES_MURALES` dit
        ce qui allume ; `seCommande` dit ce qui s'allume au mur ; un point du
        plafond s'allume toujours.
      */
      const mural = (id: string) => st.fixtures.find((f) => f.id === id);
      const plafond = (id: string) => st.ceiling.find((c) => c.id === id);
      const estCommande = (id: string) => {
        const f = mural(id);
        return !!f && COMMANDES_MURALES.includes(f.kind);
      };
      const sAllume = (id: string) => {
        const f = mural(id);
        if (f) return seCommande(f.kind);
        // Un détecteur de fumée, une bouche de VMC ne s'allument pas (revue
        // « Mehdi » : on pouvait relier le détecteur à un interrupteur).
        const c = plafond(id);
        return !!c && CEILINGS[c.kind].commandable;
      };
      const [commande, cible] = estCommande(aId)
        ? [aId, bId]
        : estCommande(bId)
        ? [bId, aId]
        : [null, null];
      // Ni l'un ni l'autre n'allume : deux prises, deux points, un fantôme.
      if (!commande || !cible || !sAllume(cible)) return false;
      if (plafond(cible)) get().toggleCeilingCommand(cible, commande);
      else get().toggleFixtureCommand(cible, commande);
      return true;
    },

    toggleFixtureCommand: (fixtureId, commandeId) => {
      const st = get();
      const cible = st.fixtures.find((f) => f.id === fixtureId);
      const commande = st.fixtures.find((f) => f.id === commandeId);
      // La garde vit au magasin : un lien qui n'existe pas dans la realite
      // ne doit se nouer par AUCUN chemin.
      if (!cible || !commande) return;
      if (!seCommande(cible.kind)) return;
      if (!COMMANDES_MURALES.includes(commande.kind)) return;
      pushHistory('fixtureCommand');
      set({
        fixtures: st.fixtures.map((f) => {
          if (f.id !== fixtureId) return f;
          const cur = f.commands ?? [];
          return {
            ...f,
            commands: cur.includes(commandeId)
              ? cur.filter((x) => x !== commandeId)
              : [...cur, commandeId],
          };
        }),
        dirty: true,
      });
    },

    placeAssembly: (baseId, movedId, base, moved) => {
      const st = get();
      const b = st.fixtures.find((f) => f.id === baseId);
      if (!b) return;
      pushHistory('assemblage');
      const group =
        b.group ?? `pl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      set({
        fixtures: st.fixtures.map((f) => {
          if (f.id === baseId) return { ...f, ...base, group };
          if (f.id === movedId) return { ...f, ...moved, group, side: b.side };
          return f;
        }),
        dirty: true,
      });
    },

    splitFixture: (id, along) => {
      if (!sontFinis(along)) return;
      pushHistory('separer');
      set({
        fixtures: get().fixtures.map((f) =>
          f.id === id ? { ...f, along, group: undefined } : f,
        ),
        dirty: true,
      });
    },

    setFixtureUsage: (id, usage) => {
      const f = get().fixtures.find((x) => x.id === id);
      if (!f || (f.usage ?? undefined) === usage) return;
      pushHistory('setFixtureUsage');
      set({
        fixtures: get().fixtures.map((x) => {
          if (x.id !== id) return x;
          const neuf = { ...x };
          if (usage) neuf.usage = usage;
          else delete neuf.usage;
          return neuf;
        }),
        dirty: true,
      });
    },

    flipFixture: (id) => {
      pushHistory(`flip:${id}`);
      set({
        fixtures: get().fixtures.map((f) =>
          f.id === id ? { ...f, side: (f.side > 0 ? -1 : 1) as 1 | -1 } : f,
        ),
        dirty: true,
      });
    },

    basculerPontage: (id) => {
      set((e) => ({
        fixtures: e.fixtures.map((f) =>
          f.id === id ? { ...f, sansPontage: !f.sansPontage } : f,
        ),
      }));
      pushHistory('basculerPontage');
    },

    lierPlafond: (id, voisin) => {
      set((e) => {
        const cible = e.ceiling.find((x) => x.id === voisin);
        if (!cible) return {};
        // Le voisin n'a pas encore de ligne : on en ouvre une, et il la
        // rejoint aussi — une ligne d'un seul spot n'aurait aucun sens.
        const row = cible.row ?? `row-${voisin}`;
        return {
          ceiling: e.ceiling.map((x) =>
            x.id === id || x.id === voisin ? { ...x, row } : x,
          ),
        };
      });
      pushHistory('lierPlafond');
    },

    delierPlafond: (id) => {
      set((e) => {
        const moi = e.ceiling.find((x) => x.id === id);
        if (!moi?.row) return {};
        const restants = e.ceiling.filter(
          (x) => x.row === moi.row && x.id !== id,
        );
        /*
          UN SPOT SEUL N'EST PAS UNE LIGNE.

          Sortir l'avant-dernier laisserait le dernier dans une ligne d'un
          seul — il se croirait ponté et n'aurait personne à qui se ponter.
          On défait donc la ligne entière quand il ne resterait qu'un.
        */
        const aDefaire = restants.length <= 1;
        return {
          ceiling: e.ceiling.map((x) =>
            x.id === id || (aDefaire && x.row === moi.row)
              ? { ...x, row: undefined, axe: undefined }
              : x,
          ),
        };
      });
      pushHistory('delierPlafond');
    },

    removeFixture: (id) => {
      // L'histoire se photographie AVANT le dégroupage : prise après, elle
      // rendait à l'annulation deux prises sans leur plaque commune.
      pushHistory('removeFixture');
      // Un ensemble réduit à un poste n'est plus un ensemble : sa plaque
      // redevient simple, et l'appareil restant redevient libre.
      {
        const st0 = get();
        const parti = st0.fixtures.find((f) => f.id === id);
        if (parti?.group) {
          const restants = st0.fixtures.filter(
            (f) => f.group === parti.group && f.id !== id,
          );
          if (restants.length === 1) {
            const seul = restants[0].id;
            set({
              fixtures: st0.fixtures.map((f) =>
                f.id === seul ? { ...f, group: undefined } : f,
              ),
            });
          }
        }
      }
      /*
        ET SES LIENS PARTENT AVEC LUI. Un interrupteur supprimé restait la
        « commande » des appliques et des points du plafond : le contrôle
        croyait le point commandé alors que sa commande n'existe plus, et
        le constat « sans commande » ne tombait jamais.
      */
      const purge = (commands?: string[]) => {
        if (!commands?.includes(id)) return commands;
        const restants = commands.filter((x) => x !== id);
        return restants.length > 0 ? restants : undefined;
      };
      set({
        fixtures: get()
          .fixtures.filter((f) => f.id !== id)
          .map((f) => ({ ...f, commands: purge(f.commands) })),
        ceiling: get().ceiling.map((cl) => ({
          ...cl,
          commands: purge(cl.commands),
        })),
        dirty: true,
      });
    },

    undo: () => {
      const prev = history.pop();
      if (!prev) return;
      const st = get();
      // Ce qu'on quitte part dans l'avenir : « Refaire » le ressortira.
      avenir.push({
        walls: st.walls,
        openings: st.openings,
        objects: st.objects,
        rooms: st.rooms,
        fixtures: st.fixtures,
        photos: st.photos,
        ceiling: st.ceiling,
        notes: st.notes,
        mesures: st.mesures,
      });
      set({
        ...prev,
        niveauCourant: niveauApresRetour(st.walls, prev.walls, st.niveauCourant, st.rooms, prev.rooms),
        canUndo: history.length > 0,
        canRedo: true,
        // Revenu à l'état enregistré : il n'y a plus rien à enregistrer, et
        // le bouton de sauvegarde n'a plus lieu d'être.
        dirty: history.length !== savedDepth,
      });
    },

    redo: () => {
      const suite = avenir.pop();
      if (!suite) return;
      const st = get();
      // Et le voyage se fait dans les deux sens : ce qu'on quitte en
      // avançant redevient annulable.
      history.push({
        walls: st.walls,
        openings: st.openings,
        objects: st.objects,
        rooms: st.rooms,
        fixtures: st.fixtures,
        photos: st.photos,
        ceiling: st.ceiling,
        notes: st.notes,
        mesures: st.mesures,
      });
      set({
        ...suite,
        niveauCourant: niveauApresRetour(st.walls, suite.walls, st.niveauCourant, st.rooms, suite.rooms),
        canUndo: true,
        canRedo: avenir.length > 0,
        dirty: history.length !== savedDepth,
      });
    },

    setRoomHeight: (roomId, height) => {
      if (!(height > 1) || height > 6) return;
      const st = get();
      pushHistory('height');
      const ids = new Set(st.rooms.find((r) => r.id === roomId)?.wallIds ?? []);
      /*
        UN FAUX PLAFOND RESTE DANS SA PIÈCE — revue « Claire ». Baisser le
        couloir à 2,60 m abaissait aussi les murs qu'il partage avec le double
        séjour à 3,20 m. Un mur MITOYEN ne descend pas sous la hauteur de sa
        voisine : il garde la sienne, et la pièce porte sa hauteur à elle
        (`hauteur`, lue par `hauteurDeLaPiece`). Ses murs à elle seule suivent.
      */
      const mitoyens = new Set(
        st.rooms.filter((r) => r.id !== roomId).flatMap((r) => (r.wallIds ?? []).filter((id) => ids.has(id))),
      );
      const walls = st.walls.map((w) => {
        if (!ids.has(w.id)) return w;
        if (mitoyens.has(w.id) && w.height > height) return w;
        return { ...w, height, yCenter: height / 2 };
      });
      const rooms = st.rooms.map((r) => {
        if (r.id !== roomId) return r;
        const siens = walls.filter((w) => ids.has(w.id));
        // Tous ses murs à cette hauteur : la pièce n'a pas besoin de la sienne.
        if (siens.every((w) => Math.abs(w.height - height) < 1e-6)) {
          if (r.hauteur === undefined) return r;
          const sans = { ...r };
          delete sans.hauteur;
          return sans;
        }
        return { ...r, hauteur: height };
      });
      // Les prises et les menuiseries de CES murs-là suivent leur plafond.
      const suite = rabattreSousLePlafond(
        walls.filter((w) => ids.has(w.id)),
        st.fixtures,
        st.openings,
      );
      // (`rabattreSousLePlafond` ne touche que les baies du niveau de chaque mur.)
      set({ walls, rooms, ...suite, dirty: true });
    },

    /*
      LA HAUTEUR DE TOUT LE LOGEMENT, EN UN GESTE.

      Relevé du patron : « optimise des choses qui pourraient prendre plus en
      facilité et moins de temps ». La hauteur se réglait pièce par pièce :
      sur un T4 — séjour, cuisine, trois chambres, salle de bain, WC,
      dégagement — huit fois le même geste, pour une cote que le plancher
      impose partout.

      TOUS LES MURS, y compris ceux qu'aucune pièce ne revendique : un recoin
      technique, un placard sous escalier, un mur de refend laissé de côté
      par la détection. Les oublier produirait un logement à deux plafonds,
      visible en 3D et faux au métré.

      L'accident garde son réglage à lui : une retombée de poutre, une
      sous-pente, un muret de cuisine se règlent mur par mur
      (`setWallHeight`), et c'est le geste qu'on fait APRÈS avoir posé la
      hauteur du logement.
    */
    setAllRoomHeights: (height) => {
      if (!(height > 1) || height > 6) return;
      const st = get();
      // Rien à changer, rien à annuler : un pas d'historique pour rien est
      // une annulation qui ne défait rien, et le geste paraît perdu.
      /*
        LE NIVEAU QU'ON REGARDE, ET LUI SEUL — revue « Léa » : « tout le
        logement à 2,40 » mettait aussi le rez-de-chaussée à 2,40 m. Chaque
        niveau a son plancher.
      */
      const n = st.niveauCourant;
      const ici = (w: WallSeg) => niveauDe(w) === n;
      if (st.walls.every((w) => !ici(w) || Math.abs(w.height - height) < 1e-6)) return;
      pushHistory('height');
      const walls = st.walls.map((w) => (ici(w) ? { ...w, height, yCenter: height / 2 } : w));
      const suite = rabattreSousLePlafond(walls.filter(ici), st.fixtures, st.openings);
      // Tout le niveau à la même hauteur : les faux plafonds de ses pièces s'effacent.
      const rooms = st.rooms.map((r) => {
        if (r.hauteur === undefined || niveauDe(r) !== n) return r;
        const sans = { ...r };
        delete sans.hauteur;
        return sans;
      });
      set({ walls, rooms, ...suite, dirty: true });
    },

    setWallHeight: (wallId, height) => {
      /*
        LA BORNE BASSE N'EST PAS CELLE D'UNE PIÈCE.

        Le réglage par pièce refuse tout ce qui est sous le mètre — une
        pièce de 80 cm de haut n'existe pas. Un MUR de 80 cm, si : c'est un
        muret, une allège, un retour de cloison de douche. On garde
        seulement le garde-fou du dessus, et un plancher à 30 cm en dessous
        duquel ce n'est plus un mur mais une plinthe.
      */
      if (!(height >= 0.3) || height > 6) return;
      const st = get();
      const wall = st.walls.find((w) => w.id === wallId);
      if (!wall || Math.abs(wall.height - height) < 1e-6) return;
      pushHistory(`wallHeight:${wallId}`);
      // Le sol reste où il est : c'est le plafond qui monte ou descend.
      const sol = wall.yCenter - wall.height / 2;
      const neuf = { ...wall, height, yCenter: sol + height / 2 };
      // Prises et menuiseries suivent : voir `rabattreSousLePlafond`, qui
      // sert aussi au réglage par pièce et à celui de tout le logement.
      const suite = rabattreSousLePlafond([neuf], st.fixtures, st.openings);
      set({
        walls: st.walls.map((w) => (w.id === wallId ? neuf : w)),
        ...suite,
        dirty: true,
      });
    },

    beginScan: () =>
      set({
        wallCount: 0,
        objectCount: 0,
        doorCount: 0,
        windowCount: 0,
      }),

    setScreen: (screen) => set({ screen }),
    ouvrirDiagnostic: (id) => set({ diagnosticId: id, screen: 'diagnostic' }),
    demanderLesTarifs: () => set({ forcerTarifs: true }),
    consommerLaDemandeDeTarifs: () => {
      const veut = get().forcerTarifs;
      if (veut) set({ forcerTarifs: false });
      return veut;
    },

    raccourciEnAttente: false,
    setRaccourciEnAttente: (raccourciEnAttente) =>
      set({ raccourciEnAttente }),
    setSupported: (supported) => set({ supported }),
    setScanning: (scanning) => {
      set({ scanning });
      /*
        LA MINUTERIE VIT AVEC LE RELEVÉ.

        Elle démarre au premier scan et continue APRÈS : un relevé terminé
        mais non enregistré se perd exactement comme un relevé en cours, et
        c'est même le cas le plus fréquent — on scanne, on regarde le plan,
        le téléphone meurt.
      */
      if (scanning) {
        armerBrouillon(() => get().ecrireBrouillon());
      }
    },
    setPaused: (paused) => set({ paused }),
    setProcessing: (processing) => set({ processing }),
    setError: (error) => set({ error }),
    setInstruction: (instruction) => set({ instruction }),
    setComplement: (v) => set({ complementEnCours: v }),

    applyLiveUpdate: (u) =>
      set({
        wallCount: u.wallCount,
        objectCount: u.objectCount,
        doorCount: u.doorCount,
        windowCount: u.windowCount,
        /*
          « medium » compte AUTANT que « low ». RoomPlan ne réserve pas sa
          confiance haute aux cas parfaits : un mur moyen est un mur qu'on
          ferait mieux de repasser, et le repasser ne coûte rien tant qu'on
          est devant. C'est le compte qui compte, pas le détail : on ne va
          pas demander à quelqu'un qui balaie une pièce de lire une liste.
        */
        // Le compte vient du natif (cinq nombres au lieu des surfaces
        // entières, deux fois par seconde) ; un natif ancien les envoie
        // encore, et l'on sait toujours compter.
        trouContour: typeof u.trouContour === 'number' ? u.trouContour : 0,
        // Le plus proche des murs mal vus, nommé par le natif.
        murDouteux: u.murDouteux ?? null,
        ...(u.murValide ? { murValideA: Date.now() } : {}),
        mursDouteux:
          typeof u.mursDouteux === 'number'
            ? u.mursDouteux
            : (u.surfaces ?? []).filter((s2) => {
                const c2 = String(s2.confidence ?? '').toLowerCase();
                return (
                  (s2.type ?? 'wall') === 'wall' &&
                  (c2 === 'low' || c2 === 'medium')
                );
              }).length,
      }),

    arrivage: null,
    oublierArrivage: () => set({ arrivage: null }),
    retirerMeubles: () => {
      pushHistory('retirerMeubles');
      // Ceux de l'étage à l'écran : décocher les meubles de l'étage qu'on
      // vient de relever ne vide pas le rez-de-chaussée.
      const st = get();
      const n = st.niveauCourant;
      set({
        objects: st.objects.filter((o) => niveauDe(st.rooms.find((r) => r.id === o.roomId)) !== n),
        dirty: true,
      });
    },

    finalizeMerge: (r) => {
      const st = get();
      const n = st.niveauCourant;
      const surfaces = r.rooms?.length
        ? r.rooms.flatMap((x) => x.surfaces ?? [])
        : r.surfaces ?? [];
      const entrants = r.rooms?.length
        ? r.rooms.flatMap((x) => x.objects ?? [])
        : r.objects ?? [];
      /*
        LE REPÈRE DES PASSAGES. Ceux d'un étage sont entrés dans le plan
        décalés du pré-calage (voir `empilerUnReleve`) : le passage de plus,
        rendu dans le repère brut de l'iPhone, prend le même décalage.
      */
      const cale = st.passagesNatifs?.niveau === n ? st.passagesNatifs : null;
      const dx = cale?.dx ?? 0;
      const dz = cale?.dz ?? 0;
      // Et sa rotation, quand l'étage a été tourné (voir `passagesNatifs`).
      const angle = cale?.angle ?? 0;
      const ORIGINE = { x: 0, z: 0 };
      const placer = (p: Pt): Pt => {
        const q = angle ? pivoterPoint(p, ORIGINE, angle) : p;
        return { x: q.x + dx, z: q.z + dz };
      };
      const versLeBrut = (p: Pt): Pt => pivoterPoint({ x: p.x - dx, z: p.z - dz }, ORIGINE, -angle);
      const decaler = <T extends WallSeg>(w: T): T =>
        dx === 0 && dz === 0 && angle === 0 ? w : { ...w, a: placer(w.a), b: placer(w.b) };
      // Le coffre de volet, que RoomPlan lisse, relu dans le maillage LiDAR.
      // Les façades de placard, reconnues dans le repère du passage.
      const placardsPassage = facadesDePlacard(
        avecLesBordsDuLidar(avecCoffresDuLidar(surfaces.map((x) => toSegment(x)), r.dessus), r.dessus, r.tableaux),
        entrants,
      );
      const relivres = placardsPassage.segments.map(decaler);
      /*
        CE QUI A ÉTÉ RETIRÉ NE REVIENT PAS — revue « Thomas » : la pièce du
        voisin, retirée, revenait à chaque passage. Ce que le passage relivre
        dans son contour s'écarte, sauf le mur qu'une pièce gardée borde
        aussi.
      */
      const ecartees = st.piecesEcartees
        .filter((p) => p.cle === st.cleDuReleve && p.niveau === n)
        .map((p) => p.contour);
      const gardees =
        ecartees.length > 0
          ? roomParts(jeuDuNiveau(st, n).walls, jeuDuNiveau(st, n).rooms)
              .map((p) => p.surface?.pts ?? [])
              .filter((c) => c.length >= 3)
          : [];
      const pres = (p: Pt, c: Pt[]) =>
        pointInPolygon(p, c) || c.some((q, i) => pointOnSeg(p, q, c[(i + 1) % c.length]).dist <= 0.15);
      const ecarte = (p: Pt) => ecartees.some((c) => pres(p, c)) && !gardees.some((c) => pres(p, c));
      const milieuDe = (w: WallSeg) => ({ x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 });
      const segments = ecartees.length > 0 ? relivres.filter((w) => !ecarte(milieuDe(w))) : relivres;
      const meublesDuPassage = entrants.filter(
        (o) =>
          !placardsPassage.meublesDuPlacard.has(o.id) &&
          !(ecartees.length > 0 && ecarte(placer({ x: o.transform[12], z: o.transform[14] }))),
      );
      /*
        LA CLOISON MITOYENNE EST VUE DEUX FOIS — une fois depuis chaque
        pièce. Sans les réunir, chaque arête doublée fausse le parcours des
        faces, et le logement ressort en une seule pièce, ou en aucune.
      */
      // Les éclats de 0 cm que la soudure des coins laisse s'en vont (voir `ECLAT`).
      const nettoyes = sansEclats(
        mergeColinear(
          splitAtJunctions(
            epaisseursAccordees(
              weldCorners(fusionnerMursDoubles(preEquerrage(segments.filter((x) => x.type === 'wall')))),
            ),
          ),
        ),
        [],
      ).walls;
      if (nettoyes.length === 0) {
        // Rien d'exploitable : on rend le plan tel qu'il était.
        set({ processing: false, scanning: false, screen: 'result' });
        return;
      }
      // La logique de construction : d'équerre, sur des niveaux communs.
      const logique = releveLogique(nettoyes, segments.filter((x) => x.type !== 'wall'));
      const venus = logique.walls;
      const jeu = jeuDuNiveau(st, n);
      /*
        CES PASSAGES SONT-ILS CEUX DU PLAN ? — revues « Agathe » et « Inès ».

        L'iPhone ne garde ses passages qu'en mémoire : après un redémarrage,
        il n'en a plus aucun, et le relevé ne rend que la pièce du jour ;
        après un autre chantier, ce sont les siens. Le résultat REMPLAÇAIT
        quand même le plan : trois pièces disparues, les prises entassées
        sur les murs de la seule pièce neuve, et l'enregistrement automatique
        partait une seconde et demie plus tard.

        Un passage seul, ou un relevé qui ne retrouve pas les murs déjà là,
        ne remplace rien : la pièce s'ajoute à côté.
      */
      if ((r.passages ?? 2) < 2 || partRecouverte(jeu.walls, venus) < 0.5) {
        empilerUnReleve(r, n, true);
        return;
      }
      /*
        CE QUI A ÉTÉ TRACÉ OU POSÉ À LA MAIN RESTE. Le relevé remplace ce
        qu'il a vu — ses murs, ses baies, ses meubles, qui portent les
        identifiants de RoomPlan — pas la cloison qu'on a dessinée, la
        porte qu'il avait manquée, le canapé qu'on a posé.
      */
      const idsVenus = new Set(venus.map((w) => w.id));
      const tracesALaMain = jeu.walls.filter(
        (w) => !duReleve(w.id) && !idsVenus.has(w.id) && !estRecouvert(w, venus),
      );
      const auNiveau = <T extends WallSeg>(w: T): T =>
        n === NIVEAU_RDC || w.niveau === n ? w : { ...w, niveau: n };
      const walls = (
        tracesALaMain.length > 0
          ? sansEclats(mergeColinear(splitAtJunctions(weldCorners([...venus, ...tracesALaMain]))), []).walls
          : venus
      ).map(auNiveau);
      // La baie vitrée que RoomPlan a prise pour une porte (voir `baiesVitrees`),
      // et la porte collée à l'angle, dégagée du mur d'angle (voir
      // `baiesHorsDesAngles`).
      const baiesVenues = marquerLesPortes(baiesHorsDesAngles(baiesVitrees(portesVuesOuvertes(logique.openings, walls), walls), walls), r);
      const milieu = (o: WallSeg) => ({ x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 });
      const baiesALaMain = jeu.openings.filter(
        (o) =>
          !duReleve(o.id) &&
          !baiesVenues.some((v) => {
            const p = milieu(v);
            const q = milieu(o);
            return Math.hypot(p.x - q.x, p.z - q.z) < 0.4;
          }),
      );
      let openings = [...baiesVenues, ...baiesALaMain].map(auNiveau);
      pushHistory('completerReleve');

      const detected = detectRooms(walls, undefined, openings);
      const shapes =
        detected.length > 0
          ? detected
          : [{ outline: [], wallIds: walls.map((w) => w.id), area: 0 }];
      const contours = shapes.map((x) => x.outline);
      const idPiece = (i: number) => (n === NIVEAU_RDC ? `room-${i + 1}` : `room-${n}-${i + 1}`);

      /*
        CE QUI S'ACCROCHE À UN MUR SE REPOSE SUR LE NOUVEAU JEU.

        Les murs du second passage portent d'autres identifiants, et la
        fusion a pu les redécouper : sans reprojection, chaque prise posée
        se retrouverait sur un mur qui n'existe plus — disparue de l'écran,
        des comptages et du métré.
      */
      const fixtures = reprojectFixtures(jeu.walls, walls, jeu.fixtures);
      const photos = reprojectAnchors(jeu.walls, walls, jeu.photos);

      const floor = r.floor ?? r.rooms?.[0]?.floor ?? jeu.rooms[0]?.floor ?? st.rooms[0]?.floor ?? null;
      // Les sièges regardent la pièce, pas le mur : voir `orienterLesSieges`.
      const meublesVenus: ObjectData[] = calerLesMeubles(orienterLesSieges(
        separerLeMobilier(
          // Le canapé d'angle d'abord : séparé, sa méridienne serait repoussée.
          reunirLesCanapesDAngle(sansMeublesEnDouble(meublesDuPassage)).map((o) => {
            const t = [...o.transform];
            if (angle) {
              const cs = Math.cos(angle);
              const sn = Math.sin(angle);
              for (const k of [0, 4, 8]) {
                const x = t[k];
                const z = t[k + 2];
                t[k] = x * cs - z * sn;
                t[k + 2] = x * sn + z * cs;
              }
            }
            const p = placer({ x: t[12], z: t[14] });
            t[12] = p.x;
            t[14] = p.z;
            return {
              ...o,
              transform: t,
              roomId: idPiece(roomIndexAt({ x: t[12], z: t[14] }, contours)),
            };
          }),
        ),
        walls,
      ), walls);
      const meublesALaMain = jeu.objects
        .filter((o) => !duReleve(o.id))
        .map((o) => ({
          ...o,
          roomId: idPiece(roomIndexAt({ x: o.transform[12], z: o.transform[14] }, contours)),
        }));
      const objects = [...meublesVenus, ...meublesALaMain];
      // Ce que RoomPlan dit de chaque pièce d'abord, le mobilier ensuite.
      const categoriesDe = (i: number) =>
        objects.filter((o) => o.roomId === idPiece(i) && voteDansLaPiece(o, shapes[i].outline)).map((o) => o.category);
      const kinds = shapes.map((sh, i) =>
        deduireLaPiece(
          (r.sections ?? [])
            .filter((x) => sh.outline.length >= 3 && pointInPolygon(placer({ x: x.x, z: x.z }), sh.outline))
            .map((x) => x.label),
          categoriesDe(i),
        ),
      );
      openings = lesPortesDeGarage(openings, nommerLesGarages(kinds, contours, categoriesDe, openings, walls));
      const auto = nameRooms(kinds, shapes.map((s) => s.outline));
      // Les noms donnés à la main survivent au second passage : on rattache
      // chaque pièce neuve à l'ancienne dont le cartouche tombe dedans.
      const anciennes = roomParts(jeu.walls, jeu.rooms);
      const kept: RoomEntry[] = shapes.map((sh, i) => {
        const avant = anciennes.find((pa) =>
          pointInPolygon(pa.labelAt, sh.outline),
        );
        const garde = avant
          ? jeu.rooms.find((x) => x.id === avant.roomId)
          : undefined;
        // Le plafond relevé par ce passage (dans le repère de l'iPhone), ou
        // celui du passage d'avant.
        const brut = sh.outline.map(versLeBrut);
        const sesMurs = walls
          .filter((w) => sh.wallIds.includes(w.id))
          .map((w) => ({ a: versLeBrut(w.a), b: versLeBrut(w.b), height: w.height }));
        const releve = releveDeLaPiece(r, brut, sh.area, sesMurs) ?? garde?.releve;
        return {
          id: idPiece(i),
          name: garde?.name || auto[i],
          wallIds: sh.wallIds,
          kind: kinds[i] ?? undefined,
          floor,
          ...(n === NIVEAU_RDC ? {} : { niveau: n }),
          ...(releve ? { releve } : {}),
        };
      });
      // Un nom gardé et un nom deviné peuvent se croiser : voir `sansNomEnDouble`.
      sansNomEnDouble(kept);
      /*
        LE PLAFOND SUIT SA PIÈCE, par la position de son ancrage : les
        identifiants de pièce sont refaits à neuf.
      */
      const ceiling = jeu.ceiling.map((cl) => ({
        ...cl,
        roomId: idPiece(roomIndexAt(cl.at, contours)),
      }));

      /* Ce que le viseur a posé PENDANT ce passage vient s'ajouter. */
      const viseMerge = ancrerElec(
        (r.elec ?? []).map((v) => ({ ...v, ...placer({ x: v.x, z: v.z }) })),
        walls,
        kept.map((x, i) => ({ id: x.id, outline: shapes[i]?.outline })),
        (prefixe, k) => `${prefixe}-${Date.now().toString(36)}-${k}`,
      );

      // Le blanc remis d'aplomb, une fois pour toutes : voir
      // `blancsDAplomb`. Tout ce qui lit ces champs — 3D, plan, dossier,
      // export — voit désormais la même chose.
      const aplomb = blancsDAplomb(walls, objects);
      set({
        modelPath: r.modelPath ?? st.modelPath,
        rooms: remplacer(st.rooms, jeu.rooms, kept),
        walls: remplacer(st.walls, jeu.walls, aplomb.walls),
        objects: remplacer(st.objects, jeu.objects, aplomb.objects),
        openings: remplacer(st.openings, jeu.openings, openings),
        fixtures: remplacer(st.fixtures, jeu.fixtures, [...fixtures, ...viseMerge.fixtures]),
        // Les photos de mur du scan sont refaites : la fusion a pu recoudre
        // les murs, et le natif les a gardées toutes, passage après passage.
        photos: remplacer(st.photos, jeu.photos, [
          ...photos.filter((ph) => !ph.auto),
          ...photosDesMurs(r.photosMurs ?? [], surfaces, walls, { decalage: { dx, dz, angle } }),
        ]),
        ceiling: remplacer(st.ceiling, jeu.ceiling, [...ceiling, ...viseMerge.ceiling]),
        north: typeof r.north === 'number' ? r.north : st.north,
        processing: false,
        scanning: false,
        screen: 'result',
        dirty: true,
      });
    },

    /*
      LE TABLEAU EXISTANT — il naît du premier départ noté.

      Pas de structure vide posée d'avance : sa seule présence commande la
      feuille « installation existante » du dossier, et un chantier neuf
      n'a rien à en dire. Elle apparaît quand on ouvre un tableau, pas
      quand on ouvre l'application.
    */

    ajouterDepart: (d) => {
      const id = `dep-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 5)}`;
      const ex = get().existant;
      set({
        existant: rangerLeTableau({
          ...(ex ?? { departs: [] }),
          departs: [...(ex?.departs ?? []), { ...d, id }],
        }),
        dirty: true,
      });
      return id;
    },

    modifierDepart: (id, champs) => {
      const ex = get().existant;
      if (!ex) return;
      set({
        existant: rangerLeTableau({
          ...ex,
          departs: ex.departs.map((d) =>
            d.id === id ? { ...d, ...champs, id } : d,
          ),
        }),
        dirty: true,
      });
    },

    retirerDepart: (id) => {
      const ex = get().existant;
      if (!ex) return;
      set({
        existant: rangerLeTableau({ ...ex, departs: ex.departs.filter((d) => d.id !== id) }),
        dirty: true,
      });
    },

    deplacerDepart: (id, vers) => {
      const ex = get().existant;
      if (!ex) return;
      const ici = ex.departs.find((d) => d.id === id);
      if (!ici) return;
      let departs = ex.departs;
      if (typeof vers.rangee === 'number' && vers.rangee !== ici.rangee) {
        // Une autre rangée : il s'y clipse à la suite, s'il y a la place.
        const autres = departs.filter((d) => d.id !== id);
        departs = [...autres, { ...ici, rangee: vers.rangee }];
        if (implanter({ ...ex, departs }).horsRail.some((d) => d.id === id)) return;
      } else if (vers.pas) {
        // Dans sa rangée : il échange sa place avec son voisin.
        const memes = departs.filter((d) => d.rangee === ici.rangee);
        const k = memes.findIndex((d) => d.id === id);
        const voisin = memes[k + vers.pas];
        if (!voisin) return;
        const i = departs.indexOf(ici);
        const j = departs.indexOf(voisin);
        departs = [...departs];
        departs[i] = voisin;
        departs[j] = ici;
      } else return;
      set({ existant: rangerLeTableau({ ...ex, departs }), dirty: true });
    },

    decrireTableau: (t) => {
      const ex = get().existant;
      set({
        existant: rangerLeTableau({ ...(ex ?? { departs: [] }), ...t }),
        dirty: true,
      });
    },

    constituerLeTableau: (t) => {
      // La garde AVANT le point de reprise : voir `annulerunefois`.
      if (get().existant) return;
      pushHistory('constituerLeTableau');
      const graine = Date.now().toString(36);
      set({
        existant: {
          ...rangerLeTableau({
            ...t,
            departs: t.departs.map((d, i) => ({
              ...d,
              id: `dep-${graine}-${i.toString(36)}${Math.random().toString(36).slice(2, 4)}`,
            })),
          }),
          // Déduit du plan : la feuille le dit (voir `TableauExistant.projete`).
          projete: true,
        },
        dirty: true,
      });
    },

    confirmerLeReleve: () => {
      const ex = get().existant;
      if (!ex?.projete) return;
      pushHistory('confirmerLeReleve');
      const releve = { ...ex };
      delete releve.projete;
      set({ existant: releve, dirty: true });
    },

    retirerLaRangee: (k) => {
      const ex = get().existant;
      if (!ex) return;
      const apres = sansLaRangee(ex, k);
      // La garde AVANT le point de reprise : voir `annulerunefois`.
      if (apres === ex) return;
      pushHistory('retirerLaRangee');
      set({ existant: rangerLeTableau(apres), dirty: true });
    },

    viderLeTableau: () => {
      const ex = get().existant;
      if (!ex || ex.departs.length === 0) return;
      pushHistory('viderLeTableau');
      set({
        existant: { departs: [], ...(ex.rangees ? { rangees: ex.rangees } : {}), ...(ex.parRangee ? { parRangee: ex.parRangee } : {}) },
        dirty: true,
      });
    },

    niveauCourant: NIVEAU_RDC,
    etageEnCours: null,
    allerAuNiveau: (n) => set({ niveauCourant: n }),
    scannerUnEtage: (n) => set({ etageEnCours: n, complementEnCours: false }),

    recalerNiveau: (n, dx, dz) => {
      const st = get();
      if (dx === 0 && dz === 0) return;
      pushHistory(`recalerNiveau:${n}`);
      /*
        LES PASSAGES DE L'IPHONE SUIVENT LEUR ÉTAGE — revue « Nadia » : un
        étage interrompu, recalé, puis complété, voyait sa pièce de plus
        tomber à l'ancienne place : « L'iPhone n'avait plus les passages ».
      */
      const pn = st.passagesNatifs;
      if (pn && pn.niveau === n) set({ passagesNatifs: { ...pn, dx: pn.dx + dx, dz: pn.dz + dz } });
      const bouge = (p: Pt) => ({ x: p.x + dx, z: p.z + dz });
      const auNiveau = (w: WallSeg) => niveauDe(w) === n;
      const idsDuNiveau = new Set(
        st.walls.filter(auNiveau).map((w) => w.id),
      );
      set({
        walls: deplacerNiveau(st.walls, n, dx, dz),
        openings: deplacerNiveau(st.openings, n, dx, dz),
        // Le mobilier suit sa pièce, et le plafond son ancrage : tout ce qui
        // vit à cet étage voyage avec lui, sinon on recalerait les murs en
        // laissant les meubles vingt mètres plus loin.
        objects: st.objects.map((o) => {
          const piece = st.rooms.find((r) => r.id === o.roomId);
          if (!piece || niveauDe(piece) !== n) return o;
          const t = [...o.transform];
          t[12] += dx;
          t[14] += dz;
          return { ...o, transform: t };
        }),
        ceiling: st.ceiling.map((cl) => {
          const piece = st.rooms.find((r) => r.id === cl.roomId);
          return piece && niveauDe(piece) === n
            ? avecSaTrace(cl, bouge)
            : cl;
        }),
        /*
          LES NOTES SUIVENT LEUR ÉTAGE. Elles portent leur niveau en propre
          (voir `filtrerAuNiveau`), et le recalage les oubliait : on posait
          l'étage sur le filigrane, et « arrivée gaz » restait dans le vide,
          à la place qu'avait la cuisine avant le recalage.
        */
        notes: st.notes.map((x) => (niveauDe(x) === n ? { ...x, at: bouge(x.at) } : x)),
        mesures: st.mesures.map((x) => (niveauDe(x) === n ? { ...x, a: bouge(x.a), b: bouge(x.b) } : x)),
        dirty: true,
      });
      // L'appareillage et les photos tiennent à un mur par une cote le long
      // de ce mur : le mur bouge, elles bougent avec lui sans rien à faire.
      void idsDuNiveau;
    },

    tournerNiveau: (n, angle) => {
      if (!sontFinis(angle) || angle === 0) return;
      const st = get();
      const c = centreDuNiveau(st.walls, n);
      if (!c) return;
      pushHistory(`recalerNiveau:${n}`);
      const cs = Math.cos(angle);
      const sn = Math.sin(angle);
      const tourne = (p: Pt) => pivoterPoint(p, c, angle);
      // Les passages de l'iPhone tournent avec leur étage (voir `recalerNiveau`).
      const pn = st.passagesNatifs;
      if (pn && pn.niveau === n) {
        const d = tourne({ x: pn.dx, z: pn.dz });
        set({ passagesNatifs: { ...pn, dx: d.x, dz: d.z, angle: (pn.angle ?? 0) + angle } });
      }
      const dansLeNiveau = (roomId?: string) => {
        const piece = st.rooms.find((r) => r.id === roomId);
        return !!piece && niveauDe(piece) === n;
      };
      set({
        walls: pivoterNiveau(st.walls, n, c, angle),
        openings: pivoterNiveau(st.openings, n, c, angle),
        objects: st.objects.map((o) => {
          if (!dansLeNiveau(o.roomId)) return o;
          const t = [...o.transform];
          // Les trois axes du meuble tournent avec lui, puis sa place.
          for (const k of [0, 4, 8]) {
            const x = t[k];
            const z = t[k + 2];
            t[k] = x * cs - z * sn;
            t[k + 2] = x * sn + z * cs;
          }
          const p = tourne({ x: t[12], z: t[14] });
          t[12] = p.x;
          t[14] = p.z;
          return { ...o, transform: t };
        }),
        ceiling: st.ceiling.map((cl) =>
          dansLeNiveau(cl.roomId) ? avecSaTrace(cl, tourne) : cl,
        ),
        notes: st.notes.map((x) => (niveauDe(x) === n ? { ...x, at: tourne(x.at) } : x)),
        mesures: st.mesures.map((x) => (niveauDe(x) === n ? { ...x, a: tourne(x.a), b: tourne(x.b) } : x)),
        dirty: true,
      });
    },

    /*
      RETIRER UN ÉTAGE — relevé du patron : « rien ne peut se séparer ».

      Le menu savait en ajouter et les recaler, jamais en retirer. Or c'est
      le relevé qu'on rate le plus souvent : on monte un escalier, on scanne
      trois murs de travers, et le dossier entier est bon à refaire.

      Ce qui part avec lui n'est pas une liste écrite à la main : c'est ce
      que le FILTRE désigne — le même que celui du plan, de la 3D et du
      dossier. Un étage, c'est exactement ce qu'on voit quand on le regarde ;
      le retirer, c'est retirer cela.

      Le DERNIER niveau ne se retire pas. Un dossier sans un seul mur n'est
      pas un dossier, c'est un plan vierge, et cela se demande autrement.
    */
    retirerNiveau: (n) => {
      const st = get();
      const restants = niveauxPresents(st.walls, st.rooms).filter((x) => x !== n);
      if (restants.length === 0) return;
      const aGarder = <T extends { niveau?: number }>(xs: T[]) =>
        xs.filter((x) => niveauDe(x) !== n);
      const mursGardes = aGarder(st.walls);
      const idsMurs = new Set(mursGardes.map((w) => w.id));
      const piecesGardees = aGarder(st.rooms);
      const idsPieces = new Set(piecesGardees.map((r) => r.id));
      pushHistory(`retirerNiveau:${n}`);
      set({
        walls: mursGardes,
        rooms: piecesGardees,
        openings: aGarder(st.openings),
        notes: aGarder(st.notes),
        mesures: aGarder(st.mesures),
        // Ce qui tient à un mur s'en va avec lui ; ce qui tient à une pièce
        // aussi. Aucun orphelin : un appareil sans mur ne se dessine nulle
        // part et fausse le métré en silence.
        fixtures: st.fixtures.filter((f) => idsMurs.has(f.wallId)),
        photos: st.photos.filter((ph) => idsMurs.has(ph.wallId)),
        objects: st.objects.filter((o) => idsPieces.has(o.roomId ?? '')),
        ceiling: st.ceiling.filter((cl) => idsPieces.has(cl.roomId)),
        // On ne reste pas sur un étage qui n'existe plus : on redescend au
        // plus proche de ce qui reste, en dessous de préférence.
        niveauCourant:
          st.niveauCourant === n
            ? restants.reduce((meilleur, x) =>
                Math.abs(x - n) < Math.abs(meilleur - n) ||
                (Math.abs(x - n) === Math.abs(meilleur - n) && x < meilleur)
                  ? x
                  : meilleur,
              )
            : st.niveauCourant,
        dirty: true,
      });
    },

    /*
      L'ÉTAGE S'EMPILE, IL NE REMPLACE RIEN.

      « Compléter le relevé » repasse un scan et FUSIONNE avec l'existant :
      ce sont les mêmes murs, vus une seconde fois. Un étage, c'est le
      contraire — d'autres murs, d'autres pièces, et rien à fusionner. On
      ajoute donc, en estampillant le niveau, sans toucher à ce qui est en
      bas.

      Deux précautions qui viennent du terrain :

      — les identifiants de pièce portent le niveau (`room-1-3`). Détectés
        séparément, les deux étages produisaient chacun un « room-1 » : le
        meuble du salon se rattachait à la chambre du dessus, et le métré
        comptait deux fois la même pièce.

      — l'étage est PRÉ-CALÉ sur celui du dessous. ARKit repart de l'endroit
        où l'on a appuyé sur « Scanner » : après l'escalier, le relevé du
        haut tombe à vingt mètres de celui du bas. On aligne les emprises
        pour partir d'un empilement plausible ; le recalage fin se fait
        ensuite à la main, sur le filigrane.
    */
    finalizeEtage: (r, n) => empilerUnReleve(r, n, false),

    finalize: (r) => {
      // Le scan est d'un seul tenant : une liste de surfaces, une liste de
      // meubles. Les pièces, on les trouve nous-mêmes.
      const surfaces = r.rooms?.length
        ? r.rooms.flatMap((x) => x.surfaces ?? [])
        : r.surfaces ?? [];
      const incomingObjects = r.rooms?.length
        ? r.rooms.flatMap((x) => x.objects ?? [])
        : r.objects ?? [];
      const floor = r.floor ?? r.rooms?.[0]?.floor ?? null;

      // Le coffre de volet, que RoomPlan lisse, relu dans le maillage LiDAR ;
      // et l'encadrement réel de chaque baie (voir `geometry/logique`).
      // Les façades de placard, que RoomPlan range parmi les portes : voir
      // `facadesDePlacard`.
      const placards = facadesDePlacard(
        avecLesBordsDuLidar(avecCoffresDuLidar(surfaces.map((s) => toSegment(s)), r.dessus), r.dessus, r.tableaux),
        incomingObjects,
      );
      const segments = placards.segments;
      // Souder les coins, COUPER les murs là où une cloison vient buter
      // (sans ça aucun cycle ne passe par elle et tout l'appartement ressort
      // en une seule pièce), recoller les morceaux alignés, PUIS chercher les
      // pièces : le graphe doit être propre avant d'y chercher des faces.
      /*
        LA CLOISON VUE DES DEUX CÔTÉS, AUSSI DANS UN SCAN D'UN SEUL TENANT —
        appartements témoins : RoomPlan rend parfois les deux faces d'une
        cloison, à son épaisseur l'une de l'autre. Seules la fusion et
        l'étage les réunissaient ; ici, les deux pièces ressortaient en une
        seule, ouverte, « deux murs se superposent ».
      */
      const nettoyes = sansEclats(
        mergeColinear(
          splitAtJunctions(joindreLesCoins(epaisseursAccordees(weldCorners(fusionnerMursDoubles(preEquerrage(segments.filter((s) => s.type === 'wall'))))))),
        ),
        [],
      ).walls;
      /*
        LA LOGIQUE DE CONSTRUCTION — relevé du patron : « même si le scan
        repère quelques centimètres de différence, il doit les réaligner ».
        Les murs d'équerre et à la même hauteur, les baies sur leurs niveaux
        communs (voir `geometry/logique`).
      */
      const logique = releveLogique(nettoyes, segments.filter((s) => s.type !== 'wall'));
      // Le refend relevé d'un seul côté : le chemin de la caméra dit lequel
      // (voir `marquerLesFacesVues`, D7).
      const walls = marquerLesFacesVues(logique.walls, trajetDe(r));
      // La baie vitrée que RoomPlan a prise pour une porte (voir `baiesVitrees`),
      // et la porte collée à l'angle, dégagée du mur d'angle (voir
      // `baiesHorsDesAngles`).
      let openings = marquerLesPortes(baiesHorsDesAngles(baiesVitrees(portesVuesOuvertes(logique.openings, walls), walls), walls), r);

      // Détection automatique : les pièces sont les faces du graphe des murs.
      // Si rien ne se referme (scan trop partiel), tout tient en une pièce.
      const detected = detectRooms(walls, undefined, openings);
      const shapes =
        detected.length > 0
          ? detected
          : [{ outline: [], wallIds: walls.map((w) => w.id), area: 0 }];

      // Chaque meuble revient à la pièce qui le contient.
      // À la sortie du scan comme à l'ouverture d'un dossier : deux meubles que
      // la caméra a fait se traverser sont écartés du strict nécessaire.
      // Les sièges regardent la pièce, pas le mur : voir `orienterLesSieges`.
      const objects: ObjectData[] = calerLesMeubles(orienterLesSieges(
        separerLeMobilier(
          // Le canapé d'angle d'abord : séparé, sa méridienne serait repoussée.
          reunirLesCanapesDAngle(sansMeublesEnDouble(incomingObjects.filter((o) => !placards.meublesDuPlacard.has(o.id)))).map((o) => ({
            ...o,
            roomId: `room-${roomIndexAt(
              { x: o.transform[12], z: o.transform[14] },
              shapes.map((s) => s.outline),
            ) + 1}`,
          })),
        ),
        walls,
      ), walls);

      /*
        LE TYPE DE CHAQUE PIÈCE : ce que RoomPlan en dit (iOS 17), puis le
        mobilier — voir `deduireLaPiece`.
      */
      const categoriesDe = (i: number) =>
        objects.filter((o) => o.roomId === `room-${i + 1}` && voteDansLaPiece(o, shapes[i].outline)).map((o) => o.category);
      const kinds = shapes.map((sh, i) =>
        deduireLaPiece(
          (r.sections ?? [])
            .filter((x) => sh.outline.length >= 3 && pointInPolygon({ x: x.x, z: x.z }, sh.outline))
            .map((x) => x.label),
          categoriesDe(i),
        ),
      );
      // Le garage, que ni RoomPlan ni le mobilier ne nomment : voir `porteDeGarage`.
      openings = lesPortesDeGarage(
        openings,
        nommerLesGarages(kinds, shapes.map((s) => s.outline), categoriesDe, openings, walls),
      );
      /* Chaque mur, photographié et redressé pendant le scan. */
      const photosAuto = photosDesMurs(r.photosMurs ?? [], surfaces, walls);
      const names = nommerLesPlacards(nameRooms(kinds, shapes.map((s) => s.outline)), kinds, shapes, walls, openings);
      const kept: RoomEntry[] = shapes.map((s, i) => {
        const releve = releveDeLaPiece(r, s.outline, s.area, walls.filter((w) => s.wallIds.includes(w.id)));
        return {
          id: `room-${i + 1}`,
          name: names[i],
          wallIds: s.wallIds,
          kind: kinds[i] ?? undefined,
          floor,
          ...(releve ? { releve } : {}),
        };
      });

      if (walls.length === 0) {
        // Rien d'exploitable : on montre l'état vide, sans polluer la bibliothèque.
        set({
          modelPath: r.modelPath ?? null,
          scanName: 'Scan vide',
          currentSaveId: null,
          rooms: [],
          walls: [],
          openings: [],
          objects: [],
          fixtures: [],
          photos: [],
          ceiling: [],
          notes: [],
          mesures: [],
          processing: false,
          scanning: false,
          /* Un plan qui s'ouvre repose ses calques. */
          ...CALQUES_DE_BASE,
          screen: 'result',
          // Rien d'exploitable : rien à proposer non plus.
          arrivage: null,
        });
        return;
      }

      /*
        CE QU'ON A POSÉ AU VISEUR PENDANT LE RELEVÉ.

        Le natif n'a rendu que des points du monde — c'est tout ce qu'un
        rayon sait dire. `ancrerElec` les rattache : à leur mur et à leur
        hauteur pour l'appareillage, à la pièce qu'ils surplombent pour les
        points de plafond. Ce qui ne tombe nulle part est jeté plutôt que
        posé au hasard.
      */
      const vise = ancrerElec(
        r.elec ?? [],
        walls,
        kept.map((x, i) => ({ id: x.id, outline: shapes[i]?.outline })),
        (prefixe, n) => `${prefixe}-${Date.now().toString(36)}-${n}`,
      );

      // Sauvegarde automatique : aucun scan terminé ne peut se perdre.
      // C'est ICI que le palier gratuit se consomme — « générer un plan »,
      // c'est en garder un. Un essai jeté avant la fin ne compte pas, et
      // supprimer un relevé ne rend pas le quota.
      useAccountStore.getState().noterPlanCree();
      dejaCompte = true;
      const cle = nouvelleCle();
      const now = new Date();
      const save: SavedScan = {
        cleDuReleve: cle,
        id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        name: defaultName(now, kept),
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
        modelPath: r.modelPath ?? null,
        rooms: kept,
        // Le blanc remis d'aplomb, une fois pour toutes : voir
        // `blancsDAplomb`. Tout ce qui lit ces champs — 3D, plan, dossier,
        // export — voit désormais la même chose.
        ...blancsDAplomb(walls, objects),
        openings,
        fixtures: vise.fixtures,
        photos: photosAuto,
        ceiling: vise.ceiling,
        north: typeof r.north === 'number' ? r.north : undefined,
      };
      const saves = [save, ...get().saves];
      set({
        modelPath: save.modelPath,
        scanName: save.name,
        client: '',
        address: '',
        currentSaveId: save.id,
        dirty: false,
        resultOrigin: 'scan',
        rooms: kept,
        // Le blanc remis d'aplomb, une fois pour toutes : voir
        // `blancsDAplomb`. Tout ce qui lit ces champs — 3D, plan, dossier,
        // export — voit désormais la même chose.
        ...blancsDAplomb(walls, objects),
        openings,
        fixtures: vise.fixtures,
        photos: photosAuto,
        ceiling: vise.ceiling,
        north: typeof r.north === 'number' ? r.north : null,
        saves,
        // Les passages que garde l'iPhone sont ceux de CE relevé, au rez-de-chaussée.
        cleDuReleve: cle,
        passagesNatifs: { cle, niveau: NIVEAU_RDC, dx: 0, dz: 0 },
        piecesEcartees: [],
        processing: false,
        scanning: false,
        /* Un plan qui s'ouvre repose ses calques. */
        ...CALQUES_DE_BASE,
        /*
          LES COULEURS RELEVÉES SE MONTRENT D'EMBLÉE — relevé du patron :
          « récupère la couleur majoritaire d'un mur pour la reconstituer ».
          Plus d'images de décor (jamais qualitatives) : un scan qui a relevé
          la couleur de ses murs ouvre ses couleurs.
        */
        ...(walls.some((w) => !!w.color) ? { showTextures: true } : {}),
        screen: 'result',
        /*
          Le popup de fin de scan demandera quoi intégrer — même sans
          meuble : l'électricité aux normes se propose sur tout relevé. Il
          compte aussi ce qu'on a POSÉ AU VISEUR, pour qu'on sache que
          décocher les normes ne retire rien de ce travail-là.
        */
        arrivage: {
          meubles: objects.length,
          posesViseur: vise.fixtures.length + vise.ceiling.length,
        },
        /*
          LE BROUILLON MEURT AVEC L'ENREGISTREMENT — relevé du chantier :
          « le message de reprise est inutile, on le retrouve dans mes
          scans ». Le filet ne protège que ce qui n'est PAS en bibliothèque ;
          un scan terminé y est. Laisser la carte, c'était proposer de
          reprendre un relevé déjà rangé.
        */
        brouillon: null,
      });
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      clearHistory();
      persistSoon(saves);
      // Un scan terminé est un dossier : il monte comme les autres, sans
      // attendre que le patron pense à toucher « Enregistrer ».
      deposerPlusTard(save.id);
    },

    /**
     * Déplace une extrémité de mur. Les extrémités soudées au même coin
     * (autres murs) suivent, et l'angle snappe à l'horizontale/verticale.
     */
    moveWallPoint: (id, end, p) => {
      const { walls } = get();
      const wall = walls.find((w) => w.id === id);
      if (!wall || !sontFinis(p?.x, p?.z)) return;
      /*
        LA GARDE PASSE AVANT LE POINT DE REPRISE.

        `pushHistory` veut dire « retiens l'état d'avant ». Appelé puis suivi
        d'un renoncement, il laisse dans l'historique un point qui ne
        correspond à AUCUN changement — et au doigt, cela donne : on touche
        « Annuler », il ne se passe rien, on touche une seconde fois, et là
        ça revient en arrière.

        C'est l'un des rares défauts qu'on ne signale jamais, parce qu'on
        croit avoir mal appuyé. Voir `annulerunefois`.
      */
      pushHistory(`move:${id}:${end}`);
      const old = wall[end];
      const fixed = wall[end === 'a' ? 'b' : 'a'];
      // Le magnétisme se règle sur la trame du LOGEMENT, jamais sur les axes
      // du repère ARKit — ceux-ci dépendent de l'endroit où le scan a
      // commencé, et le magnétisme ne se déclenchait alors que par hasard.
      /*
        SON NIVEAU, ET LUI SEUL — revue « Inès » : changer la longueur d'un
        mur du premier déplaçait le mur du rez-de-chaussée juste en dessous,
        dès que leurs coins se superposaient — ce qui est précisément le but
        du recalage. L'aimant, les voisins entraînés et la trame ne
        regardent que les murs du niveau du mur.
      */
      const memes = walls.filter((w) => niveauDe(w) === niveauDe(wall));
      const frame = planFrameAngle(memes);
      /*
        LA SOUDURE PASSE AVANT TOUT LE RESTE.

        Relevé du chantier : « une facilité pour le joindre à une extrémité
        de mur ». L'aide au doigt alignait PAR AXE — le x d'un bout, le z
        d'un autre — et ne joignait donc jamais rien : le coin se posait à
        l'aplomb de deux extrémités sans en toucher aucune, et le contour
        fuyait par un interstice qu'on ne voit pas à l'écran. Pas de
        contour fermé, pas de surface, pas de métré.

        Un bout de mur à moins de vingt-cinq centimètres, c'est une
        intention : on s'y pose EXACTEMENT, et on ne redresse plus rien
        après — l'équerre déferait la jonction qu'on vient de faire.
      */
      const soudure = soudureAuBout(p, memes, 0.25, old);
      const aligned = soudure ?? snapToNeighbours(p, memes, frame, 0.12, old);
      const snapped = soudure ?? snapAngle(fixed, aligned, 5, frame);
      const room = roomOf(wall);
      /*
        UN MUR DÉTACHÉ SE DÉPLACE SEUL.

        Relevé du chantier : « si j'essaye de prolonger ce retour, c'est le
        long mur qui est impacté ». Les deux comportements sont justes, mais
        pas au même moment — le coin d'une pièce doit entraîner ses murs,
        sinon le contour s'ouvre et la surface disparaît ; un retour qu'on
        allonge ne doit toucher que lui.

        On ne devine pas l'intention, on la lit : « Détacher ce mur » l'a
        dite, et la marque survit jusqu'au raccrochage.
      */
      const seul = wall.libre === true;
      // Raccrocher, c'est ressouder : un bout ramené sur celui d'un autre
      // rend le mur solidaire, sans quoi il resterait libre pour toujours
      // et le contour ne se refermerait jamais vraiment.
      const rendreSolidaire = seul && soudure !== null;
      /*
        CE QUI EST PERCÉ DANS UN MUR SUIT LE MUR — relevé du patron : « les
        ouvrants ne suivent pas la modification lors de mouvements du mur et
        rotations ».

        Pousser une cloison et lui poser un angle emportaient déjà les
        percements ; tirer un coin, non. Or c'est le geste le plus courant
        des trois : il rallonge, raccourcit et fait pivoter en même temps, et
        la porte restait où elle était — dans le vide.

        Chaque mur qui bouge garde donc ses ouvertures à leur cote depuis le
        bout FIXE (`reporterOuverture`), les VOISINS compris : un mur qui
        s'allonge parce qu'on a tiré le coin d'à côté emporte aussi sa
        fenêtre.
      */
      const bouges: { avant: WallSeg; apres: WallSeg; ancre: 'a' | 'b' }[] = [];
      const murs = walls.map((w) => {
        if (w.id === id) {
          const bouge = { ...w, [end]: snapped } as WallSeg;
          bouges.push({ avant: w, apres: bouge, ancre: end === 'a' ? 'b' : 'a' });
          return rendreSolidaire ? { ...bouge, libre: undefined } : bouge;
        }
        if (seul) return w;
        if (niveauDe(w) !== niveauDe(wall)) return w;
        // Seuls les murs de la MÊME pièce suivent le coin : la cloison
        // d'en face garde la sienne, même si les deux se touchent.
        if (roomOf(w) !== room) return w;
        const colle = (pt: { x: number; z: number }) =>
          Math.hypot(pt.x - old.x, pt.z - old.z) < 1e-4;
        if (!colle(w.a) && !colle(w.b)) return w;
        const suivi = {
          ...w,
          a: colle(w.a) ? snapped : w.a,
          b: colle(w.b) ? snapped : w.b,
        } as WallSeg;
        bouges.push({ avant: w, apres: suivi, ancre: colle(w.a) ? 'b' : 'a' });
        return suivi;
      });
      set({
        walls: murs,
        openings: get().openings.map((o) => {
          const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
          const sur =
            niveauDe(o) === niveauDe(wall)
              ? bouges.find((m) => pointOnSeg(mid, m.avant.a, m.avant.b).dist < 0.4)
              : undefined;
          return sur ? reporterOuverture(o, sur.avant, sur.apres, sur.ancre) : o;
        }),
        // Pas de sauvegarde automatique : le bouton d'enregistrement apparaît.
        dirty: true,
      });
    },

    detacherMur: (id) => {
      const st = get();
      const wall = st.walls.find((w) => w.id === id);
      if (!wall || wall.libre) return;
      /*
        RIEN NE BOUGE — on défait seulement la soudure.

        Les murs ne se tiennent pas par une référence mais par leurs
        COORDONNÉES : deux bouts au même endroit sont un coin. Écarter les
        points pour les séparer déplacerait le mur, ce qu'on ne veut à aucun
        prix — un retour se détache pour être allongé, pas pour sauter de
        deux centimètres.

        On pose donc une marque, et c'est `moveWallPoint` qui la lit : un
        mur libre se déplace seul, ses voisins restent où ils sont.
      */
      const colle = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-4;
      const tientAQuelquun = st.walls.some(
        (w) =>
          w.id !== id &&
          (colle(w.a, wall.a) ||
            colle(w.b, wall.a) ||
            colle(w.a, wall.b) ||
            colle(w.b, wall.b)),
      );
      // Un mur seul au monde n'a rien à détacher : ne pas toucher au plan
      // évite une entrée d'historique et un bouton d'enregistrement pour
      // un geste qui n'a rien fait.
      if (!tientAQuelquun) return;
      pushHistory(`detacher:${id}`);
      set({
        walls: st.walls.map((w) => (w.id === id ? { ...w, libre: true } : w)),
        dirty: true,
      });
    },

    moveWall: (id, dx, dz, aimant = true, cle) => {
      if (!sontFinis(dx, dz)) return;
      const st = get();
      const wall = st.walls.find((w) => w.id === id);
      if (!wall || (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9)) return;

      /*
        L'AIMANT RATTRAPE LA MAIN, IL NE LA CONTREDIT PAS.

        Une cloison poussée à trois centimètres de l'aplomb d'une autre est
        une cloison qu'on voulait aligner : le doigt ne fait pas mieux sur un
        écran de six pouces. Au-delà de douze centimètres, c'est un choix —
        et le reprendre serait insupportable.

        On ne regarde que les murs PARALLÈLES dont la projection recouvre la
        nôtre : deux murs alignés bout à bout ne s'aimantent pas, ils se
        suivent déjà.
      */
      const AIMANT = aimant ? 0.12 : 0;
      const A = { x: wall.a.x + dx, z: wall.a.z + dz };
      const B = { x: wall.b.x + dx, z: wall.b.z + dz };
      const lm = Math.hypot(B.x - A.x, B.z - A.z) || 1;
      const um = { x: (B.x - A.x) / lm, z: (B.z - A.z) / lm };
      const n = { x: -um.z, z: um.x };
      let cale = 0;
      let mieux = AIMANT;
      for (const o of st.walls) {
        // L'aimant ne cherche qu'à son niveau : voir `moveWallPoint`.
        if (o.id === id || niveauDe(o) !== niveauDe(wall)) continue;
        const lo = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1;
        const uo = { x: (o.b.x - o.a.x) / lo, z: (o.b.z - o.a.z) / lo };
        if (Math.abs(um.x * uo.z - um.z * uo.x) > 0.05) continue;
        const t = (p: Pt) => (p.x - o.a.x) * uo.x + (p.z - o.a.z) * uo.z;
        const t0 = Math.min(t(A), t(B));
        const t1 = Math.max(t(A), t(B));
        if (t1 < 0.05 || t0 > lo - 0.05) continue;
        const e = (A.x - o.a.x) * n.x + (A.z - o.a.z) * n.z;
        if (Math.abs(e) < mieux) {
          mieux = Math.abs(e);
          cale = -e;
        }
      }
      const ddx = dx + n.x * cale;
      const ddz = dz + n.z * cale;

      /*
        LES VOISINS RESTENT ACCROCHÉS.

        Dans un logement, pousser une cloison ÉTIRE les deux murs qui la
        tiennent. Les laisser où ils étaient ouvrirait le contour, et la
        pièce cesserait d'avoir une surface. On déplace donc TOUT point du
        plan qui coïncidait avec un bout du mur — c'est la même règle que
        pour un coin tiré à la main.
      */
      pushHistory(cle ?? `moveWall:${id}`);
      const colle = (p: Pt, ref: Pt) => Math.hypot(p.x - ref.x, p.z - ref.z) < 1e-4;
      const glisse = (p: Pt) => ({ x: p.x + ddx, z: p.z + ddz });
      const A2 = glisse(wall.a);
      const B2 = glisse(wall.b);
      /*
        LE VOISIN GLISSE LE LONG DE SON PROPRE MUR — revue « Karim » : le
        bout accroché recevait le même déplacement que le mur poussé. Pour
        un angle droit, c'est pareil ; pour un pan coupé ou un mur à 80°, le
        voisin se tordait (la cuisine perdait 0,27 m²). Son bout va là où sa
        propre ligne croise la nouvelle ligne du mur.
      */
      const versLaLigne = (o: WallSeg, p: Pt): Pt => {
        const q = colle(o.a, p) ? o.b : o.a;
        const d1 = { x: p.x - q.x, z: p.z - q.z };
        const d2 = { x: B2.x - A2.x, z: B2.z - A2.z };
        const den = d1.x * d2.z - d1.z * d2.x;
        const l1 = Math.hypot(d1.x, d1.z);
        const l2 = Math.hypot(d2.x, d2.z);
        if (l1 < 1e-9 || l2 < 1e-9 || Math.abs(den) < 1e-6 * l1 * l2) return glisse(p);
        const t = ((A2.x - q.x) * d2.z - (A2.z - q.z) * d2.x) / den;
        return { x: q.x + d1.x * t, z: q.z + d1.z * t };
      };
      /*
        ET LA PIÈCE VOISINE NE SE DÉFORME PAS — revue « Sophie » : décaler
        le mur du fond d'une cuisine accolée sur toute la longueur du séjour
        déplaçait aussi le bout du mur du séjour qui le prolongeait, et le
        séjour devenait un trapèze. Un mur d'une AUTRE pièce qui touche
        seulement le coin ne suit pas ; le mur que partagent les deux pièces
        se coupe là où arrive le mur poussé (ou se prolonge pour lui seul),
        et la voisine garde le sien.
      */
      const piecesDe = (wid: string) =>
        st.rooms.filter((r) => (r.wallIds ?? []).includes(wid) && niveauDe(r) === niveauDe(wall)).map((r) => r.id);
      const miennes = new Set(piecesDe(id));
      const pris = new Set(st.walls.map((w) => w.id));
      const nomLibre = (base: string) => {
        let k = 1;
        while (pris.has(`${base}#${k}`)) k++;
        const nid = `${base}#${k}`;
        pris.add(nid);
        return nid;
      };
      const ajouts: WallSeg[] = [];
      const pourLesPieces = new Map<string, Map<string, string[]>>();
      const ajouter = (roomId: string, apres: string, ids: string[]) => {
        const m = pourLesPieces.get(roomId) ?? new Map<string, string[]>();
        m.set(apres, [...(m.get(apres) ?? [apres]), ...ids]);
        pourLesPieces.set(roomId, m);
      };
      const suivi = (w: WallSeg): WallSeg => {
        if (w.id === id) return { ...w, a: A2, b: B2 };
        if (niveauDe(w) !== niveauDe(wall)) return w;
        const bouts = (['a', 'b'] as const).filter((k) => colle(w[k], wall.a) || colle(w[k], wall.b));
        if (bouts.length !== 1) {
          return bouts.length === 0 ? w : { ...w, a: glisse(w.a), b: glisse(w.b) };
        }
        const k = bouts[0];
        const p = w[k];
        const cible = versLaLigne(w, p);
        if (miennes.size === 0) return { ...w, [k]: cible } as WallSeg;
        const siennes = piecesDe(w.id);
        if (siennes.length === 0) return { ...w, [k]: cible } as WallSeg;
        const communes = siennes.filter((r) => miennes.has(r));
        const autres = siennes.filter((r) => !miennes.has(r));
        if (communes.length === 0) return w;
        if (autres.length === 0) return { ...w, [k]: cible } as WallSeg;
        // Partagé : la voisine garde son mur entier.
        const q = k === 'a' ? w.b : w.a;
        const L = Math.hypot(p.x - q.x, p.z - q.z);
        if (L < 1e-9) return w;
        const s = ((cible.x - q.x) * (p.x - q.x) + (cible.z - q.z) * (p.z - q.z)) / (L * L);
        const surSaLigne = Math.abs((cible.x - q.x) * (p.z - q.z) - (cible.z - q.z) * (p.x - q.x)) / L < 1e-6;
        if (!surSaLigne || Math.abs(s - 1) < 1e-9) return { ...w, [k]: cible } as WallSeg;
        if (s < 1) {
          const reste: WallSeg = { ...w, id: nomLibre(w.id), a: { ...cible }, b: { ...p } };
          ajouts.push(reste);
          for (const r of autres) ajouter(r, w.id, [reste.id]);
          return { ...w, [k]: cible } as WallSeg;
        }
        const prolongement: WallSeg = { ...w, id: nomLibre(w.id), a: { ...p }, b: { ...cible } };
        ajouts.push(prolongement);
        for (const r of communes) ajouter(r, w.id, [prolongement.id]);
        return w;
      };
      const murs = st.walls.map(suivi);
      set({
        walls: [...murs, ...ajouts],
        rooms:
          pourLesPieces.size === 0
            ? st.rooms
            : st.rooms.map((r) => {
                const m = pourLesPieces.get(r.id);
                return m && r.wallIds ? { ...r, wallIds: r.wallIds.flatMap((x) => m.get(x) ?? [x]) } : r;
              }),
        // Ce qui est PERCÉ dans ce mur voyage avec lui : une baie restée en
        // arrière serait une baie dans le vide.
        openings: st.openings.map((o) => {
          const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
          return niveauDe(o) === niveauDe(wall) && pointOnSeg(mid, wall.a, wall.b).dist < 0.4
            ? { ...o, a: glisse(o.a), b: glisse(o.b) }
            : o;
        }),
        dirty: true,
      });
    },

    /*
      L'ANGLE SE POSE, IL NE S'ACCUMULE PAS.

      Relevé du chantier : « la rotation ne suit pas bien le mouvement ».
      Le geste envoyait des petits pas — un demi-degré, parfois moins — et
      CHACUN était re-collé aux crans de quinze degrés avant d'être appliqué,
      le pas suivant repartant du cran atteint. Deux conséquences : le mur
      restait scotché à l'équerre pendant que le doigt s'en éloignait, et
      cent arrondis successifs le faisaient dériver.

      On pose donc l'angle voulu, d'un seul coup, tel quel. L'accroche
      appartient au geste, qui la décide UNE FOIS sur l'angle absolu —
      voir `angleAimante`. Et le pivot reste le milieu : autour d'un bout,
      l'autre extrémité part au loin et l'on ne vise plus rien.
    */
    setWallAngle: (id, deg) => {
      const st = get();
      const wall = st.walls.find((w) => w.id === id);
      if (!wall || !Number.isFinite(deg)) return;
      const centre = {
        x: (wall.a.x + wall.b.x) / 2,
        z: (wall.a.z + wall.b.z) / 2,
      };
      const actuel =
        (Math.atan2(wall.b.z - wall.a.z, wall.b.x - wall.a.x) * 180) / Math.PI;
      // Le chemin le plus court : poser 359° après 1° ne fait pas faire un
      // tour complet au mur.
      const ecart = ((deg - actuel + 540) % 360) - 180;
      if (Math.abs(ecart) < 1e-6) return;
      const rot = (ecart * Math.PI) / 180;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const tourne = (p: Pt) => {
        const x = p.x - centre.x;
        const z = p.z - centre.z;
        return {
          x: centre.x + x * cos - z * sin,
          z: centre.z + x * sin + z * cos,
        };
      };
      const na = tourne(wall.a);
      const nb = tourne(wall.b);
      pushHistory(`setWallAngle:${id}`);
      const colle = (p: Pt, ref: Pt) => Math.hypot(p.x - ref.x, p.z - ref.z) < 1e-4;
      // Un angle tapé hors de l'équerre est voulu : « Redresser » le garde.
      const reste = ((deg % 90) + 90) % 90;
      const dEquerre = Math.min(reste, 90 - reste) < 1e-6;
      set({
        walls: st.walls.map((w) => {
          if (w.id === id) {
            const neuf: WallSeg = { ...w, a: na, b: nb };
            if (dEquerre) delete neuf.angleVoulu;
            else neuf.angleVoulu = true;
            return neuf;
          }
          if (niveauDe(w) !== niveauDe(wall)) return w;
          // Les voisins suivent le bout auquel ils sont soudés : le contour
          // reste fermé, quitte à ce qu'ils s'allongent ou raccourcissent.
          const suit = (p: Pt) =>
            colle(p, wall.a) ? na : colle(p, wall.b) ? nb : p;
          return { ...w, a: suit(w.a), b: suit(w.b) };
        }),
        openings: st.openings.map((o) => {
          const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
          return niveauDe(o) === niveauDe(wall) && pointOnSeg(mid, wall.a, wall.b).dist < 0.4
            ? { ...o, a: tourne(o.a), b: tourne(o.b) }
            : o;
        }),
        dirty: true,
      });
    },

    /** Donne au mur la longueur tapée : voir plus bas. */
    setWallLength: (id, length, opts) => {
      if (!sontFinis(length)) return;
      const st = get();
      const wall = st.walls.find((w) => w.id === id);
      if (!wall || length <= 0) return;
      /*
        LA COTE TAPÉE SE LIT SUR LA COTE AFFICHÉE — revue « Nadia » : le
        champ se pré-remplit de `longueurCotee` (intérieure sur un mur
        dessiné, ET sur un mur scanné dont la pièce se compte au nu), mais
        l'écart n'était repris que pour un mur dessiné. Sur un mur scanné,
        4,93 lu à l'intérieur s'appliquait comme 4,93 à l'axe : sept
        centimètres de faux. Quel que soit le mur, la différence entre l'axe
        et la cote affichée s'ajoute à ce qu'on a tapé.
      */
      if (opts) {
        const jeu = jeuDuNiveau(st, niveauDe(wall));
        length += segLength(wall) - longueurCotee(jeu.walls, wall, roomParts(jeu.walls, jeu.rooms));
      }
      /*
        NEUF CENT QUATRE-VINGT-DIX-NEUF MÈTRES.

        La saisie acceptait n'importe quel nombre : un doigt qui tape
        « 999 » au lieu de « 9,99 » — deux touches d'écart — envoyait un mur
        à un kilomètre, et tout le plan devenait un point à l'écran sans
        qu'on comprenne ce qu'on venait de faire. Le minimum était déjà
        borné plus bas (soixante centimètres) ; il manquait l'autre bout.

        Soixante mètres : trois fois la façade d'une maison, bien au-delà du
        plus grand hangar qu'on relèvera avec un téléphone. Au-delà, ce
        n'est plus une cote, c'est une faute de frappe.
      */
      length = Math.min(length, MUR_MAX_M);
      const cur = segLength(wall);
      if (cur < 1e-6) return;
      /*
        LE COIN DE GAUCHE — OU DU HAUT — NE BOUGE PAS. Revue « Hugo » : le
        bout qui bougeait était celui où le tracé finissait, donc le droit
        sur le mur du haut et le gauche sur le mur du bas. Comme « Cotes »
        de la pièce, le mur grandit vers la droite, ou vers le bas.
      */
      const horizontal = Math.abs(wall.b.x - wall.a.x) >= Math.abs(wall.b.z - wall.a.z);
      const aBouge = horizontal ? wall.a.x > wall.b.x : wall.a.z > wall.b.z;
      const fixe = aBouge ? wall.b : wall.a;
      const mobile = aBouge ? wall.a : wall.b;
      const u = { x: (mobile.x - fixe.x) / cur, z: (mobile.z - fixe.z) / cur };
      const delta = length - cur;
      if (Math.abs(delta) < 1e-6) return;
      /*
        LA COTE TAPÉE N'EST PAS AIMANTÉE, ET LA PIÈCE RESTE D'ÉQUERRE —
        revue « Hugo » : 6,05, 6,10, 5,92 redevenaient 6,00 (l'aimant du
        doigt, à vingt-cinq centimètres, s'appliquait à ce qu'on avait
        TAPÉ), et au-delà le mur d'en bout pivotait autour de son autre
        coin : la pièce n'était plus un rectangle, et « Cotes » disparaissait.

        Le mur d'en bout se DÉCALE de toute la différence, comme « Décaler »,
        et ce qui lui est accroché suit. Rien au bout : le bout libre
        s'allonge seul, exactement.
      */
      const n = niveauDe(wall);
      const colle = (q: Pt) => Math.hypot(q.x - mobile.x, q.z - mobile.z) < 1e-3;
      const auBout = st.walls.find((w) => {
        if (w.id === id || w.type !== 'wall' || niveauDe(w) !== n) return false;
        if (!colle(w.a) && !colle(w.b)) return false;
        const lw = segLength(w) || 1;
        const v = { x: (w.b.x - w.a.x) / lw, z: (w.b.z - w.a.z) / lw };
        // Un prolongement dans l'alignement n'est pas un mur d'en bout.
        return Math.abs(u.x * v.z - u.z * v.x) > 0.5;
      });
      /*
        TOUTE LA LIGNE DU MUR D'EN BOUT SE DÉCALE — revue « Nadia » : sur
        l'exemple, 4,93 tapé au mur nord du séjour ne poussait que le premier
        tronçon du refend (de 0 à 3,60) ; le suivant partait en oblique de
        (4,93 ; 3,60) à (5,00 ; 4,20), la chambre s'élargissait en trapèze et
        un bout de mur de 7 cm naissait au pied. Un refend coupé aux
        jonctions reste UN mur : ses tronçons alignés et reliés bout à bout
        glissent ensemble, et chaque mur accroché à l'un de leurs bouts suit
        le long de sa propre ligne.
      */
      if (auBout) {
        const lb = segLength(auBout) || 1;
        const ub = { x: (auBout.b.x - auBout.a.x) / lb, z: (auBout.b.z - auBout.a.z) / lb };
        const surLaLigne = (q: Pt) => Math.abs((q.x - auBout.a.x) * ub.z - (q.z - auBout.a.z) * ub.x) < 1e-3;
        const memeBout = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-3;
        // Les tronçons alignés, reliés de proche en proche au mur d'en bout.
        const ligne = new Map<string, WallSeg>([[auBout.id, auBout]]);
        for (let grandit = true; grandit; ) {
          grandit = false;
          for (const w of st.walls) {
            if (ligne.has(w.id) || w.type !== 'wall' || niveauDe(w) !== n) continue;
            if (!surLaLigne(w.a) || !surLaLigne(w.b)) continue;
            const relie = [...ligne.values()].some(
              (l) => memeBout(w.a, l.a) || memeBout(w.a, l.b) || memeBout(w.b, l.a) || memeBout(w.b, l.b),
            );
            if (!relie) continue;
            ligne.set(w.id, w);
            grandit = true;
          }
        }
        if (ligne.size <= 1) {
          get().moveWall(auBout.id, u.x * delta, u.z * delta, false);
          return;
        }
        const dx = u.x * delta;
        const dz = u.z * delta;
        const bouts = [...ligne.values()].flatMap((l) => [l.a, l.b]);
        const surUnBout = (p: Pt) => bouts.some((q) => memeBout(p, q));
        const glisse = (p: Pt) => ({ x: p.x + dx, z: p.z + dz });
        // Le mur accroché glisse le long de SA ligne jusqu'à la nouvelle
        // ligne du refend (même règle que `moveWall`, revue « Karim »).
        const versLaLigne = (w: WallSeg, p: Pt): Pt => {
          const q = memeBout(w.a, p) ? w.b : w.a;
          const d1 = { x: p.x - q.x, z: p.z - q.z };
          const den = d1.x * ub.z - d1.z * ub.x;
          const l1 = Math.hypot(d1.x, d1.z);
          if (l1 < 1e-9 || Math.abs(den) < 1e-6 * l1) return glisse(p);
          const o = glisse(auBout.a);
          const t = ((o.x - q.x) * ub.z - (o.z - q.z) * ub.x) / den;
          return { x: q.x + d1.x * t, z: q.z + d1.z * t };
        };
        // Les pièces de la ligne : un mur d'une autre pièce qui ne fait que
        // toucher un bout ne suit pas (revue « Sophie », `moveWall`).
        const pieces = new Set(
          st.rooms
            .filter((r) => niveauDe(r) === n && (r.wallIds ?? []).some((x) => ligne.has(x)))
            .map((r) => r.id),
        );
        const desPieces = (wid: string) => st.rooms.filter((r) => niveauDe(r) === n && (r.wallIds ?? []).includes(wid));
        pushHistory(`setWallLength:${id}`);
        set({
          walls: st.walls.map((w) => {
            if (ligne.has(w.id)) return { ...w, a: glisse(w.a), b: glisse(w.b) };
            if (niveauDe(w) !== n) return w;
            const aSuit = surUnBout(w.a);
            const bSuit = surUnBout(w.b);
            if (!aSuit && !bSuit) return w;
            const siennes = desPieces(w.id);
            if (pieces.size > 0 && siennes.length > 0 && !siennes.some((r) => pieces.has(r.id))) return w;
            if (aSuit && bSuit) return { ...w, a: glisse(w.a), b: glisse(w.b) };
            return aSuit ? { ...w, a: versLaLigne(w, w.a) } : { ...w, b: versLaLigne(w, w.b) };
          }),
          // Les baies percées dans la ligne voyagent avec elle.
          openings: st.openings.map((o) => {
            if (niveauDe(o) !== n) return o;
            const lo = segLength(o) || 1;
            const parallele = Math.abs(((o.b.x - o.a.x) * ub.z - (o.b.z - o.a.z) * ub.x) / lo) < 0.05;
            const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
            const dedans = [...ligne.values()].some((l) => pointOnSeg(mid, l.a, l.b).dist < 0.4);
            return parallele && dedans ? { ...o, a: glisse(o.a), b: glisse(o.b) } : o;
          }),
          dirty: true,
        });
        return;
      }
      pushHistory(`setWallLength:${id}`);
      const cible = { x: fixe.x + u.x * length, z: fixe.z + u.z * length };
      const apres = { ...wall, [aBouge ? 'a' : 'b']: cible } as WallSeg;
      set({
        walls: st.walls.map((w) => {
          if (w.id === id) return apres;
          if (niveauDe(w) !== n) return w;
          return { ...w, a: colle(w.a) ? cible : w.a, b: colle(w.b) ? cible : w.b };
        }),
        openings: st.openings.map((o) => {
          const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
          return niveauDe(o) === n && pointOnSeg(mid, wall.a, wall.b).dist < 0.4
            ? reporterOuverture(o, wall, apres, aBouge ? 'b' : 'a')
            : o;
        }),
        dirty: true,
      });
    },

    renameCurrent: (name) => {
      // Sans couper un émoji en deux (revue « Hugo »).
      const clean = couperLeNom(name.trim(), NOM_PLAN_MAX);
      if (!clean) return;
      set({ scanName: clean });
      // Le renommage est une action explicite : il s'enregistre seul,
      // sans emporter les modifications de plan en attente.
      const st = get();
      if (st.currentSaveId) {
        const saves = st.saves.map((s) =>
          s.id === st.currentSaveId ? { ...s, name: clean, updatedAt: Date.now() } : s,
        );
        set({ saves });
        persistSoon(saves);
        // Le compte garde le NOM avec le plan : un « Chantier Dupont »
        // renommé ici et resté « Sans titre » au coffre serait introuvable
        // après une réinstallation.
        deposerPlusTard(st.currentSaveId);
      }
    },

    commitCurrent: () => {
      /*
        UN PLAN QUI N'A PAS ENCORE D'ENTRÉE S'EN VOIT CRÉER UNE.

        Trouvé en parcourant l'application comme un utilisateur qui la
        découvre : on choisit « Dessiner un plan », on pose un séjour, on
        touche « Enregistrer »… et rien n'est enregistré. `syncCurrent`
        recopie le plan courant DANS SON entrée de bibliothèque, et un plan
        dessiné n'en a jamais eu — la fonction sortait donc sans rien faire,
        puis le drapeau des modifications s'effaçait quand même.
        L'application affirmait que le travail était sauvé alors qu'il
        n'existait nulle part.

        C'est le défaut le plus cher de cette application — le seul qui
        coûte un déplacement. Seul un scan terminé créait une entrée, parce
        que lui s'auto-enregistre à la fin du relevé ; le plan tracé à la
        main n'avait pas son équivalent.

        ET C'EST ICI QUE LE PALIER GRATUIT SE CONSOMME, exactement pour la
        même raison qu'après un scan : « générer un plan, c'est en garder
        un ». La règle ne dépend pas du chemin — un plan tracé à la main est
        un plan. Un plan VIDE, lui, n'est rien : on ne débite pas l'essai de
        quelqu'un qui a seulement ouvert l'écran.
      */
      const st = get();
      if (!st.currentSaveId) {
        if (st.walls.length === 0) return;
        if (!dejaCompte) {
          useAccountStore.getState().noterPlanCree();
          dejaCompte = true;
        }
        const now = Date.now();
        const save: SavedScan = {
          id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
          name: st.scanName || defaultName(new Date(now)),
          createdAt: now,
          updatedAt: now,
          modelPath: st.modelPath,
          rooms: st.rooms,
          walls: st.walls,
          openings: st.openings,
          objects: st.objects,
          fixtures: st.fixtures,
          photos: st.photos,
          ceiling: st.ceiling,
        notes: st.notes,
        mesures: st.mesures,
          existant: st.existant ?? undefined,
          north: st.north ?? undefined,
          client: st.client || undefined,
          address: st.address || undefined,
          devis: devisDuPlan(st),
        };
        const saves = [save, ...st.saves];
        set({ saves, currentSaveId: save.id, dirty: false });
        persistSoon(saves);
        savedDepth = history.length;
        // Le plan monte au compte comme n'importe quel enregistrement.
        deposerPlusTard(save.id);
        // Enregistré : le brouillon n'a plus rien à protéger — voir plus bas.
        get().ecrireBrouillon();
        return;
      }
      // Le plan rangé pour douze heures n'avait rien coûté : c'est
      // maintenant qu'on le garde, maintenant qu'il compte.
      if (
        !dejaCompte &&
        st.saves.find((x) => x.id === st.currentSaveId)?.supprimeLe
      ) {
        useAccountStore.getState().noterPlanCree();
        dejaCompte = true;
      }
      syncCurrent();
      savedDepth = history.length;
      set({ dirty: false });
      /*
        LE FILET SE REPLIE SUR-LE-CHAMP, pas au prochain tour de minuterie.

        La fenêtre de trente secondes était un piège : on enregistre, on
        ferme l'app — et le brouillon d'AVANT l'enregistrement traîne sur le
        disque. Au prochain démarrage, l'accueil proposait de « reprendre »
        un relevé déjà rangé. `ecrireBrouillon` sait déjà faire : un plan
        enregistré tel quel efface sa clé.
      */
      get().ecrireBrouillon();
    },

    mettreDeCote: () => {
      const st = get();
      if (!st.dirty) return 'rien';
      const now = Date.now();
      const jusqua = now + GARDE_NON_ENREGISTRE_MS;
      const entree = st.currentSaveId
        ? st.saves.find((x) => x.id === st.currentSaveId)
        : undefined;
      let saves: SavedScan[];
      let sorte: 'nouveau' | 'retouche';
      if (!entree) {
        // Un plan vide n'est rien : il n'y a rien à garder.
        if (st.walls.length === 0) return 'rien';
        const neuf: SavedScan = {
          ...contenuCourant(),
          id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
          name: st.scanName || defaultName(new Date(now)),
          createdAt: now,
          updatedAt: now,
          existant: st.existant ?? undefined,
          supprimeLe: jusqua,
        };
        saves = [neuf, ...st.saves];
        set({ currentSaveId: neuf.id });
        sorte = 'nouveau';
      } else if (entree.supprimeLe) {
        /*
          UN PLAN DÉJÀ GARDÉ DOUZE HEURES, ROUVERT PUIS LAISSÉ : il prend ce
          qu'on vient d'y faire, et son délai repart de maintenant — on l'a
          touché, il n'est pas oublié.
        */
        saves = st.saves.map((x) =>
          x.id === entree.id
            ? {
                ...x,
                ...contenuCourant(),
                existant: st.existant ?? undefined,
                updatedAt: now,
                supprimeLe: jusqua,
              }
            : x,
        );
        sorte = 'nouveau';
      } else {
        const plan: ContenuDuPlan = {
          ...contenuCourant(),
          existant: st.existant ?? undefined,
        };
        saves = st.saves.map((x) =>
          x.id === entree.id ? { ...x, retouche: { at: now, jusqua, plan } } : x,
        );
        sorte = 'retouche';
      }
      set({ saves, dirty: false });
      persistSoon(saves);
      savedDepth = history.length;
      // Rangé : le filet des trente secondes n'a plus rien à tenir.
      get().ecrireBrouillon();
      return sorte;
    },

    enregistrerAuto: () => {
      const st = get();
      if (!st.dirty || st.walls.length === 0) return false;
      // L'exemple se visite : on n'en remplit pas la bibliothèque. Renommé,
      // il est devenu le plan de quelqu'un — il s'enregistre alors.
      if (!st.currentSaveId && st.scanName === NOM_EXEMPLE) return false;
      get().commitCurrent();
      return !get().dirty;
    },

    enregistrerRetouche: (id) => {
      const st = get();
      const entree = st.saves.find((x) => x.id === id);
      if (!entree?.retouche) return;
      const plan = entree.retouche.plan;
      const saves = st.saves.map((x) =>
        x.id === id
          ? { ...x, ...plan, retouche: undefined, updatedAt: Date.now() }
          : x,
      );
      set({ saves });
      persistSoon(saves);
      deposerPlusTard(id);
    },

    jeterRetouche: (id) => {
      const st = get();
      if (!st.saves.some((x) => x.id === id && x.retouche)) return;
      const saves = st.saves.map((x) =>
        x.id === id ? { ...x, retouche: undefined } : x,
      );
      set({ saves });
      persistSoon(saves);
    },

    garderLePlan: (id) => {
      const st = get();
      if (!st.saves.some((x) => x.id === id && x.supprimeLe)) return;
      // Garder un plan, c'est en créer un : il compte comme tel.
      useAccountStore.getState().noterPlanCree();
      if (st.currentSaveId === id) dejaCompte = true;
      const saves = st.saves.map((x) =>
        x.id === id ? { ...x, supprimeLe: undefined, updatedAt: Date.now() } : x,
      );
      set({ saves });
      persistSoon(saves);
      deposerPlusTard(id);
    },

    purgerLesEchus: (maintenant = Date.now()) => {
      const st = get();
      // Le plan qu'on a sous les yeux ne s'efface pas sous le doigt.
      const ouvert = st.screen === 'result' ? st.currentSaveId : null;
      const partis = st.saves.filter(
        (x) =>
          (x.id !== ouvert && !!x.supprimeLe && x.supprimeLe <= maintenant) ||
          // La corbeille se vide seule au bout de 30 jours.
          (!!x.corbeille && x.corbeille + CORBEILLE_MS <= maintenant),
      );
      /*
        LES MODIFICATIONS D'UN PLAN ENREGISTRÉ NE S'EFFACENT JAMAIS SEULES —
        revue « Agathe ». Elles partaient au bout de douze heures, sans un
        mot : en mode Électricité, tout ce qui suit le scan en est (les
        prises, les pièces scannées en plus, les étages), et une journée de
        pose s'effaçait entre le vendredi et le lundi. Elles attendent qu'on
        les enregistre ou qu'on les abandonne — c'est tout.
      */
      // `deleteSave` fait aussi le ménage des photos et du modèle 3D.
      for (const x of partis) get().deleteSave(x.id);
      return partis.length;
    },

    /*
      LA NATURE SE CHOISIT A LA POSE, et elle apporte ses cotes.

      Relevé du chantier : « ça devrait proposer directement si on veut une
      porte, une fenêtre, etc. » Le menu du mur posait une baie, toujours, et
      il fallait ensuite quatre gestes — ouvrir le bandeau, entrer dans les
      réglages de la menuiserie, déclarer la nature, recoter — pour obtenir
      une porte. Le plan restait couvert de trous entre-temps.

      Le paramètre est facultatif : `addOpening(mur)` continue de poser une
      baie, comme le geste d'avant.
    */
    addOpening: (wallId, nature = 'opening') => {
      const st = get();
      const wall = st.walls.find((w) => w.id === wallId);
      // Rien à poser : pas d'entrée d'historique non plus, sinon l'annulation
      // suivante ne défait rien et se lit comme un geste raté.
      if (!wall) return;
      const wallLen = segLength(wall);
      if (wallLen < 0.4) return;
      pushHistory('addOpening');
      const cotes = COTES_MENUISERIE[nature];
      // Le mur borne tout : la largeur avec ses deux tableaux, la hauteur
      // avec son allège. Une menuiserie de catalogue sur un mur de placard
      // se rabote, elle ne le perce pas de part en part.
      const len = Math.min(cotes.largeur, wallLen * 0.9);
      const ux = (wall.b.x - wall.a.x) / wallLen;
      const uz = (wall.b.z - wall.a.z) / wallLen;
      const mid = { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 };
      const base = wall.yCenter - wall.height / 2;
      const allege = Math.min(cotes.allege, Math.max(0, wall.height - 0.4));
      const h = Math.min(cotes.hauteur, wall.height - allege);
      const opening: WallSeg = {
        id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: nature,
        roomId: roomOf(wall),
        /*
          À L'ÉTAGE DE SON MUR — revue « Léa » : sans niveau, une fenêtre
          posée au premier se rangeait au rez-de-chaussée, invisible à
          l'étage, déduite des murs du bas dans le métré.
        */
        ...(niveauDe(wall) !== NIVEAU_RDC ? { niveau: niveauDe(wall) } : {}),
        a: { x: mid.x - (ux * len) / 2, z: mid.z - (uz * len) / 2 },
        b: { x: mid.x + (ux * len) / 2, z: mid.z + (uz * len) / 2 },
        height: h,
        yCenter: base + allege + h / 2,
      };
      set({ openings: [...st.openings, opening], dirty: true });
      ouverturePosee = { id: opening.id, reprise: history[history.length - 1] };
      return opening.id;
    },

    coterOuverture: (id, s) => {
      if (!sontFinis(s.largeur, s.hauteur, s.depuis)) return;
      const st = get();
      const o = st.openings.find((x) => x.id === id);
      if (!o) return;
      // Les murs de SON niveau : la cote tombait sur le mur d'un autre étage (revue « Léa »).
      const cote = ouvertureCotee(o, st.walls.filter((w) => niveauDe(w) === niveauDe(o)), s);
      // La garde AVANT le point de reprise : voir `annulerunefois`.
      if (!cote) return;
      // Ses cotes juste après la pose : le même geste (voir `ouverturePosee`).
      const memePose =
        ouverturePosee?.id === id &&
        ouverturePosee.reprise !== undefined &&
        history[history.length - 1] === ouverturePosee.reprise;
      ouverturePosee = null;
      if (!memePose) pushHistory('coterOuverture');
      set({
        openings: st.openings.map((x) => (x.id === id ? { ...x, ...cote } : x)),
        dirty: true,
      });
    },

    toggleDetecteurOuverture: (id) => {
      const st = get();
      if (!st.openings.some((o) => o.id === id)) return;
      pushHistory('detecteurOuverture');
      set({
        openings: st.openings.map((o) => {
          if (o.id !== id) return o;
          const neuf = { ...o };
          if (o.detecteur) delete neuf.detecteur;
          else neuf.detecteur = true;
          return neuf;
        }),
        dirty: true,
      });
    },

    toggleCoffre: (id, hauteur) => {
      const st = get();
      const o = st.openings.find((x) => x.id === id);
      if (!o) return;
      pushHistory('coffre');
      const neuf = hauteur ?? (o.coffre ? undefined : COFFRE_H);
      set({
        openings: st.openings.map((x) =>
          x.id === id ? { ...x, coffre: neuf } : x,
        ),
        dirty: true,
      });
    },

    resizeOpening: (id, width, height) => {
      const st = get();
      const o = st.openings.find((x) => x.id === id);
      if (!o) return;
      pushHistory(`opening:${id}`);
      const len = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1;
      const ux = (o.b.x - o.a.x) / len;
      const uz = (o.b.z - o.a.z) / len;
      const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
      /*
        `Math.max(0.1, Math.min(6, x))` A L'AIR DE BORNER, et ne borne pas ce
        qu'il faut : `Math.min(6, NaN)` vaut NaN, et `Math.max` le propage.
        Deux bornes soigneusement posées, et le seul nombre dont on avait
        vraiment peur passait entre les deux.
      */
      const l =
        width !== undefined && Number.isFinite(width)
          ? Math.max(0.1, Math.min(6, width))
          : len;
      // L'allège ne bouge pas : c'est le linteau qui monte ou descend.
      const base = o.yCenter - o.height / 2;
      /*
        LE LINTEAU NE SORT PAS DU MUR — revue « Malik » : « remonter au niveau
        des autres » aurait porté la fenêtre de la chambre à 3,20 m sur un
        mur de 2,40 m. La baie s'arrête sous le haut du mur qui la porte.
      */
      const { sol: solDuMur, hauteur: hauteurDuMur } = murPorteurDe(o, st.walls.filter((w) => niveauDe(w) === niveauDe(o)));
      const plafondDeBaie = Math.max(0.2, hauteurDuMur - (base - solDuMur));
      const h =
        height !== undefined && Number.isFinite(height)
          ? Math.max(0.2, Math.min(3, plafondDeBaie, height))
          : o.height;
      set({
        openings: st.openings.map((x) =>
          x.id === id
            ? {
                ...x,
                a: { x: mid.x - (ux * l) / 2, z: mid.z - (uz * l) / 2 },
                b: { x: mid.x + (ux * l) / 2, z: mid.z + (uz * l) / 2 },
                height: h,
                yCenter: base + h / 2,
              }
            : x,
        ),
        dirty: true,
      });
    },

    /*
      REPLACER UNE OUVERTURE SUR SON MUR.

      Le bandeau donnait la largeur, la hauteur, le coffre et la fermeture —
      rien pour la BOUGER. Or `resizeOpening` travaille autour du MILIEU :
      élargir une porte l'ouvre symétriquement, elle ne se décale jamais.
      Une porte posée à trente centimètres du bon endroit ne pouvait donc
      que se supprimer et se reposer, en reperdant sa hauteur, son type et
      son coffre.

      ON REÇOIT LA COTE DU BORD, PAS DU MILIEU. Personne ne mesure jusqu'à
      l'axe d'une porte : on mesure jusqu'à son tableau, mètre posé contre
      le mur de refend. Le magasin fait la conversion, une fois, ici.
    */
    moveOpening: (id, bord) => {
      if (!sontFinis(bord)) return;
      const st = get();
      const o = st.openings.find((x) => x.id === id);
      if (!o) return;
      // Le mur porteur : celui dont l'ouverture est le plus près. Sans lui,
      // « depuis le début du mur » n'a pas de sens et on ne bouge rien.
      let mur: WallSeg | null = null;
      let best = Infinity;
      const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
      for (const w of st.walls) {
        if (niveauDe(w) !== niveauDe(o)) continue;
        const d = pointOnSeg(mid, w.a, w.b).dist;
        if (d < best) {
          best = d;
          mur = w;
        }
      }
      if (!mur || best > 0.6) return;
      const L = Math.hypot(mur.b.x - mur.a.x, mur.b.z - mur.a.z);
      const l = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
      if (L <= 0 || l <= 0) return;
      const ux = (mur.b.x - mur.a.x) / L;
      const uz = (mur.b.z - mur.a.z) / L;
      /*
        ELLE RESTE DANS SON MUR.

        Poussée au-delà, une ouverture n'est plus une ouverture : la 3D la
        découpe hors maçonnerie et le métré compte une menuiserie que
        personne ne pourra poser. On s'arrête donc au coin — et le chiffre
        qu'on lit ensuite dit la vérité, ce qu'un refus muet ne ferait pas.
      */
      const d0 = Math.min(Math.max(0, bord), Math.max(0, L - l));
      const c = d0 + l / 2;
      pushHistory(`opening:${id}`);
      set({
        openings: st.openings.map((x) =>
          x.id === id
            ? {
                ...x,
                a: {
                  x: mur!.a.x + ux * (c - l / 2),
                  z: mur!.a.z + uz * (c - l / 2),
                },
                b: {
                  x: mur!.a.x + ux * (c + l / 2),
                  z: mur!.a.z + uz * (c + l / 2),
                },
              }
            : x,
        ),
        dirty: true,
      });
    },

    /*
      LE SENS D'OUVERTURE, CORRIGÉ À LA MAIN.

      Le plan devine le battant, et il se trompe une fois sur deux : une
      porte réelle pivote du côté que le menuisier a choisi. Pour un
      électricien ce n'est pas un détail de trait — l'interrupteur se pose
      du côté de la POIGNÉE, jamais du côté des paumelles, et une porte
      dessinée à l'envers envoie percer derrière le battant.

      DEUX GESTES, PAS UN. Le bord du pivot et la pièce vers laquelle le
      vantail s'ouvre sont deux questions indépendantes ; un bouton unique
      faisant le tour des quatre combinaisons obligerait à appuyer trois
      fois pour revenir à la bonne.
    */
    flipBattant: (id, quoi) => {
      const st = get();
      const o = st.openings.find((x) => x.id === id);
      // Une fenêtre ne dessine pas de battant : un réglage invisible est un
      // réglage qu'on croit raté.
      if (!o || o.type !== 'door') return;
      pushHistory(`battant:${id}:${quoi}`);
      set({
        openings: st.openings.map((x) =>
          x.id === id
            ? quoi === 'pivot'
              ? { ...x, pivot: (x.pivot ?? 'a') === 'a' ? 'b' : 'a' }
              : { ...x, versExterieur: !x.versExterieur }
            : x,
        ),
        dirty: true,
      });
    },

    /*
      L'ALLÈGE, RÉGLÉE À LA MAIN.

      Le plan la COTE déjà — sur l'élévation du mur et sur le jambage gauche
      du dossier — parce que c'est elle qui décide d'une prise sous fenêtre
      ou d'un convecteur. Elle était la seule cote de menuiserie qu'on
      pouvait lire sans pouvoir la corriger : `resizeOpening` la tient
      expressément fixe, ce qui est le bon réflexe quand on retaille une
      baie, et une impasse quand le scan l'a posée dix centimètres trop
      haut.

      ON DÉPLACE, ON NE ROGNE PAS : une fenêtre remontée de dix centimètres
      reste une fenêtre de la même taille. Régler l'allège en mangeant la
      hauteur donnerait deux gestes qui se défont l'un l'autre.
    */
    setAllege: (id, h) => {
      if (!sontFinis(h)) return;
      const st = get();
      const o = st.openings.find((x) => x.id === id);
      // Une porte a le sol pour allège, par définition : un réglage qui ne
      // peut valoir que zéro est un réglage qu'on croit raté.
      if (!o || o.type === 'door') return;
      /*
        ELLE RESTE DANS SON MUR.

        Poussée au-delà, la menuiserie sortirait par le plafond : la 3D la
        découperait hors maçonnerie et le métré compterait une pose
        impossible. On s'arrête au linteau — et le chiffre relu après coup
        dit la vérité, ce qu'un refus muet ne ferait pas.
      */
      const { sol, hauteur: plafond } = murPorteurDe(o, st.walls);
      // `h` se compte DEPUIS LE SOL DU MUR — c'est ce que l'électricien
      // mesure, mètre posé sur le plancher, et pas la cote dans le repère
      // du scan (voir `murPorteurDe`).
      const base =
        sol + Math.min(Math.max(0, h), Math.max(0, plafond - o.height));
      pushHistory(`allege:${id}`);
      set({
        openings: st.openings.map((x) =>
          x.id === id ? { ...x, yCenter: base + x.height / 2 } : x,
        ),
        dirty: true,
      });
    },

    /*
      CE QU'EST UNE OUVERTURE — et pourquoi ça ne s'invente pas.

      Une ouverture posée à la main sortait toujours en BAIE : le bandeau
      donnait sa largeur, sa hauteur, sa position, son coffre, jamais ce
      qu'elle EST. Un plan tracé sans scanner ne comportait donc ni porte ni
      fenêtre, rien que des trous — et les deux réglages qui dépendent de la
      nature (le sens du battant, l'allège) s'offraient à une ouverture qui
      n'y avait pas droit, sans que personne puisse la lui donner.

      LA NATURE COMMANDE LES COTES, donc on les ajuste en la déclarant :

        — une PORTE part du sol. Une porte à soixante centimètres du
          plancher n'existe pas, et garder l'ancienne allège produirait une
          menuiserie qu'aucun contrôle ne rattraperait ;

        — une FENÊTRE a une allège. Posée au sol, elle prend la cote la plus
          courante — 95 cm — plutôt que de rester une baie qui s'appelle
          fenêtre. Celle qui en avait déjà une la garde : c'est un relevé,
          on ne le remplace pas par une valeur de catalogue.
    */
    setOpeningType: (id, type) => {
      const st = get();
      const o = st.openings.find((x) => x.id === id);
      // Une façade de placard « déclarée porte » change de nature, même si
      // son type était déjà « door ».
      if (!o || (o.type === type && !o.placard)) return;
      pushHistory(`nature:${id}`);
      const base = o.yCenter - o.height / 2;
      // Le SOL DU MUR, pas le zéro du repère : voir `murPorteurDe`.
      const { sol, hauteur: plafond } = murPorteurDe(o, st.walls.filter((w) => niveauDe(w) === niveauDe(o)));
      let nouvelleBase = base;
      if (type === 'door') nouvelleBase = sol;
      /*
        UNE PORTE-FENÊTRE RESTE AU SOL — revue « Amandine » : la porte-fenêtre
        que RoomPlan avait prise pour une porte, corrigée en « fenêtre »,
        remontait à 35 cm du sol, posée sur une allège qu'elle n'a pas. Une
        baie de la hauteur d'une porte qui part du sol reste au sol.
      */
      else if (type === 'window' && base - sol < 0.05 && o.height < 1.8) {
        // Bornée au mur : sur un mur bas, une baie haute ne peut pas
        // remonter de 95 cm sans sortir par le plafond.
        nouvelleBase =
          sol + Math.max(0, Math.min(COTES_MENUISERIE.window.allege, plafond - o.height));
      }
      set({
        openings: st.openings.map((x) =>
          x.id === id
            ? {
                ...x,
                type,
                yCenter: nouvelleBase + x.height / 2,
                // Une PORTE déclarée n'est plus un passage qu'on traverse (revue « Camille »).
                ...(type !== 'opening' ? { open: undefined } : {}),
                // Corrigée à la main, ce n'est plus une porte de garage, ni
                // une façade de placard.
                garage: undefined,
                placard: undefined,
              }
            : x,
        ),
        dirty: true,
      });
    },

    removeOpening: (id) => {
      pushHistory('removeOpening');
      set({
        openings: get().openings.filter((o) => o.id !== id),
        dirty: true,
      });
    },

    addObject: (item, x, z) => {
      const st = get();
      pushHistory('addObject');
      const id = `mb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      // Le meuble RETIENT sa pièce dès la pose. Sans ça, il n'appartenait à
      // rien : c'est le point visé qui décidait, à chaque image, des murs
      // qui devaient l'arrêter — et dès que le doigt sortait de la pièce,
      // plus aucun mur ne le retenait. Il traversait donc la cloison au
      // moment précis où on cherchait à l'y plaquer.
      // La pièce du niveau qu'on regarde (revue « Léa » : le lit de l'étage allait au séjour du bas).
      const ici = jeuDuNiveau(st, st.niveauCourant);
      const accueil = roomParts(ici.walls, ici.rooms).find((p) =>
        pointInPolygon({ x, z }, p.surface?.pts ?? []),
      );
      set({
        objects: [
          ...st.objects,
          {
            id,
            category: item.category,
            width: item.w,
            depth: item.d,
            height: item.h,
            roomId: accueil?.roomId,
            // La référence voyage avec le meuble : c'est elle qui
            // spécialise la silhouette 3D et sa matière.
            modele: item.key,
            matiere: item.matiere,
            // Un meuble sur mesure garde le nom qu'on lui a donné.
            ...(item.key === SUR_MESURE ? { nom: item.label } : {}),
            // Sur LE sol du scan, pas sur l'altitude zéro : ARKit place le
            // plancher où il l'a trouvé, souvent un demi-mètre plus bas, et
            // le meuble se retrouvait sinon suspendu en l'air.
            transform: catalogTransform(item, x, z, solDe(ici.walls.length > 0 ? ici.walls : st.walls)),
          },
        ],
        dirty: true,
      });
      /*
        UN MEUBLE POSÉ NE S'EMPILE PAS — revue « Théo » : six appuis brefs
        dans le séjour posaient six meubles au même point, quinze
        chevauchements. S'il y a déjà des meubles dans la pièce, il se range
        aussitôt, comme au lâcher, sous le même « Annuler » que la pose.
      */
      if (accueil && st.objects.some((o) => o.roomId === accueil.roomId)) {
        get().rangerMeuble(id, x, z, undefined, true);
      }
      return id;
    },

    setMeridienne: (id, cote) => {
      const st = get();
      const o = st.objects.find((x) => x.id === id);
      if (!o) return;
      const autres = (o.attributes ?? []).filter((a) => !/^(SofaType|SofaAngle):/i.test(a));
      pushHistory(`meridienne:${id}`);
      set({
        objects: st.objects.map((x) =>
          x.id === id ? { ...x, attributes: [...autres, 'SofaType:lShaped', `SofaAngle:${cote}`] } : x,
        ),
        dirty: true,
      });
    },

    rotateObject: (id, quarts = 1) => {
      pushHistory(`rotate:${id}`);
      set({
        objects: get().objects.map((o) => {
          if (o.id !== id) return o;
          const t = [...o.transform];
          const yaw = Math.atan2(t[2], t[0]) + (Math.PI / 2) * quarts;
          const cos = Math.cos(yaw);
          const sin = Math.sin(yaw);
          t[0] = cos;
          t[2] = sin;
          t[8] = -sin;
          t[10] = cos;
          return { ...o, transform: t };
        }),
        dirty: true,
      });
      /*
        TOURNÉ, IL SE RANGE — revue « Théo » : un canapé plaqué au mur qu'on
        faisait pivoter entrait de 53 à 66 cm dans la maçonnerie. Le quart de
        tour finit comme un glisser, sous la même annulation.
      */
      const o = get().objects.find((x) => x.id === id);
      if (o) get().rangerMeuble(id, o.transform[12], o.transform[14], `rotate:${id}`);
    },

    setObjectYaw: (id, yaw) => {
      if (!sontFinis(yaw)) return;
      pushHistory(`yaw:${id}`);
      set({
        objects: get().objects.map((o) => (o.id === id ? meubleTourne(o, yaw) ?? o : o)),
        dirty: true,
      });
    },

    /**
     * POSE D'UN COUP tout ce que « Normes auto » a calculé.
     *
     * Un seul pas d'historique : c'est UN geste pour l'électricien, même s'il
     * ajoute quinze appareils. Devoir annuler quinze fois serait une punition.
     */
    poserDAuto: (fixtures, ceiling) => {
      if (fixtures.length === 0 && ceiling.length === 0) return;
      pushHistory('normesAuto');
      const st = get();
      set({
        fixtures: [...st.fixtures, ...fixtures],
        ceiling: [...st.ceiling, ...ceiling],
        dirty: true,
      });
    },

    panne: null,
    oublierPanne: () => set({ panne: null }),

    placeRendue: null,
    oublierPlaceRendue: () => set({ placeRendue: null }),

    dupliquerMeuble: (id) => {
      const st = get();
      const obj = st.objects.find((o) => o.id === id);
      if (!obj || !sontFinis(obj.transform[12], obj.transform[14])) return null;
      const yaw = Math.atan2(obj.transform[2], obj.transform[0]);
      const ax = { x: Math.cos(yaw), z: Math.sin(yaw) };
      const az = { x: -Math.sin(yaw), z: Math.cos(yaw) };
      const ici = { x: obj.transform[12], z: obj.transform[14] };
      /*
        À CÔTÉ, PAS PAR-DESSUS — et du côté où il y a la place. On essaie
        à droite, à gauche, devant, derrière, à dix centimètres de jour ;
        la première place qui reste dans la pièce l'emporte. Le rangement
        (`rangerMeuble`) fait ensuite ce qu'il fait au lâcher : le mur
        arrête, les voisins ne se traversent pas.
      */
      const contour = roomParts(st.walls, st.rooms).find((p) => p.roomId === obj.roomId)
        ?.surface?.pts;
      const pas = [
        { d: ax, l: obj.width + 0.1 },
        { d: { x: -ax.x, z: -ax.z }, l: obj.width + 0.1 },
        { d: az, l: obj.depth + 0.1 },
        { d: { x: -az.x, z: -az.z }, l: obj.depth + 0.1 },
      ].map(({ d, l }) => ({ x: ici.x + d.x * l, z: ici.z + d.z * l }));
      const cible =
        pas.find((p) => (contour ? pointInPolygon(p, contour) : true)) ?? pas[0];
      const nouvel = `mb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      // LA CLÉ DU RANGEMENT QUI SUIT : la copie et son rangement ne font
      // qu'UN geste, et « Annuler » les défait d'un seul appui.
      pushHistory(`moveObject:${nouvel}`);
      const t = [...obj.transform];
      t[12] = cible.x;
      t[14] = cible.z;
      set({
        objects: [...st.objects, { ...obj, id: nouvel, transform: t }],
        dirty: true,
      });
      get().rangerMeuble(nouvel, cible.x, cible.z);
      return nouvel;
    },

    removeObject: (id) => {
      pushHistory('removeObject');
      set({ objects: get().objects.filter((o) => o.id !== id), dirty: true });
    },

    /**
     * Déplace un meuble. Les murs l'ARRÊTENT, ils ne l'attirent pas.
     *
     * L'aimant d'avant collait le meuble au mur et lui imposait son angle à
     * chaque déplacement : dans une chambre de 2,44 m, un lit de 1,90 est à
     * portée d'aimant partout — il restait donc collé, toute rotation était
     * effacée, et le meuble semblait revenir à sa place tout seul. Une
     * simple collision fait mieux et sans surprise : on pousse jusqu'au mur,
     * ça s'arrête pile contre le nu.
     */
    setObjectCenter: (id, x, z, auDoigt = false) => {
      /*
        IL N'Y AVAIT AUCUNE GARDE ICI, et c'est le chemin du GLISSEMENT —
        celui qu'on emprunte en traînant un meuble du doigt.

        La poignée calcule le nouveau centre avec `t0[12] + dx` : si la
        matrice d'un meuble n'a pas la longueur attendue — un scan bancal, un
        vieux plan relu —, `t0[12]` vaut `undefined`, et `undefined + dx`
        vaut NaN. Personne ne s'en aperçoit avant le dessin, et le dessin
        emporte l'application.

        ELLE SE POSE AVANT `pushHistory` : un geste refusé qui empile quand
        même un point d'annulation oblige à appuyer deux fois sur « Annuler »
        pour défaire une seule chose — et l'on croit que l'annulation est
        cassée.
      */
      const st = get();
      const obj = st.objects.find((o) => o.id === id);
      if (!obj || !sontFinis(x, z)) return;
      /*
        LA GARDE PASSE AVANT LE POINT DE REPRISE.

        `pushHistory` veut dire « retiens l'état d'avant ». Appelé puis suivi
        d'un renoncement, il laisse dans l'historique un point qui ne
        correspond à AUCUN changement — et au doigt, cela donne : on touche
        « Annuler », il ne se passe rien, on touche une seconde fois, et là
        ça revient en arrière.

        C'est l'un des rares défauts qu'on ne signale jamais, parce qu'on
        croit avoir mal appuyé. Voir `annulerunefois`.
      */
      pushHistory(`moveObject:${id}`);
      /*
        EN LIBRE, LE MAGASIN N'ARBITRE PLUS.

        Relevé du patron : « on doit pouvoir les placer n'importe où, même
        traverser les murs ». Les trois aides d'en dessous — repousser hors
        de la maçonnerie, retourner pour entrer dans une niche, raboter pour
        tenir dans un recoin — sont chacune défendable seule ; ensemble,
        elles font glisser le meuble tout seul sous le doigt.

        Ici on pose où l'on demande, et l'on se contente d'AIMANTER ce qui
        frôle un mur. Dire si la position tient revient à l'écran, qui la
        montre en rouge : c'est lui qui a le doigt sous les yeux.
      */
      if (auDoigt) {
        // Le calcul est celui que la poignée montre pendant le geste : voir
        // `meubleAuDoigt`.
        const pose = meubleAuDoigt(obj, x, z, st.walls);
        set({
          objects: st.objects.map((o) => (o.id === id && pose ? pose : o)),
          dirty: true,
        });
        return;
      }
      /*
        LA FLÈCHE FAIT EXACTEMENT CE QUE FAIT LE DOIGT.

        Relevé du patron, après lui avoir montré la mesure : une commode de
        1,40 m poussée à la flèche dans une alcôve de 1,20 m ressortait
        **rabotée à 1,04 m** — ses cotes changées toutes seules, sans rien
        demander, sur un plan qui sert à commander du meuble. Au doigt, elle
        gardait ses 1,40 m et l'alcôve la repoussait, ce qui est la vérité du
        chantier. « Oui comme le doigt pour les flèches. »

        Les trois aides s'en vont donc du dernier chemin qui les portait :
        `alignToFit` (le quart de tour qui fait entrer), `fitInNook` (le
        rabotage à la place disponible), `hugWall` (le plaquage au nu). Elles
        avaient chacune une bonne raison — et ensemble, elles faisaient un
        meuble qui décide à la place de celui qui le pose.

        Il ne reste qu'une chose, la même pour les deux gestes : `rangerMeuble`.
        Le mur arrête, le contour recadre, les voisins ne se traversent pas.
        Le rabotage réversible qui vivait ici disparaît avec elles : les
        cotes rendues sont TOUJOURS celles du catalogue.
      */
      get().rangerMeuble(id, x, z);
    },

    /*
      LE RANGEMENT AU LÂCHER — LA COLLISION, PAS L'AIMANT.

      Relevé du patron : « peaufine les meubles et sa physique, enlève
      l'attraction mais mets une collision intelligente (pas collé au mur,
      recadré si dépasse de la zone surface, etc) ».

      CE QU'IL Y AVAIT AVANT, ET POURQUOI ÇA NE POUVAIT PAS TENIR. Le geste
      au doigt gardait en mémoire la dernière position valable, et le lâcher
      dans un mur y REVENAIT. Sur le papier c'est raisonnable ; à l'usage, on
      pousse une commode contre un mur, on dépasse de trois centimètres, et
      le meuble saute quarante centimètres en arrière — jusqu'au dernier
      point où il tenait, qui peut dater du milieu du glissement. Le refus
      était juste, la sanction était aveugle.

      UNE COLLISION RÉPOND À LA MÊME QUESTION SANS PUNIR : le mur arrête, il
      ne renvoie pas. Le meuble ressort par le plus court chemin — là où le
      doigt l'a amené — et s'arrête AU CONTACT, dos au nu. C'est aussi ce que
      fait déjà la flèche depuis toujours (`pushOutOfWalls`) : les deux
      chemins se rejoignent enfin, et pour la même raison.

      ON REPREND DONC LA MÉCANIQUE DE LA FLÈCHE, MOINS SES TROIS AIDES.
      Pas d'`alignToFit` (qui fait pivoter), pas de `fitInNook` (qui rabote),
      pas de `hugWall` (qui plaque). Ce sont exactement les aides que le
      patron avait fait retirer du doigt — « elles font glisser le meuble
      tout seul » —, et une collision n'a pas besoin d'elles. Il reste :

        1. le mur, qui arrête ;
        2. le contour de la pièce, qui RECADRE ce qui en dépasse (c'est
           `pushOutOfWalls` qui le fait, en ramenant d'abord le point sur le
           contour : sans cela, un meuble lâché au-delà d'un ANGLE n'est en
           face d'aucun des deux murs et s'échappe par la diagonale) ;
        3. les autres meubles, qui ne se traversent pas — mais qui se
           SUPERPOSENT quand ils sont à des étages différents : une télé se
           pose sur un meuble bas, et l'interdire serait une régression ;
        4. le mur, une seconde fois. Relevé du chantier : « on voit le
           meuble légèrement dépassé de l'autre côté du mur ». La poussée des
           voisins peut renvoyer dans la maçonnerie ce que la première avait
           sorti. Un meuble qui chevauche un voisin se voit ; un meuble qui
           sort du logement ne se pardonne pas.

      Et `aimant = false` sur les voisins : le jour lâché est le jour gardé.

      LA PIÈCE EST CELLE OÙ LE MEUBLE ATTERRIT, pas celle d'où il vient.
      C'est l'inverse de la flèche, et c'est voulu : traverser une cloison
      pour changer une commode de pièce est LE geste que le doigt sait faire.
      Le ranger dans son ancienne pièce le ferait revenir sur ses pas.
    */
    rangerMeuble: (id, x, z, cle, sansHistorique) => {
      /*
        LA MÊME CLÉ QUE LE GLISSEMENT — le lâcher en est la QUEUE, pas un
        geste de plus.

        L'historique fusionne les états d'un geste continu, et il les
        reconnaît à leur clé : `moveObject:o1`. Poussé sous une clé à lui,
        le rangement coûtait une seconde annulation — et la première
        ramenait le meuble là où le doigt l'avait lâché, c'est-à-dire, une
        fois sur deux, DANS un mur. « Annuler » rendait une position que
        l'application refuse elle-même de produire.
      */
      const st = get();
      const obj = st.objects.find((o) => o.id === id);
      if (!obj || !sontFinis(x, z)) return;
      /*
        LA GARDE PASSE AVANT LE POINT DE REPRISE.

        `pushHistory` veut dire « retiens l'état d'avant ». Appelé puis suivi
        d'un renoncement, il laisse dans l'historique un point qui ne
        correspond à AUCUN changement — et au doigt, cela donne : on touche
        « Annuler », il ne se passe rien, on touche une seconde fois, et là
        ça revient en arrière.

        C'est l'un des rares défauts qu'on ne signale jamais, parce qu'on
        croit avoir mal appuyé. Voir `annulerunefois`.
      */
      if (!sansHistorique) pushHistory(cle ?? `moveObject:${id}`);
      const yaw = Math.atan2(obj.transform[2], obj.transform[0]);
      const box = {
        width: obj.baseWidth ?? obj.width,
        depth: obj.baseDepth ?? obj.depth,
        yaw,
      };
      /** D'où il vient : c'est ce qui dit de quel côté chaque mur repousse. */
      const ici = { x: obj.transform[12], z: obj.transform[14] };
      // Le niveau du meuble — celui de sa pièce, à défaut celui qu'on regarde.
      const niveauDuMeuble = niveauDe(st.rooms.find((r) => r.id === obj.roomId)) ?? st.niveauCourant;
      const jeu = jeuDuNiveau(st, st.rooms.some((r) => r.id === obj.roomId) ? niveauDuMeuble : st.niveauCourant);
      const parts = roomParts(jeu.walls, jeu.rooms);
      const dansUnePiece = parts.find((p) => pointInPolygon({ x, z }, p.surface?.pts ?? []));
      /*
        LE RENFONCEMENT QU'AUCUNE PIÈCE NE FERME — relevé du patron : « un
        meuble plus petit qu'une zone, avec la zone où je souhaite
        l'imbriquer, ne veut pas y aller ». La niche n'était dans aucune pièce
        fermée (un mur manquait autour), et le rangement prenait alors la
        pièce d'OÙ VENAIT le meuble : il le ramenait dans son contour, contre
        le mur, du mauvais côté.

        Lâché dans un lieu que des murs entourent — six directions sur huit
        butent sur un mur à moins de trois mètres —, le meuble y RESTE : les
        murs autour l'arrêtent, rien ne le renvoie. Lâché vraiment dehors,
        au-delà d'une façade, il revient dans sa pièce, comme avant.
      */
      const entoure =
        !dansUnePiece &&
        Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4).filter((a) => {
          const d = castToWall({ x, z }, { x: Math.cos(a), z: Math.sin(a) }, jeu.walls);
          return d !== null && d < 3;
        }).length >= 6;
      const part = entoure
        ? undefined
        : dansUnePiece ??
          parts.find((p) => pointInPolygon(ici, p.surface?.pts ?? [])) ??
          parts.find((p) => p.roomId === obj.roomId);
      // Sans pièce reconnue — un plan dont les contours ne se referment pas
      // — les murs arrêtent quand même : c'est le mur qui fait la collision,
      // la pièce ne fait que dire de quel côté.
      const murs = part ? part.walls : jeu.walls;
      /*
        Dans un renfoncement ouvert, c'est le point lâché qui dit le côté.
        LÂCHÉ AU-DELÀ D'UNE FAÇADE, il revient dans sa pièce — revue
        « Yasmine » : pendant le glissé, « d'où il venait » est la position
        de l'image d'avant, déjà au-delà du mur ; la collision le gardait de
        ce côté-là, collé à la façade, dehors (8 lâchers sur 19). Hors de
        toute pièce, il est censé venir de l'intérieur, juste en face :
        le point lâché, reflété dans le contour (l'ancre de la pièce, au
        milieu d'un L, tromperait le mur).
      */
      const enFace = (() => {
        if (dansUnePiece || entoure || !part?.surface) return null;
        const q = nearestOnRing({ x, z }, part.surface.pts);
        const reflet = { x: 2 * q.x - x, z: 2 * q.z - z };
        return pointInPolygon(reflet, part.surface.pts) ? reflet : null;
      })();
      const depuis = entoure ? { x, z } : dansUnePiece ? ici : enFace ?? undefined;
      const ancre = part ? part.labelAt : depuis ?? ici;
      const contour = part?.surface?.pts;
      const arrete = pushOutOfWalls({ x, z }, box, murs, ancre, contour, depuis, facesDesMurs(jeu.walls));
      /*
        LES VOISINS SONT CEUX DE LA PIÈCE D'ARRIVÉE, PAS CEUX D'AVANT.

        Le défaut que ce geste a rendu visible : le meuble gardait le
        `roomId` de sa pièce d'origine en traversant une cloison. Il était
        donc DESSINÉ dans le séjour et COMPTÉ dans la chambre — et, ce qui
        est pire pour une collision, il se cognait aux meubles de la chambre
        À TRAVERS LE MUR pendant qu'il traversait sans rien sentir ceux qui
        l'entouraient vraiment.
      */
      const piece = part?.roomId ?? roomOf(obj);
      const voisins = st.objects
        .filter((o) => o.id !== id && roomOf(o) === piece)
        .map((o) => ({
          cx: o.transform[12],
          cz: o.transform[14],
          width: o.width,
          depth: o.depth,
          yaw: Math.atan2(o.transform[2], o.transform[0]),
          y0: o.transform[13] - o.height / 2,
          y1: o.transform[13] + o.height / 2,
        }));
      const boite = {
        ...box,
        y0: obj.transform[13] - obj.height / 2,
        y1: obj.transform[13] + obj.height / 2,
      };
      /** Les deux dernières passes, enchaînées : les voisins, puis le mur. */
      const resoudre = (depart: { x: number; z: number }) =>
        pushOutOfWalls(
          // Pas de jour refermé : au doigt, on ne déplace pas ce qui tenait.
          pushOutOfObjects(depart, boite, voisins, false),
          box,
          murs,
          ancre,
          contour,
          depuis,
          facesDesMurs(jeu.walls),
        );
      /**
       * RESTE-T-IL UN CHEVAUCHEMENT ? (deux rectangles tournés, par axes)
       *
       * Les quatre axes des deux emprises suffisent à trancher : s'il en
       * existe un qui les sépare, elles ne se touchent pas. Et deux meubles
       * d'étages différents ne se gênent jamais — une télé se pose sur un
       * meuble bas.
       */
      const chevauchePar = (p: { x: number; z: number }) =>
        voisins.find((o) => {
          const bas = Math.max(boite.y0, o.y0);
          const haut = Math.min(boite.y1, o.y1);
          if (haut - bas <= 0.05) return false;
          const demi = (
            e: { width: number; depth: number; yaw: number },
            n: { x: number; z: number },
          ) =>
            Math.abs(Math.cos(e.yaw) * n.x + Math.sin(e.yaw) * n.z) *
              (e.width / 2) +
            Math.abs(-Math.sin(e.yaw) * n.x + Math.cos(e.yaw) * n.z) *
              (e.depth / 2);
          for (const n of [
            { x: Math.cos(box.yaw), z: Math.sin(box.yaw) },
            { x: -Math.sin(box.yaw), z: Math.cos(box.yaw) },
            { x: Math.cos(o.yaw), z: Math.sin(o.yaw) },
            { x: -Math.sin(o.yaw), z: Math.cos(o.yaw) },
          ]) {
            const d = (p.x - o.cx) * n.x + (p.z - o.cz) * n.z;
            // Un demi-millimètre de tolérance : deux meubles à touche-touche
            // se séparent par un flottant, pas par un chevauchement.
            if (Math.abs(d) - demi(box, n) - demi(o, n) > -0.0005) return false;
          }
          return true;
        });
      const chevauche = (p: { x: number; z: number }) => !!chevauchePar(p);

      let pose = resoudre(arrete);
      /*
        QUAND LE PLUS COURT CHEMIN NE MÈNE NULLE PART, ON SORT DE L'AUTRE CÔTÉ.

        Relevé fait à l'image sur ce code même : un canapé plaqué au mur sud
        laisse vingt-huit centimètres derrière lui, la commode en fait
        quarante-cinq. Lâchée dessus, elle sortait PAR LE SUD — le côté le
        plus court, celui qui dérange le moins la position visée — et le mur
        la renvoyait aussitôt dans le canapé. Elle finissait à cheval sur les
        deux, et personne ne repassait.

        Chacune des deux passes fait pourtant bien son travail : c'est leur
        ENCHAÎNEMENT qui échoue, et aucune des deux ne peut le voir seule. On
        essaie donc les autres sorties du meuble qui bloque — quatre, une par
        côté — et l'on garde celle qui tient VRAIMENT, la plus proche du point
        visé. C'est ce qui sépare une collision d'une collision intelligente.

        Si aucune ne tient — une pièce trop pleine, un meuble trop grand — on
        garde la première : le mur a le dernier mot, et un meuble qui
        chevauche un voisin se voit, quand un meuble hors du logement ne se
        pardonne pas.
      */
      const bloqueur = chevauchePar(pose);
      if (bloqueur) {
        let meilleur: { p: { x: number; z: number }; d: number } | null = null;
        for (const n of [
          { x: Math.cos(box.yaw), z: Math.sin(box.yaw) },
          { x: -Math.sin(box.yaw), z: Math.cos(box.yaw) },
        ]) {
          for (const sens of [1, -1]) {
            const axe = { x: n.x * sens, z: n.z * sens };
            const demi = (e: { width: number; depth: number; yaw: number }) =>
              Math.abs(Math.cos(e.yaw) * axe.x + Math.sin(e.yaw) * axe.z) *
                (e.width / 2) +
              Math.abs(-Math.sin(e.yaw) * axe.x + Math.cos(e.yaw) * axe.z) *
                (e.depth / 2);
            // Le point qui dégage tout juste le meuble gênant de ce côté.
            const ecart = demi(box) + demi(bloqueur);
            const essai = resoudre({
              x: bloqueur.cx + axe.x * ecart,
              z: bloqueur.cz + axe.z * ecart,
            });
            if (chevauche(essai)) continue;
            const d = Math.hypot(essai.x - x, essai.z - z);
            if (!meilleur || d < meilleur.d) meilleur = { p: essai, d };
          }
        }
        if (meilleur) pose = meilleur.p;
      }
      /*
        ET S'IL RESTE À CHEVAL SUR LA MAÇONNERIE, IL SORT DU CUL-DE-SAC.

        Découvert en retirant le rabotage du chemin des flèches : une table de
        1,48 m poussée dans une niche de 1,10 m y RESTAIT, à cheval sur les
        deux murs qui la bordent. Le rabotage la masquait — il la faisait
        maigrir jusqu'à ce qu'elle entre — et sans lui le défaut apparaît nu.

        C'est mécanique : deux murs qui se font face poussent chacun dans son
        sens, s'annulent, et la boucle finit là où elle a commencé. Aucune
        passe supplémentaire n'y changera rien ; il faut CHANGER D'ENDROIT.

        On glisse donc le meuble vers l'ancre de la pièce — le point au large,
        celui qui porte le cartouche — et l'on s'arrête au PREMIER pas où il
        tient. C'est le geste de quelqu'un qui essaie une place, voit que ça ne
        rentre pas, et recule d'un mètre. Le meuble reste ENTIER : c'est ce que
        le patron a demandé en retirant le rabotage.

        `poserLibre` répond exactement à la question posée ici — « cette
        emprise mord-elle un mur ? » —, c'est déjà elle qui allume le halo
        rouge sous le doigt. Deux réponses valent mieux qu'une seule mesure
        écrite deux fois.
      */
      if (!poserLibre({ x: pose.x, z: pose.z }, box, murs, facesDesMurs(jeu.walls)).valide) {
        for (let k = 1; k <= 10; k++) {
          const t = k / 10;
          const essai = resoudre({
            x: x + (ancre.x - x) * t,
            z: z + (ancre.z - z) * t,
          });
          if (poserLibre(essai, box, murs, facesDesMurs(jeu.walls)).valide) {
            pose = essai;
            break;
          }
        }
      }
      /*
        ET IL S'AJUSTE À LA NICHE OÙ IL ATTERRIT — s'il est RELEVÉ. RoomPlan
        rend une boîte un peu plus petite que le meuble (voir `niche.ts`) :
        lâché entre deux murs qui se font face, il en remplit l'intervalle,
        comme en fin de scan. Un meuble du CATALOGUE garde ses cotes — ce
        sont celles d'un produit, et le patron a retiré le rabotage
        automatique ; « Caler dans sa niche » reste à un appui.
      */
      const range = (o: ObjectData): ObjectData => {
        const t = [...o.transform];
        t[12] = pose.x;
        t[14] = pose.z;
        // Les cotes du catalogue, toujours : le doigt ne rabote pas.
        const pose_: ObjectData = {
          ...o,
          transform: t,
          width: o.baseWidth ?? o.width,
          depth: o.baseDepth ?? o.depth,
          // Il appartient à la pièce où il ATTERRIT. Sans pièce reconnue —
          // un plan dont les contours ne se referment pas — on ne lui
          // retire pas la sienne : une étiquette vide est pire qu'une
          // étiquette ancienne.
          roomId: piece,
        };
        if (o.modele) return pose_;
        return calerDansLaNiche(pose_, st.walls) ?? pose_;
      };
      set({
        objects: st.objects.map((o) => (o.id === id ? range(o) : o)),
        dirty: true,
      });
    },

    resizeObjectSide: (id, cote, distance, depuis) => {
      const st = get();
      const obj = st.objects.find((o) => o.id === id);
      if (!obj) return { accroche: false };
      pushHistory(`resizeSide:${id}`);
      // Le calcul est celui que la poignée montre pendant le geste : voir
      // `meubleEtire`.
      const r = meubleEtire(st, obj, cote, distance, depuis);
      set({
        objects: st.objects.map((o) => (o.id === id ? r.objet : o)),
        dirty: true,
      });
      return { accroche: r.accroche };
    },

    resizeObject: (id, width, depth) => {
      /*
        UNE COTE EST UN NOMBRE FINI ET POSITIF — et l'on EXIGE ça, on ne
        refuse plus le contraire.

        La garde d'avant s'écrivait `width <= 0 || depth <= 0`. Elle paraît
        complète, et elle laissait passer LE pire des nombres : `NaN <= 0`
        vaut FAUX. Un NaN traversait donc les deux conditions et s'écrivait
        dans le meuble.

        ET UN NaN NE RESTE PAS OÙ IL EST NÉ. La largeur nourrit le dessin 2D,
        le volume 3D, le métré et le PDF ; elle devient des coordonnées
        `NaN,NaN` dans un tracé SVG, et un tracé illisible fait tomber la
        couche native — c'est-à-dire l'application, sans un mot.

        LA LEÇON, ET ELLE VAUT PARTOUT : une garde qui cherche ce qu'elle
        REFUSE laisse toujours passer NaN, parce que toute comparaison avec
        NaN est fausse. Une garde qui exige ce qu'elle ACCEPTE ne peut pas se
        tromper.
      */
      if (!estUneCote(width) || !estUneCote(depth)) return;
      pushHistory(`resize:${id}`);
      set({
        objects: get().objects.map((o) =>
          o.id === id
            ? // Une cote saisie à la main devient LA référence : c'est
              // l'électricien qui a mesuré, et son chiffre prime sur celui
              // du scanner comme sur l'ajustement d'une niche.
              { ...o, width, depth, baseWidth: width, baseDepth: depth }
            : o,
        ),
        dirty: true,
      });
    },

    calerMeuble: (id) => {
      const st = get();
      const o = st.objects.find((x) => x.id === id);
      if (!o) return;
      const cale = calerDansLaNiche(o, st.walls);
      // La garde AVANT le point de reprise : voir `annulerunefois`.
      if (!cale) return;
      pushHistory(`caler:${id}`);
      set({ objects: st.objects.map((x) => (x.id === id ? cale : x)), dirty: true });
    },

    setObjectHeight: (id, height, base) => {
      const o = get().objects.find((x) => x.id === id);
      if (!o) return;
      // Un meuble de deux centimètres ou de neuf mètres est une faute de
      // frappe, pas un relevé ; une pose négative enfoncerait le meuble dans
      // la dalle.
      if (height !== undefined && !(height > 0.05 && height <= 4)) return;
      if (base !== undefined && !(base >= 0 && base <= 6)) return;
      if (height === undefined && base === undefined) return;
      const h = height ?? o.height;
      /*
        LA POSE SE COMPTE DEPUIS LE SOL DU PLAN — RoomPlan ne le met pas à
        zéro (voir `solDesMurs`). « 0 » pose le meuble par terre, pas à
        quatre-vingts centimètres au-dessus.
      */
      const b = base !== undefined ? base + solDesMurs(get().walls) : o.transform[13] - o.height / 2;
      pushHistory(`objectHeight:${id}`);
      set({
        objects: get().objects.map((x) => {
          if (x.id !== id) return x;
          const t = [...x.transform];
          // L'altitude vit dans la matrice, à l'index 13 : c'est le centre
          // du volume, donc le dessous plus la moitié de la hauteur.
          t[13] = b + h / 2;
          return { ...x, height: h, transform: t };
        }),
        dirty: true,
      });
    },

    revertCurrent: () => {
      const st = get();
      const save = st.saves.find((s) => s.id === st.currentSaveId);
      if (!save) return;
      // Revenir au plan enregistré, c'est renoncer à ce qui l'attendait.
      if (save.retouche) get().jeterRetouche(save.id);
      const migrated = migrateSave(save);
      set({
        walls: migrated.walls,
        openings: migrated.openings,
        objects: migrated.objects,
        rooms: migrated.rooms,
        fixtures: migrated.fixtures ?? [],
        // TOUT revient, pas les cinq premières listes : abandonner les
        // modifications laissait les spots ajoutés, les photos prises et
        // le nord tourné — et `dirty: false` promettait au prochain
        // enregistrement d'écrire ce mélange dans la bibliothèque.
        ceiling: migrated.ceiling ?? [],
        photos: migrated.photos ?? [],
        north: migrated.north ?? null,
        client: migrated.client ?? '',
        address: migrated.address ?? '',
        // « TOUT revient » vaut aussi pour le chiffrage : abandonner les
        // modifications en gardant le caddie laisserait un ticket que le
        // dossier enregistré ne connaît pas.
        ...devisRepose(migrated.devis),
        dirty: false,
      });
      clearHistory();
    },

    /** Enregistre l'état courant comme NOUVELLE entrée de bibliothèque
     *  (l'original reste tel quel) et bascule dessus. */
    saveAsCopy: (name) => {
      const st = get();
      if (st.walls.length === 0) return;
      // Une copie est un plan : voir `placePourUnPlanDePlus`.
      if (!placePourUnPlanDePlus()) return;
      const now = Date.now();
      /*
        UNE COPIE PORTE UN NOM À ELLE — revue « Chloé » : le champ gardait le
        nom du plan, et « Mes scans » montrait deux « Version A » sans dire
        laquelle on modifiait. Un nom déjà pris devient « … — version 2 ».
      */
      const ancien = st.scanName;
      const clean = nomDeVersion(name.trim() || ancien || 'Plan', st.saves.map((x) => x.name));
      // La copie reste dans le dossier de l'original (revue « Fatou »).
      const dossier = st.saves.find((x) => x.id === st.currentSaveId)?.folderId;
      const save: SavedScan = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: clean,
        createdAt: now,
        updatedAt: now,
        ...(dossier ? { folderId: dossier } : {}),
        modelPath: st.modelPath,
        rooms: st.rooms,
        walls: st.walls,
        openings: st.openings,
        objects: st.objects,
        fixtures: st.fixtures,
        photos: st.photos,
        ceiling: st.ceiling,
        notes: st.notes,
        mesures: st.mesures,
        existant: st.existant ?? undefined,
        north: st.north ?? undefined,
        client: st.client || undefined,
        address: st.address || undefined,
        devis: devisDuPlan(st),
      };
      const saves = [save, ...st.saves];
      const avaitUneEntree = !!st.currentSaveId;
      set({ saves, currentSaveId: save.id, scanName: clean, dirty: false });
      persistSoon(saves);
      deposerPlusTard(save.id);
      // L'écran bascule sur la copie : on le dit (revue « Chloé »).
      astuce(
        avaitUneEntree
          ? `Vous êtes dans « ${clean} ». « ${ancien} » n’a pas bougé.`
          : `Copie créée : vous êtes dans « ${clean} ».`,
        { icone: 'save' },
      );
    },

    addFolder: (name) => {
      const id = `dos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const folders = [
        ...get().folders,
        { id, name: name?.trim() || `Dossier ${get().folders.length + 1}` },
      ];
      set({ folders });
      AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)).catch(() => {});
      return id;
    },

    renameFolder: (id, name) => {
      const clean = name.trim();
      if (!clean) return;
      const folders = get().folders.map((f) =>
        f.id === id ? { ...f, name: clean } : f,
      );
      set({ folders });
      AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)).catch(() => {});
    },

    removeFolder: (id) => {
      const folders = get().folders.filter((f) => f.id !== id);
      // Supprimer un dossier ne supprime pas ce qu'il contient : les scans
      // remontent à la racine, où on les retrouve.
      const saves = get().saves.map((s) =>
        s.folderId === id ? { ...s, folderId: undefined } : s,
      );
      set({ folders, saves });
      AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)).catch(() => {});
      persistSoon(saves);
    },

    moveToFolder: (scanId, folderId) => {
      const saves = get().saves.map((s) =>
        s.id === scanId ? { ...s, folderId: folderId ?? undefined } : s,
      );
      set({ saves });
      persistSoon(saves);
      deposerPlusTard(scanId);
    },

    ecrireBrouillon: () => {
      const st = get();
      // Rien à sauver : pas de murs, ou un relevé déjà enregistré tel quel.
      if (st.walls.length === 0 || (st.currentSaveId && !st.dirty)) {
        if (draftEcrit !== '') {
          draftEcrit = '';
          /*
            LE FILET NE SE REPLIE QU'UNE FOIS LE PLAN SUR LE DISQUE — revue
            « Agathe » : il s'effaçait tout de suite, le plan n'était écrit
            que six cents millisecondes plus tard (pour un plan dessiné,
            c'était sa PREMIÈRE écriture), et un disque plein ne l'écrivait
            jamais. Un brouillon réécrit entre-temps n'est pas touché.
          */
          apresEcriture().then((ok) => {
            if (ok && draftEcrit === '') AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
          });
        }
        return;
      }
      const brouillon: BrouillonScan = {
        at: Date.now(),
        name: st.scanName,
        saveId: st.currentSaveId ?? undefined,
        walls: st.walls,
        openings: st.openings,
        objects: st.objects,
        rooms: st.rooms,
        fixtures: st.fixtures,
        ceiling: st.ceiling,
        notes: st.notes,
        mesures: st.mesures,
        existant: st.existant ?? undefined,
        photos: st.photos,
        modelPath: st.modelPath,
        devis: devisDuPlan(st),
        client: st.client || undefined,
        address: st.address || undefined,
        north: st.north ?? undefined,
        cleDuReleve: st.cleDuReleve ?? undefined,
      };
      // L'horodatage change à chaque tick : on compare SANS lui, sinon on
      // réécrirait un relevé identique toutes les trente secondes.
      const empreinte = JSON.stringify({ ...brouillon, at: 0 });
      if (empreinte === draftEcrit) return;
      draftEcrit = empreinte;
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(brouillon)).catch(() => {
        // Un brouillon perdu ne se signale pas : c'est un filet, et
        // l'alerte du disque plein est déjà portée par l'enregistrement.
        draftEcrit = '';
      });
    },

    reprendreBrouillon: () => {
      const b = get().brouillon;
      if (!b) return;
      // Le dossier dont c'est la retouche : il rend le cartouche aux brouillons d'avant.
      const dossier = b.saveId ? get().saves.find((s) => s.id === b.saveId) : undefined;
      set({
        /*
          LE CARTOUCHE REVIENT AVEC LE RELEVÉ — revue « Agathe » : repris
          vides, le client, l'adresse et le nord étaient effacés du dossier
          au premier enregistrement, et le PDF partait sans cartouche.
        */
        client: b.client ?? dossier?.client ?? '',
        address: b.address ?? dossier?.address ?? '',
        north: b.north ?? dossier?.north ?? null,
        cleDuReleve: b.cleDuReleve ?? null,
        /* Un plan qui s'ouvre repose ses calques. */
        ...CALQUES_DE_BASE,
        screen: 'result',
        resultOrigin: 'scan',
        scanName: b.name,
        walls: b.walls,
        niveauCourant: niveauDeDepart(b.walls),
        openings: b.openings,
        objects: separerLeMobilier(b.objects, b.rooms),
        rooms: b.rooms,
        fixtures: b.fixtures,
        ceiling: b.ceiling,
        /*
          TOUT CE QUI A ÉTÉ ÉCRIT EST RENDU.

          Le brouillon sauvait déjà les notes et le tableau existant ; la
          reprise, elle, les laissait sur le disque. Un filet qui retient la
          moitié de ce qui tombe est un filet qui MENT : on croit avoir tout
          retrouvé, et l'on repart sans le relevé des départs — ce quart
          d'heure debout dans un couloir devant une porte ouverte, qui est
          justement ce qui justifie le devis de remise aux normes.

          Absents des brouillons écrits par les versions d'avant : un relevé
          sauvé il y a dix minutes par l'ancienne app doit se reprendre.
        */
        notes: b.notes ?? [],
        mesures: b.mesures ?? [],
        existant: b.existant ?? null,
        photos: b.photos,
        modelPath: b.modelPath,
        // Le chiffrage aussi : un filet qui retient la moitié de ce qui
        // tombe est un filet qui ment.
        ...devisRepose(b.devis),
        /*
          LES RETOUCHES REVIENNENT DANS LEUR DOSSIER. Un brouillon qui porte
          un `saveId` encore en bibliothèque rouvre CE dossier : enregistrer
          retombe dans son entrée, pas dans un clone. Un brouillon d'avant,
          ou dont le dossier a été supprimé entre-temps, redevient ce qu'il
          était : un plan à enregistrer.
        */
        currentSaveId:
          b.saveId && get().saves.some((s) => s.id === b.saveId)
            ? b.saveId
            : null,
        dirty: true,
        brouillon: null,
      });
      // Le filet qui vient de vous sauver se réarme derrière vous.
      armerBrouillon(() => get().ecrireBrouillon());
    },

    oublierBrouillon: () => {
      draftEcrit = '';
      set({ brouillon: null });
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
    },

    loadSaves: async () => {
      // Une relecture commence : rien ne s'efface avant qu'elle aboutisse.
      bibliothequeChargee = false;
      try {
        const pref = await AsyncStorage.getItem(THEME_KEY);
        if (pref === 'light' || pref === 'dark' || pref === 'system') {
          set({ themePref: pref });
        }
        const accent = await AsyncStorage.getItem(ACCENT_KEY);
        if (estUnAccent(accent)) set({ accentPref: accent as string });
        /* L'icône, elle, n'est PAS reposée au démarrage : elle est déjà sur
           l'écran d'accueil, et la reposer déclencherait l'alerte du système
           à chaque lancement. On ne lit que le réglage, pour le montrer. */
        const icone = await AsyncStorage.getItem(ICONE_KEY);
        if (estUneIcone(icone)) set({ iconePref: icone as string });
        const colors = await AsyncStorage.getItem(COLORS_KEY);
        if (colors === '1' || colors === '0') {
          set({ showOpeningColors: colors === '1' });
        }
        const furn = await AsyncStorage.getItem(FURNITURE_KEY);
        if (furn === '1' || furn === '0') {
          set({ showFurniture: furn === '1' });
        }
        const surf = await AsyncStorage.getItem(SURFACES_KEY);
        if (surf === '1' || surf === '0') {
          set({ showSurfaces: surf === '1' });
        }
        const tex = await AsyncStorage.getItem(TEXTURES_KEY);
        if (tex === '1' || tex === '0') {
          set({ showTextures: tex === '1' });
        }
        /*
          CHAQUE CLÉ DANS SA GARDE. Tout se lisait dans le même try/catch,
          et les dossiers de rangement se lisent AVANT les scans : trois
          octets abîmés dans cette petite clé-là, et la bibliothèque entière
          paraissait vide — puis le premier enregistrement réécrivait
          l'index par-dessus. Une clé d'un kilooctet effaçait trente
          chantiers.
        */
        try {
          const dossiers = await AsyncStorage.getItem(FOLDERS_KEY);
          if (dossiers) {
            const parsed = JSON.parse(dossiers) as ScanFolder[];
            if (Array.isArray(parsed)) set({ folders: parsed });
          }
        } catch {
          // Des dossiers illisibles : les scans restent, le rangement se
          // refait d'un geste.
        }
        // Chaque plan est migré dans SA garde (voir `loadLibrary`) : un plan
        // qui fait lever la migration ne vide plus la bibliothèque.
        await chargerLaBibliotheque((saves) => set({ saves }));
        // Ce qui a passé ses douze heures pendant que l'app dormait s'en va.
        get().purgerLesEchus();
        /*
          LE RELEVÉ INTERROMPU, retrouvé au démarrage.

          On ne le reprend PAS d'office : l'utilisateur a pu quitter
          volontairement un essai raté, et se voir imposer son retour serait
          pire que de l'avoir perdu. L'écran d'accueil pose la question.
        */
        try {
          const brut = await AsyncStorage.getItem(DRAFT_KEY);
          if (brut) {
            const b = JSON.parse(brut) as BrouillonScan;
            // Un brouillon vide n'a rien à proposer.
            if (b && Array.isArray(b.walls) && b.walls.length > 0) {
              set({ brouillon: b });
            } else {
              AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
            }
          }
        } catch {
          // Un brouillon illisible ne protège rien — et sans l'effacement,
          // il referait trébucher CHAQUE démarrage.
          AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
        }
        /*
          LE GRAND BALAYAGE DES MODÈLES, une fois par ouverture.

          Effacer le modèle d'un scan supprimé ne rend rien à qui ne supprime
          jamais de scan — et ce sont justement les modèles entassés par les
          versions précédentes, quand rien n'était effacé, qui ont fini par
          remplir le téléphone du patron au point qu'une mise à jour ne
          tenait plus.

          On balaie donc au démarrage, en donnant tout ce que la bibliothèque
          et le brouillon réclament encore. Le natif ne touche qu'aux
          `scan-….usdz` de la racine des Documents : rien de ce que l'app
          n'a pas écrit elle-même n'est en jeu.
        */
        const apres = get();
        cleanModelFiles(
          [
            ...apres.saves.map((s) => s.modelPath),
            apres.brouillon?.modelPath ?? null,
            apres.modelPath,
          ].filter((m): m is string => !!m),
        ).then((octets) => {
          if (octets > 0) set({ placeRendue: octets });
        });
      } catch {
        // Stockage illisible : on repart des valeurs en mémoire.
      }
      // Lue ou illisible, la question est tranchée : ce que `saves` contient
      // maintenant est TOUT ce que le téléphone avait. La reprise du compte
      // peut s'y comparer sans risquer le doublon.
      set({ savesCharges: true });
    },

    /*
      LE LENDEMAIN D'UNE RÉINSTALLATION.

      Le téléphone est neuf ou l'app a été réinstallée : les Documents sont
      vides, mais le compte, lui, garde les relevés. On les redescend une
      seule fois — et le marqueur qui le dit part avec l'application, donc
      une vraie réinstallation le refera, et un lancement ordinaire jamais.

      L'ordre compte : sans compte connecté, on ne marque RIEN. Le patron
      ouvre souvent l'app avant de se connecter, et une reprise déclarée
      faite alors qu'elle n'a rien repris serait une bibliothèque perdue
      pour de bon.
    */
    repriseAuBesoin: async () => {
      if (!get().savesCharges) return 0;
      const qui = identiteDuCompte();
      if (!qui) return 0;
      try {
        if (await AsyncStorage.getItem(REPRISE_KEY)) return 0;
      } catch {
        // Marqueur illisible : mieux vaut une reprise de trop qu'une
        // bibliothèque vide. `reprendreDuCompte` ne pose que ce qui manque.
      }
      const repris = await get().reprendreDuCompte(qui);
      /*
        UNE REPRISE MANQUÉE SE RETENTE — revue « Thomas » : le serveur muet
        au premier lancement, la reprise était déclarée faite, et la
        bibliothèque restait vide pour toujours. On ne pose le marqueur
        qu'une fois le serveur entendu, et l'on dit ce qui est revenu.
      */
      if (repris < 0) return 0;
      AsyncStorage.setItem(REPRISE_KEY, String(Date.now())).catch(() => {});
      if (repris > 0) {
        astuce(`${repris} plan${repris > 1 ? 's' : ''} récupéré${repris > 1 ? 's' : ''} depuis votre compte.`, { icone: 'save' });
      }
      return repris;
    },

    openSave: (id) => {
      const found = get().saves.find((s) => s.id === id);
      if (!found) return;
      // Ce plan existe déjà : il a été payé le jour de sa création — sauf
      // s'il n'est que gardé douze heures, et qu'on ne l'a jamais enregistré.
      dejaCompte = !found.supprimeLe;
      /*
        LES MODIFICATIONS QUI ATTENDAIENT REVIENNENT À L'ÉCRAN, et le plan
        se rouvre « à enregistrer » : on reprend exactement là où on l'avait
        laissé. Le plan enregistré, lui, n'a pas bougé — « Abandonner les
        modifications » y ramène.
      */
      const enAttente = !!found.retouche || !!found.supprimeLe;
      const save = migrateSave(
        found.retouche ? { ...found, ...found.retouche.plan } : found,
      );
      set({
        modelPath: save.modelPath,
        scanName: save.name,
        client: save.client ?? '',
        address: save.address ?? '',
        currentSaveId: save.id,
        // Rouvert dans la même session, il reconnaît encore ses passages.
        cleDuReleve: save.cleDuReleve ?? null,
        rooms: save.rooms,
        walls: save.walls,
        // Revue « Hugo » : le niveau regardé dans un AUTRE plan restait
        // affiché ; le plan s'ouvrait sur un étage vide, « Aucun mur détecté ».
        niveauCourant: niveauDeDepart(save.walls),
        openings: save.openings,
        objects: separerLeMobilier(save.objects, save.rooms),
        fixtures: save.fixtures ?? [],
        photos: save.photos ?? [],
        ceiling: save.ceiling ?? [],
        // Les relevés d'avant les notes n'en portent aucune, et c'est bien.
        notes: save.notes ?? [],
        mesures: save.mesures ?? [],
        // Un dossier ouvert n est pas un plan vierge, meme s il est vide.
        planVierge: false,
        // Le tableau trouvé sur place revient avec son relevé.
        existant: save.existant ?? null,
        pendingJoin: null,
        // L'arrivage appartient au scan qui vient de finir : ouvert sur un
        // autre dossier, le popup proposerait d'y intégrer les meubles
        // d'un autre logement.
        arrivage: null,
        north: save.north ?? null,
        // Le chiffrage revient avec son plan — et un relevé d'avant s'ouvre
        // sur un ticket NEUF, surtout pas sur celui du chantier d'avant.
        ...devisRepose(save.devis),
        dirty: enAttente,
        resultOrigin: 'library',
        /* Un plan qui s'ouvre repose ses calques. */
        ...CALQUES_DE_BASE,
        // Un relevé qui a ses couleurs se rouvre en couleurs.
        ...((save.walls ?? []).some((w) => !!w.color) ? { showTextures: true } : {}),
        screen: 'result',
      });
      clearHistory();
      // Vingt prises ajoutées sur place méritent le même filet qu'un scan.
      armerBrouillon(() => get().ecrireBrouillon());
    },

    mettreALaCorbeille: (id) => {
      const st = get();
      if (!st.saves.some((x) => x.id === id && !x.corbeille)) return;
      const saves = st.saves.map((x) => (x.id === id ? { ...x, corbeille: Date.now() } : x));
      set({
        saves,
        ...(st.currentSaveId === id ? { currentSaveId: null, arrivage: null } : null),
      });
      persistSoon(saves);
    },

    restaurerDeLaCorbeille: (id) => {
      const st = get();
      if (!st.saves.some((x) => x.id === id && x.corbeille)) return;
      const saves = st.saves.map((x) => {
        if (x.id !== id) return x;
        const rendu: SavedScan = { ...x, updatedAt: Date.now() };
        delete rendu.corbeille;
        return rendu;
      });
      set({ saves });
      persistSoon(saves);
    },

    viderLaCorbeille: () => {
      for (const x of get().saves.filter((s) => s.corbeille)) get().deleteSave(x.id);
    },

    deleteSave: (id) => {
      const st = get();
      const parti = st.saves.find((s) => s.id === id);
      // Un plan supprimé du téléphone ne reste pas sur le serveur.
      const qui = identiteDuCompte();
      if (qui) retirerPlan(qui, id).catch(() => {});
      const saves = st.saves.filter((s) => s.id !== id);
      // Les photos de repérage vivent dans les Documents de l'app : sans
      // ce ménage, elles s'accumulent pour toujours, sans que personne
      // puisse les retrouver ni les effacer. On ne touche qu'à celles que
      // plus aucun scan ne réclame.
      const gardees = new Set(
        saves.flatMap((s) => (s.photos ?? []).map((p) => p.path)),
      );
      const aEffacer = (parti?.photos ?? [])
        .map((p) => p.path)
        .filter((p) => !gardees.has(p));
      deletePhotoFiles(aEffacer);
      /*
        LE MODÈLE 3D PART AVEC SON SCAN.

        Chaque relevé écrit un `scan-….usdz` de plusieurs mégaoctets dans les
        Documents, et rien ne l'effaçait jamais : la place ne revenait qu'en
        désinstallant l'app. Une mise à jour a fini par ne plus tenir sur le
        téléphone.

        On envoie les modèles ENCORE réclamés plutôt que celui qui part : le
        natif efface tout le reste, ce qui emporte du même coup les orphelins
        laissés par les versions d'avant. Le modèle du plan à l'écran reste
        gardé même si sa sauvegarde s'en va — on ne retire pas la 3D des mains
        de qui la regarde.
      */
      if (parti?.modelPath) {
        const modeles = saves
          .map((s) => s.modelPath)
          .concat(st.modelPath)
          .filter((m): m is string => !!m);
        cleanModelFiles(modeles);
      }
      set({
        saves,
        // Supprimer le scan courant emporte aussi sa question de fin de
        // scan : l'arrivage appartient au scan qui vient de finir.
        ...(st.currentSaveId === id
          ? { currentSaveId: null, arrivage: null }
          : null),
      });
      persistSoon(saves);
    },

    repartirANeuf: () => {
      /*
        UN SCAN NEUF N'HÉRITE DE RIEN — revue « Agathe » : lancé de
        l'accueil, il gardait les notes, les cotes à la règle, le tableau
        existant, le devis et l'étage du chantier d'avant, qui
        s'imprimaient dans le PDF du nouveau client. `reset` sait tout ce
        qu'il faut oublier ; on garde seulement l'écran où l'on est.
      */
      const ecran = get().screen;
      get().reset();
      set({ screen: ecran });
    },

    commencerAuClavier: () => {
      /*
        On repart d'un plan VIERGE, comme après un scan raté : le dossier
        ouvert précédemment n'a rien à faire ici, et son nom encore moins.
        `resultOrigin` dit « scan » parce que c'est un relevé qui commence,
        même sans caméra — c'est ce qui commande le retour de l'écran.
      */
      get().reset();
      set({
        planVierge: true,
        /* Un plan qui s'ouvre repose ses calques. */
        ...CALQUES_DE_BASE,
        screen: 'result',
        // Deux plans du même jour ne portent pas le même nom (revue « Inès »).
        scanName: nomDeVersion(
          `Plan du ${new Date().toLocaleDateString('fr-FR')}`,
          get().saves.map((x) => x.name),
        ),
        resultOrigin: 'scan',
        niveauCourant: NIVEAU_RDC,
      });
      // `reset` vient d'arrêter la minuterie : un plan au clavier se
      // construit sous le même filet qu'un scan.
      armerBrouillon(() => get().ecrireBrouillon());
    },

    ouvrirPlanLu: (plan, nom) => {
      get().reset();
      set({
        planVierge: false,
        ...CALQUES_DE_BASE,
        screen: 'result',
        scanName: nom,
        resultOrigin: 'scan',
        niveauCourant: NIVEAU_RDC,
        // Lu sur un plan papier : ses cotes sont celles du plan, intérieures.
        walls: plan.walls.map((w) => ({ ...w, auNu: true })),
        openings: plan.openings,
        rooms: plan.rooms.map((r) => ({ ...r, floor: null })),
        objects: [],
        fixtures: plan.fixtures,
        ceiling: plan.ceiling,
        photos: [],
        notes: [],
        mesures: [],
        currentSaveId: null,
        dirty: true,
      });
      armerBrouillon(() => get().ecrireBrouillon());
    },

    ouvrirExemple: () => {
      get().reset();
      const ex = appartementExemple();
      set({
        planVierge: false,
        ...CALQUES_DE_BASE,
        screen: 'result',
        scanName: NOM_EXEMPLE,
        // On en revient à l'accueil, d'où l'on est parti.
        resultOrigin: 'scan',
        niveauCourant: NIVEAU_RDC,
        walls: ex.walls,
        openings: ex.openings,
        rooms: ex.rooms,
        objects: ex.objects,
        // L'installation électrique de la vitrine : on voit, dès l'accueil,
        // ce que l'établi sait poser (affichée en mode électricité).
        fixtures: ex.fixtures,
        ceiling: ex.ceiling,
        photos: [],
        notes: [],
        mesures: [],
        currentSaveId: null,
        dirty: false,
      });
    },

    reset: () => {
      /*
        UN NOUVEAU SCAN EFFACE LE FILET.

        Le brouillon décrit LE relevé en cours ; en repartir un autre le rend
        caduc, et le garder ferait proposer au démarrage suivant un relevé
        que l'utilisateur vient lui-même de jeter.
      */
      arreterBrouillon();
      draftEcrit = '';
      /*
        LE PASSÉ NE SURVIT PAS À UN NOUVEAU RELEVÉ.

        L'historique était de portée MODULE : il traversait le « Nouveau
        scan » sans broncher, et une annulation ramenait alors le plan
        précédent — sans son entrée de bibliothèque, sans son nom, sorti de
        nulle part. Le filet s'était transformé en piège.
      */
      clearHistory();
      // Un nouveau relevé se paie, lui : la marque tombe avec l'ancien.
      dejaCompte = false;
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      set({
        screen: 'home',
        forcerTarifs: false,
        brouillon: null,
        scanning: false,
        paused: false,
        processing: false,
        error: null,
        instruction: '',
        mursDouteux: 0,
        murDouteux: null,
        murValideA: 0,
        trouContour: 0,
        complementEnCours: false,
        // Un autre relevé commence : les passages de l'iPhone ne sont plus les siens.
        cleDuReleve: null,
        wallCount: 0,
        objectCount: 0,
        doorCount: 0,
        windowCount: 0,
        modelPath: null,
        scanName: '',
        currentSaveId: null,
        dirty: false,
        rooms: [],
        walls: [],
        openings: [],
        objects: [],
        fixtures: [],
        photos: [],
        ceiling: [],
        notes: [],
        mesures: [],
        existant: null,
        north: null,
        // Le popup de fin de scan appartient au scan qui vient de finir.
        arrivage: null,
        /*
          ET TOUT CE QUI DÉSIGNE LE CHANTIER PRÉCÉDENT.

          Trouvé en comparant, champ par champ, ce que l'état contient et ce
          que ce `reset` reposait : cinquante-neuf champs de données,
          vingt-huit reposés à la main. Une liste écrite à la main finit
          toujours par prendre du retard sur la structure qu'elle décrit.

          LE NOM ET L'ADRESSE SONT LE PIRE DES SIX, et de loin : ils vont
          dans le CARTOUCHE DU PDF. On relève un logement rue Pasteur, on en
          relève un autre le lendemain, on exporte — et l'on tend à quelqu'un
          un dossier au nom d'un autre, avec son adresse. Ce n'est pas un
          défaut d'affichage, c'est une fuite entre deux clients.

          L'ÉTAGE COURANT LAISSAIT UN PLAN VIDE : les murs d'un relevé neuf
          sont au niveau zéro, et rester au premier ne montrait rien. Un plan
          vide après un scan se lit comme un scan raté — on recommence, et ça
          refait la même chose.

          L'ÉTAGE ARMÉ, lui, faisait atterrir le scan SUIVANT au premier
          étage d'un dossier qui n'avait rien demandé. Le code connaît ce
          piège : il le désarme à l'abandon et à l'échec du post-traitement,
          mais pas quand on repart d'un relevé neuf.
        */
        client: undefined,
        address: undefined,
        niveauCourant: 0,
        etageEnCours: null,
        panne: null,
        pendingJoin: null,
        /*
          ET LE CHIFFRAGE REPART DE ZÉRO.

          Il ne le faisait pas : les articles pris au magasin pour un
          chantier se retrouvaient sur le devis du suivant, la gamme d'un
          logement sur celle d'un autre. Un devis faux dans le sens qui
          coûte — trop d'articles, chez quelqu'un qui ne les a pas demandés.

          Le rang de l'étape part avec : un nouveau relevé n'a pas encore lu
          l'avertissement, et l'on ne lui fait pas sauter la page qui dit ce
          que le prix ne contient pas.
        */
        ...devisRepose(undefined),
      });
    },
  };
});
