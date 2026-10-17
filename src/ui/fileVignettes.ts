/**
 * LES VIGNETTES 3D SE CALCULENT APRÈS LA PREMIÈRE IMAGE, UNE PAR IMAGE.
 *
 * Une vignette logicielle (`geometry/vignette3d`) coûte, mesurée sous Node
 * (Jest, machine de quatre cœurs chargée) : la carte, 184 × 108 px, de 11
 * à 20 ms pour une chaise ou une lampe, 55 à 65 ms pour un canapé (ses
 * coussins font des milliers de petits triangles) ; la grande vignette du
 * meuble choisi, 336 × 208 px, 35 à 40 ms en moyenne, 100 à 170 ms pour un
 * canapé. Hermes, qui n'a pas de compilation à la volée, en met plusieurs
 * fois plus. Huit meubles d'un coup à l'ouverture de « Décorer » — près
 * d'un quart de seconde sous Node, une seconde et plus sur le téléphone —
 * gèleraient la feuille au moment où elle monte.
 *
 * Elles passent donc dans une file : rien avant que la feuille ait posé sa
 * PREMIÈRE image (deux `requestAnimationFrame` : le premier tombe avant le
 * dessin, le second après), puis UNE vignette par image, de sorte qu'aucun
 * tour de boucle ne porte plus d'une vignette. (`InteractionManager` n'est
 * plus qu'une façade dépréciée dans React Native 0.86 : il n'attend rien.)
 * Une carte qui disparaît, ou dont la teinte change avant son tour, retire
 * sa tâche : on ne calcule pas une image que personne ne verra.
 */

type Tache = { faire: () => void; annulee: boolean };

const file: Tache[] = [];
let armee = false;

const image = (cb: () => void) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb);
  else setTimeout(cb, 16);
};

function tour() {
  let t = file.shift();
  while (t && t.annulee) t = file.shift();
  if (t) {
    try {
      t.faire();
    } catch {
      // Une vignette qui échoue laisse sa carte à la pastille : rien de plus.
    }
  }
  while (file.length > 0 && file[0].annulee) file.shift();
  if (file.length > 0) image(tour);
  else armee = false;
}

/**
 * Planifie `faire` après la première image, une tâche par image. Rend de
 * quoi l'annuler. `devant` la passe en tête (la grande vignette du meuble
 * choisi : c'est elle qu'on regarde).
 */
export function apresLaPremiereImage(faire: () => void, devant = false): () => void {
  const t: Tache = { faire, annulee: false };
  if (devant) file.unshift(t);
  else file.push(t);
  if (!armee) {
    armee = true;
    image(() => image(tour));
  }
  return () => {
    t.annulee = true;
  };
}

/** Pour le banc : le nombre de tâches encore en attente. */
export function tachesEnAttente(): number {
  return file.filter((t) => !t.annulee).length;
}
