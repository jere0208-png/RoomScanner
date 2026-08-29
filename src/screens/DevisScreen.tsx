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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { FloorplanEditor } from '../components/FloorplanEditor';
import { DevisAttention } from '../components/DevisAttention';
import { TotalQuiMonte } from '../components/TotalQuiMonte';
import { cleDeLigne, type Devis, type LigneDevis, type LigneLegende } from '../geometry/devis';
import { chiffrerLePlan } from '../geometry/devisplan';
import { CEILINGS, CEILING_SYMBOL, type CeilingKind } from '../geometry/ceiling';
import { FIXTURES, postsSymbol, type FixtureKind } from '../geometry/electrical';
import {
  GAMMES,
  RELEVE_RAYON,
  dateDuReleve,
  moisDeLaVersion,
  releveDuJour,
} from '../geometry/prix';
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
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';

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
}: {
  ligne: LigneDevis;
  styles: ReturnType<typeof getStyles>;
  couleurs: Palette;
  onBasculer: () => void;
  onMoins: () => void;
  onPlus: () => void;
}) {
  const hors = !!ligne.ecarte;
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
        <Text style={styles.articleDetail}>
          {ligne.pu === null
            ? `${ligne.quantite} ${ligne.unite} — pas de prix au catalogue`
            : `${ligne.quantite} ${ligne.unite} × ${euros(ligne.pu)}`}
        </Text>
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
        {!!ligne.source && ligne.pu !== null && (
          <Text style={styles.articleSource}>
            {`${ligne.source}${ligne.releve ? ` · ${dateDuReleve(ligne.releve)}` : ''}`}
          </Text>
        )}
        {!!ligne.note && <Text style={styles.articleNote}>{ligne.note}</Text>}
      </View>
      <View style={styles.colonneDroite}>
        <Text style={[styles.articlePrix, hors && styles.barre]}>
          {hors
            ? euros((ligne.pu ?? 0) * ligne.quantite)
            : euros(ligne.total)}
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
  const [verif, setVerif] = useState<{
    issue: IssueTarifs;
    enseigne: string;
    jour: string;
    /** Le catalogue qui chiffre a-t-il été relevé aujourd'hui ? */
    duJour: boolean;
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

  /*
    LE MÊME CALCUL QUE LE BOUTON DU PLAN.

    Le total écrit sur la pastille verte et le détail de cette page sortent
    de `chiffrerLePlan` : deux lectures d'un seul calcul. Le jour où l'une
    recompterait de son côté, le bouton annoncerait un prix que la page ne
    retrouverait pas.
  */
  const horsJeu = useMemo(() => new Set(ecartes), [ecartes]);
  const devis: Devis = useMemo(
    () =>
      chiffrerLePlan(walls, rooms, fixtures, ceiling, gamme, horsJeu, openings, {
        quantites,
        ajouts,
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
    const releve = v.catalogue?.releve ?? RELEVE_RAYON;
    setVerif({
      issue: v.issue,
      enseigne: v.catalogue?.source ?? TARIF_EMBARQUE,
      jour: dateDuReleve(releve),
      duJour: releveDuJour(releve, Date.now()),
    });
    setVersionTarifs((n) => n + 1);
    setEnCours(false);
  }, []);

  useEffect(() => {
    if (etape !== ETAPE_PRIX || dejaVu.current) return;
    dejaVu.current = true;
    verifier(false).catch(() => {});
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

  /** Le nom de la gamme en toutes lettres — l'en-tête et le bouton le lisent. */
  const nomDeLaGamme = useMemo(() => {
    const g = GAMMES.find((x) => x.id === gamme);
    return g ? `${g.marque} ${g.nom}` : String(gamme);
  }, [gamme]);

  const avancer = (n: number) => {
    haptic('leger');
    setEtape(n);
  };

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
            <DevisAttention />
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
                  jour={verif.jour}
                  duJour={verif.duJour}
                  onVerifier={() => {
                    haptic('leger');
                    verifier(true).catch(() => {});
                  }}
                />
              </View>
            )}

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
                    onBasculer={() => {
                      haptic('leger');
                      basculer(cleDeLigne(l));
                    }}
                    onMoins={() => reglerLaQuantite(l, -1)}
                    onPlus={() => reglerLaQuantite(l, 1)}
                  />
                ))
              : devis.parFamille.map((f) => (
                  <View key={f.famille}>
                    <View style={styles.rayon}>
                      <Text style={styles.rayonNom}>{f.famille}</Text>
                      <Text style={styles.rayonPrix}>{euros(f.total)}</Text>
                    </View>
                    {filtrees
                      .filter((l) => l.famille === f.famille)
                      .map((l) => (
                        <Article
                          key={`${f.famille}-${l.libelle}`}
                          ligne={l}
                          styles={styles}
                          couleurs={c}
                          onMoins={() => reglerLaQuantite(l, -1)}
                          onPlus={() => reglerLaQuantite(l, 1)}
                          onBasculer={() => {
                            haptic('leger');
                            basculer(cleDeLigne(l));
                          }}
                        />
                      ))}
                  </View>
                ))}

            {/* Le trait de découpe, puis le total : la fin d'un ticket. */}
            <View style={styles.decoupe} />
            <View style={styles.rayon}>
              <Text style={styles.totalNom}>TOTAL TTC</Text>
              {/*
                LE SEUL NOMBRE POUR LEQUEL ON EST VENU — il monte au lieu de
                paraître. Voir `TotalQuiMonte` : sept dixièmes de seconde,
                et il ralentit en arrivant pour dire qu'il est arrivé.
              */}
              <TotalQuiMonte
                valeur={devis.total}
                format={euros}
                style={styles.total}
              />
            </View>
            {/*
              LE SEUL MALENTENDU QUI PUISSE COÛTER CHER À QUELQU'UN.

              Le total s'écrit en gros, et il ne dit QUE le matériel. Un
              professionnel lit « estimation de fourniture » et comprend sans
              la pose ; un particulier lit le prix de ses travaux, et il se
              trompe d'un facteur deux ou trois.

              LA MISE EN GARDE EXISTAIT DÉJÀ — en pied de ticket, en petit, et
              dans la langue du métier : « Fourniture seule, hors
              main-d'œuvre ». Personne ne lit trois paragraphes plus bas ce
              qui contredit le chiffre qu'il vient de lire en gros. Elle se
              pose donc SOUS le total, en français de tout le monde, et le
              banc mesure cette distance-là.
            */}
            <Text style={styles.sousTotal}>
              Le matériel seul — la pose n’est pas comprise.
            </Text>
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
              Les luminaires ne sont pas comptés. Prix publics indicatifs, à
              confirmer en magasin.
            </Text>

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
      ...shadowCard,
      shadowOpacity: 0.07,
      shadowRadius: 8,
    },
    titrePage: {
      color: c.ink,
      fontSize: 21,
      fontWeight: '800',
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
    pastilleTexte: { color: c.inkFaint, fontSize: 14, fontWeight: '800' },
    pastilleTexteFort: { color: '#FFFFFF' },
    filNom: { color: c.inkFaint, fontSize: 11, fontWeight: '700', marginTop: 5 },
    filNomFort: { color: c.ink },
    // ------------------------------------------------------- le gros titre
    rang: {
      color: c.blue,
      fontSize: 11.5,
      fontWeight: '800',
      letterSpacing: 1.1,
    },
    gros: {
      color: c.ink,
      fontSize: 30,
      lineHeight: 35,
      fontWeight: '800',
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
    carteNom: { color: c.ink, fontSize: 15.5, fontWeight: '800' },
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
    cocheTexte: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
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
    manqueTitre: { color: c.ink, fontSize: 13.5, fontWeight: '800' },
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
      fontWeight: '800',
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
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    rayonPrix: { color: c.ink, fontSize: 13, fontWeight: '800' },
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
    articleNote: { color: c.inkFaint, fontSize: 11, lineHeight: 15, marginTop: 3 },
    /* La provenance du prix : plus petite et plus pâle que le reste. On la
       cherche quand on la cherche, elle ne dispute pas la ligne au libellé. */
    articleSource: { color: c.inkFaint, fontSize: 10, marginTop: 2 },
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
      fontWeight: '800',
      letterSpacing: 0.8,
      opacity: 0.8,
    },
    gammeNom: { color: c.blue, fontSize: 15, fontWeight: '900' },
    /* Le bandeau des tarifs respire au-dessus des outils de recherche. */
    bandeauTarifs: { marginBottom: 12 },
    articlePrix: { color: c.ink, fontSize: 14, fontWeight: '800' },
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
    totalNom: {
      color: c.ink,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    total: {
      color: c.blue,
      fontSize: 30,
      fontWeight: '800',
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
    legendeCompte: { color: c.ink, fontSize: 12.5, fontWeight: '800' },
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
    actionTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  }),
);
