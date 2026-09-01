/**
 * L'ECRAN DU DEVIS — le bouton du plan, les trois etapes, le ticket.
 *
 * TROIS FORMES, ET DEUX ONT ECHOUE SUR LE MEME POINT : LE DEFILEMENT.
 *
 *   PREMIERE — une feuille modale, le plan au-dessus d'une liste a hauteur
 *   bornee. « Le scroll sur la liste des produits du devis est casse, il
 *   marche rarement. »
 *
 *   DEUXIEME — la meme feuille, mais un seul rouleau, plan compris. Mieux, et
 *   toujours faux : « ca ne scrolle pas du tout ».
 *
 *   TROISIEME — une PAGE. « Fais des pages entieres pas des pop-up. »
 *
 * ET LA CAUSE ETAIT DANS LA COQUILLE, PAS DANS LA MISE EN PAGE. `SheetShell`
 * enveloppe son contenu dans deux `Pressable` — le voile qui ferme, et la
 * feuille qui arrete l'appui pour ne pas se fermer sous le doigt. Un
 * `Pressable` prend le geste DES LE POSE ; une liste posee dessous doit le
 * lui reprendre au premier millimetre de mouvement, et ce rattrapage ne se
 * fait pas. Compter les zones de defilement — ce que faisait le banc de la
 * deuxieme forme — ne pouvait donc pas suffire : il mesurait le symptome.
 *
 * LE BANC MESURE MAINTENANT LA CAUSE : aucun ancetre du rouleau ne doit
 * prendre l'appui au pose. C'est vrai d'une page, et c'etait faux d'une
 * feuille sous n'importe quelle mise en page.
 *
 * LE BOUTON A EU DEUX VERSIONS AUSSI. Anime, vert, avec « € » et « ? » qui
 * alternaient — puis, une fois le devis en main : « modifie le en un bouton
 * pas dynamique, discret, ou on affiche le € total mis a jour a chaque
 * modification ». Une fois qu'on sait repondre, on ne demande plus.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Circle, Path } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisPastille, prixCourt } from '../src/components/DevisPastille';
import { DevisScreen } from '../src/screens/DevisScreen';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { CardinalRing, NorthBadge } from '../src/components/CardinalRing';
import { chiffrerLePlan } from '../src/geometry/devisplan';
import { postsSymbol, type Fixture, type FixtureKind } from '../src/geometry/electrical';
import { GAMMES } from '../src/geometry/prix';
import { WIRE_COLORS, roleDuFil } from '../src/geometry/schema';
import { ATTENTE_MIN } from '../src/components/PrixQuiSActualisent';
import { photoDe } from '../src/ui/produits';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

/*
  DES MINUTEURS FEINTS, DEPUIS QUE L'ATTENTE DES PRIX A UNE DURÉE MINIMALE.

  Relevé du patron : « laisse un chargement plus long pour la vérification,
  c'est trop rapide on aperçoit à peine la page là ». La page d'attente reste
  donc `ATTENTE_MIN` à l'écran (voir `prixverifies`). Attendre pour de vrai
  deux secondes et demie à chaque épreuve qui va au ticket coûterait une
  minute sur ce banc — et un banc lent finit par ne plus être lancé.
*/
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/** Tous les textes d'un arbre, dans l'ordre où ils se lisent. */
const mots = (t: TestRenderer.ReactTestRenderer): string[] =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .filter((s) => s.length > 0);

// ---------------------------------------------------------------- le bouton

