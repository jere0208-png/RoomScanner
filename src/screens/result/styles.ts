/**
 * LES STYLES DE L'ECRAN DES RESULTATS, A PART.
 *
 * Ils occupaient les huit cents dernieres lignes de `ResultScreen.tsx` --
 * un fichier de pres de quatre mille lignes ou la moindre retouche de mise
 * en page obligeait a faire defiler tout l'ecran pour retrouver la cle a
 * changer. Ils vivent desormais seuls, et les feuilles modales sorties du
 * meme fichier les partagent : `themedStyles` memoise par palette, donc
 * tout le monde recoit LE MEME objet, sans un style recalcule.
 */
import { StyleSheet } from 'react-native';
import { glow, radius, shadowCard, themedStyles, type Palette } from '../../theme';
import { MARGE_RANGEE, PILL_GAP } from '../../components/ToolPill';

export const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: 58,
    // Le plan touche presque les bords : c'est lui qu'on regarde.
    paddingHorizontal: 12,
  },
  /*
    L'ÉTAT VIDE OCCUPE CE QUI RESTE SOUS LA BARRE.

    Il n'avait pas de `flex` : posé sous la barre de retour, il se serait
    contenté de la hauteur de son texte, tout en haut de l'écran. Il prend
    donc le reste de la page et centre ce qu'il porte.
  */
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  /*
    LE BOUTON DE L'ÉTAT VIDE — à sa taille, pas à celle de la page.

    Il empruntait `primaryButton`, qui vit dans une RANGÉE horizontale : son
    `flex: 1` y prend la largeur restante. Dans une colonne, le même style
    prend toute la HAUTEUR — le bouton remplissait l'écran et poussait le
    texte contre le bord, où il se faisait couper. Un style de rangée ne se
    réutilise pas dans une pile.
  */
  emptyPrimary: {
    alignSelf: 'stretch',
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    ...glow(c.blue),
  },
  emptyTitle: { color: c.ink, fontSize: 22, fontWeight: '800' },
  emptyText: {
    color: c.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 26,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  /** Les actions de l'en-tête : rondes, 38 points, comme le retour. */
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    ...shadowCard,
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.07,
    shadowRadius: 8,
    marginRight: 12,
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  title: {
    color: c.ink,
    fontSize: 24,
    fontWeight: '800',
    // Un titre serré se lit comme un titre ; espacé, comme une étiquette.
    letterSpacing: -0.6,
    flexShrink: 1,
  },
  titleCol: { flex: 1, minWidth: 0 },
  titleSub: {
    color: c.inkFaint,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  editBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  editBadgeIcon: { color: c.blue, fontSize: 17, fontWeight: '700' },
  // Plus de liseré ni de séparateurs : c'est l'ombre qui pose la barre, et
  // l'écart entre le chiffre et son intitulé qui sépare les colonnes.
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    // Pleine largeur : c'est ce qui borne le cadre. Les cellules se
    // répartissent l'espace au lieu de le réclamer.
    alignSelf: 'stretch',
    marginTop: 8,
    marginBottom: 8,
    // Plus serré qu'avant : les chiffres restent, la hauteur perdue non.
    paddingVertical: 7,
    paddingHorizontal: 4,
    ...shadowCard,
  },
  metric: {
    flex: 1,
    // Sans cela, une cellule refuse de rétrécir sous la largeur de son
    // texte, et la rangée repart en débordement.
    minWidth: 0,
    paddingHorizontal: 3,
    alignItems: 'center',
  },
  metricBorder: { borderLeftWidth: 1, borderLeftColor: c.line },
  metricValue: {
    color: c.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  metricLabel: {
    color: c.inkFaint,
    fontSize: 8.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  /**
   * La rangée flottante en haut à droite du dessin : le contrôle des
   * normes, puis le sélecteur de vue. C'est ELLE qui porte l'ancrage —
   * ses pastilles restent alignées par construction, quelle que soit
   * leur largeur.
   */
  vueRangee: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /** Le sélecteur de vue, dans la rangée. */
  vuePastille: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...shadowCard,
    shadowOpacity: 0.1,
  },
  vuePastilleTexte: { color: c.ink, fontSize: 14, fontWeight: '800' },
  canvas: { flex: 1, ...shadowCard, borderRadius: radius.lg },
  // Jusqu'à neuf pastilles : la barre défile plutôt que de se replier sur
  // deux rangs et de manger le plan.
  // Les outils descendent DANS L'AXE du bouton d'édition, contre le bord
  // droit : la main qui vient de le toucher n'a plus qu'à glisser vers le
  // bas. Une rangée horizontale, elle, finissait par défiler — donc par
  // cacher la moitié des outils.
  /**
   * LES OUTILS SONT EN BAS, ET NON PLUS AUTOUR DU PLAN.
   *
   * Ils encadraient le dessin : une rangée en haut, une colonne à droite.
   * Deux bandes de soixante points qui mordaient sur l'espace de travail —
   * et sur un plan de biais, le logement se retrouvait cerné. Les
   * applications de plan les posent toutes en bas, sur une seule ligne :
   * la main y est déjà, et le dessin garde ses quatre côtés.
   */
  /**
   * LES OUTILS REMONTENT DEPUIS LE BOUTON D'ÉDITION, en bas à droite.
   *
   * Trois positions essayées, et le chantier a tranché les deux premières.
   * En colonne à droite DEPUIS LE HAUT, ils cernaient le dessin. En ligne
   * au pied du plan, ils s'y étalaient sur toute la largeur, se
   * chevauchaient quand la place manquait, et passaient sous l'indicateur
   * d'accueil.
   *
   * Ils reprennent donc leur colonne — la main y trouve tout à la file,
   * dans l'axe du pouce — mais ancrée EN BAS : les pastilles montent
   * depuis le bouton d'édition au lieu de descendre sur le plan, et le
   * dessin garde son quart supérieur, celui qu'on regarde.
   */
  /**
   * LES CALQUES EN RANGÉE, LES ACTIONS EN COLONNE.
   *
   * Ce sont deux natures de commandes, et elles ne se manipulent pas
   * pareil. Les CALQUES — cotes, meubles, surfaces, nord, murs — s'allument
   * et s'éteignent, souvent, l'un après l'autre : une rangée au bas du
   * dessin les met tous à portée du pouce, et l'œil les balaie d'un coup.
   * Les ACTIONS — enregistrer, annuler, contrôler, éditer — se choisissent
   * une à la fois : une colonne à droite les tient séparées des calques,
   * sans qu'on les confonde.
   *
   * Tout se pose DANS la carte du plan : rien ne déborde sur le gris de la
   * page — c'est ce qui faisait flotter les pastilles hors du dessin.
   */
  planTools: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-end',
    // Le peigne « Afficher » compte sur cette marge pour tomber sur les
    // pastilles : elle se partage, elle ne se réécrit pas.
    paddingHorizontal: MARGE_RANGEE,
    left: 0,
    // La colonne des actions tient la droite : la rangée s'arrête avant elle,
    // sinon les dernières pastilles défilent DERRIÈRE et deviennent
    // introuvables.
    right: 62,
  },
  /** Une part de la ligne : égale pour tous, quel que soit leur nombre. */
  toolPart: { flex: 1, alignItems: 'center' },
  /**
   * LE TROP-PLEIN MONTE À DROITE.
   *
   * Ce qui ne tient pas sur la ligne s'empile au-dessus de la colonne des
   * actions, dans le même axe : on lit la rangée, puis la colonne, sans
   * jamais avoir à faire glisser quoi que ce soit.
   */
  planToolsSuite: {
    position: 'absolute',
    right: 4,
    alignItems: 'center',
    gap: PILL_GAP,
  },
  /**
   * L'ancrage suit les outils : même ligne, en bas à droite.
   *
   * « Édition » commande le contenu de la barre : il reste à demeure, et
   * les outils défilent à sa gauche, jamais dessous.
   */
  editAnchor: {
    position: 'absolute',
    right: 4,
    zIndex: 4,
    alignItems: 'center',
    gap: PILL_GAP,
  },
  /**
   * La cellule d'un outil : la pastille, et son mot dessous.
   *
   * Elle est plus large que la pastille pour loger le mot, mais reste
   * CENTRÉE sur elle : les colonnes du plan 2D et de la 3D, et la rangée du
   * bouton d'édition, gardent ainsi le même axe qu'avant.
   */
  transition: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 50,
    elevation: 50,
  },
  transitionRing: {
    position: 'absolute',
    bottom: 60,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4.5,
    borderColor: c.blue,
  
    // Un anneau vide n'a rien a centrer, mais la regle du banc de
    // centrage vaut pour tous les ronds : uniforme, donc simple.
    alignItems: 'center',
    justifyContent: 'center',
  },
  transitionFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.bg,
  },
  watermark: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 6,
  },
  photoFond: {
    flex: 1,
    backgroundColor: 'rgba(8,10,14,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPleine: { width: '100%', height: '78%' },
  photoBarre: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  photoLegende: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', flex: 1 },
  photoSuppr: { color: '#FF6B6B', fontSize: 13, fontWeight: '800' },
  /**
   * Le filigrane suit la forme du logotype : deux lignes, pas une bande.
   * Pas de teinte non plus — les ondes du dessin ne survivraient pas à un
   * aplat, et une capture se partage telle qu'elle est.
   */
  watermarkLogo: { width: 92, height: 59, opacity: 0.85 },
  watermarkText: { color: '#0B0D12', fontSize: 13, fontWeight: '800' },
  watermarkAccent: { color: c.blue },
  /**
   * La pastille d'attente : EN BAS À GAUCHE.
   *
   * En haut, elle passait derrière les pastilles d'outils — son texte
   * disparaissait sous le bouton « Contrôle ». En bas à gauche, elle est
   * seule, sous le pouce, et loin du bandeau de cotes qui occupe la droite.
   */
  // Bandeau d'attente (pose d'un appareil) : en haut, il ne gêne rien.
  wallLengthBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...shadowCard,
  },
  wallLengthLabel: { color: c.inkFaint, fontSize: 12, fontWeight: '600', flex: 1 },
  /** La sortie d'un mode, posée contre ce qu'il annonce — jamais ailleurs. */
  wallLengthDone: { color: c.blue, fontSize: 13, fontWeight: '800' },
  // Le mur sélectionné : une seule ligne, au pied du plan, à côté du bouton
  // d'enregistrement. Elle dit l'essentiel et ne mange pas le dessin.
  /*
    LE PEIGNE « AFFICHER » — croquis Paint du patron.

    Posé au-dessus de la rangée de calques, il ne reçoit jamais le doigt :
    c'est une annotation, pas un bouton. Le mot se centre sur la barre, et
    la barre sur les pastilles.
  */
  /* Il part du MÊME BORD que la rangée (zéro) : c'est ce qui lui permet de
     compter les pastilles avec la grille de celle-ci, sans décalage. */
  peigne: { position: 'absolute', left: 0, alignItems: 'center', zIndex: 1 },
  /*
    Il se pose PAR LE BAS, au-dessus de la barre : le dessin monte
    désormais vers la pile de droite, et un mot dans le flux serait monté
    avec lui, loin de la rangée qu'il nomme. Sa hauteur et sa largeur —
    celle de la ligne — viennent du peigne, qui seul les connaît.
  */
  peigneMot: {
    position: 'absolute',
    textAlign: 'center',
    color: c.inkFaint,
    fontSize: 11,
    fontWeight: '700',
  },
  wallStrip: {
    position: 'absolute',
    // Le pied réel est recalculé à l'affichage : un étage au-dessus de la
    // rangée de calques, pour ne jamais lui passer dessous.
    bottom: 10,
    left: 12,
    // La colonne d'actions tient la droite : le bandeau s'arrête avant
    // elle, sinon ses boutons passent dessous.
    marginRight: 62,
    // La colonne d'outils descend du HAUT du plan : sous elle, la largeur
    // est libre. On lui laissait pourtant soixante-dix points de marge —
    // un cinquième de l'écran perdu, pendant que la cote était tronquée.
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    // Les boutons à droite, la cote à gauche : entre les deux, du vide
    // plutôt qu'un texte écrasé contre eux.
    justifyContent: 'space-between',
    ...shadowCard,
    shadowOpacity: 0.12,
  },
  // La précision en gris cède la place la première ; la cote, jamais.
  wallStripText: { color: c.inkSoft, fontSize: 13, flexShrink: 1 },
  wallStripStrong: {
    color: c.ink,
    fontWeight: '800',
    fontSize: 14,
    flexShrink: 0,
  },
  /*
    LES BOUTONS CÈDENT, LA COTE JAMAIS.

    Relevé du patron, capture à l'appui : « peu de place pour les
    informations du mur, les boutons prennent toute la place, et un bouton
    sort du bloc » — « Détacher » se lisait à moitié hors de la pilule,
    posé sur le plan.

    C'est le défaut que le bandeau du MEUBLE a déjà connu, et le remède est
    le même : ce n'est pas un problème de largeur, c'est un problème de
    COMPRESSIBILITÉ. Une rangée faite de blocs qui ne cèdent jamais dépasse
    au premier mot de trop, et une vue qui déborde n'est pas rognée, elle
    SORT. `flexShrink` la fait céder ; `minWidth: 0` lui en donne le droit,
    sans quoi le mot à l'intérieur impose sa largeur et rien ne bouge.
  */
  wallStripAction: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginLeft: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  wallStripActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  wallStripGhost: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginLeft: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  wallStripGhostText: { color: c.inkSoft, fontSize: 13, fontWeight: '800' },
  // Une seule ligne, au pied du plan, et LOIN du bouton d'enregistrement :
  // le bandeau faisait deux étages et son bouton de validation finissait
  // derrière la pastille bleue.
  /**
   * LE BANDEAU DU MEUBLE — et la seule règle qui compte : TOUT RENTRE.
   *
   * Le bouton de validation en sortait par la droite, posé sur la colonne
   * d'actions, sans plus rien pour dire à quelle barre il appartenait. Deux
   * corrections successives ont élargi le bloc en espérant que ça suffise ;
   * ce n'était pas un problème de largeur mais de COMPRESSIBILITÉ. Le
   * contenu était fait de blocs qui ne cèdent jamais : à la première valeur
   * à quatre chiffres, la ligne dépassait, et rien ne l'arrêtait — une vue
   * qui déborde n'est pas rognée, elle sort.
   *
   * Désormais les cotes cèdent (`flexShrink`) et les boutons non : quand la
   * place manque, ce sont les pastilles de chiffres qui se serrent, jamais
   * les commandes qui sortent.
   *
   * Les angles ont perdu leur pilule. Un rayon de 999 sur un bloc de cent
   * points de haut fait un galet : les coins mangent les boutons qui s'en
   * approchent, et il a fallu ces marges intérieures pour compenser. Seize
   * points suffisent à poser une carte.
   */
  /**
   * LE BANDEAU DU BAS — DEUX PARTIES, JAMAIS UNE LIGNE.
   *
   * Relevé du patron, capture à l'appui : « 3 spots · Pièce 1 · … » et
   * quatre pastilles rognées par le bord. « Toujours les boutons sont coupés
   * et le texte aussi. Fais en 2 parties, avec le texte au-dessus et les
   * boutons en dessous. Pareil pour la sélection d'un mur. »
   *
   * Le défaut venait de la FORME. Une seule ligne devait porter la cote, la
   * précision et jusqu'à quatre boutons, sur trois cent trente points
   * d'écran utile. Tout y était en `flexShrink` : chacun cédait un peu, donc
   * tout était coupé un peu — et le premier sacrifié était le chiffre qu'on
   * venait lire.
   *
   * Deux parties, donc, et une règle par partie :
   *
   *   — EN HAUT, ce qu'on a touché : la valeur en gras, ce que c'est en
   *     gris, sur deux lignes distinctes. Rien n'y cède ;
   *   — EN DESSOUS, ce qu'on peut en faire : des boutons à la taille d'un
   *     doigt (quarante-quatre points), qui passent à la ligne plutôt que
   *     de rétrécir.
   *
   * La carte garde sa marge à droite : la colonne d'actions flottante en
   * tient soixante-deux, et le bandeau ne doit jamais passer dessous.
   */
  bandeau: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    /*
      IL PASSE DEVANT LE PEIGNE « AFFICHER ».

      Relevé du patron, capture à l'appui : « le "Afficher" monte sur le
      bloc d'édition de la lumière plafond, fais en sorte qu'il reste en
      dessous ». Le peigne est posé au-dessus de la rangée de calques et le
      bandeau au-dessus de lui : les deux se rencontrent forcément. L'un
      annonce ce que font les boutons du fond, l'autre règle l'objet qu'on
      tient en main — c'est le second qu'on regarde.
    */
    zIndex: 2,
    /*
      LA CARTE ÉPOUSE SON CONTENU — relevé du patron sur la refonte :
      « le menu que tu as refait trop gros et trop de marge blanche sur son
      bloc ».

      Elle tenait la largeur entière (`left` ET `right`), et « 3 spots »
      suivi de quatre pastilles laissait donc la moitié d'un bandeau blanc à
      droite. Sans `right`, la carte prend la largeur de ce qu'elle porte et
      s'arrête là ; `maxWidth` (posé à l'affichage, où l'on connaît l'écran)
      l'empêche de passer sous la colonne d'actions.
    */
    alignSelf: 'flex-start',
    backgroundColor: c.surface,
    borderRadius: 16,
    /* Resserré d'un point ou deux partout : le bandeau se pose SUR le plan,
       et chaque point qu'il prend est un point de dessin en moins. */
    paddingHorizontal: 11,
    paddingTop: 8,
    paddingBottom: 9,
    gap: 7,
    ...shadowCard,
    shadowOpacity: 0.12,
  },
  /* La partie haute : elle ne contient QUE ce qu'on lit. */
  /*
    LA PARTIE HAUTE : LA SILHOUETTE, PUIS LA COTE.

    Le titre est une cote — « 0,83 × 2,04 m » — et rien ne disait à quoi
    elle appartient sinon le mot en gris dessous, qu'il faut lire. La
    silhouette de l'élément se pose devant : porte, mur, note, ligne de
    spots se reconnaissent sans lire, comme dans la rangée d'outils.
  */
  bandeauEntete: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  bandeauTexte: { gap: 1, flexShrink: 1 },
  bandeauTitre: { color: c.ink, fontSize: 14.5, fontWeight: '800' },
  bandeauSous: { color: c.inkSoft, fontSize: 12, lineHeight: 15 },
  /*
    La partie basse : une rangée qui PASSE À LA LIGNE. C'est elle qui
    remplace le `flexShrink` — cinq boutons sur un petit écran font deux
    rangées, et aucun n'est rogné.
  */
  bandeauActions: {
    flexDirection: 'row',
    /*
      PAR LE HAUT, PAS PAR LE MILIEU.

      Une pastille qui porte son mot À L'INTÉRIEUR fait 44 de haut ; une
      pastille nue avec son mot DESSOUS en fait 60. Centrées, les deux ne
      partagent plus leur axe : la ronde remonte de huit points au-dessus
      de ses voisines et son mot pend sous elles — le « bouton supprimer
      surélevé » du relevé du patron. Alignées par le haut, les pastilles
      sont sur la même ligne quelle que soit la longueur du mot dessous.
    */
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 7,
    /*
      LE FILET ENTRE LES DEUX PARTIES.

      Relevé du patron : le bandeau est « trop simple » — « fais le filet et
      icône ». Le bandeau a deux parties depuis longtemps, ce qu'on lit puis
      ce qu'on touche, et rien ne les séparait qu'un blanc : sur un mur à
      quatre boutons, la carte se lit comme un seul bloc où l'œil ne sait
      pas où s'arrête la cote et où commencent les gestes.

      Un cheveu, la même séparation que les rangées d'une feuille de choix.
      Et de l'air au-dessus des boutons : collé à eux, le filet se lirait
      comme un soulignement du texte.
    */
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.line,
  },
  /*
    UN BOUTON DE BANDEAU : QUARANTE POINTS DESSINÉS, QUARANTE-HUIT SOUS LE
    DOIGT.

    Il en faisait quarante-quatre, dessinés comme touchés. Relevé du
    patron : « réduis légèrement la taille du bloc en diminuant les boutons
    très légèrement ». Le dessin cède donc quatre points, et le débord
    (`DEBORD_DOIGT`, posé par chaque bandeau) les rend au doigt — c'est déjà
    la règle des pastilles de la rangée.
  */
  bandeauBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    minHeight: 34,
    minWidth: 34,
    flexShrink: 0,
  },
  bandeauBtnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    minHeight: 34,
    minWidth: 34,
    flexShrink: 0,
  },
  /*
    UNE ICÔNE SEULE : carrée, même hauteur, pas de mot À L'INTÉRIEUR.

    Trente-quatre points, pas quarante — relevé du patron, capture à
    l'appui : « la taille des blocs bleus des boutons est trop grande,
    réduis sans réduire les icônes ». C'est le DISQUE qui pesait, pas le
    dessin : l'icône garde ses dix-neuf points, elle respire simplement
    moins. Et le débord rend au doigt les six points rendus au plan.
  */
  bandeauBtnIcone: { paddingHorizontal: 0, width: 34 },
  /**
   * LE MOT SOUS LE BOUTON — relevé du patron : « mets des noms sous les
   * boutons… on doit comprendre ce que chaque bouton fait. Nom discret comme
   * le "Afficher", mais sous ces boutons. »
   *
   * Une pastille ronde muette ne se comprend qu'en l'essayant : deux
   * flèches, un maillon et une croix sous une ligne de spots, et il faut
   * toucher pour savoir. Le mot vivait dans l'étiquette d'accessibilité —
   * ce qui sert au lecteur d'écran, et à personne d'autre.
   *
   * Il se lit EN RETRAIT, comme le peigne « Afficher » qu'il imite : c'est
   * une légende, elle ne doit pas se disputer le regard avec le geste.
   */
  bandeauCellule: { alignItems: 'center', gap: 2 },
  bandeauMot: {
    color: c.inkFaint,
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.75,
  },
  bandeauBtnTexte: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  bandeauBtnGhostTexte: { color: c.inkSoft, fontSize: 13.5, fontWeight: '800' },
  /*
    L'ANCIENNE CARTE, gardée pour les bandeaux qui portent des CHAMPS et pas
    seulement des boutons — les cotes d'un meuble, celles d'un appareil de
    plafond. Même coquille, même partie basse ; seule leur partie haute
    diffère : des pastilles qu'on touche plutôt que du texte qu'on lit.
  */
  editBar: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    alignSelf: 'flex-start',
    backgroundColor: c.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 10,
    gap: 8,
    ...shadowCard,
    shadowOpacity: 0.12,
  },
  editLabel: { color: c.inkSoft, fontSize: 13, marginBottom: 8, fontWeight: '600' },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 5,
  },
  input: {
    backgroundColor: c.bg,
    color: c.ink,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 17,
    fontWeight: '700',
    minWidth: 70,
    borderWidth: 1,
    borderColor: c.lineStrong,
  },
  unit: { color: c.inkSoft, fontSize: 15, flexShrink: 0 },
  // Champs resserrés : la fiche tient sur une ligne, boutons compris, sans
  // passer sous le bouton d'enregistrement.
  /**
   * Une distance au mur, dans le bandeau du plafond.
   *
   * C'est une pastille qu'on TOUCHE, pas un champ qu'on remplit sur place :
   * le bandeau est en bas de l'écran, et le clavier le recouvre en entier.
   * L'appui ouvre la feuille de saisie, qui monte avec le clavier.
   */
  /*
    LE CHAMP DES CENTIMÈTRES — relevé du patron : « surtout les blocs des
    champs pour les cm, ils sont trop imposants ».

    C'était le plus gros morceau du bandeau : deux pavés de quarante-quatre
    points de haut et d'une centaine de large, pour porter trois chiffres.
    Ils tiennent en trente-huit, marges resserrées et flèche réduite — le
    nombre, lui, reste gras et lisible : c'est ce qu'on vient lire.
  */
  clChamp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: c.surfaceSunken,
    borderRadius: 11,
    paddingHorizontal: 10,
    minHeight: 38,
    // Elle ne cède plus : depuis que les boutons ont leur propre rangée,
    // la ligne des cotes n'a plus personne à qui céder la place.
    flexShrink: 0,
  },
  clValeur: { color: c.ink, fontSize: 15.5, fontWeight: '800' },
  inputSmall: {
    backgroundColor: c.bg,
    color: c.ink,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 14.5,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: c.lineStrong,
  },
  /*
    LA RANGÉE D'ICÔNES EST DEVENUE LA PARTIE BASSE.

    Elle se serrait au bout de la ligne des cotes (`marginLeft: 'auto'`), et
    c'est là qu'elle se faisait rogner. Elle descend d'un étage : même
    rangée que partout ailleurs, à la taille du doigt, et elle passe à la
    ligne s'il le faut.
  */
  editIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flexShrink: 0,
  },
  /**
   * LA RANGÉE DES FLÈCHES, au-dessus des cotes.
   *
   * Elle tient dans le MÊME bloc blanc : un second bloc flottant se serait
   * posé sur la rangée d'outils ou sur la colonne d'actions, et l'on aurait
   * repris le défaut qu'on vient de corriger.
   */
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  nudgeBtn: {
    // La flèche est le geste le PLUS fin du bandeau — un centimètre par
    // appui : elle mérite la même cible que les autres, pas moins.
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: c.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeNote: { color: c.inkFaint, fontSize: 11, fontWeight: '600', marginLeft: 2 },
  /*
    QUARANTE-QUATRE POINTS, DESSINÉS — plus de cible au débord.

    Ces pastilles faisaient vingt-huit points et empruntaient le reste au
    `hitSlop` : la cible était bonne, le DESSIN non — quatre ronds serrés au
    bout d'une ligne pleine, et le dernier rogné par le bord. Depuis que la
    rangée d'actions vit sous le texte, la place est là : on la prend.
  */
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBtnOk: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: c.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  openingButton: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginLeft: 'auto',
    marginRight: 8,
  },
  openingText: { color: c.inkSoft, fontWeight: '700', fontSize: 13 },
  applyButton: {
    backgroundColor: c.blue,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  /**
   * LE BANDEAU D'UNE PIÈCE.
   *
   * Ces styles manquaient : sans `roomActions`, les trois boutons
   * retombaient en colonne, chacun pleine largeur, et la carte sortait
   * difforme — c'est ce qu'on voyait après l'ajout d'une pièce.
   */
  roomHead: { paddingHorizontal: 4, paddingBottom: 8 },
  roomNom: { color: c.ink, fontSize: 15, fontWeight: '800' },
  roomCotes: { color: c.inkFaint, fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  roomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomAction: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomActionText: { color: c.inkSoft, fontWeight: '700', fontSize: 13.5 },
  exportChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginTop: 8,
  },
  /* La pleine largeur DANS la grille : elle y entre comme les autres, elle
     prend seulement le rang entier. */
  exportChoiceLarge: { width: '100%', marginTop: 0 },
  /*
    LES SORTIES EN GRILLE, DEUX PAR LIGNE.

    Relevé du patron : « refais ce pop-up pour le réduire en faisant des
    blocs de 2 par ligne ». Sept sorties en pleine largeur, chacune avec sa
    vignette et deux lignes de texte, faisaient une feuille plus haute que
    l'écran : l'image et la présentation se trouvaient en défilant, et une
    sortie qu'on ne voit pas n'existe pas.

    La grille passe à la ligne toute seule — aucun découpage en rangs écrit
    à la main, qui se déréglerait à la sortie suivante. Les tuiles d'un même
    rang partagent leur hauteur (c'est le propre d'une ligne de flexbox),
    donc un détail de deux lignes ne décale pas sa voisine.
  */
  exportGrille: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  /** Une demi-largeur, l'écart déduit : deux tiennent côte à côte. */
  exportTuile: {
    width: '48%',
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  /** La vignette passe AU-DESSUS du texte : à mi-largeur, il n'y a plus la
   *  place de la mettre à côté sans hacher le titre en trois lignes. */
  exportTuileArt: { marginBottom: 7 },
  exportChoiceTexts: { flex: 1 },
  exportChoiceOn: { backgroundColor: c.blueSoft },
  exportChoiceTitle: { color: c.ink, fontSize: 15.5, fontWeight: '700' },
  exportChoiceTitleOn: { color: c.blue },
  exportChoiceDetail: {
    color: c.inkFaint,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  issueScroll: { maxHeight: 320, marginTop: 4 },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  issueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 11,
    backgroundColor: c.inkFaint,
  },
  issueDotAlert: { backgroundColor: c.danger },
  issueTexts: { flex: 1 },
  issueMessage: { color: c.ink, fontSize: 14.5, fontWeight: '600' },
  /* La consigne d'une pièce neuve : lisible, discrète, sur une ligne. */
  roomNeuve: { color: c.blue, fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  issueHint: { color: c.inkFaint, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  nameScroll: { maxHeight: 260 },
  nameGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  nameChip: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  nameChipOn: { backgroundColor: c.blueSoft, borderColor: c.blue },
  nameChipText: { color: c.ink, fontSize: 14, fontWeight: '600' },
  /** Les cotes de la pièce proposée, sous son nom. */
  nameChipDim: { color: c.inkFaint, fontSize: 11, fontWeight: '600' },
  nameChipTextOn: { color: c.blue, fontWeight: '800' },
  removeRoomButton: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginLeft: 10,
  },
  removeRoomText: { color: c.danger, fontWeight: '700', fontSize: 14 },
  objectList: { maxHeight: 58, marginTop: 10, marginBottom: 6, flexGrow: 0 },
  objectChipSelected: { borderColor: c.blue, borderWidth: 1.5 },
  objectChip: {
    backgroundColor: c.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 13,
    paddingVertical: 7,
    marginRight: 8,
  },
  objectName: { color: c.ink, fontSize: 13, fontWeight: '700' },
  objectDims: { color: c.inkFaint, fontSize: 11.5 },
  exportButton: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
    ...glow(c.blue),
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 4,
  },
  switchLabel: { color: c.ink, fontSize: 14.5, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, paddingBottom: 34, paddingTop: 8 },
  primaryButton: {
    flex: 1,
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    ...glow(c.blue),
  },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '700' },
  /** La seconde issue d'un écran vide : offerte, jamais mise en avant. */
  emptyGhost: { paddingVertical: 14, alignItems: 'center' },
  emptyGhostText: { color: c.inkSoft, fontSize: 14.5, fontWeight: '600' },
  secondaryButton: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingVertical: 15,
    // Trois boutons sur la ligne : l'icône et le mot se serrent la main
    // plutôt que de s'empiler.
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.05,
  },
  secondaryText: { color: c.ink, fontSize: 14, fontWeight: '600' },
  secondaryTextBlue: { color: c.blue, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,13,18,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: 20,
    width: '100%',
    ...shadowCard,
  },
  modalTitle: { color: c.ink, fontSize: 17, fontWeight: '800' },
  elecWrap: { width: '100%' },
  // L'établi ne s'étire plus jusqu'au bas de l'écran : il fait la taille
  // de ce qu'il porte, et se pose au milieu de la hauteur libre.
  elecWrapPlein: { flex: 1, justifyContent: 'center' },
  elecPlein: { width: '100%' },
  // Plein écran, aux marges près : le pouce a besoin de la place.
  modalBackdropPlein: { padding: 12, paddingTop: 56, justifyContent: 'flex-end' },
  // Diagnostic : un état d'abord — combien, et est-ce grave —, puis la
  // liste. L'ancienne fenêtre commençait par une consigne d'usage.
  // Le volet d'une pièce : son nom, le nombre de constats, un chevron qui
  // pivote. Rien de plus — c'est un séparateur qu'on peut viser du pouce.
  // Carte d'explication du mur rouge : posée sous la barre de cote, elle
  // répond à l'appui sans couvrir le mur qu'on vient de toucher.
  elecCard: {
    position: 'absolute',
    top: 62,
    left: 10,
    right: 58,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: c.danger,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadowCard,
  },
  elecCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  elecDotAlert: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.danger,
  },
  elecCardTitle: { color: c.ink, fontSize: 13.5, fontWeight: '800', flex: 1 },
  elecCardRule: {
    color: c.inkSoft,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 5,
  },
  elecCardMore: {
    color: c.blue,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 9,
  },
  // La rose des vents occupe le coin haut-gauche : les bandeaux se
  // décalent pour ne pas la couvrir.
  barShift: { left: 62 },
  // Deux pastilles ancrées au lieu d'une : le bandeau recule d'autant.
  barShiftRight: { right: 102 },
  elecCardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  elecFix: {
    backgroundColor: c.blue,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  elecFixText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  elecSee: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  elecSeeText: { color: c.inkSoft, fontSize: 12.5, fontWeight: '700' },
  elecScroll: { maxHeight: 340 },
  elecFamily: {
    color: c.inkFaint,
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  elecGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catSearch: {
    backgroundColor: c.bg,
    color: c.ink,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.lineStrong,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  catScroll: { maxHeight: 380 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catCard: {
    width: 92,
    alignItems: 'center',
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  catName: {
    color: c.ink,
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  catDims: { color: c.inkFaint, fontSize: 9.5, fontWeight: '600', marginTop: 1 },
  elecChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 6,
  },
  elecDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  elecDotText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' },
  // La tuile du catalogue : elle porte le SYMBOLE normalisé du plan —
  // on choisit ce qu'on va lire, pas une pastille à sigle.
  elecTuile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  elecChipText: { color: c.ink, fontSize: 13.5, fontWeight: '700' },
  modalSubtitle: {
    color: c.inkFaint,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 12,
  },
  modalCopy: { alignItems: 'center', paddingTop: 14 },
  modalCopyText: { color: c.blue, fontSize: 14, fontWeight: '700' },
  modalInput: {
    backgroundColor: c.bg,
    color: c.ink,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.lineStrong,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    fontWeight: '600',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: c.surfaceSunken,
  },
  modalGhostText: { color: c.inkSoft, fontWeight: '600', fontSize: 14.5 },
  modalPrimary: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: c.blue,
  },
  modalPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14.5 },
}));

/** Le jeu de styles complet, tel que le recoivent les feuilles et la barre. */
export type ResultStyles = ReturnType<typeof getStyles>;
