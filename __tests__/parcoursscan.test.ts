/**
 * UN RELEVE SCANNE, DU PREMIER PASSAGE AU FILET DE SECURITE.
 *
 * Sixieme parcours complet, sur le chemin d'origine de l'application : la
 * camera. On simule ce que RoomPlan livre — des surfaces et des meubles —
 * puis on suit tout ce qui s'enchaine derriere : le decoupage en pieces,
 * l'arrivage de mobilier, un second passage reuni au premier, un etage de
 * plus, et le brouillon des trente secondes.
 *
 * LE BROUILLON EST LE FILET. Un scan finalise n'est pas encore range : le
 * telephone peut mourir entre la fin du releve et l'enregistrement — batterie
 * a plat apres vingt minutes de LiDAR, c'est le cas nominal, pas l'accident.
 * Ce parcours verifie qu'il rattrape, et qu'il se tait quand il n'y a rien a
 * rattraper : une question inutile est une question qu'on apprend a balayer
 * sans lire, et le jour ou elle compte, on la balaie aussi.
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
import { useAccountStore } from '../src/store/accountStore';
import { niveauDe } from '../src/geometry/floorplan';
import type { ObjectData, SurfaceData } from 'react-native-room-scan';

const st = () => useScanStore.getState();

/** Un mur tel que RoomPlan le livre. */
const surface = (
  id: string,
  cx: number,
  cz: number,
  length: number,
  alongZ = false,
): SurfaceData => ({
  id,
  type: 'wall',
  length,
  height: 2.5,
  transform: alongZ
    ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
});

const boite = (p: string, x: number, z: number, w: number, h: number) => [
  surface(`${p}n`, x + w / 2, z, w),
  surface(`${p}s`, x + w / 2, z + h, w),
  surface(`${p}w`, x, z + h / 2, h, true),
  surface(`${p}e`, x + w, z + h / 2, h, true),
];

const meuble = (id: string, x: number, z: number): ObjectData => ({
  id,
  category: 'storage',
  width: 0.8,
  height: 0.8,
  depth: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.4, z, 1],
});

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

