/**
 * « COMBIEN J'EN AURAIS POUR MON INSTALLATION ACTUELLE ? »
 *
 * Releve du patron, 27/08/2026 : un devis approximatif, un recapitulatif
 * detaille, et un plan qui explique le prix. « Un outil complet, autonome et
 * precis sur les prix. »
 *
 * CE QUE CE BANC GARDE, ET POURQUOI CE SONT CES CHOSES-LA.
 *
 *   ON NE RECOMPTE RIEN. Le metre existe deja : `buyingList` lit le trace
 *   reel du plan, `planCircuits` deduit les protections. Si le devis
 *   recomptait de son cote, le bordereau de materiel et le devis finiraient
 *   par annoncer deux logements differents. Le banc verifie donc que chaque
 *   quantite chiffree est EXACTEMENT celle du bordereau.
 *
 *   CHANGER DE GAMME NE CHANGE QUE L'APPAREILLAGE. C'est le controle en sens
 *   inverse du choix : une gaine est une gaine, un disjoncteur est un
 *   disjoncteur. Un chiffrage qui bougerait partout en changeant de modele
 *   d'interrupteur serait un chiffrage qui melange ses tables.
 *
 *   CE QU'ON NE COMPTE PAS SE DIT. Les luminaires — « cela depend des
 *   envies ». Ils restent au recapitulatif, a zero, avec la raison ecrite
 *   dessus ; leur boite, leur fil et leur commande, eux, sont comptes. Un
 *   article absent passe pour un article oublie.
 *
 *   ET LE TOTAL NE SE TAIT PAS SUR CE QU'IL IGNORE. Un article que le
 *   catalogue ne connait pas remonte dans `sansPrix`. Un total qui avale une
 *   ligne en silence est un total faux, et personne ne s'en apercoit.
 */
import { buyingList, type PullRow } from '../src/geometry/conduits';
import { chiffrer } from '../src/geometry/devis';
import type { Fixture } from '../src/geometry/electrical';
import type { Circuit, Differential } from '../src/geometry/nfc15100';
import { GAMMES, TARIFS_MECANISME, type GammeId } from '../src/geometry/prix';
import type { CeilingFixture } from '../src/geometry/ceiling';

/*
  UN T3 ORDINAIRE — trois circuits, de quoi que chaque table serve.

  Il faut du 2,5 et du 1,5 pour deux diametres de gaine, un courant faible
  pour le coffret de communication, et du plafond pour la regle des
  luminaires. Sans l'un des trois, une moitie du chiffrage ne serait jamais
  parcourue par le banc.
*/
const TIRAGE: PullRow[] = [
  {
    circuitId: 'c1',
    label: 'Prises — Séjour',
    section: 2.5,
    fils: 3,
    conduit: 20,
    runs: 8,
    conduitLength: 62,
    cableLength: 68,
    approx: false,
    protection: '20 A',
  },
  {
    circuitId: 'c2',
    label: 'Éclairage',
    section: 1.5,
    fils: 3,
    conduit: 16,
    runs: 6,
    conduitLength: 47,
    cableLength: 52,
    approx: false,
    protection: '16 A',
  },
  {
    circuitId: 'c3',
    label: 'Communication',
    section: null,
    fils: 3,
    conduit: 25,
    runs: 2,
    conduitLength: 21,
    cableLength: 24,
    approx: false,
    protection: 'coffret com.',
  },
];

const fx = (id: string, kind: Fixture['kind'], group?: string): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along: 1,
  height: 0.25,
  side: 1,
  group,
});

const APPAREILS: Fixture[] = [
  fx('p1', 'prise'),
  fx('p2', 'prise'),
  fx('p3', 'prise2'),
  fx('p4', 'prise20'),
  fx('i1', 'inter'),
  fx('i2', 'va'),
  fx('i3', 'va'),
  fx('r1', 'rj45', 'g1'),
  fx('r2', 'prise', 'g1'),
  fx('t1', 'tableau'),
];

