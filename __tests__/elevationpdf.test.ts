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
    // Quatre murs, quatre feuilles de plus.
    expect(pages(doc({ elevations: true }))).toBe(5);
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

  it('et disent quand un mur ne porte rien, plutôt que de rester muettes', () => {
    expect(texte(doc({ elevations: true }))).toContain('Aucun appareil');
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
    expect(pages(src)).toBe(5);
  });
});