describe('le bouton du plan', () => {
  it('se pose à GAUCHE de celui des normes', () => {
    // Le banc lit la source : c'est un ORDRE dans un rendu, et rien d'autre
    // ne le garde.
    const src = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'),
      'utf8',
    );
    const devis = src.indexOf('<DevisPastille');
    const controle = src.indexOf('<ControlePastille');
    expect(devis).toBeGreaterThan(0);
    expect(controle).toBeGreaterThan(0);
    expect(`devis avant contrôle : ${devis < controle}`).toBe(
      'devis avant contrôle : true',
    );
  });

  it('et il ouvre une PAGE, pas une feuille', () => {
    // La correction du défilement tient dans cette ligne : une page entière,
    // routée comme les quatre autres écrans, et non une fenêtre posée sur le
    // plan.
    const src = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'),
      'utf8',
    );
    expect(src).toContain("setScreen('devis')");
    expect(src).not.toContain('DevisSheet');
  });

  it('affiche le total, et rien d’autre', () => {
    /*
      LA VERSION RETIREE demandait « € ? » en fondu ; celle-ci REPOND. Un
      bouton qui pose une question invite a ouvrir une page pour connaitre un
      chiffre qu'on pouvait ecrire la.
    */
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DevisPastille total={793.3} onPress={() => {}} />);
    });
    arbre = t;
    expect(mots(t)).toEqual(['793 €']);
  });

  it('écrit court : au-delà du millier, on passe au k€', () => {
    // Sur un bouton posé au-dessus d'un plan, « 1 284,50 € » prend la largeur
    // de deux pièces.
    expect(prixCourt(48)).toBe('48 €');
    expect(prixCourt(793.3)).toBe('793 €');
    expect(prixCourt(1284.5)).toBe('1,3 k€');
    expect(prixCourt(12840)).toBe('12,8 k€');
  });

  it('et se tait quand il n’y a rien à chiffrer', () => {
    // Le contrôle en sens inverse : afficher « 0 € » est une réponse, mais
    // pas la bonne.
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DevisPastille total={null} onPress={() => {}} />);
    });
    arbre = t;
    expect(mots(t)).toEqual(['—']);
    expect(
      String(t.root.findAllByType(TouchableOpacity)[0].props.accessibilityLabel),
    ).toContain('rien de posé');
  });
});

// -------------------------------------------------------------------- la page

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const fx = (id: string, kind: Fixture['kind'], along: number): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along,
  height: kind === 'inter' || kind === 'va' ? 1.1 : 0.25,
  side: 1,
});

const APPAREILS: Fixture[] = [
  fx('p1', 'prise', 0.6),
  fx('p2', 'prise', 1.2),
  fx('p3', 'prise', 1.8),
  fx('p4', 'prise20', 2.4),
  fx('i1', 'inter', 3),
  fx('i2', 'va', 3.6),
  fx('r1', 'rj45', 4.2),
  // Le TGBT est POSÉ : depuis que le devis suit le geste (pas de tableau
  // sur le plan, pas de rayon Tableau — voir `tgbtabsent`), les épreuves
  // qui cherchent un disjoncteur doivent d'abord en avoir mérité un.
  fx('tb', 'tableau', 4.8),
];

const ROOMS = [{ id: 'r1', name: 'Séjour', floor: null }];

const devisAttendu = () =>
  chiffrerLePlan(MURS, ROOMS as never, APPAREILS, [], GAMMES[0].id);

/*
  ON MESURE APRÈS CHAQUE ÉTAPE, ET PAS SEULEMENT À L'OUVERTURE.

  Le plan n'apparaît qu'au troisième écran : servir la mise en page une fois
  pour toutes, au montage, laissait ce plan-là à zéro pixel. Il ne dessinait
  rien — et le banc mesurait un dessin vide en croyant compter des symboles.
*/
function mesurer(t: TestRenderer.ReactTestRenderer) {
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 360, height: 240 } } });
      }
    }
  });
}

const ouvrir = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: ROOMS as never,
      fixtures: APPAREILS,
      ceiling: [],
      photos: [],
      notes: [],
      niveauCourant: 0,
      screen: 'devis',
      gammeDevis: GAMMES[0].id,
      /*
        LE MAGASIN SURVIT D'UN BANC A L'AUTRE.

        Les articles ecartes vivent dans le magasin — il le faut, le bouton du
        plan les lit aussi. Sans cette remise a zero, l'epreuve qui ecarte un
        article laissait le suivant demarrer avec un devis deja ampute, et
        c'est le banc qui se marche dessus : la panne exacte que la deuxieme
        forme de cet ecran avait deja subie.
      */
      devisEcartes: [],
      /*
        LE RANG DE L'ÉTAPE AUSSI SURVIT D'UN BANC À L'AUTRE — et pour la même
        raison que les articles écartés : il vit dans le magasin, parce qu'il
        doit survivre à l'aller-retour au magasin des articles (voir
        `gammechoisie`). Sans cette remise à zéro, la première épreuve qui va
        jusqu'au ticket laisse la suivante démarrer SUR le ticket, où le
        bouton « Voir le prix » n'existe plus.
      */
      etapeDevis: 0,
    });
    t = TestRenderer.create(<DevisScreen />);
  });
  mesurer(t);
  arbre = t;
  return t;
};

/** Le bouton d'une page, par son nom parlé. */
const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        String(n.props?.accessibilityLabel ?? '').startsWith(nom),
    )
    .pop()!;

