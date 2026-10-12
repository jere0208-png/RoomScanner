/**
 * LES SYMBOLES DU PLAN D'ARCHITECTE, ET LE RUBAN LED.
 *
 * Relevé du patron, DCE d'architecte à l'appui (« Romeo », plans Elec) :
 * « reprends les icônes des légendes et du plan pour changer les nôtres —
 * appliques, luminaires, détecteurs, spots, prises… Je trouve ces plans plus
 * intuitifs », puis « rajoute la possibilité de placer de la LED comme sur
 * ces plans ».
 *
 * Ce banc tient :
 *   — les dessins : la prise en arc posé sur le mur, sa tige vers la pièce ;
 *     l'interrupteur à rond creux ; l'applique en demi-disque barré ; le spot
 *     à deux ronds ; le détecteur et son quart de visée ; le spot au sol dans
 *     sa croix ; l'alimentation dédiée en rond, son sigle dedans ;
 *   — les mots : « 2 » au bout de la tige, « RJ45 », « TV », « LV »… ;
 *   — le ruban LED : tracé en corniche, en caisson, le long d'un mur ; il se
 *     déplace avec sa pièce, se mesure, et s'achète au mètre.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import {
  COMMANDES_MURALES,
  C_GENERAL,
  FIXTURES,
  FIXTURE_SYMBOL,
  libelleDuSymbole,
  motDansLeRond,
  porteeVersLeMur,
  symbolPolylines,
  usagesPour,
} from '../src/geometry/electrical';
import { CEILINGS, CEILING_KINDS, CEILING_SYMBOL, lightingLoad, puissanceDuPlafonnier } from '../src/geometry/ceiling';
import {
  longueurDuRuban,
  pointDAccroche,
  rubanLeLongDuMur,
  rubanPeripherique,
  zigzag,
} from '../src/geometry/ruban';
import { placeDuDetecteur, roomParts, type Pt } from '../src/geometry/floorplan';
import { planCircuits } from '../src/geometry/nfc15100';
import { buildScanPdf } from '../src/export/pdf';
import { buyingList } from '../src/geometry/conduits';
import { chiffrer } from '../src/geometry/devis';
import { TARIFS_MECANISME } from '../src/geometry/prix';

const st = () => useScanStore.getState();
beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

describe('les symboles de la légende', () => {
  const ys = (k: keyof typeof FIXTURE_SYMBOL, i: number) => symbolPolylines([FIXTURE_SYMBOL[k][i]])[0].pts.map((p) => p.y);

  it('la prise : un arc ouvert sur le mur (ses pointes à y = 10), sa tige vers la pièce', () => {
    const arc = symbolPolylines([FIXTURE_SYMBOL.prise[0]])[0].pts;
    expect(arc[0].y).toBeCloseTo(10);
    expect(arc[arc.length - 1].y).toBeCloseTo(10);
    // L'arc s'avance dans la pièce (y négatifs = loin du mur), sans diamètre.
    expect(Math.min(...arc.map((p) => p.y))).toBeCloseTo(3);
    expect(Math.min(...ys('prise', 1))).toBeLessThan(0);
    expect(porteeVersLeMur(FIXTURE_SYMBOL.prise)).toBeCloseTo(10);
  });

  it('l’interrupteur : un rond CREUX contre le mur', () => {
    expect(FIXTURE_SYMBOL.inter[0].fill).toBeFalsy();
    expect(porteeVersLeMur(FIXTURE_SYMBOL.inter)).toBeCloseTo(10);
  });

  it('l’applique : le demi-disque contre le mur, barré de sa croix', () => {
    const sym = FIXTURE_SYMBOL.applique;
    expect(sym).toHaveLength(4);
    // Le diamètre est le mur.
    expect(ys('applique', 0).every((y) => Math.abs(y - 10) < 1e-9)).toBe(true);
  });

  it('au plafond : le spot à deux ronds, le détecteur et sa visée, le spot au sol dans sa croix', () => {
    expect(CEILING_SYMBOL.spot).toHaveLength(2);
    expect(CEILING_SYMBOL.detecteur.map((s) => s.d)).toEqual(expect.arrayContaining(['M0 0 V-9', 'M0 0 H9']));
    expect(CEILING_SYMBOL.spotSol.map((s) => s.d)).toEqual(expect.arrayContaining(['M-9 0 H9', 'M0 -9 V9']));
    for (const k of CEILING_KINDS) expect(CEILING_SYMBOL[k].length).toBeGreaterThan(0);
  });
});

describe('les mots du symbole', () => {
  it('« 2 » au bout de la tige d’une prise double, sans « ×2 »', () => {
    const l = libelleDuSymbole(['prise', 'prise'], 'prise2');
    expect(l?.texte).toBe('2');
    expect(l?.compte).toBe(true);
    expect(l!.ou.y).toBeLessThan(0);
  });

  it('« RJ45 », « TV » à côté de leur socle ; rien sur une prise simple', () => {
    expect(libelleDuSymbole(['rj45'], 'rj45')?.texte).toBe('RJ45');
    expect(libelleDuSymbole(['tv'], 'tv')?.texte).toBe('TV');
    expect(libelleDuSymbole(['prise'], 'prise')).toBeNull();
  });

  it('dans le rond d’une alimentation dédiée : le sigle de l’appareil, à défaut le calibre', () => {
    expect(libelleDuSymbole(['prise20'], 'prise20')?.texte).toBe('20A');
    expect(libelleDuSymbole(['prise20'], 'prise20', 'LV')?.texte).toBe('LV');
    expect(libelleDuSymbole(['prise32'], 'prise32', 'PL')?.texte).toBe('PL');
    const dedans = libelleDuSymbole(['prise20'], 'prise20', 'LV')!;
    expect(dedans.ou.y).toBeGreaterThan(0);
  });

  it('on propose les appareils qu’un type alimente d’ordinaire', () => {
    expect(usagesPour('prise20').map((u) => u.sigle)).toEqual(expect.arrayContaining(['LV', 'LL', 'SL', 'FO']));
    expect(usagesPour('prise32').map((u) => u.sigle)).toContain('PL');
    expect(usagesPour('inter')).toEqual([]);
  });

  it('le sigle se pose et se retire, d’un geste annulable', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Cuisine', { auNu: true });
    const id = st().addFixture('prise20', st().walls[0].id, 1)!;
    st().setFixtureUsage(id, 'LV');
    expect(st().fixtures.find((f) => f.id === id)?.usage).toBe('LV');
    st().undo();
    expect(st().fixtures.find((f) => f.id === id)?.usage).toBeUndefined();
  });
});

describe('le ruban LED', () => {
  const carre: Pt[] = [
    { x: 0, z: 0 },
    { x: 5, z: 0 },
    { x: 5, z: 4 },
    { x: 0, z: 4 },
  ];

  it('en caisson : le tour de la pièce, en retrait', () => {
    const t = rubanPeripherique(carre, 0.6)!;
    expect(t).toHaveLength(4);
    const xs = t.map((p) => p.x);
    const zs = t.map((p) => p.z);
    expect(Math.min(...xs)).toBeCloseTo(0.6, 9);
    expect(Math.max(...xs)).toBeCloseTo(4.4, 9);
    expect(Math.min(...zs)).toBeCloseTo(0.6, 9);
    expect(longueurDuRuban(t, true)).toBeCloseTo(2 * (3.8 + 2.8), 9);
    // Le sens du contour n'y change rien.
    expect(longueurDuRuban(rubanPeripherique([...carre].reverse(), 0.6)!, true)).toBeCloseTo(13.2, 9);
  });

  it('un L reste un L, et un retrait qui mange la pièce ne pose rien', () => {
    const L: Pt[] = [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 3 },
      { x: 3, z: 3 },
      { x: 3, z: 6 },
      { x: 0, z: 6 },
    ];
    const t = rubanPeripherique(L, 0.5)!;
    expect(t).toHaveLength(6);
    expect(t).toContainEqual({ x: 2.5, z: 2.5 });
    expect(rubanPeripherique(carre, 2.5)).toBeNull();
  });

  it('le long du mur touché : le côté le plus proche du doigt, ouvert', () => {
    const t = rubanLeLongDuMur(carre, { x: 2, z: 0.3 }, 0.05)!;
    expect(t).toHaveLength(2);
    expect(t[0].z).toBeCloseTo(0.05, 9);
    expect(longueurDuRuban(t)).toBeCloseTo(5, 9);
  });

  it('son dessin est une ligne brisée qui part et finit sur le tracé', () => {
    const z = zigzag([{ x: 0, y: 0 }, { x: 60, y: 0 }], 6, 2);
    expect(z[0]).toEqual({ x: 0, y: 0 });
    expect(z[z.length - 1].x).toBeCloseTo(60);
    expect(Math.max(...z.map((p) => Math.abs(p.y)))).toBeCloseTo(2);
  });

  it('le lien de commande s’accroche au point du ruban le plus proche', () => {
    const t = rubanPeripherique(carre, 0.6)!;
    const p = pointDAccroche({ at: t[0], trace: t, ferme: true }, { x: 5, z: 2 });
    expect(p.x).toBeCloseTo(4.4, 9);
    expect(p.z).toBeCloseTo(2, 9);
  });

  it('se pose dans la pièce, glisse avec elle et se mesure', () => {
    st().commencerAuClavier();
    st().addRoomLibre(5, 4, 'Séjour', { auNu: true });
    const part = roomParts(st().walls, st().rooms)[0];
    const contour = part.surface!.nu ?? part.surface!.pts;
    const id = st().addRuban(st().rooms[0].id, rubanPeripherique(contour, 0.1)!, true)!;
    const cl = st().ceiling.find((c) => c.id === id)!;
    expect(cl.kind).toBe('led');
    expect(longueurDuRuban(cl.trace!, true)).toBeCloseTo(2 * (4.8 + 3.8), 6);
    // Sa puissance suit sa longueur : 10 W/m.
    expect(puissanceDuPlafonnier(cl)).toBe(Math.round(10 * 17.2));
    expect(lightingLoad([cl]).get(cl.roomId)?.watts).toBe(172);
    // On le glisse : tout le tracé suit.
    const avant = cl.trace![2];
    st().moveCeiling(id, { x: cl.at.x + 0.2, z: cl.at.z });
    const apres = st().ceiling.find((c) => c.id === id)!;
    expect(apres.trace![2].x).toBeCloseTo(avant.x + 0.2, 9);
    // La pièce glisse : le ruban aussi.
    st().moveRoom(st().rooms[0].id, 1, 0, false);
    expect(st().ceiling.find((c) => c.id === id)!.trace![2].x).toBeCloseTo(avant.x + 1.2, 6);
  });

  it('s’achète en rouleaux de 5 m, avec ses alimentations et son profilé', () => {
    st().commencerAuClavier();
    st().addRoomLibre(5, 4, 'Séjour', { auNu: true });
    const part = roomParts(st().walls, st().rooms)[0];
    const contour = part.surface!.nu ?? part.surface!.pts;
    st().addRuban(st().rooms[0].id, rubanPeripherique(contour, 0.6)!, true);
    st().addRuban(st().rooms[0].id, rubanLeLongDuMur(contour, { x: 2.5, z: 0 }, 0.05)!, false);
    const liste = buyingList([], [], st().ceiling);
    /*
      Revues « Fatou » et « Mehdi » : sous un code inconnu du catalogue, le
      ruban sortait du devis à 0 €. Le caisson de 13,20 m se coupe dans 3
      rouleaux de 5 m, le ruban de 5 m dans 1. Le rouleau du catalogue est
      un kit AVEC son alimentation : pas d'alimentation comptée deux fois.
    */
    const ruban = liste.find((l) => l.code === 'ruban-led')!;
    expect(ruban.unit).toBe('rouleau');
    expect(ruban.quantity).toBe(4);
    expect(ruban.note).toMatch(/18,5 m en 2 rubans, kits de 5 m avec leur alimentation/);
    expect(liste.find((l) => l.code === 'transfo-led')).toBeUndefined();
    const devis = chiffrer(liste, [], [], 'dooxie');
    expect(devis.lignes.find((l) => l.code === 'ruban-led')?.pu).toBeGreaterThan(0);
    // Le profilé a son prix, lui aussi (relevé Castorama, Paulmann 2 m).
    expect(devis.lignes.find((l) => l.code === 'led-profile')?.pu).toBe(19.95);
    expect(CEILINGS.led.commandable).toBe(true);
  });
});

