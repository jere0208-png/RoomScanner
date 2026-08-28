/**
 * ON N'ACHÈTE PAS CENT MÈTRES DE 6 mm² POUR UNE PLAQUE DE CUISSON.
 *
 * Trouvé en relevant le rayon des conducteurs chez Castorama : **le fil de
 * 6 mm² n'y existe pas en couronne de cent mètres**. Il se vend en couronnes de
 * cinq ou dix mètres, ou à la coupe — et c'est logique, personne ne tire cent
 * mètres de 6 : on en tire dix, entre le tableau et la plaque.
 *
 * LE DEVIS, LUI, COMPTAIT DES COURONNES DE CENT MÈTRES POUR TOUTES LES
 * SECTIONS. Sur une rénovation d'appartement avec plaque de cuisson, cela
 * donnait une couronne de 6 mm² à 99 € là où l'on achète trois couronnes de dix
 * mètres à 16,90 € — **cinquante euros de trop, sur un article qu'on ne
 * commande qu'une fois et qu'on ne relit donc jamais**.
 *
 * ET LE PRIX AU MÈTRE ÉTAIT FAUX AUSSI, dans l'autre sens : 0,99 €/m au
 * catalogue, 1,69 €/m en rayon. Les deux erreurs se compensaient en partie, ce
 * qui est le pire cas — un total à peu près crédible, obtenu par deux chiffres
 * faux.
 *
 * CE QUE CE BANC TIENT : la longueur d'une couronne suit la SECTION, le métré
 * s'en sert, et un tronçon plus long que la couronne se signale au lieu de
 * disparaître. Ce qu'il ne tient pas : que 10 m soit le bon conditionnement
 * pour le 10, le 16 et le 25 — seul le 6 a été vu en rayon, et le catalogue le
 * dit.
 */
import {
  COURONNE_DU_FIL,
  buyingList,
  couronnes,
  longueurDeCouronne,
  type PullRow,
} from '../src/geometry/conduits';
import type { Wire } from '../src/geometry/schema';

describe('la couronne suit la section', () => {
  it('les petites sections se vendent au cent mètres', () => {
    expect(longueurDeCouronne(1.5)).toBe(100);
    expect(longueurDeCouronne(2.5)).toBe(100);
  });

  it('mais le 6 mm² se vend au dix mètres — c’est ce qu’on trouve en rayon', () => {
    expect(longueurDeCouronne(6)).toBe(10);
  });

  it('et une section qu’on ne connaît pas retombe sur la plus courante', () => {
    /*
      Une section inconnue ne doit pas faire planter un devis. Elle retombe
      sur cent mètres, qui est le conditionnement de tout ce qu'on tire en
      quantité — se tromper de conditionnement coûte moins cher que de ne pas
      chiffrer du tout.
    */
    expect(longueurDeCouronne(3)).toBe(100);
    expect(longueurDeCouronne(0)).toBe(100);
  });

  it('la table dit ce qui a été VU en rayon et ce qui est supposé', () => {
    // Le 6 est le seul relevé ; les grosses sections suivent la même règle
    // par déduction, et c'est écrit dans le catalogue.
    expect(Object.keys(COURONNE_DU_FIL).length).toBeGreaterThan(2);
  });
});

describe('une plaque de cuisson ne vide pas le magasin', () => {
  it('trois brins de dix mètres font trois couronnes de dix, pas une de cent', () => {
    /*
      LE CAS RÉEL : du tableau à la plaque, une dizaine de mètres, trois
      conducteurs. Avec des couronnes de cent, le métré en comptait UNE et le
      devis facturait cent mètres de cuivre de 6 — pour trente mètres tirés.
    */
    const brins = [10, 10, 10];
    const auCent = couronnes(brins, 100);
    const auDix = couronnes(brins, longueurDeCouronne(6));
    expect(auCent.nombre).toBe(1);
    expect(auDix.nombre).toBe(3);
    // Et la chute dit la vérité : soixante-dix mètres de 6 dont on ne fera
    // rien, contre zéro.
    expect(auCent.chute).toBe(70);
    expect(auDix.chute).toBe(0);
  });

  it('et un tronçon plus long que la couronne se signale', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE. En passant à dix mètres, un départ de
      quinze mètres devient intirable d'un seul tenant — et un conducteur ne
      se raboute pas. Le métré doit le DIRE, pas l'avaler : c'est ce que
      `horsGabarit` existe pour faire, et il faut vérifier qu'il le fait
      encore à cette échelle-là.
    */
    const r = couronnes([15], longueurDeCouronne(6));
    expect(r.horsGabarit).toBe(1);
  });
});

describe('et le bordereau en tient compte, pas seulement le calcul', () => {
  /*
    LA MOITIÉ QUI MANQUAIT. Éprouver `couronnes` prouve que la FONCTION sait
    compter par dix ; elle ne prouve pas que le bordereau l'appelle avec la
    bonne longueur. C'est le genre d'épreuve qui passe au vert pendant que
    l'application continue de facturer cent mètres — on aurait vérifié
    l'outil, pas l'ouvrage.
  */
  const brins = (section: number): Wire[] => [
    { role: 'phase', color: '#B8352A', label: 'Phase', section },
    { role: 'neutre', color: '#2E6FD6', label: 'Neutre', section },
    { role: 'terre', color: '#5A9E31', label: 'Terre', section },
  ];
  const plaque: PullRow[] = [
    {
      circuitId: 'cuisson',
      label: 'Plaque de cuisson',
      section: 6,
      nature: 'specialise' as const,
      brins: brins(6),
      fils: 3,
      conduit: 25,
      /*
        LE DÉTAIL DU DÉPART, ET NON UNE LISTE VIDE. `buyingList` ne compte les
        conducteurs QUE s'il a des tronçons mesurés — sans eux, il rend un
        bordereau sans un mètre de fil, et l'épreuve passait à côté de son
        sujet. Un banc peut échouer pour la mauvaise raison ; celui-ci a
        d'abord échoué pour AUCUNE raison.
      */
      troncons: [{ id: 't1', conduit: 10, cable: 10, role: 'autre' as const }],
      runs: 1,
      conduitLength: 10,
      // Dix mètres par conducteur : du tableau à la plaque.
      cableLength: 30,
      approx: false,
      protection: '32 A',
    },
  ];

  it('une plaque de cuisson se chiffre en couronnes de dix mètres', () => {
    const lignes = buyingList(plaque, [], []).filter((l) =>
      l.code?.startsWith('fil-6'),
    );
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) {
      // L'unité DIT ce qu'on achète : c'est elle qu'on lit au comptoir.
      expect(`${l.code} : ${l.unit}`).toBe(`${l.code} : cour. 10 m`);
      // Et l'on n'en achète pas cent mètres pour dix tirés.
      expect(l.quantity).toBeGreaterThan(0);
      expect(l.quantity).toBeLessThan(4);
    }
  });

  it('tandis que les prises restent au cent mètres', () => {
    const prises: PullRow[] = [
      { ...plaque[0], section: 2.5, brins: brins(2.5), cableLength: 60 },
    ];
    const lignes = buyingList(prises, [], []).filter((l) =>
      l.code?.startsWith('fil-2.5'),
    );
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) {
      expect(`${l.code} : ${l.unit}`).toBe(`${l.code} : cour. 100 m`);
    }
  });
});
