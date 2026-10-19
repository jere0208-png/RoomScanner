/**
 * CHAQUE FACE ÉQUIPÉE A SON ÉLÉVATION, ET CHAQUE MUR SON VRAI NOM.
 *
 * Les quatre revues du dossier PDF l'ont relevé, chacune sur ses plans :
 *
 *   — « 7 appareils sur 23 ne sont cotés nulle part » : ceux de l'AUTRE face
 *     d'une cloison. Le dossier faisait une feuille par MUR, vue de la pièce
 *     qui l'a relevé ; ce qui était posé de l'autre côté n'y paraissait
 *     qu'en clair, sans cote — parfois caché sous le disque de la prise de
 *     devant. Un pro fait une élévation par face équipée.
 *
 *   — « les murs 6, 7, 8 et 9 sont tous la face sud du séjour, titrés mur
 *     ouest, sud-ouest, sud-est et est » : le nom venait de la direction du
 *     centre de la pièce vers le milieu du mur. Dans une pièce en longueur,
 *     c'est la position du tronçon, pas le côté de la pièce.
 *
 *   — les gaines, toutes du même bleu, quand le tableau de tirage juste
 *     au-dessus distingue chaque circuit par sa couleur.
 */
import { buildScanPdf, motifDuRepere } from '../src/export/pdf';
import { wallCardinal } from '../src/geometry/naming';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { fixturePlacement, materialList, roomInputsOf, wallToRooms } from '../src/geometry/nfc15100';
import { fixtureMarks, markColor, multiWire, schemaRows } from '../src/geometry/schema';
import { planRoutes } from '../src/geometry/elecplan';
import { pieceDuCote, type Fixture } from '../src/geometry/electrical';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, roomId = 'a'): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});

/*
  Deux pièces côte à côte, 4 × 3 chacune, séparées par la cloison « c » :
  le séjour à l'ouest (x de 0 à 4), la chambre à l'est (x de 4 à 8).
*/
const W: WallSeg[] = [
  mur('n1', 0, 0, 4, 0),
  mur('c', 4, 0, 4, 3),
  mur('s1', 4, 3, 0, 3),
  mur('o', 0, 3, 0, 0),
  mur('n2', 4, 0, 8, 0, 'b'),
  mur('e', 8, 0, 8, 3, 'b'),
  mur('s2', 8, 3, 4, 3, 'b'),
];
const R = [
  { id: 'a', name: 'Séjour', wallIds: ['n1', 'c', 's1', 'o'] },
  { id: 'b', name: 'Chambre', wallIds: ['n2', 'e', 's2', 'c'] },
];

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};
const flux = (src: string): string[] => {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const a = src.indexOf('stream\n', i);
    if (a < 0) break;
    const b = src.indexOf('\nendstream', a);
    out.push(src.slice(a + 7, b));
    i = b + 10;
  }
  return out;
};
const texte = (s: string) =>
  (s.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? []).map((m) => m.slice(1, m.lastIndexOf(')'))).join(' | ');

const dossier = (fixtures: Fixture[], extra: Record<string, unknown> = {}) =>
  latin1(
    buildScanPdf(
      {
        name: 'Deux pièces',
        walls: W,
        openings: [],
        objects: [],
        rooms: R,
        fixtures,
        roomNames: { a: 'Séjour', b: 'Chambre' },
        north: 0,
      } as never,
      false,
      { metre: false, elevations: true, ...extra } as never,
    ),
  );
// Les feuilles d'élévation, pas le plan — sa légende parle aussi des élévations.
const elevations = (src: string) => flux(src).filter((p) => texte(p).includes('lévation') && !texte(p).includes('Plan d'));

/** De quel côté de la cloison est le séjour — lu sur le plan, pas supposé. */
const SEJOUR: 1 | -1 = pieceDuCote(W[1], 1, W, R) === 'a' ? 1 : -1;
const CHAMBRE: 1 | -1 = SEJOUR === 1 ? -1 : 1;

describe('une élévation par face équipée', () => {
  it('un appareil de chaque côté de la cloison : ses deux faces, chacune vue de sa pièce', () => {
    const fx: Fixture[] = [
      { id: 'p1', kind: 'prise', wallId: 'c', along: 1, height: 0.25, side: SEJOUR },
      { id: 'i2', kind: 'inter', wallId: 'c', along: 2.2, height: 1.1, side: CHAMBRE },
    ];
    const src = dossier(fx);
    // Les deux faces d'une cloison se partagent une feuille : on voit d'un
    // coup d'œil qu'on ne perce pas dos à dos.
    const pages = elevations(src);
    expect(pages).toHaveLength(1);
    const t = texte(pages[0]);
    const titres = t.split(' | ').filter((m) => m.includes('lévation'));
    expect(titres).toHaveLength(2);
    expect(titres.some((x) => x.includes('côté Séjour'))).toBe(true);
    expect(titres.some((x) => x.includes('côté Chambre'))).toBe(true);
    // Et l'interrupteur de la chambre y est COTÉ : sa hauteur, 110 — sous
    // le titre de la chambre, pas en clair sous celui du séjour.
    const apresChambre = t.slice(t.indexOf(titres.find((x) => x.includes('côté Chambre'))!));
    const avantLAutre = apresChambre.includes('côté Séjour') ? apresChambre.slice(0, apresChambre.indexOf('côté Séjour')) : apresChambre;
    expect(avantLAutre).toMatch(/\| 110 \|/);
    // Le cartouche le dit comme le sommaire : le mur et ses deux pièces.
    expect(t).toContain('Mur 1 · Séjour / Chambre');
  });

  it('une seule face équipée : une seule feuille pour ce mur', () => {
    const fx: Fixture[] = [{ id: 'p1', kind: 'prise', wallId: 'c', along: 1, height: 0.25, side: SEJOUR }];
    const pages = elevations(dossier(fx));
    expect(pages).toHaveLength(1);
  });

  it('un appareil posé du seul côté de la chambre ne donne plus une feuille vue du séjour', () => {
    // L'interrupteur est du côté de la chambre. La feuille doit la regarder.
    const fx: Fixture[] = [{ id: 'i2', kind: 'inter', wallId: 'c', along: 2.2, height: 1.1, side: CHAMBRE }];
    const pages = elevations(dossier(fx));
    expect(pages).toHaveLength(1);
    const t = texte(pages[0]);
    expect(t.split(' | ')[0]).toContain('côté Chambre');
    expect(t).toMatch(/\| 110 \|/);
    // Plus de fantôme « en clair » : il est devant.
    expect(t).not.toContain('autre face');
  });
});