/**
 * JUSQU'AU TICKET — et l'on attend que les prix soient vérifiés.
 *
 * Depuis que « Voir le prix » va demander au serveur si les tarifs ont bougé
 * (voir `tarifsreseau`), le ticket ne s'affiche plus tout de suite : on montre
 * l'attente, puis LE prix. Afficher un total et le voir changer une seconde
 * plus tard est pire que d'attendre — on ne sait plus lequel des deux est le
 * bon, et c'est le premier qu'on retient.
 *
 * Ces bancs doivent donc laisser la vérification finir. Sans réseau sous
 * Jest, elle finit en « hors ligne » à la micro-tâche suivante : un `act`
 * asynchrone vide la file, et le ticket est là.
 */
const auTicket = async () => {
  const t = ouvrir();
  /*
    UNE SEULE MARCHE, ET IL Y EN AVAIT DEUX.

    Le tunnel commençait par le choix de gamme : il fallait « Continuer »,
    puis « Voir le prix ». Le choix de gamme a sa page à lui, ouverte depuis
    l'estimation (voir `gammechoisie`) ; reste l'avertissement, puis le prix.
  */
  act(() => bouton(t, 'Voir le prix').props.onPress());
  await act(async () => {
    // L'attente des prix tient l'écran un temps minimum : on l'épuise.
    jest.advanceTimersByTime(ATTENTE_MIN + 50);
  });
  mesurer(t);
  return t;
};

describe('le défilement de la page', () => {
  it('n’a personne au-dessus du rouleau qui prenne l’appui', () => {
    /*
      LA CAUSE, ET NON LE SYMPTOME.

      Un `Pressable` repond `true` a `onStartShouldSetResponder` : il prend le
      geste au POSE du doigt. Une liste posee dessous doit le lui reprendre au
      premier millimetre de mouvement, et ce rattrapage ne se fait pas.

      Une page n'a pas de coquille. Le retour au bord, lui, ne capture qu'EN
      ROUTE (`onStartShouldSetPanResponderCapture: () => false`, voir
      `RetourGlisse`) : il ne gene rien.
    */
    const t = ouvrir();
    const rouleaux = t.root.findAllByType(ScrollView);
    expect(rouleaux.length).toBe(1);
    /*
      L'EVENEMENT D'ESSAI DOIT RESSEMBLER A UN VRAI.

      `PanResponder` ne se contente pas de l'appel : il lit `touchHistory`
      pour recalculer l'etat du geste. Appele a vide, il lance — et un banc
      qui prend cette exception pour une reponse ne mesure plus rien.
    */
    const appui = {
      nativeEvent: { touches: [], changedTouches: [], identifier: 1, timestamp: 0 },
      touchHistory: {
        touchBank: [],
        numberActiveTouches: 1,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: 0,
      },
    } as never;
    const gourmands: string[] = [];
    let n: TestRenderer.ReactTestInstance | null = rouleaux[0].parent;
    while (n) {
      const p = n.props as {
        onStartShouldSetResponder?: (e: never) => boolean;
        onStartShouldSetResponderCapture?: (e: never) => boolean;
      };
      for (const [nom, f] of [
        ['au posé', p.onStartShouldSetResponder],
        ['à la capture', p.onStartShouldSetResponderCapture],
      ] as [string, ((e: never) => boolean) | undefined][]) {
        if (typeof f === 'function' && f(appui)) {
          gourmands.push(
            `${typeof n.type === 'string' ? n.type : 'composant'} prend ${nom}`,
          );
        }
      }
      n = n.parent;
    }
    expect(gourmands).toEqual([]);
  });
});