const PLAFOND: CeilingFixture[] = [
  { id: 'l1', kind: 'dcl', roomId: 'r1', at: { x: 1, z: 1 } },
  { id: 'l2', kind: 'spot', roomId: 'r1', at: { x: 2, z: 1 } },
  { id: 'l3', kind: 'daaf', roomId: 'r1', at: { x: 3, z: 1 } },
];

const circuit = (
  id: string,
  nature: Circuit['nature'],
  section: number | null,
  breaker: number | null,
): Circuit => ({
  id,
  label: id,
  nature,
  points: 4,
  section,
  breaker,
  rooms: ['Séjour'],
  fixtureIds: [],
});

const CIRCUITS: Circuit[] = [
  circuit('c1', 'prises', 2.5, 20),
  circuit('c2', 'eclairage', 1.5, 16),
  circuit('c3', 'vdi', null, null),
  circuit('c4', 'specialise', 2.5, 20),
];

const DIFFS: Differential[] = [
  { label: 'Différentiel type A 1', type: 'A', rating: 40, circuits: ['c4'] },
  { label: 'Différentiel type AC 1', type: 'AC', rating: 40, circuits: ['c1', 'c2'] },
];

const ACHATS = buyingList(TIRAGE, APPAREILS, PLAFOND);
const devisDe = (gamme: GammeId) => chiffrer(ACHATS, CIRCUITS, DIFFS, gamme);

describe('le devis ne recompte rien', () => {
  it('reprend EXACTEMENT les quantités du bordereau de matériel', () => {
    /*
      Le bordereau et le devis sont deux lectures d'un seul metre. Le jour ou
      le devis recompterait de son cote, un logement aurait deux verites — et
      c'est toujours celle qu'on n'a pas relue qui part au client.
    */
    const d = devisDe('celiane');
    for (const a of ACHATS) {
      const l = d.lignes.find((x) => x.libelle === a.label);
      expect(`${a.label} : ${l?.quantite}`).toBe(`${a.label} : ${a.quantity}`);
      expect(l!.unite).toBe(a.unit);
    }
  });

  it('et son total est la somme de ses lignes, au centime', () => {
    const d = devisDe('mosaic');
    const somme = d.lignes.reduce((s, l) => s + l.total, 0);
    expect(Math.round(d.total * 100)).toBe(Math.round(somme * 100));
  });

  it('et chaque rayon pèse ce que pèsent ses lignes', () => {
    const d = devisDe('odace');
    for (const f of d.parFamille) {
      const somme = d.lignes
        .filter((l) => l.famille === f.famille)
        .reduce((s, l) => s + l.total, 0);
      expect(`${f.famille} : ${Math.round(f.total * 100)}`).toBe(
        `${f.famille} : ${Math.round(somme * 100)}`,
      );
    }
  });
});

