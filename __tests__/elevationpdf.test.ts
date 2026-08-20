/**
 * LE DOSSIER DE POSE : un mur vu de face par feuille, photo comprise.
 *
 * Le plan vu de dessus dit où sont les cloisons, jamais à quelle hauteur
 * percer. C'est pourtant la seule question de celui qui tient la perceuse,
 * et la réponse ne vivait que dans l'app — face au mur, à l'écran, dans un
 * téléphone qu'on ne sort pas les mains pleines de plâtre.
 *
 * On vérifie ici les trois choses dont dépend cette feuille : qu'elle porte
 * les cotes (depuis la gauche, depuis le sol, la longueur du retour), que la
 * photo entre vraiment dans le document en JPEG relu par le lecteur, et
 * qu'une photo illisible ne fasse pas échouer l'export.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  buildScanPdf,
  fromBase64,
  jpegSize,
  pdfImage,
  toBase64,
} from '../src/export/pdf';

import type { ObjectData } from 'react-native-room-scan';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const PORTE: WallSeg = {
  id: 'p1',
  type: 'door',
  a: { x: 2, z: 0 },
  b: { x: 2.9, z: 0 },
  height: 2.04,
  yCenter: 1.02,
  roomId: 'r1',
};
const R = [{ id: 'r1', name: 'Séjour', wallIds: W.map((w) => w.id) }];
const FX: Fixture[] = [
  { id: 'i1', kind: 'inter', wallId: 'n', along: 0.35, height: 1.1, side: 1 },
  { id: 'pr', kind: 'prise', wallId: 'n', along: 4.2, height: 0.25, side: 1 },
];

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};
const texte = (src: string) =>
  (src.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? [])
    .map((m) => m.slice(1, m.lastIndexOf(')')))
    .join(' | ');
const pages = (src: string) => (src.match(/\/Type \/Page /g) ?? []).length;

/**
 * Un vrai JPEG minuscule, écrit à la main.
 *
 * Pas d'image de test sur disque : ce qui compte ici n'est pas la photo
 * mais son EN-TÊTE — c'est lui que le PDF doit savoir lire pour annoncer
 * la taille de l'objet image. On fabrique donc le strict nécessaire :
 * SOI, un SOF0 de 8 × 6 en trois composantes, EOI.
 */
const JPEG = (() => {
  const o = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
  for (const c of 'JFIF\0') o.push(c.charCodeAt(0));
  o.push(1, 1, 0, 0, 1, 0, 1, 0, 0);
  // SOF0 : longueur 17, 8 bits, hauteur 6, largeur 8, 3 composantes.
  o.push(0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x06, 0x00, 0x08, 0x03);
  for (let i = 0; i < 9; i++) o.push(0);
  o.push(0xff, 0xd9);
  return new Uint8Array(o);
})();
const JPEG_B64 = toBase64(JPEG);

const doc = (opts: Parameters<typeof buildScanPdf>[2], photos?: { wallId: string; base64: string }[]) =>
  latin1(
    buildScanPdf(
      {
        name: 'Séjour',
        walls: W,
        openings: [PORTE],
        objects: [],
        rooms: R,
        fixtures: FX,
        photos,
      },
      false,
      { metre: false, ...opts },
    ),
  );

describe('lire un JPEG', () => {
  it('retrouve ses dimensions dans son marqueur SOF', () => {
    const t = jpegSize(fromBase64(JPEG_B64));
    expect(t).toEqual({ w: 8, h: 6, comps: 3 });
  });

  it('et refuse ce qui n’en est pas un, sans lever', () => {
    expect(jpegSize('nimportequoi')).toBeNull();
    expect(pdfImage('Im0', toBase64(new Uint8Array([1, 2, 3, 4])))).toBeNull();
  });

  it('le base64 fait l’aller-retour à l’octet près', () => {
    const octets = fromBase64(JPEG_B64);
    expect(octets.length).toBe(JPEG.length);
    for (let i = 0; i < JPEG.length; i++) {
      expect(octets.charCodeAt(i)).toBe(JPEG[i]);
    }
  });
});

