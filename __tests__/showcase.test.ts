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
/** La première image du cycle : le plan, et le premier titre. */
const PLAN_DEBUT = 0;
import {
  avancement,
  camera,
  cascade,
  etatDeLImage,
  frameSvg,
  bandeauSvg,
  imageSvg,
  pose,
  progression,
  titreDeLImage,
  TITRES,
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
    const etages = new Set(
      [...s.matchAll(/fill-opacity="([\d.]+)" stroke="#2F6BFF"/g)].map(
        (m) => m[1],
      ),
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
  const IMAGES_PAR_SECONDE = 15;
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

  it('et la maquette est CACHÉE derrière, pas éteinte', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il tient le fondu : si la maquette
      disparaissait au lieu de passer dessous, la transition serait une
      coupure. Elle reste dessinée, à opacité nulle, et c'est ce qui permet
      au fondu de se jouer dans les deux sens.
    */
    const pleinePage = etats.findIndex((e) => e.page > 0.99);
    expect(imageSvg(pleinePage, W, H)).toContain('<g opacity="0.00">');
  });

  it('le cycle se referme sur le plan', () => {
    const dernier = etatDeLImage(SHOWCASE_FRAMES - 1);
    expect(dernier.t).toBe(0);
    expect(dernier.page).toBeLessThan(0.35);
    expect(etatDeLImage(SHOWCASE_FRAMES)).toEqual(etatDeLImage(0));
  });

  it('et aucune image n’est vide', () => {
    // Le garde-fou du fondu : deux opacités qui se croisent mal laisseraient
    // un écran blanc au milieu de la vitrine.
    for (let i = 0; i < SHOWCASE_FRAMES; i++) {
      const e = etatDeLImage(i);
      expect(`${i} : ${Math.max(1 - e.page, e.page) > 0.4}`).toBe(`${i} : true`);
    }
  });
});

describe('les gros titres, et le peps', () => {
  /*
    RELEVÉ DU PATRON, en la regardant tourner : « fais une meilleure animation
    dans l'iPhone, moderne avec du peps, et des gros titres. Rapide. »

    UNE ANIMATION MUETTE DEMANDE À L'ŒIL DE DEVINER. On voyait un plan se
    lever sans savoir que c'était ÇA, le geste de l'application. Un mot posé
    dessus fait la moitié du travail — et c'est LUI qui permet de raccourcir
    le reste : on lit « LE RELEVÉ » plus vite qu'on ne le déduit.
  */
  const IMAGES_PAR_SECONDE = 15;

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
      Dix signes au plus : c'est ce qui permet de les écrire en corps 30 sur un
      écran de deux cent soixante-quatre points. Un mot de quinze signes, et
      l'on retombe sur du texte — la vitrine cesse d'annoncer, elle explique.
    */
    for (const t of TITRES) {
      expect(`${t.mot} : ${t.mot.length}`).toBe(`${t.mot} : ${t.mot.length}`);
      expect(t.mot.length).toBeLessThanOrEqual(10);
    }
  });

  it('et ils s’écrivent VRAIMENT gros sur l’image', () => {
    // Le contrôle qui compte : un titre court ne sert à rien s'il est écrit
    // en corps 9 comme les sigles des appareils.
    const corps = [...bandeauSvg(4, W, H).matchAll(/font-size="([\d.]+)"/g)].map(
      (m) => Number(m[1]),
    );
    expect(Math.max(...corps)).toBeGreaterThanOrEqual(24);
  });

  it('le mot entre au lieu de se poser', () => {
    /*
      LE PEPS EST LÀ, et pas ailleurs : trois images d'entrée — deux dixièmes
      de seconde —, le mot monte de douze points et paraît. Rien ne se pose
      mollement.
    */
    const debut = titreDeLImage(PLAN_DEBUT).avance;
    const plein = titreDeLImage(PLAN_DEBUT + 4).avance;
    expect(debut).toBeLessThan(0.6);
    expect(plein).toBeCloseTo(1, 2);
  });

  it('mais il ne clignote pas : une fois entré, il reste', () => {
    // Le contrôle en sens inverse : une entrée rejouée à chaque image ferait
    // battre le mot au lieu de l'annoncer.
    const t = TITRES[1];
    for (let i = TITRES[0].jusqua + 4; i < t.jusqua; i++) {
      expect(`${i} : ${titreDeLImage(i).avance}`).toBe(`${i} : 1`);
    }
  });

  it('et le titre passe PAR-DESSUS le dossier', () => {
    /*
      La couche qui NARRE ne participe pas au fondu : le mot ne doit pas pâlir
      pendant qu'une page monte dessous, sinon la seule chose qui explique
      l'image devient illisible juste au moment où l'image change.
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

  it('et le tout est plus RAPIDE qu’avant', () => {
    // Sept secondes, c'était long. Le relevé dit « rapide » : on tient le bas
    // de la fourchette.
    expect(SHOWCASE_FRAMES / IMAGES_PAR_SECONDE).toBeLessThanOrEqual(6);
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
        /fill="#[0-9A-Fa-f]{6}" fill-opacity="([\d.]+)" stroke="#2F6BFF"/,
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
      const nom = `frame-${String(i).padStart(2, '0')}.svg`;
      // La caméra du cycle est passée en clair : c'est elle qui dérive sur
      // les paliers, et `t` seul ne sait pas le dire.
      // L'IMAGE ENTIÈRE, dossier compris : `frameSvg` ne rend que la
      // maquette, et le cycle se termine par la page qui défile.
      writeFileSync(join(dir, nom), imageSvg(i, W, H, SHOWCASE_PALETTE));
    }
    expect(true).toBe(true);
  });
});
