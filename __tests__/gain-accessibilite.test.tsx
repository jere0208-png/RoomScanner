/**
 * GAINS RAPIDES — ACCESSIBILITÉ.
 *
 * Dix améliorations relevées par les revues « Accessibilité », « UX iOS » et
 * « Performance », une épreuve (au moins) par comportement :
 *
 *   1. les mots d'alerte en ambre, vert ou rouge tiennent 4,5:1 ;
 *   2. les pastilles s'enfoncent sous le doigt, et un calque qui bascule vibre ;
 *   3. « Réduire les animations » coupe les boucles et les glissements ;
 *   4. les mots de l'habillage du plan sont plafonnés aux gros caractères,
 *      avec la loupe d'iOS ;
 *   5. la barre de défilement revient là où une liste dépasse ;
 *   6. VoiceOver annonce ce qui apparaît tout seul ;
 *   7. la suppression d'un plan laisse 12 s avec VoiceOver, et y pose le curseur ;
 *   8. le geste « retour » de VoiceOver ferme les feuilles ;
 *   9. des libellés qui disent ce qu'on voit ;
 *  10. des boutons de pièce, dans la visite, à la taille d'un doigt.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { AccessibilityInfo, Animated, NativeModules, StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { dark, light, PLAFOND_BARRE } from '../src/theme';
import { ToolPill, PillSlot } from '../src/components/ToolPill';
import { Presse, PRESSE_ECHELLE, stylePresse } from '../src/components/Presse';
import { resetHaptics } from '../src/ui/haptic';
import { useReduceMotion } from '../src/ui/useReduceMotion';
import { ControlePastille } from '../src/components/ControlePastille';
import { Scene } from '../src/components/Scene';
import { annoncer, oublierAnnonces, useLecteurDEcran } from '../src/ui/annoncer';
import { useBulle } from '../src/ui/bulle';
import {
  BandeauAnnuler,
  DELAI_ANNULER,
  DELAI_ANNULER_LECTEUR,
  useSuppressionDifferee,
} from '../src/components/BandeauAnnuler';
import { SheetShell } from '../src/components/Sheet';
import { libelleDeMesure } from '../src/screens/ResultScreen';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { useScanStore } from '../src/store/scanStore';
import {
  hauteurColonnePieces,
  PIECE_DEBORD,
  PIECE_ECART,
  PIECE_H,
} from '../src/components/Exploration';

const A11y = AccessibilityInfo as unknown as {
  isReduceMotionEnabled: jest.Mock;
  isScreenReaderEnabled: jest.Mock;
  announceForAccessibilityWithOptions: jest.Mock;
  sendAccessibilityEvent: jest.Mock;
};

const RACINE = path.join(__dirname, '..', 'src');
function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Le rapport de contraste WCAG entre deux couleurs « #RRGGBB ». */
function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) =>
      x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Monte un composant qui lit les réglages : les caches de module suivent. */
async function amorcer(reduit: boolean, lecteur: boolean) {
  A11y.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(reduit));
  A11y.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(lecteur));
  function Lecteur() {
    useReduceMotion();
    useLecteurDEcran();
    return null;
  }
  let t!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    t = TestRenderer.create(<Lecteur />);
  });
  await act(async () => {});
  act(() => t.unmount());
}

afterEach(async () => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  await amorcer(false, false);
  A11y.announceForAccessibilityWithOptions.mockClear();
  A11y.sendAccessibilityEvent.mockClear();
  oublierAnnonces();
});

describe('1. les mots d’alerte se lisent', () => {
  it('ambre, vert et rouge « texte » tiennent 4,5:1 sur les fonds de lecture', () => {
    for (const teinte of [light.ambreTexte, light.vertTexte, light.dangerTexte]) {
      for (const fond of [light.surface, light.bg, light.surfaceSunken]) {
        expect({ teinte, fond, ok: contraste(teinte, fond) >= 4.5 }).toEqual({ teinte, fond, ok: true });
      }
    }
    for (const teinte of [dark.ambreTexte, dark.vertTexte, dark.dangerTexte]) {
      for (const fond of [dark.surface, dark.bg, dark.surfaceSunken]) {
        expect({ teinte, fond, ok: contraste(teinte, fond) >= 4.5 }).toEqual({ teinte, fond, ok: true });
      }
    }
    // Et c'était bien le défaut : l'ambre de pastille fait à peine 2:1.
    expect(contraste(light.amber, light.surface)).toBeLessThan(3);
  });

  it('plus aucun mot ne s’écrit dans la teinte de pastille', () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const src = fs.readFileSync(f, 'utf8');
      src.split('\n').forEach((l, i) => {
        if (/(?<![a-zA-Z])color: *\w+\.(amber|green|danger)\b/.test(l)) fautifs.push(`${path.basename(f)}:${i + 1}`);
      });
    }
    expect(fautifs).toEqual([]);
  });
});