describe('les feuilles d’élévation', () => {
  it('n’existent que si on les demande', () => {
    expect(pages(doc({}))).toBe(1);
    /*
      UNE FEUILLE PAR MUR ÉQUIPÉ — pas par mur.

      Quatre murs donnaient quatre feuilles, dont trois ne portaient rien :
      un dossier de pose de quatre pages pour deux appareils. On feuillette
      du vide, et la seule feuille utile se perd au milieu. Ici, seul le mur
      nord est équipé.
    */
    expect(pages(doc({ elevations: true }))).toBe(2);
  });

  /*
    LE NUMÉRO FAIT LE LIEN ENTRE LE PLAN ET LA FEUILLE.

    Les élévations ne couvrant plus tous les murs, « Élévation — Séjour,
    nord » ne suffit plus à retrouver DE QUEL pan de mur il s'agit : sur le
    plan, rien ne le désignait. Chaque mur porte donc son numéro dans une
    pastille, posée dans son épaisseur, et la feuille d'élévation reprend ce
    numéro dans son titre.
  */
  it('reprennent le numéro que le mur porte sur le plan', () => {
    const vu = texte(doc({ elevations: true }));
    expect(vu).toContain('Mur 1');
  });

  it('numérote TOUS les murs du plan, équipés ou non', () => {
    // Le plan seul, sans élévation : les quatre pastilles y sont, sinon le
    // numéro d'une feuille renverrait à un mur introuvable.
    const vus = texte(doc({})).split(' | ');
    for (const n of ['1', '2', '3', '4']) expect(vus).toContain(n);
  });

  it('portent la hauteur et la distance au bord de chaque appareil', () => {
    const vu = texte(doc({ elevations: true }));
    expect(vu).toContain('Élévation');
    // L'interrupteur : 110 cm du sol. La prise : 25.
    expect(vu).toContain('110');
    expect(vu).toContain('25');
    // Et sa distance au bord gauche du mur, en centimètres.
    expect(vu).toContain('35');
  });

  it('cotent le retour de mur quand le mur est percé', () => {
    const vu = texte(doc({ elevations: true }));
    // La porte laisse deux retours ; leurs largeurs sont écrites.
    expect(vu).toContain('Porte');
    expect(vu).toMatch(/\b19[0-9]\b/);
  });

  /*
    MAIS ON PEUT REDEMANDER TOUS LES MURS.

    Réduire le dossier aux murs équipés lui a fait perdre ce qu'un
    électricien vient parfois y chercher : le mur VU DE FACE, avec ses
    retours cotés, même sans un seul appareil dessus — c'est le dessin sur
    lequel on décide où percer avant d'avoir rien posé. Les deux usages sont
    justes ; c'est donc une option, et le titre de chaque feuille rappelle le
    numéro que le mur porte sur le plan.
  */
  it('couvrent TOUS les murs quand on le demande', () => {
    const tous = doc({ elevations: true, toutesElevations: true });
    // Quatre murs, quatre feuilles, plus le plan.
    expect(pages(tous)).toBe(5);
    const vu = texte(tous);
    expect(vu).toContain('Mur 1');
    expect(vu).toContain('Mur 4');
    // Et un mur nu le dit, plutôt que de laisser croire à un oubli.
    expect(vu).toContain('Aucun appareil');
  });

  it('n’éditent plus de feuille pour un mur nu', () => {
    // Le message « Aucun appareil » tenait lieu de feuille. Une page qui
    // annonce qu'elle n'a rien à dire n'a pas lieu d'être imprimée.
    expect(texte(doc({ elevations: true }))).not.toContain('Aucun appareil');
  });

  it('et n’en édite aucune quand rien n’est posé', () => {
    const nu = latin1(
      buildScanPdf(
        {
          name: 'Séjour',
          walls: W,
          openings: [PORTE],
          objects: [],
          rooms: R,
          fixtures: [],
        },
        false,
        { metre: false, elevations: true },
      ),
    );
    expect(pages(nu)).toBe(1);
  });

  /**
   * RIEN NE SORT DE LA FEUILLE — y compris avec la photo.
   *
   * Le dessin, ses cotes, ses rappels et la vignette se partagent la même
   * page ; une hauteur mal calculée fait sortir la cote du bas sous le
   * cartouche, où elle est tranchée par le bord du papier.
   */
  it('et rien ne sort de la feuille', () => {
    const src = doc({ elevations: true }, [{ wallId: 'n', base64: JPEG_B64 }]);
    const re = /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (m|l|re) /g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      expect(parseFloat(m[1])).toBeGreaterThanOrEqual(20);
      expect(parseFloat(m[1])).toBeLessThanOrEqual(576);
      expect(parseFloat(m[2])).toBeGreaterThanOrEqual(20);
      expect(parseFloat(m[2])).toBeLessThanOrEqual(823);
    }
  });
});