describe('le mur se nomme par le côté de la pièce qu’il ferme', () => {
  // Une enfilade : 10 × 1,2. Le mur sud en trois tronçons.
  const centre = { x: 5, z: 0.6 };
  const tronçons = [mur('s-o', 3, 1.2, 0, 1.2), mur('s-m', 7, 1.2, 3, 1.2), mur('s-e', 10, 1.2, 7, 1.2)];

  it('les trois tronçons du mur sud sont tous « sud »', () => {
    for (const w of tronçons) expect(wallCardinal(w, centre, 0)).toBe('sud');
  });

  it('et les pignons restent est et ouest', () => {
    expect(wallCardinal(mur('pe', 10, 0, 10, 1.2), centre, 0)).toBe('est');
    expect(wallCardinal(mur('po', 0, 1.2, 0, 0), centre, 0)).toBe('ouest');
  });

  it('le côté de la pièce tranche quand le centre est dans l’alignement du mur', () => {
    // Le mur rentrant d'un L : le centre de la pièce tombe sur son prolongement.
    // La pièce est au nord du mur (côté −1 de (0,4)→(5,4)) : il la ferme au sud.
    const w = mur('r', 0, 4, 5, 4);
    expect(wallCardinal(w, { x: 7, z: 4 }, 0, -1)).toBe('sud');
    expect(wallCardinal(w, { x: 7, z: 4 }, 0, 1)).toBe('nord');
  });

  it('un pan coupé garde son aire de vent diagonale', () => {
    // Le coin nord-est d'une pièce de 5 × 4, coupé à 45°.
    expect(wallCardinal(mur('pc', 4, 0, 5, 1), { x: 2.5, z: 2 }, 0)).toBe('nord-est');
  });
});

describe('les gaines à la couleur de leur circuit', () => {
  it('chaque gaine prend la teinte de son repère, celle du tableau de tirage', () => {
    const fx: Fixture[] = [
      { id: 't', kind: 'tableau', wallId: 'o', along: 1, height: 1.35, side: 1 },
      { id: 'p1', kind: 'prise', wallId: 'n1', along: 1, height: 0.25, side: 1 },
      { id: 'i1', kind: 'inter', wallId: 's1', along: 1, height: 1.1, side: -1 },
    ];
    const parts = roomParts(W, R);
    const inputs = roomInputsOf(R, parts);
    const placement = fixturePlacement(fx, W, inputs);
    const list = materialList(inputs, fx, wallToRooms(inputs), placement);
    const rows = schemaRows(list.circuits, list.differentials, fx);
    const marks = fixtureMarks(list.circuits);
    const routes = planRoutes(W, R, parts, fx, placement)!;
    const src = latin1(
      buildScanPdf(
        {
          name: 'Deux pièces',
          walls: W,
          openings: [],
          objects: [],
          rooms: R,
          fixtures: fx,
          routes: routes.traces,
          roomNames: { a: 'Séjour', b: 'Chambre' },
        } as never,
        false,
        {
          metre: false,
          schemas: { rows, differentials: list.differentials, multi: list.circuits.map((c, i) => multiWire(c, fx, `C${i + 1}`)), marks },
        } as never,
      ),
    );
    const gaines = flux(src).find((p) => texte(p).includes('Tirage par circuit'))!;
    expect(gaines).toBeTruthy();
    const rgb = (hex: string) =>
      [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')).join(' ');
    // Le tireté de chaque gaine porte la teinte du circuit de son appareil.
    for (const f of ['p1', 'i1']) {
      const teinte = rgb(markColor(marks.get(f)!));
      // Et son tireté propre, distinct en noir et blanc (revue « dessins »).
      expect(gaines).toContain(`[${motifDuRepere(marks.get(f)!).join(' ')}] 0 d ${teinte} RG`);
    }

    /*
      REVUE « KARIM » : dix circuits, six lignes au tableau, le reste coupé
      sans un mot. Sur deux colonnes, puis un renvoi au schéma.
    */
    const beaucoup = Array.from({ length: 14 }, (_, k) => ({ ...rows[0], mark: `C${k + 1}`, label: `Circuit ${k + 1}` }));
    const src14 = latin1(
      buildScanPdf(
        { name: 'Deux pièces', walls: W, openings: [], objects: [], rooms: R, fixtures: fx, routes: routes.traces, roomNames: { a: 'Séjour', b: 'Chambre' } } as never,
        false,
        { metre: false, schemas: { rows: beaucoup, differentials: list.differentials, multi: [], marks } } as never,
      ),
    );
    const t14 = texte(flux(src14).find((p) => texte(p).includes('Tirage par circuit'))!);
    // Deux colonnes de sept : les quatorze tiennent, sans renvoi.
    for (let k = 1; k <= 14; k++) expect(t14).toContain(`Circuit ${k} `.trim());
    expect(t14).not.toContain('voir le sch');
  });
});
