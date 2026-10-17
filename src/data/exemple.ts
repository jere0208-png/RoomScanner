/**
 * L'APPARTEMENT D'EXEMPLE — ce qu'on ouvre depuis l'accueil avant d'avoir
 * relevé quoi que ce soit.
 *
 * Relevé du patron : « une vraie identité, plus qu'un logo et trois
 * boutons ; les projets directement visibles sur la page ». Pour qui vient
 * d'installer l'application, il n'y a pas encore de projet : l'accueil le
 * plus soigné du monde lui montre alors une liste vide. Un plan d'exemple
 * comble ce vide par la chose même que l'application fabrique — on le
 * tourne en 3D, on s'y promène, on regarde ce qu'il faut acheter, et l'on
 * comprend en trente secondes ce qu'un scan donnera chez soi.
 *
 * Un T2 de 46 m² (48 d’enveloppe) comme il y en a partout : séjour avec cuisine ouverte,
 * chambre, salle d'eau, entrée et un petit bureau. Meublé avec le catalogue
 * de l'application, chaque meuble posé contre la FACE de son mur — le trait
 * d'une façade, l'axe d'un refend moins une demi-épaisseur —, comme le
 * ferait le doigt.
 */
import type { ObjectData } from 'react-native-room-scan';
import { CATALOGUE, catalogTransform, type CatalogItem } from '../geometry/catalogue';
import { pointInPolygon } from '../geometry/appearance';
import { FIXTURES, type Fixture, type FixtureKind } from '../geometry/electrical';
import type { CeilingFixture, CeilingKind } from '../geometry/ceiling';
import {
  WALL_T,
  detectRooms,
  mergeColinear,
  roomParts,
  segLength,
  splitAtJunctions,
  weldCorners,
  type WallSeg,
} from '../geometry/floorplan';
import type { RoomKind } from '../geometry/furniture';

/** Le nom que porte le plan d'exemple — et qui le distingue d'un vrai. */
export const NOM_EXEMPLE = 'Appartement exemple';

const H = 2.5;
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: H,
  yCenter: H / 2,
});

/*
  L'ENVELOPPE ET SES REFENDS, comme RoomPlan les livre : de longs murs
  continus, coupés aux jonctions ensuite (`splitAtJunctions`).

    x →  0          2,6         5            8
   z 0   ┌──────────────────────┬────────────┐
         │   Séjour – cuisine   │  Chambre   │
   3,6   │                      ├────────────┤
   4,2   ├──────────┬───────────┤ Salle d'eau│
         │  Bureau  │  Entrée   │            │
   6     └──────────┴───────────┴────────────┘
*/
/*
  LES REFENDS SONT À LEUR AXE, ET LE PLAN LE SAIT — revue « Nadia »,
  métreuse : sans marque, un refend se comptait à son trait des deux côtés,
  et l'exemple annonçait 48,00 m² « habitables », l'enveloppe 8 × 6, pour un
  intérieur de 45,8 (le bureau 4,68 pour 4,38, l'entrée 4,32 pour 3,91). Ses
  cloisons sont tracées à l'axe — les meubles s'y posent à « l'axe moins une
  demi-épaisseur » (`NU`) : elles sont marquées comme un refend relevé de ses
  deux faces (`deuxFaces`), et chaque pièce se compte à son nu. Les façades,
  elles, restent un trait qui est leur face intérieure.
*/
const refend = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  ...mur(id, ax, az, bx, bz),
  deuxFaces: true,
});
/*
  LA NATURE DES MURS, COMME SUR UN PLAN D'ARCHITECTE (voir `natureMurs`) :
  l'enveloppe et le refend en maçonnerie, les cloisons du bureau, de
  l'entrée et de la salle d'eau en plaque de plâtre — en gris sur le plan,
  et la légende du PDF le dit.
*/
const porteur = (w: WallSeg): WallSeg => ({ ...w, nature: 'porteur' });
const placo = (w: WallSeg): WallSeg => ({ ...w, nature: 'cloison' });
const BRUTS: WallSeg[] = [
  porteur(mur('nord', 0, 0, 8, 0)),
  porteur(mur('est', 8, 0, 8, 6)),
  porteur(mur('sud', 8, 6, 0, 6)),
  porteur(mur('ouest', 0, 6, 0, 0)),
  porteur(refend('refend', 5, 0, 5, 6)),
  placo(refend('sejour-sud', 0, 4.2, 5, 4.2)),
  placo(refend('bureau-est', 2.6, 4.2, 2.6, 6)),
  placo(refend('chambre-sud', 5, 3.6, 8, 3.6)),
];

