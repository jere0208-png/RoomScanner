/**
 * DEUX CARTOUCHES NE SE COUVRENT PAS.
 *
 * Trouve a l'oeil, en regardant le dossier complet rendu en image : une note
 * posee au milieu d'une piece — « colonne montante ici » — tombait
 * exactement sur le cartouche « 12,0 m2 · surface au sol ». Les deux
 * reservent leur fond blanc, la note se peint en dernier, et le lecteur perd
 * les DEUX informations d'un coup.
 *
 * Sur l'ecran, on deplace la note d'un appui. Sur le papier, non : ce qui
 * est imprime est imprime.
 *
 * LA PUNAISE NE BOUGE PAS, LE MOT SI. C'est le point vise qui porte le sens
 * — « gaine a reprendre » ne veut rien dire trois metres plus loin — mais
 * l'etiquette, elle, peut se poser un peu plus haut ou un peu plus bas sans
 * rien perdre. C'est deja ce que fait le cartouche d'une piece face aux
 * meubles.
 */
import { ecarterDe } from '../src/ui/ecarter';

const boite = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('ecarter une etiquette de ce qui est deja pose', () => {
  it('ne bouge pas quand la place est libre', () => {
    const voulu = boite(0, 0, 40, 12);
    expect(ecarterDe(voulu, [boite(100, 100, 40, 12)])).toEqual(voulu);
  });

  it('la decale juste assez pour degager', () => {
    const voulu = boite(0, 0, 40, 12);
    const obstacle = boite(10, 0, 40, 12);
    const pose = ecarterDe(voulu, [obstacle]);
    // Elle garde sa taille et son abscisse : on la monte ou on la descend,
    // on ne la retaille pas et on ne l'envoie pas a l'autre bout.
    expect(pose.w).toBe(40);
    expect(pose.x).toBe(0);
    // Et elle ne touche plus l'obstacle.
    const chevauche =
      pose.x < obstacle.x + obstacle.w &&
      pose.x + pose.w > obstacle.x &&
      pose.y < obstacle.y + obstacle.h &&
      pose.y + pose.h > obstacle.y;
    expect(chevauche).toBe(false);
  });

  it('esquive plusieurs obstacles a la fois', () => {
    const voulu = boite(0, 0, 40, 12);
    const obstacles = [boite(0, 0, 40, 12), boite(0, 14, 40, 12), boite(0, -14, 40, 12)];
    const pose = ecarterDe(voulu, obstacles);
    for (const o of obstacles) {
      const chevauche =
        pose.x < o.x + o.w &&
        pose.x + pose.w > o.x &&
        pose.y < o.y + o.h &&
        pose.y + pose.h > o.y;
      expect(chevauche).toBe(false);
    }
  });

  it('rend la place voulue quand rien ne degage', () => {
    /*
      ON N'ENVOIE PAS L'ETIQUETTE A L'AUTRE BOUT DE LA FEUILLE.

      Si tout est occupe sur une distance raisonnable, mieux vaut un
      chevauchement a l'endroit juste qu'une etiquette lisible posee la ou
      elle ne veut rien dire. Une note designe un POINT : deplacee de trois
      metres, elle ment.
    */
    const voulu = boite(0, 0, 40, 12);
    const mur = Array.from({ length: 40 }, (_, i) => boite(0, (i - 20) * 6, 40, 12));
    expect(ecarterDe(voulu, mur)).toEqual(voulu);
  });
});
