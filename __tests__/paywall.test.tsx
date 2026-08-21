/**
 * LA PAGE PRO ET LA PORTE D'ENTRÉE — ce que voit celui qui paie.
 *
 * On monte les deux écrans et on vérifie ce qui compte : la page annonce
 * l'offre et son prix, le code promo déverrouille, et l'accueil envoie au
 * paywall — pas au scan — quand le quota est épuisé.
 *
 * Le comparatif à deux colonnes qu'elle montrait est parti : le détail de
 * la page refondue vit dans `abonnement.test.tsx`. Ce qui reste ici, c'est
 * la parure d'or (badge, contour, typo) et les chemins qui mènent à
 * l'achat.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    cameraStatus: jest.fn(async () => 'granted'),
    start: jest.fn(async () => true),
    stop: jest.fn(async () => null),
    pause: jest.fn(),
    resume: jest.fn(),
    startHeading: jest.fn(async () => true),
    stopHeading: jest.fn(async () => true),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
}));
let mockMarqueur: { compte: string; plans: number } | null = null;
jest.mock('../src/native/account', () => ({
  lireMarqueur: jest.fn(async () => mockMarqueur),
  ecrireMarqueur: jest.fn(async (m: { compte: string; plans: number }) => {
    mockMarqueur = m;
  }),
  connexionApple: jest.fn(async () => ({ id: 'A1' })),
  acheterAbonnement: jest.fn(async () => true),
}));

import React from 'react';
import { Image, StyleSheet, Text, TextInput, type ViewStyle } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LinearGradient, Mask, Path, Stop, Text as SvgText } from 'react-native-svg';
import { PaywallScreen } from '../src/screens/PaywallScreen';
import { BadgePro } from '../src/components/BadgePro';
import { ContourVif, BLEUS, TexteVif } from '../src/components/ContourVif';
import { dark, light } from '../src/theme';
import { EssaiEpuise } from '../src/components/EssaiEpuise';
import { SurprisePro } from '../src/components/SurprisePro';
import { AvisRecompense } from '../src/components/AvisRecompense';
import { SOLAIRES } from '../src/ui/solaires';
import { SignInScreen } from '../src/screens/SignInScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ProfilScreen } from '../src/screens/ProfilScreen';
import { GlowButton } from '../src/components/GlowButton';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';

beforeEach(() => {
  jest.useFakeTimers();
  mockMarqueur = null;
  useAccountStore.setState({
    charge: true,
    compte: { id: 'email:x@y.fr', methode: 'email' },
    pro: false,
    proVia: null,
    plansUtilises: 0,
    paywallVisible: true,
    essaiEpuiseVisible: false,
  });
  useScanStore.setState({ screen: 'home', supported: true, saves: [], brouillon: null });
});
afterEach(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (el: React.ReactElement) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(el);
  });
  arbre = t;
  return t;
};

const textesDe = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

/** Le nœud pressable qui porte ce libellé d'accessibilité. */
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll(
    (n) => n.props.accessibilityLabel === label && !!n.props.onPress,
  )[0];