describe('2. le même retour au toucher', () => {
  beforeEach(() => {
    (NativeModules as Record<string, unknown>).RoomScanHaptics = { tap: jest.fn() };
    resetHaptics();
  });
  const tap = () => (NativeModules as { RoomScanHaptics: { tap: jest.Mock } }).RoomScanHaptics.tap;

  it('la pastille d’outil s’enfonce sous le doigt (Presse, pas TouchableOpacity)', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ToolPill icon="ruler" label="Dimensions" active={false} onPress={() => {}} />);
    });
    const touche = t.root.findByType(Presse);
    const pressable = touche.findAll((n) => typeof n.props.style === 'function')[0];
    const enfoncee = StyleSheet.flatten(pressable.props.style({ pressed: true })) as {
      transform?: { scale: number }[];
    };
    const repos = StyleSheet.flatten(pressable.props.style({ pressed: false })) as { transform?: unknown };
    expect(enfoncee.transform).toEqual([{ scale: PRESSE_ECHELLE }]);
    expect(repos.transform).toBeUndefined();
    act(() => t.unmount());
  });

  it('une ligne pleine largeur pâlit sans rétrécir', () => {
    const st = StyleSheet.flatten(stylePresse({ height: 10 }, true, 1, 0.7)) as { opacity?: number; transform?: unknown };
    expect(st.opacity).toBe(0.7);
    expect(st.transform).toBeUndefined();
  });

  it('un calque qui bascule vibre ; un bouton d’action, non', () => {
    let t!: TestRenderer.ReactTestRenderer;
    const bascule = jest.fn();
    act(() => {
      t = TestRenderer.create(
        <View>
          <ToolPill icon="ruler" label="Dimensions" active={false} calque onPress={bascule} />
          <ToolPill icon="undo" label="Annuler" active={false} onPress={() => {}} />
        </View>,
      );
    });
    const pastille = (nom: string) => t.root.findAllByType(Presse).find((n) => n.props.accessibilityLabel === nom)!;
    act(() => pastille('Annuler').props.onPress());
    expect(tap()).not.toHaveBeenCalled();
    act(() => pastille('Dimensions').props.onPress());
    expect(bascule).toHaveBeenCalledTimes(1);
    expect(tap()).toHaveBeenCalledWith('leger');
    act(() => t.unmount());
  });
});

describe('3. « Réduire les animations »', () => {
  it('l’onde du contrôle des normes ne tourne pas en boucle', async () => {
    await amorcer(true, false);
    const boucle = jest.spyOn(Animated, 'loop');
    let t!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      t = TestRenderer.create(<ControlePastille alertes={3} commence onPress={() => {}} />);
    });
    expect(boucle).not.toHaveBeenCalled();
    act(() => t.unmount());
  });

  it('et elle tourne pour qui n’a rien demandé', async () => {
    const boucle = jest.spyOn(Animated, 'loop');
    let t!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      t = TestRenderer.create(<ControlePastille alertes={3} commence onPress={() => {}} />);
    });
    expect(boucle).toHaveBeenCalled();
    act(() => t.unmount());
  });

  it('une page s’allume sur place : ni glissement ni grossissement', async () => {
    await amorcer(true, false);
    let t!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      t = TestRenderer.create(
        <Scene entree="poussee">
          <Text>page</Text>
        </Scene>,
      );
    });
    const scene = t.root.findAll((n) => n.props.testID === 'scene-poussee')[0];
    const st = StyleSheet.flatten(scene.props.style) as { transform?: unknown; opacity?: unknown };
    expect(st.transform).toBeUndefined();
    expect(st.opacity).toBeDefined();
    act(() => t.unmount());
  });

  it('les pastilles de la colonne s’allument sans monter du bouton d’édition', async () => {
    await amorcer(true, false);
    const anim = new Animated.Value(0);
    let t!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      t = TestRenderer.create(
        <PillSlot index={3} anim={anim}>
          <Text>pastille</Text>
        </PillSlot>,
      );
    });
    const vue = t.root.findAllByType(Animated.View)[0];
    expect((vue.props.style as { transform?: unknown }).transform).toBeUndefined();
    act(() => t.unmount());
  });
});

