/**
 * LE DIAMETRE D'UNE GAINE SE CALCULE SUR LE NOMBRE DE FILS.
 *
 * Releve du patron : « gaines sur plan a part "Plan de gaines" avec les
 * diametres recommandes pour chaque tirage selon nombre de fils aux normes
 * etc. Tout doit etre professionnel ».
 *
 * L'application choisissait le conduit sur la SEULE section : 1,5 mm² donnait
 * ICTA 16, quel que soit le nombre de conducteurs. C'est vrai pour trois
 * fils, et faux des le quatrieme — un va-et-vient tire six conducteurs de
 * 1,5, et six ne passent pas dans du 16.
 *
 * LA REGLE DE LA NORME EST CELLE DU TIERS : la somme des sections
 * EXTERIEURES des conducteurs ne doit pas depasser le tiers de la section
 * interieure du conduit. C'est ce qui rend le tirage possible a la main, et
 * c'est verifiable — on ne s'en remet pas a une table recopiee.
 */
import { conduitPour, conduitFor } from '../src/geometry/conduits';

describe('le diametre d’un conduit', () => {
  it('suffit a trois fils de 1,5 en ICTA 16', () => {
    expect(conduitPour(1.5, 3)).toBe(16);
  });

  it('mais passe au 20 des que le va-et-vient s’en mele', () => {
    // Phase, neutre, terre, retour, deux navettes : six conducteurs.
    expect(conduitPour(1.5, 6)).toBeGreaterThanOrEqual(20);
  });

  it('et monte encore quand la section grossit', () => {
    expect(conduitPour(2.5, 3)).toBeGreaterThanOrEqual(20);
    expect(conduitPour(6, 3)).toBeGreaterThanOrEqual(25);
    expect(conduitPour(10, 3)).toBeGreaterThanOrEqual(32);
  });

  it('ne descend jamais sous le 16 : rien ne se tire dans plus petit', () => {
    expect(conduitPour(1.5, 1)).toBe(16);
  });

  it('donne du 25 aux courants faibles, quel qu’en soit le compte', () => {
    // On y tire rarement une seule paire, et une gaine trop juste se paie
    // au tirage.
    expect(conduitPour(null, 4)).toBe(25);
  });

  it('et l’ancienne regle reste, pour qui ne compte pas ses fils', () => {
    // `conduitFor` sert encore la ou le nombre de conducteurs n'est pas
    // connu : elle vaut le cablage a trois fils, le plus courant.
    expect(conduitFor(1.5)).toBe(16);
    expect(conduitFor(2.5)).toBe(20);
  });
});