describe('la page Pro', () => {
  /*
    LE COMPARATIF EST PARTI, L'OFFRE EST RESTÉE.

    La page mettait deux colonnes côte à côte — « Gratuit » contre « Pro »,
    chacune son pouce d'argile — et la moitié de l'écran servait donc à
    rappeler ce que l'utilisateur a DÉJÀ, juste à l'endroit où il décide.
    Un comparatif se défend entre deux formules à choisir ; il n'y en a
    qu'une à vendre. Le design donné par le patron n'en a pas.

    Ce qui compte est resté et se tient ici : le prix se lit tout de suite,
    et l'offre s'ÉNUMÈRE. Le détail de la nouvelle page — facturation,
    liste, bouton épinglé — vit dans `abonnement.test.tsx`.
  */
  it('annonce l’offre et son prix, sans comparatif', () => {
    const vu = textesDe(monter(<PaywallScreen />));
    expect(vu).toContain('Pro');
    expect(vu).toContain('4,90 €');
    expect(vu).toContain('Relevés illimités');
    // Plus de colonne « Gratuit » : on ne vend pas ce que l'utilisateur
    // possède déjà, et on ne lui prend pas la moitié de l'écran pour le
    // lui rappeler.
    expect(vu).not.toContain('Gratuit');
    expect(vu).not.toContain('1 relevé complet');
  });

  it('le code CARIDI12 déverrouille et ferme la page', () => {
    const t = monter(<PaywallScreen />);
    // LE CODE PROMO A QUITTÉ LE FIL DE LA PAGE — relevé du patron :
    // « tout doit être visible sans scroll ». Le champ poussait le prix
    // hors de l'écran pour un geste qu'on ne fait qu'une fois ; il vit
    // maintenant dans une feuille, appelée par « J'ai un code ».
    act(() => {
      bouton(t, 'J’ai un code').props.onPress();
    });
    act(() => {
      t.root.findByType(TextInput).props.onChangeText('CARIDI12');
    });
    act(() => {
      bouton(t, 'Appliquer le code').props.onPress();
    });
    expect(useAccountStore.getState().pro).toBe(true);
    expect(useAccountStore.getState().paywallVisible).toBe(false);
  });

  it('un mauvais code laisse tout verrouillé', () => {
    const t = monter(<PaywallScreen />);
    act(() => {
      bouton(t, 'J’ai un code').props.onPress();
    });
    act(() => {
      t.root.findByType(TextInput).props.onChangeText('RIEN');
    });
    act(() => {
      bouton(t, 'Appliquer le code').props.onPress();
    });
    expect(useAccountStore.getState().pro).toBe(false);
  });
});

/*
 * LE BADGE PRO — blanc, cerné et lettré d'un or qui respire.
 *
 * L'ancien badge était un bloc noir à texte jaune : un aplat, posé sur la
 * seule carte qu'on vend. Le nouveau est BLANC, et une même bande d'ors
 * glisse derrière lui : elle se voit dans le contour et dans les lettres —
 * un couvercle blanc troué au masque en forme de « PRO » —, si bien que les
 * deux respirent ensemble, par construction. Le dégradé est LONG (plusieurs
 * badges de large) : à tout instant il est presque uni, et c'est le
 * mouvement qu'on sent, pas les couleurs qu'on compte.
 */
