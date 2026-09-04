import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TexteVif } from '../components/ContourVif';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import {
  dark,
  glow,
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { GlowButton } from '../components/GlowButton';
import { LogoMark } from '../components/LogoMark';
import { AvatarGlyph } from '../components/AvatarGlyph';
import { Quadrillage } from '../components/Quadrillage';
import { TraceUnePiece } from '../components/TraceUnePiece';
import { useScanStore } from '../store/scanStore';
import { useAccountStore } from '../store/accountStore';
import { useRoomScan } from '../native/useRoomScan';


/**
 * « il y a un quart d'heure » plutôt qu'une date.
 *
 * Ce qu'on veut savoir d'un relevé interrompu, ce n'est pas le jour : c'est
 * s'il s'agit de celui qu'on vient de perdre, ou d'un vieux fond de tiroir.
 */
function quand(at: number): string {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} jour${j > 1 ? 's' : ''}`;
}

/**
 * LA TAILLE DE L'INCRUSTATION, et son retrait.
 *
 * Deux cent quarante points : le glyphe déborde largement le logotype qu'il
 * accompagne — c'est ce qui en fait un FOND et non une image posée à côté.
 * Sept centièmes d'opacité : on le sent, on ne le lit pas. Au-delà, il
 * redevient un objet et reprend la première place au mot.
 */
const FILIGRANE_LOGO = 240;
const FILIGRANE_OPACITE = 0.07;

export function HomeScreen() {
  const supported = useScanStore((s) => s.supported);
  const raccourciEnAttente = useScanStore((s) => s.raccourciEnAttente);
  const setRaccourciEnAttente = useScanStore(
    (s) => s.setRaccourciEnAttente,
  );
  const setSupported = useScanStore((s) => s.setSupported);
  const error = useScanStore((s) => s.error);
  const saves = useScanStore((s) => s.saves);
  const brouillon = useScanStore((s) => s.brouillon);
  const reprendreBrouillon = useScanStore((s) => s.reprendreBrouillon);
  const oublierBrouillon = useScanStore((s) => s.oublierBrouillon);
  const commencerAuClavier = useScanStore((s) => s.commencerAuClavier);
  const setScreen = useScanStore((s) => s.setScreen);
  const { start } = useRoomScan();
  const peutCreerPlan = useAccountStore((s) => s.peutCreerPlan);
  const ouvrirSurprise = useAccountStore((s) => s.ouvrirSurprise);
  const compte = useAccountStore((s) => s.compte);
  const pro = useAccountStore((s) => s.pro);
  const c = useTheme();
  /** Le fond est-il sombre ? C'est lui qui choisit le logotype. */
  const sombre = c === dark;
  const styles = getStyles(c);

  useEffect(() => {
    RoomScan.isSupported().then(setSupported);
  }, [setSupported]);

  /*
    L'ARRIVÉE : un simple fondu en cascade.

    Le logo projetait deux ondes qui traversaient toute la page — elles
    partaient de son badge, et le badge n'est plus là : le glyphe est
    maintenant une incrustation du fond, et une pulsation autour d'un
    filigrane serait plus visible que le filigrane. « Pas de contour rien »
    vaut aussi pour ce qui tourne autour.
  */
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(reveal, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reveal]);

  /*
    LA TAILLE DE L'ÉCRAN, MESURÉE ET NON DEVINÉE.

    Le quadrillage doit couvrir exactement le fond : une largeur prise à la
    fenêtre laisserait les marges de l'écran hors trame, et le papier aurait
    deux bords francs — précisément ce qu'on ne veut pas.
  */
  const [cadre, setCadre] = useState({ w: 0, h: 0 });
  const mesurer = (e: LayoutChangeEvent) =>
    setCadre({
      w: e.nativeEvent.layout.width,
      h: e.nativeEvent.layout.height,
    });

  const [feuille, setFeuille] = useState({ w: 0, h: 0 });
  /**
   * LA PIÈCE TRACÉE OUVRE UN PLAN, avec elle dedans.
   *
   * `commencerAuClavier` ouvrait un plan VIDE : il fallait ensuite ajouter une
   * pièce, choisir sa taille, la poser — deux écrans avant le premier trait.
   * Le rectangle qu'on vient de tracer est posé dans la foulée, et l'on arrive
   * sur son plan.
   *
   * LE PALIER GRATUIT SE JUGE ICI AUSSI, exactement comme sur les deux autres
   * portes : un plan tracé à la main est un plan, et il compte comme tel. Une
   * troisième entrée qui l'oublierait rouvrirait le trou que la passe sur le
   * palier avait bouché — cinq portes créaient un plan sans consulter la
   * règle.
   */
  const tracerLaPiece = useCallback(
    (largeur: number, profondeur: number) => {
      if (!peutCreerPlan()) {
        ouvrirSurprise();
        return;
      }
      commencerAuClavier();
      useScanStore
        .getState()
        .addRoomRect({ x: 0, z: 0 }, { x: largeur, z: profondeur });
    },
    [peutCreerPlan, ouvrirSurprise, commencerAuClavier],
  );

  /*
    LE RACCOURCI SE CONSOMME ICI — « Dis Siri, nouveau relevé ».

    Il ne fait rien de plus que le bouton, et c'est le but : MÊME chemin,
    MÊME garde du palier gratuit. Une porte dérobée qui contournerait
    l'offre serait un défaut, pas une facilité.

    ON ATTEND QUE LA COMPATIBILITÉ SOIT CONNUE. `supported` vaut `null`
    pendant la vérification du capteur : consommer la demande à cet
    instant-là, c'est la perdre — le scan ne partirait pas, et rien ne
    dirait pourquoi. On laisse le drapeau levé jusqu'à ce que le téléphone
    ait répondu.
  */
  useEffect(() => {
    if (!raccourciEnAttente || supported === null) return;
    setRaccourciEnAttente(false);
    if (supported !== true) return;
    if (!peutCreerPlan()) {
      ouvrirSurprise();
      return;
    }
    start();
  }, [
    raccourciEnAttente,
    supported,
    setRaccourciEnAttente,
    peutCreerPlan,
    ouvrirSurprise,
    start,
  ]);

  // Fondu en cascade : chaque bloc apparaît juste après le précédent.
  const fadeIn = (i: number) => {
    const range = [i * 0.1, Math.min(i * 0.1 + 0.45, 1)];
    return {
      opacity: reveal.interpolate({
        inputRange: range,
        outputRange: [0, 1],
        extrapolate: 'clamp' as const,
      }),
      transform: [
        {
          translateY: reveal.interpolate({
            inputRange: range,
            outputRange: [10, 0],
            extrapolate: 'clamp' as const,
          }),
        },
      ],
    };
  };

  return (
    <View style={styles.container} onLayout={mesurer}>
      {/*
        LE PAPIER SUR LEQUEL CETTE APPLICATION DESSINE.

        Relevé du patron : « l'accueil doit être moderne, avec un design épuré
        mais bien pensé qui rappelle le but de l'app (architecture, plan). Par
        exemple pour les boutons, ils seraient dans un quadrillage avec les
        côtés fondus. »

        C'est le seul motif qui dit le métier sans un mot. Une application qui
        relève des logements n'a pas besoin d'un pictogramme de maison : elle a
        besoin du PAPIER sur lequel on trace. Et c'est déjà la trame du sol de
        la vue 3D — l'accueil devient la première page du même dessin.

        IL EST DERRIÈRE TOUT, ET IL NE REÇOIT JAMAIS LE DOIGT.
      */}
      {cadre.w > 0 && (
        <Quadrillage
          width={cadre.w}
          height={cadre.h}
          palette={c}
          force={1.2}
          cle="accueil"
        />
      )}
      {/* `box-none` : le bloc pleine largeur laisse passer le doigt là où
          lui-même n'a rien à toucher — plus jamais un fantôme au-dessus
          des boutons du bandeau. */}
      <View style={styles.hero} pointerEvents="box-none">
        {/*
          LE GLYPHE EST DANS LE FOND, IL N'EST PLUS POSÉ DESSUS.

          Relevé du patron : « la première image (icône de l'app) est trop
          visible. Récupère que ce qui est dedans, supprime le fond blanc, et
          incruste-le dans le fond en faible opacité. Pas de contour rien. »

          Il occupait le haut de l'accueil en badge blanc cerné d'un liseré,
          juste au-dessus du logotype : deux fois la même marque l'une sur
          l'autre, et c'est le badge — le plus bavard des deux — qui passait
          devant celui qui porte le NOM. Il passe donc DERRIÈRE, en grand et
          en retrait : on le sent plus qu'on ne le voit, et le mot reprend la
          première place.

          Les deux anneaux qui battaient autour de lui s'en vont avec
          l'écrin. Une pulsation autour d'un filigrane serait plus visible
          que le filigrane lui-même — et « pas de contour rien » vaut aussi
          pour ce qui tourne autour.
        */}
        <View style={styles.filigraneLogo} pointerEvents="none">
          <LogoMark size={FILIGRANE_LOGO} opacite={FILIGRANE_OPACITE} />
        </View>
        <Animated.View style={fadeIn(0)}>
          {/* La typo de la marque, détourée, plutôt que deux `Text` empilés :
              le « O » d'ECHO porte les ondes du logo, ce qu'aucune police
              système ne sait faire. Teintée par le thème pour rester
              lisible en sombre. */}
          <Image
            /*
              DEUX FICHIERS, ET PAS UNE TEINTE.

              Le logotype portait un `tintColor` : l'image était noire, le
              thème la repeignait. Le nouveau dessin a des ONDES en dégradé —
              c'est son identité — et une teinte les écrase toutes en un
              aplat. On embarque donc les deux versions, et l'on prend celle
              qui va avec le fond.
            */
            source={
              sombre
                ? require('../assets/echoplan-dark.png')
                : require('../assets/echoplan.png')
            }
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="EchoPlan"
          />
        </Animated.View>
      </View>

      {/*
        ICI VIVAIT UNE MAQUETTE D'IPHONE, et elle n'y vit plus.

        Relevé du patron : « refais l'accueil, enlève l'iPhone et son
        animation. »

        ELLE A ÉTÉ UNE BONNE IDÉE, ET ELLE EST DEVENUE UN OBJET DE PLUS. Un
        téléphone dessiné DANS un téléphone est une mise en abyme qu'on
        remarque une fois, puis qui encombre : elle prenait la moitié de
        l'accueil, tournait en boucle, et pesait 1,2 Mo d'images cuites dans
        l'application. Ce qu'elle racontait — le cheminement du relevé au
        dossier — est raconté mieux, et une seule fois, par la présentation du
        premier lancement.

        CE QUI REMPLIT SA PLACE N'EST PAS UN AUTRE OBJET : c'est du VIDE, sur
        du papier quadrillé. Un écran d'accueil épuré n'a rien à montrer — il
        a une marque, une promesse et deux portes.
      */}
      {/*
        LA FEUILLE SERT À TRACER — voir `TraceUnePiece`.

        Relevé du patron : « il y a trop d'espace inutilisé », puis « essaye le
        tracé ». Le vide arrête d'être un fond : on y dessine sa pièce du
        doigt, un carreau vaut vingt-cinq centimètres, et l'on arrive dans
        l'éditeur avec sa première pièce DÉJÀ posée.

        ET C'EST LE MÊME ÉCRAN POUR TOUT LE MONDE. La réponse facile au vide
        était d'y mettre les derniers plans — relevé du patron : « il faut
        penser aux nouveaux qui n'ont pas de plan ». Une idée qui ne marche
        qu'au bout de trois relevés n'est pas une idée.
      */}
      <View
        style={styles.respiration}
        onLayout={(e) =>
          setFeuille({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }>
        {feuille.h > 120 && (
          <TraceUnePiece
            width={feuille.w}
            height={feuille.h}
            palette={c}
            onTracee={tracerLaPiece}
          />
        )}
      </View>

      {supported === false && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            Cet appareil n'est pas compatible : le scan nécessite un iPhone Pro
            (capteur LiDAR) sous iOS 16, ou un Android compatible ARCore.
          </Text>
        </View>
      )}
      {error && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>{error}</Text>
        </View>
      )}

      {/*
        LE RELEVÉ INTERROMPU — proposé, jamais imposé.

        L'app tuée en plein scan — un appel, une photo, un téléphone à court
        de mémoire — emportait la visite entière. Le relevé s'écrit désormais
        tout seul, toutes les trente secondes ; il attend ici.

        On ne le rouvre PAS d'office : l'utilisateur a pu quitter
        volontairement un essai raté, et se le voir réimposer au démarrage
        serait pire que de l'avoir perdu. D'où deux gestes, et le second —
        jeter — sans confirmation : ce qu'on jette est un brouillon, l'original
        est dans la bibliothèque s'il a été enregistré.
      */}
      {brouillon && (
        <Animated.View style={[styles.draftCard, fadeIn(3)]}>
          <View style={styles.draftTexts}>
            <Text style={styles.draftTitle}>Relevé interrompu</Text>
            <Text style={styles.draftText}>
              {`${brouillon.walls.length} mur${
                brouillon.walls.length > 1 ? 's' : ''
              } relevés${
                brouillon.name ? ` · ${brouillon.name}` : ''
              }, ${quand(brouillon.at)}.`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.draftPrimary}
            accessibilityLabel="Reprendre le relevé"
            onPress={reprendreBrouillon}>
            <Text style={styles.draftPrimaryText}>Reprendre</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.draftGhost}
            accessibilityLabel="Jeter le relevé interrompu"
            onPress={oublierBrouillon}>
            <Text style={styles.draftGhostText}>Jeter</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/*
        SUR UN APPAREIL SANS LiDAR, ON PROPOSE CE QU'ON PEUT FAIRE.

        L'écran affichait le refus et gardait pourtant « Commencer le scan »
        en bouton PRINCIPAL, éteint, avec un conseil de scan en pied de
        page : trois éléments sur quatre parlaient d'une chose impossible.
        Or l'application sait tout faire sans caméra — plan, normes, métré,
        dossier — et c'est même souvent le chemin le plus court. Le scan
        s'efface donc, « Dessiner un plan » prend sa place, et le refus
        reste : c'est lui qui explique pourquoi.
      */}
      {supported !== false && (
      <Animated.View style={[styles.ctaWrap, fadeIn(3)]}>
        <GlowButton
          label={supported === null ? 'Vérification…' : 'Commencer le scan'}
          accessibilityLabel="Commencer le scan"
          disabled={supported !== true}
          // Le palier gratuit s'arrête AVANT le scan, pas après : scanner
          // vingt minutes pour découvrir qu'on ne peut pas enregistrer
          // serait le pire moment pour l'apprendre.
          onPress={() => {
            if (!peutCreerPlan()) {
              // L'offre à la place de la porte : le popup « Surprise ! »
              // et son −20 % — c'est lui qui tend la page Pro, code déjà
              // rempli.
              ouvrirSurprise();
              return;
            }
            start();
          }}
        />
      </Animated.View>
      )}

      {/*
        LE PLAN SANS SCANNER — la seconde porte.

        Elle n'existait pas, et l'application se fermait sur trois publics à
        la fois. Les appareils SANS LiDAR d'abord : l'écran annonçait
        « appareil non compatible » et s'arrêtait là, alors que les neuf
        dixièmes de la valeur — normes, circuits, métré, tableau existant,
        dossier — ne demandent aucun capteur. Les PETITES INTERVENTIONS
        ensuite : pour ajouter deux prises dans une cuisine, on ne relève
        pas l'appartement, on trace la pièce et l'on chiffre. Les
        ARCHITECTES enfin, qui esquissent au mètre avant d'être sur place.

        Elle est offerte MÊME quand le scan l'est : c'est souvent le chemin
        le plus court, pas un lot de consolation.
      */}
      <Animated.View style={[styles.secondWrap, fadeIn(4)]}>
        <GlowButton
          label="Dessiner un plan"
          // Seul geste possible sans caméra : il en porte la couleur.
          variant={supported === false ? 'primary' : 'ghost'}
          accessibilityLabel="Dessiner un plan sans scanner"
          onPress={() => {
            // Le palier gratuit se juge ICI aussi : un plan tracé à la main
            // est un plan, et il compte comme tel.
            if (!peutCreerPlan()) {
              ouvrirSurprise();
              return;
            }
            commencerAuClavier();
          }}
        />
      </Animated.View>

      {saves.length > 0 && (
        <Animated.View style={[styles.secondWrap, fadeIn(4)]}>
          <GlowButton
            label="Mes scans"
            variant="ghost"
            onPress={() => setScreen('library')}
            right={
              <View
                accessibilityLabel="Nombre de scans"
                style={styles.libraryBadge}>
                <Text style={styles.libraryBadgeText}>{saves.length}</Text>
              </View>
            }
          />
        </Animated.View>
      )}

      {/*
        LA PROMESSE EN PIED DE PAGE — relevé du patron : « supprime le texte
        sous le logo (votre appartement…), intègre-le en bas de page à la
        place de "allumez les lumières" ».

        Elle se lisait en gris clair juste sous la marque, là où l'œil est
        encore occupé par le mot ; elle est maintenant la DERNIÈRE chose
        qu'on lit avant de toucher le bouton, et c'est là qu'une promesse a
        sa place.

        Le conseil de scan qu'elle remplace — « allumez les lumières et
        dégagez le centre de la pièce » — était un bon conseil de chantier
        arrivé trop tôt : on le lisait sur l'accueil, on scannait dix minutes
        plus tard. Il ne conditionne donc plus rien : la promesse vaut aussi
        sur un appareil sans LiDAR, qui dessine son plan au clavier.
      */}
      <Animated.Text style={[styles.hint, fadeIn(5)]}>
        Votre appartement en 3D et en plan coté,{'\n'}en quelques minutes.
      </Animated.Text>

      {/*
        LE PROFIL EST UN BLOC, EN HAUT À GAUCHE — croquis Paint du patron.

        La mention du compte vivait en pied d'écran, minuscule ; elle est
        maintenant un petit bloc qui ne gêne pas : l'avatar et le prénom,
        gris en gratuit, parés d'or en Pro. C'est toujours la seule porte
        VOLONTAIRE vers la page Pro : le clic garde tout le geste de
        l'ancienne rangée.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mon compte"
        style={styles.profilBloc}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => setScreen('profil')}>
        {/*
          L'AVATAR ET LE PRÉNOM, RIEN D'AUTRE — relevé du patron : la
          barre est partie, le grade écrit aussi. En gratuit, tout se lit
          GRIS ; en Pro, le prénom passe à la typo d'or et l'avatar se
          cercle du contour qui respire — le grade se VOIT, il ne s'écrit
          plus. Les enfants restent transparents au doigt : c'est TOUT le
          bloc qui ouvre le menu.
        */}
        {/*
          L'AVATAR : LE MÊME DANS LES DEUX GRADES, ET SANS AUCUN CERNE.

          Deux contours lui sont partis, dans cet ordre : l'anneau d'or du
          Pro — « utilise cette icône pour l'avatar à l'accueil et enlève le
          contour présent » —, puis le cerne bleu qui l'avait remplacé :
          « enlève le contour bleu de l'avatar sur l'accueil ».

          Il ne reste que l'encre du thème, et c'est assez : le grade se lit
          au prénom posé à côté, qui garde la typo d'or en Pro, et l'avatar
          redevient ce qu'il est — une porte vers le compte, pas une
          décoration.
        */}
        <AvatarGlyph size={34} teinte={c.ink} />
        <View style={styles.profilColonne} pointerEvents="none">
          {pro ? (
            <TexteVif
              texte={compte?.prenom || compte?.email || 'Compte'}
              taille={14.5}
              graisse="600"
              fond={c.bg}
            />
          ) : (
            <Text style={styles.profilNom} numberOfLines={1}>
              {compte?.prenom || compte?.email || 'Compte'}
            </Text>
          )}
        </View>
      </Pressable>

    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  /**
   * La carte du relevé interrompu : ambre, pas rouge.
   *
   * Rien n'est cassé — il y a quelque chose à reprendre. Le rouge dirait
   * qu'on a fait une faute, et ferait chercher laquelle.
   */
  draftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: c.surfaceSunken,
    borderWidth: 1,
    borderColor: c.amber,
  },
  draftTexts: { flex: 1 },
  draftTitle: { color: c.ink, fontSize: 14.5, fontWeight: '800' },
  draftText: { color: c.inkSoft, fontSize: 12, marginTop: 2, lineHeight: 16 },
  draftPrimary: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  draftPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  draftGhost: { paddingHorizontal: 4, paddingVertical: 9 },
  draftGhostText: { color: c.inkFaint, fontWeight: '700', fontSize: 13 },
  container: {
    flex: 1,
    backgroundColor: c.bg,
    paddingHorizontal: 24,
    // 72 et non 84 : la rangée du compte a pris sa part en bas, le haut
    // rend la sienne pour que la maquette respire entre les deux.
    paddingTop: 72,
    paddingBottom: 40,
  },
  /*
    LE BLOC DESCEND D'UN CRAN — relevé du patron : « descends le logo
    EchoPlan, et l'icône qu'on vient de modifier avec, en suivant la même
    descente ».

    Il était collé sous la barre du haut : la marque n'avait pas d'air
    au-dessus d'elle. Le glyphe incrusté vit DANS ce bloc — il descend donc
    avec lui, sans qu'on ait à le descendre séparément, et l'incrustation
    reste centrée sur le mot.
  */
  hero: { alignItems: 'center', marginTop: 34, zIndex: 20, elevation: 20 },
  /**
   * Le logotype tient sur DEUX lignes — « echo » au-dessus de « plan » —,
   * d'où ces proportions : 160 × 102 et non plus une bande.
   */
  wordmark: {
    width: 160,
    height: 102,
    marginTop: 14,
  },
  subtitle: {
    color: c.inkSoft,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  /*
    L'INCRUSTATION : posée en absolu, elle ne pousse rien.

    Centrée sur le bloc d'accueil, elle passe derrière le logotype et son
    sous-titre — l'ordre des frères suffit, elle est rendue avant eux.
  */
  filigraneLogo: {
    position: 'absolute',
    top: -18,
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  /**
   * LA RESPIRATION — ce qui remplace la maquette.
   *
   * Ce n'est pas un oubli : c'est le vide qui fait l'épuré. Il prend la place
   * que prenait le téléphone, et la marque du haut comme les portes du bas
   * gardent exactement l'assiette qu'elles avaient — un écran qui se vide ne
   * doit pas se réorganiser, sinon on ne le reconnaît plus.
   */
  /* La feuille s'arrête AVANT l'appel principal : le bouton du tracé se
     posait sinon à même « Commencer le scan » — relevé du patron. */
  respiration: { flex: 1, minHeight: 40, alignItems: 'center', marginBottom: 12 },
  /** Appareil incompatible, ou erreur du scan : un bandeau, pas une alerte. */
  warning: {
    backgroundColor: '#FDECEC',
    borderRadius: radius.md,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  warningText: { color: '#A33A3E', fontSize: 13, lineHeight: 18 },
  ctaWrap: { marginTop: 'auto', paddingHorizontal: 22 },
  secondWrap: { paddingHorizontal: 22, marginTop: 10 },
  cta: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingVertical: 18,
    alignItems: 'center',
    ...glow(c.blue),
    shadowOpacity: 0.36,
  },
  ctaDisabled: { backgroundColor: c.lineStrong, shadowOpacity: 0 },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  libraryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingVertical: 15,
    marginTop: 10,
    ...shadowCard,
    shadowOpacity: 0.05,
  },
  libraryText: { color: c.ink, fontSize: 15.5, fontWeight: '600' },
  libraryBadge: {
    backgroundColor: c.blueSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
    marginLeft: 9,
  },
  libraryBadgeText: { color: c.blue, fontSize: 13, fontWeight: '800' },
  hint: {
    color: c.inkFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 17,
  },
  // Le bloc profil : en haut à gauche, le miroir du bouton de thème — la
  // même bande, chacun son coin.
  // Le bandeau du haut est AXÉ, et le profil porte son CADRE INVISIBLE —
  // relevé du patron : « un clic même autour doit fonctionner ». Le
  // rembourrage est DANS le bouton : c'est de la vraie surface de toucher,
  // pas un débord que le parent pourrait rogner.
  // Remonté d'un cran — relevé du patron : « le clic doit être fait un
  // peu au-dessus pour que ça fonctionne » — et le cadre invisible
  // s'élargit encore : quatorze points de vraie surface tout autour.
  /*
    MÊME SOMMET, MÊME HAUTEUR QUE LA ZONE DU THÈME — relevé du patron :
    les deux blocs vivaient dans des boîtes différentes et leurs centres
    dérivaient à chaque retouche. Alignés par construction : plus rien à
    calculer, donc plus rien à dériver. Le rembourrage horizontal reste le
    cadre invisible du clic.
  */
  profilBloc: {
    position: 'absolute',
    top: 47,
    left: 8,
    height: 72,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    maxWidth: '50%',
    zIndex: 2,
  },
  profilColonne: { flexShrink: 1 },
  // Moins gras — relevé du patron : le prénom n'est pas un titre.
  profilNom: { color: c.inkSoft, fontSize: 14.5, fontWeight: '600', maxWidth: 130 },
  // L'anneau d'or AU RAS de l'icône : 36 pour un avatar de 29 — plus de
  // disque clair entre eux, le couvercle est la couleur du fond. Et 36,
  // c'est la pastille du thème : les deux ronds du bandeau sont jumeaux.
}));