describe('les trois de plus de la légende', () => {
  it('l’interrupteur général : une commande, qui garde son violet sur le plan à l’encre', () => {
    expect(COMMANDES_MURALES).toContain('interGeneral');
    expect(FIXTURES.interGeneral.teintePropre).toBe(C_GENERAL);
    // Le dessin de l'interrupteur, son rond marqué d'un point.
    expect(FIXTURE_SYMBOL.interGeneral.slice(0, FIXTURE_SYMBOL.inter.length)).toEqual(FIXTURE_SYMBOL.inter);
    expect(FIXTURE_SYMBOL.interGeneral.some((s) => s.fill)).toBe(true);
  });

  it('le vidéophone : le rond « VP », raccordé au coffret de communication', () => {
    expect(libelleDuSymbole(['videophone'], 'videophone')?.texte).toBe('VP');
    const circuits = planCircuits(
      [{ id: 'vp', kind: 'videophone', wallId: 'm', along: 1, height: 1.5, side: 1 }],
      () => 'Entrée',
      () => false,
    );
    expect(circuits.find((c) => c.nature === 'vdi')?.fixtureIds).toEqual(['vp']);
  });

  it('le détecteur d’ouverture : posé sur une menuiserie, écrit dans la baie, compté au bordereau', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Entrée', { auNu: true });
    const porte = st().addOpening(st().walls[0].id, 'door')!;
    st().toggleDetecteurOuverture(porte);
    const o = st().openings.find((x) => x.id === porte)!;
    expect(o.detecteur).toBe(true);
    // Le « DO » s'écrit à 22 cm de la baie, du côté de la pièce.
    const part = roomParts(st().walls, st().rooms)[0];
    const p = placeDuDetecteur(o, part.labelAt);
    const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeCloseTo(0.22, 6);
    expect(Math.hypot(p.x - part.labelAt.x, p.z - part.labelAt.z)).toBeLessThan(
      Math.hypot(m.x - part.labelAt.x, m.z - part.labelAt.z),
    );
    expect(buyingList([], [], [], st().openings).find((l) => l.code === 'alarme-contact')?.quantity).toBe(1);
    st().undo();
    expect(st().openings.find((x) => x.id === porte)?.detecteur).toBeUndefined();
  });
});