describe('le badge Pro', () => {
  const leBadge = () => monter(<PaywallScreen />).root.findByType(BadgePro);

  it('est blanc — plus aucun bloc noir sur la page', () => {
    const t = monter(<PaywallScreen />);
    expect(t.root.findAllByType(BadgePro)).toHaveLength(1);
    const noirs = t.root.findAll((n) => {
      const st = StyleSheet.flatten(n.props.style) as ViewStyle | undefined;
      return st?.backgroundColor === '#0B0D12';
    });
    expect(noirs).toHaveLength(0);
    // Le couvercle du badge est blanc : c'est lui, le bloc arrière.
    const badge = t.root.findByType(BadgePro);
    expect(
      badge.findAll((n) => n.props.fill === '#FFFFFF').length,
    ).toBeGreaterThan(0);
  });

  it('une VUE glisse, au pilote natif — la leçon du ruban', () => {
    // Le pilote natif ignore les attributs d'un dessin : seule une
    // transformation animée sur une vue garantit le mouvement.
    const animees = leBadge().findAll((n) => {
      const st = StyleSheet.flatten(n.props.style) as ViewStyle | undefined;
      if (!st || !Array.isArray(st.transform)) return false;
      const tx = (st.transform as Record<string, unknown>[]).find(
        (x) => 'translateX' in x,
      );
      return !!tx && typeof tx.translateX === 'object';
    });
    expect(animees.length).toBeGreaterThan(0);
  });

  it('le dégradé est long, monotone, et boucle sans couture', () => {
    const badge = leBadge();
    const stops = badge
      .findAllByType(Stop)
      .map((n) => String(n.props.stopColor));
    expect(stops.length).toBeGreaterThanOrEqual(3);
    // La couture : la bande se répète — dernier arrêt = premier, sinon la
    // boucle saute d'une couleur à chaque tour.
    expect(stops[0]).toBe(stops[stops.length - 1]);
    /*
      MONOTONE, ET DÉSORMAIS BLEU.

      L'assertion tenait la famille CHAUDE (R > V > B) : c'était l'or. Le
      patron a tranché — « change le doré en bleu vivant » —, et l'or était
      de toute façon le seul endroit de l'application à parler une autre
      langue que le bleu de la marque. La propriété qu'on tient est la même
      dans son esprit : une seule famille, pas un arc-en-ciel. Elle a juste
      changé de côté du cercle chromatique.
    */
    for (const teinte of stops) {
      const [r, v, b] = [1, 3, 5].map((i) =>
        parseInt(teinte.slice(i, i + 2), 16),
      );
      expect({ teinte, bleu: b > v && v > r }).toEqual({ teinte, bleu: true });
    }
    /*
      ET LES TEINTES SONT PROCHES — relevé du patron : « on ne doit pas
      voir clairement l'animation, mais on doit voir que ça vit ». Un écart
      franc entre les arrêts donnerait une vague qu'on REGARDE ; l'écart de
      bleu reste donc mesuré, et la bande presque unie à tout instant.
    */
    const bleus = stops.map((t) => parseInt(t.slice(5, 7), 16));
    expect(Math.max(...bleus) - Math.min(...bleus)).toBeLessThanOrEqual(60);
    // Long : la bande qui glisse fait plusieurs badges de large — c'est ce
    // qui rend le dégradé presque uni à tout instant.
    const bandes = badge.findAll((n) => {
      const st = StyleSheet.flatten(n.props.style) as ViewStyle | undefined;
      return typeof st?.width === 'number' && st.width >= 138;
    });
    expect(bandes.length).toBeGreaterThan(0);
  });

  /*
   * LE CONTOUR D'OR GAGNE LA CARTE ET LE BOUTON.
   *
   * Relevé du patron : « même contour que le badge, sur le bloc de la
   * comparaison Pro et le bouton pour s'abonner ». Les trois boivent à la
   * MÊME source (`ContourVif` exporte la famille de bleus que le badge
   * emprunte) : trois dégradés réglés à la main finiraient par diverger à
   * la première retouche.
   */
  it('la carte Pro et le bouton d’abonnement portent le même contour', () => {
    const t = monter(<PaywallScreen />);
    const contours = t.root.findAllByType(ContourVif);
    // La carte du comparatif, et le bouton « S'abonner ».
    expect(contours).toHaveLength(2);
    for (const contour of contours) {
      // La bande ne se dessine qu'une fois la taille connue : on la donne.
      const porteur = contour.findAll(
        (n) => typeof n.props?.onLayout === 'function',
      )[0];
      act(() =>
        porteur.props.onLayout({
          nativeEvent: { layout: { width: 300, height: 100 } },
        }),
      );
      // Même famille de bleus que le badge, arrêt pour arrêt.
      const stops = contour
        .findAllByType(Stop)
        .map((n) => String(n.props.stopColor));
      expect(stops).toEqual([...BLEUS]);
      // Et c'est une VUE qui glisse, au pilote natif — comme le badge.
      const animees = contour.findAll((n) => {
        const st = StyleSheet.flatten(n.props.style) as ViewStyle | undefined;
        if (!st || !Array.isArray(st.transform)) return false;
        const tx = (st.transform as Record<string, unknown>[]).find(
          (x) => 'translateX' in x,
        );
        return !!tx && typeof tx.translateX === 'object';
      });
      expect(animees.length).toBeGreaterThan(0);
      // La bande est LONGUE : plusieurs blocs de large.
      const bandes = contour.findAll((n) => {
        const st = StyleSheet.flatten(n.props.style) as ViewStyle | undefined;
        return typeof st?.width === 'number' && st.width >= 300 * 3;
      });
      expect(bandes.length).toBeGreaterThan(0);
    }
    // Le badge emprunte la même famille : une seule source pour les trois.
    const badge = t.root.findByType(BadgePro);
    expect(
      badge.findAllByType(Stop).map((n) => String(n.props.stopColor)),
    ).toEqual([...BLEUS]);
  });

  /*
   * LE BLOC EST BLANC, ET SA TYPO RESPIRE COMME LE BADGE.
   *
   * Relevé du patron : « mettre le bloc en blanc et typo animation comme
   * le badge pro ». La carte du comparatif et le bouton d'abonnement
   * prennent la peau exacte du badge : couvercle BLANC, et les mots qui
   * vendent — « Pro », le prix, « S'abonner » — trouées au masque sur la
   * même bande d'ors qui glisse.
   */
  it('le bloc Pro et le bouton sont blancs, à la typo d’or qui respire', () => {
    const t = monter(<PaywallScreen />);
    // Les deux contours couvrent BLANC — plus de bleu plein.
    const contours = t.root.findAllByType(ContourVif);
    expect(contours).toHaveLength(2);
    for (const contour of contours) {
      expect(contour.props.fond).toBe('#FFFFFF');
    }
    // Le titre en or, lui, est pose sur le FOND de la page et non sur une
    // carte : il couvre de ce fond-la. Un couvercle blanc sur le gris de
    // l'ecran decouperait un pave clair autour des lettres.
    const surFond = t.root
      .findAllByType(TexteVif)
      .filter((n) => n.props.fond === light.bg);
    expect(surFond.length).toBeGreaterThan(0);
    // La typo d'or : « Pro », le prix, « S'abonner… » au moins.
    const typos = t.root.findAllByType(TexteVif);
    expect(typos.length).toBeGreaterThanOrEqual(3);
    const libelles = typos.map((n) => String(n.props.texte));
    // La page nomme la MARQUE entiere — « EchoPlan Pro » — la ou la carte
    // du comparatif ecrivait « Pro » tout seul en tete de colonne : le
    // titre est devenu la promesse, il n'y a plus de colonne a etiqueter.
    expect(libelles.some((l) => l.includes('Pro'))).toBe(true);
    expect(libelles.some((l) => l.includes('S’abonner'))).toBe(true);
    for (const typo of typos) {
      // Le mot se mesure d'abord (une typo a la taille de son texte) : on
      // donne la mesure, comme le téléphone le ferait.
      const mesure = typo.findAll(
        (n) => typeof n.props?.onLayout === 'function',
      )[0];
      act(() =>
        mesure.props.onLayout({
          nativeEvent: { layout: { width: 120, height: 24 } },
        }),
      );
      // Même famille de bleus, arrêt pour arrêt, et le mot est la TROUÉE du
      // masque — la recette exacte du badge.
      const stops = typo
        .findAllByType(Stop)
        .map((n) => String(n.props.stopColor));
      expect(stops).toEqual([...BLEUS]);
      const masques = typo.findAllByType(Mask);
      expect(masques).toHaveLength(1);
      const lettres = masques[0].findAllByType(SvgText);
      expect(lettres).toHaveLength(1);
      expect(lettres[0].props.children).toBe(typo.props.texte);
      expect(lettres[0].props.fill).toBe('#000000');
    }
  });

  it('les lettres et le contour boivent au même dégradé', () => {
    const badge = leBadge();
    // UNE seule définition de dégradé : contour et lettres ne peuvent pas
    // diverger, c'est la construction qui le garantit.
    expect(badge.findAllByType(LinearGradient)).toHaveLength(1);
    const masques = badge.findAllByType(Mask);
    expect(masques).toHaveLength(1);
    const lettres = masques[0].findAllByType(SvgText);
    expect(lettres).toHaveLength(1);
    expect(lettres[0].props.children).toBe('PRO');
    // Le noir du masque, c'est la trouée : les lettres laissent voir la
    // bande qui glisse dessous.
    expect(lettres[0].props.fill).toBe('#000000');
  });
});

