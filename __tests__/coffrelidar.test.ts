/**
 * LE COFFRE DE VOLET ROULANT, LU DANS LE MAILLAGE LIDAR.
 *
 * Relevé du patron : « les coffrages de volets roulants, au-dessus des baies
 * en général, ne sont pas détectés par le lidar. Vois pourquoi. Pourtant il y
 * a bien un coffrage, et donc une forme différente d'un mur plat. »
 *
 * Pourquoi : RoomPlan rend des MURS PLANS. Tout relief de moins de vingt ou
 * trente centimètres — le coffre, la niche, le retour court — est lissé dans
 * le plan du mur. Le maillage LiDAR brut, lui, l'a vu : il était relevé à
 * chaque scan, mais on n'en lisait que le sol et le plafond.
 *
 * Le natif mesure maintenant, au-dessus de chaque baie, l'écart du maillage
 * au plan du mur, tranche de deux centimètres par tranche (`profilsAuDessus`) ;
 * ce banc tient la lecture de ce profil.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { avecCoffresDuLidar, coffreDuProfil, type ProfilDessus } from '../src/geometry/coffreLidar';
import type { WallSeg } from '../src/geometry/floorplan';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/**
 * Un profil fabriqué : `depuis` −10 cm, des tranches de 2 cm. `forme(v)` rend
 * l'écart (cm) à la hauteur `v` comptée depuis le haut de la baie (m).
 */
function profil(
  forme: (v: number) => number | null,
  temoin: (v: number) => number | null = () => 0,
  oriente = true,
): ProfilDessus {
  const pas = 0.02;
  const depuis = -0.1;
  const n = 50;
  const ecarts: number[] = [];
  const nombres: number[] = [];
  const ecartsTemoin: number[] = [];
  const nombresTemoin: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = depuis + (i + 0.5) * pas;
    const e = forme(v);
    ecarts.push(e ?? 0);
    nombres.push(e === null ? 0 : 30);
    const t = temoin(v);
    ecartsTemoin.push(t ?? 0);
    nombresTemoin.push(t === null ? 0 : 20);
  }
  return { pas, depuis, ecarts, nombres, temoin: ecartsTemoin, nombresTemoin, oriente };
}

/** Le coffre courant : 25 cm de haut, 18 cm de saillie, posé sur la baie. */
const COFFRE = (v: number) => (v < 0 ? -12 : v < 0.25 ? 18 : 0);

describe('la lecture du profil au-dessus d’une baie', () => {
  it('un coffre posé sur la baie : sa hauteur et sa saillie', () => {
    const c = coffreDuProfil(profil(COFFRE));
    expect(c).not.toBeNull();
    expect(c!.hauteur).toBeCloseTo(0.25, 1);
    expect(c!.saillie).toBeCloseTo(0.18, 2);
  });

  it('un mur plat au-dessus de la baie : rien', () => {
    expect(coffreDuProfil(profil((v) => (v < 0 ? -12 : 0)))).toBeNull();
  });

  it('le tableau de la baie, en retrait, n’est pas un coffre', () => {
    expect(coffreDuProfil(profil((v) => (v < 0.3 ? -15 : 0)))).toBeNull();
  });

  it('une saillie qui court aussi le long du mur voisin est une retombée, pas un coffre', () => {
    expect(coffreDuProfil(profil(COFFRE, (v) => (v >= 0 && v < 0.25 ? 18 : 0)))).toBeNull();
  });

  it('un témoin sans mesure (baie contre un angle) ne l’empêche pas', () => {
    expect(coffreDuProfil(profil(COFFRE, () => null))).not.toBeNull();
  });

  it('quelques tranches bruitées ne font pas un coffre', () => {
    expect(coffreDuProfil(profil((v) => (v > 0.1 && v < 0.14 ? 20 : 0)))).toBeNull();
  });

  it('un trou d’une tranche dans la mesure ne le coupe pas en deux', () => {
    const troue = (v: number) => (v > 0.11 && v < 0.13 ? null : COFFRE(v));
    expect(coffreDuProfil(profil(troue))!.hauteur).toBeCloseTo(0.25, 1);
  });

  it('volet à moitié descendu : la baie est cadrée sous le tablier, le coffre plus haut', () => {
    const c = coffreDuProfil(profil((v) => (v < 0.3 ? -4 : v < 0.52 ? 20 : 0)));
    expect(c).not.toBeNull();
    expect(c!.bas).toBeCloseTo(0.3, 1);
  });

  it('sans côté connu, l’écart se lit en valeur absolue', () => {
    expect(coffreDuProfil(profil((v) => (v < 0 ? 0 : v < 0.25 ? -18 : 0), () => 0, false))).not.toBeNull();
  });

  it('trop peu de points : on ne conclut pas', () => {
    const p = profil(COFFRE);
    p.nombres = p.nombres.map(() => 2);
    expect(coffreDuProfil(p)).toBeNull();
  });
});