/**
 * LE CARTOUCHE D'UNE PIÈCE RESTE LISIBLE, QUOI QU'IL Y AIT DESSOUS.
 *
 * Le nom et la surface se posent au point le plus au large de la pièce —
 * mais « au large » ne veut pas dire « seul » : la cote d'un refend tombe
 * dans la pièce qu'il borde, et elle venait s'écrire en travers de
 * « Chambre · 12,0 m² ». Deux textes superposés, aucun des deux lisible.
 *
 * Plutôt que de déplacer l'un ou l'autre — et de recommencer au prochain
 * élément qui passe par là —, le cartouche pose son propre fond : un
 * rectangle blanc à sa taille, juste avant ses lettres.
 */
/**
 * LA HAUTEUR SOUS PLAFOND CHANGE DE CÔTÉ.
 *
 * Elle s'écrivait debout à GAUCHE du mur, à mi-hauteur — exactement là où
 * les cotes d'appareils posent leurs pastilles. Un interrupteur à 1,10 m
 * dans un mur de 2,50 m tombe à mi-hauteur : on lisait « 110 » et
 * « 2,50 m » l'un sur l'autre. La droite du dessin, elle, est vide : les
 * retours sont en haut, la longueur en bas, les hauteurs à gauche.
 */
describe('la cote de hauteur du mur', () => {
  /** Abscisse d'un texte, lue dans la matrice qui le place. */
  const xDe = (src: string, texte: string) => {
    const k = src.indexOf(`(${texte}) Tj`);
    if (k < 0) return NaN;
    const avant = src.slice(Math.max(0, k - 60), k).trim().split(/\s+/);
    // « … a b c d tx ty Tm » : l'abscisse est l'avant-avant-dernier jeton.
    return parseFloat(avant[avant.length - 3]);
  };

  it('se pose à droite du mur, loin des cotes d’appareils', () => {
    const src = doc({ elevations: true });
    const hauteur = xDe(src, 'H 2,50 m');
    const appareil = xDe(src, '110');
    expect(Number.isNaN(hauteur)).toBe(false);
    expect(Number.isNaN(appareil)).toBe(false);
    // Les deux ne sont plus du même côté : au moins la moitié du mur les
    // sépare.
    expect(hauteur).toBeGreaterThan(appareil + 100);
  });
});

describe('le cartouche de pièce', () => {
  it('s’écrit sur un fond plein', () => {
    const src = doc({});
    // « Séjour » est aussi le nom du projet, écrit dans le cartouche de la
    // feuille : c'est l'occurrence SUIVIE de la surface qui nous intéresse.
    const i = src.indexOf('(20,0 m²) Tj');
    expect(i).toBeGreaterThan(0);
    // Le fond est posé juste avant : blanc, et rempli.
    const avant = src.slice(Math.max(0, i - 400), i);
    expect(avant).toMatch(/1 1 1 rg[^)]* f\s/);
  });
});

describe('la photo de repérage', () => {
  const avec = () =>
    doc({ elevations: true }, [{ wallId: 'n', base64: JPEG_B64 }]);

  it('entre dans le document comme un vrai objet image', () => {
    const src = avec();
    expect(src).toContain('/Subtype /Image');
    expect(src).toContain('/Filter /DCTDecode');
    expect(src).toContain('/Width 8');
    expect(src).toContain('/Height 6');
    expect(src).toContain('/ColorSpace /DeviceRGB');
  });

  it('est déclarée en ressource et appelée sur la feuille du mur', () => {
    const src = avec();
    expect(src).toMatch(/\/XObject << \/Im0 \d+ 0 R >>/);
    expect(src).toContain('/Im0 Do');
    // Une seule fois : c'est la feuille de SON mur, pas des quatre.
    expect(src.split('/Im0 Do').length - 1).toBe(1);
  });

  it('et une photo illisible ne fait pas échouer l’export', () => {
    const src = doc({ elevations: true }, [
      { wallId: 'n', base64: toBase64(new Uint8Array([0, 1, 2])) },
    ]);
    expect(src.startsWith('%PDF-1.4')).toBe(true);
    expect(src).not.toContain('/Subtype /Image');
    // Le plan, et la seule feuille de mur équipé : la photo perdue ne coûte
    // que sa vignette.
    expect(pages(src)).toBe(2);
  });
});

/**
 * UNE HAUTEUR, UNE PASTILLE.
 *
 * Trois prises à 25 cm écrivaient « 25 » trois fois, en colonnes qui
 * reculaient vers la gauche : le mécanisme anti-collision est fait pour des
 * hauteurs VOISINES, pas identiques. La même hauteur ne se dit qu'une fois.
 */
