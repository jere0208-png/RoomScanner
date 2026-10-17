/**
 * LE DEVIS — « combien j'en aurais pour mon installation actuelle ».
 *
 * Relevé du patron, 27/08/2026 : un bouton vert en haut de l'écran, une page
 * de questions étape par étape (le modèle d'appareillage voulu), et un prix
 * approximatif avec un récapitulatif détaillé et un plan qui EXPLIQUE ce
 * prix.
 *
 * UNE PAGE ENTIÈRE, ET PAS UNE FEUILLE. C'est la troisième forme, et les
 * deux premières ont échoué sur le même point : le défilement. Relevé du
 * patron, deux fois, la seconde sans appel — « ça ne scrolle pas du tout.
 * Fais des pages entières pas des pop-up ».
 *
 *   POURQUOI LA FEUILLE NE POUVAIT PAS MARCHER. `SheetShell` enveloppe tout
 *   son contenu dans deux `Pressable` — le voile qui ferme, et la feuille
 *   elle-même qui arrête l'appui pour ne pas se fermer sous le doigt. Un
 *   `Pressable` prend le geste DÈS LE POSÉ du doigt ; une liste posée
 *   dessous doit ensuite le lui reprendre au premier millimètre de
 *   mouvement, et ce rattrapage ne se fait pas. Réduire la page à un seul
 *   rouleau avait amélioré les choses sans les régler : le défaut n'est pas
 *   dans le nombre de zones, il est dans la coquille.
 *
 *   UNE PAGE, ELLE, N'A PAS DE COQUILLE. Le rouleau est posé à même l'écran,
 *   rien au-dessus de lui ne réclame le doigt, et le retour se fait par le
 *   chevron ou par le bord — comme sur les quatre autres écrans de
 *   l'application, qui défilent tous très bien.
 *
 * DES ÉTAPES QUI SE VOIENT. Relevé du même passage : « fais des étapes
 * modernes avec des gros titres et numéros ». Un fil de trois pastilles
 * numérotées en tête, la pastille courante pleine, celles qui sont faites
 * cochées ; puis « ÉTAPE 2 SUR 3 » et un titre qui tient sur une ligne et
 * demie. On sait où on est sans compter.
 *
 * TOUT LE DEVIS EST BLEU. Il a été vert — relevé du patron : « change le
 * vert du bouton en bleu pour le devis, et même les couleurs dans les pages,
 * on veut du bleu ; donne un style unique à ton bleu, partout ». Le vert dit
 * « conforme » dans cette application, et la pastille des normes le dit déjà
 * juste à côté : deux verts voisins pour deux choses sans rapport. C'est donc
 * `c.blue`, celui de toute l'application — une teinte qui n'existe qu'à un
 * endroit n'est pas une couleur, c'est une exception.
 *
 * LE PLAN EXPLIQUE, IL NE DÉCORE PAS — et il l'explique EN UNE FOIS. La
 * première version faisait défiler des lots entourés d'une bague verte, un
 * toutes les trois secondes ; retirée sur relevé du patron : « ne fais pas
 * l'animation, fais un simple listing avec les icônes en légende du plan ».
 * Il avait raison sur le fond — on ne lit pas un prix en attendant son tour.
 */
import { PoseEstimee } from '../components/PoseEstimee';
import {
  TAUX_DE_TVA,
  TVA_DES_PRIX_PUBLICS,
  pourcent,
  prixDAchat,
  prixDuDevis,
  type LigneLibre,
  type LigneVendue,
  type TypeDeLigneLibre,
} from '../geometry/mainDOeuvre';
import { useReglagesPose } from '../store/reglagesPose';
import { usePremieresFois } from '../store/premieresFois';
import { useUsage } from '../store/usage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { BackChevron } from '../components/BackChevron';
import { PromptSheet, type PromptData } from '../components/Sheet';
import { RoomScan } from 'react-native-room-scan';
import { buildDevisPdf, devisFilename, toBase64 } from '../export/pdf';
import { useAccountStore } from '../store/accountStore';
import { PAIEMENT_MAX, entrepriseAImprimer, useEntreprise } from '../store/entreprise';
import { alerte } from '../ui/alerte';
import { panne as expliquer } from '../ui/panne';
import { RetourGlisse } from '../components/RetourGlisse';
import { FloorplanEditor } from '../components/FloorplanEditor';
import { DevisAttention } from '../components/DevisAttention';
import { checkElectrical, wallToRooms } from '../geometry/nfc15100';
import { TotalQuiMonte } from '../components/TotalQuiMonte';
import {
  ageDuCatalogue,
  cleDeLigne,
  type Devis,
  type LigneDevis,
  type LigneLegende,
} from '../geometry/devis';
import { chiffrerLePlan, placerAuxNiveaux } from '../geometry/devisplan';
import { CEILINGS, CEILING_SYMBOL, type CeilingKind } from '../geometry/ceiling';
import { FIXTURES, motDansLeRond, postsSymbol, type FixtureKind } from '../geometry/electrical';
import {
  ENSEIGNE_PUBLIQUE,
  GAMMES,
  cleDuTarif,
  dateDuReleve,
  moisDeLaVersion,
} from '../geometry/prix';
import { achatPro, type PrixPro } from '../geometry/tarifPro';
import { usePrixPro } from '../store/prixPro';
import { importPossible } from '../native/tarifPro';
import { refsPourLeRapprochement } from '../data/refsCatalogue';
import { CartePrixPro, motDeLImport } from '../components/CartePrixPro';
import {
  ATTENTE_MIN,
  BandeauTarifs,
  PrixQuiSActualisent,
} from '../components/PrixQuiSActualisent';
import { verifierLesTarifs, type IssueTarifs } from '../net/tarifs';
import { photoDe } from '../ui/produits';
import { VignetteProduit } from '../components/VignetteProduit';
import { pourChercher } from '../ui/mots';
import { fr } from './result/format';
import { haptic } from '../ui/haptic';
import { useScanStore } from '../store/scanStore';
import { ombreBouton, radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';

/** Un prix, écrit comme sur un ticket : virgule, et l'euro collé au nombre. */
const euros = (v: number) => `${fr(v, 2)} €`;

/**
 * CE QU'ON ÉCRIT QUAND AUCUN CATALOGUE N'EST ARRIVÉ.
 *
 * Pas « inconnu » : les prix embarqués ont une provenance, elle est écrite
 * dans `prix.ts` — des ordres de grandeur du marché français, posés à la
 * main, qui attendent d'être relus par quelqu'un qui achète. Le dire est plus
 * honnête que de laisser croire à un relevé d'enseigne.
 */
const TARIF_EMBARQUE = 'Estimation EchoPlan';

/*
  DEUX ÉTAPES, ET IL Y EN AVAIT TROIS.

  La première demandait la gamme d'appareillage. Elle est partie sur sa propre
  page (`GammeScreen`), ouverte depuis l'estimation : on choisissait sa marque
  AVANT d'avoir vu le moindre prix, c'est-à-dire avant d'avoir la seule
  information qui permette de choisir. Reste ce qui doit se lire dans l'ordre :
  ce que le prix ne contient pas, puis le prix.
*/
const ETAPES = [
  { titre: 'À savoir avant le prix', court: 'À savoir' },
  { titre: 'Votre estimation', court: 'Prix' },
];
/** Le rang de l'estimation : le seul écran qui montre des chiffres. */
const ETAPE_PRIX = 1;

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
      <Svg width={24} height={24} viewBox="-9 -9 18 18">
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
    <Svg width={24} height={24} viewBox="-11 -11 22 22">
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
      {(() => {
        // Un rond seul se confond : il porte son mot (« VP », « 20A »).
        const mot = motDansLeRond(kind);
        return mot ? (
          <SvgText
            x={mot.x}
            y={mot.y + mot.taille * 0.36}
            fontSize={mot.taille}
            fontWeight="800"
            fill={spec.color}
            textAnchor="middle">
            {mot.texte}
          </SvgText>
        ) : null;
      })()}
    </Svg>
  );
}

/**
 * LA VIGNETTE D'UNE LIGNE DU TICKET.
 *
 * La photo du produit quand on l'a — c'est ce que le patron a demandé, et
 * c'est ce qui fait qu'on reconnaît l'article avant de lire son nom. À
 * défaut, LE SYMBOLE DU PLAN : un article sans photo garde ainsi une image,
 * et le ticket ne se troue pas. C'est aussi ce qui rend le catalogue de
 * photos facultatif — on peut en ajouter une demain sans toucher à l'écran.
 */
function Vignette({ ligne }: { ligne: { code: string; libelle?: string } }) {
  const plafond = ligne.code.startsWith('plafond-');
  const kind = plafond ? ligne.code.slice(8) : ligne.code.slice(5);
  /*
    LE SYMBOLE DU PLAN PASSE AVANT LA PASTILLE AU NOM, et après la photo. Pour
    un appareil, le dessin du plan dit plus que trois mots écrits petit : c'est
    celui qu'on a sous les yeux sur le relevé.
  */
  if (!photoDe(ligne.code) && (ligne.code.startsWith('meca-') || plafond)) {
    return <SymboleDuPlan ligne={{ kind, plafond } as LigneLegende} />;
  }
  /*
    ET LE TROISIÈME REPLI, QUI MANQUAIT : un article venu du magasin — du
    plâtre, une aiguille, une alimentation LED — n'a ni photo ni symbole, et la
    vignette rendait `null`. La ligne s'ouvrait sur un carré vide, ce qui se lit
    comme une panne. Relevé du patron, à propos du magasin : « si pas dispo
    marque sur l'image ». Même règle ici, et le même composant.
  */
  return (
    <VignetteProduit code={ligne.code} libelle={ligne.libelle ?? ''} taille={38} />
  );
}

/**
 * UNE LIGNE DU TICKET — et le geste qui l'écarte.
 *
 * Relevé du patron : « fais en sorte qu'on puisse désélectionner des éléments
 * dans le devis si on en a pas besoin, le prix doit s'adapter ». Toute la
 * ligne est le bouton : viser une case à cocher de vingt points au milieu
 * d'une liste, sur un chantier, avec des gants, ne marche pas. La case dit ce
 * qui se passe ; c'est la ligne qui le fait.
 */
