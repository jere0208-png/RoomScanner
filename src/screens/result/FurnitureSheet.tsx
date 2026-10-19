/**
 * LE CATALOGUE DE MOBILIER.
 *
 * Une recherche plutôt qu'un mode d'emploi : à trente entrées, on sait ce
 * qu'on cherche, et faire défiler la liste prend plus de temps que de le
 * taper. Le filtre ignore accents et casse — « evier » doit trouver
 * « Évier », sinon il vaudrait mieux ne pas en avoir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ET LA TUILE SE PREND EN MAIN — le glisser-poser, cinquième des dix
 * améliorations.
 *
 * Toucher une tuile posait le meuble au CENTRE d'une pièce qu'il fallait
 * d'abord désigner dans une liste. Trois décisions pour un geste qui n'en
 * demande qu'une, et un meuble jamais là où on le voulait. Maintenant on
 * MAINTIENT la tuile, le catalogue s'écarte, et on lâche le meuble à sa
 * place sur le plan.
 *
 * POURQUOI « MAINTENIR », ET PAS « TIRER TOUT DE SUITE ». Le catalogue
 * défile verticalement ; un glissement immédiat appartient donc à la LISTE,
 * et si la tuile s'en emparait on ne pourrait plus parcourir le catalogue.
 * C'est le geste d'iOS, et il n'y en a pas d'autre de possible : la tuile
 * prend le toucher dès l'appui, puis REND LA MAIN à la liste
 * (`onResponderTerminationRequest`) tant qu'elle n'est pas levée.
 *
 * L'APPUI BREF, LUI, NE CHANGE PAS. Le glisser-poser ajoute un geste, il
 * n'en retire aucun : qui touche une tuile pose toujours le meuble au
 * centre de la pièce, comme hier.
 */
import React from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  PanResponder,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { useTheme } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '../../components/Sheet';
import { CATALOGUE, SUR_MESURE, type CatalogItem } from '../../geometry/catalogue';
import { furnKind, furnitureStrokes } from '../../geometry/furniture';
import { vignetteDuMeuble, vignetteEnCache } from '../../geometry/vignette3d';
import { estUnTap } from '../../ui/geste';
import { haptic } from '../../ui/haptic';
import { fr } from './format';
import { getStyles } from './styles';

/** Recherche sans accent ni casse : « evier » doit trouver « Évier ». */
const sansAccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Ce qu'on tape pour dire la même chose — revue « Théo » : « tv » ne
 * trouvait pas la télévision.
 */
const SYNONYMES: Record<string, string[]> = {
  tv: ['television', 'tele'],
  tele: ['television', 'tv'],
  frigo: ['refrigerateur'],
  sdb: ['salle de bain', 'salle d’eau', 'baignoire', 'douche'],
  wc: ['toilette'],
  sofa: ['canape'],
  divan: ['canape'],
  salon: ['sejour'],
};

/*
  « SALLE DE BAIN » SE DIT AUSSI — agent testeur MEUBLES : la famille
  s'appelle « Salle d'eau », et « salle de bain » ne trouvait rien.
*/
const EXPRESSIONS: [RegExp, string][] = [[/\bsalles? de bains?\b/g, 'salle d’eau']];

/** « chaises » trouve « Chaise », « tableaux » trouve « Tableau ». */
const singulier = (m: string) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m);

/**
 * MOT PAR MOT — revue « Théo » : « table manger » et « canape angle » ne
 * trouvaient rien, parce que la recherche voulait la suite exacte. Chaque
 * mot tapé doit se retrouver, dans n'importe quel ordre.
 */