describe('le mot dans le rond, partout où le symbole est seul', () => {
  it('« VP », « 20A », « LV » : un rond seul ne se confond plus', () => {
    expect(motDansLeRond('videophone')?.texte).toBe('VP');
    expect(motDansLeRond('prise20')?.texte).toBe('20A');
    expect(motDansLeRond('prise20', 'LV')?.texte).toBe('LV');
    // Hors des ronds : rien (le « RJ45 » d'une prise se lit à côté d'elle).
    expect(motDansLeRond('rj45')).toBeNull();
    expect(motDansLeRond('prise')).toBeNull();
  });

  it('dans la légende du dossier, le vidéophone porte « VP » et ne se mêle pas à la prise 20 A', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Entrée', { auNu: true });
    st().addFixture('videophone', st().walls[0].id, 1);
    st().addFixture('prise20', st().walls[1].id, 1);
    const s = st();
    const bytes = buildScanPdf(
      { name: 'Legende', walls: s.walls, openings: s.openings, objects: [], rooms: s.rooms, fixtures: s.fixtures, photos: [] } as never,
      false,
      { metre: false } as never,
    );
    let src = '';
    for (let i = 0; i < bytes.length; i++) src += String.fromCharCode(bytes[i]);
    // Le plan l'écrit une fois, la légende une seconde.
    expect(src.split('(VP) Tj').length - 1).toBeGreaterThanOrEqual(2);
  });
});

