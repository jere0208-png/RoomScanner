/**
 * LE PLAN EN FICHIER, CÔTÉ PONT NATIF — ce que `ouvrirUnFichier` et
 * `pageDuPdf` laissent passer vers l'écran.
 *
 * Relevé du patron : « on doit aussi pouvoir lire un fichier PDF ou image au
 * lieu de scanner le papier à l'appareil photo ». Le natif rend une page
 * prête (son JPEG, ses textes lus, et pour un PDF : quelle page, sur
 * combien), ou dit pourquoi le fichier ne s'ouvre pas. Le pont garde la
 * différence entre « on a renoncé » (null) et « ce fichier ne s'ouvre pas ».
 */
import { NativeModules } from 'react-native';
import { ouvrirUnFichier, pageDuPdf } from '../src/native/lecturePlan';

const PAGE = { base64: 'x'.repeat(2000), largeur: 1000, hauteur: 700, textes: [{ t: '3,20', x: 500, y: 100 }] };

afterEach(() => {
  delete (NativeModules as Record<string, unknown>).RoomScanLecturePlan;
});

const natif = (m: Record<string, unknown>) => {
  (NativeModules as Record<string, unknown>).RoomScanLecturePlan = m;
};

describe('ouvrir un fichier', () => {
  it('une page de PDF passe avec son rang et le nombre de pages', async () => {
    natif({ ouvrirUnFichier: async () => ({ ...PAGE, page: 2, pages: 5 }) });
    expect(await ouvrirUnFichier()).toEqual({ ...PAGE, page: 2, pages: 5 });
  });

  it('une image passe comme une photo', async () => {
    natif({ ouvrirUnFichier: async () => PAGE });
    expect(await ouvrirUnFichier()).toEqual(PAGE);
  });

  it('un fichier qui ne s’ouvre pas le DIT : on ne le confond pas avec un renoncement', async () => {
    for (const erreur of ['format', 'protege', 'vide'] as const) {
      natif({ ouvrirUnFichier: async () => ({ erreur }) });
      expect(await ouvrirUnFichier()).toEqual({ erreur });
    }
    // Une erreur inconnue du natif reste une erreur de format.
    natif({ ouvrirUnFichier: async () => ({ erreur: 'autre chose' }) });
    expect(await ouvrirUnFichier()).toEqual({ erreur: 'format' });
  });

  it('renoncer, ou pas de module : null', async () => {
    natif({ ouvrirUnFichier: async () => null });
    expect(await ouvrirUnFichier()).toBeNull();
    delete (NativeModules as Record<string, unknown>).RoomScanLecturePlan;
    expect(await ouvrirUnFichier()).toBeNull();
  });

  it('une image vide ou tronquée ne passe pas pour une page', async () => {
    natif({ ouvrirUnFichier: async () => ({ ...PAGE, base64: 'x' }) });
    expect(await ouvrirUnFichier()).toEqual({ erreur: 'format' });
  });
});

describe('changer de page', () => {
  it('rend la page demandée du PDF ouvert', async () => {
    const vus: number[] = [];
    natif({
      pageDuPdf: async (n: number) => {
        vus.push(n);
        return { ...PAGE, page: n, pages: 5 };
      },
    });
    expect(await pageDuPdf(3)).toEqual({ ...PAGE, page: 3, pages: 5 });
    expect(vus).toEqual([3]);
  });

  it('et rien quand le natif n’a plus de PDF en main', async () => {
    natif({ pageDuPdf: async () => null });
    expect(await pageDuPdf(2)).toBeNull();
  });
});