const WALLS = mergeColinear(splitAtJunctions(weldCorners(BRUTS)));

/** Une menuiserie posée sur le trait d'un mur. */
const baie = (
  id: string,
  type: 'door' | 'window' | 'opening',
  ax: number,
  az: number,
  bx: number,
  bz: number,
  hauteur: number,
  allege = 0,
  open?: boolean,
): WallSeg => ({
  id,
  type,
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: hauteur,
  yCenter: allege + hauteur / 2,
  ...(open ? { open } : {}),
});

const OPENINGS: WallSeg[] = [
  // La porte palière, dans l'entrée.
  baie('porte-entree', 'door', 3.3, 6, 4.23, 6, 2.04),
  // L'entrée s'ouvre sur le séjour par un passage sans porte.
  baie('passage', 'opening', 3.2, 4.2, 4.6, 4.2, 2.1, 0, true),
  baie('porte-bureau', 'door', 2.6, 4.7, 2.6, 5.53, 2.04),
  baie('porte-chambre', 'door', 5, 2.5, 5, 3.33, 2.04),
  baie('porte-sde', 'door', 5, 4.6, 5, 5.33, 2.04),
  // La lumière : deux fenêtres au séjour, une à la chambre, une au bureau,
  // et le petit châssis haut de la salle d'eau. TOUS LES LINTEAUX À 2,15 M,
  // comme dans tout logement : le contrôle des volets s'y fie (voir
  // `linteauxRabotes`), et la vitrine ne doit pas s'accuser elle-même.
  baie('fenetre-sejour', 'window', 0.8, 0, 2.2, 0, 1.2, 0.95),
  baie('porte-fenetre', 'window', 3.1, 0, 4.5, 0, 2.15, 0),
  baie('fenetre-chambre', 'window', 6, 0, 7.2, 0, 1.2, 0.95),
  baie('fenetre-bureau', 'window', 0, 4.6, 0, 5.6, 1.2, 0.95),
  baie('fenetre-sde', 'window', 8, 4.5, 8, 5.1, 0.6, 1.55),
];

/*
  LES PORTES BATTENT — revue des six testeurs : l'exemple montrait ses portes
  comme de simples trous, sans battant ni arc, alors que le plan sait les
  dessiner. Il ne lui manquait que de savoir DE QUELLE PIÈCE chacune est la
  porte (le battant s'ouvre vers elle) : un vrai relevé le dit, l'exemple ne
  le disait pas. Et le bord qui pivote, posé comme le menuisier l'aurait
  fait — les paumelles à l'opposé de l'interrupteur, qui est du côté de la
  poignée, et le battant rangé contre le mur sans balayer un meuble.
*/
const PORTES: Record<string, { dans: string; pivot: 'a' | 'b' }> = {
  // L'interrupteur de l'entrée est côté bureau (x = 2,6) : poignée en a.
  'porte-entree': { dans: 'Entrée', pivot: 'b' },
  // Celui du bureau est vers le sud (z = 5,75) : poignée en b.
  'porte-bureau': { dans: 'Bureau', pivot: 'a' },
  // Celui de la chambre est au nord de la porte (z = 2,3) : poignée en a.
  'porte-chambre': { dans: 'Chambre', pivot: 'b' },
  // Celui de la salle d'eau est au sud de la porte (z = 5,55) : poignée en b.
  'porte-sde': { dans: 'Salle d’eau', pivot: 'a' },
};

