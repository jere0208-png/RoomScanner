/**
 * LE RELEVÉ DE L'EXISTANT — le tableau qu'on trouve en arrivant.
 *
 * La moitié des chantiers d'un électricien est de la rénovation, et elle
 * commence toujours pareil : on ouvre le tableau, on regarde ce qu'il y a,
 * et on dit au client ce qu'il faut reprendre. Aucun concurrent généraliste
 * ne sait faire ça — magicplan et les autres DESSINENT DU NEUF.
 *
 * On relève donc les départs tels qu'ils sont, et l'application dit ce qui
 * cloche au regard de la NF C 15-100. Ce n'est pas un diagnostic
 * réglementaire — il faut un appareil pour mesurer une terre — mais tout ce
 * qui SE VOIT dans un tableau ouvert, l'application le voit aussi.
 *
 * TROIS DEGRÉS, et ils comptent : ce qui est DANGEREUX (pas de 30 mA), ce
 * qui est un ÉCART à la norme (un seul différentiel), et ce qui demande à
 * VÉRIFIER sur place (une terre qu'on ne peut pas mesurer d'ici). Tout
 * mettre en rouge, c'est n'alerter sur rien.
 */
import {
  diagnosticExistant,
  modulesLibres,
  reserveSuffisante,
  type DepartExistant,
} from '../src/geometry/existant';

const dj = (
  id: string,
  calibre: number,
  usage = '',
  sous?: string,
): DepartExistant => ({
  id,
  organe: 'disjoncteur',
  calibre,
  usage,
  sousDifferentiel: sous,
});

const diff = (
  id: string,
  sensibilite: number,
  type: 'A' | 'AC' | 'F' = 'AC',
): DepartExistant => ({
  id,
  organe: 'differentiel',
  calibre: 40,
  sensibilite,
  typeDiff: type,
});

/** Un tableau correct : deux 30 mA, dont un de type A, six départs. */
const CONFORME: DepartExistant[] = [
  diff('d1', 30, 'AC'),
  dj('c1', 16, 'Éclairage séjour', 'd1'),
  dj('c2', 20, 'Prises séjour', 'd1'),
  dj('c3', 16, 'Éclairage chambres', 'd1'),
  diff('d2', 30, 'A'),
  dj('c4', 20, 'Prises cuisine', 'd2'),
  dj('c5', 32, 'Plaque de cuisson', 'd2'),
  dj('c6', 20, 'Lave-linge', 'd2'),
];

const titres = (departs: DepartExistant[]) =>
  diagnosticExistant(departs).map((c) => c.titre);

describe('ce qui est dangereux', () => {
  it('un tableau sans 30 mA est signalé en premier, et en grave', () => {
    // C'est LA question de la rénovation : sans différentiel 30 mA, un
    // défaut d'isolement passe par la personne. Tout le reste attend.
    const sans = CONFORME.filter((d) => d.organe !== 'differentiel');
    const constats = diagnosticExistant(sans);
    expect(constats[0].gravite).toBe('danger');
    expect(constats[0].titre).toMatch(/30 mA/);
  });

  it('les fusibles disent l’âge de l’installation', () => {
    const vieux: DepartExistant[] = [
      { id: 'f1', organe: 'fusible', calibre: 10, usage: 'Éclairage' },
      diff('d1', 30, 'A'),
    ];
    const constats = diagnosticExistant(vieux);
    expect(constats.some((c) => /fusible/i.test(c.titre))).toBe(true);
    // Danger : un porte-fusible ne coupe pas comme un disjoncteur, et le
    // calibre y est celui qu'un occupant a bien voulu y mettre.
    expect(
      constats.find((c) => /fusible/i.test(c.titre))?.gravite,
    ).toBe('danger');
  });
});

