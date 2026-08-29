/**
 * L'ANIMATION DE LA VITRINE — et son garde-fou.
 *
 * Les images de l'accueil sont CUITES AU BUILD (`npm run showcase`) puis
 * embarquées : le téléphone ne fait que les feuilleter. C'est ce qui garantit
 * qu'elles ne rament pas et qu'elles sont identiques d'un appareil à l'autre.
 *
 * Le revers, c'est qu'une image cuite ne se corrige pas toute seule : si la
 * géométrie change et que personne ne relance l'outil, l'accueil montre un
 * logement qui n'a plus rien à voir avec ce que produit l'application. Ce
 * banc tient donc les invariants du scénario — ce qu'on doit voir, et quand.
 *
 * Il sert aussi d'outil : avec `UPDATE_SHOWCASE=1`, il écrit les images.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES } from '../src/geometry/electrical';
import {
  avancement,
  camera,
  cascade,
  etatDeLImage,
  frameSvg,
  titreSvg,
  imageSvg,
  pose,
  progression,
  titreDeLImage,
  titresDeLImage,
  IPS,
  TITRES,
  PAPIER_PALETTE,
  PLAN,
  SHOWCASE_FRAMES,
  SHOWCASE_PALETTE,
} from '../src/export/showcaseFrames';

/** La taille des images : celle de l'écran du téléphone, en double densité. */
const W = 264;
const H = 536;

describe('le scénario de la vitrine', () => {
  it('commence à plat, finit en volume, et revient', () => {
    expect(avancement(0)).toBe(0);
    // Le palier du plan tient assez longtemps pour qu'on lise les cotes.
    expect(avancement(4)).toBe(0);
    // Quelque part au milieu, le plan est levé.
    const sommet = Math.max(
      ...Array.from({ length: SHOWCASE_FRAMES }, (_, i) => avancement(i)),
    );
    expect(sommet).toBe(1);
    // Et le cycle boucle : la dernière image rejoint la première.
    expect(avancement(SHOWCASE_FRAMES)).toBe(avancement(0));
    expect(avancement(SHOWCASE_FRAMES - 1)).toBeLessThan(0.35);
  });

  it('monte et redescend sans à-coup', () => {
    const suite = Array.from({ length: SHOWCASE_FRAMES }, (_, i) =>
      avancement(i),
    );
    for (let i = 1; i < suite.length; i++) {
      /*
        LA VITESSE DE POINTE EST BORNÉE, pas seulement le saut.

        À quinze images par seconde, c'est le pas le plus grand qui se voit :
        l'ancien lissage quadratique culminait à 0,125 d'avancement par image
        — cinq degrés et demi d'inclinaison d'un coup — et c'est là que la
        levée paraissait par paliers. Le lissage sinusoïdal, sur une levée
        plus longue, reste sous 0,11 : c'est mesuré ici, pas promis.
      */
      expect(Math.abs(suite[i] - suite[i - 1])).toBeLessThan(0.11);
    }
  });
});

/*
 * LA CAMÉRA VIT PENDANT LES PALIERS.
 *
 * Un palier où tout s'arrête se lit comme une image figée — trois secondes de
 * diaporama. La visite guidée l'a déjà appris : c'est le zoom qui avance
 * PENDANT l'arrêt qui donne la vie. Ici pareil : sur le palier du volume, la
 * caméra dérive lentement en azimut et se rapproche d'un souffle ; puis tout
 * revient se poser sur le plan, exactement là où le cycle recommence.
 */
describe('la caméra de la vitrine', () => {
  const cycle = Array.from({ length: SHOWCASE_FRAMES }, (_, i) => ({
    t: avancement(i),
    ...camera(i),
  }));

  it('part du plan droit et y revient', () => {
    expect(cycle[0].theta).toBe(0);
    expect(cycle[0].zoom).toBe(1);
    const dernier = cycle[SHOWCASE_FRAMES - 1];
    expect(Math.abs(dernier.theta)).toBeLessThan(1);
    expect(Math.abs(dernier.zoom - 1)).toBeLessThan(0.01);
  });

  it('dérive pendant le palier du volume au lieu de se figer', () => {
    const palier = cycle.filter((c) => c.t === 1);
    // Le palier tient : on a le temps de regarder les meubles.
    expect(palier.length).toBeGreaterThanOrEqual(8);
    const debut = palier[0];
    const fin = palier[palier.length - 1];
    expect(Math.abs(fin.theta - debut.theta)).toBeGreaterThan(3);
    expect(fin.zoom).toBeGreaterThan(debut.zoom + 0.02);
  });

  it('ne saute jamais, bouclage compris', () => {
    for (let i = 1; i <= SHOWCASE_FRAMES; i++) {
      const a = cycle[i - 1];
      const b = i === SHOWCASE_FRAMES ? cycle[0] : cycle[i];
      expect(Math.abs(b.theta - a.theta)).toBeLessThan(2.2);
      expect(Math.abs(b.zoom - a.zoom)).toBeLessThan(0.012);
    }
  });
});