/*
  LES PRIX QUI MANQUAIENT — revues « Fatou » et « Mehdi », choix du patron :
  « les plus utilisés, moyen de gamme, de Castorama ». Le visiophone en kit
  (sans boîte ni plaque), l'interrupteur général au prix de l'interrupteur
  de la gamme, le détecteur d'ouverture, le spot au sol compté comme
  luminaire.
*/
describe('le devis chiffre ce qui sortait à 0 €', () => {
  const f = (id: string, kind: string) =>
    ({ id, kind, wallId: 'w', along: 1, height: 1.1, side: 1 }) as never;
  it('visiophone, interrupteur général, détecteur d’ouverture', () => {
    const fixtures = [f('v', 'videophone'), f('g', 'interGeneral')];
    const ouvertures = [{ id: 'o', type: 'window', a: { x: 0, z: 0 }, b: { x: 1, z: 0 }, height: 1, yCenter: 1, detecteur: true }] as never;
    const liste = buyingList([], fixtures, [], ouvertures);
    const visio = liste.find((l) => l.code === 'visiophone')!;
    expect(visio.label).toBe('Visiophone 2 fils');
    // Pas de boîte Ø 67 ni de plaque pour lui : seul l'interrupteur général en a.
    expect(liste.find((l) => l.code === 'boite-encastrement')?.quantity).toBe(1);
    const devis = chiffrer(liste, [], [], 'dooxie');
    const pu = (code: string) => devis.lignes.find((l) => l.code === code)?.pu;
    expect(pu('visiophone')).toBe(149.9);
    expect(pu('alarme-contact')).toBe(49.9);
    expect(pu('meca-interGeneral')).toBe(TARIFS_MECANISME.dooxie.inter!.pu);
  });
});

