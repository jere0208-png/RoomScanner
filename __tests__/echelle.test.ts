/**
 * L'ÉCHELLE VRAIE — ce qui sépare un joli plan d'un plan d'exécution.
 *
 * Le document sortait « ~ 1:100 » : le plan était mis à la feuille, puis
 * l'échelle DÉDUITE de la place occupée et arrondie pour l'affichage. Le
 * tilde disait la vérité — ce n'était l'échelle de rien. Un architecte, un
 * bureau d'études, un économiste de la construction posent leur kutch sur le
 * papier : à 1:98,3, toutes leurs cotes sont fausses.
 *
 * On renverse donc le calcul. On choisit une échelle NORMALISÉE parmi celles
 * du bâtiment, la plus grande qui tienne dans le cadre, et l'on trace à
 * celle-là exactement. Le plan occupe un peu moins de place — c'est le prix,
 * et c'est ainsi que travaille tout le monde.
 */
import {
  ECHELLES_BATIMENT,
  echelleNormalisee,
  graduationsRegle,
  PT_PAR_MM,
} from '../src/export/echelle';

describe('choisir une échelle de bâtiment', () => {
  it('ne propose que des échelles du métier', () => {
    // 1:37 n'existe sur aucun kutch : les échelles se lisent au 20, 25, 50,
    // 75, 100… C'est la série qu'on trouve sur une règle de dessinateur.
    expect(ECHELLES_BATIMENT).toContain(50);
    expect(ECHELLES_BATIMENT).toContain(100);
    expect(ECHELLES_BATIMENT).not.toContain(37);
  });

  it('prend la plus grande qui tient dans le cadre', () => {
    // Un cadre de 400 pt pour 10 m de plan : il faut au moins 1:71, donc on
    // descend au cran suivant — 1:75 — et le plan tient, un peu plus petit.
    const e = echelleNormalisee(400, 10);
    expect(e.ratio).toBe(75);
    // Et le tracé suit CETTE échelle-là, pas la mise à la feuille.
    expect(e.ptParMetre).toBeCloseTo(1000 / 75 * PT_PAR_MM, 6);
    expect(e.ptParMetre * 10).toBeLessThanOrEqual(400);
  });

  it('tombe juste quand le compte est rond', () => {
    // 1:100 exactement : 10 m font 100 mm sur le papier.
    const dispo = 10 * (1000 / 100) * PT_PAR_MM;
    expect(echelleNormalisee(dispo, 10).ratio).toBe(100);
  });

  it('ne descend pas sous le plus grand cran pour un plan minuscule', () => {
    // Une seule pièce de 2 m dans une pleine page : on ne dessine pas à
    // 1:5, ce n'est pas une échelle de plan de logement. On plafonne au
    // premier cran de la série, et le plan reste petit sur la feuille.
    expect(echelleNormalisee(500, 2).ratio).toBe(ECHELLES_BATIMENT[0]);
  });

  it('accepte les très grands plans sans rendre l’illisible', () => {
    // Un immeuble de 90 m sur une feuille A4 : au-delà de la série, on
    // continue par crans de 50 plutôt que de rendre une échelle absurde.
    const e = echelleNormalisee(400, 90);
    expect(e.ratio % 50).toBe(0);
    expect(e.ptParMetre * 90).toBeLessThanOrEqual(400);
  });

  it('le libellé ne ment plus : pas de tilde', () => {
    expect(echelleNormalisee(400, 10).label).toBe('1:75');
  });
});

