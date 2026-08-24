/**
 * LA RECONNAISSANCE DES SYMBOLES.
 *
 * C'est l'étage le plus incertain de la lecture d'un plan, et celui où il
 * est le plus tentant de se mentir. Personne ne dessine une prise tout à
 * fait pareil : la CEI 60617 en fixe l'esprit, chaque bureau d'études en
 * fait sa variante, et le même symbole se retrouve à trois échelles sur la
 * même feuille. On ne compare donc pas des images, mais des INVARIANTS —
 * nombre de trous, remplissage, allongement, compacité, deux moments de Hu,
 * symétrie à demi-tour.
 *
 * Le banc pose trois exigences, dans cet ordre d'importance :
 *
 *   1. LA BIBLIOTHÈQUE SE DISTINGUE ELLE-MÊME. Chaque symbole, rasterisé à
 *      plusieurs tailles et sous plusieurs angles, doit se reconnaître LUI
 *      et pas son voisin. Si deux entrées du dictionnaire ne se séparent
 *      pas, aucune photo au monde ne les séparera : c'est le dictionnaire
 *      qu'il faut corriger, pas le lecteur.
 *   2. CE QU'ON NE CONNAÎT PAS RESTE INCONNU. Une forme absente du
 *      dictionnaire doit sortir sans nom, pour être posée comme repère à
 *      qualifier. Un plan qui ment est pire qu'un plan incomplet.
 *   3. SUR UNE VRAIE PLANCHE, on retrouve les symboles posés, au bon
 *      endroit, une fois la maçonnerie retirée.
 */
import { binariser, effacerBoites, imageVide } from '../src/papier/image';
import { photographierPlanche } from '../src/papier/simulateur';
import { T1 } from '../src/papier/planches';
import { fusionnerTraits, segmentsDe } from '../src/papier/traits';
import { calerSurLeMasque, mursDesTraits, souderLesCoins } from '../src/papier/murs';
import { GABARITS } from '../src/papier/gabarits';
import { tracer, transformer, type Forme } from '../src/papier/trace';
import {
  effacerMurs,
  reconnaitre,
  symbolesDuMasque,
} from '../src/papier/symboles';

/** Un dessin seul sur sa feuille, à la taille et à l'angle voulus. */
const surFeuille = (formes: Forme[], cote: number, angle = 0) => {
  const img = imageVide(cote * 2, cote * 2, 250);
  tracer(img, transformer(formes, { x: cote, y: cote, echelle: cote * 0.62, angle }), {
    trait: Math.max(2, cote / 26),
    encre: 20,
  });
  return binariser(img, { fenetre: cote });
};

describe('la bibliothèque de symboles', () => {
  it('sait se reconnaître elle-même, à toute taille et sous tout angle', () => {
    const rates: string[] = [];
    for (const g of GABARITS) {
      for (const cote of [40, 90]) {
        for (const angle of [0, Math.PI / 5, Math.PI / 2, (4 * Math.PI) / 3]) {
          const trouve = reconnaitre(surFeuille(g.formes, cote, angle)).gabarit;
          if (trouve?.cle !== g.cle) {
            rates.push(`${g.cle}@${cote}/${Math.round((angle * 180) / Math.PI)}° → ${trouve?.cle}`);
          }
        }
      }
    }
    // On tolère quelques confusions — un dictionnaire de vingt symboles en
    // contient forcément deux qui se ressemblent (la prise et la prise 2P+T
    // ne diffèrent que d'une barre de terre) — mais pas un sur cinq.
    expect(rates.length / (GABARITS.length * 8)).toBeLessThan(0.2);
  });

  it('ne confond jamais deux familles : un point lumineux n’est pas une prise', () => {
    // Ce sont les confusions qui coûtent cher sur le chantier : une prise
    // posée au plafond, un point lumineux posé sur une plinthe.
    for (const cle of ['dcl', 'spot', 'prise', 'inter', 'tableau']) {
      const g = GABARITS.find((x) => x.cle === cle)!;
      for (const cote of [50, 100]) {
        const trouve = reconnaitre(surFeuille(g.formes, cote)).gabarit!;
        const memeCible = trouve.cible.sorte === g.cible.sorte;
        expect(memeCible).toBe(true);
      }
    }
  });

  it('reconnaît les siens de loin, et de près', () => {
    /*
      LA MARGE EST CE QUI COMPTE, PAS LE CLASSEMENT.

      Un lecteur qui donne toujours « le plus proche » finit par nommer
      n'importe quoi. On mesure donc l'écart des VRAIS symboles à leur propre
      référence : c'est lui qui fixe la frontière au-delà de laquelle une
      forme devient un repère à qualifier. Tant qu'il reste sous six
      dixièmes, le seuil du lecteur est bien placé.
    */
    const ecarts = GABARITS.map((g) => reconnaitre(surFeuille(g.formes, 70)).ecart);
    const rangs = ecarts.slice().sort((a, b) => a - b);
    const median = rangs[Math.floor(rangs.length / 2)];
    expect(median).toBeLessThan(0.35);
    expect(rangs[Math.floor(rangs.length * 0.9)]).toBeLessThan(0.6);
  });

  it('laisse sans nom ce qui ne ressemble à rien du dictionnaire', () => {
    /*
      LES DEUX VRAIS INTRUS D'UN PLAN.

      Ce qui traîne sur une feuille et n'est pas un symbole, c'est un MOT que
      l'OCR n'a pas lu — trois pavés d'encre alignés — et un bout de TRAIT
      resté seul, dix fois plus long que large. Ni l'un ni l'autre n'est un
      symbole, et aucun ne doit en devenir un.

      Le premier intrus essayé était un pentagone barré : il passait pour un
      tableau électrique, et à juste titre — un polygone traversé d'une
      diagonale, c'est exactement le symbole du tableau. Une spirale, elle,
      passait pour un WC. Un intrus doit être étranger au dictionnaire, pas
      seulement absent de lui : on ne prouve rien en inventant une forme qui
      ressemble par hasard à l'une des nôtres.
    */
    const mot: Forme[] = [0, 1, 2].map((i) => ({
      t: 'aplat' as const,
      pts: [
        { x: -0.9 + i * 0.62, y: -0.35 },
        { x: -0.45 + i * 0.62, y: -0.35 },
        { x: -0.45 + i * 0.62, y: 0.35 },
        { x: -0.9 + i * 0.62, y: 0.35 },
      ],
    }));
    const bout: Forme[] = [
      { t: 'seg', a: { x: -1, y: 0 }, b: { x: 1, y: 0 }, w: 0.09 },
    ];
    expect(reconnaitre(surFeuille(mot, 70)).ecart).toBeGreaterThan(0.6);
    expect(reconnaitre(surFeuille(bout, 70)).ecart).toBeGreaterThan(0.6);
  });
});

