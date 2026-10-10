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
const { GlisserPourSupprimer } = require('../src/components/GlisserPourSupprimer');
const lire = (p: string) => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', p), 'utf8');
const { HomeScreen, TEINTES_TUILES } = require('../src/screens/HomeScreen');
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
    // Sans ombre demandée, pas d'ombre propre ; neutre, sans teinte.
    expect(v.props.ombre).toEqual([0, 0, 0]);
    expect(v.props.teinte).toBe('');
  });

  it('transparent : le verre laisse voir à travers lui', () => {
    /*
      Relevé du patron, l'IPA en main : « pas de transparence + flou type Apple
      glass ; il ne se voit pas ». Le voile blanc à 70 % rendait le verre
      opaque. La réplique d'avant iOS 26 n'en garde qu'un soupçon.
    */
    expect(VOILE).toBeLessThanOrEqual(0.3);
    const t = monter(
      <View>
        <FondDeVerre rayon={14} />
      </View>,
    );
    expect(verres(t)[0].props.voile).toBe(VOILE);
  });

  it('rien n’est peint par-dessus le verre : il EST le fond du cadre', () => {
    /*
      React Native posait une teinte et un reflet par-dessus, à d'autres coins
      que les siens : « la forme des cards a été modifiée ». Le verre est
      maintenant la seule chose posée, à la forme de l'élément.
    */
    const t = monter(
      <View>
        <FondDeVerre rayon={999} teinte="#CDF1F6" force={0.55} />
      </View>,
    );
    const hotes = t.root.findAll((n) => typeof n.type === 'string');
    // La vue qui l'accueille, et le verre : rien d'autre.
    expect(hotes.map((n) => String(n.type))).toEqual(['View', 'RoomScanVerre']);
    const [v] = verres(t);
    expect(v.props.teinte).toBe('#CDF1F6');
    expect(v.props.force).toBe(0.55);
    // Le rayon de l'élément ; c'est le natif qui borne une pilule.
    expect(v.props.rayon).toBe(999);
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
    // L'ombre est celle de la carte.
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

  it('les quatre tuiles de l’accueil : du verre teinté de leur couleur, à leur forme', () => {
    jest.useFakeTimers();
    try {
      useScanStore.setState({ screen: 'home', supported: true, saves: [], brouillon: null, error: null });
      useAccountStore.setState({ compte: null, pro: false });
      useNotifications.setState({ charge: true, recus: [], lus: MESSAGES_EMBARQUES.map((m) => m.id), supprimes: [] });
      const t = monter(<HomeScreen />);
      mesurer(t, 342, 280);
      const tuiles = verres(t).filter((v) => v.props.rayon === 26);
      expect(tuiles).toHaveLength(4);
      // Chaque tuile garde SA couleur : c'est le verre qui la porte.
      expect(tuiles.map((v) => v.props.teinte).sort()).toEqual(Object.values(TEINTES_TUILES.clair).sort());
      // Plus de lumière de couleur sous le moulinet : elle brouillait les tuiles.
      expect(t.root.findAll((n) => n.props.testID === 'halo-du-moulinet')).toHaveLength(0);

    } finally {
      act(() => arbre?.unmount());
      arbre = null;
      jest.useRealTimers();
    }
  });

  it('les cadres des plans prennent le verre — sans changer de style', () => {
    /*
      Relevé du patron : « je veux rendre le cadre avec l'effet, pas changer de
      style ». La carte d'un plan (accueil, bibliothèque) garde sa forme, son
      ombre, son contenu ; son fond devient le verre.
    */
    const accueil = lire('src/screens/HomeScreen.tsx');
    expect(accueil).toContain('<FondDeVerre rayon={20} ombre={styles.carte} />');
    expect(accueil).toMatch(/\[styles\.carte, SUR_VERRE, pressed && styles\.cartePressee\]/);
    const biblio = lire('src/screens/LibraryScreen.tsx');
    expect(biblio).toContain('<FondDeVerre rayon={radius.md + 2} ombre={styles.row} />');
  });

  it('et plus de trait sous les plans : la corbeille ne se voit qu’en glissant', () => {
    /*
      Le fond rouge de la corbeille dépassait en bande sous chaque carte (la
      carte gardait sa marge DANS le cadre de balayage) et en liseré à ses
      coins ; et le cadre rognait l'ombre de la carte.
    */
    const t = monter(
      <GlisserPourSupprimer libelle="Plan" rayon={20} onSupprimer={() => {}}>
        {() => <View style={{ height: 60 }} />}
      </GlisserPourSupprimer>,
    );
    const cadre = t.root.findAll((n) => typeof n.type === 'string')[0];
    expect((StyleSheet.flatten(cadre.props.style) as { overflow?: string }).overflow).not.toBe('hidden');
    const corbeille = t.root.findAll(
      (n) => typeof n.type === 'string' && (StyleSheet.flatten(n.props.style) as { backgroundColor?: string })?.backgroundColor === theme.light.danger,
    )[0];
    expect((StyleSheet.flatten(corbeille.props.style) as { opacity: number }).opacity).toBe(0);
    // La carte de l'accueil ne garde plus de marge dans le cadre.
    expect(lire('src/screens/HomeScreen.tsx')).not.toMatch(/paddingRight: 14,\n      marginBottom: 10,\n      \.\.\.ombre/);
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