describe('les deux étapes', () => {
  /*
    ELLES ÉTAIENT TROIS, ET LA PREMIÈRE DEMANDAIT LA GAMME.

    On choisissait sa marque d'appareillage AVANT d'avoir vu le moindre prix
    — c'est-à-dire avant d'avoir la seule information qui permette de
    choisir —, et tout aller-retour au magasin y ramenait, deux pages avant
    l'article qu'on venait d'ajouter. Le choix de gamme a maintenant sa page,
    ouverte depuis l'estimation : c'est le banc `gammechoisie` qui le tient,
    avec la phrase qui compte l'appareillage du relevé.

    Restent les deux marches qui doivent se lire dans l'ordre : ce que le prix
    ne contient pas, puis le prix.
  */
  it('se voient : un numéro, un rang, un gros titre', () => {
    // Relevé du patron : « fais des étapes modernes avec des gros titres et
    // numéros ». On doit savoir où l'on est sans compter.
    const lus = mots(ouvrir());
    expect(lus).toContain('1');
    expect(lus).toContain('ÉTAPE 1 SUR 2');
    expect(lus).toContain('À savoir avant le prix');
  });

  it('et le tunnel ne demande plus la gamme en chemin', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE de la page qui a déménagé : si les cartes
      étaient restées là, l'épreuve du dessus passerait quand même — deux
      étapes, mais le même tunnel.

      L'ordre des gammes, lui — « mets le Legrand Céliane et Mosaic en
      premier, c'est les plus communs » —, reste tenu là où elles vivent
      désormais.
    */
    const lus = mots(ouvrir()).join(' ');
    for (const g of GAMMES) expect(lus).not.toContain(`${g.marque} ${g.nom}`);
  });

  it('l’AVERTISSEMENT vient avant le prix', () => {
    /*
      L'ordre est la regle : le total ne s'affiche jamais a quelqu'un qui n'a
      pas pu lire ce qui n'y est pas.

      TROIS VERSIONS DE CETTE PAGE, ET CHACUNE CORRIGEAIT LA PRECEDENTE.

        PREMIERE — une liste d'exclusions : luminaires, main-d'oeuvre,
        chutes. Elle repondait a une question que personne ne se pose devant
        un devis qu'il n'a pas encore vu. Releve du patron : « on ne comprend
        pas bien pour ce qui est compte ».

        DEUXIEME — une demonstration animee du calcul : un tableau, un
        interrupteur, un point lumineux, la gaine qui avance et le compteur
        qui monte, le ticket qui se remplit. Elle expliquait la METHODE — et
        l'ecran suivant la montre deja, ligne par ligne, quantite par
        quantite. Cinq secondes perdues entre le choix et le prix.

        TROISIEME — celle-ci. Releve du patron : « enleve la deuxieme page
        explicative ; a la place fais une page dynamique Attention ». Reste
        la seule chose qui coute de l'argent a qui la decouvre trop tard.

      Le banc de la demonstration est parti avec elle ; son histoire est ici,
      ou elle sert encore.
    */
    const lus = mots(ouvrir());
    expect(lus).toContain('Attention');
    expect(lus.join(' ')).toContain(
      'Les luminaires ne sont pas compris dans le devis',
    );
    // Ce qu'on a retire ne doit pas repousser ailleurs.
    expect(lus.join(' ')).not.toContain('CE QUE ÇA MET AU TICKET');
    expect(lus.join(' ')).not.toContain('TOTAL TTC');
  });

  it('et l’avertissement dit aussi ce qui EST compté', () => {
    /*
      Le controle en sens inverse. Un avertissement qui ne dit que ce qui
      MANQUE laisse croire qu'il manque aussi le reste — et le contresens
      possible coute cher : croire qu'il faudra acheter de quoi alimenter les
      luminaires, en plus des luminaires.
    */
    expect(mots(ouvrir()).join(' ')).toContain('est bien compté');
  });

  it('et on revient sur l’avertissement d’un appui sur le numéro', async () => {
    const t = await auTicket();
    act(() => bouton(t, 'Étape 1').props.onPress());
    expect(mots(t)).toContain('À savoir avant le prix');
  });

  it('mais on ne saute pas celle qu’on n’a pas lue', () => {
    // Le contrôle en sens inverse : l'étape des exclusions ne se contourne pas
    // par le fil.
    expect(bouton(ouvrir(), 'Étape 2').props.disabled).toBe(true);
  });
});

