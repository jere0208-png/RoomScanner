/**
 * LE TABLEAU, TEL QU'ON L'A SOUS LES YEUX — et qu'on remplit du doigt.
 *
 * Relevé du patron : « revois pour une refonte plus ludique et fonctionnelle
 * du relevé du tableau existant ; le tableau placé sur le plan doit
 * correspondre visuellement au tableau existant ». On ne remplit plus une
 * liste : on reconstruit le coffret qu'on a devant soi. Ses rangées, son rail,
 * et sur le rail chaque organe à sa place et à sa largeur — le différentiel
 * sur deux modules avec son bouton de test, le disjoncteur et sa manette, le
 * porte-fusible et sa cartouche.
 *
 * — UNE PLACE LIBRE SE TOUCHE : c'est là que le prochain organe se clipse.
 * — LA RÉSERVE SE VOIT : le cinquième du tableau que la norme garde libre est
 *   hachuré ; entamé, il rougit.
 * — CE QUI BLOQUE SE MONTRE DU DOIGT : l'organe en faute est cerclé, de rouge
 *   pour un danger, d'ambre pour un écart, avec son cadenas.
 * — CHAQUE ORGANE ARRIVE EN SE CLIPSANT : il tombe sur le rail d'un ressort
 *   court, comme sous le pouce.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { DepartExistant, Implantation, ModuleImplante } from '../geometry/existant';
import { radius, useTheme, type Palette } from '../theme';

/** Ce que commandent les départs : leur nom d'étiquette, leur code, leur teinte. */
export const USAGES_DU_TABLEAU: { nom: string; code: string; teinte: string }[] = [
  { nom: 'Éclairage', code: 'EC', teinte: '#E0A800' },
  { nom: 'Prises', code: 'PC', teinte: '#1F5BFF' },
  { nom: 'Prises cuisine', code: 'CU', teinte: '#7B4BA8' },
  { nom: 'Plaque de cuisson', code: 'PL', teinte: '#E5484D' },
  { nom: 'Four', code: 'FO', teinte: '#D9480F' },
  { nom: 'Lave-linge', code: 'LL', teinte: '#0E9AD6' },
  { nom: 'Lave-vaisselle', code: 'LV', teinte: '#0F9F8F' },
  { nom: 'Chauffe-eau', code: 'CE', teinte: '#EA7A1B' },
  { nom: 'Chauffage', code: 'CH', teinte: '#C2410C' },
  { nom: 'Volets roulants', code: 'VR', teinte: '#5B6577' },
  { nom: 'VMC', code: 'VM', teinte: '#7C5CD6' },
  { nom: 'Extérieur', code: 'EX', teinte: '#2F9E44' },
  { nom: 'Garage', code: 'GA', teinte: '#8A7F72' },
];

export const usageDuTableau = (nom: string | undefined) =>
  USAGES_DU_TABLEAU.find((u) => u.nom === nom) ??
  (nom ? { nom, code: nom.slice(0, 2).toUpperCase(), teinte: '#8A8F98' } : null);

/** Le cadenas des points bloquants. */
const CADENAS =
  'M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z';

export type FauteDuModule = 'danger' | 'ecart';

