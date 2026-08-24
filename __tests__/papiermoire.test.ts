/**
 * LA PHOTO D'UN ÉCRAN — le cas qui a fait rire le patron, et pas de joie.
 *
 * Premier essai sur le terrain : le plan n'était pas sur une feuille, il
 * était SUR L'ÉCRAN de l'ordinateur, et c'est l'écran qui a été
 * photographié. Le relevé rendu n'avait « rien à voir » avec le plan. Trois
 * choses s'étaient liguées, et aucune n'était une surprise une fois vue :
 *
 *   — LA PHOTO CONTIENT AUTRE CHOSE QUE LE PLAN. Le bureau, les onglets du
 *     navigateur, la barre des tâches, le cartouche. Le lecteur travaillait
 *     sur TOUTE l'image : il cherchait des murs dans une fenêtre de
 *     navigateur, et l'échelle dans un menu Démarrer. Le recadrage sur la
 *     zone dessinée était prévu depuis le premier jour et n'avait jamais
 *     été écrit.
 *   — LE MOIRÉ. Photographier une dalle, c'est échantillonner une grille
 *     avec une autre : il en sort des franges d'interférence sur toute
 *     l'image. Le seuil local les prend pour de l'encre — elles SONT plus
 *     sombres que leur voisinage.
 *   — LE FOND SOMBRE. Autour de la fenêtre, la photo est presque noire.
 *     Un seuil local sur du noir uniforme ne compare que du bruit à du
 *     bruit, et rend du bruit.
 *
 * Ce banc refabrique exactement cela à partir d'une planche dont on connaît
 * les cotes : on l'incruste dans un écran, on ajoute les franges et le fond
 * sombre, et l'on exige de retrouver l'appartement. Il ÉCHOUE sur le code
 * qui a produit le relevé du patron — c'est à cela qu'on le reconnaît.
 */
import { binariser, encre } from '../src/papier/image';
import { photographierUnEcran } from '../src/papier/ecranSimule';
import { photographierPlanche } from '../src/papier/simulateur';
import { T1 } from '../src/papier/planches';
import { lirePlanPapier } from '../src/papier/lecture';

describe('un plan photographié SUR UN ÉCRAN', () => {
  const propre = photographierPlanche(T1, { echelle: 100 });
  const ecran = photographierUnEcran(propre.image);

  it('la photo est bien celle qu’on décrit : bruitée, et pleine d’autre chose', () => {
    // Deux fois plus grande que le plan, et couverte de franges : sans
    // recadrage ni débruitage, le masque est un champ de neige.
    expect(ecran.l).toBeGreaterThan(propre.image.l * 1.9);
    expect(encre(binariser(ecran))).toBeGreaterThan(
      encre(binariser(propre.image)) * 2,
    );
  });

  it('rend quand même l’appartement : quatre mètres sur trois', () => {
    // L'OCR ne tourne pas ici : l'échelle vient donc des portes, et c'est
    // le cas le plus défavorable — celui du patron.
    const plan = lirePlanPapier({ image: ecran, textes: [] });
    expect(plan.vu.murs.length).toBeGreaterThanOrEqual(4);
    const murs = (plan.resultat.surfaces ?? []).filter((s) => s.type === 'wall');
    /*
      LES DEUX BOUTS SE TIRENT DE LA MATRICE, PAS DE LA SEULE LONGUEUR.

      Un `SurfaceData` porte son centre et sa DIRECTION (colonnes 0 et 2) ;
      étaler la longueur sur l'axe des x, comme on l'avait d'abord écrit,
      donne à un mur vertical une emprise horizontale qu'il n'a pas — et le
      banc annonçait neuf mètres pour un logement de quatre.
    */
    const bouts = murs.flatMap((m) => {
      const t = m.transform!;
      const demi = m.length / 2;
      return [
        { x: t[12] - t[0] * demi, z: t[14] - t[2] * demi },
        { x: t[12] + t[0] * demi, z: t[14] + t[2] * demi },
      ];
    });
    const xs = bouts.map((p) => p.x);
    const zs = bouts.map((p) => p.z);
    const grand = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...zs) - Math.min(...zs),
    );
    // Quatre mètres, à quinze pour cent près : l'échelle vient des portes.
    expect(grand).toBeGreaterThan(3.4);
    expect(grand).toBeLessThan(4.6);
  });

  it('conseille le fichier d’origine plutôt que la photo de l’écran', () => {
    const plan = lirePlanPapier({ image: ecran, textes: [] });
    // On sait atténuer les franges, pas les faire disparaître — et celui
    // qui photographie son écran a le fichier sous la main.
    expect(plan.avertissements.join(' ')).toMatch(/capture d’écran|fichier d’origine/);
  });

  it('recadre sur le dessin, en laissant dehors l’interface', () => {
    const plan = lirePlanPapier({ image: ecran, textes: [] });
    const zone = plan.vu.zone;
    expect(zone).not.toBeNull();
    // Les onglets occupent les 34 premiers pixels de la fenêtre, la barre
    // des tâches les 26 derniers de la photo : ni l'un ni l'autre ne doit
    // se retrouver dans la zone retenue.
    expect(zone!.y).toBeGreaterThan(40);
    expect(zone!.y + zone!.h).toBeLessThan(ecran.h - 26);
    // Et la zone tient de près le plan, à la marge de cotation près.
    expect(zone!.l).toBeLessThan(propre.image.l * 1.25);
    expect(zone!.h).toBeLessThan(propre.image.h * 1.25);
  });
});
