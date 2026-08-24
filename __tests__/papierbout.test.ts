/**
 * SCANNER UN PLAN PAPIER — LE PARCOURS ENTIER.
 *
 * On imprime un appartement dont on connaît les cotes au centimètre, on le
 * photographie de travers et à l'ombre, on le relit, et l'on VERSE LE
 * RÉSULTAT DANS L'APPLICATION comme s'il sortait d'un scan LiDAR. C'est le
 * seul banc qui prouve la fonction promise : « transformer un plan lu par
 * notre app en un vrai plan 2D/3D, avec les éléments électriques, mesures
 * respectées, cotes ».
 *
 * CE QUI EST VÉRIFIÉ, ET DANS QUEL ORDRE D'IMPORTANCE :
 *
 *   1. LES MESURES. Un plan d'électricien faux d'un dixième est pire qu'un
 *      plan absent : on commande la gaine dessus, on perce dessus, on
 *      chiffre dessus. Le T1 doit ressortir à 4,00 m sur 3,00 m.
 *   2. LE CHEMIN. Le relevé passe par `finalize`, comme un scan : les
 *      pièces se détectent, les murs se soudent, l'électricité s'ancre par
 *      le même code que le viseur. Un plan papier n'ouvre PAS un deuxième
 *      chemin dans l'application.
 *   3. LES ÉLÉMENTS. Ce sont NOS appareils — `Fixture`, `CeilingFixture` —
 *      posés sur NOS murs, pas une couche de dessin importée à côté.
 *   4. CE QU'ON NE SAIT PAS. Les avertissements doivent dire l'échelle
 *      estimée et les symboles non reconnus, en clair.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { useScanStore } from '../src/store/scanStore';
import { photographierPlanche } from '../src/papier/simulateur';
import { T1 } from '../src/papier/planches';
import { lirePlanPapier } from '../src/papier/lecture';

const st = () => useScanStore.getState();

const lire = (reglage = {}) =>
  lirePlanPapier(photographierPlanche(T1, { echelle: 100, ...reglage }));

describe('la lecture d’un plan papier, de la photo au relevé', () => {
  const plan = lire();

  it('rend l’échelle du plan, tirée de ses propres cotes', () => {
    expect(plan.echelle).not.toBeNull();
    expect(plan.echelle!.origine).toBe('cotes');
    expect(plan.echelle!.pxParMetre).toBeGreaterThan(95);
    expect(plan.echelle!.pxParMetre).toBeLessThan(105);
  });

  it('rend les murs À LEURS COTES : quatre mètres sur trois', () => {
    const murs = (plan.resultat.surfaces ?? []).filter((s) => s.type === 'wall');
    expect(murs.length).toBeGreaterThanOrEqual(4);
    const longueurs = murs.map((m) => m.length).sort((a, b) => b - a);
    // Deux murs de 4 m, deux de 3 m, plus le refend de 3 m.
    expect(longueurs[0]).toBeGreaterThan(3.9);
    expect(longueurs[0]).toBeLessThan(4.1);
    expect(longueurs[longueurs.length - 1]).toBeGreaterThan(2.9);
  });

  it('rend la porte et la fenêtre, à leurs largeurs de menuiserie', () => {
    const baies = (plan.resultat.surfaces ?? []).filter((s) => s.type !== 'wall');
    const porte = baies.find((b) => b.type === 'door');
    const fenetre = baies.find((b) => b.type === 'window');
    expect(porte).toBeDefined();
    expect(fenetre).toBeDefined();
    expect(porte!.length).toBeGreaterThan(0.7);
    expect(porte!.length).toBeLessThan(0.95);
    expect(fenetre!.length).toBeGreaterThan(1.05);
    expect(fenetre!.length).toBeLessThan(1.35);
    // La fenêtre est posée sur son allège, pas au ras du sol : c'est cette
    // hauteur-là que la vue 3D et l'élévation liront.
    expect(fenetre!.transform![13]).toBeGreaterThan(1.2);
  });

  it('rend les appareils par le chemin du viseur, et lit les noms de pièces', () => {
    expect((plan.resultat.elec ?? []).length).toBeGreaterThanOrEqual(3);
    expect(plan.etiquettes.map((e) => e.texte)).toContain('SEJOUR');
  });
});

describe('le relevé versé dans l’application', () => {
  beforeEach(() => {
    st().reset();
  });

  it('donne un plan complet : murs soudés, pièces détectées, appareils posés', () => {
    const plan = lire();
    st().finalize(plan.resultat);
    const apres = st();

    // Les murs sont là, et le logement se referme en pièces.
    expect(apres.walls.filter((w) => w.type === 'wall').length).toBeGreaterThanOrEqual(4);
    expect(apres.rooms.length).toBeGreaterThanOrEqual(1);
    // Les menuiseries sont passées en ouvertures, pas en murs.
    expect(apres.openings.length).toBeGreaterThanOrEqual(2);

    /*
      LES COTES ONT SURVÉCU AU PASSAGE — mais on les mesure sur l'EMPRISE.

      `finalize` découpe les faces aux jonctions, comme pour un relevé LiDAR :
      le mur de quatre mètres que traverse le refend en ressort en deux
      morceaux de 2,60 et 1,40, et le plus long mur du plan devient celui de
      trois. C'est le comportement voulu de l'application, et le mesurer
      autrement reviendrait à tester le lecteur à travers un découpage qui ne
      le concerne pas. L'emprise, elle, ne ment pas.
    */
    const xs = apres.walls.flatMap((w) => [w.a.x, w.b.x]);
    const zs = apres.walls.flatMap((w) => [w.a.z, w.b.z]);
    const largeur = Math.max(...xs) - Math.min(...xs);
    const profondeur = Math.max(...zs) - Math.min(...zs);
    expect(largeur).toBeGreaterThan(3.85);
    expect(largeur).toBeLessThan(4.15);
    expect(profondeur).toBeGreaterThan(2.85);
    expect(profondeur).toBeLessThan(3.15);

    /*
      ET CE SONT NOS APPAREILS. `finalize` a fait passer `result.elec` par
      `ancrerElec` — le même code qui pose ce qu'on vise pendant un relevé
      LiDAR. Les prises sont donc des `Fixture` accrochées à un `wallId`, à
      une cote sur le mur et à une hauteur du métier ; le point lumineux est
      un `CeilingFixture` rattaché à sa pièce. Rien d'importé à côté.
    */
    const poses = apres.fixtures.length + apres.ceiling.length;
    expect(poses).toBeGreaterThanOrEqual(2);
    for (const f of apres.fixtures) {
      expect(apres.walls.some((w) => w.id === f.wallId)).toBe(true);
      expect(f.height).toBeGreaterThan(0);
    }
    for (const c of apres.ceiling) {
      expect(apres.rooms.some((r) => r.id === c.roomId)).toBe(true);
    }
  });

  it('tient une photo de travers, à l’ombre et grenue', () => {
    const plan = lire({ rotation: 5, ombre: 0.7, bruit: 0.15, flou: 1, graine: 11 });
    st().finalize(plan.resultat);
    const xs = st().walls.flatMap((w) => [w.a.x, w.b.x]);
    const zs = st().walls.flatMap((w) => [w.a.z, w.b.z]);
    // Cinq pour cent d'écart sur quatre mètres, c'est vingt centimètres :
    // c'est la limite de ce qu'un métré peut encaisser.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3.8);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(4.2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(2.8);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(3.2);
  });

  it('dit ce qu’il ne sait pas au lieu de le taire', () => {
    // Une planche sans une seule cote écrite : l'échelle se cale alors sur
    // les portes, et cela DOIT s'annoncer — un plan estimé ne se chiffre pas
    // comme un plan coté.
    const muet = lirePlanPapier(
      photographierPlanche({ ...T1, cotes: [], etiquettes: [] }, { echelle: 100 }),
    );
    expect(muet.echelle?.origine).toBe('portes');
    expect(muet.avertissements.join(' ')).toMatch(/Échelle estimée/);
  });
});
