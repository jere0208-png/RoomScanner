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
import { Path } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisPastille, prixCourt } from '../src/components/DevisPastille';
import { DevisScreen } from '../src/screens/DevisScreen';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { chiffrerLePlan } from '../src/geometry/devisplan';
import { postsSymbol, type Fixture, type FixtureKind } from '../src/geometry/electrical';
import { GAMMES } from '../src/geometry/prix';
import { photoDe } from '../src/ui/produits';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

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

const auTicket = () => {
  const t = ouvrir();
  act(() => bouton(t, 'Continuer').props.onPress());
  act(() => bouton(t, 'Voir le prix').props.onPress());
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

describe('les trois étapes', () => {
  it('se voient : un numéro, un rang, un gros titre', () => {
    // Relevé du patron : « fais des étapes modernes avec des gros titres et
    // numéros ». On doit savoir où l'on est sans compter.
    const lus = mots(ouvrir());
    expect(lus).toContain('1');
    expect(lus).toContain('ÉTAPE 1 SUR 3');
    expect(lus).toContain('Quel appareillage ?');
  });

  it('offrent les cinq gammes, Céliane et Mosaic en tête', () => {
    /*
      Relevé du patron : « mets le Legrand Céliane et Mosaic en premier, c'est
      les plus communs ». Une liste de choix se range par ce qu'on prend le
      plus souvent, pas par ce qu'elle coûte.
    */
    const lus = mots(ouvrir());
    for (const g of GAMMES) expect(lus).toContain(`${g.marque} ${g.nom}`);
    const rang = (nom: string) => lus.findIndex((m) => m.includes(nom));
    expect(rang('Céliane')).toBeLessThan(rang('dooxie'));
    expect(rang('Mosaic')).toBeLessThan(rang('dooxie'));
    expect(rang('Céliane')).toBeLessThan(rang('Mosaic'));
  });

  it('passent par ce qui n’est pas compté AVANT de donner le prix', () => {
    // L'ordre est la règle : le total ne s'affiche jamais à quelqu'un qui n'a
    // pas pu lire ce qu'il ne contient pas.
    const t = ouvrir();
    act(() => bouton(t, 'Continuer').props.onPress());
    const lus = mots(t).join(' ');
    expect(lus).toContain('ÉTAPE 2 SUR 3');
    expect(lus).toContain('Luminaires');
    expect(lus).not.toContain('TOTAL TTC');
  });

  it('et on revient sur son choix d’un appui sur le numéro', () => {
    const t = auTicket();
    act(() => bouton(t, 'Étape 1').props.onPress());
    expect(mots(t)).toContain('Quel appareillage ?');
  });

  it('mais on ne saute pas celle qu’on n’a pas lue', () => {
    // Le contrôle en sens inverse : l'étape des exclusions ne se contourne pas
    // par le fil.
    expect(bouton(ouvrir(), 'Étape 3').props.disabled).toBe(true);
  });
});

describe('le ticket de caisse', () => {
  it('porte une ligne par article, avec son compte et son prix', () => {
    const t = auTicket();
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

  it('et rien n’y est replié : un ticket qu’il faut déplier n’en est plus un', () => {
    /*
      La version d'avant repliait chaque rayon derriere un chevron. Sur un
      ticket, tout se lit d'un coup, du haut vers le bas — c'est ce qui fait
      qu'on n'a jamais eu besoin qu'on nous explique comment lire un ticket.
    */
    const t = auTicket();
    const chevrons = mots(t).filter((m) => m === '›');
    expect(chevrons).toEqual([]);
  });

  it('et se termine par le total, après le trait de découpe', () => {
    const t = auTicket();
    const lus = mots(t);
    const devis = devisAttendu();
    expect(lus).toContain('TOTAL TTC');
    expect(lus).toContain(`${devis.total.toFixed(2).replace('.', ',')} €`);
    // Le total vient APRÈS le dernier article : c'est la fin d'un ticket.
    expect(lus.indexOf('TOTAL TTC')).toBeGreaterThan(
      lus.indexOf(devis.lignes[0].libelle),
    );
  });

  it('et chaque rayon dit son sous-total', () => {
    const t = auTicket();
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
  it('portent la photo du produit quand on l’a', () => {
    /*
      Releve du patron : « une petite image avant son titre et son prix ». Les
      photos sont les packshots des fabricants, detoures et reduits ; voir
      `src/ui/produits.ts`.
    */
    const t = auTicket();
    const devis = devisAttendu();
    const avecPhoto = devis.lignes.filter((l) => photoDe(l.code));
    expect(avecPhoto.length).toBeGreaterThan(5);
    expect(t.root.findAllByType(Image).length).toBe(avecPhoto.length);
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

  it('et retombent sur le symbole du plan quand la photo manque', () => {
    /*
      Le controle en sens inverse : un article sans photo garde une image, et
      le ticket ne se troue pas. C'est aussi ce qui rend le catalogue de
      photos facultatif — on peut en ajouter une demain sans toucher a
      l'ecran.
    */
    const t = auTicket();
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

  it('et la légende du plan garde le symbole, pas la photo', () => {
    /*
      Sous le plan, ce qu'on cherche est de relier un chiffre a un DESSIN.
      Une photo n'y aiderait pas : elle ne ressemble pas au symbole.
    */
    const t = auTicket();
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

  it('et le plan du logement est bien là, en pied de ticket', () => {
    const t = auTicket();
    expect(t.root.findAllByType(FloorplanEditor).length).toBe(1);
    const lus = mots(t);
    expect(lus).toContain('D’où viennent ces quantités');
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

  it('la recherche ne garde que ce qu’on a demandé', () => {
    const t = auTicket();
    act(() => champ(t).props.onChangeText('disjoncteur'));
    const lus = mots(t);
    expect(lus.some((m) => m.startsWith('Disjoncteur'))).toBe(true);
    expect(lus.some((m) => m.startsWith('Conduit ICTA'))).toBe(false);
  });

  it('et elle se moque des accents, de la casse et des apostrophes', () => {
    // Personne ne tape « Boîte d'encastrement » avec son accent circonflexe.
    const t = auTicket();
    act(() => champ(t).props.onChangeText('BOITE D ENCASTREMENT'));
    expect(mots(t).some((m) => m.startsWith('Boîte d’encastrement'))).toBe(true);
  });

  it('et le dit quand rien ne correspond, au lieu de rendre une page vide', () => {
    const t = auTicket();
    act(() => champ(t).props.onChangeText('zzzz'));
    expect(mots(t).join(' ')).toContain('Aucun article ne correspond');
  });

  it('le tri par prix range du plus cher au moins cher', () => {
    const t = auTicket();
    act(() => bouton(t, 'Trier : Prix ↓').props.onPress());
    const lus = mots(t);
    const parPrix = [...devisAttendu().lignes]
      .filter((l) => l.pu !== null)
      .sort((a, b) => b.pu! * b.quantite - a.pu! * a.quantite);
    expect(lus.indexOf(parPrix[0].libelle)).toBeLessThan(
      lus.indexOf(parPrix[parPrix.length - 1].libelle),
    );
  });

  it('et le tri inverse fait exactement l’inverse', () => {
    // Le controle en sens inverse, au sens propre.
    const t = auTicket();
    act(() => bouton(t, 'Trier : Prix ↑').props.onPress());
    const lus = mots(t);
    const parPrix = [...devisAttendu().lignes]
      .filter((l) => l.pu !== null)
      .sort((a, b) => b.pu! * b.quantite - a.pu! * a.quantite);
    expect(lus.indexOf(parPrix[0].libelle)).toBeGreaterThan(
      lus.indexOf(parPrix[parPrix.length - 1].libelle),
    );
  });

  it('et le ticket s’aplatit dès qu’on ne suit plus le chariot', () => {
    /*
      Les rayons sont l'ordre dans lequel on remplit le chariot ; cet ordre
      n'a plus de sens quand on demande « le plus cher d'abord ». Un en-tete
      de rayon qui ne regrouperait plus rien serait un mensonge de mise en
      page.
    */
    const t = auTicket();
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

  it('le retire du total, et le prix suit', () => {
    const t = auTicket();
    const devis = devisAttendu();
    const cher = plusCher();
    act(() => ligne(t, cher.libelle).props.onPress());
    const attendu = (devis.total - cher.total).toFixed(2).replace('.', ',');
    expect(mots(t)).toContain(`${attendu} €`);
  });

  it('mais la ligne reste au ticket, barrée, avec son prix', () => {
    /*
      Un article retire qu'on ne voit plus est un article qu'on croit oublie
      — c'est le reproche qu'on faisait deja aux luminaires. Et c'est son
      prix qu'on regarde pour decider de le remettre.
    */
    const t = auTicket();
    const cher = plusCher();
    act(() => ligne(t, cher.libelle).props.onPress());
    const lus = mots(t);
    expect(lus).toContain(cher.libelle);
    expect(lus).toContain(`${cher.total.toFixed(2).replace('.', ',')} €`);
    expect(ligne(t, `${cher.libelle}, écarté du devis`)).toBeDefined();
  });

  it('et on remet tout d’un appui', () => {
    const t = auTicket();
    const devis = devisAttendu();
    act(() => ligne(t, plusCher().libelle).props.onPress());
    act(() => bouton(t, 'Tout remettre').props.onPress());
    expect(mots(t)).toContain(`${devis.total.toFixed(2).replace('.', ',')} €`);
  });

  it('et le bouton du plan annonce le MÊME prix que la page', () => {
    /*
      Les deux lisent `chiffrerLePlan` avec la meme liste d'ecartes, rangee
      dans le magasin. Gardee dans l'ecran, elle aurait laisse le bouton
      chiffrer un devis que la page n'annonce plus.
    */
    const t = auTicket();
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
