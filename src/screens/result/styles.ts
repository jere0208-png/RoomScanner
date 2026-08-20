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
import { PILL_GAP } from '../../components/ToolPill';

export const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: 58,
    // Le plan touche presque les bords : c'est lui qu'on regarde.
    paddingHorizontal: 12,
  },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 32 },
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
  /** Le sélecteur de vue, posé en haut à droite du dessin. */
  vuePastille: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 4,
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
    paddingHorizontal: 10,
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
  // Le mur sélectionné : une seule ligne, au pied du plan, à côté du bouton
  // d'enregistrement. Elle dit l'essentiel et ne mange pas le dessin.
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
  wallStripAction: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginLeft: 6,
  },
  wallStripActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  wallStripGhost: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginLeft: 6,
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
  editBar: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    // Soixante-douze points : la colonne d'actions en tient soixante-deux, et
    // le bouton de validation venait la toucher.
    marginRight: 72,
    right: 12,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 7,
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
  clChamp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: c.surfaceSunken,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 8,
    // C'est ELLE qui cède quand la place manque — jamais un bouton.
    flexShrink: 1,
  },
  clValeur: { color: c.ink, fontSize: 16, fontWeight: '800' },
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
  // `flexShrink: 0` : les trois boutons gardent leur taille, ce sont les
  // champs qui cèdent si la place manque — jamais l'inverse.
  editIcons: { flexDirection: 'row', gap: 4, marginLeft: 'auto', flexShrink: 0 },
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
    gap: 6,
    marginBottom: 6,
  },
  nudgeBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: c.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeNote: { color: c.inkFaint, fontSize: 11, fontWeight: '600', marginLeft: 2 },
  iconBtn: {
    // Vingt-huit points DESSINÉS, quarante sous le doigt : le débord
    // (`hitSlop`, dans le bandeau) élargit la cible sans manger la ligne.
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: c.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnOk: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: c.blue,
    alignItems: 'center',
    justifyContent: 'center',
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
  roomActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