describe('la porte d’entrée', () => {
  it('propose Apple, Google et l’e-mail', () => {
    useAccountStore.setState({ compte: null });
    const t = monter(<SignInScreen />);
    expect(bouton(t, 'Continuer avec Apple')).toBeTruthy();
    expect(bouton(t, 'Continuer avec Google')).toBeTruthy();
    expect(bouton(t, 'Continuer avec un e-mail')).toBeTruthy();
    // Et elle annonce la règle du jeu : un compte par téléphone.
    expect(textesDe(t)).toContain('Un seul compte par téléphone');
  });
});

describe('l’accueil et le quota', () => {
  /*
    LA SURPRISE À LA PLACE DE LA PORTE — relevé du patron. Quand l'essai
    est épuisé et qu'on relance un scan, on ne tombait que sur la page
    Pro ; on tombe maintenant sur le popup « Surprise ! » et son −20 %,
    qui TEND la page Pro avec le code déjà rempli. Le scan, lui, ne part
    toujours pas : le palier s'arrête AVANT le scan, pas après.
  */
  it('ouvre la surprise — pas le scan ni la page Pro — quand le plan gratuit est consommé', () => {
    useAccountStore.setState({
      plansUtilises: 1,
      paywallVisible: false,
      surpriseVisible: false,
    });
    const t = monter(<HomeScreen />);
    const cta = t.root
      .findAllByType(GlowButton)
      .find((n) => n.props.accessibilityLabel === 'Commencer le scan')!;
    act(() => {
      cta.props.onPress();
    });
    expect(useAccountStore.getState().surpriseVisible).toBe(true);
    expect(useAccountStore.getState().paywallVisible).toBe(false);
    expect(useScanStore.getState().screen).toBe('home');
  });

  it('laisse passer le premier scan, et un Pro sans limite', () => {
    useAccountStore.setState({ paywallVisible: false });
    const t = monter(<HomeScreen />);
    const cta = t.root
      .findAllByType(GlowButton)
      .find((n) => n.props.accessibilityLabel === 'Commencer le scan')!;
    act(() => {
      cta.props.onPress();
    });
    expect(useAccountStore.getState().paywallVisible).toBe(false);
  });
});

