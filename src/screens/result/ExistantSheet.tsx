/**
 * LE TABLEAU QU'ON TROUVE EN ARRIVANT.
 *
 * On l'ouvre, on le reconstruit du doigt, l'application dit ce qui bloque.
 * C'est le premier quart d'heure de tout chantier de rénovation, et il se
 * faisait jusqu'ici sur un carnet — puis se ressaisissait le soir.
 *
 * Relevé du patron : « revois pour une refonte plus ludique et fonctionnelle
 * du relevé du tableau existant ; le tableau placé sur le plan doit
 * correspondre visuellement au tableau existant, et les deux systèmes doivent
 * être liés ; si on a un disjoncteur, alors un seul doit s'afficher sur le
 * tableau, avec les normes qui feront blocage, comme deux rangées minimum ».
 *
 * — ON RECONSTRUIT LE COFFRET, pas une liste (`TableauVivant`) : ses rangées,
 *   ses modules, chaque organe à sa place et à sa largeur. On touche une
 *   place libre, on choisit ce qu'on y voit, il se clipse. Une rangée pleine
 *   passe la main à la suivante, comme l'œil qui lit le tableau.
 * — CE QUI EST PHYSIQUEMENT IMPOSSIBLE EST BLOQUÉ : un différentiel ne se
 *   clipse pas sur une seule place, une rangée qui porte encore des organes
 *   ne se retire pas.
 * — CE QUE LA NORME REFUSE BLOQUE LE CONTRÔLE : la grille coche chaque règle
 *   ou y met son cadenas ; l'organe en faute est cerclé sur le tableau.
 * — LE MÊME TABLEAU EST SUR LE PLAN : celui qu'on reconstruit ici est celui
 *   qui se dessine au mur, en élévation et en 3D, organe pour organe.
 *
 * LA SAISIE PASSE AVANT LA BEAUTÉ, toujours : on est debout, une main sur le
 * téléphone ; chaque organe se pose en un ou deux appuis, les valeurs qu'on
 * rencontre vraiment (2, 10, 16, 20, 32 A) sont des boutons, pas un clavier.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { radius, shadowCard, useTheme, type Palette } from '../../theme';
import {
  bilanExistant,
  calibreMaxDe,
  chargeEnPosant,
  MAX_CIRCUITS_PAR_DIFF,
  diagnosticExistant,
  grilleDuTableau,
  implanter,
  largeurDe,
  rattacher,
  RANGEES_MIN,
  type DepartExistant,
  type GraviteConstat,
  type Organe,
} from '../../geometry/existant';
import type { TableauExistant } from '../../store/scanStore';
import { haptic } from '../../ui/haptic';
import {
  nommerOrgane,
  TableauVivant,
  USAGES_DU_TABLEAU,
  usePulsation,
  type FauteDuModule,
} from '../../components/TableauVivant';

/** Les calibres qu'on rencontre vraiment sur un rail, dans cet ordre. */
const CALIBRES = [2, 10, 16, 20, 32];

const TEINTE: Record<GraviteConstat, keyof Palette> = {
  danger: 'danger',
  ecart: 'amber',
  vigilance: 'inkFaint',
};

const MOT: Record<GraviteConstat, string> = {
  danger: 'Danger',
  ecart: 'Bloquant',
  vigilance: 'À vérifier',
};

/** Ce qu'on peut clipser, dans l'ordre où on le rencontre en lisant un tableau. */
/*
  LE TYPE AC SE CLIPSE D'EMBLÉE — relevé du patron : « pas de type AC pour le
  différentiel ? ». Il n'existait qu'en réglage, après coup ; or c'est celui
  qu'on trouve le plus souvent dans un tableau d'avant. Les deux se posent
  directement, chacun sous son nom.
*/
const ORGANES: { cle: string; organe: Organe; nom: string; note: string; modele: Omit<DepartExistant, 'id'> }[] = [
  {
    cle: 'diff-a',
    organe: 'differentiel',
    nom: 'Différentiel 30 mA',
    note: 'type A · 2 places',
    modele: { organe: 'differentiel', calibre: 40, sensibilite: 30, typeDiff: 'A' },
  },
  {
    cle: 'diff-ac',
    organe: 'differentiel',
    nom: 'Différentiel 30 mA',
    note: 'type AC · 2 places',
    modele: { organe: 'differentiel', calibre: 40, sensibilite: 30, typeDiff: 'AC' },
  },
  { cle: 'fusible', organe: 'fusible', nom: 'Porte-fusible', note: 'ancien tableau', modele: { organe: 'fusible', calibre: 10 } },
  { cle: 'parafoudre', organe: 'parafoudre', nom: 'Parafoudre', note: '2 places', modele: { organe: 'parafoudre', calibre: null } },
  { cle: 'contacteur', organe: 'contacteur', nom: 'Contacteur HC', note: 'chauffe-eau', modele: { organe: 'contacteur', calibre: 20, usage: 'Chauffe-eau' } },
  { cle: 'telerupteur', organe: 'telerupteur', nom: 'Télérupteur', note: 'éclairage', modele: { organe: 'telerupteur', calibre: 16, usage: 'Éclairage' } },
  { cle: 'agcp', organe: 'agcp', nom: 'Disjoncteur d’abonné', note: '2 places', modele: { organe: 'agcp', calibre: 45 } },
];