/*
 * LE MOBILIER ARRIVE EN VAGUE, du nord au sud.
 *
 * Le fondu global faisait apparaître tout le logement d'un bloc : correct,
 * mais mécanique. La vague suit le sens de la lecture — la chambre en haut se
 * meuble d'abord, le séjour en bas la rattrape — et chaque meuble sort du sol
 * en fondu, sur sa propre fenêtre. C'est discret : les fenêtres se
 * chevauchent largement, on voit une maison qui se remplit, pas des meubles
 * qui poppent.
 */
describe('la vague du mobilier', () => {
  const indexDe = (nom: string) =>
    PLAN.meubles.findIndex(([id]) => id === nom);

  it('la chambre se meuble avant le séjour', () => {
    expect(cascade(0.35, indexDe('lit'))).toBeGreaterThan(0.6);
    expect(cascade(0.35, indexDe('tv'))).toBeLessThan(0.1);
  });

  it('chaque meuble part de rien, monte sans redescendre, et est là avant le palier', () => {
    for (let k = 0; k < PLAN.meubles.length; k++) {
      expect(cascade(0, k)).toBe(0);
      expect(cascade(0.75, k)).toBe(1);
      let precedent = 0;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const v = cascade(t, k);
        expect(v).toBeGreaterThanOrEqual(precedent - 1e-9);
        precedent = v;
      }
    }
  });

  it("s'observe sur l'image : des opacités étagées à mi-levée", () => {
    const s = frameSvg(0.3, 264, 536);
    /*
      LE BLEU SE LIT DANS LA PALETTE, il ne se recopie plus.

      Ce banc cherchait « #2F6BFF » en toutes lettres. Le jour où la vitrine
      est passée en nuit, le bleu du mobilier a changé d'un ton — et le banc
      ne trouvait plus rien, donc plus aucun fondu, alors que le fondu était
      intact. Une épreuve qui recopie une couleur devient fausse au premier
      coup de peinture.
    */
    const etages = new Set(
      [
        ...s.matchAll(
          new RegExp(
            `fill-opacity="([\\d.]+)" stroke="${SHOWCASE_PALETTE.meubleTrait}"`,
            'g',
          ),
        ),
      ].map((m) => m[1]),
    );
    // Au moins trois niveaux distincts : un fondu global n'en donne qu'un.
    expect(etages.size).toBeGreaterThanOrEqual(3);
  });
});