describe('ce que l’essai adversarial a exigé', () => {
  it('la page Pro offre « Restaurer l’achat »', () => {
    const t = monter(<PaywallScreen />);
    expect(bouton(t, 'Restaurer l’achat')).toBeTruthy();
  });

  it('l’accueil porte le compte : on peut en sortir, et payer sans y être forcé', () => {
    useAccountStore.setState({ paywallVisible: false });
    const t = monter(<HomeScreen />);
    expect(bouton(t, 'Mon compte')).toBeTruthy();
  });
});

/*
 * LA SURPRISE DE BIENVENUE — le cadeau qui tend la page Pro.
 *
 * Relevé du patron : un popup « Surprise ! » avec le cadeau 3D, −20 % sur
 * le Pro pour la première souscription (code FIRST20), qui se lève à la
 * PREMIÈRE inscription et quand l'essai épuisé bloque un nouveau scan. Le
 * clic applique le code TOUT SEUL : personne ne recopie un code depuis un
 * popup fermé.
 */
describe('la surprise Pro', () => {
  it('se lève à la première inscription, pas à la reconnexion', async () => {
    useAccountStore.setState({
      compte: null,
      surpriseVisible: false,
      essaiEpuiseVisible: false,
    });
    mockMarqueur = null;
    await act(async () => {
      await useAccountStore
        .getState()
        .connecter({ id: 'email:a@b.fr', methode: 'email' });
    });
    expect(useAccountStore.getState().surpriseVisible).toBe(true);
    // Refermée, puis reconnexion du même compte : le trousseau connaît
    // déjà cet appareil, la surprise ne se rejoue pas.
    act(() => useAccountStore.getState().fermerSurprise());
    await act(async () => {
      await useAccountStore
        .getState()
        .connecter({ id: 'email:a@b.fr', methode: 'email' });
    });
    expect(useAccountStore.getState().surpriseVisible).toBe(false);
  });

  /*
   * LE POPUP SE LIT D'UN COUP D'ŒIL — relevé du patron, capture à
   * l'appui : « trop de chiffres, les phrases sont cassées, l'ensemble ne
   * donne pas envie de lire ». Trois prix dans une phrase coupée et un
   * code dans le bouton, ça se COMPTE : le popup ne porte plus qu'UN
   * nombre — le « −20 % » en héros doré — et des mots courts. Les prix,
   * c'est la page Pro qui les montre, ancien barré à l'appui.
   */
  it('montre le cadeau, « Surprise ! », et UN seul nombre : −20 %', () => {
    useAccountStore.setState({ surpriseVisible: true });
    const t = monter(<SurprisePro />);
    expect(t.root.findAllByType(Image).length).toBeGreaterThanOrEqual(1);
    const vu = textesDe(t);
    expect(vu).toContain('Surprise');
    expect(vu).toContain('20');
    // Le seul groupe de chiffres de tout le popup : « 20 ». Ni 3,92,
    // ni 4,90, ni FIRST20.
    expect(vu.match(/\d+/g)).toEqual(['20']);
    expect(bouton(t, 'Plus tard')).toBeDefined();
  });

  it('un clic applique FIRST20 tout seul et ouvre la page Pro remisée', () => {
    useAccountStore.setState({ surpriseVisible: true, paywallVisible: false });
    const t = monter(<SurprisePro />);
    act(() => {
      bouton(t, 'J’en profite')!.props.onPress();
    });
    const s = useAccountStore.getState();
    expect(s.surpriseVisible).toBe(false);
    expect(s.paywallVisible).toBe(true);
    expect(s.remisePct).toBe(20);
    // Une remise n'est PAS un déverrouillage : le Pro reste à acheter.
    expect(s.pro).toBe(false);
    // La page Pro arrive avec le code déjà dans son champ, et le prix
    // remisé écrit sur le bouton.
    const p = monter(<PaywallScreen />);
    // Le code offert attend DANS la feuille, déjà écrit : il ne reste qu'à
    // l'ouvrir et à appuyer.
    act(() => {
      bouton(p, 'J’ai un code').props.onPress();
    });
    expect(p.root.findByType(TextInput).props.value).toBe('FIRST20');
    const typos = p.root
      .findAllByType(TexteVif)
      .map((n) => String(n.props.texte));
    expect(typos.some((x) => x.includes('3,92'))).toBe(true);
    /*
      LA ZONE D'ABONNEMENT SE LIT COMME UNE PHRASE — relevé du patron :
      « trop de chiffres et de tirets ». Le bouton dit « S'abonner pour
      3,92 € par mois » (zéro tiret), et la note n'a plus ni code ni
      chiffre : la remise se voit déjà sur le prix barré de la carte.
    */
    expect(typos.some((x) => x.includes('S’abonner pour'))).toBe(true);
    expect(typos.some((x) => x.includes('—'))).toBe(false);
    const vuPaywall = textesDe(p);
    expect(vuPaywall).toContain('Remise de bienvenue appliquée');
    expect(vuPaywall).not.toContain('FIRST20');
  });

  it('FIRST20 remise sans déverrouiller ; CARIDI12 déverrouille toujours', () => {
    useAccountStore.setState({ paywallVisible: true, remisePct: 0 });
    expect(useAccountStore.getState().utiliserCode('first20')).toBe(true);
    let s = useAccountStore.getState();
    expect(s.remisePct).toBe(20);
    expect(s.pro).toBe(false);
    // La page Pro RESTE ouverte : c'est là qu'on voit la remise.
    expect(s.paywallVisible).toBe(true);
    expect(useAccountStore.getState().utiliserCode('CARIDI12')).toBe(true);
    s = useAccountStore.getState();
    expect(s.pro).toBe(true);
    expect(s.paywallVisible).toBe(false);
  });

  /*
   * LES DEUX CARTES SONT DEVENUES UNE — et les pouces sont partis avec.
   *
   * Ce banc tenait l'alignement d'un COMPARATIF : la carte Gratuit et la
   * carte Pro côte à côte, même rayon, même largeur, leurs deux pouces
   * d'argile alignés à un trait près. Chaque contrainte y avait sa raison,
   * et toutes tombent ensemble avec le comparatif : il n'y a plus qu'une
   * carte, elle prend toute la largeur, et rien en face de quoi s'aligner.
   *
   * Ce qui reste vrai, et qui est vérifié ici : la carte qu'on VEND porte
   * le contour d'or — la peau du badge et du bouton — et elle occupe la
   * largeur entière, comme dans le design donné par le patron.
   */
  it('ne montre qu’une carte, pleine largeur, cerclée d’or', () => {
    const t = monter(<PaywallScreen />);
    // La carte et le bouton : deux contours, pas trois — il n'y a plus de
    // colonne Gratuit à border.
    const contours = t.root.findAllByType(ContourVif);
    expect(contours).toHaveLength(2);
    const stCarte = StyleSheet.flatten(contours[0].props.style) as ViewStyle;
    expect(stCarte.alignSelf).toBe('stretch');
    // Et les pouces d'argile ont disparu avec la comparaison : un pouce
    // levé n'a de sens qu'en face d'un pouce baissé.
    expect(t.root.findAll((n) => n.props?.testID === 'pouce-pro')).toHaveLength(
      0,
    );
    expect(
      t.root.findAll((n) => n.props?.testID === 'pouce-gratuit'),
    ).toHaveLength(0);
    // Ce qui les remplace dit ce qu'on achète, ligne par ligne.
    expect(
      t.root.findAll((n) => n.props?.testID === 'ligne-atout').length,
    ).toBeGreaterThanOrEqual(5);
  });

  /*
   * EN THÈME NUIT, LES BLOCS PRO SUIVENT LA NUIT.
   *
   * Relevé du patron : la carte Pro et le bouton d'achat restaient BLANCS
   * sur le fond sombre — deux dalles éblouissantes. Ils prennent la
   * surface du thème, et le contour d'or reste : c'est lui, la signature.
   */
  it('assombrit la carte Pro et le bouton en thème nuit', () => {
    useScanStore.setState({ themePref: 'dark' });
    const t = monter(<PaywallScreen />);
    for (const contour of t.root.findAllByType(ContourVif)) {
      expect(contour.props.fond).toBe(dark.surface);
    }
    /*
      ET CHAQUE MOT D'OR COUVRE DU FOND SUR LEQUEL IL EST POSÉ.

      La règle n'a pas changé — un couvercle clair sur une carte sombre
      découperait des pavés autour des lettres — mais la typo d'or ne vit
      plus seulement sur la carte : le titre de la page est posé sur le
      FOND. Chaque mot doit donc couvrir de SA surface, et il n'y a plus
      une seule bonne réponse pour toute la page.
    */
    for (const typo of t.root.findAllByType(TexteVif)) {
      expect([dark.surface, dark.bg]).toContain(typo.props.fond);
    }
    useScanStore.setState({ themePref: 'light' });
  });
});