const CHECK = 'M9.5 16.2 5.8 12.5l-1.4 1.4 5.1 5.1 10.6-10.6-1.4-1.4z';
const CADENAS =
  'M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z';

export function ExistantSheet({
  visible,
  existant,
  onClose,
  onAjouter,
  onModifier,
  onRetirer,
  onDecrire,
  onDeplacer,
  surLePlan,
  onPlacer,
  onVoir,
}: {
  visible: boolean;
  existant: TableauExistant | null;
  onClose: () => void;
  onAjouter: (d: Omit<DepartExistant, 'id'>) => string;
  onModifier: (id: string, champs: Partial<DepartExistant>) => void;
  onRetirer: (id: string) => void;
  onDecrire: (t: { rangees?: number; parRangee?: number }) => void;
  onDeplacer?: (id: string, vers: { pas?: -1 | 1; rangee?: number }) => void;
  /** Le tableau posé sur le plan : la pièce où il est, ou `null` s'il n'y est pas. */
  surLePlan?: { piece?: string } | null;
  onPlacer?: () => void;
  onVoir?: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  // Le tableau absent donne une liste vide — mais TOUJOURS la même : un
  // `?? []` écrit dans le corps fabriquerait un tableau neuf à chaque
  // rendu, et le diagnostic se recalculerait sans fin.
  const departsBruts = useMemo(() => existant?.departs ?? [], [existant?.departs]);
  const impl = useMemo(
    () => implanter({ departs: departsBruts, rangees: existant?.rangees, parRangee: existant?.parRangee }),
    [departsBruts, existant?.rangees, existant?.parRangee],
  );
  /* Ce qu'on juge, c'est ce que le tableau MONTRE : chaque départ sous le
     différentiel qui le précède sur le rail. */
  const departs = useMemo(() => rattacher(departsBruts, impl), [departsBruts, impl]);
  const constats = useMemo(
    () =>
      diagnosticExistant(
        departs,
        impl.decrit ? { rangees: impl.rangees, parRangee: impl.parRangee } : undefined,
      ),
    [departs, impl],
  );
  const bilan = bilanExistant(constats);
  const grille = useMemo(() => grilleDuTableau(departs, constats, impl.decrit), [departs, constats, impl.decrit]);
  const jugees = grille.filter((g) => g.ok !== null);
  const tenues = jugees.filter((g) => g.ok).length;
  const fautes = useMemo(() => {
    const m = new Map<string, FauteDuModule>();
    for (const k of constats) {
      if (!k.bloquant) continue;
      for (const id of k.cibles) {
        if (k.gravite === 'danger' || !m.has(id)) m.set(id, k.gravite === 'danger' ? 'danger' : 'ecart');
      }
    }
    return m;
  }, [constats]);

  /** L'organe touché : on montre ses réglages, et lui seul. */
  const [choisi, setChoisi] = useState<string | null>(null);
  /** La rangée où se clipse le prochain organe. */
  const [visee, setVisee] = useState<number | null>(0);
  /** Ce que le dernier geste refusé avait à dire. */
  const [refus, setRefus] = useState<string | null>(null);
  const choix = departs.find((d) => d.id === choisi) ?? null;
  const choixImpl = impl.modules.find((m) => m.depart.id === choisi) ?? null;

  /* LE VERDICT QUI BASCULE AU VERT SE FÊTE — une fois par passage. */
  const auVert = departs.length > 0 && bilan.bloquants === 0;
  const etaitAuVert = useRef(auVert);
  useEffect(() => {
    if (auVert && !etaitAuVert.current) haptic('succes');
    etaitAuVert.current = auVert;
  }, [auVert]);
  const pulse = usePulsation(`${bilan.bloquants}-${tenues}`);
  const jauge = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(jauge, {
      toValue: jugees.length > 0 ? tenues / jugees.length : 0,
      duration: 380,
      useNativeDriver: false,
    }).start();
  }, [jauge, tenues, jugees.length]);

  const refuser = (pourquoi: string) => {
    setRefus(pourquoi);
    haptic('butee');
  };

  const poser = (modele: Omit<DepartExistant, 'id'>) => {
    const r = visee ?? impl.libres.findIndex((l) => l >= largeurDe(modele));
    if (r < 0 || r >= impl.rangees) {
      refuser('Le tableau est plein : ajoutez une rangée pour clipser cet organe.');
      return;
    }
    if (impl.libres[r] < largeurDe(modele)) {
      refuser(
        `Il ne reste ${impl.libres[r]} place${impl.libres[r] > 1 ? 's' : ''} en rangée ${r + 1} : ` +
          `cet organe en demande ${largeurDe(modele)}.`,
      );
      return;
    }
    /*
      HUIT CIRCUITS AU PLUS SOUS UN DIFFÉRENTIEL — et c'est un geste refusé,
      pas un constat lu après coup (voir `chargeEnPosant`).
    */
    const charge = chargeEnPosant(departsBruts, { rangees: impl.rangees, parRangee: impl.parRangee }, { ...modele, rangee: r });
    if (charge && charge.circuits > MAX_CIRCUITS_PAR_DIFF) {
      refuser(
        `Le différentiel ${numeroDuDiff(impl, charge.differentiel)} protège déjà ${MAX_CIRCUITS_PAR_DIFF} circuits, ` +
          'le maximum : clipsez un nouveau différentiel 30 mA pour les suivants.',
      );
      return;
    }
    onAjouter({ ...modele, rangee: r });
    setRefus(null);
    haptic('accroche');
    // Une rangée pleine passe la main à la suivante, comme l'œil qui lit.
    const reste = impl.libres[r] - largeurDe(modele);
    if (reste <= 0) {
      const suivante = impl.libres.findIndex((l, k) => k > r && l > 0);
      setVisee(suivante >= 0 ? suivante : null);
    }
  };

  const changerRangees = (n: number) => {
    if (n < 1 || n > 6) return;
    const essai = implanter({ departs: departsBruts, rangees: n, parRangee: impl.parRangee });
    if (essai.horsRail.length > 0) {
      refuser(`La rangée ${impl.rangees} porte encore des organes : retirez-les ou déplacez-les d’abord.`);
      return;
    }
    onDecrire({ rangees: n, parRangee: impl.parRangee });
    setRefus(n < RANGEES_MIN ? 'Une seule rangée : la norme en demande deux — c’est un point bloquant.' : null);
    if (visee !== null && visee >= n) setVisee(n - 1);
    haptic(n < RANGEES_MIN ? 'alerte' : 'leger');
  };

  const changerLargeur = (p: number) => {
    const essai = implanter({ departs: departsBruts, rangees: impl.rangees, parRangee: p });
    if (essai.horsRail.length > 0) {
      refuser(`Des rangées sont trop pleines pour ${p} modules : déplacez d’abord quelques organes.`);
      return;
    }
    onDecrire({ rangees: impl.rangees, parRangee: p });
    setRefus(null);
    haptic('leger');
  };

  const fautesDuChoix = choix ? constats.filter((k) => k.bloquant && k.cibles.includes(choix.id)) : [];

  /*
    CE QUI OUVRE UN AUTRE ÉCRAN ATTEND QUE LA FEUILLE SOIT PARTIE. Le mur
    s'ouvre dans une autre fenêtre : demandée pendant que celle-ci descend,
    iOS la refuse. On part d'abord, on agit ensuite — à la fin de la
    descente, ou au plus tard une demi-seconde après.
  */
  const ensuite = useRef<null | (() => void)>(null);
  const lancerEnsuite = () => {
    const f = ensuite.current;
    ensuite.current = null;
    f?.();
  };
  const quitterPuis = (f: () => void) => {
    ensuite.current = f;
    onClose();
  };
  useEffect(() => {
    if (visible || !ensuite.current) return;
    const t = setTimeout(lancerEnsuite, 500);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={lancerEnsuite}>
      {/*
        LE DÉFILEMENT NE SE DISPUTE PLUS — relevé du patron : « dans le menu
        du tableau existant, le scroll est bug ». La carte était un bouton
        (pour que toucher dedans ne ferme pas la feuille) : il réclamait
        chaque geste au défilement, qui hésitait, sautait ou ne partait pas.
        Le fond qui ferme est maintenant posé À CÔTÉ de la carte, derrière
        elle — la carte est une simple vue, et le défilement est seul maître.
      */}
      <View style={styles.fond}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Fermer le tableau" onPress={onClose} />
        <View style={styles.carte}>
          <View style={styles.tete}>
            <View style={styles.teteTexte}>
              <Text style={styles.titre}>Tableau existant</Text>
              <Text style={styles.sousTitre}>
                {departs.length === 0
                  ? 'Touchez une place du tableau, choisissez ce que vous y voyez.'
                  : `${departs.length} organe(s) · ${impl.occupees} module(s) sur ${impl.places}`}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Fermer"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={onClose}>
              <Text style={styles.croix}>✕</Text>
            </TouchableOpacity>
          </View>

          {/*
            LE VERDICT, EN HAUT ET TOUT DE SUITE — et il bat quand il change.
            On voit le tableau se juger à mesure qu'on le reconstruit ; la
            jauge des règles tenues se remplit, et passe au vert.
          */}
          {departs.length > 0 && (
            <Animated.View
              testID="verdict-du-tableau"
              style={[
                styles.verdict,
                { backgroundColor: auVert ? c.green : bilan.dangers > 0 ? c.danger : c.amber, transform: [{ scale: pulse }] },
              ]}>
              <Svg width={16} height={16} viewBox="0 0 24 24">
                <Path d={auVert ? CHECK : CADENAS} fill="#FFFFFF" />
              </Svg>
              <Text style={styles.verdictTexte}>
                {auVert
                  ? 'Conforme à ce qui se voit'
                  : `${bilan.bloquants} point${bilan.bloquants > 1 ? 's' : ''} bloquant${bilan.bloquants > 1 ? 's' : ''}`}
              </Text>
              <Text style={styles.verdictRegles}>
                {tenues}/{jugees.length} règles
              </Text>
            </Animated.View>
          )}
          {departs.length > 0 && (
            <View style={styles.jauge}>
              <Animated.View
                style={[
                  styles.jaugePleine,
                  {
                    backgroundColor: auVert ? c.green : c.blue,
                    width: jauge.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>
          )}

          <ScrollView style={styles.corps} contentContainerStyle={styles.corpsFond} keyboardShouldPersistTaps="handled">
            {/* ------------------------------------------- le coffret */}
            <View style={styles.coffretReglages}>
              <View style={styles.pas}>
                <Text style={styles.pasMot}>Rangées</Text>
                <TouchableOpacity
                  accessibilityLabel="Une rangée de moins"
                  style={styles.pasBouton}
                  onPress={() => changerRangees(impl.rangees - 1)}>
                  <Text style={styles.pasSigne}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.pasValeur, impl.rangees < RANGEES_MIN && { color: c.danger }]}>{impl.rangees}</Text>
                <TouchableOpacity
                  accessibilityLabel="Une rangée de plus"
                  style={styles.pasBouton}
                  onPress={() => changerRangees(impl.rangees + 1)}>
                  <Text style={styles.pasSigne}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.segment}>
                {[13, 18].map((m) => (
                  <TouchableOpacity
                    key={m}
                    accessibilityLabel={`${m} modules par rangée`}
                    accessibilityState={{ selected: impl.parRangee === m }}
                    style={[styles.segmentCase, impl.parRangee === m && { backgroundColor: c.blue }]}
                    onPress={() => changerLargeur(m)}>
                    <Text style={[styles.segmentTexte, impl.parRangee === m && { color: '#FFFFFF' }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {!impl.decrit && (
              <Text style={styles.aide}>
                Deux rangées de treize, supposées : touchez −, + ou la largeur pour décrire le vôtre.
              </Text>
            )}

            <TableauVivant
              impl={impl}
              fautes={fautes}
              choisi={choisi}
              rangeeVisee={choisi ? null : visee}
              onPlace={(r) => {
                setChoisi(null);
                setVisee(r);
                setRefus(null);
                haptic('leger');
              }}
              onModule={(id) => {
                setChoisi(choisi === id ? null : id);
                setRefus(null);
                haptic('leger');
              }}
            />

            {refus && (
              <View style={styles.refus} accessibilityLiveRegion="polite">
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Path d={CADENAS} fill={c.danger} />
                </Svg>
                <Text style={styles.refusTexte}>{refus}</Text>
              </View>
            )}

            {/* ------------------------------ ce qu'on clipse, ou ce qu'on règle */}
            {!choix && visee !== null && (
              <View style={styles.palette} testID="palette-du-tableau">
                <Text style={styles.section}>
                  Rangée {visee + 1} · {impl.libres[visee] ?? 0} place{(impl.libres[visee] ?? 0) > 1 ? 's' : ''} libre
                  {(impl.libres[visee] ?? 0) > 1 ? 's' : ''}
                </Text>
                <Text style={styles.aide}>Disjoncteur — le calibre lu sur la manette :</Text>
                <View style={styles.rangeeBoutons}>
                  {CALIBRES.map((a) => (
                    <TouchableOpacity
                      key={a}
                      style={styles.calibre}
                      accessibilityLabel={`Disjoncteur ${a} ampères`}
                      onPress={() => poser({ organe: 'disjoncteur', calibre: a })}>
                      <Text style={styles.calibreTexte}>{a} A</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={[styles.rangeeBoutons, { marginTop: 10 }]}>
                  {ORGANES.map((o) => {
                    const manque = (impl.libres[visee] ?? 0) < largeurDe(o.modele);
                    return (
                      <TouchableOpacity
                        key={o.cle}
                        accessibilityLabel={`Clipser : ${o.nom}${o.modele.typeDiff ? ` type ${o.modele.typeDiff}` : ''}`}
                        accessibilityState={{ disabled: manque }}
                        style={[
                          styles.tuile,
                          o.organe === 'differentiel' && { backgroundColor: c.blue },
                          manque && styles.tuileManque,
                        ]}
                        onPress={() =>
                          manque
                            ? refuser(`${o.nom} : ${largeurDe(o.modele)} places, il n’en reste ${impl.libres[visee] ?? 0} en rangée ${visee + 1}.`)
                            : poser(o.modele)
                        }>
                        <Text style={[styles.tuileNom, o.organe === 'differentiel' && { color: '#FFFFFF' }]}>{o.nom}</Text>
                        <Text style={[styles.tuileNote, o.organe === 'differentiel' && { color: 'rgba(255,255,255,0.85)' }]}>
                          {manque ? 'plus de place ici' : o.note}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {departs.length > 0 && <Text style={styles.aide}>Touchez un organe du tableau pour noter ce qu’il commande.</Text>}
              </View>
            )}

            {choix && choixImpl && (
              <View style={styles.reglage} testID="reglage-organe">
                <View style={styles.reglageTete}>
                  <Text style={styles.reglageNom}>{nommerOrgane(choix)}</Text>
                  <Text style={styles.reglageOu}>
                    Rangée {choixImpl.rangee + 1}
                    {choix.sousDifferentiel
                      ? ` · sous le différentiel ${numeroDuDiff(impl, choix.sousDifferentiel)}`
                      : choix.organe === 'disjoncteur' || choix.organe === 'fusible'
                        ? ' · sans différentiel en amont'
                        : ''}
                  </Text>
                </View>
                {fautesDuChoix.map((k) => (
                  <Text key={k.id} style={[styles.fauteLigne, { color: c[TEINTE[k.gravite]] as string }]}>
                    {k.titre} — {k.remede}
                  </Text>
                ))}
                {choix.organe === 'differentiel' ? (
                  <>
                    <Text style={styles.aide}>Type</Text>
                    <Puces
                      valeurs={['A', 'AC', 'F'] as const}
                      actuelle={choix.typeDiff}
                      mot={(t) => t}
                      onChoix={(t) => onModifier(choix.id, { typeDiff: t })}
                    />
                    <Text style={styles.aide}>Sensibilité</Text>
                    <Puces
                      valeurs={[30, 300]}
                      actuelle={choix.sensibilite}
                      mot={(s) => `${s} mA`}
                      onChoix={(s) => onModifier(choix.id, { sensibilite: s })}
                    />
                  </>
                ) : choix.organe === 'parafoudre' || choix.organe === 'agcp' ? null : (
                  <>
                    <Text style={styles.aide}>Ce qu’il commande</Text>
                    <View style={styles.rangeeBoutons}>
                      {USAGES_DU_TABLEAU.map((u) => {
                        const pris = choix.usage === u.nom;
                        const max = calibreMaxDe(u.nom);
                        const tropFort = !!(max && choix.calibre && choix.calibre > max && choix.organe === 'disjoncteur');
                        return (
                          <TouchableOpacity
                            key={u.nom}
                            accessibilityLabel={u.nom}
                            accessibilityState={{ selected: pris }}
                            style={[styles.choix, pris && { backgroundColor: u.teinte }]}
                            onPress={() => {
                              onModifier(choix.id, { usage: u.nom });
                              haptic(tropFort ? 'alerte' : 'leger');
                            }}>
                            <View style={[styles.pastilleUsage, { backgroundColor: pris ? '#FFFFFF' : u.teinte }]} />
                            <Text style={[styles.choixTexte, pris && { color: '#FFFFFF' }]}>{u.nom}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {choix.organe !== 'telerupteur' && choix.organe !== 'contacteur' && (
                      <>
                        <Text style={styles.aide}>Calibre</Text>
                        <Puces
                          valeurs={CALIBRES}
                          actuelle={choix.calibre ?? undefined}
                          mot={(a) => `${a} A`}
                          alerte={(a) => {
                            const max = calibreMaxDe(choix.usage);
                            return choix.organe === 'disjoncteur' && !!max && a > max;
                          }}
                          onChoix={(a) => onModifier(choix.id, { calibre: a })}
                        />
                      </>
                    )}
                  </>
                )}
                {onDeplacer && (
                  <View style={styles.deplacer}>
                    <Fleche mot="◀" label="Une place à gauche" onPress={() => onDeplacer(choix.id, { pas: -1 })} />
                    <Fleche mot="▶" label="Une place à droite" onPress={() => onDeplacer(choix.id, { pas: 1 })} />
                    <Fleche
                      mot="▲"
                      label="Rangée du dessus"
                      onPress={() =>
                        choixImpl.rangee > 0
                          ? deplacerVers(choixImpl.rangee - 1)
                          : refuser('C’est déjà la rangée du haut.')
                      }
                    />
                    <Fleche
                      mot="▼"
                      label="Rangée du dessous"
                      onPress={() =>
                        choixImpl.rangee < impl.rangees - 1
                          ? deplacerVers(choixImpl.rangee + 1)
                          : refuser('C’est déjà la rangée du bas : ajoutez-en une pour descendre.')
                      }
                    />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.retirer}
                  onPress={() => {
                    onRetirer(choix.id);
                    setChoisi(null);
                    haptic('leger');
                  }}>
                  <Text style={styles.retirerTexte}>Retirer cet organe</Text>
                </TouchableOpacity>
              </View>
            )}

            {impl.horsRail.length > 0 && (
              <View style={styles.horsRail}>
                <Text style={styles.section}>Hors du rail</Text>
                {impl.horsRail.map((d) => (
                  <Text key={d.id} style={styles.aide}>
                    {nommerOrgane(d)} : plus de place pour lui — ajoutez une rangée.
                  </Text>
                ))}
              </View>
            )}

            {/* --------------------------------------- la grille du contrôle */}
            {departs.length > 0 && (
              <>
                <Text style={styles.section}>Le contrôle</Text>
                <View style={styles.grille}>
                  {grille.map((g) => (
                    <View key={g.id} style={styles.regle} accessibilityLabel={`${g.titre} : ${g.ok === null ? 'à relever' : g.ok ? 'respectée' : 'bloquante'}`}>
                      <View
                        style={[
                          styles.regleRond,
                          { backgroundColor: g.ok === null ? c.surfaceSunken : g.ok ? c.green : c.danger },
                        ]}>
                        {g.ok !== null && (
                          <Svg width={11} height={11} viewBox="0 0 24 24">
                            <Path d={g.ok ? CHECK : CADENAS} fill="#FFFFFF" />
                          </Svg>
                        )}
                      </View>
                      <Text style={[styles.regleTexte, g.ok === null && { color: c.inkFaint }]}>
                        {g.titre}
                        {g.ok === null ? ' — à relever' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* --------------------------------------------- ce qu'il faut reprendre */}
            {departs.length > 0 && constats.length > 0 && (
              <>
                <Text style={styles.section}>Ce qu’il faut reprendre</Text>
                {constats.map((k) => (
                  <View key={k.id} style={styles.constat}>
                    <View style={[styles.etiquette, { backgroundColor: c[TEINTE[k.gravite]] as string }]}>
                      <Text style={styles.etiquetteTexte}>{MOT[k.gravite]}</Text>
                    </View>
                    <Text style={styles.constatTitre}>{k.titre}</Text>
                    <Text style={styles.constatDetail}>{k.detail}</Text>
                    <Text style={styles.constatRemede}>→ {k.remede}</Text>
                  </View>
                ))}
              </>
            )}

            {/* ------------------------------------------- le même, sur le plan */}
            {(onPlacer || onVoir) && (
              <View style={styles.lien} testID="lien-plan-tableau">
                <Text style={styles.lienTitre}>{surLePlan ? 'Sur le plan' : 'Pas encore sur le plan'}</Text>
                <Text style={styles.lienTexte}>
                  {surLePlan
                    ? `Posé${surLePlan.piece ? ` — ${surLePlan.piece}` : ''} : il s’y dessine tel qu’ici, organe pour organe, au mur comme en 3D.`
                    : 'Posez-le au mur : il s’y dessinera tel qu’ici, organe pour organe.'}
                </Text>
                {surLePlan && onVoir ? (
                  <TouchableOpacity style={styles.lienBouton} onPress={() => quitterPuis(onVoir)}>
                    <Text style={styles.lienBoutonTexte}>Voir sur le mur</Text>
                  </TouchableOpacity>
                ) : !surLePlan && onPlacer ? (
                  <TouchableOpacity style={styles.lienBouton} onPress={() => quitterPuis(onPlacer)}>
                    <Text style={styles.lienBoutonTexte}>Le poser sur le plan</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  function deplacerVers(r: number) {
    if (!choix || !onDeplacer) return;
    if (impl.libres[r] < largeurDe(choix)) {
      refuser(`Rangée ${r + 1} : il n’y reste ${impl.libres[r]} place${impl.libres[r] > 1 ? 's' : ''}.`);
      return;
    }
    onDeplacer(choix.id, { rangee: r });
    setRefus(null);
    haptic('accroche');
  }
}

/** Le rang d'un différentiel sur le tableau, en le lisant : D1, D2… */
function numeroDuDiff(impl: ReturnType<typeof implanter>, id: string): string {
  const ordre = [...impl.modules]
    .sort((a, b) => a.rangee - b.rangee || a.debut - b.debut)
    .filter((m) => m.depart.organe === 'differentiel')
    .map((m) => m.depart.id);
  const k = ordre.indexOf(id);
  return k >= 0 ? `D${k + 1}` : '';
}

function Puces<T extends string | number>({
  valeurs,
  actuelle,
  mot,
  onChoix,
  alerte,
}: {
  valeurs: readonly T[];
  actuelle: T | undefined;
  mot: (v: T) => string;
  onChoix: (v: T) => void;
  alerte?: (v: T) => boolean;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  return (
    <View style={styles.rangeeBoutons}>
      {valeurs.map((v) => {
        const pris = actuelle === v;
        const faux = alerte?.(v) ?? false;
        return (
          <TouchableOpacity
            key={String(v)}
            accessibilityLabel={mot(v)}
            accessibilityState={{ selected: pris }}
            style={[styles.choix, pris && { backgroundColor: faux ? c.amber : c.blue }]}
            onPress={() => {
              onChoix(v);
              haptic(faux ? 'alerte' : 'leger');
            }}>
            <Text style={[styles.choixTexte, pris && { color: '#FFFFFF' }, !pris && faux && { color: c.amber }]}>{mot(v)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Fleche({ mot, label, onPress }: { mot: string; label: string; onPress: () => void }) {
  const styles = getStyles(useTheme());
  return (
    <TouchableOpacity accessibilityLabel={label} style={styles.fleche} onPress={onPress}>
      <Text style={styles.flecheTexte}>{mot}</Text>
    </TouchableOpacity>
  );
}

const getStyles = (c: Palette) =>
  StyleSheet.create({
    fond: {
      flex: 1,
      backgroundColor: 'rgba(11,13,18,0.45)',
      justifyContent: 'flex-end',
    },
    carte: {
      backgroundColor: c.bg,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 20,
      maxHeight: '94%',
      ...shadowCard,
    },
    tete: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    teteTexte: { flex: 1 },
    titre: { color: c.ink, fontSize: 19, fontWeight: '600' },
    sousTitre: { color: c.inkFaint, fontSize: 13, marginTop: 2 },
    croix: { color: c.inkFaint, fontSize: 17, fontWeight: '700' },
    verdict: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    verdictTexte: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700', flex: 1 },
    verdictRegles: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, fontWeight: '600' },
    jauge: { height: 5, borderRadius: 3, backgroundColor: c.surfaceSunken, marginTop: 8, overflow: 'hidden' },
    jaugePleine: { height: 5, borderRadius: 3 },
    corps: { marginTop: 10 },
    corpsFond: { paddingBottom: 20, gap: 4 },
    coffretReglages: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    pas: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pasMot: { color: c.inkSoft, fontSize: 13.5, fontWeight: '600' },
    pasBouton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pasSigne: { color: c.ink, fontSize: 19, fontWeight: '600' },
    pasValeur: { color: c.ink, fontSize: 17, fontWeight: '700', minWidth: 16, textAlign: 'center' },
    segment: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.pill, padding: 3 },
    segmentCase: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
    segmentTexte: { color: c.ink, fontSize: 13.5, fontWeight: '700' },
    refus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 10,
      marginTop: 8,
      borderWidth: 1,
      borderColor: c.danger,
    },
    refusTexte: { color: c.ink, fontSize: 13, flex: 1, lineHeight: 18 },
    palette: { marginTop: 6 },
    section: {
      color: c.ink,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 16,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    aide: { color: c.inkFaint, fontSize: 12.5, marginTop: 8, marginBottom: 6, lineHeight: 17 },
    rangeeBoutons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    calibre: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minWidth: 62,
      alignItems: 'center',
    },
    calibreTexte: { color: c.ink, fontSize: 15, fontWeight: '600' },
    tuile: {
      flexGrow: 1,
      flexBasis: '46%',
      borderRadius: radius.md,
      paddingVertical: 11,
      paddingHorizontal: 13,
      backgroundColor: c.surface,
    },
    tuileManque: { opacity: 0.45 },
    tuileNom: { color: c.ink, fontSize: 14, fontWeight: '600' },
    tuileNote: { color: c.inkFaint, fontSize: 12, marginTop: 1 },
    reglage: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 13,
      marginTop: 10,
      borderWidth: 1.5,
      borderColor: c.blue,
    },
    reglageTete: { gap: 2 },
    reglageNom: { color: c.ink, fontSize: 16, fontWeight: '700' },
    reglageOu: { color: c.inkFaint, fontSize: 12.5 },
    fauteLigne: { fontSize: 12.5, fontWeight: '600', marginTop: 8, lineHeight: 17 },
    choix: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.pill,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    choixTexte: { color: c.ink, fontSize: 13, fontWeight: '700' },
    pastilleUsage: { width: 8, height: 8, borderRadius: 4 },
    deplacer: { flexDirection: 'row', gap: 8, marginTop: 14 },
    fleche: {
      width: 44,
      height: 38,
      borderRadius: 12,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flecheTexte: { color: c.ink, fontSize: 14, fontWeight: '700' },
    retirer: { marginTop: 14, alignItems: 'center' },
    retirerTexte: { color: c.danger, fontSize: 13.5, fontWeight: '700' },
    horsRail: { marginTop: 4 },
    grille: { backgroundColor: c.surface, borderRadius: radius.md, padding: 12, gap: 9 },
    regle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    regleRond: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    regleTexte: { color: c.ink, fontSize: 13.5, flex: 1 },
    constat: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 12,
      marginBottom: 8,
    },
    etiquette: {
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 3,
      marginBottom: 7,
    },
    etiquetteTexte: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
    constatTitre: { color: c.ink, fontSize: 14.5, fontWeight: '700' },
    constatDetail: { color: c.inkSoft, fontSize: 13, marginTop: 3, lineHeight: 18 },
    constatRemede: { color: c.blue, fontSize: 13, marginTop: 6, fontWeight: '600' },
    lien: {
      marginTop: 14,
      backgroundColor: c.blueSoft,
      borderRadius: radius.md,
      padding: 13,
      gap: 4,
    },
    lienTitre: { color: c.ink, fontSize: 14.5, fontWeight: '700' },
    lienTexte: { color: c.inkSoft, fontSize: 13, lineHeight: 18 },
    lienBouton: {
      alignSelf: 'flex-start',
      marginTop: 8,
      backgroundColor: c.blue,
      borderRadius: radius.pill,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    lienBoutonTexte: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' },
  });