describe('changer de gamme', () => {
  it('change l’appareillage et la finition, et rien d’autre', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE DU CHOIX.

      Une gaine est une gaine, un disjoncteur est un disjoncteur : changer de
      modele d'interrupteur ne change rien a ce qui court dans les murs. Un
      chiffrage qui bougerait partout melangerait ses tables — et personne ne
      s'en apercevrait, puisque seul le total s'affiche.
    */
    const a = devisDe('dooxie');
    const b = devisDe('celiane');
    const bouge: string[] = [];
    for (const l of a.lignes) {
      const m = b.lignes.find((x) => x.code === l.code)!;
      if (m.total !== l.total) bouge.push(l.code);
    }
    const attendu = a.lignes
      .filter((l) => l.code.startsWith('meca-') || l.code.startsWith('plaque-'))
      .filter((l) => l.total > 0 || l.code === 'meca-tableau')
      .map((l) => l.code);
    // Le coffret de repartition ne depend pas de la gamme : il est range
    // avec l'appareillage par le bordereau, mais son prix ne bouge pas.
    expect(bouge.sort()).toEqual(
      attendu.filter((c) => c !== 'meca-tableau').sort(),
    );
  });

  it('et la plus habillée coûte plus cher que la moins chère', () => {
    // Sans quoi les cinq tables pourraient être la même, et le choix un
    // décor.
    const totaux = GAMMES.map((g) => devisDe(g.id).total);
    expect(devisDe('celiane').total).toBeGreaterThan(devisDe('dooxie').total);
    expect(new Set(totaux).size).toBe(GAMMES.length);
  });

  it('et toutes les gammes savent chiffrer tout ce qui se pose au mur', () => {
    // Un trou dans une table se verrait comme un article gratuit, pas comme
    // une erreur : c'est la faute qu'on ne voit jamais.
    const muraux = ACHATS.filter((a) => a.code?.startsWith('meca-'));
    for (const g of GAMMES) {
      for (const a of muraux) {
        const kind = a.code!.slice(5) as keyof (typeof TARIFS_MECANISME)['dooxie'];
        expect(`${g.id}/${kind}`).toBe(
          TARIFS_MECANISME[g.id][kind] ? `${g.id}/${kind}` : 'manquant',
        );
      }
    }
  });
});

describe('ce qui n’est pas compté', () => {
  it('laisse les luminaires au récapitulatif, à zéro, avec la raison', () => {
    const d = devisDe('dooxie');
    const dcl = d.lignes.find((l) => l.code === 'plafond-dcl')!;
    expect(dcl.quantite).toBe(1);
    expect(dcl.total).toBe(0);
    expect(dcl.note).toContain('envies');
    const spot = d.lignes.find((l) => l.code === 'plafond-spot')!;
    expect(spot.total).toBe(0);
  });

  it('mais compte la boîte du point lumineux, qui n’est pas un luminaire', () => {
    // Le contrôle en sens inverse : sans lui, « on ne compte pas le plafond »
    // aurait pu emporter la boîte DCL avec le luminaire.
    const d = devisDe('dooxie');
    const boite = d.lignes.find((l) => l.code === 'boite-dcl')!;
    expect(boite.quantite).toBe(1);
    expect(boite.total).toBeGreaterThan(0);
  });

  it('et compte le détecteur de fumée, qui n’en est pas un non plus', () => {
    const d = devisDe('dooxie');
    expect(d.lignes.find((l) => l.code === 'plafond-daaf')!.total).toBeGreaterThan(0);
  });

  it('et dit tout haut ce qu’il ne compte pas', () => {
    const d = devisDe('dooxie');
    expect(d.exclusions.join(' ')).toContain('Luminaires');
    expect(d.exclusions.join(' ')).toContain('Main-d’œuvre');
  });
});

describe('le total ne se tait pas sur ce qu’il ignore', () => {
  it('remonte les articles que le catalogue ne connaît pas', () => {
    /*
      On fabrique le cas : une ligne de bordereau dont l'article n'existe
      dans aucune table. Elle doit se voir — au recapitulatif ET dans
      `sansPrix` — au lieu de compter pour zero sans rien dire.
    */
    const inconnu = [
      ...ACHATS,
      {
        family: 'Appareillage',
        code: 'meca-inconnu',
        label: 'Mécanisme inédit',
        quantity: 3,
        unit: 'u',
      },
    ];
    const d = chiffrer(inconnu, CIRCUITS, DIFFS, 'dooxie');
    expect(d.sansPrix).toContain('Mécanisme inédit');
    const l = d.lignes.find((x) => x.libelle === 'Mécanisme inédit')!;
    expect(l.pu).toBeNull();
    expect(l.quantite).toBe(3);
  });

  it('et sur un logement complet, il ne manque aucun prix', () => {
    for (const g of GAMMES) {
      expect(`${g.id} : ${devisDe(g.id).sansPrix.join(', ')}`).toBe(`${g.id} : `);
    }
  });
});