/*
 * L'AVIS CONTRE UN ESSAI — l'offre de la dernière chance.
 *
 * Relevé du patron : refuser l'offre de réduction propose de laisser un
 * avis App Store, contre UN relevé supplémentaire. ATTENTION revue Apple :
 * récompenser un avis est contraire aux règles (avis incités) — le patron
 * est prévenu, l'app assume en attendant la soumission.
 */
describe('l’avis contre un essai', () => {
  it('refuser la surprise, essai épuisé, propose l’avis — pas avant', () => {
    useAccountStore.setState({
      surpriseVisible: true,
      avisVisible: false,
      avisDonne: false,
      plansUtilises: 1,
      pro: false,
    });
    act(() => useAccountStore.getState().fermerSurprise());
    expect(useAccountStore.getState().avisVisible).toBe(true);
    // À la première inscription, l'essai est encore là : pas d'avis à
    // acheter, on laisse l'utilisateur découvrir l'app.
    useAccountStore.setState({
      surpriseVisible: true,
      avisVisible: false,
      plansUtilises: 0,
    });
    act(() => useAccountStore.getState().fermerSurprise());
    expect(useAccountStore.getState().avisVisible).toBe(false);
  });

  it('l’avis débloque UN essai, une seule fois', () => {
    useAccountStore.setState({
      avisVisible: true,
      avisDonne: false,
      bonusEssais: 0,
      plansUtilises: 1,
      pro: false,
    });
    expect(useAccountStore.getState().peutCreerPlan()).toBe(false);
    act(() => useAccountStore.getState().donnerAvis());
    const s = useAccountStore.getState();
    expect(s.avisVisible).toBe(false);
    expect(s.avisDonne).toBe(true);
    expect(s.bonusEssais).toBe(1);
    expect(s.peutCreerPlan()).toBe(true);
    // L'essai bonus consommé, refuser à nouveau ne rejoue rien : un avis
    // ne se laisse qu'une fois.
    useAccountStore.setState({ surpriseVisible: true, plansUtilises: 2 });
    act(() => useAccountStore.getState().fermerSurprise());
    expect(useAccountStore.getState().avisVisible).toBe(false);
  });

  it('montre cinq étoiles d’or et les deux gestes', () => {
    useAccountStore.setState({ avisVisible: true });
    const t = monter(<AvisRecompense />);
    const etoiles = t.root
      .findAllByType(Path)
      .filter((n) => n.props.d === SOLAIRES.etoile);
    expect(etoiles).toHaveLength(5);
    expect(bouton(t, 'Laisser un avis')).toBeDefined();
    expect(bouton(t, 'Plus tard')).toBeDefined();
  });
});