export function TableauVivant({
  impl,
  fautes,
  choisi,
  rangeeVisee,
  onPlace,
  onModule,
}: {
  impl: Implantation;
  /** Les organes en faute, et la gravité la plus haute qui les vise. */
  fautes: Map<string, FauteDuModule>;
  choisi: string | null;
  /** La rangée où le prochain organe se clipsera. */
  rangeeVisee: number | null;
  onPlace: (rangee: number) => void;
  onModule: (id: string) => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const [largeur, setLargeur] = useState(0);
  // La place d'un module : la rangée entière tient dans le coffret.
  const pas = largeur > 0 ? Math.floor((largeur - 2 * BORD) / impl.parRangee) : 0;
  const etroit = pas < 22;
  /*
    LA RÉSERVE : les dernières places libres du tableau, en le lisant à
    l'envers. Ce sont celles qu'on garde — on remplit un tableau par le haut.
  */
  const libresTotal = impl.libres.reduce((x, y) => x + y, 0);
  const enReserve = new Set<string>();
  let aGarder = impl.reserve;
  for (let r = impl.rangees - 1; r >= 0 && aGarder > 0; r--) {
    for (let k = impl.parRangee - 1; k >= impl.parRangee - impl.libres[r] && aGarder > 0; k--) {
      enReserve.add(`${r}:${k}`);
      aGarder -= 1;
    }
  }
  const reserveEntamee = libresTotal < impl.reserve;

  return (
    <View
      style={s.coffret}
      testID="tableau-vivant"
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (Math.abs(w - largeur) > 1) setLargeur(w);
      }}>
      <View style={s.entete}>
        <Text style={s.enteteTexte}>
          {impl.rangees} rangée{impl.rangees > 1 ? 's' : ''} × {impl.parRangee} modules
        </Text>
        <View style={[s.reserve, { backgroundColor: reserveEntamee ? c.danger : c.green }]}>
          <Text style={s.reserveTexte} accessibilityLabel={`Réserve : ${Math.min(libresTotal, impl.reserve)} places sur ${impl.reserve}`}>
            Réserve {Math.min(libresTotal, impl.reserve)}/{impl.reserve}
          </Text>
        </View>
      </View>
      {pas > 0 &&
        Array.from({ length: impl.rangees }, (_, r) => {
          const ici = impl.modules.filter((m) => m.rangee === r);
          const libres = impl.libres[r];
          const premier = impl.parRangee - libres;
          const visee = rangeeVisee === r;
          return (
            <View key={r} style={s.rangee}>
              {/* L'étiquette de la rangée : les codes de ce qu'elle commande. */}
              <View style={[s.etiquette, { width: pas * impl.parRangee }]}>
                {ici.map((m) => {
                  const u = usageDuTableau(m.depart.usage);
                  return (
                    <Text
                      key={m.depart.id}
                      numberOfLines={1}
                      style={[s.etiquetteCode, { left: m.debut * pas, width: m.largeur * pas, color: u?.teinte ?? c.inkFaint }]}>
                      {u ? u.code : ''}
                    </Text>
                  );
                })}
              </View>
              <View style={[s.rail, { width: pas * impl.parRangee + 4 }]}>
                {ici.map((m) => (
                  <Module
                    key={m.depart.id}
                    m={m}
                    pas={pas}
                    etroit={etroit}
                    faute={fautes.get(m.depart.id)}
                    choisi={choisi === m.depart.id}
                    onPress={() => onModule(m.depart.id)}
                  />
                ))}
                {libres > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Clipser un organe en rangée ${r + 1} — ${libres} place${libres > 1 ? 's' : ''} libre${libres > 1 ? 's' : ''}`}
                    onPress={() => onPlace(r)}
                    style={[s.libres, { left: 2 + premier * pas, width: libres * pas }, visee && { borderColor: c.blue, backgroundColor: c.blueSoft }]}>
                    {Array.from({ length: libres }, (__, k) => {
                      const garde = enReserve.has(`${r}:${premier + k}`);
                      return (
                        <View key={k} style={[s.place, { width: pas - 2 }, garde && s.placeReserve]}>
                          {k === 0 && !garde ? (
                            <Text style={[s.plus, visee && { color: c.blue }]}>+</Text>
                          ) : garde ? (
                            <Svg width={9} height={9} viewBox="0 0 24 24">
                              <Path d={CADENAS} fill={c.inkFaint} />
                            </Svg>
                          ) : null}
                        </View>
                      );
                    })}
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
    </View>
  );
}

/** Le bord du coffret, de chaque côté du rail. */
const BORD = 12;

function Module({
  m,
  pas,
  etroit,
  faute,
  choisi,
  onPress,
}: {
  m: ModuleImplante;
  pas: number;
  etroit: boolean;
  faute?: FauteDuModule;
  choisi: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  /* IL SE CLIPSE : il tombe d'un rien et se pose d'un ressort court. */
  const arrivee = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(arrivee, {
      toValue: 1,
      stiffness: 420,
      damping: 18,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [arrivee]);
  const d = m.depart;
  const u = usageDuTableau(d.usage);
  const anneau = faute === 'danger' ? c.danger : faute === 'ecart' ? c.amber : null;
  return (
    <Animated.View
      style={[
        s.moduleCase,
        {
          left: 2 + m.debut * pas,
          width: m.largeur * pas,
          opacity: arrivee,
          transform: [
            { translateY: arrivee.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
            { scale: arrivee.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
          ],
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${nommerOrgane(d)}${d.usage ? ` — ${d.usage}` : ''}${faute ? ' — point bloquant' : ''}`}
        accessibilityState={{ selected: choisi }}
        onPress={onPress}
        style={[
          s.module,
          d.organe === 'fusible' && { backgroundColor: '#E9E4DA' },
          anneau && { borderColor: anneau, borderWidth: 2 },
          choisi && { borderColor: c.blue, borderWidth: 2.5 },
        ]}>
        <Text numberOfLines={1} style={[s.calibre, etroit && s.calibreEtroit]}>
          {haut(d, etroit)}
        </Text>
        <Visage d={d} etroit={etroit} />
        <View style={[s.bande, { backgroundColor: u?.teinte ?? 'transparent' }]} />
        {anneau && (
          <View style={[s.cadenas, { backgroundColor: anneau }]}>
            <Svg width={7} height={7} viewBox="0 0 24 24">
              <Path d={CADENAS} fill="#FFFFFF" />
            </Svg>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Ce qu'on lit en haut d'un organe : son calibre, ou sa sensibilité. */
function haut(d: DepartExistant, etroit: boolean): string {
  if (d.organe === 'differentiel') return `${d.sensibilite ?? 30}mA`;
  if (d.organe === 'parafoudre') return 'PF';
  if (d.organe === 'agcp') return d.calibre ? `${d.calibre}A` : 'AGCP';
  if (d.organe === 'contacteur') return 'HC';
  if (d.organe === 'telerupteur') return 'TL';
  if (d.calibre == null) return '';
  return etroit ? `${d.calibre}` : `${d.calibre}A`;
}

/** La face de l'organe : manette, bouton de test, cartouche. */
function Visage({ d, etroit }: { d: DepartExistant; etroit: boolean }) {
  const c = useTheme();
  const s = getStyles(c);
  if (d.organe === 'fusible') {
    return (
      <View style={s.visage}>
        <View style={s.cartouche}>
          <View style={s.cartoucheBague} />
        </View>
      </View>
    );
  }
  if (d.organe === 'parafoudre') {
    return (
      <View style={s.visage}>
        <Text style={s.eclair}>⚡</Text>
      </View>
    );
  }
  return (
    <View style={[s.visage, d.organe === 'differentiel' && s.visageLarge]}>
      <View style={[s.manette, etroit && s.manetteEtroite]} />
      {d.organe === 'differentiel' && (
        <View style={s.colonneDiff}>
          {d.typeDiff ? <Text style={s.typeDiff}>{d.typeDiff}</Text> : null}
          <View style={s.test} />
        </View>
      )}
    </View>
  );
}

/** Le nom d'un organe, tel qu'on le lirait à voix haute. */
export function nommerOrgane(d: DepartExistant): string {
  switch (d.organe) {
    case 'differentiel':
      return `Différentiel ${d.sensibilite ?? 30} mA${d.typeDiff ? ` type ${d.typeDiff}` : ''}`;
    case 'fusible':
      return `Fusible ${d.calibre ?? '?'} A`;
    case 'agcp':
      return 'Disjoncteur d’abonné';
    case 'parafoudre':
      return 'Parafoudre';
    case 'contacteur':
      return 'Contacteur heures creuses';
    case 'telerupteur':
      return 'Télérupteur';
    case 'interrupteur':
      return d.calibre ? `Interrupteur général ${d.calibre} A` : 'Interrupteur général';
    case 'repartiteur':
      return 'Répartiteur';
    case 'autre':
      return 'Autre organe';
    default:
      return `Disjoncteur ${d.calibre ?? '?'} A`;
  }
}

const getStyles = (c: Palette) =>
  StyleSheet.create({
    coffret: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.lineStrong,
      paddingHorizontal: BORD,
      paddingTop: 10,
      paddingBottom: 12,
      gap: 6,
    },
    entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
    enteteTexte: { color: c.inkSoft, fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
    reserve: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    reserveTexte: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    rangee: { gap: 3 },
    etiquette: { height: 13, alignSelf: 'flex-start', marginLeft: 2 },
    etiquetteCode: { position: 'absolute', top: 0, fontSize: 9.5, fontWeight: '800', textAlign: 'center' },
    rail: {
      height: 64,
      backgroundColor: '#2A2E35',
      borderRadius: 7,
    },
    moduleCase: { position: 'absolute', top: 3, bottom: 3 },
    module: {
      flex: 1,
      marginHorizontal: 1,
      backgroundColor: '#F7F7F5',
      borderRadius: 4,
      borderWidth: 1,
      borderColor: '#D9DBDF',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 3,
      overflow: 'visible',
    },
    calibre: { color: '#1C1F24', fontSize: 9.5, fontWeight: '800' },
    calibreEtroit: { fontSize: 8.5 },
    visage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1 },
    visageLarge: { gap: 6 },
    manette: { width: 8, height: 16, borderRadius: 2, backgroundColor: '#1C1F24' },
    manetteEtroite: { width: 6, height: 14 },
    colonneDiff: { alignItems: 'center', gap: 3 },
    typeDiff: { color: '#1F5BFF', fontSize: 9, fontWeight: '900' },
    test: { width: 7, height: 7, borderRadius: 1.5, backgroundColor: '#4F7FB8' },
    cartouche: {
      width: 9,
      height: 20,
      borderRadius: 3,
      backgroundColor: '#B9B2A4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cartoucheBague: { width: 9, height: 4, backgroundColor: '#C2402F' },
    eclair: { fontSize: 13 },
    bande: { alignSelf: 'stretch', height: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
    cadenas: {
      position: 'absolute',
      top: -5,
      right: -4,
      width: 13,
      height: 13,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    libres: {
      position: 'absolute',
      top: 3,
      bottom: 3,
      flexDirection: 'row',
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: 'transparent',
      borderStyle: 'dashed',
    },
    place: {
      marginHorizontal: 1,
      borderRadius: 3,
      backgroundColor: '#3A3F47',
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeReserve: { backgroundColor: '#4A505A' },
    plus: { color: '#C9CED6', fontSize: 18, fontWeight: '700' },
  });

/** Pour l'animation d'un verdict qui change : une pulsation courte. */
export function usePulsation(cle: string | number): Animated.Value {
  const v = useRef(new Animated.Value(1)).current;
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    v.setValue(0.92);
    Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true }).start();
  }, [cle, v]);
  return v;
}
