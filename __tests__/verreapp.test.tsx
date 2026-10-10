/**
 * LE VERRE, PARTOUT OÙ QUELQUE CHOSE FLOTTE — et seulement là.
 *
 * Relevé du patron : « pour avoir une cohérence dans toute l'app, mets ce
 * léger effet transparent glass là où tu le juges nécessaire, comme sur les
 * quatre cartes de l'accueil ; agis comme un professionnel investi dans la
 * cohérence de l'app pour ne pas perturber l'utilisateur ».
 *
 * La règle (voir `Verre.tsx`) : ce qui se pose PAR-DESSUS un contenu qu'on
 * continue de regarder est en verre — les commandes du plan, celles de la
 * visite, celles du scan (en verre fumé, sur la caméra) — et les quatre
 * tuiles de l'accueil, en verre teinté. Ce banc fait comme si le natif iOS
 * était là, et vérifie que chacun porte LA MÊME matière : un seul composant,
 * pas une imitation par écran.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useNotifications } from '../src/store/notifications';
import { MESSAGES_EMBARQUES } from '../src/data/nouveautes';

/*
  LE NATIF, PRÉSENT. Le mock commun n'a pas de verre (comme Android) ; on le
  lui donne AVANT de charger quoi que ce soit qui le lise — `VERRE` se décide
  au chargement de `Verre.tsx`.
*/
const natif = require('react-native-room-scan');
natif.RoomScanVerre = 'RoomScanVerre';
const { FondDeVerre, SUR_VERRE, VERRE, VOILE } = require('../src/components/Verre');
const { CarteDuMenu } = require('../src/components/StripBar');
const { ToolPill } = require('../src/components/ToolPill');
const { DevisPastille } = require('../src/components/DevisPastille');
const { ControlePastille } = require('../src/components/ControlePastille');
const theme = require('../src/theme');
const { HomeScreen, TEINTES_TUILES, HALOS_TUILES } = require('../src/screens/HomeScreen');
const { ScanScreen } = require('../src/screens/ScanScreen');

type Arbre = TestRenderer.ReactTestRenderer;
let arbre: Arbre | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (n: React.ReactElement) => {
  let t!: Arbre;
  act(() => {
    t = TestRenderer.create(n);
  });
  arbre = t;
  return t;
};

/** Tout ce qui se mesure se mesure, comme sur l'écran. */
const mesurer = (t: Arbre, width: number, height: number) =>
  act(() => {
    for (const n of t.root.findAll((x) => typeof x.props?.onLayout === 'function')) {
      n.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
    }
  });

const verres = (t: Arbre) => t.root.findAll((n) => n.type === ('RoomScanVerre' as never));