describe('le cheminement, en sept temps', () => {
  /*
    RELEVÉ DU PATRON : « refais à l'intérieur de l'écran une animation
    moderne, rapide et compréhensible : plan 2D, les murs montent et forment
    un plan 3D, des interrupteurs et prises pop à des endroits, on affiche les
    cotes rapidement, avec des transitions rapides mais en fondu toujours, et
    un aperçu d'un scroll du PDF final des plans, etc. En 5-8 secondes, on
    doit comprendre le cheminement de l'app. »

    La vitrine d'avant jouait UN geste — la bascule 2D/3D, en boucle. C'était
    juste et court, et ça ne disait pas ce que l'application produit.
  */
  const IMAGES_PAR_SECONDE = IPS;
  const etats = Array.from({ length: SHOWCASE_FRAMES }, (_, i) =>
    etatDeLImage(i),
  );

  it('dure entre cinq et huit secondes', () => {
    const secondes = SHOWCASE_FRAMES / IMAGES_PAR_SECONDE;
    expect(secondes).toBeGreaterThanOrEqual(5);
    expect(secondes).toBeLessThanOrEqual(8);
  });

  it('les quatre temps se suivent, et jamais dans le désordre', () => {
    /*
      L'ORDRE EST LE SUJET : un plan qu'on lève, des appareils qu'on pose,
      des cotes qu'on lit, un dossier qu'on remet. Chaque chose commence
      APRÈS la précédente — sinon on ne raconte plus un cheminement, on
      empile des effets.
    */
    const premier = (lire: (e: (typeof etats)[number]) => number) =>
      etats.findIndex((e) => lire(e) > 0.02);
    const leve = etats.findIndex((e) => e.t > 0.02);
    const posee = premier((e) => e.elec);
    const cote = premier((e) => e.cotes);
    const dossier = premier((e) => e.page);
    expect(leve).toBeGreaterThan(0);
    expect(posee).toBeGreaterThan(leve);
    expect(cote).toBeGreaterThan(posee);
    expect(dossier).toBeGreaterThan(cote);
  });

  it('et le plan tient assez longtemps pour se lire avant de monter', () => {
    // Le contrôle en sens inverse du dessus : un plan qui se lève à la
    // deuxième image n'a jamais été montré.
    const debut = etats.findIndex((e) => e.t > 0.02) / IMAGES_PAR_SECONDE;
    expect(debut).toBeGreaterThan(0.5);
  });

  it('les appareils se posent l’un après l’autre', () => {
    /*
      Six appareils qui paraissent d'un bloc, c'est un calque qu'on allume ;
      six qui se posent l'un après l'autre, c'est quelqu'un qui équipe un
      logement.
    */
    const avances = PLAN.elec.map((_, k) => pose(0.5, k));
    expect(avances[0]).toBeGreaterThan(avances[PLAN.elec.length - 1]);
    // Et tous finissent posés : aucun ne reste en route.
    for (const [k] of PLAN.elec.entries()) expect(pose(1, k)).toBeCloseTo(1, 2);
  });

  it('la première image ne porte AUCUN appareil, la pose finie les porte tous', () => {
    const sigles = (dessin: string) =>
      PLAN.elec.filter((f) =>
        dessin.includes(`>${FIXTURES[f.kind].short}</text>`),
      ).length;
    expect(sigles(imageSvg(0, W, H))).toBe(0);
    const finDePose = etats.findIndex((e) => e.elec > 0.99);
    expect(finDePose).toBeGreaterThan(0);
    expect(sigles(imageSvg(finDePose, W, H))).toBe(PLAN.elec.length);
  });

  it('les cotes de pose paraissent, en centimètres', () => {
    const auxCotes = etats.findIndex((e) => e.cotes > 0.9);
    expect(auxCotes).toBeGreaterThan(0);
    /*
      LA COTE S'ÉCRIT EN TOUTES LETTRES, ET UNE SEULE.

      Premier jet : un nombre à côté de chacun des six filets, en corps sept
      et demi. Mesuré à la taille réelle — l'écran fait cent dix-huit points
      de large, l'image deux cent soixante-quatre —, ces nombres tombaient
      sous quatre points : six taches grises, et un temps fort qui ne montrait
      rien. Les filets restent, une seule cote s'écrit, en grand.
    */
    expect(imageSvg(auxCotes, W, H)).toContain('>110 cm</text>');
    // Et le contrôle en sens inverse : rien de tel avant qu'elles arrivent.
    expect(imageSvg(0, W, H)).not.toContain('>110 cm</text>');
  });

  it('la feuille MONTE, elle ne paraît pas en fondu', () => {
    /*
      RELEVÉ DU PATRON : « on dirait un truc bas de gamme. Je veux quelque
      chose de dynamique. »

      LE PREMIER DESSIN CROISAIT DEUX OPACITÉS : la maquette s'éteignait
      pendant qu'une page blanche s'allumait. À mi-course, on ne lisait NI
      l'une NI l'autre — une image double, qui est exactement ce qu'on
      reproche à un fondu enchaîné entre deux images pleines.

      La feuille monte maintenant du bas, et la maquette RECULE derrière au
      lieu de s'éteindre. À mi-course il y a un mouvement à suivre, et l'on
      comprend qu'un document se pose sur une scène.
    */
    const jeune = etats.findIndex((e) => e.page > 0.3 && e.page < 0.75);
    expect(jeune).toBeGreaterThan(0);
    const dessin = imageSvg(jeune, W, H);
    // La feuille est TRANSLATÉE : c'est le mouvement, et il se lit dans le
    // dessin. Un fondu n'aurait qu'une opacité à montrer.
    const montees = [...dessin.matchAll(/translate\(0 ([\d.]+)\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(montees.some((y) => y > 40)).toBe(true);
  });

  it('et la maquette RECULE derrière au lieu de s’éteindre', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il porte la même idée : si la maquette
      disparaissait, on aurait remplacé une image par une autre. Elle reste
      dessinée, plus petite et plus sombre — donc le dossier se pose SUR le
      relevé, ce qui est le propos.
    */
    const pleinePage = etats.findIndex((e) => e.page > 0.99);
    const dessin = imageSvg(pleinePage, W, H);
    const opacites = [...dessin.matchAll(/<g opacity="([\d.]+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(opacites.some((o) => o > 0.1 && o < 0.35)).toBe(true);
    /*
      L'ÉCHELLE SE LIT, ELLE NE SE COMPARE PAS À UNE CHAÎNE. La montée de la
      feuille se fait au RESSORT : elle dépasse sa cible de quelques pour
      cent avant d'y revenir — c'est ce dépassement qui la fait lire comme un
      document qu'on pose, et non comme un calque qu'on allume. Le recul, qui
      est asservi à la même valeur, dépasse donc lui aussi.
    */
    const echelles = [...dessin.matchAll(/scale\(([\d.]+)\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(echelles.some((k) => k > 0.85 && k < 0.95)).toBe(true);
  });

  it('le dossier passe devant, et il défile', () => {
    const premiere = etats.findIndex((e) => e.page > 0.99);
    const derniere =
      etats.length - 1 - etats.slice().reverse().findIndex((e) => e.page > 0.99);
    expect(premiere).toBeGreaterThan(0);
    const tete = imageSvg(premiere, W, H);
    expect(tete).toContain('FOURNITURES');
    // Il défile : la même page, posée à deux hauteurs différentes.
    expect(tete).not.toBe(imageSvg(derniere, W, H));
  });

  it('le cycle se referme sur le plan', () => {
    const dernier = etatDeLImage(SHOWCASE_FRAMES - 1);
    expect(dernier.t).toBe(0);
    expect(dernier.page).toBeLessThan(0.35);
    expect(etatDeLImage(SHOWCASE_FRAMES)).toEqual(etatDeLImage(0));
  });

  it('et aucune image n’est vide', () => {
    /*
      LE GARDE-FOU DE LA BASCULE. Il lisait les deux opacités du fondu ; il
      lit maintenant le DESSIN, ce qui est plus étroit et plus vrai : quoi
      qu'il arrive, chaque image du cycle porte de la matière — des faces,
      un mot. Une transition mal réglée laisserait un écran noir, et c'est
      exactement ce qu'on ne verra jamais passer à l'œil sur cinq secondes.
    */
    for (let i = 0; i < SHOWCASE_FRAMES; i++) {
      const d = imageSvg(i, W, H);
      const formes = (d.match(/<(polygon|rect|line|text|circle)/g) ?? []).length;
      expect(`${i} : ${formes > 12}`).toBe(`${i} : true`);
    }
  });
});

describe('les gros titres, et le rouleau', () => {
  /*
    RELEVÉ DU PATRON : « je veux quelque chose de dynamique, rapide, fluide,
    JS style. Un vrai art style. »

    LE BANDEAU BLEU EST MORT ICI. La vitrine posait un rectangle plein en pied
    d'écran avec le mot centré dedans : c'est le dessin d'une barre d'état,
    pas d'une affiche, et c'était la première chose qui faisait bas de gamme.
    Le mot est maintenant posé À MÊME l'image, aligné à gauche, avec son
    numéro de temps et son filet d'accent.

    ET IL BASCULE PAR UN ROULEAU. Chaque mot entrait au début de son temps et
    sortait à la fin : entre les deux, la fente restait vide une image ou
    deux, et l'on voyait passer un mot coupé en tranche. Le sortant monte
    maintenant PENDANT que l'entrant arrive, dans la même fente.
  */
  const IMAGES_PAR_SECONDE = IPS;

  it('un mot par temps, et jamais deux fois le même', () => {
    const mots = TITRES.map((t) => t.mot);
    expect(mots).toHaveLength(5);
    expect(new Set(mots).size).toBe(mots.length);
  });

  it('et chaque image en porte un', () => {
    for (let i = 0; i < SHOWCASE_FRAMES; i++) {
      expect(`${i} : ${titreDeLImage(i).mot.length > 0}`).toBe(`${i} : true`);
    }
  });

  it('ils sont COURTS, donc ils peuvent être gros', () => {
    /*
      Dix signes au plus : c'est ce qui permet de les écrire en corps 34 sur un
      écran de deux cent soixante-quatre points. Un mot de quinze signes, et
      l'on retombe sur du texte — la vitrine cesse d'annoncer, elle explique.
    */
    for (const t of TITRES) expect(t.mot.length).toBeLessThanOrEqual(10);
  });

  it('et ils s’écrivent VRAIMENT gros sur l’image', () => {
    // Le contrôle qui compte : un titre court ne sert à rien s'il est écrit
    // en corps 9 comme les sigles des appareils.
    const corps = [...titreSvg(20, W, H).matchAll(/font-size="([\d.]+)"/g)].map(
      (m) => Number(m[1]),
    );
    expect(Math.max(...corps)).toBeGreaterThanOrEqual(30);
  });

  it('LE BANDEAU PLEIN A DISPARU', () => {
    /*
      C'EST LE BANC DU RELEVÉ, et il se mesure. L'ancien dessin remplissait
      toute la largeur de l'écran sur cinquante-huit points de haut, en bleu
      plein. Rien de tel ne doit revenir : le mot se lit sur la nuit, sans
      aplat pour le porter.

      On cherche un rectangle pleine largeur et HAUT — le filet d'avancement
      fait aussi toute la largeur, mais un point et demi de haut, et c'est
      justement la différence entre un filet et une barre d'interface.
    */
    const gros = [...titreSvg(20, W, H).matchAll(/<rect[^>]*>/g)].filter((m) => {
      const l = Number((m[0].match(/width="([\d.]+)"/) ?? [])[1] ?? 0);
      const h = Number((m[0].match(/height="([\d.]+)"/) ?? [])[1] ?? 0);
      // ON NE COMPTE QUE CE QUI EST PEINT : le rectangle de la fente fait
      // toute la largeur lui aussi, et il ne met pas une goutte d'encre —
      // c'est un masque.
      return m[0].includes('fill="') && l >= W && h > 6;
    });
    expect(gros).toHaveLength(0);
  });

  it('le mot entre par une FENTE, il ne paraît pas', () => {
    /*
      LE PEPS EST LÀ, et pas ailleurs : le mot monte de trente-quatre points
      — la hauteur de sa propre boîte — pendant qu'un masque le découvre.
      C'est ce masque qui fait la différence entre un mot qui ENTRE et un mot
      qui s'allume, et il se lit dans le dessin.
    */
    expect(titreSvg(20, W, H)).toContain('<clipPath');
    /*
      ON INTERROGE LE MOT QUI ARRIVE, ET NON LE MOT DOMINANT. Pendant la
      bascule, c'est encore le SORTANT qu'on lit le mieux — il est presque
      entier, l'autre commence à peine. Demander « où en est le titre de
      l'image » ne dit donc rien de l'entrée : il faut nommer celui qu'on
      suit.
    */
    const debut = TITRES[1].jusqua;
    const arrivant = TITRES[2].mot;
    const place = (i: number) =>
      titresDeLImage(i).find((v) => v.mot === arrivant)!;
    // Juste avant d'être posé, il est encore dessous ; posé, il est à zéro.
    expect(place(debut - 1).dy).toBeGreaterThan(4);
    expect(Math.abs(place(debut + 4).dy)).toBeLessThan(0.6);
  });

  it('et à la bascule, DEUX mots sont dans la fente', () => {
    /*
      LE ROULEAU. C'est ce qui remplace la fente vide : à la coupure, le mot
      qui s'en va et celui qui arrive sont là ensemble, l'un au-dessus de
      l'autre, et l'œil suit un mouvement continu.
    */
    const coupure = TITRES[1].jusqua;
    const vus = titresDeLImage(coupure);
    expect(vus.map((v) => v.mot).sort()).toEqual(
      [TITRES[1].mot, TITRES[2].mot].sort(),
    );
    // Et l'un monte pendant que l'autre descend : leurs places sont de part
    // et d'autre de la ligne de lecture.
    const places = vus.map((v) => v.dy).sort((a, b) => a - b);
    expect(places[0]).toBeLessThan(0);
    expect(places[places.length - 1]).toBeGreaterThan(0);
  });

  it('la boucle du titre se referme, elle aussi', () => {
    /*
      À L'IMAGE ZÉRO, LE DERNIER MOT DOIT ENCORE ÊTRE LÀ. Sans ça, le tour de
      manège recommence sur une fente vide : le seul endroit du cycle où la
      vitrine ne dit rien, et c'est celui qu'on regarde le plus, puisque
      c'est là qu'on arrive.
    */
    const mots = titresDeLImage(0).map((v) => v.mot);
    expect(mots).toContain(TITRES[TITRES.length - 1].mot);
    expect(mots).toContain(TITRES[0].mot);
  });

  it('mais il ne clignote pas : une fois entré, il reste', () => {
    // Le contrôle en sens inverse : une entrée rejouée à chaque image ferait
    // battre le mot au lieu de l'annoncer.
    for (let i = TITRES[0].jusqua + 4; i < TITRES[1].jusqua - 4; i++) {
      expect(`${i} : ${titreDeLImage(i).opacite}`).toBe(`${i} : 1`);
    }
  });

  it('et le titre passe PAR-DESSUS le dossier', () => {
    /*
      La couche qui NARRE ne participe à aucune transition : le mot ne doit
      pas pâlir pendant qu'une page monte dessous, sinon la seule chose qui
      explique l'image devient illisible juste au moment où l'image change.
    */
    const etats = Array.from({ length: SHOWCASE_FRAMES }, (_, i) =>
      etatDeLImage(i),
    );
    const pleinePage = etats.findIndex((e) => e.page > 0.99);
    expect(imageSvg(pleinePage, W, H)).toContain(
      `>${titreDeLImage(pleinePage).mot}</text>`,
    );
  });

  it('la barre d’avancement part de zéro et finit plein', () => {
    expect(progression(0)).toBe(0);
    expect(progression(SHOWCASE_FRAMES - 1)).toBe(1);
    // Et elle ne recule jamais : une barre qui redescend dit qu'on a raté
    // quelque chose.
    for (let i = 1; i < SHOWCASE_FRAMES; i++) {
      expect(`${i} : ${progression(i) >= progression(i - 1)}`).toBe(
        `${i} : true`,
      );
    }
  });

  it('cinq secondes, et vingt-quatre images par seconde', () => {
    /*
      « FLUIDE » NE S'OBTIENT PAS AUTREMENT. On peut lisser une trajectoire
      autant qu'on veut : à quinze images par seconde, l'œil sépare encore
      les poses d'un mouvement rapide. Vingt-quatre est la cadence du cinéma,
      et le premier palier où un mouvement franc cesse de se décomposer.
    */
    expect(IPS).toBeGreaterThanOrEqual(24);
    expect(SHOWCASE_FRAMES / IMAGES_PAR_SECONDE).toBeLessThanOrEqual(6);
  });

});

describe('la nuit électrique — l’art direction de la vitrine', () => {
  /*
    RELEVÉ DU PATRON, EN LA REGARDANT TOURNER : « l'animation de l'iPhone et
    de son écran ne me convainc pas, on dirait un truc bas de gamme. Je veux
    quelque chose de dynamique, rapide, fluide, JS style. Un vrai art style. »

    IL A RAISON, ET LE DÉFAUT SE NOMME. La vitrine était un DESSIN TECHNIQUE
    JUSTE, pas une image : fond blanc, murs blancs, feuilles blanches, un
    bandeau bleu plein en bas. Rien de faux — et rien de choisi. Une capture
    d'écran de logiciel de CAO, exactement ce qu'on ne veut pas montrer pour
    vendre une application.

    Ce banc tient les quatre décisions qui font l'image, parce qu'une couleur
    se change d'un caractère et qu'aucune épreuve de géométrie ne s'en
    apercevrait.
  */
  const dessin = (i: number) => imageSvg(i, W, H);

  it('le fond est NOIR, et le poché du plan est blanc', () => {
    /*
      C'est le seul geste qui transforme un plan de CAO en objet : sur le
      noir, le bleu et le cyan ÉMETTENT au lieu de colorier. Et la convention
      du plan s'inverse avec lui — sur papier la coupe des murs se dessine
      pleine et noire, sur la nuit elle devient la seule chose lumineuse de
      l'écran.
    */
    const lire = (h: string) =>
      [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
    const clarte = (h: string) => lire(h).reduce((a, b) => a + b, 0) / 3;
    expect(clarte(SHOWCASE_PALETTE.fond)).toBeLessThan(30);
    expect(clarte(SHOWCASE_PALETTE.poche)).toBeGreaterThan(200);
    // Et l'image le porte : la première du cycle peint son fond en sombre.
    expect(dessin(0)).toContain(`fill="${SHOWCASE_PALETTE.fond}"`);
  });

  it('mais le plan IMPRIMÉ reste noir sur blanc', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il vaut de l'argent : la nuit est un
      parti pris d'ÉCRAN. Un plan qu'on imprime et qu'on emporte sur un
      chantier se lit en noir sur blanc — un poché blanc sur fond noir vide
      une cartouche d'encre et ne se lit pas au soleil.
    */
    const lire = (h: string) =>
      [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
    const clarte = (h: string) => lire(h).reduce((a, b) => a + b, 0) / 3;
    expect(clarte(PAPIER_PALETTE.fond)).toBeGreaterThan(240);
    expect(clarte(PAPIER_PALETTE.poche)).toBeLessThan(40);
  });

  it('le sol porte une TRAME, et elle dépasse du logement', () => {
    /*
      Le logement cessait de flotter dans le vide le jour où il a été POSÉ
      sur quelque chose. La trame dit l'échelle sans écrire un chiffre — un
      carreau, un mètre — et c'est son DÉBORDEMENT qui fait la profondeur :
      une trame qui s'arrête au mur est un carrelage, pas un sol.
    */
    const traits = [...frameSvg(0, W, H).matchAll(/<line [^>]*stroke="([^"]+)"/g)]
      .filter((m) => m[1] === SHOWCASE_PALETTE.grille);
    expect(traits.length).toBeGreaterThan(10);
    // Elle déborde : des lignes passent hors du rectangle du logement.
    const xs = [...frameSvg(0, W, H).matchAll(/<line x1="([-\d.]+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(Math.min(...xs)).toBeLessThan(20);
    expect(Math.max(...xs)).toBeGreaterThan(W - 20);
  });

  it('et le plan de la FEUILLE n’en a pas', () => {
    // Le contrôle en sens inverse : une trame sur un document imprimé serait
    // un fond de page quadrillé, qui n'a rien à y faire.
    const surPapier = frameSvg(0, 120, 200, PAPIER_PALETTE, undefined, {
      grille: false,
    });
    expect(surPapier).not.toContain(`stroke="${PAPIER_PALETTE.grille}"`);
  });

  it('aucun dégradé n’est CUIT dans les images', () => {
    /*
      LE BANC DES 480 KO. La lueur et le vignettage sont les deux couches qui
      donnent sa profondeur à l'écran — et un dégradé lisse est le pire
      ennemi d'une palette réduite : chaque image doit tramer le passage d'un
      ton à l'autre sur toute sa surface, et le PNG ne compresse plus rien.
      Cent vingt images passaient de 820 ko à 1,3 Mo, pour un fond qui ne
      change JAMAIS d'une image à l'autre.

      Ils sont posés en direct dans l'écran du téléphone, en vectoriel. Le
      jour où l'on en recuit un ici, l'IPA reprend un demi-mégaoctet sans que
      personne ne s'en aperçoive : c'est ce que ce banc empêche.
    */
    for (const i of [0, 30, 60, 90]) {
      expect(`${i} : ${dessin(i).includes('Gradient')}`).toBe(`${i} : false`);
    }
  });

  it('aucun `id` ne se répète dans une image', () => {
    /*
      LE PIÈGE DU PLAN DANS LA FEUILLE. Le plan imprimé du dossier est le
      MÊME dessin que celui de la vitrine, rappelé à l'intérieur de l'image
      complète. Deux `<clipPath id="x">` dans un même document, et c'est le
      dernier qui gagne pour tout le monde : le masque du titre se mettrait à
      découper le plan de la feuille, ou l'inverse.

      C'est pour ça que `frameSvg` et `pageSvg` ne posent AUCUN `id` — la
      règle est écrite dans leur en-tête, et elle se vérifie ici.
    */
    for (const i of [0, 30, 60, 90]) {
      const ids = [...dessin(i).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      expect(`${i} : ${ids.length}`).toBe(`${i} : ${new Set(ids).size}`);
    }
  });

  it('l’ombrage GARDE la couleur des pans, il ne les grise pas', () => {
    /*
      LE DERNIER RESTE DE CARTON. `shadeFill` — l'ombrage de la vue 3D de
      l'application — éclaire les pans avec deux pôles : le côté à l'ombre
      tire vers un brun chaud, le côté éclairé vers le blanc. C'est juste SUR
      DU PAPIER BLANC, et longuement défendu.

      Sur du noir, il DÉTRUIT la couleur : un mur bleu nuit mélangé à 38 % de
      brun devient un gris de carton. On avait une belle nuit, et un logement
      en carton posé dessus.

      On mesure donc la SATURATION des pans : sur la nuit, aucune face pleine
      ne doit être un gris neutre. C'est la seule façon de tenir ce réglage —
      une couleur se change d'un caractère, et la géométrie n'en saurait rien.
    */
    const fonds = [...frameSvg(1, W, H).matchAll(/<polygon [^>]*fill="(#[0-9a-f]{6})"/g)]
      .map((m) => m[1])
      .filter((h, i, tous) => tous.indexOf(h) === i);
    expect(fonds.length).toBeGreaterThan(6);
    const neutres = fonds.filter((h) => {
      const [r, v, b] = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
      const max = Math.max(r, v, b);
      const min = Math.min(r, v, b);
      /*
        Un gris : moins de 8 % d'écart entre sa composante la plus forte et
        la plus faible. On ne juge que les tons MOYENS — le noir est gris par
        nature et c'est le fond ; un reflet qui approche le blanc l'est
        aussi, et c'est un reflet. Entre les deux, il y a les pans, et c'est
        eux qu'on regarde : le carton faisait 0x50 à 0xB6.
      */
      return max > 40 && max < 200 && (max - min) / max < 0.08;
    });
    expect(neutres).toEqual([]);
  });

  it('et les appareils ÉCLAIRENT au lieu de colorier', () => {
    /*
      Un sigle de neuf points posé sur du noir est un caractère perdu ; le
      même sur une lueur de sa couleur devient un POINT LUMINEUX qu'on repère
      avant de le lire. C'est le seul endroit de l'image où l'on dépense de la
      couleur, et c'est le sujet de l'application.
    */
    const posee = frameSvg(1, W, H, SHOWCASE_PALETTE, undefined, { elec: 1 });
    const lueurs = [...posee.matchAll(/<circle [^>]*fill="(#[0-9A-Fa-f]{6})"/g)];
    expect(lueurs.length).toBeGreaterThanOrEqual(PLAN.elec.length);
    // Le contrôle en sens inverse : sur le papier, pas de lueur — on
    // n'imprime pas un halo.
    const surPapier = frameSvg(1, W, H, PAPIER_PALETTE, undefined, {
      elec: 1,
      grille: false,
    });
    expect([...surPapier.matchAll(/<circle [^>]*fill="#/g)]).toHaveLength(0);
  });
});

describe('les images de la vitrine', () => {
  const svg = (t: number) => frameSvg(t, W, H);

  /*
    PLUS DE COTES DE LOGEMENT — ET C'EST TOUJOURS VRAI.

    Elles disaient la taille d'un logement inventé, ce qui n'apprend rien, et
    elles étaient le seul élément de l'image qui devait s'effacer en cours de
    route : un fondu à régler, un écart à la maçonnerie à régler, et deux
    corrections déjà.

    LES COTES SONT REVENUES, MAIS PAS CELLES-LÀ. Relevé du patron : « on
    affiche les cotes rapidement ». Ce sont maintenant les cotes de POSE des
    appareils — la hauteur qu'on trace au crayon avant de percer —, et elles
    ne paraissent qu'après eux (voir « le cheminement »). Une cote d'appareil
    dit ce que l'application sait faire ; une cote de mur ne disait que la
    taille d'un plan inventé.
  */
  it('ne cote toujours pas le logement lui-même', () => {
    for (const t of [0, 0.5, 1]) expect(svg(t)).not.toContain(' m</text>');
  });

  /*
    LE MOBILIER ARRIVE EN FONDU, PAS D'UN COUP.

    Il sortait du sol à pleine opacité : d'une image à l'autre, un logement
    vide devenait un logement meublé. L'œil ne relie pas ces deux images, il
    voit une coupure — et une coupure au milieu d'un mouvement se lit comme
    un défaut d'affichage.

    Le fondu est RAPIDE — quelques images — mais c'en est un : le mobilier
    monte en opacité pendant que les murs se lèvent, et l'on comprend que
    c'est le même logement qui se remplit.
  */
  it('fait apparaître le mobilier en fondu', () => {
    /*
      ON CHERCHE UN MEUBLE, PAS UNE COULEUR.

      Ce banc lisait « le premier trait bleu du dessin », en se fiant à ce
      que le bleu du mobilier soit le seul de la vitrine. Il l'a cessé le
      jour où une porte a montré son percement : le pourtour d'un passage
      prend LA MÊME teinte (`passage: p.meubleTrait`), il est là dès la
      première image, et le banc lisait donc une opacité pleine du début à
      la fin — plus aucun fondu, alors que le fondu était intact.

      On cherche donc par NATURE : un meuble est un polygone PLEIN qui
      monte en opacité ; le pourtour d'un passage est un contour vide
      (`fill="none"`). La couleur ne départage rien, le remplissage si.
    */
    const opacite = (t: number) => {
      const m = svg(t).match(
        new RegExp(
          `fill="#[0-9A-Fa-f]{6}" fill-opacity="([\\d.]+)" ` +
            `stroke="${SHOWCASE_PALETTE.meubleTrait}"`,
        ),
      );
      return m ? parseFloat(m[1]) : 0;
    };
    const suite = Array.from({ length: SHOWCASE_FRAMES }, (_, i) =>
      opacite(avancement(i)),
    );
    expect(Math.max(...suite)).toBeGreaterThan(0.9);
    expect(suite[0]).toBeLessThan(0.05);
    // Au moins trois images à mi-chemin : sans elles, le fondu tient en une
    // image et n'en est plus un.
    expect(suite.filter((o) => o > 0.05 && o < 0.95).length).toBeGreaterThanOrEqual(3);
    // Et aucun saut brutal d'une image à la suivante.
    for (let i = 1; i < suite.length; i++) {
      expect(Math.abs(suite[i] - suite[i - 1])).toBeLessThan(0.5);
    }
  });

  it('lève le plan en gardant ses appareils quand on les lui demande', () => {
    /*
      DEUX LECTURES DE CETTE ÉPREUVE, ET LA SECONDE EST PLUS ÉTROITE.

      Elle disait : les appareils sont là du début à la fin. C'était vrai, et
      c'était justement le défaut — relevé du patron, « des interrupteurs et
      prises pop à des endroits » : ils paraissaient dès la première image,
      donc on ne les voyait jamais arriver. Le CYCLE les pose maintenant après
      la levée.

      Ce qu'elle tient encore, et qui vaut : appelé sans état, `frameSvg` rend
      la maquette ÉQUIPÉE. C'est ce dont la page du dossier a besoin pour
      montrer le plan imprimé — et c'est ce qui garantit que le plan de la
      feuille et celui de la vitrine sont le même dessin.
    */
    const volume = svg(1);
    expect(volume).toContain('>PC<');
    expect(volume).toContain('>I<');
    // Et il y a plus de matière qu'à plat : les murs ont poussé, les meubles
    // sont sortis.
    const faces = (s: string) => (s.match(/<polygon/g) ?? []).length;
    expect(faces(volume)).toBeGreaterThan(faces(svg(0)));
  });

  /*
    UN APPARTEMENT QUI TIENT DEBOUT.

    Le refend s'arrêtait au milieu du logement : la chambre n'était pas
    fermée, et l'armoire flottait à cinquante centimètres de son mur. On
    montrait un plan que personne n'a jamais relevé. Ce banc tient les deux
    règles qui font qu'un plan se lit comme un logement : les pièces se
    ferment, et le mobilier est CONTRE quelque chose.
  */
  it('ferme ses pièces et plaque ses meubles', () => {
    for (const [id, , cx, cz, w, d] of PLAN.meubles) {
      // Une table basse est au milieu du salon : c'est sa place.
      if (id === 'table') continue;
      const bords = [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2];
      const contre =
        Math.abs(bords[0]) < 0.12 ||
        Math.abs(bords[2] - 4.2) < 0.12 ||
        Math.abs(bords[1]) < 0.12 ||
        Math.abs(bords[3] - 6.4) < 0.12 ||
        Math.abs(bords[1] - 2.7) < 0.12 ||
        Math.abs(bords[3] - 2.7) < 0.12;
      expect({ id, contre }).toEqual({ id, contre: true });
    }
    // Le refend traverse : sans quoi la chambre n'existe pas.
    const refend = PLAN.murs.find((m) => m[0] === 'refend')!;
    expect(Math.abs(refend[3] - refend[1])).toBeCloseTo(4.2);
  });

  it('tient dans le cadre de l’écran', () => {
    for (const t of [0, 0.5, 1]) {
      const s = svg(t);
      const nombres = [...s.matchAll(/points="([^"]+)"/g)].flatMap((m) =>
        m[1]
          .split(' ')
          .flatMap((p) => p.split(',').map(Number)),
      );
      // Une marge de tolérance : un mur peut mordre le bord, jamais partir
      // à deux écrans de là.
      for (const n of nombres) {
        expect(n).toBeGreaterThan(-W);
        expect(n).toBeLessThan(H + W);
      }
    }
  });

  /** L'outil : `UPDATE_SHOWCASE=1 npx jest showcase` écrit les images. */
  it('écrit les images quand on le demande', () => {
    if (!process.env.UPDATE_SHOWCASE) {
      expect(SHOWCASE_FRAMES).toBeGreaterThan(20);
      return;
    }
    const dir = join(__dirname, '..', 'assets', 'showcase');
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < SHOWCASE_FRAMES; i++) {
      const nom = `frame-${String(i).padStart(3, '0')}.svg`;
      // La caméra du cycle est passée en clair : c'est elle qui dérive sur
      // les paliers, et `t` seul ne sait pas le dire.
      // L'IMAGE ENTIÈRE, dossier compris : `frameSvg` ne rend que la
      // maquette, et le cycle se termine par la page qui défile.
      writeFileSync(join(dir, nom), imageSvg(i, W, H, SHOWCASE_PALETTE));
    }
    expect(true).toBe(true);
  });
});