/*
 * LE MENU DU COMPTE — blanc et bleu, à nous, plus la feuille grise du
 * système. Relevé du patron : « le menu utilisateur est trop basique ».
 * L'Alert d'iOS devient une carte EchoPlan : avatar, nom, état du palier,
 * gestes en boutons pleins — et une CROIX dessinée en haut à droite (la
 * leçon des caractères), le voile refermant lui aussi.
 */
/*
 * LE MENU DU COMPTE A CHANGÉ DE NATURE — et de porte.
 *
 * Il s'ouvrait depuis l'accueil et portait tout le compte : avatar, nom,
 * état du palier, « Passer en Pro », déconnexion, suppression. C'était le
 * SEUL endroit où le compte existait, alors il ramassait tout — et une
 * carte de trois boutons ne pouvait porter ni l'abonnement, ni l'apparence,
 * ni les réglages.
 *
 * Le compte a maintenant une PAGE (`profil.test.tsx`) : l'identité, l'offre
 * et l'apparence y vivent en grand. Il ne reste au menu que ce qu'un « ⋯ »
 * doit contenir — les deux gestes qu'on ne pose pas par mégarde. Répéter
 * ici le nom et la parure d'or ferait un doublon de la page qu'on vient
 * d'ouvrir ; c'est pourquoi le banc de la parure a disparu avec elle, et
 * l'or se voit désormais sur le grand avatar de la page.
 */
