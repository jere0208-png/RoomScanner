/**
 * LE JOURNAL DU MODE DIAGNOSTIC — tampon circulaire, deux bornes.
 *
 * On verifie ce qui fait sa surete : la fenetre d'envoi (dix secondes), la
 * fenetre gardee (une minute) et le plafond d'evenements. Sans ces bornes, un
 * diagnostic enverrait tout, ou mangerait la memoire du telephone surveille.
 */
import {
  elaguer,
  recents,
  noter,
  evenementsAEnvoyer,
  viderJournal,
  tamponBrut,
  FENETRE_JOURNAL_MS,
  PLAFOND_JOURNAL,
  type EvenementJournal,
} from '../src/diagnostic/journal';

describe('elaguer', () => {
  it('retire ce qui deborde de la fenetre d’une minute', () => {
    const maintenant = 1_000_000;
    const evs: EvenementJournal[] = [
      { t: maintenant - FENETRE_JOURNAL_MS - 1, type: 'vieux' },
      { t: maintenant - 30_000, type: 'dedans' },
      { t: maintenant, type: 'neuf' },
    ];
    const reste = elaguer(evs, maintenant);
    expect(reste.map((e) => e.type)).toEqual(['dedans', 'neuf']);
    // L'entree n'est jamais modifiee.
    expect(evs).toHaveLength(3);
  });

  it('plafonne au nombre, en gardant les plus recents', () => {
    const maintenant = 1_000_000;
    const evs: EvenementJournal[] = Array.from({ length: PLAFOND_JOURNAL + 50 }, (_, i) => ({
      t: maintenant - (PLAFOND_JOURNAL + 50 - i),
      type: String(i),
    }));
    const reste = elaguer(evs, maintenant);
    expect(reste).toHaveLength(PLAFOND_JOURNAL);
    // Le dernier garde est bien le plus recent.
    expect(reste[reste.length - 1].type).toBe(String(PLAFOND_JOURNAL + 49));
  });
});

describe('recents', () => {
  it('ne rend que les dix dernieres secondes', () => {
    const maintenant = 500_000;
    const evs: EvenementJournal[] = [
      { t: maintenant - 11_000, type: 'avant' },
      { t: maintenant - 9_000, type: 'pendant' },
      { t: maintenant - 1, type: 'juste-avant' },
    ];
    expect(recents(evs, maintenant).map((e) => e.type)).toEqual(['pendant', 'juste-avant']);
  });
});

describe('le singleton', () => {
  beforeEach(() => {
    viderJournal();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('horodate, et n’envoie que les dix dernieres secondes', () => {
    jest.setSystemTime(100_000);
    noter('ecran', { ecran: 'home' });
    jest.setSystemTime(100_000 + 12_000);
    noter('plan', { walls: 3 });
    jest.setSystemTime(100_000 + 12_050);
    noter('alerte', { titre: 'Oups' });

    const envoi = evenementsAEnvoyer();
    // L'ecran, pose il y a douze secondes, est hors de la fenetre d'envoi.
    expect(envoi.map((e) => e.type)).toEqual(['plan', 'alerte']);
    expect(envoi[0].t).toBe(112_000);
  });

  it('reste borne a sa fenetre dans le tampon', () => {
    jest.setSystemTime(0);
    noter('a');
    jest.setSystemTime(FENETRE_JOURNAL_MS + 1_000);
    noter('b');
    // L'evenement plus vieux que la fenetre est tombe a l'ajout.
    expect(tamponBrut().map((e) => e.type)).toEqual(['b']);
  });
});

/*
  LA FENÊTRE FINIT À L'APPUI — premiers diagnostics du patron : « Évènements
  app : 0 », parce que la fenêtre était comptée depuis « Envoyer », après le
  temps de taper le message.
*/
describe('la fenêtre des dix secondes finit à l’appui, pas à l’envoi', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('un changement fait juste avant l’appui part, même envoyé 40 s plus tard', () => {
    viderJournal();
    const t0 = 1_800_000_000_000;
    jest.setSystemTime(t0);
    noter('plan', { rooms: 5 });
    jest.setSystemTime(t0 + 2_000);
    noter('astuce', { texte: 'après l’appui' });
    // L'envoi part 40 s après l'appui (t0 + 1 s).
    jest.setSystemTime(t0 + 41_000);
    expect(evenementsAEnvoyer()).toEqual([]);
    expect(evenementsAEnvoyer(t0 + 1_000).map((e) => e.type)).toEqual(['plan']);
  });
});