describe('les pastilles de hauteur d’une élévation', () => {
  it('trois prises à 25 cm ne donnent qu’une pastille « 25 »', () => {
    const trois: Fixture[] = [
      { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
      { id: 'b', kind: 'prise', wallId: 'n', along: 2, height: 0.25, side: 1 },
      { id: 'c', kind: 'prise', wallId: 'n', along: 3, height: 0.25, side: 1 },
    ];
    const src = latin1(
      buildScanPdf(
        { name: 'E', walls: W, openings: [], objects: [], fixtures: trois, rooms: R },
        false,
        { metre: false, elevations: true },
      ),
    );
    expect((src.match(/\(25\) Tj/g) ?? []).length).toBe(1);
  });
});

/**
 * LE TITRE D'UNE ÉLÉVATION NE BÉGAIE PAS.
 *
 * Une pièce sans nom donnait « Élévation — Mur 2 · mur, mur nord-est » :
 * le bouche-trou « mur » n'a rien à faire devant un cardinal qui commence
 * lui-même par « mur ». Le cardinal parle seul ; le bouche-trou ne sert
 * que s'il n'y a ni nom ni orientation.
 */
describe('le titre d’une élévation sans nom de pièce', () => {
  it('laisse le cardinal parler seul', () => {
    const src = latin1(
      buildScanPdf(
        {
          name: 'Essai',
          walls: W,
          openings: [PORTE],
          objects: [],
          fixtures: FX,
          rooms: [{ id: 'r1', wallIds: W.map((w) => w.id) }],
          roomNames: { r1: '' },
          north: 0,
        },
        false,
        { metre: false, elevations: true },
      ),
    );
    const vu = texte(src);
    expect(vu).not.toContain('mur, mur');
    // Le tiret cadratin du flux est un octet Windows-1252 : on ancre la
    // vérification sur ce qui suit le numéro.
    expect(vu).toMatch(/Mur \d · mur (nord|sud|est|ouest)/);
  });
});

/**
 * L'ALLÈGE D'UNE FENÊTRE EST COTÉE.
 *
 * « 120 × 110 » dit la taille de la baie, pas où elle commence. C'est
 * pourtant la hauteur d'allège qui décide d'une prise sous fenêtre ou d'un
 * convecteur — et il fallait la mesurer à la règle sur la feuille.
 */
describe('l’allège d’une fenêtre', () => {
  it('s’écrit sur l’élévation, du sol au repos de la baie', () => {
    const FENETRE: WallSeg = {
      id: 'w1',
      type: 'window',
      a: { x: 1.8, z: 0 },
      b: { x: 3, z: 0 },
      height: 1.1,
      // Allège à 1,37 m : un nombre qu'on ne trouve nulle part ailleurs.
      yCenter: 1.37 + 0.55,
      roomId: 'r1',
    };
    const src = latin1(
      buildScanPdf(
        {
          name: 'Essai',
          walls: W,
          openings: [FENETRE],
          objects: [],
          fixtures: FX,
          rooms: R,
          roomNames: { r1: 'Séjour' },
        },
        false,
        { metre: false, elevations: true },
      ),
    );
    expect(texte(src)).toContain('137');
  });
});

/**
 * UN TRAIT PLEIN RESTE PLEIN, même dessiné après un tireté.
 *
 * `poly(…, dashed)` règle le motif de tireté SANS le rendre : le trait
 * suivant, s'il passe par `path()`/`line()` qui ne le réinitialisent pas,
 * sort pointillé sur le document. Le défaut est resté invisible parce que
 * presque tous les pleins passent par `poly`, qui remet le motif à zéro —
 * presque. Chaque trait écrit donc son motif.
 */
describe('le tireté ne fuit pas d’un trait à l’autre', () => {
  it('chaque trait plein porte sa remise à zéro du motif', () => {
    const src = latin1(
      buildScanPdf(
        { name: 'Essai', walls: W, openings: [PORTE], objects: [], fixtures: FX, rooms: R },
        true,
        { metre: true, elevations: true },
      ),
    );
    for (const flux of src.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
      for (const op of flux[1].split('\n')) {
        // Un tracé au trait (S final) hors enveloppe q…Q doit dire son
        // motif : « [] 0 d » — sans quoi il hérite du dernier réglé.
        if (/ S$/.test(op) && !op.startsWith('q ')) {
          expect(op).toContain('[] 0 d');
        }
      }
    }
  });
});

/**
 * LE DOSSIER IMPRIMÉ DIT CE QUE L'ÉCRAN MONTRE.
 *
 * Trois écarts relevés au tour de l'application, corrigés ensemble :
 * l'écran fusionne les ensembles sous une plaque, écrit le repère de
 * circuit sous chaque appareil, et montre en élévation les meubles devant
 * le mur comme les appareils de l'autre face. Le papier, lui, se taisait —
 * or c'est le papier qu'on emmène sur le chantier.
 */
const ENSEMBLE: Fixture[] = [
  { id: 'g1', kind: 'prise', wallId: 'n', along: 2, height: 0.25, side: 1, group: 'pl-1' },
  { id: 'g2', kind: 'rj45', wallId: 'n', along: 2.071, height: 0.25, side: 1, group: 'pl-1' },
];

/** Une bibliothèque de 1,20 m adossée au mur nord, à 2 m du coin. */
const BIBLIO: ObjectData = {
  id: 'o1',
  category: 'storage',
  width: 1.2,
  depth: 0.4,
  height: 1.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.9, 0.22, 1],
};