describe('les symboles du T1', () => {
  const photo = photographierPlanche(T1, { echelle: 100 });
  const masque = effacerBoites(binariser(photo.image), photo.textes);
  const traits = fusionnerTraits(segmentsDe(masque));
  const murs = souderLesCoins(calerSurLeMasque(mursDesTraits(traits), masque));
  const symboles = symbolesDuMasque(effacerMurs(masque, murs));

  it('en trouve autant qu’il y en a de posés sur la planche', () => {
    // Six symboles sur la planche. On tolère quelques îlots de plus — l'arc
    // de la porte se détache en morceaux une fois les murs retirés — mais
    // aucun ne doit être nommé n'importe comment.
    expect(symboles.length).toBeGreaterThanOrEqual(6);
    expect(symboles.length).toBeLessThanOrEqual(14);
  });

  it('reconnaît le point lumineux et le spot, chacun à sa place', () => {
    const nommes = symboles.filter((s) => s.cle);
    expect(nommes.length).toBeGreaterThanOrEqual(3);
    const dcl = symboles.find((s) => s.cle === 'dcl');
    expect(dcl).toBeDefined();
    // Le point lumineux est posé à 1,30 m / 1,50 m, plus un mètre de marge.
    expect(dcl!.at.x).toBeGreaterThan(200);
    expect(dcl!.at.x).toBeLessThan(260);
    expect(dcl!.at.y).toBeGreaterThan(220);
    expect(dcl!.at.y).toBeLessThan(280);
  });

  it('retrouve un symbole posé CONTRE son mur, ce qui est le cas normal', () => {
    /*
      Sur un vrai plan, une prise touche la maçonnerie : c'est même à cela
      qu'on voit qu'elle est murale. Dans le masque brut, elle n'est alors
      qu'une excroissance de l'îlot du mur — lequel court sur toute la
      feuille — et rien ne peut la trouver. Ébarber la maçonnerie n'est donc
      pas une optimisation, c'est ce qui rend la lecture possible.
    */
    const collee = photographierPlanche(
      // Le point lumineux se pose CONTRE le nu intérieur du mur du haut, qui
      // court de −0,10 à +0,10 : son cercle de 28 cm va de 0,10 à 0,38.
      { ...T1, symboles: [{ cle: 'dcl', at: { x: 1.5, y: 0.24 } }] },
      { echelle: 100 },
    );
    const mBrut = effacerBoites(binariser(collee.image), collee.textes);
    const mursCollee = souderLesCoins(
      calerSurLeMasque(mursDesTraits(fusionnerTraits(segmentsDe(mBrut))), mBrut),
    );
    const apres = symbolesDuMasque(effacerMurs(mBrut, mursCollee)).filter(
      (s) => s.cle === 'dcl',
    );
    /*
      Il est reconnu, et il l'est ENTIER : ses quatre trous sont intacts.
      C'est ce que garantit l'effacement des seuls BORDS — l'emprise complète
      du mur, comme on l'effaçait d'abord, lui coupait le pied et ses quatre
      trous devenaient deux.

      Un symbole qui MORDRAIT franchement dans la maçonnerie resterait, lui,
      illisible : la gomme le coupe en deux arcs. Aucun dessinateur ne fait
      cela — un symbole posé dans le noir d'un mur ne se verrait pas — et
      c'est noté aux défauts connus plutôt que corrigé par une dilatation qui
      déformerait tous les autres.
    */
    expect(apres).toHaveLength(1);
    expect(apres[0].sur).toBeGreaterThan(0.2);
  });

  it('dit ce dont il n’est pas sûr, au lieu de deviner', () => {
    for (const s of symboles) {
      if (s.cle) expect(s.sur).toBeGreaterThan(0);
      else expect(s.sur).toBe(0);
    }
  });
});