describe('le ticket de caisse', () => {
  it('porte une ligne par article, avec son compte et son prix', async () => {
    const t = await auTicket();
    const devis = devisAttendu();
    const lus = mots(t);
    expect(devis.lignes.length).toBeGreaterThan(5);
    for (const l of devis.lignes) {
      expect(lus).toContain(l.libelle);
      expect(lus).toContain(
        `${l.quantite} ${l.unite} × ${l.pu!.toFixed(2).replace('.', ',')} €`,
      );
    }
  });

  it('et rien n’y est replié : un ticket qu’il faut déplier n’en est plus un', async () => {
    /*
      La version d'avant repliait chaque rayon derriere un chevron. Sur un
      ticket, tout se lit d'un coup, du haut vers le bas — c'est ce qui fait
      qu'on n'a jamais eu besoin qu'on nous explique comment lire un ticket.

      DEUX VERSIONS DE CETTE ÉPREUVE, ET LA PREMIÈRE COMPTAIT LES CHEVRONS.
      Elle exigeait qu'aucun « › » ne figure sur la page — ce qui était vrai
      tant que le seul chevron possible était celui d'un rayon replié. Le jour
      où le ticket a porté une PORTE vers le magasin, elle est tombée : ce
      chevron-là ne replie rien, il annonce une autre page.

      Elle mesure donc la cause et non le symptôme : TOUTES les lignes du
      devis sont écrites, sans exception. C'est ce qu'on voulait dire depuis le
      début, et aucun chevron ne peut le faire mentir.
    */
    const t = await auTicket();
    const lus = mots(t);
    const devis = devisAttendu();
    const absents = devis.lignes
      .map((l) => l.libelle)
      .filter((nom) => !lus.includes(nom));
    expect(absents).toEqual([]);
  });

  it('et se termine par le total, après le trait de découpe', async () => {
    const t = await auTicket();
    const lus = mots(t);
    const devis = devisAttendu();
    expect(lus).toContain('TOTAL TTC');
    expect(lus).toContain(`${devis.total.toFixed(2).replace('.', ',')} €`);
    // Le total vient APRÈS le dernier article : c'est la fin d'un ticket.
    expect(lus.indexOf('TOTAL TTC')).toBeGreaterThan(
      lus.indexOf(devis.lignes[0].libelle),
    );
  });

  it('et chaque rayon dit son sous-total', async () => {
    const t = await auTicket();
    const lus = mots(t);
    for (const f of devisAttendu().parFamille) {
      // `textTransform` met la majuscule au DESSIN : le texte, lui, garde sa
      // casse. Un banc qui chercherait la version en capitales chercherait
      // une chaîne qui n'existe nulle part.
      expect(lus).toContain(f.famille);
      expect(lus).toContain(`${f.total.toFixed(2).replace('.', ',')} €`);
    }
  });
});

