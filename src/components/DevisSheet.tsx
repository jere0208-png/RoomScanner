/**
 * LE DEVIS, ÉTAPE PAR ÉTAPE.
 *
 * Relevé du patron, 27/08/2026 : « Au clic, une page de questions étape par
 * étape : le modèle d'appareillage voulu — Legrand Céliane, Legrand Mosaïc,
 * etc. ; on mentionne que les luminaires ne sont pas comptés (cela dépend des
 * envies) mais tout le reste l'est : gaines (approximativement), fils,
 * appareillages, boîtes d'encastrement. Le résultat : un prix approximatif,
 * avec un récap détaillé, et un plan qui explique pourquoi ce prix. »
 *
 * TROIS ÉCRANS, ET PAS UN DE PLUS. Le choix de la gamme, ce qu'on ne compte
 * pas, le prix. Une question par écran : c'est ce que « étape par étape »
 * veut dire, et c'est aussi ce qui permet de revenir en arrière sans perdre
 * sa réponse.
 *
 * L'ÉCRAN DES EXCLUSIONS N'EST PAS UNE FORMALITÉ. C'est la seule page qui
 * empêche un malentendu de mille euros : quelqu'un qui lit « 2 340 € » sans
 * avoir lu « luminaires non compris » n'a pas lu le devis, il a lu un
 * chiffre. Elle passe donc AVANT le prix, jamais après.
 *
 * LE PLAN EXPLIQUE, IL NE DÉCORE PAS — et il l'explique EN UNE FOIS.
 *
 * Première version : les lots défilaient, entourés d'une bague verte, un
 * toutes les trois secondes. Retirée sur relevé du patron, téléphone en
 * main : « ne fais pas l'animation, fais un simple listing avec les icônes
 * en légende du plan ». Il avait raison sur le fond — on ne lit pas un prix
 * en attendant son tour, et une animation qui cache quatre lignes sur cinq
 * oblige à regarder le plan trois fois pour le comprendre une.
 *
 * La légende dit donc tout ensemble : une ligne par appareil dessiné, avec
 * LE SYMBOLE EXACT du plan — le même tracé, la même couleur —, son nombre,
 * le prix moyen public de l'un d'eux et ce que le lot pèse.
 *
 * ET UNE SEULE ZONE DE DÉFILEMENT. Relevé du patron : « le scroll sur la
 * liste des produits est cassé, il marche rarement ». La page du prix
 * empilait un bloc haut — le plan — au-dessus d'une liste à hauteur bornée,
 * le tout dans une feuille déjà pressable : le doigt tombait une fois sur
 * deux hors de la seule bande qui défilait. Tout le corps de la page ne fait
 * plus qu'un seul rouleau, plan compris. On défile où qu'on pose le doigt.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SheetShell } from './Sheet';
import { FloorplanEditor } from './FloorplanEditor';
import { chiffrer, type Devis, type LigneLegende } from '../geometry/devis';
import { FIXTURES, postsSymbol, type FixtureKind } from '../geometry/electrical';
import { CEILINGS, CEILING_SYMBOL, type CeilingKind } from '../geometry/ceiling';
import { GAMMES, type GammeId } from '../geometry/prix';
import type { BuyRow } from '../geometry/conduits';
import type { Circuit, Differential } from '../geometry/nfc15100';
import { fr } from '../screens/result/format';
import { pluriel } from '../ui/mots';
import { haptic } from '../ui/haptic';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

/** Un prix, écrit comme sur un ticket : virgule et euro collé au nombre. */
const euros = (v: number) => `${fr(v, 2)} €`;

export interface DevisSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Le bordereau de matériel : le devis ne recompte rien (voir `chiffrer`). */
  achats: BuyRow[];
  circuits: Circuit[];
  differentiels: Differential[];
  /** La gamme retenue, gardée d'une ouverture à l'autre. */
  gamme: GammeId;
  onGamme: (g: GammeId) => void;
}

/**
 * LE SYMBOLE D'UN APPAREIL, tel que le plan le dessine.
 *
 * Pas une icône « qui y ressemble » : le MÊME tracé et la MÊME couleur que
 * `FixtureLayer` et `CeilingLayer` posent sur le plan, lus dans les mêmes
 * tables. Une légende qui redessinerait ses propres symboles cesserait
 * d'être une légende le jour où l'un des deux changerait.
 *
 * Les deux calques ne dessinent pas dans la même boîte — le mur travaille
 * sur vingt-deux points de côté, le plafond sur dix-huit : chacun garde donc
 * la sienne, faute de quoi la moitié des symboles sortirait rognée.
 */