/** Le nom et la nature de chaque pièce, retrouvée par un point qui y est. */
const PIECES: { nom: string; kind?: RoomKind; ici: { x: number; z: number } }[] = [
  /*
    UNE CUISINE OUVERTE SE NOMME — revue « Gérard » : « Séjour », type séjour,
    avec frigo, meuble bas et plaque : le contrôle n'y voyait pas de cuisine,
    et l'exemple se disait conforme sans ses six socles, ses spécialisés ni
    son 32 A. Elle porte maintenant son nom et son type, et l'installation
    qui va avec.
  */
  { nom: 'Séjour-cuisine', kind: 'sejourCuisine', ici: { x: 2.5, z: 2 } },
  { nom: 'Chambre', kind: 'bedroom', ici: { x: 6.5, z: 1.8 } },
  { nom: 'Salle d’eau', kind: 'bathroom', ici: { x: 6.5, z: 4.8 } },
  { nom: 'Bureau', ici: { x: 1.3, z: 5.1 } },
  { nom: 'Entrée', ici: { x: 3.8, z: 5.1 } },
];

const ITEMS = new Map<string, CatalogItem>(
  CATALOGUE.flatMap((f) => f.items).map((i) => [i.key, i]),
);

/** Le nu d'un REFEND : son axe, moins une demi-épaisseur. Une façade, elle,
 *  s'épaissit vers le dehors : son trait EST son nu (`facesDesMurs`), et un
 *  meuble posé « à l'axe moins NU » contre elle flottait à 7 cm du mur. */
const NU = WALL_T / 2;

/**
 * Un meuble du catalogue, posé en (x, z), tourné de `quarts` quarts de tour.
 * Tourné, il échange largeur et profondeur à l'écran — on le pose donc en
 * pensant à son emprise réelle.
 */
const meuble = (key: string, x: number, z: number, quarts = 0): ObjectData => {
  const item = ITEMS.get(key);
  if (!item) throw new Error(`Meuble inconnu du catalogue : ${key}`);
  const t = catalogTransform(item, x, z, 0);
  const yaw = (Math.PI / 2) * quarts;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  t[0] = cos;
  t[2] = sin;
  t[8] = -sin;
  t[10] = cos;
  return {
    id: `exemple-${key}-${Math.round(x * 100)}-${Math.round(z * 100)}`,
    category: item.category,
    width: item.w,
    depth: item.d,
    height: item.h,
    transform: t,
    modele: item.key,
    matiere: item.matiere,
  };
};

/*
  CHAQUE MEUBLE FAIT FACE À LA PIÈCE — relevé du patron : « le placement des
  meubles n'est pas cohérent : le canapé et la table devant une porte, un
  siège pas face au bureau mais tourné sur le côté ».

  L'avant d'un meuble est son côté −z (voir `furniture3d`, `modeles3d`) ; un
  quart de tour le tourne vers l'est, deux vers le sud, trois vers l'ouest.
  Les fronts de cuisine, le canapé, la tête de lit, les chevets, la
  bibliothèque, la vasque et la moitié des chaises regardaient LE MUR : les
  caisses ne le montraient pas, les vrais modèles si. Et le coin salon bouchait
  la porte de la chambre, le fauteuil le passage vers l'entrée.
*/
const OBJECTS: ObjectData[] = [
  // Séjour — la cuisine ouverte le long du mur nord, façades vers la pièce.
  // Deux millimètres de jeu au mur : retourné d'un demi-tour, un meuble posé
  // pile au nu le « mordrait » d'une erreur d'arrondi.
  /*
    UN PLAN DE TRAVAIL HORS DE LA FENÊTRE — revue « Gérard » : tout le plan
    passait sous la fenêtre du séjour, et aucun socle ne pouvait le
    surplomber. Le meuble bas sous la fenêtre (le coin évier), puis le four
    sous plaque, puis un caisson de 60 jusqu'au tableau de la porte-fenêtre :
    c'est lui qui porte les prises du plan.
  */
  meuble('frigo', 0.07 + 0.3, 0.332, 2),
  meuble('meubleBas120', 1.272, 0.302, 2),
  meuble('fourEtPlaque', 2.174, 0.302, 2),
  meuble('meubleBas', 2.776, 0.302, 2),
  // La table, ses quatre chaises tournées vers elle.
  meuble('tableRepas', 1.3, 2.1),
  meuble('chaise', 0.85, 1.4, 2),
  meuble('chaise', 1.75, 1.4, 2),
  meuble('chaise', 0.85, 2.8),
  meuble('chaise', 1.75, 2.8),
  // Le coin salon, dos au refend — ENTRE la porte-fenêtre et la porte de la
  // chambre, sans boucher ni l'une ni l'autre.
  meuble('tapis', 3.75, 1.5, 1),
  meuble('canape2', 5 - NU - 0.44, 1.5, 3),
  meuble('tableBasse', 3.45, 1.5, 1),
  // Le fauteuil face au canapé, de l'autre côté de la table basse ; le
  // passage vers l'entrée reste libre derrière lui.
  meuble('fauteuil', 3.75, 2.95),
  meuble('plante', 0.3, 3.85),
  // Chambre — le lit, tête au mur est, entre ses deux chevets.
  meuble('lit140', 8 - 0.995, 1.8, 3),
  meuble('chevet', 8 - 0.175, 0.82, 3),
  meuble('chevet', 8 - 0.175, 2.78, 3),
  meuble('armoire2p', 5 + NU + 0.29, 0.75, 1),
  // Salle d'eau — la douche dans l'angle, ouverte vers la pièce.
  meuble('douche', 8 - 0.46, 3.6 + NU + 0.46, 3),
  meuble('meubleVasque', 6.15, 3.6 + NU + 0.26, 2),
  meuble('wc', 7.45, 6 - 0.35),
  meuble('ll', 6.3, 6 - 0.3),
  // Bureau, sous la fenêtre ouest — et le fauteuil face à lui.
  meuble('bureau', 0.31, 5.1, 1),
  meuble('fauteuilBureau', 0.95, 5.1, 3),
  meuble('biblio', 1.75, 4.2 + NU + 0.14, 2),
  // Entrée.
  meuble('plante', 4.62, 5.55),
];