describe('les vignettes du ticket', () => {
  it('portent la photo du produit quand on l’a', async () => {
    /*
      Releve du patron : « une petite image avant son titre et son prix ». Les
      photos sont les packshots des fabricants, detoures et reduits ; voir
      `src/ui/produits.ts`.
    */
    const t = await auTicket();
    const devis = devisAttendu();
    /*
      LES CONDUCTEURS SONT DEHORS, ET C'EST NEUF. Leur couronne est DESSINÉE
      dans la couleur de son rôle (voir plus bas) : ils ont bien une image,
      simplement ce n'est plus une photo. Compter toutes les lignes qui ont une
      photo au catalogue reviendrait à attendre sept images de plus que ce que
      le ticket pose.
    */
    const avecPhoto = devis.lignes.filter(
      (l) => photoDe(l.code) && !roleDuFil(l.code),
    );
    expect(avecPhoto.length).toBeGreaterThan(5);
    expect(t.root.findAllByType(Image).length).toBe(avecPhoto.length);
  });

  it('et le repli sur la section reste, pour les couronnes du MAGASIN', () => {
    /*
      TROIS VERSIONS DE L'IMAGE D'UN FIL, ET CHACUNE CORRIGEAIT LA PRÉCÉDENTE.

        PREMIÈRE — une photo par section, `fil-1.5`. Le jour où le fil s'est
        mis à sortir couleur par couleur au bordereau — `fil-1.5-phase` au lieu
        de `fil-1.5` —, toutes les vignettes de fil ont disparu du ticket d'un
        coup : plus personne ne demandait ce code-là.

        DEUXIÈME — le repli sur la section, comme le prix le fait déjà : une
        couronne de rouge et une de bleu, c'est la même bobine. Les images sont
        revenues. Relevé du patron, en la regardant : « la couleur des fils en
        image doit changer sur le devis, on a que du bleu partout là ». Il a
        raison — la couleur EST ce qu'on regarde en rayon, et le ticket
        alignait quatre lignes qui ne différaient que par leur libellé.

        TROISIÈME — la couronne DESSINÉE dans la couleur de son rôle, celle de
        `WIRE_COLORS`. C'est l'épreuve d'après.

      LE REPLI N'A PAS DISPARU POUR AUTANT, et cette épreuve le tient : le
      magasin vend des couronnes SANS rôle — « fil-4 », « fil-16 » —, et
      celles-là gardent leur photo. C'est aussi ce qui protège le jour où un
      code de fil sortirait sans son rôle.
    */
    expect(roleDuFil('fil-2.5')).toBeNull();
    expect(photoDe('fil-2.5')).not.toBeNull();
    expect(photoDe('fil-1.5-phase')).toBe(photoDe('fil-1.5'));
  });

  it('et les couronnes portent CHACUNE la couleur de son conducteur', async () => {
    /*
      RELEVÉ DU PATRON : « la couleur des fils en image doit changer sur le
      devis, on a que du bleu partout là ». La vignette retombait sur la
      SECTION et servait la même bobine bleue à la phase comme à la terre.

      L'ÉPREUVE DE L'OUVRAGE, ET NON DE L'OUTIL. Le banc `filsencouleur`
      éprouve la vignette toute seule ; celle-ci part du TICKET et regarde ce
      qu'il pose vraiment sur ses lignes de fil — c'est là que la couleur se
      perdait.
    */
    const t = await auTicket();
    const devis = devisAttendu();
    const roles = devis.lignes
      .map((l) => ({ code: l.code, role: roleDuFil(l.code) }))
      .filter((x) => x.role !== null);
    expect(roles.length).toBeGreaterThan(2);
    const vues = new Set<string>();
    for (const { code, role } of roles) {
      const vignette = t.root.findAll(
        (n) => String(n.props?.testID ?? '') === `vignette-${code}`,
      )[0];
      expect(`${code} : ${vignette !== undefined}`).toBe(`${code} : true`);
      const teintes = vignette
        .findAllByType(Circle)
        .map((n) => String(n.props.stroke));
      const attendue = WIRE_COLORS[role!].color;
      expect(`${code} : ${teintes.includes(attendue)}`).toBe(`${code} : true`);
      vues.add(attendue);
    }
    // Le contrôle en sens inverse : plusieurs rôles au ticket, plusieurs
    // teintes. Une couleur unique passerait tout ce qui précède.
    expect(vues.size).toBeGreaterThan(1);
  });

  it('et les prises partagent une seule photo', () => {
    /*
      Releve du patron : « les prises doivent avoir la meme image, ce sont la
      meme chose en realite ». Un socle 16 A, un 20 A et un 32 A sont le MEME
      objet sur le mur — meme plaque, meme couleur, meme forme ; ce qui les
      separe est ecrit sur la ligne, en amperes.

      C'etait en prime la reponse aux deux vignettes ratees du premier jet :
      il ne fallait pas de meilleures photos, il n'en fallait qu'une.
    */
    for (const code of ['meca-prise20', 'meca-prise32']) {
      expect(`${code} : ${photoDe(code) === photoDe('meca-prise')}`).toBe(
        `${code} : true`,
      );
    }
  });

  it('et retombent sur le symbole du plan quand la photo manque', async () => {
    /*
      Le controle en sens inverse : un article sans photo garde une image, et
      le ticket ne se troue pas. C'est aussi ce qui rend le catalogue de
      photos facultatif — on peut en ajouter une demain sans toucher a
      l'ecran.
    */
    const t = await auTicket();
    const devis = devisAttendu();
    const traces = new Set(t.root.findAllByType(Path).map((n) => String(n.props.d)));
    for (const l of devis.lignes) {
      if (photoDe(l.code) || !l.code.startsWith('meca-')) continue;
      const kind = l.code.slice(5) as FixtureKind;
      for (const seg of postsSymbol([kind], kind)) {
        expect(`${l.libelle} : ${traces.has(seg.d)}`).toBe(`${l.libelle} : true`);
      }
    }
  });

  it('et sur leur NOM quand il n’y a ni photo ni symbole', async () => {
    /*
      LE TROISIÈME REPLI, ET IL MANQUAIT. Un article venu du magasin — du
      plâtre, une aiguille, une alimentation LED — n'a ni photo ni symbole de
      plan : la vignette rendait alors `null`, et la ligne s'ouvrait sur un
      carré vide. Relevé du patron, à propos du magasin : « si pas dispo
      marque sur l'image ». C'est la même règle, et le même composant.
    */
    const t = await auTicket();
    act(() => {
      useScanStore.getState().ajouterAuDevis('transfo-led', 1);
    });
    mesurer(t);
    expect(photoDe('transfo-led')).toBeNull();
    const vue = t.root.findAll(
      (n) => String(n.props?.testID ?? '') === 'vignette-transfo-led',
    )[0];
    expect(vue).toBeDefined();
    expect(String(vue.findAllByType(Text)[0].props.children)).toBe(
      'Alimentation LED 24 V',
    );
    act(() => useScanStore.getState().retirerDuDevis('transfo-led'));
  });

  it('et la légende du plan garde le symbole, pas la photo', async () => {
    /*
      Sous le plan, ce qu'on cherche est de relier un chiffre a un DESSIN.
      Une photo n'y aiderait pas : elle ne ressemble pas au symbole.
    */
    const t = await auTicket();
    const devis = devisAttendu();
    const traces = new Set(t.root.findAllByType(Path).map((n) => String(n.props.d)));
    expect(devis.legende.length).toBeGreaterThan(1);
    for (const l of devis.legende) {
      if (l.plafond) continue;
      const kind = l.kind as FixtureKind;
      for (const seg of postsSymbol([kind], kind)) {
        expect(`${l.titre} : ${traces.has(seg.d)}`).toBe(`${l.titre} : true`);
      }
    }
  });

  it('et le plan du logement est bien là, en pied de ticket', async () => {
    const t = await auTicket();
    expect(t.root.findAllByType(FloorplanEditor).length).toBe(1);
    const lus = mots(t);
    expect(lus).toContain('D’où viennent ces quantités');
  });

  it('mais SANS les points cardinaux', async () => {
    /*
      RELEVÉ DU PATRON : « sur le plan 2D affiché dans le devis, enlève les
      points cardinaux ».

      Il a raison, et la raison est dans le titre au-dessus du plan : « D'où
      viennent ces quantités ». Ce plan-là ne sert pas à s'orienter sur un
      chantier — il sert à relier un chiffre du ticket à un dessin. La
      couronne des points cardinaux répond à une question que personne ne se
      pose devant un devis, et sur une vignette de cette taille elle prend
      les quatre coins.

      LE PLAN DE L'ÉCRAN DE RÉSULTAT LES GARDE, lui : c'est le même composant,
      et c'est là qu'on cherche le nord.
    */
    const t = await auTicket();
    expect(t.root.findAllByType(CardinalRing)).toHaveLength(0);
    expect(t.root.findAllByType(NorthBadge)).toHaveLength(0);
  });

  it('et le plan les montre toujours quand on ne les lui retire pas', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il porte le correctif : sans lui, on
      aurait pu retirer les points cardinaux du composant LUI-MÊME — donc
      partout, y compris sur l'écran de résultat où l'on cherche le nord — et
      l'épreuve du dessus serait passée au vert.

      Le même plan, monté sans consigne, les porte.
    */
    let seul!: TestRenderer.ReactTestRenderer;
    act(() => {
      seul = TestRenderer.create(
        <FloorplanEditor
          showMeasures={false}
          editable={false}
          selectedWallId={null}
          onSelectWall={() => {}}
        />,
      );
    });
    mesurer(seul);
    expect(
      seul.root.findAllByType(CardinalRing).length +
        seul.root.findAllByType(NorthBadge).length,
    ).toBeGreaterThan(0);
    act(() => seul.unmount());
  });
});

