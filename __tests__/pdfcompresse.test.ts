/**
 * LE DOSSIER PDF COMPRESSÉ — les flux de page passent par fflate
 * (FlateDecode) : le dossier qui part par mail fond, sans perdre un trait.
 * Les autres bancs lisent le PDF en clair (`ECHOPLAN_PDF_BRUT`, voir
 * `jest.setup.js`) ; celui-ci vérifie la version qui part vraiment.
 */
import { unzlibSync, strFromU8 } from 'fflate';
import { buildScanPdf } from '../src/export/pdf';
import { appartementExemple } from '../src/data/exemple';
import { encoderPng } from '../src/geometry/vignette3d';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 8192)));
  return s;
};

function dossier(brut: boolean): Uint8Array {
  const avant = process.env.ECHOPLAN_PDF_BRUT;
  process.env.ECHOPLAN_PDF_BRUT = brut ? '1' : '0';
  try {
    const ex = appartementExemple();
    return buildScanPdf({ name: 'Exemple', ...ex } as never, false);
  } finally {
    process.env.ECHOPLAN_PDF_BRUT = avant;
  }
}

describe('le dossier PDF part compressé', () => {
  const clair = dossier(true);
  const serre = dossier(false);

  it('au moins trois fois plus léger', () => {
    expect(serre.length * 3).toBeLessThan(clair.length);
  });

  it('chaque flux de page se décompresse, à l’identique de la version en clair', () => {
    const lireFlux = (pdf: Uint8Array, compresse: boolean) => {
      const s = latin1(pdf);
      const re = /<< \/Length (\d+)( \/Filter \/FlateDecode)? >>\nstream\n/g;
      const flux: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const debut = m.index + m[0].length;
        const octets = pdf.subarray(debut, debut + Number(m[1]));
        if (compresse) {
          expect(m[2]).toBeDefined();
          flux.push(strFromU8(unzlibSync(octets), true));
        } else {
          flux.push(latin1(octets));
        }
      }
      return flux;
    };
    const a = lireFlux(clair, false);
    const b = lireFlux(serre, true);
    expect(b.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it('le PDF reste lisible : en-tête, table des renvois et fin de fichier', () => {
    const s = latin1(serre);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s).toMatch(/startxref\n\d+\n%%EOF$/);
    // Les renvois pointent bien sur les objets, malgré les octets binaires.
    const xref = Number(s.match(/startxref\n(\d+)/)![1]);
    expect(s.slice(xref, xref + 4)).toBe('xref');
    const premiers = s.slice(xref).split('\n').slice(3, 6).map((l) => Number(l.slice(0, 10)));
    premiers.forEach((off, i) => expect(s.slice(off).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });
});

describe('la vignette PNG compressée', () => {
  it('une image unie pèse quelques centaines d’octets, et se relit', () => {
    const largeur = 200;
    const hauteur = 120;
    const pixels = new Uint8Array(largeur * hauteur * 4).fill(200);
    const png = encoderPng({ largeur, hauteur, pixels } as never);
    expect(png.length).toBeLessThan(2000);
    // IDAT : longueur sur 4 octets, puis « IDAT », puis le flux zlib.
    const s = latin1(png);
    const i = s.indexOf('IDAT');
    const n = new DataView(png.buffer, png.byteOffset + i - 4, 4).getUint32(0);
    const brut = unzlibSync(png.subarray(i + 4, i + 4 + n));
    expect(brut.length).toBe((largeur * 4 + 1) * hauteur);
    expect(brut[1]).toBe(200);
  });
});
