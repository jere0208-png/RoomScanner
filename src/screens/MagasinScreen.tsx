/**
 * LE MAGASIN — une page entière, et un caddie qui remplit le devis.
 *
 * Relevé du patron : « tu fais un vrai catalogue aux prix actuels mis à jour
 * avec un maximum de produits utiles, jusqu'aux vis. Page entière Magasin. »
 *
 * UNE PAGE, PAS UNE FEUILLE — et c'est une leçon payée deux fois sur l'écran
 * du devis. `SheetShell` enveloppe son contenu dans deux `Pressable` ; un
 * `Pressable` prend le geste DÈS LE POSÉ du doigt, et une liste posée dessous
 * doit ensuite le lui reprendre au premier millimètre de mouvement — ce
 * rattrapage ne se fait pas. Un catalogue de cent cinquante articles qui ne
 * défile pas n'est pas un catalogue. Donc une PAGE, routée comme les autres
 * écrans, avec le rouleau posé à même l'écran.
 *
 * CE QU'ON VIENT Y CHERCHER, ET DANS QUEL ORDRE. Les rayons sont ceux du
 * chantier — on tire les gaines, on pose les boîtes, on câble, on équipe, on
 * ferme le tableau —, pas l'alphabet. Et la recherche est en tête : sur un
 * catalogue de cette taille, on tape « wago » plus souvent qu'on ne fait
 * défiler.
 *
 * LES QUANTITÉS SE RÈGLENT ICI, AU MÊME ENDROIT QUE LE CHOIX. Un magasin où
 * il faudrait ajouter puis aller ailleurs corriger le nombre est un magasin
 * qu'on quitte deux fois. « − » et « + » sur chaque ligne, et le compte du
 * caddie en bas, toujours visible.
 */
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { BoutonAmazon } from '../components/BoutonAmazon';
import {
  RAYONS,
  catalogueDuMagasin,
  offreAmazon,
  type ArticleTarife,
} from '../geometry/magasin';
import { dateDuReleve } from '../geometry/prix';
import { pourChercher } from '../ui/mots';
import { fr } from './result/format';
import { haptic } from '../ui/haptic';
import { useScanStore } from '../store/scanStore';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

const euros = (v: number) => `${fr(v, 2)} €`;

/** Le « − » et le « + » d'une ligne : deux ronds, rien d'autre. */
function Pas({
  signe,
  actif,
  onPress,
  nom,
}: {
  signe: '-' | '+';
  actif: boolean;
  onPress: () => void;
  nom: string;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={nom}
      disabled={!actif}
      style={[styles.pas, !actif && styles.pasEteint]}
      onPress={() => {
        haptic('leger');
        onPress();
      }}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        {signe === '+' && (
          <Path
            d="M12 5 v14"
            stroke={actif ? c.blue : c.inkFaint}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        )}
        <Path
          d="M5 12 h14"
          stroke={actif ? c.blue : c.inkFaint}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      </Svg>
    </TouchableOpacity>
  );
}