describe('le menu des trois points', () => {
  it('ne garde que la déconnexion et la suppression', () => {
    useAccountStore.setState({
      paywallVisible: false,
      pro: false,
      compte: { id: 'email:j@c.fr', prenom: 'Jérémy', methode: 'email' },
    });
    const t = monter(<ProfilScreen />);
    // Fermé, il ne montre rien : c'est un menu, pas une section.
    expect(bouton(t, 'Se déconnecter')).toBeUndefined();
    act(() => bouton(t, 'Plus d’options')!.props.onPress());
    expect(bouton(t, 'Se déconnecter')).toBeDefined();
    expect(bouton(t, 'Supprimer mon compte')).toBeDefined();
    // L'offre, elle, se prend sur la PAGE — en carte, avec l'état du
    // palier écrit à côté. Un menu caché n'est pas un endroit pour vendre.
    expect(bouton(t, 'Passer en Pro / code promo')).toBeUndefined();
    expect(bouton(t, 'Voir l’offre Pro')).toBeDefined();
  });

  it('le voile referme, comme partout', () => {
    useAccountStore.setState({
      paywallVisible: false,
      compte: { id: 'email:j@c.fr', prenom: 'Jérémy', methode: 'email' },
    });
    const t = monter(<ProfilScreen />);
    act(() => bouton(t, 'Plus d’options')!.props.onPress());
    const voile = t.root.findAll(
      (n) =>
        n.props?.testID === 'voile-compte' &&
        typeof n.props?.onPress === 'function',
    )[0];
    expect(voile).toBeDefined();
    act(() => voile.props.onPress());
    expect(bouton(t, 'Se déconnecter')).toBeUndefined();
  });
});

describe('le popup « essai déjà utilisé »', () => {
  it('annonce l’essai consommé et ouvre la page Pro', () => {
    useAccountStore.setState({ essaiEpuiseVisible: true, paywallVisible: false });
    const t = monter(<EssaiEpuise />);
    expect(textesDe(t)).toContain('essai gratuit');
    act(() => {
      bouton(t, 'Passer en Pro').props.onPress();
    });
    const s = useAccountStore.getState();
    expect(s.essaiEpuiseVisible).toBe(false);
    expect(s.paywallVisible).toBe(true);
  });

  it('« Plus tard » referme sans rien vendre', () => {
    useAccountStore.setState({ essaiEpuiseVisible: true, paywallVisible: false });
    const t = monter(<EssaiEpuise />);
    act(() => {
      bouton(t, 'Plus tard').props.onPress();
    });
    expect(useAccountStore.getState().essaiEpuiseVisible).toBe(false);
    expect(useAccountStore.getState().paywallVisible).toBe(false);
  });
});