describe('le parcours complet d’un releve scanne', () => {
  it('du premier passage a l’etage, en passant par le mobilier', () => {
    // 1. Le premier passage : un sejour et deux meubles.
    st().beginScan();
    st().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boite('a', 0, 0, 5, 4),
      objects: [meuble('o1', 1, 1), meuble('o2', 3, 2)],
    });
    expect(st().walls.length).toBeGreaterThanOrEqual(4);
    expect(st().rooms).toHaveLength(1);
    // Le mobilier arrive a part : c'est a l'electricien de dire s'il le
    // garde — un logement meuble cache la maconnerie qu'il vient voir.
    expect(st().arrivage).toBeTruthy();

    // 2. On equipe le sejour AVANT de completer le releve : c'est
    //    exactement le cas que « completer » doit proteger.
    st().oublierArrivage();
    const murSejour = st().walls[0];
    st().addFixture('prise', murSejour.id, 1);
    expect(st().fixtures).toHaveLength(1);

    /*
      3. UN SECOND PASSAGE, REUNI AU PREMIER.

      Le relevé qui arrive porte TOUT le logement, pas seulement la piece
      neuve : `StructureBuilder` aligne les passages et livre l'ensemble
      recale. La reunion remplace donc la geometrie — et c'est bien pour ca
      qu'elle doit sauver ce qui s'y accroche.

      Le premier jet de ce banc ne livrait que la cuisine, et concluait a
      un sejour « perdu ». Il ne l'etait pas : on ne lui avait pas donne.
    */
    st().finalizeMerge({
      modelPath: '/tmp/scan2.usdz',
      surfaces: [...boite('a', 0, 0, 5, 4), ...boite('b', 5, 0, 3, 4)],
      objects: [],
    });
    expect(st().rooms.length).toBeGreaterThanOrEqual(2);
    /*
      ET LA PRISE POSEE ENTRE-TEMPS A SURVECU.

      Les murs du nouveau jeu portent d'autres identifiants, et la fusion a
      pu les redecouper : sans reprojection, chaque prise se retrouverait
      sur un mur qui n'existe plus — disparue de l'ecran, des comptages et
      du metre. « Perdre vingt prises parce qu'on ajoute une chambre serait
      pire que tout. »
    */
    expect(st().fixtures).toHaveLength(1);
    const mursApres = new Set(st().walls.map((w) => w.id));
    expect(mursApres.has(st().fixtures[0].wallId)).toBe(true);
    // Les deux passages vivent au MEME etage : reunir n'est pas empiler.
    for (const w of st().walls) {
      expect(niveauDe(w)).toBe(0);
    }

    // 3. Un etage de plus, range a son niveau sans toucher au rez.
    const mursDuRez = st().walls.length;
    st().finalizeEtage(
      { modelPath: '/tmp/etage.usdz', surfaces: boite('c', 0, 0, 5, 4), objects: [] },
      1,
    );
    expect(st().walls.filter((w) => niveauDe(w) === 0)).toHaveLength(mursDuRez);
    expect(st().walls.filter((w) => niveauDe(w) === 1).length).toBeGreaterThan(0);

    // 4. On enregistre, et tout est la.
    st().commitCurrent();
    expect(st().saves[0].walls.length).toBe(st().walls.length);
  });

  it('et le brouillon rattrape un telephone qui meurt', () => {
    /*
      OU EST LA MINUTE A RISQUE ?

      Pas apres le scan : un releve termine s'auto-enregistre, et ce banc a
      commence par se tromper la-dessus — il attendait une bibliotheque vide
      apres `finalize`, elle contenait deja l'entree. Le trou est AVANT :
      entre le premier trait dessine et le premier « Enregistrer ». Un plan
      trace a la main n'existe nulle part tant qu'on ne l'a pas range, et
      c'est la que la batterie lache apres vingt minutes de LiDAR.
    */
    st().commencerAuClavier();
    st().addRoomBox(5, 4, 'Sejour');
    st().addNote('Colonne montante', { x: 1, z: 1 });
    st().decrireTableau({ rangees: 2, parRangee: 13 });
    st().ajouterDepart({ organe: 'fusible', calibre: 16, usage: 'Prises cuisine' });
    const murs = st().walls.length;
    expect(st().saves).toHaveLength(0);
    st().ecrireBrouillon();
    const filet = st().brouillon ?? JSON.parse(mockMagasin.get('roomscanner.brouillon.v1')!);

    // Le telephone meurt : l'application repart de zero, puis retrouve le
    // brouillon sur le disque au demarrage suivant.
    st().reset();
    useScanStore.setState({ saves: [], currentSaveId: null, brouillon: filet });
    expect(st().walls).toHaveLength(0);

    st().reprendreBrouillon();
    expect(st().walls).toHaveLength(murs);
    /*
      TOUT CE QUI A ETE ECRIT DOIT ETRE RENDU.

      Le brouillon SAUVE les notes et le tableau existant — le releve des
      departs, ce quart d'heure debout dans un couloir devant une porte
      ouverte — et `reprendreBrouillon` ne les reposait pas. Un filet qui
      retient la moitie de ce qui tombe est un filet qui ment : on croit
      avoir tout retrouve, et l'on repart sans ce qui justifie le devis.
    */
    expect(st().notes).toHaveLength(1);
    expect(st().notes[0].text).toBe('Colonne montante');
    expect(st().existant?.departs).toHaveLength(1);
    expect(st().existant?.rangees).toBe(2);
  });

  it('et il se tait quand il n’y a rien a rattraper', () => {
    // Un releve DEJA range n'a pas besoin de filet : reposer la question
    // apprend a la balayer sans lire.
    st().commencerAuClavier();
    st().addRoomBox(5, 4, 'Sejour');
    st().commitCurrent();
    st().oublierBrouillon();
    st().reset();
    useScanStore.setState({ saves: [], currentSaveId: null });
    st().reprendreBrouillon();
    expect(st().walls).toHaveLength(0);
  });
});