function Article({
  ligne,
  styles,
  couleurs,
  onBasculer,
  onMoins,
  onPlus,
  onPrix,
  pro,
  distributeur,
  vente,
  coefficient,
}: {
  ligne: LigneDevis;
  /**
   * SON PRIX DE VENTE HT — relevé d'un électricien artisan : il pense en
   * hors taxes. Celui de `prixDuDevis` : public ramené HT, ou achat ×
   * coefficient, ou le sien.
   */
  vente?: LigneVendue<LigneDevis>;
  /** Le coefficient appliqué à cette ligne, pour le dire à l'artisan seul. */
  coefficient?: number | null;
  styles: ReturnType<typeof getStyles>;
  couleurs: Palette;
  onBasculer: () => void;
  onMoins: () => void;
  onPlus: () => void;
  /** Corriger le prix unitaire (voir `prixAjuste`). */
  onPrix?: () => void;
  /** Le prix d'achat de l'électricien, quand son tarif reconnaît l'article. */
  pro?: PrixPro;
  distributeur?: string;
}) {
  const hors = !!ligne.ecarte;
  const puHt = vente?.puHt ?? null;
  return (
    <TouchableOpacity
      accessibilityLabel={`${ligne.libelle}${hors ? ', écarté du devis' : ''}`}
      accessibilityRole="button"
      activeOpacity={0.7}
      style={styles.article}
      onPress={onBasculer}>
      <View style={[styles.vignette, hors && styles.efface]}>
        <Vignette ligne={ligne} />
      </View>
      <View style={styles.texts}>
        <Text style={[styles.articleNom, hors && styles.barre]}>
          {ligne.libelle}
        </Text>
        {/*
          LE PRIX SE TOUCHE POUR SE CORRIGER — correctif de l'audit : les prix
          unitaires ne se modifiaient pas. Le prix est souligné : c'est lui
          qu'on touche, pas la ligne (qui, elle, écarte l'article).
        */}
        {onPrix && !hors ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Modifier le prix : ${ligne.libelle}`}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            onPress={onPrix}>
            <Text style={styles.articleDetail}>
              {puHt === null ? `${ligne.quantite} ${ligne.unite} — ` : `${ligne.quantite} ${ligne.unite} × `}
              <Text style={styles.articlePrixTouchable}>
                {puHt === null ? 'fixer un prix' : `${euros(puHt)} HT`}
              </Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.articleDetail}>
            {puHt === null
              ? `${ligne.quantite} ${ligne.unite} — pas de prix au catalogue`
              : `${ligne.quantite} ${ligne.unite} × ${euros(puHt)} HT`}
          </Text>
        )}
        {/*
          D'OÙ SORT CE PRIX — relevé du patron : « fournir une référence pour
          le prix (ex : Castorama - date) ».

          Elle est sur la LIGNE, et pas seulement en tête du ticket : un
          catalogue reçu ne couvre pas tout le bordereau, et les articles
          qu'il ignore gardent le prix embarqué, plus vieux et posé à la main.
          Une seule référence en haut de page les ferait tous passer pour des
          prix d'enseigne relevés le même jour.
        */}
        {/*
          CE QUI VIENT DU MÉTRÉ ET CE QUI N'EN VIENT PAS — la confiance qu'on
          accorde à un nombre n'est pas la même, et le devis ne doit pas les
          confondre. « Corrigé » : le plan disait autre chose, c'est
          l'électricien qui a tranché. « Du magasin » : aucun plan n'aurait pu
          le compter.
        */}
        {(ligne.ajustee || ligne.duMagasin) && (
          <Text style={styles.articleOrigine}>
            {ligne.duMagasin ? 'Pris au magasin' : 'Quantité corrigée'}
          </Text>
        )}
        {ligne.prixAjuste && <Text style={styles.articleOrigine}>Prix modifié</Text>}
        {!!ligne.source && ligne.pu !== null && (
          <Text style={styles.articleSource}>
            {`${ligne.source}${ligne.releve ? ` · ${dateDuReleve(ligne.releve)}` : ''}`}
          </Text>
        )}
        {/*
          LE PRIX DE CHAQUE MAGASIN, EN PETIT — relevé du patron : « liste en
          petit le prix de chaque magasin ; le devis total se fiera au prix le
          moins cher ». Le premier est celui que le total retient.
        */}
        {!!ligne.offres && ligne.offres.length > 1 && (
          <Text style={styles.articleOffres} testID="offres-de-la-ligne">
            {ligne.offres.map((o) => `${o.enseigne} ${euros(o.pu)}`).join(' · ')}
          </Text>
        )}
        {/* SON PRIX D'ACHAT, À LUI — en plus du prix public, jamais à sa place. */}
        {/*
          ET, QUAND SON COEFFICIENT S'APPLIQUE, LE DIRE — à lui seul : le PDF
          du client n'imprime que le prix de vente.
        */}
        {!!pro && (
          <Text style={styles.articlePro}>
            {`Achat pro ${euros(pro.pu)} HT${distributeur ? ` · ${distributeur}` : ''}${
              vente?.auCoefficient && coefficient ? ` · vendu × ${fr(coefficient, 2)}` : ''
            }`}
          </Text>
        )}
        {!!ligne.note && <Text style={styles.articleNote}>{ligne.note}</Text>}
      </View>
      <View style={styles.colonneDroite}>
        <Text style={[styles.articlePrix, hors && styles.barre]}>
          {hors ? euros(vente?.brutHt ?? 0) : euros(vente?.totalHt ?? 0)}
        </Text>
        {/*
          « − » ET « + », SUR LA LIGNE ELLE-MÊME — relevé du patron : « ajoute
          la possibilité d'augmenter ou diminuer le nombre de produits dans le
          devis ».

          Ils ne s'affichent pas sur une ligne écartée : un article qu'on ne
          veut pas n'a pas de quantité à régler, et deux boutons qui ne
          servent à rien donnent à l'écran l'air d'être en panne. Ils ne
          s'affichent pas non plus sur une ligne SANS PRIX — corriger le
          nombre d'un article que le catalogue ne sait pas chiffrer ne
          changerait aucun total.
        */}
        {!hors && ligne.pu !== null && (
          <View style={styles.pasRangee}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Un ${ligne.libelle} de moins`}
              disabled={ligne.quantite <= 0}
              style={[styles.pas, ligne.quantite <= 0 && styles.pasEteint]}
              onPress={onMoins}>
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path
                  d="M5 12 h14"
                  stroke={ligne.quantite <= 0 ? couleurs.inkFaint : couleurs.blue}
                  strokeWidth={2.8}
                  strokeLinecap="round"
                />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Un ${ligne.libelle} de plus`}
              style={styles.pas}
              onPress={onPlus}>
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path
                  d="M12 5 v14 M5 12 h14"
                  stroke={couleurs.blue}
                  strokeWidth={2.8}
                  strokeLinecap="round"
                />
              </Svg>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

/** « 12,5 », « 12.5 », « 1 200 » : un nombre français, ou rien. */
function nombreSaisi(t: string): number | null {
  const s = t.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

const MOTS_DU_TYPE: Record<TypeDeLigneLibre, string> = {
  fourniture: 'Fourniture',
  mainDOeuvre: 'Main-d’œuvre',
  forfait: 'Forfait',
};

/**
 * LES LIGNES QU'UN ÉLECTRICIEN ÉCRIT À CHAQUE DEVIS — relevé de l'artisan.
 * Un appui remplit la désignation et le type ; le prix reste le sien.
 */
const LIGNES_COURANTES: { designation: string; type: TypeDeLigneLibre; unite: string }[] = [
  { designation: 'Dépose ancien tableau', type: 'forfait', unite: 'forfait' },
  { designation: 'Déplacement', type: 'forfait', unite: 'forfait' },
  { designation: 'Consuel', type: 'forfait', unite: 'forfait' },
  { designation: 'Mise en service', type: 'forfait', unite: 'forfait' },
];

/**
 * UNE LIGNE LIBRE, À ÉCRIRE OU À CORRIGER — relevé d'un électricien artisan
 * (2 salariés, sur Obat et Batappli) : « Dépose ancien tableau »,
 * « Déplacement », « Consuel », « Mise en service » n'avaient nulle part où
 * aller. Désignation, quantité, unité, prix unitaire HT et type, sur la page
 * même : une feuille par champ aurait demandé cinq allers-retours.
 */
function EditeurLigneLibre({
  initiale,
  styles,
  onValider,
  onAnnuler,
  onRetirer,
}: {
  initiale: LigneLibre | null;
  styles: ReturnType<typeof getStyles>;
  onValider: (l: LigneLibre) => void;
  onAnnuler: () => void;
  onRetirer?: () => void;
}) {
  const c = useTheme();
  const [designation, setDesignation] = useState(initiale?.designation ?? '');
  const [quantite, setQuantite] = useState(initiale ? fr(initiale.quantite, Number.isInteger(initiale.quantite) ? 0 : 2) : '1');
  const [unite, setUnite] = useState(initiale?.unite ?? 'u');
  const [pu, setPu] = useState(initiale ? fr(initiale.puHt, 2) : '');
  const [type, setType] = useState<TypeDeLigneLibre>(initiale?.type ?? 'forfait');
  const [faute, setFaute] = useState<string | null>(null);
  const valider = () => {
    const q = nombreSaisi(quantite);
    const p = nombreSaisi(pu);
    if (!designation.trim()) return setFaute('Écrivez la désignation de la ligne.');
    if (q === null || q <= 0) return setFaute('La quantité doit être un nombre plus grand que zéro.');
    if (p === null || p < 0) return setFaute('Le prix unitaire HT doit être un nombre.');
    haptic('leger');
    onValider({
      id: initiale?.id ?? `libre-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      designation: designation.trim(),
      quantite: q,
      unite: unite.trim() || 'u',
      puHt: Math.round(p * 100) / 100,
      type,
    });
  };
  const champ = (
    label: string,
    value: string,
    onChange: (t: string) => void,
    extra: Partial<React.ComponentProps<typeof TextInput>> = {},
  ) => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={c.inkFaint}
      style={styles.libreChamp}
      value={value}
      onChangeText={(t) => {
        onChange(t);
        setFaute(null);
      }}
      {...extra}
    />
  );
  return (
    <View style={styles.libreEditeur}>
      <Text style={styles.rayonNom}>{initiale ? 'Modifier la ligne' : 'Nouvelle ligne libre'}</Text>
      {!initiale && (
        <View style={styles.libreCourantes}>
          {LIGNES_COURANTES.map((x) => (
            <TouchableOpacity
              key={x.designation}
              accessibilityRole="button"
              accessibilityLabel={`Ligne courante : ${x.designation}`}
              style={styles.triPille}
              onPress={() => {
                haptic('leger');
                setDesignation(x.designation);
                setType(x.type);
                setUnite(x.unite);
                setQuantite('1');
                setFaute(null);
              }}>
              <Text style={styles.triTexte}>{x.designation}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {champ('Désignation', designation, setDesignation, { autoCorrect: false })}
      <View style={styles.libreRangee}>
        <View style={styles.libreCase}>{champ('Quantité', quantite, setQuantite, { keyboardType: 'decimal-pad' })}</View>
        <View style={styles.libreCase}>{champ('Unité', unite, setUnite, { autoCorrect: false })}</View>
        <View style={styles.libreCase}>{champ('Prix unitaire HT', pu, setPu, { keyboardType: 'decimal-pad' })}</View>
      </View>
      <View style={styles.tris}>
        {(Object.keys(MOTS_DU_TYPE) as TypeDeLigneLibre[]).map((t) => (
          <TouchableOpacity
            key={t}
            accessibilityRole="button"
            accessibilityLabel={`Type : ${MOTS_DU_TYPE[t]}`}
            accessibilityState={{ selected: type === t }}
            style={[styles.triPille, type === t && styles.triPilleOn]}
            onPress={() => {
              haptic('leger');
              setType(t);
            }}>
            <Text style={[styles.triTexte, type === t && styles.triTexteOn]}>{MOTS_DU_TYPE[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!faute && <Text style={styles.libreFaute}>{faute}</Text>}
      <View style={styles.libreRangee}>
        {onRetirer && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Supprimer la ligne" style={styles.remettre} onPress={onRetirer}>
            <Text style={[styles.remettreTexte, { color: c.danger }]}>Supprimer</Text>
          </TouchableOpacity>
        )}
        <View style={styles.texts} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Annuler la ligne" style={styles.remettre} onPress={onAnnuler}>
          <Text style={styles.remettreTexte}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Enregistrer la ligne"
          style={[styles.remettre, styles.triPilleOn]}
          onPress={valider}>
          <Text style={[styles.remettreTexte, styles.triTexteOn]}>Enregistrer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function DevisScreen() {
  const c = useTheme();
  const styles = getStyles(c);
  const setScreen = useScanStore((s) => s.setScreen);
  const walls = useScanStore((s) => s.walls);
  const rooms = useScanStore((s) => s.rooms);
  const fixtures = useScanStore((s) => s.fixtures);
  const ceiling = useScanStore((s) => s.ceiling);
  const openings = useScanStore((s) => s.openings);

  const gamme = useScanStore((s) => s.gammeDevis);
  const ecartes = useScanStore((s) => s.devisEcartes);
  const quantites = useScanStore((s) => s.devisQuantites);
  const ajouts = useScanStore((s) => s.devisAjouts);
  const prixVoulus = useScanStore((s) => s.devisPrix);
  const reglerPrixDevis = useScanStore((s) => s.reglerPrixDevis);
  /* Les lignes libres, les heures corrigées, la TVA du devis : voir `scanStore`. */
  const lignesLibres = useScanStore((s) => s.devisLignesLibres);
  const heuresCorrigees = useScanStore((s) => s.devisHeures);
  const tvaDevis = useScanStore((s) => s.devisTva);
  /** La ligne libre qu'on écrit : `'nouvelle'`, l'id d'une ligne, ou rien. */
  const [libreOuverte, setLibreOuverte] = useState<string | null>(null);
  /* Les conditions de l'artisan, réglées une fois (voir `ConditionsDevis`). */
  const coefficient = useEntreprise((e) => e.coefficient);
  const tauxAcompte = useEntreprise((e) => e.acompte);
  const validite = useEntreprise((e) => e.validite);
  const paiement = useEntreprise((e) => e.paiement);
  const [conditionsOuvertes, setConditionsOuvertes] = useState(false);
  /** La correction du prix d'une ligne, quand on l'a touchée. */
  const [prompt, setPrompt] = useState<PromptData | null>(null);
  const setDevisNumero = useScanStore((s) => s.setDevisNumero);
  const exportOuvert = useAccountStore((st) => st.exportOuvert);
  useEffect(() => {
    if (!useEntreprise.getState().charge) useEntreprise.getState().charger();
  }, []);
  const reglerQuantiteDevis = useScanStore((s) => s.reglerQuantiteDevis);
  const ajouterAuDevis = useScanStore((s) => s.ajouterAuDevis);
  const retirerDuDevis = useScanStore((s) => s.retirerDuDevis);
  const basculer = useScanStore((s) => s.basculerArticleDevis);
  const toutRemettre = useScanStore((s) => s.remettreLesArticlesDevis);
  /*
    LE RANG DE L'ÉTAPE VIT DANS LE MAGASIN DE L'APPLICATION, pas ici.

    Relevé du patron : « ajouter un article au magasin l'ajoute mais on
    retourne sur la première page ». Ouvrir le magasin DÉMONTE cette page ; le
    rang repartait donc à zéro, et l'on revenait deux écrans avant l'article
    qu'on venait d'ajouter. Le geste le plus courant de la page punissait
    celui qui le faisait.
  */
  const etape = useScanStore((s) => s.etapeDevis);
  const setEtape = useScanStore((s) => s.setEtapeDevis);
  const [cherche, setCherche] = useState('');
  /*
    LA VÉRIFICATION DES PRIX — relevé du patron : « une actualisation
    automatique via l'application, au clic sur le devis, un chargement des
    prix avec une animation moderne pour voir si les prix sont à jour ».

    Elle part QUAND ON DEMANDE LE PRIX, pas à l'ouverture de la page : les
    deux premières étapes ne montrent aucun chiffre, et un aller-retour au
    serveur pendant qu'on choisit sa gamme serait un appel pour rien — on peut
    très bien reculer et ne jamais voir le ticket.
  */
  /*
    LA DATE NE VIT PLUS ICI — elle se calcule sur les LIGNES du devis.

    Relevé du patron : « des prix s'affichent à la date d'aujourd'hui mais
    d'autres restent par exemple au 28 août ». Le bandeau datait le catalogue
    par sa VISITE la plus récente : relever les seules plaques le 5 septembre
    suffisait donc à peindre « Prix vérifiés aujourd'hui » en vert sur
    trente-trois articles du 28 août.

    Une valeur tenue à la main à côté de la mesure qu'elle décrit finit
    toujours par s'en écarter. Elle se déduit maintenant de ce qui est
    RÉELLEMENT affiché — voir `ageDuCatalogue`.
  */
  const [verif, setVerif] = useState<{
    issue: IssueTarifs;
    enseigne: string;
  } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [motDAttente, setMotDAttente] = useState('Connexion au catalogue…');
  /*
    CE QUI FORCE LE RECHIFFRAGE.

    `chiffrerLePlan` lit le catalogue courant, qui vit dans un module — React
    ne le voit pas changer. Sans ce compteur, les prix arriveraient et
    l'écran continuerait d'afficher les anciens : le devis mentirait sur ce
    qu'il vient lui-même d'aller chercher.
  */
  const [versionTarifs, setVersionTarifs] = useState(0);
  /** Une vérification déjà partie ne repart pas : on n'appelle qu'une fois. */
  const dejaVu = useRef(false);
  const [tri, setTri] = useState<'rayon' | 'cher' | 'pasCher'>('rayon');
  /* LES PRIX PRO : le tarif du distributeur de l'électricien (`tarifPro`). */
  const tarifPro = usePrixPro((p) => p.tarif);
  const [importEnCours, setImportEnCours] = useState(false);
  const [motImport, setMotImport] = useState<string | null>(null);
  useEffect(() => {
    usePrixPro.getState().charger().catch(() => {});
  }, []);

  /*
    LE MÊME CALCUL QUE LE BOUTON DU PLAN.

    Le total écrit sur la pastille verte et le détail de cette page sortent
    de `chiffrerLePlan` : deux lectures d'un seul calcul. Le jour où l'une
    recompterait de son côté, le bouton annoncerait un prix que la page ne
    retrouverait pas.
  */
  const horsJeu = useMemo(() => new Set(ecartes), [ecartes]);
  /*
    CE QUE LA PAGE ATTENTION DOIT SAVOIR : le tableau est-il du chantier,
    et combien de réserves NF C 15-100 le plan porte-t-il. Le même contrôle
    que l'écran du plan, compté une fois à l'ouverture — pas de geste ici
    qui le rejouerait.
  */
  const tableauAbsent = !fixtures.some((f) => f.kind === 'tableau');
  const manquesNfc = useMemo(() => {
    /*
      LES SEULES ALERTES — relevé « electricien » : le devis disait « à
      revoir » quand le plan disait « conforme ». On comptait aussi les
      remarques (`info`), que le contrôle du plan range sous « Rien de
      bloquant » ; une réserve, c'est un point à corriger.
    */
    // Niveau par niveau, comme le devis (revue « Mehdi »).
    const { entrees, placement } = placerAuxNiveaux(walls, rooms, fixtures);
    return checkElectrical(
      entrees,
      fixtures,
      wallToRooms(entrees),
      placement,
      undefined,
      undefined,
      ceiling,
      { walls, openings },
    ).filter((i) => i.severity === 'alerte').length;
  }, [walls, rooms, fixtures, ceiling, openings]);
  /* Le taux de l'artisan et la nature du chantier : voir `reglagesPose`. */
  const taux = useReglagesPose((r) => r.taux);
  const chantier = useReglagesPose((r) => r.chantier);
  const reglerTaux = useReglagesPose((r) => r.reglerTaux);
  const choisirChantier = useReglagesPose((r) => r.choisirChantier);
  useEffect(() => {
    useReglagesPose.getState().charger().catch(() => {});
  }, []);
  const devis: Devis = useMemo(
    () =>
      chiffrerLePlan(walls, rooms, fixtures, ceiling, gamme, horsJeu, openings, {
        quantites,
        ajouts,
        prix: prixVoulus,
      }),
    /*
      `versionTarifs` N'ENTRE DANS AUCUN CALCUL, et c'est pour cela qu'il est
      là. Le catalogue courant vit dans un module (`prix.ts`) : React ne le
      voit pas changer, et sans ce compteur les nouveaux prix arriveraient
      pendant que l'écran continuerait d'afficher les anciens — le devis
      mentirait sur ce qu'il vient lui-même d'aller chercher.

      Le linter le signale comme inutile parce qu'il ne lit que le corps de la
      fonction ; la dépendance est réelle, elle passe simplement par un état
      qu'il ne sait pas suivre.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      walls,
      rooms,
      fixtures,
      ceiling,
      gamme,
      horsJeu,
      openings,
      quantites,
      ajouts,
      prixVoulus,
      versionTarifs,
    ],
  );

  /*
    TRIER ET CHERCHER — « si jamais la liste est longue ».

    Relevé du patron. Elle l'est : un logement complet passe la trentaine
    d'articles, et l'on cherche rarement tout le ticket — on cherche « les
    disjoncteurs » ou « ce qui coûte le plus cher ».

    PAR RAYON, LE TICKET GARDE SES SECTIONS ; dès qu'on trie par prix ou qu'on
    cherche un mot, il s'aplatit. C'est voulu : les rayons sont l'ordre dans
    lequel on remplit le chariot, et cet ordre n'a plus de sens quand on
    demande « le plus cher d'abord ». Un en-tête de rayon qui ne regrouperait
    plus rien serait un mensonge de mise en page.
  */
  const filtrees = useMemo(() => {
    const q = pourChercher(cherche.trim());
    const gardees = q
      ? devis.lignes.filter((l) =>
          pourChercher(`${l.libelle} ${l.precision ?? ''} ${l.famille}`).includes(q),
        )
      : devis.lignes;
    if (tri === 'rayon') return gardees;
    const prix = (l: LigneDevis) => (l.pu ?? 0) * l.quantite;
    return [...gardees].sort((a, b) =>
      tri === 'cher' ? prix(b) - prix(a) : prix(a) - prix(b),
    );
  }, [devis.lignes, cherche, tri]);

  /*
    L'ÂGE DU CATALOGUE, DÉDUIT DE CE QUI EST AFFICHÉ.

    Il se recalcule avec le devis : ajouter un article estimé fait reculer la
    date annoncée, comme il se doit. `versionTarifs` entre dans les
    dépendances parce qu'un catalogue reçu change les prix SANS changer les
    lignes — c'est le même compteur qui force le rechiffrage.
  */
  const age = useMemo(
    () => ageDuCatalogue(devis.lignes, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devis.lignes, versionTarifs],
  );
  /** À plat dès qu'on trie autrement ou qu'on cherche. */
  const aPlat = tri !== 'rayon' || cherche.trim().length > 0;

  /**
   * ALLER VOIR, ET LE DIRE.
   *
   * Jamais bloquant : quoi qu'il arrive, on retombe sur un ticket. Hors
   * ligne, ce sont les prix gardés — ou les prix embarqués — qui chiffrent,
   * et le bandeau dit lequel.
   */
  const verifier = useCallback(async (forcer: boolean) => {
    setEnCours(true);
    setMotDAttente('Connexion au catalogue…');
    /*
      DEUX MOTS, PAS UN. Le premier tombe tout de suite, le second à la
      seconde : sur une réponse rapide on ne voit que « connexion », sur une
      réponse lente on voit que ça avance. Un texte immobile pendant six
      secondes fait douter que quelque chose se passe.
    */
    const relais = setTimeout(
      () => setMotDAttente('Comparaison des tarifs…'),
      1000,
    );
    /*
      ON LAISSE L'ATTENTE SE VOIR — relevé du patron : « c'est trop rapide on
      aperçoit à peine la page là ». Sur un catalogue déjà frais, ou hors
      ligne, la réponse tombe en quelques millisecondes ; la page paraissait
      et disparaissait dans la même image.

      LA PLUS LONGUE DES DEUX, ET NON UN DÉLAI AJOUTÉ. Une pause posée APRÈS
      la réponse ferait attendre deux secondes et demie de plus quelqu'un qui
      vient d'en attendre trois. Les deux courent ensemble : une réponse lente
      n'est pas rallongée, une réponse instantanée est tenue à l'écran.
    */
    const [v] = await Promise.all([
      verifierLesTarifs(Date.now(), forcer),
      new Promise((suite) => setTimeout(suite, ATTENTE_MIN)),
    ]);
    clearTimeout(relais);
    /*
      LE JOUR DU RELEVÉ, ET NON LE NUMÉRO DE VERSION.

      Hors ligne, on datait le catalogue avec `devis.version` — « 2026-08.2 »,
      une chaîne que `dateDuReleve` ne sait pas mettre en français et rend
      telle quelle. Le bandeau annonçait donc « Prix non vérifiés · 2026-08.2 »
      d'un catalogue passé en rayon le matin même. Le jour existait dans la
      table des prix ; personne ne le lui passait.
    */
    setVerif({
      issue: v.issue,
      enseigne: v.catalogue?.source ?? TARIF_EMBARQUE,
    });
    setVersionTarifs((n) => n + 1);
    setEnCours(false);
  }, []);

  useEffect(() => {
    if (etape !== ETAPE_PRIX || dejaVu.current) return;
    dejaVu.current = true;
    /*
      TOUCHER LE PRIX SUR LE PLAN, C'EST DEMANDER CELUI D'AUJOURD'HUI.

      Relevé du patron : « une récupération des prix mise à jour à chaque clic
      sur le prix du devis sur le plan 2D ». Ouvert autrement — par la barre,
      par le menu — le devis garde sa règle d'un jour : un tarif d'appareillage
      ne bouge pas dans la journée, et rappeler le serveur à chaque coup d'œil
      ferait attendre pour rien.
    */
    const forcer = useScanStore.getState().consommerLaDemandeDeTarifs();
    verifier(forcer).catch(() => {});
  }, [etape, verifier]);

  /**
   * UN DE PLUS, UN DE MOINS — et le devis rechiffre.
   *
   * Le pas est d'UNE unité de vente : une couronne, une boîte, un sachet.
   * C'est l'unité qui donne son sens au nombre — personne n'achète un demi-
   * sachet de chevilles —, et c'est celle qui est écrite juste à côté.
   *
   * UN ARTICLE PRIS AU MAGASIN SE RETIRE VRAIMENT quand on descend à zéro :
   * il n'a jamais été au métré, il n'a donc aucune raison de rester barré au
   * ticket. Une ligne du métré, elle, reste — à zéro, mais visible : un
   * article qu'on ne voit plus est un article qu'on croit oublié.
   */
  /*
    L'ACHAT PRO DU DEVIS — ligne par ligne, et sur les seuls articles
    reconnus par le tarif de l'électricien. Le prix public reste le prix du
    devis : c'est celui qu'on montre au client.
  */
  const achat = useMemo(
    () => achatPro(devis.lignes, (code) => cleDuTarif(code, devis.gamme), tarifPro),
    [devis, tarifPro],
  );
  const proDe = (l: LigneDevis) => achat?.parCle[cleDuTarif(l.code, devis.gamme)];
  /*
    UN SEUL PRIX — revue « Gérard » : le gros total de cette page disait le
    matériel seul à 20 %, le PDF matériel et pose au taux du chantier. Les
    deux, et la pastille du plan, lisent `prixDuDevis`.

    ET C'EST LE PRIX DE L'ARTISAN — relevé d'un électricien artisan : son
    achat × son coefficient quand son tarif connaît l'article, ses lignes
    libres, ses heures, la TVA qu'il choisit, son acompte.
  */
  const prix = useMemo(
    () =>
      prixDuDevis(
        devis,
        fixtures,
        ceiling,
        { taux, chantier },
        {
          prixAchat: prixDAchat(devis.lignes, (code) => cleDuTarif(code, devis.gamme), tarifPro),
          coefficient,
          lignesLibres,
          heures: heuresCorrigees,
          tva: tvaDevis,
          acompte: tauxAcompte,
        },
      ),
    [devis, fixtures, ceiling, taux, chantier, tarifPro, coefficient, lignesLibres, heuresCorrigees, tvaDevis, tauxAcompte],
  );
  const { pose, totaux } = prix;
  /*
    LE MATÉRIEL, TTC : au prix du magasin (TVA 20 %, celle qu'on paie à la
    caisse) quand le devis vend au prix public ; au prix de vente de
    l'artisan, à la TVA du devis, dès qu'une ligne passe par son coefficient.
  */
  const auCoefficient = prix.fournitures.some((v) => v.auCoefficient);
  const materielTtc =
    Math.round(totaux.fournituresHt * (1 + (auCoefficient ? totaux.tauxTva : TVA_DES_PRIX_PUBLICS)) * 100) / 100;
  /** Le prix de vente HT de chaque ligne du ticket. */
  const ventes = useMemo(() => new Map(prix.fournitures.map((v) => [v.ligne, v])), [prix]);
  /** Le sous-total HT d'un rayon : ses lignes, à leur prix de vente. */
  const htDuRayon = (famille: string) =>
    Math.round(prix.fournitures.filter((v) => v.ligne.famille === famille).reduce((t, v) => t + v.totalHt, 0) * 100) / 100;
  const importerLeTarif = async () => {
    haptic('leger');
    setImportEnCours(true);
    setMotImport(null);
    const d = new Date();
    const deux = (n: number) => String(n).padStart(2, '0');
    const jour = `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
    try {
      const r = await usePrixPro.getState().importer(refsPourLeRapprochement(), jour);
      setMotImport(r.ok ? null : motDeLImport(r.raison));
      if (r.ok) haptic('succes');
    } finally {
      setImportEnCours(false);
    }
  };

  const reglerLaQuantite = (l: LigneDevis, pas: number) => {
    haptic('leger');
    const voulue = Math.max(0, l.quantite + pas);
    if (l.duMagasin) {
      if (voulue === 0) retirerDuDevis(l.code);
      else ajouterAuDevis(l.code, pas);
      return;
    }
    reglerQuantiteDevis(cleDeLigne(l), voulue);
  };

  /*
    CORRIGER LE PRIX D'UNE LIGNE — correctif de l'audit. Le champ s'ouvre sur
    le prix affiché ; le vider rend celui du catalogue.

    EN HORS TAXES — relevé d'un électricien artisan : le champ demandait un
    prix TTC, et un artisan pense en HT. Le prix voulu se garde toujours sur
    la base du catalogue (TTC à 20 %, voir `AjustementsDevis.prix`) : les
    plans déjà enregistrés gardent leur sens, et la pastille du plan, qui le
    relit, retombe sur le même prix. HT → base → HT revient au centime près.
  */
  const corrigerLePrix = (l: LigneDevis) => {
    haptic('leger');
    const cle = cleDeLigne(l);
    const puHt = ventes.get(l)?.puHt ?? null;
    setPrompt({
      title: `Prix unitaire HT — ${l.libelle}`,
      subtitle: l.prixAjuste
        ? 'Videz le champ pour revenir au prix du catalogue.'
        : 'Votre prix de vente hors taxes remplace celui du catalogue sur ce devis.',
      value: puHt === null ? '' : fr(puHt, 2),
      unit: '€ HT',
      numeric: true,
      okLabel: 'Appliquer',
      onSubmit: (v: string) => {
        if (!v.trim()) {
          reglerPrixDevis(cle, null);
          return;
        }
        const n = nombreSaisi(v);
        if (n !== null && n >= 0) reglerPrixDevis(cle, n * (1 + TVA_DES_PRIX_PUBLICS));
      },
    });
  };

  /*
    CORRIGER LES HEURES D'UNE FAMILLE DE POSE — relevé d'un électricien
    artisan : les temps du barème étaient figés. Vider rend l'estimation.
  */
  const corrigerLesHeures = (famille: string, heures: number) => {
    haptic('leger');
    setPrompt({
      title: `Heures de pose — ${famille === 'Tableau' ? 'Tableau et câblage' : famille}`,
      subtitle:
        famille in heuresCorrigees
          ? 'Videz le champ pour revenir à l’estimation.'
          : 'Vos heures remplacent l’estimation sur ce devis (au quart d’heure).',
      value: fr(heures, Number.isInteger(heures) ? 0 : 2),
      unit: 'h',
      numeric: true,
      okLabel: 'Appliquer',
      onSubmit: (v: string) => {
        if (!v.trim()) {
          useScanStore.getState().reglerHeuresDevis(famille, null);
          return;
        }
        const n = nombreSaisi(v);
        if (n !== null && n >= 0) useScanStore.getState().reglerHeuresDevis(famille, n);
      },
    });
  };

  /*
    VOS CONDITIONS — coefficient, acompte, validité, paiement : réglées une
    fois dans « Mon entreprise » (`useEntreprise`), pour tous les devis.
  */
  const reglerUneCondition = (quoi: 'coefficient' | 'acompte' | 'validite' | 'paiement') => {
    haptic('leger');
    const ent = useEntreprise.getState();
    if (quoi === 'paiement') {
      setPrompt({
        title: 'Conditions de paiement',
        subtitle: 'Une phrase, imprimée sous le total du devis.',
        value: ent.paiement,
        maxLength: PAIEMENT_MAX,
        okLabel: 'Enregistrer',
        onSubmit: (v: string) => ent.reglerConditions({ paiement: v }),
      });
      return;
    }
    const fiches = {
      coefficient: {
        title: 'Coefficient de vente',
        subtitle:
          'Prix de vente HT = prix d’achat pro × coefficient, sur les articles de votre tarif importé. Videz le champ pour vendre au prix public. Il ne paraît jamais sur le devis remis au client.',
        value: ent.coefficient === null ? '' : fr(ent.coefficient, 2),
        unit: '×',
        choix: ['1,20', '1,30', '1,40', '1,50'],
      },
      acompte: {
        title: 'Acompte à la commande',
        subtitle: 'En pour cent du total TTC. Zéro : pas d’acompte.',
        value: String(ent.acompte),
        unit: '%',
        choix: ['0', '30', '40', '50'],
      },
      validite: {
        title: 'Validité du devis',
        subtitle: 'En jours, à partir de la date du devis.',
        value: String(ent.validite),
        unit: 'jours',
        choix: ['15', '30', '60', '90'],
      },
    }[quoi];
    setPrompt({
      ...fiches,
      choix: fiches.choix.map((x) => ({ label: x, value: x })),
      numeric: true,
      okLabel: 'Enregistrer',
      onSubmit: (v: string) => {
        const n = nombreSaisi(v);
        if (quoi === 'coefficient') ent.reglerConditions({ coefficient: v.trim() ? n ?? ent.coefficient : null });
        else if (n !== null) ent.reglerConditions({ [quoi]: n });
      },
    });
  };

  /*
    LE DEVIS S'EXPORTE — correctif de l'audit : ni PDF ni partage, pas de
    bloc entreprise ou client, pas de numéro. Le numéro se donne au premier
    envoi et reste au plan : renvoyer le même devis ne lui en donne pas un
    autre. L'export est la barrière, comme pour le dossier (`exportOuvert`).
  */
  const exporterLeDevis = async () => {
    if (!exportOuvert('le devis')) return;
    const envoyer = async () => {
      try {
        let numero = useScanStore.getState().devisNumero;
        if (!numero) {
          numero = useEntreprise.getState().numeroterUnDevis();
          setDevisNumero(numero);
        }
        const st = useScanStore.getState();
        const bytes = buildDevisPdf({
          numero,
          date: new Date(),
          chantier: st.scanName,
          client: st.client,
          adresse: st.address,
          entreprise: entrepriseAImprimer(useEntreprise.getState()),
          gamme: nomDeLaGamme,
          devis,
          pose,
          // Le même prix que la page, et les conditions de « Mon entreprise ».
          prix,
          conditions: { validite: useEntreprise.getState().validite, paiement: useEntreprise.getState().paiement },
          /*
            C'EST L'ARTISAN QUI ENVOIE — revue « Gérard » : il a vu le
            chantier, son PDF ne dit plus « à confirmer après visite ».
          */
          parLArtisan: useUsage.getState().modeElec,
        });
        await RoomScan.sharePDF(toBase64(bytes), devisFilename(numero, st.scanName));
      } catch (e) {
        alerte(expliquer('export', e).titre, expliquer('export', e).message);
      }
    };
    // Sans entreprise, le devis partirait sans en-tête : on le dit avant.
    if (!useEntreprise.getState().nom.trim()) {
      alerte(
        'Votre entreprise n’est pas renseignée',
        'Elle paraît en tête du devis, avec vos coordonnées et votre SIRET. Vous pouvez la renseigner au profil.',
        [
          { label: 'Renseigner', onPress: () => setScreen('profil') },
          { label: 'Exporter quand même', onPress: () => void envoyer() },
        ],
      );
      return;
    }
    /*
      LES MENTIONS OBLIGATOIRES D'UN DEVIS D'ARTISAN — revue « Nadia » : le
      SIRET et l'assurance décennale. On ne bloque pas, on prévient.
    */
    const ent = useEntreprise.getState();
    const manque = [!ent.siret.trim() && 'votre SIRET', !ent.decennale.trim() && 'votre assurance décennale'].filter(
      (x): x is string => !!x,
    );
    if (manque.length > 0) {
      alerte(
        `Il manque ${manque.join(' et ')}`,
        'Un devis d’artisan du bâtiment doit les mentionner. Vous pouvez les renseigner au profil, rubrique Entreprise.',
        [
          { label: 'Renseigner', onPress: () => setScreen('profil') },
          { label: 'Exporter quand même', onPress: () => void envoyer() },
        ],
      );
      return;
    }
    await envoyer();
  };

  /** Le nom de la gamme en toutes lettres — l'en-tête et le bouton le lisent. */
  const nomDeLaGamme = useMemo(() => {
    const g = GAMMES.find((x) => x.id === gamme);
    return g ? `${g.marque} ${g.nom}` : String(gamme);
  }, [gamme]);

  const avancer = (n: number) => {
    haptic('leger');
    // « À savoir » est lu : on ne le remontre plus (revue « Gérard »).
    if (etape === 0 && n > 0) usePremieresFois.getState().marquer('devisASavoir');
    setEtape(n);
  };

  /*
    « À SAVOIR AVANT LE PRIX », UNE FOIS — revue « Gérard » : l'électricien
    qui rouvre son devis dix fois dans la journée relisait dix fois la même
    page avant son prix. Lue une fois, elle reste au fil des étapes — on y
    revient d'un appui — mais on arrive sur le prix.
  */
  useEffect(() => {
    const pf = usePremieresFois.getState();
    if (etape === 0 && pf.charge && !pf.estNeuve('devisASavoir')) setEtape(ETAPE_PRIX);
    // À l'ouverture seulement : revenir à « À savoir » d'un appui doit y rester.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RetourGlisse onRetour={() => setScreen('result')} style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.roundButton}
          accessibilityLabel="Retour"
          accessibilityRole="button"
          onPress={() => setScreen('result')}>
          <BackChevron color={c.ink} />
        </TouchableOpacity>
        <Text style={styles.titrePage}>Devis</Text>
      </View>

      {/*
        LE FIL DES ÉTAPES — relevé du patron : « fais des étapes modernes avec
        des gros titres et numéros ».

        Trois pastilles, un trait entre elles. Celle où l'on est se remplit ;
        celles qu'on a passées portent une coche et RESTENT TOUCHABLES — on
        revient sur son choix d'appareillage sans avoir à refaire le chemin.
        Celles d'après ne le sont pas : on ne saute pas la page qui dit ce
        que le prix ne contient pas.
      */}
      <View style={styles.fil}>
        {ETAPES.map((e, i) => {
          const faite = i < etape;
          const ici = i === etape;
          return (
            <React.Fragment key={e.court}>
              {i > 0 && <View style={[styles.filTrait, faite && styles.filTraitFait]} />}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Étape ${i + 1}, ${e.court}${
                  ici ? ', en cours' : faite ? ', faite' : ', à venir'
                }`}
                disabled={i > etape}
                activeOpacity={0.75}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                onPress={() => avancer(i)}
                style={styles.filCase}>
                <View
                  style={[
                    styles.pastille,
                    (ici || faite) && styles.pastillePleine,
                  ]}>
                  <Text
                    style={[
                      styles.pastilleTexte,
                      (ici || faite) && styles.pastilleTexteFort,
                    ]}>
                    {faite ? '✓' : String(i + 1)}
                  </Text>
                </View>
                <Text style={[styles.filNom, ici && styles.filNomFort]}>
                  {e.court}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>

      <Text style={styles.rang}>{`ÉTAPE ${etape + 1} SUR ${ETAPES.length}`}</Text>
      <Text style={styles.gros}>{ETAPES[etape].titre}</Text>

      {/*
        LE ROULEAU EST POSÉ À MÊME LA PAGE.

        Rien au-dessus de lui ne réclame le doigt — c'est toute la différence
        avec la feuille modale, où deux `Pressable` prenaient le geste au
        posé et ne le rendaient jamais.
      */}
      <ScrollView
        style={styles.rouleau}
        contentContainerStyle={styles.rouleauFond}
        // Les champs d'une ligne libre restent au-dessus du clavier.
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {etape === 0 && (
          /*
            UNE SEULE CHOSE À DIRE, ET C'EST CELLE QUI COÛTE.

            Troisième version de cette page. Elle a listé des exclusions —
            « on ne comprend pas bien pour ce qui est compté » —, puis joué
            une démonstration animée du calcul, retirée à son tour : elle
            expliquait une méthode que l'écran suivant montre déjà, ligne par
            ligne, et faisait perdre cinq secondes entre le choix et le prix.

            Relevé du patron : « enlève la deuxième page explicative ; à la
            place fais une page dynamique Attention ». Reste ce qui coûte de
            l'argent à qui le découvre trop tard. Voir `DevisAttention`.
          */
          <>
            <DevisAttention
              tableauAbsent={tableauAbsent}
              manquesNfc={manquesNfc}
            />
            {devis.sansPrix.length > 0 && (
              /*
                CE QUE LE CATALOGUE NE SAIT PAS CHIFFRER SE DIT ICI.

                Un article sans prix compte pour zéro dans le total. Tant
                qu'on ne le dit pas, le total a l'air complet — et c'est la
                seule erreur d'un devis que personne ne rattrape.
              */
              <View style={styles.manque}>
                <Text style={styles.manqueTitre}>
                  {`${devis.sansPrix.length} article${
                    devis.sansPrix.length > 1 ? 's' : ''
                  } sans prix au catalogue`}
                </Text>
                <Text style={styles.manqueTexte}>
                  {`${devis.sansPrix.join(', ')} — comptés pour zéro dans le total.`}
                </Text>
              </View>
            )}
          </>
        )}

        {/*
          PENDANT QU'ON VA VOIR, LE TICKET NE S'AFFICHE PAS.

          Il pourrait : les prix embarqués chiffrent déjà. Mais afficher un
          total puis le voir changer sous les yeux, une seconde plus tard,
          c'est pire que d'attendre — on ne sait plus lequel des deux est le
          bon, et c'est le premier qu'on retient. On montre donc l'attente,
          puis LE prix.
        */}
        {etape === ETAPE_PRIX && enCours && <PrixQuiSActualisent etape={motDAttente} />}

        {etape === ETAPE_PRIX && !enCours && (
          /*
            LE TICKET DE CAISSE — relevé du patron : « au clic on affiche une
            page entière moderne qui affiche tout bien fait comme un ticket de
            caisse… une petite image avant son titre et son prix, quantité
            etc. »

            C'est la bonne image, et pas seulement pour le décor : un ticket
            se lit d'un coup, du haut vers le bas, une ligne par article, et
            le total en gros à la fin. Personne n'a jamais eu besoin qu'on lui
            explique comment on lit un ticket.

            Les rayons du bordereau font les sections du ticket — c'est
            l'ordre dans lequel on remplit le chariot —, et chaque ligne porte
            LA PHOTO de l'article, son nom, sa quantité au prix unitaire, puis
            son total. Rien n'est replié : un ticket qu'il faut déplier n'est
            plus un ticket.
          */
          <>
            <View style={styles.entete}>
              {/*
                « MATÉRIEL », ET NON « FOURNITURE ».

                « Fourniture » est le mot juste du métier — et un mot que
                personne d'autre n'emploie. Relevé du patron : « on doit
                penser utilisateur simple, sans professionnalisme
                forcément. » « Matériel » dit la même chose à tout le monde,
                et n'enlève rien à celui qui connaît l'autre.
              */}
              <Text style={styles.enseigne}>ESTIMATION DU MATÉRIEL</Text>
              {/*
                LE MOIS, ET NON LE NUMÉRO DE VERSION. « tarifs 2026-08.2 » a un
                sens pour le code — le mois, puis le rang du relevé dans ce
                mois — et aucun pour qui lit un devis. La révision voyage
                toujours avec le devis ; elle ne s'affiche plus.
              */}
              <Text style={styles.sousEnseigne}>
                {`Tarifs ${moisDeLaVersion(devis.version)}`}
              </Text>
            </View>

            {/*
              LA GAMME SE CHANGE ICI, ET NULLE PART AILLEURS.

              Relevé du patron : « icône changement — nom de la gamme
              actuelle ». Elle ouvrait le devis, avant tout prix ; elle se
              change maintenant DEVANT le total qu'elle fait bouger, ce qui
              est le seul moment où le choix veut dire quelque chose.

              Le nom en toutes lettres, et non une simple icône : le ticket
              doit dire ce qu'il chiffre sans qu'on ait à ouvrir la page pour
              s'en souvenir.
            */}
            <TouchableOpacity
              style={styles.gammeBouton}
              accessibilityRole="button"
              accessibilityLabel={`Changer de gamme — ${nomDeLaGamme}`}
              activeOpacity={0.75}
              onPress={() => {
                haptic('leger');
                setScreen('gamme');
              }}>
              <Svg width={17} height={17} viewBox="0 0 24 24">
                {/* Deux flèches en boucle : le signe universel du « changer ». */}
                <Path
                  d="M4 9 a8 8 0 0 1 13.5 -3.5 L20 8 M20 4 v4 h-4 M20 15 a8 8 0 0 1 -13.5 3.5 L4 16 M4 20 v-4 h4"
                  stroke={c.blue}
                  strokeWidth={1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
              <View style={styles.gammeTextes}>
                <Text style={styles.gammeRole}>PRISES ET INTERRUPTEURS</Text>
                <Text style={styles.gammeNom}>{nomDeLaGamme}</Text>
              </View>
              <Text style={styles.porteChevron}>›</Text>
            </TouchableOpacity>

            {/*
              D'OÙ VIENNENT CES CHIFFRES — avant le premier article, pas après
              le total. On doit savoir de quand datent les prix AVANT de les
              lire, sans quoi on les a déjà crus.
            */}
            {verif && (
              <View style={styles.bandeauTarifs}>
                <BandeauTarifs
                  etat={verif.issue}
                  enseigne={verif.enseigne}
                  jour={age.jour ?? ''}
                  duJour={age.duJour}
                  /* Hors ligne, un catalogue vu en magasin n'est pas « non
                     vérifié » : on ne s'excuse que sans rien à montrer. */
                  releves={age.jour !== null}
                  onVerifier={() => {
                    haptic('leger');
                    verifier(true).catch(() => {});
                  }}
                />
              </View>
            )}

            {/*
              VOS PRIX PRO — sous les prix publics, pas à leur place : le devis
              qu'on montre au client reste au prix public. Voir `CartePrixPro`.
            */}
            <CartePrixPro
              tarif={tarifPro}
              reconnus={achat?.reconnus ?? 0}
              enCours={importEnCours}
              message={motImport}
              possible={importPossible()}
              onImporter={() => {
                importerLeTarif().catch(() => setImportEnCours(false));
              }}
              onRetirer={() => {
                haptic('leger');
                setMotImport(null);
                usePrixPro.getState().retirer();
              }}
            />

            {/*
              LA PORTE DU MAGASIN, EN TÊTE DE TICKET.

              Relevé du patron : « ou d'en ajouter un ». C'est ici qu'on s'en
              aperçoit — devant le ticket, en lisant la liste, on se dit « il
              manque les chevilles ». Pas dans un menu ailleurs.
            */}
            <TouchableOpacity
              style={styles.porteMagasin}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir le magasin"
              onPress={() => {
                haptic('leger');
                setScreen('magasin');
              }}>
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path
                  d="M4 8 h16 l-1.2 11.5 a1 1 0 0 1 -1 .9 H6.2 a1 1 0 0 1 -1 -.9 Z M8.5 8 V6.2 a3.5 3.5 0 0 1 7 0 V8"
                  stroke={c.blue}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
              <Text style={styles.porteMot}>
                Ajouter un article du magasin
              </Text>
              <Text style={styles.porteChevron}>›</Text>
            </TouchableOpacity>
            {/*
              ET CE QUI N'EST NI AU PLAN NI AU MAGASIN — relevé d'un
              électricien artisan : « Dépose ancien tableau », « Déplacement »,
              « Consuel », « Mise en service ». La même porte, juste dessous.
            */}
            {libreOuverte === 'nouvelle' ? (
              <EditeurLigneLibre
                initiale={null}
                styles={styles}
                onValider={(l) => {
                  useScanStore.getState().ecrireLigneLibre(l);
                  setLibreOuverte(null);
                }}
                onAnnuler={() => setLibreOuverte(null)}
              />
            ) : (
              <TouchableOpacity
                style={styles.porteMagasin}
                accessibilityRole="button"
                accessibilityLabel="Ajouter une ligne libre"
                onPress={() => {
                  haptic('leger');
                  setLibreOuverte('nouvelle');
                }}>
                <Svg width={18} height={18} viewBox="0 0 24 24">
                  <Path d="M12 5 v14 M5 12 h14" stroke={c.blue} strokeWidth={2} strokeLinecap="round" fill="none" />
                </Svg>
                <Text style={styles.porteMot}>Ajouter une ligne libre</Text>
                <Text style={styles.porteChevron}>›</Text>
              </TouchableOpacity>
            )}

            {/*
              CHERCHER ET TRIER — « si jamais la liste est longue ».

              Elle l'est : un logement complet passe la trentaine d'articles.
              Trois pastilles et un champ, posés juste sous l'en-tête, là où
              l'on regarde avant de faire défiler.
            */}
            <View style={styles.outils}>
              <TextInput
                accessibilityLabel="Chercher un article"
                style={styles.recherche}
                placeholder="Chercher un article…"
                placeholderTextColor={c.inkFaint}
                value={cherche}
                onChangeText={setCherche}
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
            <View style={styles.tris}>
              {(
                [
                  ['rayon', 'Par rayon'],
                  ['cher', 'Prix ↓'],
                  ['pasCher', 'Prix ↑'],
                ] as const
              ).map(([id, nom]) => (
                <TouchableOpacity
                  key={id}
                  accessibilityLabel={`Trier : ${nom}`}
                  accessibilityRole="button"
                  activeOpacity={0.75}
                  style={[styles.triPille, tri === id && styles.triPilleOn]}
                  onPress={() => {
                    haptic('leger');
                    setTri(id);
                  }}>
                  <Text style={[styles.triTexte, tri === id && styles.triTexteOn]}>
                    {nom}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {filtrees.length === 0 && (
              <Text style={styles.vide}>
                {`Aucun article ne correspond à « ${cherche.trim()} ».`}
              </Text>
            )}

            {aPlat
              ? filtrees.map((l) => (
                  <Article
                    key={`${l.famille}-${l.libelle}`}
                    ligne={l}
                    styles={styles}
                    couleurs={c}
                    pro={proDe(l)}
                    distributeur={tarifPro?.distributeur}
                    vente={ventes.get(l)}
                    coefficient={coefficient}
                    onBasculer={() => {
                      haptic('leger');
                      basculer(cleDeLigne(l));
                    }}
                    onMoins={() => reglerLaQuantite(l, -1)}
                    onPlus={() => reglerLaQuantite(l, 1)}
                    onPrix={() => corrigerLePrix(l)}
                  />
                ))
              : devis.parFamille.map((f) => (
                  <View key={f.famille}>
                    <View style={styles.rayon}>
                      <Text style={styles.rayonNom}>{f.famille}</Text>
                      <Text style={styles.rayonPrix}>{`${euros(htDuRayon(f.famille))} HT`}</Text>
                    </View>
                    {filtrees
                      .filter((l) => l.famille === f.famille)
                      .map((l) => (
                        <Article
                          key={`${f.famille}-${l.libelle}`}
                          ligne={l}
                          styles={styles}
                          couleurs={c}
                          pro={proDe(l)}
                          distributeur={tarifPro?.distributeur}
                          vente={ventes.get(l)}
                          coefficient={coefficient}
                          onMoins={() => reglerLaQuantite(l, -1)}
                          onPlus={() => reglerLaQuantite(l, 1)}
                          onPrix={() => corrigerLePrix(l)}
                          onBasculer={() => {
                            haptic('leger');
                            basculer(cleDeLigne(l));
                          }}
                        />
                      ))}
                  </View>
                ))}

            {/*
              LES LIGNES LIBRES, APRÈS LES ARTICLES — modifiables d'un appui,
              retirées d'un autre ; elles entrent au total et au PDF.
            */}
            {lignesLibres.length > 0 && (
              <View style={styles.rayon}>
                <Text style={styles.rayonNom}>Lignes libres</Text>
                <Text style={styles.rayonPrix}>
                  {`${euros(prix.libres.reduce((t, l) => t + l.totalHt, 0))} HT`}
                </Text>
              </View>
            )}
            {prix.libres.map((l) =>
              libreOuverte === l.id ? (
                <EditeurLigneLibre
                  key={l.id}
                  initiale={l}
                  styles={styles}
                  onValider={(x) => {
                    useScanStore.getState().ecrireLigneLibre(x);
                    setLibreOuverte(null);
                  }}
                  onAnnuler={() => setLibreOuverte(null)}
                  onRetirer={() => {
                    haptic('leger');
                    useScanStore.getState().retirerLigneLibre(l.id);
                    setLibreOuverte(null);
                  }}
                />
              ) : (
                <View key={l.id} style={styles.article}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Modifier la ligne : ${l.designation}`}
                    activeOpacity={0.7}
                    style={styles.texts}
                    onPress={() => {
                      haptic('leger');
                      setLibreOuverte(l.id);
                    }}>
                    <Text style={styles.articleNom}>{l.designation}</Text>
                    <Text style={styles.articleDetail}>
                      {`${fr(l.quantite, Number.isInteger(l.quantite) ? 0 : 2)} ${l.unite} × `}
                      <Text style={styles.articlePrixTouchable}>{`${euros(l.puHt)} HT`}</Text>
                    </Text>
                    <Text style={styles.articleOrigine}>{MOTS_DU_TYPE[l.type]}</Text>
                  </TouchableOpacity>
                  <View style={styles.colonneDroite}>
                    <Text style={styles.articlePrix}>{euros(l.totalHt)}</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer la ligne : ${l.designation}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[styles.pas, styles.pasRetirer]}
                      onPress={() => {
                        haptic('leger');
                        useScanStore.getState().retirerLigneLibre(l.id);
                      }}>
                      <Svg width={12} height={12} viewBox="0 0 24 24">
                        <Path d="M6 6 L18 18 M18 6 L6 18" stroke={c.danger} strokeWidth={2.8} strokeLinecap="round" />
                      </Svg>
                    </TouchableOpacity>
                  </View>
                </View>
              ),
            )}

            {/* Le trait de découpe, puis le total : la fin d'un ticket. */}
            <View style={styles.decoupe} />
            <View style={styles.rayon}>
              <Text style={styles.totalNom}>TOTAL MATÉRIEL TTC</Text>
              {/*
                LE MATÉRIEL SEUL, AU BOUT DE SA LISTE — relevé du patron : « le
                prix à la fin du listing matériel doit être le coût du matériel
                uniquement, et on ajoute la main-d'œuvre ensuite ; ici les deux
                prix sont égaux. Un particulier voudra savoir pour combien il
                en aura à Castorama pour l'achat de tout ça, sans main-d'œuvre. »
                Le total du devis, pose comprise, vient plus bas (« Pose
                estimée ») : le même que la pastille du plan et que le PDF.
              */}
              <TotalQuiMonte
                valeur={materielTtc}
                format={euros}
                style={styles.total}
              />
            </View>
            <Text style={styles.sousTotal} testID="total-materiel">
              {auCoefficient
                ? `${euros(totaux.fournituresHt)} HT · TVA ${pourcent(totaux.tauxTva)} — au prix de vente du devis.`
                : `Ce que coûte le matériel en magasin, TVA 20 % comprise. Sans la main-d’œuvre : elle s’ajoute plus bas.`}
            </Text>
            {/*
              L'ACOMPTE, EN EUROS — relevé d'un électricien artisan : le
              client signe un montant. Son pourcentage se règle dans « Vos
              conditions », plus bas.
            */}
            {totaux.tauxAcompte > 0 && (
              <Text style={styles.sousTotal} testID="acompte">
                {`Acompte ${pourcent(totaux.tauxAcompte / 100)} à la commande : ${euros(totaux.acompte)} TTC`}
              </Text>
            )}
            {/*
              LA TVA DU DEVIS — relevé du même artisan : 20 %, 10 % ou 5,5 %.
              Par défaut, celle du chantier ; c'est lui qui sait si son client
              y a droit, et le PDF le dit sous réserve.
            */}
            <View style={styles.tvaRangee}>
              <Text style={styles.tvaNom}>TVA du devis</Text>
              {TAUX_DE_TVA.map((t) => {
                const actif = totaux.tauxTva === t;
                return (
                  <TouchableOpacity
                    key={t}
                    accessibilityRole="button"
                    accessibilityLabel={`TVA ${pourcent(t)}`}
                    accessibilityState={{ selected: actif }}
                    style={[styles.tvaPille, actif && styles.triPilleOn]}
                    onPress={() => {
                      if (actif) return;
                      haptic('leger');
                      useScanStore.getState().reglerTvaDevis(t);
                    }}>
                    <Text style={[styles.triTexte, actif && styles.triTexteOn]}>{pourcent(t)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/*
              LE MÊME MATÉRIEL AU PRIX PUBLIC, EN PETIT — relevé du patron :
              « donne aussi le prix total "public" sous le total ». Le devis
              retient le magasin le moins cher, article par article ; celui-ci,
              l'enseigne de référence partout : l'écart entre les deux, c'est
              ce que le « moins cher » fait gagner.
            */}
            {devis.totalPublic > 0 && (
              <Text style={styles.sousTotal} testID="total-public">
                {`Matériel au prix public (${ENSEIGNE_PUBLIQUE}) : ${euros(devis.totalPublic)} TTC`}
              </Text>
            )}
            {/*
              CE QUE L'ÉLECTRICIEN, LUI, PAIERA — sur les articles que son tarif
              reconnaît, et seulement eux : la comparaison porte sur les mêmes
              lignes des deux côtés, sinon elle ne veut rien dire.
            */}
            {!!achat && achat.reconnus > 0 && (
              <Text style={styles.sousTotalPro} testID="achat-pro">
                {`Achat pro ${tarifPro?.distributeur ?? ''} : ${euros(achat.totalHT)} HT sur ${
                  achat.reconnus
                } article${achat.reconnus > 1 ? 's' : ''} (${euros(achat.publicTTC)} TTC au prix public)`}
              </Text>
            )}
            {/*
              CE QU'ON A ÉCARTÉ SE DIT SOUS LE TOTAL.

              Un total plus bas sans explication est un total suspect : celui
              qui reprend le devis huit jours plus tard doit voir, à côté du
              chiffre, qu'on a retiré six articles — et pouvoir tout remettre
              d'un appui.
            */}
            {ecartes.length > 0 && (
              <TouchableOpacity
                accessibilityLabel="Tout remettre au devis"
                accessibilityRole="button"
                activeOpacity={0.75}
                style={styles.remettre}
                onPress={() => {
                  haptic('leger');
                  toutRemettre();
                }}>
                <Text style={styles.remettreTexte}>
                  {`${ecartes.length} article${
                    ecartes.length > 1 ? 's' : ''
                  } écarté${ecartes.length > 1 ? 's' : ''} — tout remettre`}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={styles.mentions}>
              {`Les luminaires ne sont pas comptés. Chaque article au prix le moins cher relevé entre les enseignes, à confirmer en magasin${
                prix.fournitures.some((v) => v.auCoefficient && !v.ligne.ecarte)
                  ? ' — ou, quand votre tarif le connaît, à votre prix d’achat × votre coefficient.'
                  : '.'
              }`}
            </Text>

            {/*
              LA POSE, ESTIMÉE — le devis compte enfin ce qu'il excluait (voir
              `geometry/mainDOeuvre`) : chaque point du plan, à son temps de
              pose, au taux de l'artisan, avec la TVA de son chantier.
            */}
            <PoseEstimee
              pose={pose}
              totaux={totaux}
              chantier={chantier}
              onChantier={(x) => {
                // Changer de chantier, c'est reprendre sa TVA : le choix fait à la main s'efface.
                choisirChantier(x);
                useScanStore.getState().reglerTvaDevis(null);
              }}
              onTaux={reglerTaux}
              onHeures={corrigerLesHeures}
            />

            {/*
              VOS CONDITIONS — repliées sous une ligne : on les règle une fois,
              on ne les relit pas à chaque devis. Le résumé suffit à voir
              qu'elles sont là.
            */}
            <TouchableOpacity
              style={styles.gammeBouton}
              accessibilityRole="button"
              accessibilityLabel="Vos conditions de devis"
              activeOpacity={0.75}
              onPress={() => {
                haptic('leger');
                setConditionsOuvertes((o) => !o);
              }}>
              <View style={styles.gammeTextes}>
                <Text style={styles.gammeRole}>VOS CONDITIONS · MON ENTREPRISE</Text>
                <Text style={styles.gammeNom} numberOfLines={1}>
                  {`${coefficient ? `Coef. × ${fr(coefficient, 2)} · ` : ''}acompte ${pourcent(tauxAcompte / 100)} · ${validite} jours`}
                </Text>
              </View>
              <Text style={styles.porteChevron}>{conditionsOuvertes ? '⌃' : '›'}</Text>
            </TouchableOpacity>
            {conditionsOuvertes &&
              (
                [
                  ['coefficient', 'Coefficient de vente', coefficient ? `× ${fr(coefficient, 2)}` : 'Prix public'],
                  ['acompte', 'Acompte à la commande', pourcent(tauxAcompte / 100)],
                  ['validite', 'Validité du devis', `${validite} jours`],
                  ['paiement', 'Conditions de paiement', paiement || 'À renseigner'],
                ] as const
              ).map(([cle, nom, valeur]) => (
                <TouchableOpacity
                  key={cle}
                  accessibilityRole="button"
                  accessibilityLabel={`Régler : ${nom}`}
                  style={styles.condition}
                  onPress={() => reglerUneCondition(cle)}>
                  <Text style={styles.conditionNom}>{nom}</Text>
                  <Text style={styles.conditionValeur} numberOfLines={2}>
                    {valeur}
                  </Text>
                </TouchableOpacity>
              ))}

            {/* Le devis, numéroté, à l'en-tête de l'entreprise, prêt à signer. */}
            <TouchableOpacity
              accessibilityLabel="Exporter le devis (PDF)"
              accessibilityRole="button"
              activeOpacity={0.85}
              style={styles.action}
              onPress={exporterLeDevis}>
              <Text style={styles.actionTexte}>Exporter le devis (PDF)</Text>
            </TouchableOpacity>

            {/*
              LE PLAN EN PIED DE TICKET — d'où sortent ces quantités.

              Il vient APRÈS les lignes et non avant : un ticket commence par
              ce qu'on achète. Il est là pour la question qui suit — « pourquoi
              ce prix ? » — et la légende du dessus y répond déjà, appareil par
              appareil.
            */}
            <Text style={styles.rayonNom}>D’où viennent ces quantités</Text>
            <View style={styles.cadrePlan} pointerEvents="none">
              <View style={styles.plan}>
                <FloorplanEditor
                  showMeasures={false}
                  /*
                    PAS DE POINTS CARDINAUX ICI — relevé du patron.

                    Le titre au-dessus dit à quoi sert ce plan : « D'où
                    viennent ces quantités ». Il ne sert pas à s'orienter sur
                    un chantier, il sert à relier un chiffre du ticket à un
                    dessin. La couronne répond à une question que personne ne
                    se pose devant un devis, et sur une vignette de cette
                    taille elle prend les quatre coins.
                  */
                  showNorth={false}
                  editable={false}
                  selectedWallId={null}
                  onSelectWall={() => {}}
                />
              </View>
            </View>
            {/*
              LA LÉGENDE DU PLAN, sous le plan — et avec SON symbole.

              Ici la photo du produit ne servirait à rien : ce qu'on cherche,
              c'est à relier un chiffre du ticket à un dessin du plan. On
              reprend donc le tracé EXACT que le calque pose sur le dessin,
              lu dans la même table. Une légende qui redessinerait ses propres
              symboles cesserait d'être une légende le jour où l'un des deux
              changerait.
            */}
            {devis.legende.map((l) => (
              <View key={`${l.plafond ? 'p' : 'm'}-${l.kind}`} style={styles.legende}>
                <SymboleDuPlan ligne={l} />
                <Text style={styles.legendeNom}>{l.titre}</Text>
                <Text style={styles.legendeCompte}>{`× ${l.quantite}`}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Le bouton reste POSÉ SUR LA PAGE, sous le rouleau : on ne fait pas
          défiler trente lignes pour retrouver « Continuer ». */}
      {etape < ETAPE_PRIX && (
        <TouchableOpacity
          accessibilityLabel="Voir le prix"
          accessibilityRole="button"
          activeOpacity={0.85}
          style={styles.action}
          onPress={() => avancer(etape + 1)}>
          <Text style={styles.actionTexte}>Voir le prix</Text>
        </TouchableOpacity>
      )}
      <PromptSheet data={prompt} onClose={() => setPrompt(null)} />
    </RetourGlisse>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
      paddingTop: 58,
      paddingHorizontal: 18,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    roundButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...ombreBouton,
    },
    titrePage: {
      color: c.ink,
      fontSize: 21,
      fontWeight: '700',
      letterSpacing: -0.3,
      marginLeft: 12,
    },
    // ------------------------------------------------------ le fil d'étapes
    fil: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
    filCase: { alignItems: 'center', width: 74 },
    filTrait: {
      flex: 1,
      height: 2,
      borderRadius: 1,
      backgroundColor: c.line,
      marginTop: 15,
    },
    filTraitFait: { backgroundColor: c.blue },
    pastille: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: c.line,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pastillePleine: { backgroundColor: c.blue, borderColor: c.blue },
    pastilleTexte: { color: c.inkFaint, fontSize: 14, fontWeight: '600' },
    pastilleTexteFort: { color: '#FFFFFF' },
    filNom: { color: c.inkFaint, fontSize: 11, fontWeight: '700', marginTop: 5 },
    filNomFort: { color: c.ink },
    // ------------------------------------------------------- le gros titre
    rang: {
      color: c.blue,
      fontSize: 11.5,
      fontWeight: '600',
      letterSpacing: 1.1,
    },
    gros: {
      color: c.ink,
      fontSize: 30,
      lineHeight: 35,
      fontWeight: '700',
      letterSpacing: -0.9,
      marginTop: 2,
      marginBottom: 4,
    },
    sous: { color: c.inkFaint, fontSize: 13, lineHeight: 18, marginBottom: 14 },
    // ----------------------------------------------------------- le rouleau
    rouleau: { flex: 1 },
    rouleauFond: { paddingTop: 10, paddingBottom: 24 },
    texts: { flex: 1 },
    // -------------------------------------------------------- les gammes
    carte: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: 'transparent',
      paddingHorizontal: 15,
      paddingVertical: 14,
      marginBottom: 9,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    carteChoisie: { borderColor: c.blue },
    carteNom: { color: c.ink, fontSize: 15.5, fontWeight: '600' },
    carteNote: {
      color: c.inkFaint,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 3,
    },
    coche: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: c.inkFaint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cocheOn: { backgroundColor: c.blue, borderColor: c.blue },
    cocheTexte: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    // ----------------------------------------------------- les exclusions
    exclusion: { flexDirection: 'row', gap: 9, marginBottom: 12 },
    tiret: { color: c.inkFaint, fontSize: 14, lineHeight: 19 },
    exclusionTexte: { flex: 1, color: c.inkSoft, fontSize: 14, lineHeight: 19 },
    manque: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      borderLeftColor: c.danger,
      paddingHorizontal: 13,
      paddingVertical: 11,
      marginTop: 6,
    },
    manqueTitre: { color: c.ink, fontSize: 13.5, fontWeight: '600' },
    manqueTexte: {
      color: c.inkFaint,
      fontSize: 12,
      lineHeight: 16.5,
      marginTop: 3,
    },
    // ----------------------------------------------- chercher et trier
    outils: { marginTop: 14 },
    recherche: {
      height: 42,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      paddingHorizontal: 16,
      color: c.ink,
      fontSize: 14.5,
    },
    tris: { flexDirection: 'row', gap: 8, marginTop: 9 },
    /* Quarante points sous le doigt : c'est une commande, pas une étiquette. */
    triPille: {
      height: 34,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    triPilleOn: { backgroundColor: c.blue },
    triTexte: { color: c.inkSoft, fontSize: 13, fontWeight: '700' },
    triTexteOn: { color: '#FFFFFF' },
    vide: {
      color: c.inkFaint,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 18,
      textAlign: 'center',
    },
    // ---------------------------------------------------------- le ticket
    /* L'en-tête d'un ticket : ce qu'on a acheté et où. Centré, en petites
       capitales espacées — la typographie d'une caisse, pas d'un formulaire. */
    entete: { alignItems: 'center', marginBottom: 6 },
    enseigne: {
      color: c.ink,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 1.6,
    },
    sousEnseigne: { color: c.inkFaint, fontSize: 11.5, marginTop: 3 },
    /* Le nom d'un rayon et son sous-total, sur la même ligne : c'est ce
       qu'on lit en diagonale pour savoir où part l'argent. */
    rayon: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: c.line,
      paddingTop: 12,
      marginTop: 16,
      marginBottom: 2,
    },
    rayonNom: {
      color: c.ink,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    rayonPrix: { color: c.ink, fontSize: 13, fontWeight: '600' },
    /* Une ligne d'article : la photo, le nom, le compte, le prix. Aucun
       cadre, aucune ombre — un ticket est une colonne, pas des cartes. */
    article: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 9,
    },
    vignette: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    articleNom: { color: c.ink, fontSize: 14, fontWeight: '700' },
    articleDetail: { color: c.inkFaint, fontSize: 12, marginTop: 2 },
    articlePrixTouchable: { color: c.blue, fontWeight: '600', textDecorationLine: 'underline' },
    articleNote: { color: c.inkFaint, fontSize: 11, lineHeight: 15, marginTop: 3 },
    /* La provenance du prix : plus petite et plus pâle que le reste. On la
       cherche quand on la cherche, elle ne dispute pas la ligne au libellé. */
    articleSource: { color: c.inkFaint, fontSize: 10, marginTop: 2 },
    articleOffres: { color: c.inkSoft, fontSize: 10, marginTop: 1 },
    /* Le prix d'achat pro : en vert d'encre, c'est ce qui reste en poche. */
    articlePro: { color: c.green, fontSize: 10.5, fontWeight: '600', marginTop: 2 },
    /* Ce qui n'a pas été mesuré le dit, en bleu : c'est la couleur du devis. */
    articleOrigine: {
      color: c.blue,
      fontSize: 10,
      fontWeight: '700',
      marginTop: 3,
    },
    colonneDroite: { alignItems: 'flex-end' },
    pasRangee: { flexDirection: 'row', gap: 6, marginTop: 6 },
    pas: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.blueSoft,
    },
    pasEteint: { backgroundColor: c.line },
    pasRetirer: { backgroundColor: c.surface },
    // ---------------------------------------------------- les lignes libres
    libreEditeur: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 12,
      marginBottom: 12,
      gap: 8,
    },
    libreCourantes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    libreChamp: {
      height: 40,
      borderRadius: radius.sm,
      backgroundColor: c.bg,
      paddingHorizontal: 12,
      color: c.ink,
      fontSize: 14,
    },
    libreRangee: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    libreCase: { flex: 1 },
    libreFaute: { color: c.danger, fontSize: 12 },
    // ------------------------------------------------- la TVA, les conditions
    tvaRangee: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 8 },
    tvaNom: { color: c.inkSoft, fontSize: 12.5, marginRight: 2 },
    tvaPille: {
      height: 30,
      paddingHorizontal: 11,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    condition: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    conditionNom: { color: c.ink, fontSize: 13.5, fontWeight: '600' },
    conditionValeur: { flex: 1, color: c.blue, fontSize: 13.5, fontWeight: '600', textAlign: 'right' },
    porteMagasin: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.blueSoft,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    porteMot: { flex: 1, color: c.blue, fontSize: 14, fontWeight: '700' },
    porteChevron: { color: c.blue, fontSize: 20, fontWeight: '700' },
    /*
      LE CHANGEMENT DE GAMME PREND LA FORME DE LA PORTE DU MAGASIN — même
      encart bleu, même chevron. Ce sont les deux seuls gestes du ticket qui
      mènent ailleurs ; leur donner deux dessins différents ferait chercher
      lequel des deux ouvre quoi.
    */
    gammeBouton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.blueSoft,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    gammeTextes: { flex: 1, gap: 1 },
    gammeRole: {
      color: c.blue,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.8,
      opacity: 0.8,
    },
    gammeNom: { color: c.blue, fontSize: 15, fontWeight: '700' },
    /* Le bandeau des tarifs respire au-dessus des outils de recherche. */
    bandeauTarifs: { marginBottom: 12 },
    articlePrix: { color: c.ink, fontSize: 14, fontWeight: '600' },
    /* Un article écarté : barré et pâli, mais TOUJOURS LISIBLE — c'est son
       prix qu'on regarde pour décider de le remettre. */
    barre: {
      textDecorationLine: 'line-through',
      color: c.inkFaint,
      fontWeight: '600',
    },
    efface: { opacity: 0.35 },
    remettre: {
      alignSelf: 'flex-start',
      height: 34,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    remettreTexte: { color: c.blue, fontSize: 12.5, fontWeight: '700' },
    /* Le trait de découpe : deux filets, comme la perforation d'un rouleau. */
    decoupe: {
      borderTopWidth: 2,
      borderTopColor: c.ink,
      marginTop: 20,
      opacity: 0.85,
    },
    /* Sous le chiffre, et gris : ce n'est pas une note de bas de page,
       c'est la moitié de la phrase que le total commence. */
    sousTotal: {
      color: c.inkSoft,
      fontSize: 12.5,
      lineHeight: 17,
      textAlign: 'right',
      marginTop: 4,
    },
    sousTotalPro: {
      color: c.green,
      fontSize: 12.5,
      lineHeight: 17,
      fontWeight: '600',
      textAlign: 'right',
      marginTop: 4,
    },
    totalNom: {
      color: c.ink,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 1.2,
    },
    total: {
      color: c.blue,
      fontSize: 30,
      fontWeight: '700',
      letterSpacing: -0.9,
    },
    mentions: {
      color: c.inkFaint,
      fontSize: 11,
      lineHeight: 15.5,
      marginTop: 6,
      marginBottom: 18,
    },
    cadrePlan: {
      borderRadius: radius.md,
      backgroundColor: c.surface,
      overflow: 'hidden',
      marginTop: 8,
    },
    plan: { height: 220 },
    /* La légende du plan : le symbole, le nom, le compte. Serrée — c'est une
       liste de repérage, pas une seconde facture. */
    legende: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 5,
    },
    legendeNom: { flex: 1, color: c.inkSoft, fontSize: 12.5 },
    legendeCompte: { color: c.ink, fontSize: 12.5, fontWeight: '600' },
    // ------------------------------------------------------------ l'action
    action: {
      height: 50,
      borderRadius: radius.pill,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      marginBottom: 22,
    },
    actionTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  }),
);