describe('4. gros caractères sur l’habillage du plan', () => {
  it('le mot sous la pastille est plafonné, la loupe d’iOS le montre en grand', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ToolPill icon="ruler" label="Dimensions" active={false} onPress={() => {}} />);
    });
    const mot = t.root.findAllByType(Text).find((n) => n.props.children === 'Dimensions')!;
    expect(mot.props.maxFontSizeMultiplier).toBe(PLAFOND_BARRE);
    const touche = t.root.findByType(Presse);
    expect(touche.props.accessibilityShowsLargeContentViewer).toBe(true);
    expect(touche.props.accessibilityLargeContentTitle).toBe('Dimensions');
    expect(PLAFOND_BARRE).toBe(1.2);
    act(() => t.unmount());
  });
});

describe('5. la barre de défilement', () => {
  it('n’est plus masquée que sur le rail des produits du scan, posé sur la caméra', () => {
    const masques = fichiers(RACINE)
      .filter((f) => fs.readFileSync(f, 'utf8').includes('showsVerticalScrollIndicator={false}'))
      .map((f) => path.basename(f));
    expect(masques).toEqual(['ScanScreen.tsx']);
  });
});

describe('6. VoiceOver annonce ce qui apparaît tout seul', () => {
  it('la bulle « rien à afficher » est prononcée', () => {
    act(() => useBulle.getState().montrer('Aucun appareil à afficher', 10, 10));
    expect(A11y.announceForAccessibilityWithOptions).toHaveBeenCalledWith('Aucun appareil à afficher', { queue: true });
    act(() => useBulle.getState().cacher());
  });

  it('une même phrase ne se répète pas en rafale', () => {
    expect(annoncer('Mur validé')).toBe(true);
    expect(annoncer('Mur validé')).toBe(false);
    expect(annoncer('')).toBe(false);
    expect(A11y.announceForAccessibilityWithOptions).toHaveBeenCalledTimes(1);
  });
});

describe('7. supprimer un plan avec VoiceOver', () => {
  function monterBanc(supprimer: (id: string) => void) {
    const api: { courant?: ReturnType<typeof useSuppressionDifferee> } = {};
    function Banc() {
      api.courant = useSuppressionDifferee(supprimer);
      return null;
    }
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Banc />);
    });
    return { api, t };
  }

  it('sans VoiceOver, rien ne change : 4,5 s', async () => {
    jest.useFakeTimers();
    const supprimer = jest.fn();
    const { api, t } = monterBanc(supprimer);
    act(() => api.courant!.jeter('a', 'Salon'));
    act(() => {
      jest.advanceTimersByTime(DELAI_ANNULER + 10);
    });
    expect(supprimer).toHaveBeenCalledWith('a');
    act(() => t.unmount());
  });

  it('avec VoiceOver, 12 s pour se raviser', async () => {
    await amorcer(false, true);
    jest.useFakeTimers();
    const supprimer = jest.fn();
    const { api, t } = monterBanc(supprimer);
    act(() => api.courant!.jeter('a', 'Salon'));
    act(() => {
      jest.advanceTimersByTime(DELAI_ANNULER + 500);
    });
    expect(supprimer).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(DELAI_ANNULER_LECTEUR - DELAI_ANNULER);
    });
    expect(supprimer).toHaveBeenCalledWith('a');
    expect(DELAI_ANNULER_LECTEUR).toBe(12000);
    act(() => t.unmount());
  });

  it('le bandeau se dit, et le curseur va sur « Annuler »', async () => {
    await amorcer(false, true);
    jest.useFakeTimers();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<BandeauAnnuler texte="« Salon » mis à la corbeille" bas={20} onAnnuler={() => {}} />);
    });
    expect(A11y.announceForAccessibilityWithOptions).toHaveBeenCalledWith(
      '« Salon » mis à la corbeille. Annuler disponible.',
      { queue: true },
    );
    act(() => {
      jest.advanceTimersByTime(450);
    });
    expect(A11y.sendAccessibilityEvent).toHaveBeenCalledWith(expect.anything(), 'focus');
    act(() => t.unmount());
  });
});