describe('le coffre trouvé se pose sur sa baie', () => {
  const baie = (id: string, extra: Partial<WallSeg> = {}): WallSeg => ({
    id,
    type: 'window',
    a: { x: 0, z: 0 },
    b: { x: 1.2, z: 0 },
    height: 1.35,
    yCenter: 1.4,
    ...extra,
  });

  it('hauteur et saillie, au centimètre', () => {
    const [o] = avecCoffresDuLidar([baie('f1')], { f1: profil(COFFRE) });
    expect(o.coffre).toBeCloseTo(0.25, 1);
    expect(o.coffreSaillie).toBeCloseTo(0.18, 2);
  });

  it('un coffre déjà déclaré à la main garde sa hauteur', () => {
    const [o] = avecCoffresDuLidar([baie('f1', { coffre: 0.3 })], { f1: profil(COFFRE) });
    expect(o.coffre).toBe(0.3);
  });

  it('un mur, ou une baie sans profil, passe tel quel', () => {
    const mur: WallSeg = { ...baie('m1'), type: 'wall' };
    const sortie = avecCoffresDuLidar([mur, baie('f2')], { m1: profil(COFFRE) });
    expect(sortie[0]).toBe(mur);
    expect(sortie[1].coffre).toBeUndefined();
  });

  it('volet à moitié descendu : la baie remonte jusque sous le coffre', () => {
    const p = profil((v) => (v < 0.3 ? -4 : v < 0.52 ? 20 : 0));
    const avant = baie('f1');
    const [o] = avecCoffresDuLidar([avant], { f1: p });
    const haut = (s: WallSeg) => s.yCenter + s.height / 2;
    const bas = (s: WallSeg) => s.yCenter - s.height / 2;
    expect(haut(o) - haut(avant)).toBeCloseTo(0.3, 2);
    expect(bas(o)).toBeCloseTo(bas(avant), 6);
  });

  it('un linteau plat entre la baie et le coffre : la baie ne bouge pas', () => {
    const p = profil((v) => (v < 0 ? -12 : v < 0.12 ? 0 : v < 0.36 ? 18 : 0));
    const [o] = avecCoffresDuLidar([baie('f1')], { f1: p });
    expect(o.coffre).toBeDefined();
    expect(o.height).toBe(1.35);
  });

  it('sans profils du tout, la liste revient intacte', () => {
    const l = [baie('f1')];
    expect(avecCoffresDuLidar(l, undefined)).toBe(l);
  });
});

describe('le fil du natif au plan', () => {
  it('le natif mesure le profil au-dessus des baies, et le livre', () => {
    const maillage = lire('modules/react-native-room-scan/ios/RoomScanMaillage.swift');
    expect(maillage).toContain('static func profilsAuDessus(');
    expect(maillage).toContain('static func sommetsDuMonde(');
    const gerant = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');
    expect(gerant).toContain('sortie["dessus"] = dessus');
  });

  it('les trois façons de finir un scan posent les coffres', () => {
    const store = lire('src/store/scanStore.ts');
    expect(store.match(/avecCoffresDuLidar\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('la 3D le dessine en volume, côté pièce', () => {
    expect(lire('src/geometry/scene3d.ts')).toContain('hole.seg.coffreSaillie');
  });
});