describe('chercher et trier, quand la liste est longue', () => {
  /*
    Releve du patron : « fais un filtrage par prix croissant, decroissant,
    recherche etc. Si jamais la liste est longue. » Elle l'est : un logement
    complet passe la trentaine d'articles.
  */
  const champ = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAll(
        (n) =>
          typeof n.props?.onChangeText === 'function' &&
          String(n.props?.accessibilityLabel ?? '').startsWith('Chercher'),
      )
      .pop()!;

  it('la recherche ne garde que ce qu’on a demandé', async () => {
    const t = await auTicket();
    act(() => champ(t).props.onChangeText('disjoncteur'));
    const lus = mots(t);
    expect(lus.some((m) => m.startsWith('Disjoncteur'))).toBe(true);
    expect(lus.some((m) => m.startsWith('Conduit ICTA'))).toBe(false);
  });

  it('et elle se moque des accents, de la casse et des apostrophes', async () => {
    // Personne ne tape « Boîte d'encastrement » avec son accent circonflexe.
    const t = await auTicket();
    act(() => champ(t).props.onChangeText('BOITE D ENCASTREMENT'));
    expect(mots(t).some((m) => m.startsWith('Boîte d’encastrement'))).toBe(true);
  });

  it('et le dit quand rien ne correspond, au lieu de rendre une page vide', async () => {
    const t = await auTicket();
    act(() => champ(t).props.onChangeText('zzzz'));
    expect(mots(t).join(' ')).toContain('Aucun article ne correspond');
  });

  it('le tri par prix range du plus cher au moins cher', async () => {
    const t = await auTicket();
    act(() => bouton(t, 'Trier : Prix ↓').props.onPress());
    const lus = mots(t);
    const parPrix = [...devisAttendu().lignes]
      .filter((l) => l.pu !== null)
      .sort((a, b) => b.pu! * b.quantite - a.pu! * a.quantite);
    expect(lus.indexOf(parPrix[0].libelle)).toBeLessThan(
      lus.indexOf(parPrix[parPrix.length - 1].libelle),
    );
  });

  it('et le tri inverse fait exactement l’inverse', async () => {
    // Le controle en sens inverse, au sens propre.
    const t = await auTicket();
    act(() => bouton(t, 'Trier : Prix ↑').props.onPress());
    const lus = mots(t);
    const parPrix = [...devisAttendu().lignes]
      .filter((l) => l.pu !== null)
      .sort((a, b) => b.pu! * b.quantite - a.pu! * a.quantite);
    expect(lus.indexOf(parPrix[0].libelle)).toBeGreaterThan(
      lus.indexOf(parPrix[parPrix.length - 1].libelle),
    );
  });

  it('et le ticket s’aplatit dès qu’on ne suit plus le chariot', async () => {
    /*
      Les rayons sont l'ordre dans lequel on remplit le chariot ; cet ordre
      n'a plus de sens quand on demande « le plus cher d'abord ». Un en-tete
      de rayon qui ne regrouperait plus rien serait un mensonge de mise en
      page.
    */
    const t = await auTicket();
    expect(mots(t)).toContain('Tableau');
    act(() => bouton(t, 'Trier : Prix ↓').props.onPress());
    expect(mots(t)).not.toContain('Tableau');
  });
});

