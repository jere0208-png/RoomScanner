/**
 * LE BANDEAU DATAIT LE CATALOGUE PAR SA VISITE LA PLUS RÉCENTE.
 *
 * Relevé du patron : « tous les prix ne sont pas à jour dans l'app, même
 * après la mise à jour ; des prix s'affichent à la date d'aujourd'hui mais
 * d'autres restent par exemple au 28 août ».
 *
 * Il a raison, et le défaut est de moi. Le relevé des plaques du 5 septembre
 * a fait passer `RELEVE_RAYON` à cette date, et le bandeau annonçait donc
 * « Prix vérifiés aujourd'hui », en vert — pendant que trente-trois articles
 * portaient toujours, ligne par ligne, le 28 août.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN CATALOGUE SE DATE PAR SON ARTICLE LE PLUS VIEUX.
 *
 * L'ancienne doctrine — écrite dans le bandeau — était : « ce qui est affirmé
 * ici, c'est la date du dernier passage ». Elle ne tient pas. Le dernier
 * passage ne dit rien de ce qu'on n'a PAS revu ce jour-là : on peut aller
 * corriger un seul prix et repartir avec un bandeau vert sur un catalogue de
 * l'an dernier. La date du plus vieil article, elle, est une GARANTIE : tous
 * ces prix ont au moins été vus depuis ce jour-là.
 *
 * ET QUAND ILS NE SONT PAS DU MÊME JOUR, ON LE DIT. Deux dates dans un même
 * devis ne sont pas un défaut — chaque prix porte le jour où on l'a vu, et
 * c'est ce qui permet de savoir quoi revoir. Ce qui était un défaut, c'est
 * de n'en montrer qu'une seule en haut de page.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  fourchetteDesReleves,
  ageDuCatalogue,
} from '../src/geometry/devis';
import type { LigneDevis } from '../src/geometry/devis';

const ligne = (releve?: string, pu: number | null = 10): LigneDevis => ({
  famille: 'Appareillage',
  code: 'x',
  libelle: 'x',
  quantite: 1,
  unite: 'u',
  pu,
  total: pu ?? 0,
  releve,
  source: releve ? 'Castorama' : undefined,
});

describe('la fourchette des relevés', () => {
  it('rend le plus vieux et le plus récent', () => {
    const f = fourchetteDesReleves([
      ligne('2026-09-05'),
      ligne('2026-08-28'),
      ligne('2026-09-05'),
    ]);
    expect(f).toEqual({ plusVieux: '2026-08-28', plusRecent: '2026-09-05' });
  });

  it('un catalogue d’un seul jour rend deux fois le même', () => {
    const f = fourchetteDesReleves([ligne('2026-09-05'), ligne('2026-09-05')]);
    expect(f).toEqual({ plusVieux: '2026-09-05', plusRecent: '2026-09-05' });
  });

  it('une ESTIMATION ne vieillit pas un relevé : elle en est écartée', () => {
    /*
      Le catalogue mêle deux précisions, et la précision EST la marque : un
      passage en rayon se date au JOUR (« 2026-08-28 »), une estimation au
      MOIS (« 2026-08 »). Une estimation n'a jamais été relevée — la compter
      ferait dire au bandeau « prix relevés depuis août » d'un prix que
      personne n'est allé voir. Elle se signale déjà ligne par ligne (« à
      valider en rayon »), là où l'information sert vraiment.
    */
    const f = fourchetteDesReleves([ligne('2026-08-28'), ligne('2026-08')]);
    expect(f!.plusVieux).toBe('2026-08-28');
    // Et un devis qui n'a QUE des estimations n'affirme aucun relevé.
    expect(fourchetteDesReleves([ligne('2026-08')])).toBeNull();
  });

  it('une ligne sans prix ne date rien', () => {
    /*
      Un article que le catalogue ne connaît pas n'a pas été relevé : le
      compter dans la fourchette ferait vieillir le catalogue au nom d'un
      prix qui n'existe pas.
    */
    const f = fourchetteDesReleves([ligne('2026-09-05'), ligne('2026-01-01', null)]);
    expect(f!.plusVieux).toBe('2026-09-05');
  });

  it('et un devis sans le moindre prix ne rend rien du tout', () => {
    expect(fourchetteDesReleves([])).toBeNull();
    expect(fourchetteDesReleves([ligne(undefined)])).toBeNull();
  });
});