describe('8. le geste « retour » de VoiceOver', () => {
  it('ferme la feuille commune', () => {
    jest.useFakeTimers();
    const fermer = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <SheetShell visible onClose={fermer}>
          <Text>contenu</Text>
        </SheetShell>,
      );
    });
    const carte = t.root.findAll((n) => n.props.testID === 'carte-feuille')[0];
    expect(carte.props.accessibilityViewIsModal).toBe(true);
    act(() => carte.props.onAccessibilityEscape());
    expect(fermer).toHaveBeenCalledTimes(1);
    act(() => t.unmount());
  });

  it('chaque carte modale de l’app le prend aussi', () => {
    // Toute vue déclarée modale pour VoiceOver doit savoir se refermer.
    const sansEchappement: string[] = [];
    for (const f of fichiers(RACINE)) {
      const src = fs.readFileSync(f, 'utf8');
      const re = /<View\b((?:[^>]|\n)*?)>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (m[1].includes('accessibilityViewIsModal') && !m[1].includes('onAccessibilityEscape')) {
          sansEchappement.push(`${path.basename(f)}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(sansEchappement).toEqual([]);
  });
});

describe('9. des libellés qui disent ce qu’on voit', () => {
  it('une mesure du bandeau se lit d’un seul tenant, en toutes lettres', () => {
    expect(libelleDeMesure('≈ 45,8', 'm² habitables')).toBe('environ 45,8 mètres carrés habitables');
    expect(libelleDeMesure('5', 'pièces')).toBe('5 pièces');
    expect(libelleDeMesure('27', 'élec.')).toBe('27 points électriques');
  });

  it('une ligne de « Mes plans » dit le nom et le client, et offre ses actions au rotor', () => {
    jest.useFakeTimers();
    act(() => {
      useScanStore.setState({
        screen: 'library',
        folders: [],
        saves: [
          {
            id: 'a',
            name: 'Salon',
            client: 'Mme Dupont',
            createdAt: 1,
            updatedAt: 1,
            walls: [],
            openings: [],
            objects: [],
            rooms: [],
            fixtures: [],
            ceiling: [],
          } as never,
        ],
      });
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<LibraryScreen />);
    });
    act(() => {
      jest.advanceTimersByTime(800);
    });
    const ligne = t.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityHint === 'Ouvre le plan',
    )[0];
    expect(String(ligne.props.accessibilityLabel)).toMatch(/^Salon, Mme Dupont, /);
    expect(ligne.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['options', 'supprimer']);
    act(() => ligne.props.onAccessibilityAction({ nativeEvent: { actionName: 'supprimer' } }));
    const textes = t.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(textes).toContain('« Salon » mis à la corbeille');
    act(() => t.unmount());
  });
});

describe('10. les boutons de pièce de la visite', () => {
  it('36 à 40 points dessinés, 44 sous le doigt, 8 entre deux', () => {
    expect(PIECE_H).toBeGreaterThanOrEqual(36);
    expect(PIECE_H).toBeLessThanOrEqual(40);
    expect(PIECE_H + 2 * PIECE_DEBORD).toBeGreaterThanOrEqual(44);
    expect(PIECE_ECART).toBeGreaterThanOrEqual(8);
  });

  it('la colonne en montre quatre et demi au plus, et trois au moins sur un petit écran', () => {
    const pas = PIECE_H + PIECE_ECART;
    // Un iPhone en portrait : la colonne s'arrête à quatre boutons et demi.
    expect(hauteurColonnePieces(844) / pas).toBeLessThanOrEqual(4.5);
    // L'écran le plus court qu'on rencontre (SE) : au moins trois.
    expect(hauteurColonnePieces(568) / pas).toBeGreaterThanOrEqual(3);
  });
});