describe('le verre de l’app', () => {
  it('une seule matière : le natif, sans fond ni ombre propres à l’élément', () => {
    expect(VERRE).toBe(true);
    expect(SUR_VERRE).toEqual({ backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 });
    const t = monter(
      <View>
        <FondDeVerre rayon={20} />
      </View>,
    );
    const [v] = verres(t);
    expect(v.props.rayon).toBe(20);
    expect(v.props.pointerEvents).toBe('none');
    // Le thème clair : un verre clair.
    expect(v.props.sombre).toBe(false);
    // Sans ombre demandée, pas d'ombre.
    expect(v.props.ombre).toEqual([0, 0, 0]);
  });

  it('jamais gris : le voile par défaut est un blanc dense', () => {
    /*
      Relevé du patron, la première fois : « le design des boutons grisés ne
      me plaît pas — je t'ai demandé une modernisation pas un déclin ». Le
      matériau seul prend la couleur de la page gris clair ; un voile blanc
      dense le garde blanc.
    */
    expect(VOILE).toBeGreaterThanOrEqual(0.65);
    const t = monter(
      <View>
        <FondDeVerre rayon={14} />
      </View>,
    );
    expect(verres(t)[0].props.voile).toBe(VOILE);
  });

  it('une pilule (rayon 999) se borne à sa demi-hauteur', () => {
    const t = monter(
      <View>
        <FondDeVerre rayon={999} />
      </View>,
    );
    mesurer(t, 120, 34);
    expect(verres(t)[0].props.rayon).toBe(17);
  });

  it('le verre fumé se demande, quel que soit le thème', () => {
    const t = monter(
      <View>
        <FondDeVerre rayon={18} sombre />
      </View>,
    );
    expect(verres(t)[0].props.sombre).toBe(true);
  });

  it('la bulle du menu est en verre, au rayon de sa carte', () => {
    const t = monter(
      <CarteDuMenu style={{ backgroundColor: '#FFFFFF', borderRadius: 20, shadowOpacity: 0.12, shadowRadius: 18 }}>
        <View />
      </CarteDuMenu>,
    );
    const bulle = t.root.findAll((n) => n.props.testID === 'bulle-du-menu' && typeof n.type === 'string')[0];
    expect((StyleSheet.flatten(bulle.props.style) as { backgroundColor: string }).backgroundColor).toBe(
      'transparent',
    );
    const [v] = verres(t);
    expect(v.props.rayon).toBe(20);
    // Plus léger que les boutons : on doit deviner le plan dessous. Et
    // l'ombre est celle de la carte.
    expect(v.props.voile).toBeLessThan(VOILE);
    expect(v.props.ombre[0]).toBeGreaterThan(0);
  });

  it('une pastille d’outil au repos est en verre ; allumée, elle reste d’un bleu plein', () => {
    const repos = monter(<ToolPill icon="undo" label="Annuler" active={false} onPress={() => {}} />);
    expect(verres(repos)).toHaveLength(1);
    // Son ombre reste celle d'un bouton : neutre, courte, à peine posée.
    const b = theme.ombreBouton;
    expect(verres(repos)[0].props.ombre).toEqual([b.shadowOpacity, b.shadowRadius, b.shadowOffset.height]);
    act(() => repos.unmount());
    const allumee = monter(<ToolPill icon="save" label="Enregistrer" active onPress={() => {}} />);
    expect(verres(allumee)).toHaveLength(0);
  });

  it('le prix et le contrôle restent pleins : leur anneau de couleur est le message', () => {
    const prix = monter(<DevisPastille total={1248} onPress={() => {}} />);
    expect(verres(prix)).toHaveLength(0);
    act(() => prix.unmount());
    const ctrl = monter(<ControlePastille alertes={2} commence onPress={() => {}} />);
    expect(verres(ctrl)).toHaveLength(0);
  });

  it('les quatre tuiles de l’accueil : du verre teinté de leur couleur, sur leur lumière', () => {
    jest.useFakeTimers();
    try {
      useScanStore.setState({ screen: 'home', supported: true, saves: [], brouillon: null, error: null });
      useAccountStore.setState({ compte: null, pro: false });
      useNotifications.setState({ charge: true, recus: [], lus: MESSAGES_EMBARQUES.map((m) => m.id), supprimes: [] });
      const t = monter(<HomeScreen />);
      mesurer(t, 342, 280);
      const tuiles = verres(t).filter((v) => v.props.rayon === 26);
      expect(tuiles).toHaveLength(4);
      // Chaque tuile garde SA couleur, posée sur le verre.
      const teintes = t.root
        .findAll((n) => typeof n.type === 'string' && n.props.style)
        .map((n) => StyleSheet.flatten(n.props.style) as { backgroundColor?: string; opacity?: number })
        .filter((st) => st.opacity === 0.75 && st.backgroundColor)
        .map((st) => st.backgroundColor);
      expect(teintes.sort()).toEqual(Object.values(TEINTES_TUILES.clair).sort());
      // Et la lumière du moulinet, sous elles, une tache par tuile.
      expect(t.root.findAll((n) => n.props.testID === 'halo-du-moulinet').length).toBeGreaterThan(0);
      expect(Object.keys(HALOS_TUILES.clair).sort()).toEqual(Object.keys(TEINTES_TUILES.clair).sort());
    } finally {
      act(() => arbre?.unmount());
      arbre = null;
      jest.useRealTimers();
    }
  });

  it('sur la caméra du scan, tout le verre est fumé — même en thème clair', async () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ screen: 'scan', scanning: true, paused: false, processing: false, wallCount: 2 });
    });
    const t = monter(<ScanScreen />);
    // Le guide de la pose se demande au stockage : on laisse la réponse arriver.
    await act(async () => {
      await Promise.resolve();
    });
    const v = verres(t);
    expect(v.length).toBeGreaterThanOrEqual(3);
    expect(v.every((x) => x.props.sombre === true)).toBe(true);
  });
});