describe('ce que le bandeau a le droit d’affirmer', () => {
  const LE_5 = new Date(2026, 8, 5, 10, 0, 0).getTime();

  it('« vérifiés aujourd’hui » seulement si TOUT est d’aujourd’hui', () => {
    /*
      C'est le défaut que le patron a vu : un seul prix rafraîchi suffisait à
      peindre le bandeau en vert. La promesse porte sur le catalogue entier,
      ou elle ne vaut rien.
    */
    const melange = ageDuCatalogue(
      [ligne('2026-09-05'), ligne('2026-08-28')],
      LE_5,
    );
    expect(melange.duJour).toBe(false);

    const tout = ageDuCatalogue([ligne('2026-09-05'), ligne('2026-09-05')], LE_5);
    expect(tout.duJour).toBe(true);
  });

  it('la période annoncée COMMENCE au plus vieux', () => {
    /*
      C'est le bout qui engage. Le plus récent ferme la période et se dit
      aussi — cacher l'un des deux était justement le défaut — mais c'est le
      plus vieux qui répond à « depuis quand ces prix tiennent-ils ? ».
    */
    const a = ageDuCatalogue([ligne('2026-09-05'), ligne('2026-08-28')], LE_5);
    expect(a.jour!.startsWith('du 28 août')).toBe(true);
  });

  it('quand les dates se mêlent, le bandeau le DIT au lieu d’en cacher une', () => {
    /*
      Deux dates dans un devis ne sont pas un défaut : chaque prix porte le
      jour où on l'a vu, et c'est ce qui permet de savoir quoi revoir. Le
      défaut était de n'en montrer qu'une. « Du 28 août au 5 septembre »
      répond d'avance à la question que le patron a posée en ouvrant son
      ticket.
    */
    const a = ageDuCatalogue([ligne('2026-09-05'), ligne('2026-08-28')], LE_5);
    expect(a.jour).toMatch(/^du .* au .*/);
    expect(a.jour).toContain('28 août');
    expect(a.jour).toContain('5 septembre');
  });

  it('un catalogue d’un seul jour donne une date simple, pas une fourchette', () => {
    const a = ageDuCatalogue([ligne('2026-08-28'), ligne('2026-08-28')], LE_5);
    expect(a.jour).toBe('28 août 2026');
    expect(a.jour).not.toMatch(/^du /);
  });

  it('et sans aucun prix daté, il n’affirme rien', () => {
    const a = ageDuCatalogue([ligne(undefined)], LE_5);
    expect(a.jour).toBeNull();
    expect(a.duJour).toBe(false);
  });
});

describe('l’écran s’en sert, et n’affirme plus rien tout seul', () => {
  const lire = (rel: string) => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return readFileSync(join(__dirname, '..', ...rel.split('/')), 'utf8');
  };

  it('le devis date son bandeau sur SES lignes, pas sur une constante', () => {
    /*
      L'écran calait sa date sur `RELEVE_RAYON` — le jour du dernier passage
      en rayon, une constante posée à la main. Elle a changé le jour où l'on a
      relevé les seules plaques, et le bandeau s'est mis à annoncer une
      fraîcheur que le catalogue n'avait pas. Une valeur tenue à la main à
      côté de la mesure qu'elle décrit finit toujours par s'en écarter.
    */
    const src = lire('src/screens/DevisScreen.tsx');
    expect(src).toContain('ageDuCatalogue');
    expect(src).not.toMatch(/releveDuJour\(releve/);
  });
});