function LigneArticle({
  article,
  quantite,
  onMoins,
  onPlus,
}: {
  article: ArticleTarife;
  quantite: number;
  onMoins: () => void;
  onPlus: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const amazon = offreAmazon(article, article.tarif);
  return (
    <View style={styles.article}>
      <View style={styles.ligne}>
        <View style={styles.texte}>
          <Text style={styles.nom}>{article.libelle}</Text>
          {!!article.precision && (
            <Text style={styles.precision}>{article.precision}</Text>
          )}
          {/*
            D'OÙ VIENT LE PRIX — la même règle qu'au ticket du devis : un prix
            qui cache sa provenance n'est pas un prix, c'est une devinette. On
            écrit l'enseigne quand on l'a vu, et l'on dit « estimation » quand
            on ne l'a pas vu.
          */}
          <Text style={styles.source}>
            {`${article.tarif.source} · ${dateDuReleve(article.tarif.releve)}`}
          </Text>
        </View>
        <View style={styles.droite}>
          <Text style={styles.prix}>{euros(article.tarif.pu)}</Text>
          <Text style={styles.unite}>{`l’${article.unite}`.replace(
            'l’u',
            'l’unité',
          )}</Text>
        </View>
      </View>

      {amazon && (
        <View style={styles.amazon}>
          <BoutonAmazon offre={amazon} reference={article.tarif.pu} />
        </View>
      )}

      <View style={styles.compteur}>
        <Pas
          signe="-"
          actif={quantite > 0}
          nom={`Retirer un ${article.libelle}`}
          onPress={onMoins}
        />
        <Text style={styles.nombre}>{quantite}</Text>
        <Pas
          signe="+"
          actif
          nom={`Ajouter un ${article.libelle}`}
          onPress={onPlus}
        />
        {quantite > 0 && (
          <Text style={styles.sousTotal}>
            {euros(article.tarif.pu * quantite)}
          </Text>
        )}
      </View>
    </View>
  );
}

export function MagasinScreen() {
  const c = useTheme();
  const styles = getStyles(c);
  const setScreen = useScanStore((s) => s.setScreen);
  const gamme = useScanStore((s) => s.gammeDevis);
  const ajouts = useScanStore((s) => s.devisAjouts);
  const ajouterAuDevis = useScanStore((s) => s.ajouterAuDevis);
  const retirerDuDevis = useScanStore((s) => s.retirerDuDevis);
  const [cherche, setCherche] = useState('');

  const catalogue = useMemo(() => catalogueDuMagasin(gamme), [gamme]);

  const trouves = useMemo(() => {
    const q = pourChercher(cherche.trim());
    if (!q) return catalogue;
    return catalogue.filter((a) =>
      pourChercher(`${a.libelle} ${a.precision ?? ''} ${a.rayon}`).includes(q),
    );
  }, [catalogue, cherche]);

  /** Ce que le caddie porte, par code. */
  const pris = useMemo(
    () => new Map(ajouts.map((a) => [a.code, a.quantite])),
    [ajouts],
  );

  const total = useMemo(
    () =>
      catalogue.reduce(
        (s, a) => s + a.tarif.pu * (pris.get(a.code) ?? 0),
        0,
      ),
    [catalogue, pris],
  );
  const articlesPris = ajouts.filter((a) => a.quantite > 0).length;

  return (
    <RetourGlisse onRetour={() => setScreen('devis')} style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.roundButton}
          accessibilityLabel="Retour"
          accessibilityRole="button"
          onPress={() => setScreen('devis')}>
          <BackChevron color={c.ink} />
        </TouchableOpacity>
        <Text style={styles.titrePage}>Magasin</Text>
      </View>

      <Text style={styles.sous}>
        Ce que le plan ne peut pas compter — chevilles, colliers, plâtre,
        aiguille. Ce qu’on ajoute ici entre au devis.
      </Text>

      <TextInput
        accessibilityLabel="Chercher un article au magasin"
        style={styles.recherche}
        placeholder="Chercher — « wago », « vis », « gaine »…"
        placeholderTextColor={c.inkFaint}
        value={cherche}
        onChangeText={setCherche}
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      <ScrollView
        style={styles.rouleau}
        contentContainerStyle={styles.rouleauFond}
        keyboardShouldPersistTaps="handled">
        {RAYONS.map((rayon) => {
          const lot = trouves.filter((a) => a.rayon === rayon);
          if (lot.length === 0) return null;
          return (
            <View key={rayon}>
              <Text style={styles.rayon}>{rayon.toUpperCase()}</Text>
              {lot.map((a) => (
                <LigneArticle
                  key={a.code}
                  article={a}
                  quantite={pris.get(a.code) ?? 0}
                  onMoins={() => {
                    const q = pris.get(a.code) ?? 0;
                    if (q <= 1) retirerDuDevis(a.code);
                    else ajouterAuDevis(a.code, -1);
                  }}
                  onPlus={() => ajouterAuDevis(a.code, 1)}
                />
              ))}
            </View>
          );
        })}
        {trouves.length === 0 && (
          // Une page vide ne dit pas ce qu'il faut faire : celle-ci le dit.
          <Text style={styles.vide}>
            Aucun article ne porte ce mot. Essayez « gaine », « borne »,
            « cheville ».
          </Text>
        )}
      </ScrollView>

      {/*
        LE CADDIE RESTE SOUS LES YEUX. On ajoute quinze articles d'affilée sans
        jamais remonter : le compte et le total doivent être là, en bas, sans
        qu'on aille les chercher.
      */}
      {articlesPris > 0 && (
        <TouchableOpacity
          style={styles.caddie}
          accessibilityRole="button"
          accessibilityLabel={`Voir le devis, ${articlesPris} articles ajoutés, ${fr(total, 2)} euros`}
          onPress={() => {
            haptic('leger');
            setScreen('devis');
          }}>
          <Text style={styles.caddieMot}>
            {`${articlesPris} article${articlesPris > 1 ? 's' : ''} ajouté${
              articlesPris > 1 ? 's' : ''
            }`}
          </Text>
          <Text style={styles.caddiePrix}>{euros(total)}</Text>
        </TouchableOpacity>
      )}
    </RetourGlisse>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
      paddingTop: 60,
      paddingHorizontal: 16,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    roundButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    titrePage: { marginLeft: 8, fontSize: 22, fontWeight: '800', color: c.ink },
    sous: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginBottom: 12 },
    recherche: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.ink,
      fontSize: 14,
      marginBottom: 8,
    },
    rouleau: { flex: 1 },
    rouleauFond: { paddingBottom: 90 },
    rayon: {
      marginTop: 18,
      marginBottom: 6,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: c.inkFaint,
    },
    article: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 12,
      marginBottom: 8,
    },
    ligne: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    texte: { flex: 1 },
    nom: { color: c.ink, fontSize: 14, fontWeight: '700' },
    precision: { color: c.inkSoft, fontSize: 12, marginTop: 2, lineHeight: 16 },
    source: { color: c.inkFaint, fontSize: 10, marginTop: 3 },
    droite: { alignItems: 'flex-end' },
    prix: { color: c.ink, fontSize: 15, fontWeight: '800' },
    unite: { color: c.inkFaint, fontSize: 10, marginTop: 1 },
    amazon: { marginTop: 10 },
    compteur: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 10,
    },
    pas: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.blueSoft,
    },
    pasEteint: { backgroundColor: c.line },
    nombre: {
      minWidth: 26,
      textAlign: 'center',
      color: c.ink,
      fontSize: 15,
      fontWeight: '800',
    },
    sousTotal: { marginLeft: 'auto', color: c.blue, fontWeight: '800' },
    vide: {
      color: c.inkSoft,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 24,
      textAlign: 'center',
    },
    caddie: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.blue,
      borderRadius: radius.lg,
      paddingVertical: 14,
      paddingHorizontal: 18,
    },
    caddieMot: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    caddiePrix: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  }),
);