describe('le tableau sort des circuits', () => {
  it('un disjoncteur par circuit protégé, à son calibre', () => {
    const d = devisDe('dooxie');
    // Trois circuits protégés : deux en 20 A, un en 16 A. Le courant faible
    // n'a pas de disjoncteur — il rejoint le coffret de communication.
    expect(d.lignes.find((l) => l.code === 'disj-20')!.quantite).toBe(2);
    expect(d.lignes.find((l) => l.code === 'disj-16')!.quantite).toBe(1);
  });

  it('les deux types de différentiel, comptés séparément', () => {
    const d = devisDe('dooxie');
    expect(d.lignes.find((l) => l.code === 'diff-A')!.quantite).toBe(1);
    expect(d.lignes.find((l) => l.code === 'diff-AC')!.quantite).toBe(1);
  });

  it('et le coffret de communication seulement s’il y a du courant faible', () => {
    const d = devisDe('dooxie');
    expect(d.lignes.some((l) => l.code === 'coffret-com')).toBe(true);
    const sansVdi = chiffrer(
      ACHATS,
      CIRCUITS.filter((c) => c.nature !== 'vdi'),
      DIFFS,
      'dooxie',
    );
    expect(sansVdi.lignes.some((l) => l.code === 'coffret-com')).toBe(false);
  });
});

describe('le plan qui explique le prix', () => {
  it('met en vedette des lots qui disent le même nombre que le récapitulatif', () => {
    /*
      Releve du patron : « une animation qui met en valeur les interrupteurs
      (par exemple), et affiche leur nombre et le prix moyen public ». Le
      nombre affiche sur le plan et celui du recapitulatif doivent etre le
      MEME nombre — sinon l'ecran se contredit lui-meme, sur la meme page.
    */
    const d = devisDe('celiane');
    for (const v of d.vedettes) {
      const somme = d.lignes
        .filter(
          (l) =>
            v.murs.some((k) => l.code === `meca-${k}`) ||
            v.plafonds.some((k) => l.code === `plafond-${k}`),
        )
        .reduce((s, l) => s + l.quantite, 0);
      expect(`${v.titre} : ${v.quantite}`).toBe(`${v.titre} : ${somme}`);
    }
  });

  it('et le prix moyen d’un lot est bien sa moyenne', () => {
    const d = devisDe('celiane');
    for (const v of d.vedettes) {
      expect(`${v.titre} : ${Math.round(v.pu * v.quantite)}`).toBe(
        `${v.titre} : ${Math.round(v.total)}`,
      );
    }
  });

  it('et les lots se présentent du plus lourd au plus léger', () => {
    // On explique un prix en commençant par ce qui le fait.
    const d = devisDe('celiane');
    const totaux = d.vedettes.map((v) => v.total);
    expect(totaux).toEqual([...totaux].sort((a, b) => b - a));
  });

  it('et il y a bien un lot de commandes, avec les va-et-vient dedans', () => {
    const d = devisDe('celiane');
    const cmd = d.vedettes.find((v) => v.id === 'commandes')!;
    // Un interrupteur et deux va-et-vient : trois commandes.
    expect(cmd.quantite).toBe(3);
    expect(cmd.murs).toContain('va');
  });
});

describe('le catalogue dit son âge', () => {
  it('porte sa version sur le devis', () => {
    expect(devisDe('dooxie').version).toMatch(/^\d{4}-\d{2}$/);
  });

  it('et chaque ligne chiffrée dit le mois de son relevé', () => {
    // Un chiffre nu, dans six mois, ne se distingue plus d'un chiffre juste.
    for (const l of devisDe('dooxie').lignes) {
      if (l.pu === null || l.total === 0) continue;
      expect(`${l.libelle} : ${l.releve ?? 'sans date'}`).toMatch(
        /: \d{4}-\d{2}$/,
      );
    }
  });
});