/*
  L'INSTALLATION ÉLECTRIQUE — relevé du patron : « ajoute sur le plan
  d'exemple des éléments électriques aussi, avec des positionnements bien
  pensés (prise derrière le frigo pour son alimentation, sortie de câble
  derrière le meuble de la plaque, et autres) ».

  Posée comme un électricien la poserait, et conforme au contrôle NF C 15-100
  de l'application (voir `exemple.test`) :
  - chaque appareil ménager a son alimentation DERRIÈRE lui — la prise du
    frigo, la sortie de câble de la plaque, le 20 A du lave-linge au-dessus
    de la machine, hors des volumes de la douche ;
  - chaque pièce a son point lumineux, commandé depuis sa porte ;
  - les prises vont où l'on branche — une double compte pour UN socle, comme
    le veut la norme : de part et d'autre du lit au-dessus
    des chevets, la box et la lampe au bout du canapé, le bureau à hauteur
    de plan, le rasoir à côté du miroir ;
  - le tableau près de la porte d'entrée, le détecteur de fumée dans la
    circulation, la VMC qui extrait en salle d'eau.
*/

/** Vers où regarde la face qui porte l'appareil — le côté de la pièce. */
const VERS = {
  nord: { x: 0, z: -1 },
  sud: { x: 0, z: 1 },
  est: { x: 1, z: 0 },
  ouest: { x: -1, z: 0 },
} as const;

/**
 * Un appareil posé sur le mur qui passe par (x, z) — un point de son AXE —,
 * sur la face qui regarde `vers`, à `hauteur` d'axe (sa hauteur usuelle par
 * défaut). Les murs sont retrouvés par la géométrie : leurs identifiants
 * naissent du découpage aux jonctions.
 */
const appareil = (
  id: string,
  kind: FixtureKind,
  x: number,
  z: number,
  vers: keyof typeof VERS,
  hauteur: number = FIXTURES[kind].std,
  commands?: string[],
  usage?: string,
): Fixture => {
  for (const w of WALLS) {
    const len = segLength(w);
    const ux = (w.b.x - w.a.x) / len;
    const uz = (w.b.z - w.a.z) / len;
    const along = (x - w.a.x) * ux + (z - w.a.z) * uz;
    const ecart = Math.abs((x - w.a.x) * -uz + (z - w.a.z) * ux);
    if (ecart > 0.01 || along <= 0 || along >= len) continue;
    // La normale du mur, celle de `side = 1` (`perpOf`).
    const n = { x: -uz, z: ux };
    const side = VERS[vers].x * n.x + VERS[vers].z * n.z > 0 ? 1 : -1;
    return {
      id: `exemple-${id}`,
      kind,
      wallId: w.id,
      along,
      height: hauteur,
      side,
      ...(commands ? { commands: commands.map((c) => `exemple-${c}`) } : {}),
      ...(usage ? { usage } : {}),
    };
  }
  throw new Error(`Aucun mur sous l'appareil d'exemple ${id}`);
};