function SymboleDuPlan({ ligne }: { ligne: LigneLegende }) {
  if (ligne.plafond) {
    const kind = ligne.kind as CeilingKind;
    const spec = CEILINGS[kind];
    return (
      <Svg width={22} height={22} viewBox="-9 -9 18 18">
        {(CEILING_SYMBOL[kind] ?? []).map((seg, i) => (
          <Path
            key={i}
            d={seg.d}
            stroke={spec.color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={seg.fill ? spec.color : 'none'}
          />
        ))}
      </Svg>
    );
  }
  const kind = ligne.kind as FixtureKind;
  const spec = FIXTURES[kind];
  return (
    <Svg width={22} height={22} viewBox="-11 -11 22 22">
      {postsSymbol([kind], kind).map((seg, i) => (
        <Path
          key={i}
          d={seg.d}
          stroke={spec.color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={seg.fill ? spec.color : 'none'}
        />
      ))}
    </Svg>
  );
}

export function DevisSheet({
  visible,
  onClose,
  achats,
  circuits,
  differentiels,
  gamme,
  onGamme,
}: DevisSheetProps) {
  const c = useTheme();
  const styles = getStyles(c);
  const [etape, setEtape] = useState(0);
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});

  const devis: Devis = useMemo(
    () => chiffrer(achats, circuits, differentiels, gamme),
    [achats, circuits, differentiels, gamme],
  );

  // On rouvre toujours sur la première question : un devis se refait, il ne
  // se reprend pas au milieu.
  useEffect(() => {
    if (visible) setEtape(0);
  }, [visible]);

  const avancer = (n: number) => {
    haptic('leger');
    setEtape(n);
  };

  return (
    <SheetShell visible={visible} onClose={onClose}>
      {/* Le fil des étapes : on doit savoir où l'on en est et pouvoir
          revenir, sinon un choix fait au premier écran devient un choix
          définitif. */}
      <View style={styles.fil}>
        {etape > 0 ? (
          <TouchableOpacity
            accessibilityLabel="Étape précédente"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
            onPress={() => avancer(etape - 1)}>
            <Text style={styles.retour}>‹ Retour</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.retourVide} />
        )}
        <Text style={styles.compteur}>{`${etape + 1} / 3`}</Text>
      </View>

      {etape === 0 && (
        <>
          <Text style={styles.titre}>Quel appareillage ?</Text>
          <Text style={styles.sous}>
            C’est ce qui change le plus le prix : d’une gamme à l’autre, un
            même logement va du simple au double. Le reste — gaines, fils,
            boîtes, tableau — ne bouge pas.
          </Text>
          <ScrollView style={styles.liste} showsVerticalScrollIndicator={false}>
            {GAMMES.map((g) => {
              const choisi = g.id === gamme;
              return (
                <TouchableOpacity
                  key={g.id}
                  accessibilityLabel={`${g.marque} ${g.nom}${
                    choisi ? ', choisi' : ''
                  }`}
                  accessibilityRole="button"
                  activeOpacity={0.75}
                  style={[styles.ligneGamme, choisi && styles.ligneGammeChoisie]}
                  onPress={() => {
                    haptic('leger');
                    onGamme(g.id);
                  }}>
                  <View style={styles.texts}>
                    <Text style={styles.gammeNom}>
                      {`${g.marque} ${g.nom}`}
                    </Text>
                    <Text style={styles.gammeNote}>{g.note}</Text>
                  </View>
                  <View style={[styles.coche, choisi && styles.cocheOn]}>
                    {choisi && <Text style={styles.cocheTexte}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            accessibilityLabel="Continuer"
            accessibilityRole="button"
            activeOpacity={0.85}
            style={styles.action}
            onPress={() => avancer(1)}>
            <Text style={styles.actionTexte}>Continuer</Text>
          </TouchableOpacity>
        </>
      )}

      {etape === 1 && (
        <>
          <Text style={styles.titre}>Ce qui est compté</Text>
          <Text style={styles.sous}>
            Les gaines et les fils sont mesurés sur le tracé du plan — donc
            approximatifs, comme tout métré. L’appareillage, les boîtes
            d’encastrement, les plaques et le tableau sont comptés un par un.
          </Text>
          <ScrollView style={styles.liste} showsVerticalScrollIndicator={false}>
            {devis.exclusions.map((e) => (
              <View key={e} style={styles.exclusion}>
                <Text style={styles.tiret}>—</Text>
                <Text style={styles.exclusionTexte}>{e}</Text>
              </View>
            ))}
            {devis.sansPrix.length > 0 && (
              /*
                CE QUE LE CATALOGUE NE SAIT PAS CHIFFRER SE DIT ICI.

                Un article sans prix compte pour zéro dans le total. Tant
                qu'on ne le dit pas, le total a l'air complet — et c'est la
                seule erreur d'un devis que personne ne rattrape.
              */
              <View style={styles.manque}>
                <Text style={styles.manqueTitre}>
                  {pluriel(
                    devis.sansPrix.length,
                    'article sans prix au catalogue',
                    'articles sans prix au catalogue',
                  )}
                </Text>
                <Text style={styles.manqueTexte}>
                  {`${devis.sansPrix.join(', ')} — comptés pour zéro dans le total.`}
                </Text>
              </View>
            )}
          </ScrollView>
          <TouchableOpacity
            accessibilityLabel="Voir le prix"
            accessibilityRole="button"
            activeOpacity={0.85}
            style={styles.action}
            onPress={() => avancer(2)}>
            <Text style={styles.actionTexte}>Voir le prix</Text>
          </TouchableOpacity>
        </>
      )}

      {etape === 2 && (
        <>
          <View style={styles.entete}>
            <View style={styles.texts}>
              <Text style={styles.total}>{euros(devis.total)}</Text>
              <Text style={styles.sous}>
                {`Fourniture seule, TTC, en ${
                  GAMMES.find((g) => g.id === gamme)?.nom ?? gamme
                }. Prix approximatifs relevés ${devis.version}, à valider au comptoir.`}
              </Text>
            </View>
          </View>

          {/*
            UN SEUL ROULEAU POUR TOUT LE CORPS DE LA PAGE.

            Relevé du patron : « le scroll sur la liste des produits est
            cassé, il marche rarement ». Le plan tenait deux cents points au
            -dessus d'une liste à hauteur bornée : deux blocs, un seul qui
            défilait, et le doigt tombait une fois sur deux sur l'autre. Le
            plan est maintenant DANS le rouleau — on défile où qu'on pose le
            doigt, et le dessin remonte quand on cherche le détail.
          */}
          <ScrollView
            style={styles.corps}
            showsVerticalScrollIndicator={false}
            /* Le plan ne prend aucun toucher : sans cela, ses propres gestes
               de déplacement se disputeraient le défilement de la page. */
            keyboardShouldPersistTaps="handled">
            <View style={styles.cadrePlan} pointerEvents="none">
              <View style={styles.plan}>
                <FloorplanEditor
                  showMeasures={false}
                  editable={false}
                  selectedWallId={null}
                  onSelectWall={() => {}}
                />
              </View>
            </View>

            {/*
              LA LÉGENDE DU PLAN — le même symbole, le même nombre.

              Chaque ligne porte le tracé EXACT que le plan dessine au-dessus :
              on retrouve l'appareil des yeux avant d'avoir lu son nom. Le
              nombre, lui, sort du chiffrage : celui de la légende et celui du
              récapitulatif sont le même (voir `chiffrer`).
            */}
            {devis.legende.length > 0 && (
              <>
                <Text style={styles.section}>Ce que le plan porte</Text>
                {devis.legende.map((l) => (
                  <View key={`${l.plafond ? 'p' : 'm'}-${l.kind}`} style={styles.ligne}>
                    <View style={styles.vignette}>
                      <SymboleDuPlan ligne={l} />
                    </View>
                    <View style={styles.texts}>
                      <Text style={styles.ligneNom}>{l.titre}</Text>
                      <Text style={styles.ligneDetail}>
                        {`${l.quantite} × ${euros(l.pu)} l’unité`}
                      </Text>
                    </View>
                    <Text style={styles.lignePrix}>{euros(l.total)}</Text>
                  </View>
                ))}
              </>
            )}

            <Text style={styles.section}>Le détail, rayon par rayon</Text>
            {devis.parFamille.map((f) => {
              const deplie = !!ouverts[f.famille];
              const lignes = devis.lignes.filter((l) => l.famille === f.famille);
              return (
                <View key={f.famille}>
                  <TouchableOpacity
                    accessibilityLabel={`${f.famille}, ${euros(f.total)}${
                      deplie ? ', déplié' : ''
                    }`}
                    accessibilityRole="button"
                    activeOpacity={0.7}
                    style={styles.famille}
                    onPress={() => {
                      haptic('leger');
                      setOuverts((o) => ({ ...o, [f.famille]: !deplie }));
                    }}>
                    <Text style={styles.familleNom}>{f.famille}</Text>
                    <Text style={styles.famillePrix}>{euros(f.total)}</Text>
                    <Text
                      style={[styles.chevron, deplie && styles.chevronOuvert]}>
                      ›
                    </Text>
                  </TouchableOpacity>
                  {deplie &&
                    lignes.map((l) => (
                      <View key={`${f.famille}-${l.libelle}`} style={styles.ligne}>
                        <View style={styles.texts}>
                          <Text style={styles.ligneNom}>{l.libelle}</Text>
                          <Text style={styles.ligneDetail}>
                            {l.pu === null
                              ? `${l.quantite} ${l.unite} — pas de prix au catalogue`
                              : `${l.quantite} ${l.unite} × ${euros(l.pu)}`}
                          </Text>
                          {!!l.note && (
                            <Text style={styles.ligneNote}>{l.note}</Text>
                          )}
                        </View>
                        <Text style={styles.lignePrix}>{euros(l.total)}</Text>
                      </View>
                    ))}
                </View>
              );
            })}
          </ScrollView>
        </>
      )}
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    fil: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    retour: { color: c.blue, fontSize: 14, fontWeight: '700' },
    retourVide: { width: 1 },
    compteur: { color: c.inkFaint, fontSize: 12, fontWeight: '700' },
    titre: {
      color: c.ink,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    total: {
      color: c.green,
      fontSize: 32,
      fontWeight: '800',
      letterSpacing: -0.8,
    },
    entete: { flexDirection: 'row', alignItems: 'flex-end' },
    sous: { color: c.inkFaint, fontSize: 12, lineHeight: 17, marginTop: 4 },
    liste: { maxHeight: 300, marginTop: 12 },
    /* Le bouton qui fait avancer : quarante-quatre points sous le doigt,
       comme toute commande de l'application. */
    action: {
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: c.green,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    actionTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    texts: { flex: 1 },
    // --------------------------------------------------------- les gammes
    ligneGamme: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: 'transparent',
      paddingHorizontal: 13,
      paddingVertical: 12,
      marginBottom: 8,
    },
    ligneGammeChoisie: { borderColor: c.green },
    gammeNom: { color: c.ink, fontSize: 14.5, fontWeight: '800' },
    gammeNote: { color: c.inkFaint, fontSize: 11.5, lineHeight: 15.5, marginTop: 2 },
    coche: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.inkFaint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cocheOn: { backgroundColor: c.green, borderColor: c.green },
    cocheTexte: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    // ----------------------------------------------------- les exclusions
    exclusion: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    tiret: { color: c.inkFaint, fontSize: 13, lineHeight: 18 },
    exclusionTexte: { flex: 1, color: c.inkSoft, fontSize: 13, lineHeight: 18 },
    manque: {
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      borderLeftColor: c.danger,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 4,
    },
    manqueTitre: { color: c.ink, fontSize: 13, fontWeight: '800' },
    manqueTexte: { color: c.inkFaint, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
    // ------------------------------------------------- le plan et sa légende
    /* Le corps de la page du prix : UN seul rouleau, plan compris. Deux
       zones de défilement l'une sur l'autre se disputaient le doigt. */
    corps: { maxHeight: 430, marginTop: 12 },
    cadrePlan: {
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
      overflow: 'hidden',
    },
    plan: { height: 200 },
    section: {
      color: c.inkFaint,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      marginTop: 16,
      marginBottom: 2,
    },
    /* La vignette du symbole : fond clair, pour que le tracé se détache
       comme il se détache du plan. */
    vignette: {
      width: 32,
      height: 32,
      borderRadius: 9,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // ------------------------------------------------------------ le récap
    famille: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 13,
      paddingBottom: 6,
      paddingHorizontal: 2,
    },
    familleNom: {
      flex: 1,
      color: c.ink,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    famillePrix: { color: c.ink, fontSize: 13.5, fontWeight: '800' },
    chevron: {
      color: c.inkFaint,
      fontSize: 19,
      fontWeight: '700',
      width: 14,
      textAlign: 'center',
    },
    chevronOuvert: { transform: [{ rotate: '90deg' }] },
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 6,
    },
    ligneNom: { color: c.ink, fontSize: 13.5, fontWeight: '700' },
    ligneDetail: { color: c.inkFaint, fontSize: 11.5, marginTop: 2 },
    ligneNote: { color: c.inkFaint, fontSize: 11, lineHeight: 15, marginTop: 3 },
    lignePrix: { color: c.inkSoft, fontSize: 13, fontWeight: '800' },
  }),
);