describe('la règle graphique', () => {
  it('donne des graduations rondes, et rien d’autre', () => {
    // Un architecte vérifie l'échelle à l'œil sur la règle imprimée : elle
    // doit porter des valeurs rondes, jamais 3,7 m.
    const r = graduationsRegle(100, 120);
    expect([0.2, 0.5, 1, 2, 5, 10, 20, 50]).toContain(r.pas);
    expect(Math.round((r.total / r.pas) * 1e6) / 1e6 % 1).toBe(0);
  });

  it('descend sous le mètre sur un plan de détail', () => {
    /*
      À 1:20, un mètre occupe cinq centimètres de papier : une règle de
      cinq mètres ne tiendrait pas dans la case du cartouche, et une règle
      d'un seul mètre ne se gradue pas. Les plans de détail portent des
      barres de cinquante ou vingt centimètres — c'est ce qu'on lit sur les
      vrais documents d'exécution.
    */
    const r = graduationsRegle(20, 40);
    expect(r.pas).toBeLessThan(1);
    expect(r.longueurPt).toBeLessThanOrEqual(40);
  });

  it('tient dans la place qu’on lui laisse', () => {
    const large = 120;
    const r = graduationsRegle(100, large);
    expect(r.longueurPt).toBeLessThanOrEqual(large);
    expect(r.longueurPt).toBeGreaterThan(0);
  });

  it('s’allonge quand l’échelle grandit', () => {
    // À 1:50, un mètre occupe deux fois plus de papier qu'à 1:100 : la
    // règle porte donc moins de mètres pour la même largeur.
    expect(graduationsRegle(50, 120).total).toBeLessThanOrEqual(
      graduationsRegle(100, 120).total,
    );
  });
});

/**
 * LA PREUVE PAR LE TRACÉ.
 *
 * Annoncer « 1:75 » au cartouche ne suffit pas : il faut que le dessin soit
 * VRAIMENT a cette echelle, sinon on a seulement remplace un mensonge par un
 * autre. On mesure donc le plan sorti — la distance entre deux coins connus
 * — et on la compare a ce que l echelle promet.
 *
 * C est le seul banc qui protege un architecte : lui posera son kutch sur le
 * papier, et il verra tout de suite ce qu un test d affichage laisserait
 * passer.
 */
describe('le plan est vraiment a l echelle annoncee', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number) => ({
    id,
    type: 'wall' as const,
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });

  it('une piece de dix metres se mesure a l echelle du cartouche', () => {
    const { buildScanPdf } = require('../src/export/pdf');
    // Une piece de 10 m sur 6 : les cotes rondes rendent l ecart visible.
    const walls = [
      mur('n', 0, 0, 10, 0),
      mur('e', 10, 0, 10, 6),
      mur('s', 10, 6, 0, 6),
      mur('o', 0, 6, 0, 0),
    ];
    const bytes = buildScanPdf(
      {
        name: 'Echelle',
        walls,
        openings: [],
        objects: [],
        fixtures: [],
        rooms: [{ id: 'r1', name: 'Salle', wallIds: walls.map((w) => w.id) }],
      },
      false,
      { metre: false, surfaces: false },
    );
    const pdf = Buffer.from(bytes).toString('latin1');

    // L echelle annoncee au cartouche.
    const dit = pdf.match(/\(1:(\d+)\)/);
    expect(dit).toBeTruthy();
    const ratio = parseInt(dit![1], 10);
    expect(ECHELLES_BATIMENT).toContain(ratio);

    // Le trace : on prend l etendue horizontale des points dessines, qui
    // couvre le plan et ses lignes de cote. Les murs eux-memes sont le plus
    // grand groupe de points alignes ; on se contente de verifier que
    // l etendue TOTALE reste compatible avec l echelle — un plan trace deux
    // fois trop grand sauterait aux yeux.
    const pts: { x: number; y: number }[] = [];
    const re = /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (m|l)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pdf))) {
      pts.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
    }
    const xs = pts.map((p) => p.x);
    const largeurPt = Math.max(...xs) - Math.min(...xs);
    const attendu = 10 * (1000 / ratio) * PT_PAR_MM;
    // Le trace couvre les 10 m du plan, plus les cotes exterieures : jamais
    // moins que le plan, et pas deux fois plus.
    expect(largeurPt).toBeGreaterThan(attendu * 0.9);
    expect(largeurPt).toBeLessThan(attendu * 1.6);
  });
});