const FIXTURES_EXEMPLE: Fixture[] = [
  // ── Séjour-cuisine — la cuisine ouverte d'abord.
  // Derrière le frigo, sa prise ; derrière le four sous plaque, la sortie
  // de câble de la cuisson (32 A, « PL ») et le 20 A du four.
  appareil('prise-frigo', 'prise', 0.44, 0, 'sud', 0.25),
  appareil('sortie-plaque', 'sortieCable', 2.05, 0, 'sud', 0.25, undefined, 'PL'),
  appareil('prise-four', 'prise20', 2.3, 0, 'sud', 0.25, undefined, 'FO'),
  // Sous le coin évier, l'attente 20 A du lave-vaisselle : les trois
  // spécialisés du logement (lave-linge, lave-vaisselle, four) sont posés.
  appareil('prise-lave-vaisselle', 'prise20', 1.5, 0, 'sud', 0.25, undefined, 'LV'),
  // Au-dessus du caisson de 60 : deux triples, quatre socles sur le plan,
  // ni au droit des feux, ni sous la fenêtre.
  appareil('plan-gauche', 'prise3', 2.68, 0, 'sud', 1.1),
  appareil('plan-droite', 'prise3', 2.91, 0, 'sud', 1.1),
  // Le coin repas : une double au mur, entre les chaises.
  appareil('prises-repas', 'prise2', 0, 2.1, 'est', 0.25),
  // Le bout du canapé : la box internet et la lampe.
  appareil('box-canape', 'rjPrise2', 5, 0.38, 'ouest', 0.25),
  // Entre la porte-fenêtre et l'angle : le lampadaire, le balcon.
  appareil('prise-fenetre', 'prise', 4.72, 0, 'sud', 0.25),
  // Le mur du passage : une prise dans l'angle, et en entrant, la commande
  // des deux points lumineux au-dessus d'une prise d'aspirateur.
  appareil('prise-angle', 'prise', 0.5, 4.2, 'nord', 0.25),
  appareil('prise-passage', 'prise', 2.95, 4.2, 'nord', 0.25),
  appareil('inter-sejour', 'inter2', 2.95, 4.2, 'nord', 1.1),
  // ── Chambre — une double au-dessus de chaque chevet, à portée de main
  // depuis le lit ; la commande à la porte ; RJ45 et prise en face du lit.
  appareil('chevet-nord', 'prise2', 8, 0.82, 'ouest', 0.7),
  appareil('chevet-sud', 'prise2', 8, 2.78, 'ouest', 0.7),
  appareil('inter-chambre', 'inter', 5, 2.3, 'est', 1.1),
  appareil('rj-chambre', 'rjPrise', 6, 3.6, 'nord', 0.25),
  // ── Salle d'eau — tout hors des volumes de la douche.
  // Le 20 A du lave-linge AU-DESSUS de la machine, qu'on débranche sans la
  // tirer ; la prise du rasoir à côté du miroir, l'applique au-dessus.
  // Nommé « LL » comme ses voisins (relevé « electricien ») : sans sigle,
  // son départ s'appelait « Spécialisé 20 A » sur l'unifilaire.
  appareil('prise-lave-linge', 'prise20', 6.3, 6, 'nord', 1.1, undefined, 'LL'),
  appareil('prise-miroir', 'prise', 5.45, 3.6, 'sud', 1.1),
  appareil('applique-miroir', 'applique', 6.15, 3.6, 'sud', 1.9, ['inter-sde']),
  appareil('inter-sde', 'inter2', 5, 5.55, 'est', 1.1),
  // ── Bureau — l'ensemble RJ45 + double au-dessus du plan, une prise près
  // de la porte, la commande à la porte.
  appareil('bureau-plan', 'rjPrise2', 0.45, 6, 'nord', 1),
  appareil('prise-bureau', 'prise', 2.2, 6, 'nord', 0.25),
  // Contre la bibliothèque : la lampe de lecture, l'imprimante.
  appareil('prise-biblio', 'prise', 1, 4.2, 'sud', 0.25),
  appareil('inter-bureau', 'inter', 2.6, 5.75, 'ouest', 1.1),
  // ── Entrée — le tableau (la GTL) à côté de la porte palière, la commande
  // à portée de main en entrant, une prise pour l'aspirateur.
  appareil('tableau', 'tableau', 2.98, 6, 'nord', 1.35),
  appareil('inter-entree', 'inter', 2.6, 5.75, 'est', 1.1),
  appareil('prise-entree', 'prise', 5, 4.42, 'ouest', 0.25),
];

