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
 * LE PLAN EXPLIQUE, IL NE DÉCORE PAS. Il montre le logement relevé, une
 * bague verte sur un lot d'appareils à la fois, et sous lui la phrase qui
 * dit ce que ce lot pèse. Les lots défilent du plus lourd au plus léger —
 * on explique un prix en commençant par ce qui le fait.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SheetShell } from './Sheet';
import { FloorplanEditor } from './FloorplanEditor';
import { chiffrer, type Devis } from '../geometry/devis';
import { GAMMES, type GammeId } from '../geometry/prix';
import type { BuyRow } from '../geometry/conduits';
import type { Circuit, Differential } from '../geometry/nfc15100';
import { fr } from '../screens/result/format';
import { pluriel } from '../ui/mots';
import { haptic } from '../ui/haptic';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

/** Un prix, écrit comme sur un ticket : virgule et euro collé au nombre. */
const euros = (v: number) => `${fr(v, 2)} €`;

/** Combien de temps chaque lot reste en vedette sur le plan. */
const TEMPS_VEDETTE = 3200;

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
  const [vedette, setVedette] = useState(0);

  const devis: Devis = useMemo(
    () => chiffrer(achats, circuits, differentiels, gamme),
    [achats, circuits, differentiels, gamme],
  );

  // On rouvre toujours sur la première question : un devis se refait, il ne
  // se reprend pas au milieu.
  useEffect(() => {
    if (visible) setEtape(0);
  }, [visible]);

  /*
    LES LOTS SE RELAIENT SUR LE PLAN.

    Un seul à la fois : deux bagues vertes de deux lots différents ne se
    distinguent pas, et l'on ne saurait plus quel chiffre lire sous le
    dessin. Le compteur ne tourne que sur l'écran du prix — ailleurs, il
    ferait travailler l'animation d'un plan que personne ne regarde.
  */
  const nVedettes = devis.vedettes.length;
  useEffect(() => {
    if (!visible || etape !== 2 || nVedettes < 2) return;
    setVedette(0);
    const t = setInterval(
      () => setVedette((v) => (v + 1) % nVedettes),
      TEMPS_VEDETTE,
    );
    return () => clearInterval(t);
  }, [visible, etape, nVedettes]);

  const enVedette = devis.vedettes[Math.min(vedette, Math.max(nVedettes - 1, 0))];

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
            LE PLAN QUI EXPLIQUE LE PRIX.

            Il n'est pas là pour faire joli : chaque lot s'allume à son tour
            sur le logement relevé, et la phrase du dessous dit combien il y
            en a et ce que coûte l'un d'eux. C'est la réponse à « pourquoi ce
            prix », donnée par le dessin plutôt que par un tableau.
          */}
          {enVedette && (
            <View style={styles.cadrePlan}>
              <View style={styles.plan} pointerEvents="none">
                <FloorplanEditor
                  showMeasures={false}
                  editable={false}
                  selectedWallId={null}
                  onSelectWall={() => {}}
                  vedette={{
                    murs: enVedette.murs,
                    plafonds: enVedette.plafonds,
                  }}
                />
              </View>
              <View style={styles.legende}>
                <Text style={styles.legendeTitre}>
                  {`${enVedette.quantite} × ${enVedette.titre.toLowerCase()}`}
                </Text>
                <Text style={styles.legendeDetail}>
                  {`${euros(enVedette.pu)} l’unité · ${euros(enVedette.total)}`}
                </Text>
              </View>
              {nVedettes > 1 && (
                <View style={styles.points}>
                  {devis.vedettes.map((v, i) => (
                    <View
                      key={v.id}
                      style={[styles.point, i === vedette && styles.pointOn]}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          <ScrollView style={styles.liste} showsVerticalScrollIndicator={false}>
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
    // ------------------------------------------------------------- le plan
    cadrePlan: {
      marginTop: 14,
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
      overflow: 'hidden',
    },
    plan: { height: 200 },
    legende: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: 13,
      paddingTop: 9,
    },
    legendeTitre: { color: c.ink, fontSize: 14, fontWeight: '800' },
    legendeDetail: { color: c.green, fontSize: 12.5, fontWeight: '700' },
    /* Les points de défilement : on doit voir qu'il y a d'autres lots, et
       combien, sans attendre que le compteur ait fait le tour. */
    points: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 9,
    },
    point: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: c.inkFaint,
      opacity: 0.35,
    },
    pointOn: { backgroundColor: c.green, opacity: 1 },
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