/*
  AU PLURIEL, ET PAR PIÈCE — agent testeur MEUBLES : « chaises »,
  « canapés », « meubles hauts » ne trouvaient rien (la recherche voulait le
  mot exact, au singulier), ni « cuisine » ou « chambre » (le nom de la
  famille n'était pas lu). `famille` : le nom de la famille du catalogue.
*/
export function matchItem(item: CatalogItem, quete: string, famille = ''): boolean {
  let q = sansAccent(quete.trim());
  for (const [motif, dit] of EXPRESSIONS) q = q.replace(motif, dit);
  const mots = q.split(/[\s'’-]+/).filter(Boolean);
  if (mots.length === 0) return true;
  const texte = sansAccent(`${item.label} ${item.category} ${famille}`);
  const trouve = (m: string) => texte.includes(m) || (SYNONYMES[m] ?? []).some((s) => texte.includes(sansAccent(s)));
  return mots.every((m) => trouve(m) || trouve(singulier(m)));
}

/**
 * CE QU'IL FAUT MAINTENIR POUR LEVER UNE TUILE (ms).
 *
 * Trois cent vingt millisecondes : celui d'iOS pour un glisser-poser. Plus
 * court, on lève des tuiles en voulant défiler ; plus long, le geste paraît
 * ne pas répondre et on recommence.
 */
export const ATTENTE_LEVEE = 320;

/*
  LES VIGNETTES SE CALCULENT UNE À UNE, ENTRE DEUX IMAGES.

  Une vignette en vraie 3D coûte une vingtaine de millisecondes ; soixante-dix
  d'un coup gèleraient l'ouverture du catalogue. Elles passent donc dans une
  file, une par tour de boucle : le catalogue s'ouvre aussitôt, sur les
  symboles, et chaque tuile prend sa vignette dès qu'elle est prête.
*/
const file: (() => void)[] = [];
let fileEnCours = false;
function planifier(tache: () => void) {
  file.push(tache);
  if (fileEnCours) return;
  fileEnCours = true;
  const suivante = () => {
    const t = file.shift();
    if (!t) {
      fileEnCours = false;
      return;
    }
    t();
    setTimeout(suivante, 0);
  };
  setTimeout(suivante, 0);
}

/**
 * LE MEUBLE TEL QU'ON LE VERRA EN 3D — relevé du patron : « change
 * l'affichage des icônes des meubles lors du choix par ce que l'on voit
 * réellement dans le plan 3D ». Le même modèle que la maquette, de trois
 * quarts (`vignette3d`). En attendant qu'elle soit prête : le symbole du
 * plan, vu de dessus.
 */
export function FurnitureThumb({
  item,
  echelle = 1,
}: {
  item: CatalogItem;
  echelle?: number;
}) {
  const W = 74 * echelle;
  const H = 52 * echelle;
  const finesse = Math.min(2, PixelRatio.get() || 1);
  const lw = Math.round(W * finesse);
  const lh = Math.round(H * finesse);
  const meuble = { key: item.key, category: item.category, w: item.w, d: item.d, h: item.h };
  const [image, setImage] = React.useState<string | null>(() => vignetteEnCache(meuble, lw, lh));
  React.useEffect(() => {
    if (image) return;
    let vivant = true;
    planifier(() => {
      if (!vivant) return;
      const uri = vignetteDuMeuble(meuble, lw, lh);
      if (vivant) setImage(uri);
    });
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.key, lw, lh]);
  if (image) {
    return (
      <Image
        source={{ uri: image }}
        style={{ width: W, height: H }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        testID={`vignette-${item.key}`}
      />
    );
  }
  return <SymboleDuMeuble item={item} W={W} H={H} echelle={echelle} />;
}

/** La silhouette du meuble, vue de dessus : on le reconnaît sans lire. */
function SymboleDuMeuble({ item, W, H, echelle }: { item: CatalogItem; W: number; H: number; echelle: number }) {
  const c = useTheme();
  // Emprise mise à l'échelle de la vignette, marges comprises.
  const k = Math.min((W - 14 * echelle) / item.w, (H - 14 * echelle) / item.d);
  const w = item.w * k;
  const d = item.d * k;
  return (
    <Svg width={W} height={H}>
      <SvgRect
        x={(W - w) / 2}
        y={(H - d) / 2}
        width={w}
        height={d}
        rx={3}
        fill={c.blueSoft}
        stroke={c.blue}
        strokeWidth={1.2 * echelle}
      />
      {furnitureStrokes(furnKind(item.category), w, d).map((ligne, li) => (
        <React.Fragment key={li}>
          {ligne.slice(1).map((pt, pi) => (
            <SvgLine
              key={pi}
              x1={W / 2 + ligne[pi].x}
              y1={H / 2 + ligne[pi].y}
              x2={W / 2 + pt.x}
              y2={H / 2 + pt.y}
              stroke={c.blue}
              strokeWidth={1.1 * echelle}
              strokeLinecap="round"
            />
          ))}
        </React.Fragment>
      ))}
    </Svg>
  );
}

/**
 * UNE TUILE QUI SE LAISSE PRENDRE.
 *
 * Elle s'empare du toucher dès l'appui — sans quoi le premier mouvement
 * partirait à la liste et on ne pourrait jamais lever un meuble — mais elle
 * la REND tant qu'elle n'est pas levée : le catalogue défile comme avant.
 */
function TuileMeuble({
  item,
  onPick,
  onLever,
  onSuivre,
  onFin,
}: {
  item: CatalogItem;
  onPick: (item: CatalogItem) => void;
  onLever: (item: CatalogItem, page: { x: number; y: number }) => void;
  onSuivre: (item: CatalogItem, page: { x: number; y: number }) => void;
  onFin: (item: CatalogItem, page: { x: number; y: number } | null) => void;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  const leve = React.useRef(false);
  const renonce = React.useRef(false);
  const minuteur = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const depart = React.useRef({ x: 0, y: 0 });
  const [enMain, setEnMain] = React.useState(false);
  // La tuile s'enfonce sous le doigt puis se soulève quand elle est prise :
  // c'est le seul retour qui dit « je l'ai » avant que la main ne bouge.
  const prise = React.useRef(new Animated.Value(0)).current;

  const eteindre = React.useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    leve.current = false;
    renonce.current = false;
    setEnMain(false);
    Animated.timing(prise, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [prise]);

  /*
    LES POSITIONS VIENNENT DE `nativeEvent`, PAS DE `gestureState`.

    Le geste se joue à l'ÉCHELLE DE LA PAGE : le meuble part d'une fenêtre
    et atterrit sur le plan qui est dessous. `gestureState` ne connaît que
    des déplacements ; `pageX/pageY` donnent le point, qui est la seule
    chose dont l'atterrissage ait besoin.
  */
  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => !leve.current,
        onPanResponderGrant: (e) => {
          const { pageX, pageY } = e.nativeEvent;
          depart.current = { x: pageX, y: pageY };
          leve.current = false;
          renonce.current = false;
          Animated.timing(prise, {
            toValue: 0.5,
            duration: ATTENTE_LEVEE,
            useNativeDriver: true,
          }).start();
          minuteur.current = setTimeout(() => {
            if (renonce.current) return;
            leve.current = true;
            setEnMain(true);
            haptic('leger');
            Animated.spring(prise, {
              toValue: 1,
              friction: 6,
              tension: 120,
              useNativeDriver: true,
            }).start();
            onLever(item, depart.current);
          }, ATTENTE_LEVEE);
        },
        onPanResponderMove: (e) => {
          const { pageX, pageY } = e.nativeEvent;
          if (leve.current) {
            onSuivre(item, { x: pageX, y: pageY });
            return;
          }
          // Avant la levée, un vrai glissement appartient à la liste : on
          // renonce, et la tuile rendra la main à la première demande.
          if (
            !estUnTap(pageX - depart.current.x, pageY - depart.current.y)
          ) {
            renonce.current = true;
            if (minuteur.current) clearTimeout(minuteur.current);
            minuteur.current = null;
            Animated.timing(prise, {
              toValue: 0,
              duration: 100,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderRelease: (e) => {
          const { pageX, pageY } = e.nativeEvent;
          const etaitLeve = leve.current;
          eteindre();
          if (etaitLeve) {
            onFin(item, { x: pageX, y: pageY });
            return;
          }
          if (
            !renonce.current &&
            estUnTap(pageX - depart.current.x, pageY - depart.current.y)
          ) {
            onPick(item);
          }
        },
        onPanResponderTerminate: () => {
          const etaitLeve = leve.current;
          eteindre();
          if (etaitLeve) onFin(item, null);
        },
      }),
    // Les rappels sont stables à la vie de la fenêtre : un PanResponder
    // reconstruit en cours de geste perd le toucher qu'il tenait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.key],
  );

  React.useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  return (
    <Animated.View
      accessibilityRole="button"
      accessibilityLabel={`${item.label}, ${fr(item.w, 2)} sur ${fr(
        item.d,
        2,
      )} mètres`}
      accessibilityHint="Toucher pour poser au centre d'une pièce, maintenir pour glisser sur le plan"
      style={[
        styles.catCard,
        enMain && styles.catCardEnMain,
        {
          transform: [
            {
              scale: prise.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [1, 0.94, 1.1],
              }),
            },
          ],
        },
      ]}
      {...pan.panHandlers}>
      <FurnitureThumb item={item} />
      <Text style={styles.catName} numberOfLines={1}>
        {item.label}
      </Text>
      <Text style={styles.catDims}>
        {`${fr(item.w, 2)} × ${fr(item.d, 2)} m`}
      </Text>
    </Animated.View>
  );
}

export function FurnitureSheet({
  visible,
  quete,
  onQuete,
  onClose,
  onPick,
  onGlisser,
  onLacher,
  poseValide = true,
  titre = 'Ajouter un meuble',
}: {
  /** Le titre de la feuille : « Remplacer … par » quand on remplace un meuble. */
  titre?: string;
  visible: boolean;
  quete: string;
  onQuete: (q: string) => void;
  onClose: () => void;
  onPick: (item: CatalogItem) => void;
  /** Le meuble est en main, à ce point de l'écran. */
  onGlisser?: (item: CatalogItem, page: { x: number; y: number }) => void;
  /** Le doigt s'est levé : ici, ou nulle part si le geste a été interrompu. */
  onLacher?: (item: CatalogItem, page: { x: number; y: number } | null) => void;
  /**
   * Le meuble en main tomberait-il quelque part ?
   *
   * L'écran seul le sait — il voit le plan ET le doigt. Le fantôme s'en
   * sert pour le DIRE AVANT le lâcher : un refus qui n'arrive qu'après coup
   * se vit comme une panne, et l'on recommence trois fois le même geste.
   */
  poseValide?: boolean;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  const [enMain, setEnMain] = React.useState<CatalogItem | null>(null);
  const [doigt, setDoigt] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  /*
    UNE FAMILLE À LA FOIS, SI L'ON VEUT — relevé du patron : « peaufine
    l'aspect ameublement ». Le catalogue a dépassé les quatre-vingt-dix
    articles ; une rangée de puces mène droit à la décoration ou au jardin
    sans faire défiler les cuisines. « Tout » rend la liste entière.
  */
  const [familleChoisie, setFamilleChoisie] = React.useState<string | null>(null);
  /*
    LE CLAVIER NE CACHE PLUS LES MEUBLES QU'ON CHERCHE — relevé du patron :
    « la zone de texte gêne l'affichage du listing meubles ». La fenêtre
    était centrée sur l'écran entier : on tapait « frig », le clavier
    montait et recouvrait la liste. Clavier ouvert, elle se cale en haut de
    l'écran et s'arrête au clavier ; la liste prend la place qui reste et
    défile dedans. La consigne et le lien du meuble sur mesure s'effacent le
    temps de la frappe : c'est de la place pour les résultats.
  */
  const clavier = useKeyboardInset();
  const marges = useSafeAreaInsets();
  const auClavier = clavier > 0;
  const hauteurEcran = Dimensions.get('window').height;
  /*
    LE MEUBLE SUR MESURE — correctif de l'audit. Quatre champs : un nom, et
    les trois cotes au centimètre, comme on les relève au mètre ruban. Le
    bouton ne pose que des cotes de meuble (de 5 cm à 6 m).
  */
  const [mesure, setMesure] = React.useState<{ ouvert: boolean; nom: string; l: string; p: string; h: string }>({
    ouvert: false,
    nom: '',
    l: '',
    p: '',
    h: '',
  });
  const enMetres = (v: string) => {
    const n = Number(v.replace(',', '.').trim());
    return isFinite(n) && n >= 5 && n <= 600 ? Math.round(n) / 100 : null;
  };
  const cotesSurMesure = {
    w: enMetres(mesure.l),
    d: enMetres(mesure.p),
    h: enMetres(mesure.h),
  };
  const surMesurePret = cotesSurMesure.w !== null && cotesSurMesure.d !== null && cotesSurMesure.h !== null;
  const poserSurMesure = () => {
    if (!surMesurePret) return;
    haptic('leger');
    onPick({
      key: SUR_MESURE,
      label: mesure.nom.trim() || 'Meuble sur mesure',
      category: 'storage',
      w: cotesSurMesure.w!,
      d: cotesSurMesure.d!,
      h: cotesSurMesure.h!,
      matiere: 'bois',
    });
    setMesure({ ouvert: false, nom: '', l: '', p: '', h: '' });
  };
  /*
    LE CATALOGUE S'EFFACE, IL NE SE FERME PAS.

    Fermer la fenêtre romprait le toucher en cours — et le meuble tomberait
    au premier centimètre. On la rend seulement TRANSPARENTE : le plan, qui
    est dessous, réapparaît, et le doigt continue de tenir sa tuile.
  */
  const voile = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.timing(voile, {
      toValue: enMain ? 0 : 1,
      duration: enMain ? 160 : 130,
      useNativeDriver: true,
    }).start();
  }, [enMain, voile]);

  // Une fenêtre qu'on rouvre ne garde pas un meuble en main de la fois d'avant.
  React.useEffect(() => {
    if (!visible) {
      setEnMain(null);
      setDoigt(null);
      setFamilleChoisie(null);
      setMesure((m) => ({ ...m, ouvert: false }));
    }
  }, [visible]);

  const lever = (item: CatalogItem, page: { x: number; y: number }) => {
    /* Le clavier de la recherche couvre la moitié basse de l'écran : on ne
       tire pas un meuble sur un plan qu'il cache. */
    Keyboard.dismiss();
    setEnMain(item);
    setDoigt(page);
    onGlisser?.(item, page);
  };
  const suivre = (item: CatalogItem, page: { x: number; y: number }) => {
    setDoigt(page);
    onGlisser?.(item, page);
  };
  const finir = (
    item: CatalogItem,
    page: { x: number; y: number } | null,
  ) => {
    setEnMain(null);
    setDoigt(null);
    // Sans plan où lâcher (on remplace un meuble), la tuile levée se choisit.
    if (onLacher) onLacher(item, page);
    else if (page) onPick(item);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable
        style={[
          styles.modalBackdrop,
          auClavier && { justifyContent: 'flex-start', paddingTop: marges.top + 8, paddingBottom: clavier + 8 },
        ]}
        onPress={onClose}>
        <Animated.View style={[styles.catVoile, { opacity: voile }]}>
          <Pressable
            style={[styles.modalCard, auClavier && { maxHeight: hauteurEcran - clavier - marges.top - 16 }]}
            onPress={() => {}}>
            <Text style={styles.modalTitle} numberOfLines={1}>{titre}</Text>
            {!auClavier && (
              <Text style={styles.catAide}>
                Touchez pour poser au centre, maintenez pour glisser sur le plan.
              </Text>
            )}
            <TextInput
              style={styles.catSearch}
              value={quete}
              onChangeText={onQuete}
              placeholder="Rechercher un meuble…"
              placeholderTextColor={teinte.inkFaint}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {(!auClavier || mesure.ouvert) && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Meuble sur mesure"
              accessibilityState={{ expanded: mesure.ouvert }}
              activeOpacity={0.7}
              style={surMesure.ouvrir}
              onPress={() => {
                haptic('leger');
                setMesure((m) => ({ ...m, ouvert: !m.ouvert }));
              }}>
              <Text style={[surMesure.ouvrirTexte, { color: teinte.blue }]}>
                {mesure.ouvert ? 'Fermer le meuble sur mesure' : '+ Meuble sur mesure, à vos cotes'}
              </Text>
            </TouchableOpacity>
            )}
            {mesure.ouvert && (
              <View style={[surMesure.cadre, { backgroundColor: teinte.surfaceSunken }]}>
                <TextInput
                  accessibilityLabel="Nom du meuble"
                  style={[styles.catSearch, surMesure.nom]}
                  value={mesure.nom}
                  onChangeText={(nom) => setMesure((m) => ({ ...m, nom }))}
                  placeholder="Nom (ex. : bibliothèque du salon)"
                  placeholderTextColor={teinte.inkFaint}
                />
                <View style={surMesure.cotes}>
                  {(
                    [
                      ['l', 'Largeur (cm)', 'Larg.'],
                      ['p', 'Profondeur (cm)', 'Prof.'],
                      ['h', 'Hauteur (cm)', 'Haut.'],
                    ] as const
                  ).map(([cle, nom, court]) => (
                    <TextInput
                      key={cle}
                      accessibilityLabel={nom}
                      style={[styles.catSearch, surMesure.cote]}
                      value={mesure[cle]}
                      onChangeText={(v) => setMesure((m) => ({ ...m, [cle]: v }))}
                      placeholder={`${court} cm`}
                      placeholderTextColor={teinte.inkFaint}
                      keyboardType="number-pad"
                    />
                  ))}
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Poser le meuble sur mesure"
                  disabled={!surMesurePret}
                  activeOpacity={0.8}
                  style={[surMesure.poser, { backgroundColor: surMesurePret ? teinte.blue : teinte.line }]}
                  onPress={poserSurMesure}>
                  <Text style={surMesure.poserTexte}>Poser</Text>
                </TouchableOpacity>
              </View>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={familles.rangee}
              contentContainerStyle={familles.contenu}>
              {[null, ...CATALOGUE.map((f) => f.name)].map((nom) => {
                const choisie = familleChoisie === nom;
                return (
                  <TouchableOpacity
                    key={nom ?? 'tout'}
                    accessibilityRole="button"
                    accessibilityLabel={`Famille ${nom ?? 'Tout'}`}
                    accessibilityState={{ selected: choisie }}
                    activeOpacity={0.7}
                    style={[
                      familles.puce,
                      { backgroundColor: choisie ? teinte.blue : teinte.surfaceSunken },
                    ]}
                    onPress={() => {
                      haptic('leger');
                      setFamilleChoisie(nom);
                    }}>
                    <Text style={[familles.texte, choisie ? familles.texteChoisi : { color: teinte.ink }]}>
                      {nom ?? 'Tout'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <ScrollView
              style={[styles.catScroll, auClavier && { flexShrink: 1 }]}
              keyboardShouldPersistTaps="handled">
              {CATALOGUE.map((famille) => {
                if (familleChoisie && famille.name !== familleChoisie) return null;
                const trouves = famille.items.filter((i) => matchItem(i, quete, famille.name));
                if (trouves.length === 0) return null;
                return (
                  <View key={famille.name}>
                    <Text style={styles.elecFamily}>{famille.name}</Text>
                    <View style={styles.catGrid}>
                      {trouves.map((item) => (
                        <TuileMeuble
                          key={item.key}
                          item={item}
                          onPick={onPick}
                          onLever={lever}
                          onSuivre={suivre}
                          onFin={finir}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
      {/*
        LE MEUBLE EN MAIN — sous le doigt, jamais dessous au sens propre : il
        est décalé vers le haut, sinon le pouce cache exactement ce qu'on
        cherche à placer.
      */}
      {enMain && doigt ? (
        <View style={styles.catFantomeCadre} pointerEvents="none">
          <View
            style={[
              styles.catFantome,
              !poseValide && styles.catFantomeRefus,
              { left: doigt.x - 55, top: doigt.y - 96 },
            ]}>
            <FurnitureThumb item={enMain} echelle={1.5} />
            <Text style={styles.catFantomeNom} numberOfLines={1}>
              {poseValide ? enMain.label : 'Pas ici'}
            </Text>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

/** La rangée des familles, sous la recherche. */
const surMesure = StyleSheet.create({
  ouvrir: { paddingVertical: 8 },
  ouvrirTexte: { fontSize: 14, fontWeight: '600' },
  cadre: { borderRadius: 14, padding: 10, gap: 8, marginBottom: 6 },
  nom: { paddingVertical: 8 },
  cotes: { flexDirection: 'row', gap: 6 },
  cote: { flex: 1, paddingVertical: 8, paddingHorizontal: 10 },
  poser: { height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  poserTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});

const familles = StyleSheet.create({
  rangee: { flexGrow: 0, marginTop: 8, marginBottom: 2 },
  contenu: { gap: 6, paddingRight: 8 },
  puce: { paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: 'center' },
  texte: { fontSize: 13, fontWeight: '600' },
  texteChoisi: { color: '#FFFFFF' },
});