/** Au plafond : la pièce se retrouve à la pose, par le point. */
const PLAFOND_EXEMPLE: { id: string; kind: CeilingKind; at: { x: number; z: number }; commands?: string[] }[] = [
  // Un point au-dessus de la table, un au-dessus du coin salon.
  { id: 'dcl-repas', kind: 'dcl', at: { x: 1.3, z: 2.1 }, commands: ['inter-sejour'] },
  { id: 'dcl-salon', kind: 'dcl', at: { x: 3.75, z: 1.5 }, commands: ['inter-sejour'] },
  { id: 'dcl-chambre', kind: 'dcl', at: { x: 6.5, z: 1.8 }, commands: ['inter-chambre'] },
  { id: 'dcl-sde', kind: 'dcl', at: { x: 6.5, z: 4.8 }, commands: ['inter-sde'] },
  // La bouche d'extraction, au-dessus des WC : c'est là que l'air vicié part.
  { id: 'vmc-sde', kind: 'vmc', at: { x: 7.45, z: 5.4 } },
  { id: 'dcl-bureau', kind: 'dcl', at: { x: 1.3, z: 5.1 }, commands: ['inter-bureau'] },
  { id: 'dcl-entree', kind: 'dcl', at: { x: 3.6, z: 5.1 }, commands: ['inter-entree'] },
  // Le détecteur de fumée, dans la circulation — jamais en cuisine ni en
  // salle d'eau, où la vapeur le déclencherait pour rien.
  { id: 'daaf', kind: 'daaf', at: { x: 4.3, z: 4.8 } },
];

/** Tout ce qu'il faut pour ouvrir l'exemple comme on ouvre un relevé. */
export function appartementExemple() {
  const detectees = detectRooms(WALLS);
  const parts = roomParts(
    WALLS,
    detectees.map((r, i) => ({ id: `exemple-piece-${i + 1}`, wallIds: r.wallIds })),
  );
  const rooms = parts.map((p, i) => {
    const pts = p.surface?.pts ?? [];
    const qui = PIECES.find((x) => pointInPolygon(x.ici, pts));
    return {
      id: p.roomId,
      name: qui?.nom ?? `Pièce ${i + 1}`,
      wallIds: detectees[i].wallIds,
      ...(qui?.kind ? { kind: qui.kind } : {}),
    };
  });
  // Chaque meuble retient sa pièce, comme à la pose au doigt.
  const objects = OBJECTS.map((o) => {
    const ici = { x: o.transform[12], z: o.transform[14] };
    const part = parts.find((p) => pointInPolygon(ici, p.surface?.pts ?? []));
    return { ...o, roomId: part?.roomId };
  });
  // Le plafond appartient à la pièce qui le porte : son circuit, son métré.
  const ceiling: CeilingFixture[] = PLAFOND_EXEMPLE.flatMap((c) => {
    const part = parts.find((p) => pointInPolygon(c.at, p.surface?.pts ?? []));
    if (!part) return [];
    return [
      {
        id: `exemple-${c.id}`,
        kind: c.kind,
        roomId: part.roomId,
        at: c.at,
        ...(c.commands ? { commands: c.commands.map((x) => `exemple-${x}`) } : {}),
      },
    ];
  });
  // Chaque porte connaît sa pièce — c'est vers elle que bat son vantail.
  const openings: WallSeg[] = OPENINGS.map((o) => {
    const porte = PORTES[o.id];
    const piece = porte ? rooms.find((r) => r.name === porte.dans) : undefined;
    return piece ? { ...o, roomId: piece.id, pivot: porte.pivot } : o;
  });
  return { walls: WALLS, openings, rooms, objects, fixtures: FIXTURES_EXEMPLE, ceiling };
}
