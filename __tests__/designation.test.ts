/**
 * Le mot posé sur l'appareil, en 3D.
 *
 * Un symbole gravé sur une plaque de dix pixels ne se lit pas : à l'échelle
 * d'un logement, il se réduit à trois traits gris. On écrit donc « PC »,
 * « DOUBLE PC », « RJ + PC ». Et un ensemble monté à la main doit se nommer
 * exactement comme l'appareil multiposte équivalent du catalogue — sans quoi
 * le même montage porterait deux noms selon la façon dont on l'a créé.
 */
import {
  FIXTURE_KINDS,
  assemblyTag,
  fixtureTag,
  postsOf,
} from '../src/geometry/electrical';

describe('la désignation d’un appareil', () => {
  it('nomme les appareils courants', () => {
    expect(fixtureTag('prise')).toBe('PC');
    expect(fixtureTag('rj45')).toBe('RJ');
    expect(fixtureTag('inter')).toBe('INT');
    expect(fixtureTag('va')).toBe('VV');
    expect(fixtureTag('tv')).toBe('TV');
    expect(fixtureTag('prise20')).toBe('PC 20A');
  });

  it('compte les postes identiques', () => {
    expect(fixtureTag('prise2')).toBe('DOUBLE PC');
    expect(fixtureTag('prise3')).toBe('TRIPLE PC');
    expect(fixtureTag('inter2')).toBe('DOUBLE INT');
    expect(fixtureTag('inter3')).toBe('TRIPLE INT');
    expect(fixtureTag('rj2')).toBe('DOUBLE RJ');
  });

  it('énumère les ensembles mixtes, dans l’ordre des postes', () => {
    expect(fixtureTag('rjPrise')).toBe('RJ + PC');
    expect(fixtureTag('rjPrise2')).toBe('RJ + DOUBLE PC');
    expect(fixtureTag('tvPrise')).toBe('TV + PC');
  });

  it('un ensemble monté à la main se nomme comme celui du catalogue', () => {
    expect(assemblyTag(['prise', 'prise'])).toBe(fixtureTag('prise2'));
    expect(assemblyTag(['prise', 'prise', 'prise'])).toBe(fixtureTag('prise3'));
    expect(assemblyTag(['rj45', 'prise'])).toBe(fixtureTag('rjPrise'));
    expect(assemblyTag(['rj45', 'prise', 'prise'])).toBe(fixtureTag('rjPrise2'));
    expect(assemblyTag(['tv', 'prise'])).toBe(fixtureTag('tvPrise'));
  });

  it('aucun type ne reste sans nom, et aucun nom n’est illisible', () => {
    for (const kind of FIXTURE_KINDS) {
      const tag = fixtureTag(kind);
      expect(tag.length).toBeGreaterThan(1);
      // Assez court pour tenir sur une plaque : on l'écrit, on ne le raconte
      // pas. Deux postes mixtes font le plus long (« RJ + DOUBLE PC »).
      expect(tag.length).toBeLessThanOrEqual(16);
      expect(tag).toBe(tag.toUpperCase());
      expect(postsOf(kind).length).toBeGreaterThan(0);
    }
  });

  it('quatre postes se comptent aussi', () => {
    expect(assemblyTag(['prise', 'prise', 'prise', 'prise'])).toBe(
      'QUADRUPLE PC',
    );
  });
});
