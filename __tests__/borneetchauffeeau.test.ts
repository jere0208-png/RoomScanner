/**
 * LA BORNE A SON DIFFÉRENTIEL, LE CHAUFFE-EAU SON CONTACTEUR — revue
 * « chantier » :
 *   — la borne de recharge (40 A) partait derrière le même différentiel type
 *     A de 40 A que la plaque et le chauffe-eau, alors que sa propre note dit
 *     « différentiel 30 mA type A ou F » : chaque point de charge a sa
 *     protection différentielle à lui (NF C 15-100, partie 7-722) ;
 *   — le circuit du chauffe-eau annonçait « commandé par un contacteur heures
 *     creuses », et le bordereau ne l'achetait jamais.
 */
import type { Fixture } from '../src/geometry/electrical';
import { planCircuits, planDifferentials } from '../src/geometry/nfc15100';
import { buyingList } from '../src/geometry/conduits';
import { chiffrer } from '../src/geometry/devis';

const sortie = (id: string, usage: string): Fixture => ({ id, kind: 'sortieCable', wallId: 'm', along: 1, height: 0.3, side: 1, usage } as Fixture);
const FIXTURES: Fixture[] = [
  sortie('ve', 'VE'),
  sortie('pl', 'PL'),
  sortie('cu', 'CU'),
  { id: 'll', kind: 'prise20', wallId: 'm', along: 2, height: 0.3, side: 1 } as Fixture,
];
const circuits = planCircuits(FIXTURES, () => 'Séjour', () => false, () => 'r1');

describe('la borne de recharge', () => {
  it('a son propre différentiel 30 mA type A, à elle seule', () => {
    const diffs = planDifferentials(circuits, 60);
    const borne = circuits.find((c) => c.fixtureIds.includes('ve'))!;
    const siens = diffs.filter((d) => (d.circuitIds ?? []).includes(borne.id));
    expect(siens).toHaveLength(1);
    expect(siens[0].type).toBe('A');
    expect(siens[0].circuitIds).toEqual([borne.id]);
    expect(siens[0].rating).toBeGreaterThanOrEqual(borne.breaker!);
    // Les autres circuits spécialisés gardent leur type A partagé.
    const plaque = circuits.find((c) => c.fixtureIds.includes('pl'))!;
    const partage = diffs.find((d) => (d.circuitIds ?? []).includes(plaque.id))!;
    expect(partage.type).toBe('A');
    expect(partage.circuitIds).not.toContain(borne.id);
  });

  it('et le devis le compte', () => {
    const diffs = planDifferentials(circuits, 60);
    const devis = chiffrer(buyingList([], FIXTURES, []), circuits, diffs, 'dooxie', undefined, undefined, true);
    const lignesA = devis.lignes.filter((l) => l.code?.startsWith('diff-A'));
    expect(lignesA.reduce((t, l) => t + l.quantite, 0)).toBe(diffs.filter((d) => d.type === 'A').length);
    expect(diffs.filter((d) => d.type === 'A').length).toBe(2);
  });
});

describe('le chauffe-eau en heures creuses', () => {
  it('fait acheter son contacteur jour/nuit', () => {
    const achats = buyingList([], FIXTURES, []);
    const jn = achats.find((a) => a.code === 'contacteur-jn');
    expect(jn?.quantity).toBe(1);
    // Deux chauffe-eau, deux contacteurs.
    const deux = buyingList([], [...FIXTURES, sortie('cu2', 'CU')], []);
    expect(deux.find((a) => a.code === 'contacteur-jn')?.quantity).toBe(2);
    // Sans chauffe-eau, rien.
    expect(buyingList([], [sortie('ve', 'VE')], []).some((a) => a.code === 'contacteur-jn')).toBe(false);
  });

  it('et le contacteur prend sa place au coffret', () => {
    const diffs = planDifferentials(circuits, 60);
    const avec = chiffrer(buyingList([], FIXTURES, []), circuits, diffs, 'dooxie', undefined, undefined, true);
    const sans = chiffrer(
      buyingList([], FIXTURES, []).filter((a) => a.code !== 'contacteur-jn'),
      circuits,
      diffs,
      'dooxie',
      undefined,
      undefined,
      true,
    );
    const modules = (d: typeof avec) => Number(/(\d+) modules occupés/.exec(d.lignes.find((l) => l.code?.startsWith('coffret-'))?.note ?? '')?.[1]);
    expect(modules(avec)).toBe(modules(sans) + 1);
  });
});