const docFixtures = (
  fixtures: Fixture[],
  opts: Parameters<typeof buildScanPdf>[2] = {},
  objects: ObjectData[] = [],
) =>
  latin1(
    buildScanPdf(
      {
        name: 'Séjour',
        walls: W,
        openings: [PORTE],
        objects,
        rooms: R,
        fixtures,
      },
      false,
      { metre: false, ...opts },
    ),
  );

describe('le plan du dossier fusionne les ensembles', () => {
  /*
    Un ensemble, c'est UN point de pose : une plaque, un disque blanc, un
    symbole à plusieurs postes. Le PDF en dessinait un par appareil — deux
    symboles distants de 71 mm, soit deux pixels à l'échelle d'un logement,
    qui se recouvraient.

    On compte les DISQUES BLANCS (le fond d'un point de pose) : deux
    appareils sous une même plaque doivent en produire autant qu'un
    appareil seul.
  */
  const disques = (src: string) => (src.match(/1 1 1 rg/g) ?? []).length;

  it('deux postes sous une plaque ne font qu’un point de pose', () => {
    const seul = docFixtures([ENSEMBLE[0]]);
    const groupe = docFixtures(ENSEMBLE);
    expect(disques(groupe)).toBe(disques(seul));
  });

  it('et le sigle cumulé dit ce que porte la plaque', () => {
    // Le poste RJ45 de l'ensemble garde son sigle : la plaque annonce ce
    // qu'elle porte, comme à l'écran.
    expect(texte(docFixtures(ENSEMBLE))).toContain('RJ');
  });
});

describe('le plan du dossier porte les repères de circuit', () => {
  it('écrit le repère sous l’appareil, comme à l’écran', () => {
    const src = docFixtures(FX, {
      marks: new Map([
        ['i1', 'C2'],
        ['pr', 'C1'],
      ]),
    });
    const vu = texte(src);
    expect(vu).toContain('C1');
    expect(vu).toContain('C2');
  });

  it('et se tait quand personne ne les a calculés', () => {
    expect(texte(docFixtures(FX))).not.toContain('C1');
  });
});

describe('l’élévation du dossier montre ce que l’écran montre', () => {
  it('dessine les meubles devant le mur, nommés et cotés', () => {
    const vu = texte(docFixtures(FX, { elevations: true }, [BIBLIO]));
    // Le nom du meuble et sa hauteur hors tout, comme face au mur.
    expect(vu).toContain('Rangement');
    expect(vu).toContain('180');
  });

  it('montre en clair les appareils de l’AUTRE face, et le dit', () => {
    const dosADos: Fixture[] = [
      ...FX,
      { id: 'dos', kind: 'prise', wallId: 'n', along: 2.5, height: 0.25, side: -1 },
    ];
    const avec = texte(docFixtures(dosADos, { elevations: true }));
    expect(avec).toContain('autre face');
    // Sans rien de l'autre côté, pas de légende : on n'explique pas ce
    // qui n'est pas dessiné.
    const sans = texte(docFixtures(FX, { elevations: true }));
    expect(sans).not.toContain('autre face');
  });

  it('encadre la plaque commune d’un ensemble', () => {
    // Le cadre de plaque est le seul trait de 0,95 point du dossier.
    const cadres = (src: string) => (src.match(/0\.95 w/g) ?? []).length;
    expect(cadres(docFixtures(ENSEMBLE, { elevations: true }))).toBeGreaterThan(0);
    expect(cadres(docFixtures([ENSEMBLE[0]], { elevations: true }))).toBe(0);
  });
});