describe('écarter un article', () => {
  /*
    Releve du patron : « fais en sorte qu'on puisse deselectionner des
    elements dans le devis si on en a pas besoin, le prix doit s'adapter ».
    Le cas est courant : on refait l'appareillage d'un logement dont les
    gaines sont deja en place.
  */
  const ligne = (t: TestRenderer.ReactTestRenderer, nom: string) =>
    t.root
      .findAll(
        (n) =>
          typeof n.props?.onPress === 'function' &&
          String(n.props?.accessibilityLabel ?? '') === nom,
      )
      .pop()!;

  const plusCher = () =>
    [...devisAttendu().lignes].sort((a, b) => b.total - a.total)[0];

  it('le retire du total, et le prix suit', async () => {
    const t = await auTicket();
    const devis = devisAttendu();
    const cher = plusCher();
    act(() => ligne(t, cher.libelle).props.onPress());
    const attendu = (devis.total - cher.total).toFixed(2).replace('.', ',');
    expect(mots(t)).toContain(`${attendu} €`);
  });

  it('mais la ligne reste au ticket, barrée, avec son prix', async () => {
    /*
      Un article retire qu'on ne voit plus est un article qu'on croit oublie
      — c'est le reproche qu'on faisait deja aux luminaires. Et c'est son
      prix qu'on regarde pour decider de le remettre.
    */
    const t = await auTicket();
    const cher = plusCher();
    act(() => ligne(t, cher.libelle).props.onPress());
    const lus = mots(t);
    expect(lus).toContain(cher.libelle);
    expect(lus).toContain(`${cher.total.toFixed(2).replace('.', ',')} €`);
    expect(ligne(t, `${cher.libelle}, écarté du devis`)).toBeDefined();
  });

  it('et on remet tout d’un appui', async () => {
    const t = await auTicket();
    const devis = devisAttendu();
    act(() => ligne(t, plusCher().libelle).props.onPress());
    act(() => bouton(t, 'Tout remettre').props.onPress());
    expect(mots(t)).toContain(`${devis.total.toFixed(2).replace('.', ',')} €`);
  });

  it('et le bouton du plan annonce le MÊME prix que la page', async () => {
    /*
      Les deux lisent `chiffrerLePlan` avec la meme liste d'ecartes, rangee
      dans le magasin. Gardee dans l'ecran, elle aurait laisse le bouton
      chiffrer un devis que la page n'annonce plus.
    */
    const t = await auTicket();
    act(() => ligne(t, plusCher().libelle).props.onPress());
    const duBouton = chiffrerLePlan(
      MURS,
      ROOMS as never,
      APPAREILS,
      [],
      GAMMES[0].id,
      new Set(useScanStore.getState().devisEcartes),
    ).total;
    expect(mots(t)).toContain(`${duBouton.toFixed(2).replace('.', ',')} €`);
  });
});