describe('les écarts à la norme', () => {
  it('un seul différentiel ne suffit pas dans un logement', () => {
    const un = [diff('d1', 30, 'A'), dj('c1', 16, 'Éclairage', 'd1')];
    expect(titres(un).some((t) => /deux/i.test(t))).toBe(true);
  });

  it('il faut un différentiel de type A', () => {
    // Lave-linge, plaques à induction, bornes de recharge : leurs défauts
    // portent une composante continue qu'un type AC ne voit pas.
    const queDuAC = [diff('d1', 30, 'AC'), diff('d2', 30, 'AC')];
    expect(titres(queDuAC).some((t) => /type A/.test(t))).toBe(true);
    expect(titres(CONFORME).some((t) => /type A/.test(t))).toBe(false);
  });

  it('plus de huit circuits sous un différentiel, c’est trop', () => {
    const charge = [
      diff('d1', 30, 'A'),
      diff('d2', 30, 'AC'),
      ...Array.from({ length: 9 }, (_, i) => dj(`c${i}`, 16, 'Éclairage', 'd1')),
    ];
    expect(titres(charge).some((t) => /huit|8/.test(t))).toBe(true);
  });

  it('un calibre trop gros pour son usage se voit', () => {
    // 20 A sur de l'éclairage : le fil de 1,5 mm² fond avant que le
    // disjoncteur ne s'en aperçoive.
    const gros = [
      diff('d1', 30, 'A'),
      diff('d2', 30, 'AC'),
      dj('c1', 20, 'Éclairage séjour', 'd1'),
    ];
    const constat = diagnosticExistant(gros).find((c) => /calibre/i.test(c.titre));
    expect(constat?.gravite).toBe('ecart');
    expect(constat?.detail).toMatch(/16/);
  });

  it('un tableau correct ne dit rien de faux', () => {
    // Le silence est le seul verdict qui vaut : une application qui trouve
    // toujours quelque chose ne sert plus à rien.
    const graves = diagnosticExistant(CONFORME).filter(
      (c) => c.gravite !== 'vigilance',
    );
    expect(graves).toEqual([]);
  });
});

describe('la réserve du tableau', () => {
  it('compte les modules libres', () => {
    // Un tableau de 13 modules par rangée, deux rangées : 26 places.
    expect(modulesLibres(CONFORME, 2, 13)).toBe(26 - CONFORME.length);
  });

  it('exige un cinquième de réserve, comme la norme', () => {
    // 20 % : c'est ce qui permet d'ajouter un circuit sans changer le
    // tableau — et c'est exactement ce qu'on vient faire en rénovation.
    expect(reserveSuffisante(26, 8)).toBe(true);
    expect(reserveSuffisante(26, 22)).toBe(false);
  });

  it('le dit quand le tableau est plein', () => {
    // La réserve ne se juge QUE si l'on connaît le contenant : sans les
    // rangées relevées, on ne sait pas si treize modules occupés tiennent
    // dans un tableau de treize ou de trente-neuf. Le constat n'apparaît
    // donc pas tant que le tableau n'est pas décrit — plutôt que de le
    // supposer et d'annoncer un faux manque de place.
    const plein = [
      diff('d1', 30, 'A'),
      diff('d2', 30, 'AC'),
      ...Array.from({ length: 11 }, (_, i) => dj(`c${i}`, 16, 'Prises', 'd1')),
    ];
    expect(titres(plein).some((t) => /réserve|place/i.test(t))).toBe(false);
    const avecTableau = diagnosticExistant(plein, {
      rangees: 1,
      parRangee: 13,
    }).map((c) => c.titre);
    expect(avecTableau.some((t) => /réserve|place/i.test(t))).toBe(true);
  });
});

describe('ce qui demande à être vérifié sur place', () => {
  it('rappelle la terre et la liaison équipotentielle', () => {
    // On ne mesure pas une prise de terre depuis un plan : on le DIT, au
    // lieu de laisser croire que le contrôle est complet.
    const constats = diagnosticExistant(CONFORME);
    expect(constats.some((c) => /terre/i.test(c.titre))).toBe(true);
    expect(
      constats.find((c) => /terre/i.test(c.titre))?.gravite,
    ).toBe('vigilance');
  });
});
