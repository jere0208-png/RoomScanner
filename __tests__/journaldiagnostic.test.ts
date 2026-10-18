/**
 * LE JOURNAL DU MODE DIAGNOSTIC — toute la session, deux bornes.
 *
 * Relevé du patron : le diagnostic enregistre du premier appui au second, pas
 * dix secondes. On vérifie ce qui fait sa sûreté : l'envoi prend la session
 * entière et elle seule, la fenêtre gardée (trente minutes) et le plafond
 * d'évènements. Sans ces bornes, un diagnostic mangerait la mémoire du
 * téléphone surveillé.
 */
import {
  elaguer,
  entre,
  noter,
  evenementsDeLaSession,
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

describe('entre', () => {
  it('ne rend que ce qui tombe dans la session', () => {
    const evs: EvenementJournal[] = [
      { t: 99, type: 'avant' },
      { t: 100, type: 'debut' },
      { t: 5_000_000, type: 'pendant' },
      { t: 6_000_000, type: 'fin' },
      { t: 6_000_001, type: 'note' },
    ];
    expect(entre(evs, 100, 6_000_000).map((e) => e.type)).toEqual(['debut', 'pendant', 'fin']);
  });
});

describe('le singleton', () => {
  beforeEach(() => {
    viderJournal();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('horodate, et envoie toute la session, même longue', () => {
    jest.setSystemTime(100_000);
    noter('avant');
    const debut = 100_500;
    jest.setSystemTime(debut);
    noter('session');
    // Douze minutes plus tard : rien n'est perdu.
    jest.setSystemTime(debut + 12 * 60_000);
    noter('plan', { walls: 3 });
    const fin = debut + 12 * 60_000 + 50;
    jest.setSystemTime(fin);
    noter('alerte', { titre: 'Oups' });
    // La note se tape après le second appui : elle n'en fait pas partie.
    jest.setSystemTime(fin + 20_000);
    noter('astuce', { texte: 'clavier' });

    const envoi = evenementsDeLaSession(debut, fin);
    expect(envoi.map((e) => e.type)).toEqual(['session', 'plan', 'alerte']);
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
  VINGT MINUTES TIENNENT DANS LE FIL — une session dure vingt minutes au plus
  (voir `RoomScanDiagnostic.swift`) : la fenêtre gardée et le plafond la
  laissent passer entière, note comprise.
*/
describe('la session tient dans sa fenêtre', () => {
  it('vingt minutes de session tiennent dans le tampon', () => {
    expect(FENETRE_JOURNAL_MS).toBeGreaterThanOrEqual(25 * 60_000);
    expect(PLAFOND_JOURNAL).toBeGreaterThanOrEqual(20_000);
  });
});
