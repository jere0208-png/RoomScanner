import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { RoomScan, RoomScanView } from 'react-native-room-scan';
import { themedStyles, useTheme, type Palette } from '../theme';
import { useScanStore } from '../store/scanStore';
import { useRoomScan } from '../native/useRoomScan';
import { CloseCross } from '../components/CloseCross';
import { haptic } from '../ui/haptic';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GuidePose } from './scan/GuidePose';
import { FIXTURE_SYMBOL } from '../geometry/electrical';
import { aimanterHauteur, natureAuMur } from '../geometry/viseur';
import { CEILING_SYMBOL } from '../geometry/ceiling';
import { alerte } from '../ui/alerte';

/** Le guide de pose a été lu : on ne le remontre plus de lui-même. */
const GUIDE_POSE_KEY = 'echoplan.guide-pose';

/**
 * CE QU'ON PEUT POSER AU VISEUR, et comment ça se dit.
 *
 * Le symbole est celui du PLAN — le même trait qu'on retrouvera sur le
 * dossier imprimé. Un bouton qui montre autre chose que ce qu'il produit
 * fait apprendre deux langages pour un seul geste.
 *
 * Le mot est en clair, pas en jargon : « Prise » et non « PC ». Le sigle
 * était l'abréviation d'un métier, et l'application sert aussi à la
 * montrer au client.
 */
const POSABLES = [
  { kind: 'prise', mot: 'Prise', symbole: FIXTURE_SYMBOL.prise },
  { kind: 'inter', mot: 'Inter', symbole: FIXTURE_SYMBOL.inter },
  // Le point lumineux n'est pas un appareil MURAL : sa croix normalisée
  // vit avec le plafond, et c'est celle que le plan dessinera.
  { kind: 'dcl', mot: 'Lumière', symbole: CEILING_SYMBOL.dcl },
] as const;

/**
 * Écran de scan. RoomPlan dessine lui-même ses guides ET la miniature 3D
 * temps réel en bas au centre — le HUD laisse cette zone libre : stats en
 * haut, commandes dans les coins inférieurs.
 */
export function ScanScreen() {
  const wallCount = useScanStore((s) => s.wallCount);
  const objectCount = useScanStore((s) => s.objectCount);
  const doorCount = useScanStore((s) => s.doorCount);
  const windowCount = useScanStore((s) => s.windowCount);
  const paused = useScanStore((s) => s.paused);
  /* Ce que RoomPlan voit mal, tant qu'on peut encore y retourner. */
  const mursDouteux = useScanStore((s) => s.mursDouteux);
  const processing = useScanStore((s) => s.processing);
  /* Ce que le post-traitement a refusé de faire : il faut bien le dire. */
  const error = useScanStore((s) => s.error);
  const { pause, resume, stop, cancel } = useRoomScan();
  const c = useTheme();
  const styles = getStyles(c);

  // Torche : éteinte en quittant l'écran.
  const [torch, setTorch] = useState(false);
  /**
   * CE QU'ON A POSÉ AU VISEUR — le compte, et le refus.
   *
   * Relevé du chantier : « pendant un scan, permet d'ajouter manuellement
   * des PC, inter, point lumineux ». On est DEVANT le mur : c'est le
   * moment. Le compte rassure (on sait ce qu'on a saisi), et le refus se
   * dit franchement quand le rayon ne rencontre rien — poser au jugé
   * mettrait un appareil au hasard dans le plan.
   */
  const [poses, setPoses] = useState(0);
  const [refus, setRefus] = useState(false);
  /*
    CE QU'ON VIENT DE POSER, ET À QUELLE COTE.

    Relevé du patron : « un message doit apparaître sans gêner : "Prise
    plinthe placée à 25 cm" ». L'application ne pose plus à la hauteur du
    doigt mais à la cote du métier (voir `aimanterHauteur`) — il faut donc
    le DIRE, sinon l'électricien croit avoir raté sa visée.

    Il s'efface tout seul et rend la place au compte : un message qui reste
    devient un bandeau de plus, et c'est justement ce qu'on nous demande
    d'éviter.
  */
  const [annonce, setAnnonce] = useState<string | null>(null);
  const minuteurAnnonce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (minuteurAnnonce.current) clearTimeout(minuteurAnnonce.current);
    },
    [],
  );
  /*
    LE GUIDE S'OUVRE UNE FOIS, à la première caméra.

    Relevé du chantier : les trois boutons « ne sont pas forcément
    compréhensibles de tous ». On explique donc AVANT, pendant que l'écran
    est encore vide — et jamais plus ensuite : une explication qui revient à
    chaque scan devient un obstacle, et on finit par la fermer sans la lire.
    Le « ? » du bloc la rouvre quand on la veut.
  */
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    let vivant = true;
    AsyncStorage.getItem(GUIDE_POSE_KEY)
      .then((vu) => {
        if (vivant && vu !== '1') setGuide(true);
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);
  const fermerGuide = () => {
    setGuide(false);
    AsyncStorage.setItem(GUIDE_POSE_KEY, '1').catch(() => {});
  };
  const poser = async (kind: string) => {
    const pose = await RoomScan.poserAuViseur(kind);
    if (pose) {
      setPoses((n) => n + 1);
      setRefus(false);
      haptic('succes');
      /*
        AU PLAFOND, LA POSITION SE DÉCIDE APRÈS.

        Le centrage a besoin du contour de la pièce, que le scan ne livre
        qu'à la fin. On annonce donc ce qui va se passer plutôt qu'une cote
        qu'on n'a pas : promettre un chiffre faux serait pire que se taire.
      */
      /*
        ET AU MUR, ON DIT « APPLIQUE ».

        Le bouton « Lumière » pose un `dcl`, qui n'a pas de cote murale :
        l'annonce restait donc muette pour une applique, le seul appareil
        qu'on posait sans que rien ne le confirme. C'est la même traduction
        que fait l'ancrage (`natureAuMur`) — les deux ne peuvent plus se
        contredire.
      */
      const mot = pose.plafond
        ? 'Point lumineux — il sera centré dans la pièce'
        : aimanterHauteur(natureAuMur(kind), pose.height).mot;
      if (mot) {
        setAnnonce(mot);
        if (minuteurAnnonce.current) clearTimeout(minuteurAnnonce.current);
        minuteurAnnonce.current = setTimeout(() => setAnnonce(null), 3200);
      }
    } else {
      setRefus(true);
      haptic('alerte');
      /*
        ET LE REFUS S'EFFACE, COMME L'ANNONCE.

        Il ne partait qu'à la pose suivante RÉUSSIE : on balayait la pièce
        pendant deux minutes avec, sous les yeux, un reproche qui ne valait
        plus. Trois secondes suffisent à le lire ; passé ce délai, l'écran
        appartient au relevé.
      */
      if (minuteurAnnonce.current) clearTimeout(minuteurAnnonce.current);
      minuteurAnnonce.current = setTimeout(() => setRefus(false), 3200);
    }
  };
  useEffect(() => {
    return () => {
      RoomScan.setTorch(false).catch(() => {});
    };
  }, []);
  /**
   * LA CROIX DEMANDE, quand il y a quelque chose à perdre.
   *
   * Elle est en haut à gauche, là où se pose l'index de la main qui tient
   * le téléphone : c'est le bouton qu'on frôle, pas celui qu'on cherche. Et
   * ce qu'il jette ne se rattrape pas — un relevé n'a pas d'annulation.
   *
   * Mais tant que rien n'est relevé, il ne demande rien : une confirmation
   * inutile est une confirmation qu'on apprend à balayer sans lire.
   */
  const abandonner = () => {
    if (wallCount === 0) {
      cancel();
      return;
    }
    alerte(
      'Abandonner ce relevé ?',
      `${wallCount} mur${wallCount > 1 ? 's' : ''} déjà relevé${
        wallCount > 1 ? 's' : ''
      } — rien ne sera enregistré.`,
      [
        { label: 'Continuer le scan' },
        { label: 'Abandonner', danger: true, onPress: cancel },
      ],
    );
  };
  const toggleTorch = () => {
    const next = !torch;
    setTorch(next);
    RoomScan.setTorch(next).catch(() => {});
  };

  const stats: [string, number][] = [
    ['Murs', wallCount],
    ['Portes', doorCount],
    ['Fenêtres', windowCount],
    ['Objets', objectCount],
  ];

  return (
    <View style={styles.container}>
      {/* La vue AR native se rend elle-même à 60 FPS ; l'UI RN flotte au-dessus. */}
      <RoomScanView style={StyleSheet.absoluteFill} />

      {/*
        LA CROIX ET LA TORCHE S'EFFACENT PENDANT L'ASSEMBLAGE.

        Elles portent un `zIndex` et flottaient donc AU-DESSUS du voile
        d'assemblage, qui n'en a pas : on pouvait abandonner un relevé
        pendant que RoomPlan le calculait. Le résultat arrivait quand même
        quelques secondes plus tard, et ouvrait le plan qu'on venait de
        jeter. Il n'y a rien à faire pendant ces secondes-là : on retire ce
        qui peut être frôlé.
      */}
      {!processing && (
        <TouchableOpacity
          style={styles.cancelButton}
          accessibilityLabel="Arrêter le scan"
          onPress={abandonner}>
          <CloseCross size={20} color={c.scanInk} weight={3} />
        </TouchableOpacity>
      )}

      {/* Torche : rond façon bouton de thème, avec un éclair. */}
      <TouchableOpacity
        style={[
          styles.torchButton,
          torch && styles.torchButtonOn,
          processing && styles.cacheEnAssemblage,
        ]}
        accessibilityLabel={torch ? 'Éteindre la torche' : 'Allumer la torche'}
        onPress={toggleTorch}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M13 2 L5 13.5 h5 L8 22 l8.5 -11.5 h-5 z"
            stroke={torch ? '#0B0D12' : '#F4F6FA'}
            strokeWidth={2}
            strokeLinejoin="round"
            fill={torch ? '#0B0D12' : 'none'}
          />
        </Svg>
      </TouchableOpacity>

      {/* RoomPlan affiche déjà ses propres instructions : pas de doublon. */}
      <View style={styles.topHud} pointerEvents="none">
        <View style={styles.statsPill}>
          {stats.map(([label, n], i) => (
            <View key={label} style={[styles.stat, i > 0 && styles.statBorder]}>
              <Text style={styles.statValue}>{n}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
        {paused && (
          <View style={[styles.instructionPill, styles.pausedPill]}>
            <Text style={styles.instructionText}>Scan en pause</Text>
          </View>
        )}
        {/*
          CE QUE LE RELEVÉ VOIT MAL, PENDANT QU'ON PEUT ENCORE Y RETOURNER.

          RoomPlan accorde une confiance à chaque surface et nous la donne
          deux fois par seconde ; l'app n'en gardait que le nombre de murs.
          C'est pourtant là que tout se joue : un mur douteux se repasse en
          dix secondes tant qu'on est dans la pièce, et coûte une demi-heure
          de retouches une fois rentré — trous à combler, linteaux à
          remonter, pièces qui ne se referment pas.

          Un compte, pas une liste : on ne lit pas un inventaire en
          balayant une pièce. Et rien du tout quand tout est franc — un
          voyant qui s'allume toujours n'avertit plus de rien.
        */}
        {!paused && mursDouteux > 0 && (
          <View style={[styles.instructionPill, styles.douteuxPill]}>
            <View style={styles.instructionDot} />
            <Text style={styles.instructionText}>
              {`${mursDouteux} mur${mursDouteux > 1 ? 's' : ''} mal vu${
                mursDouteux > 1 ? 's' : ''
              } · repassez lentement dessus`}
            </Text>
          </View>
        )}
      </View>

      {/*
        LE VISEUR, ET CE QU'ON Y POSE.

        Un carré au centre : on l'aligne sur la boîte, on appuie sur le
        bouton du bon appareil. Les boutons vivent SUR LE CÔTÉ — relevé du
        patron —, hors du chemin du pouce qui tient le téléphone et loin de
        la miniature 3D de RoomPlan, qui occupe le centre-bas.
      */}
      {!paused && !processing && (
        <>
          <View style={styles.viseur} pointerEvents="none">
            <View style={[styles.viseurCoin, styles.viseurHG]} />
            <View style={[styles.viseurCoin, styles.viseurHD]} />
            <View style={[styles.viseurCoin, styles.viseurBG]} />
            <View style={[styles.viseurCoin, styles.viseurBD]} />
          </View>
          {/*
            LE BLOC DE POSE — un tiroir d'outils, pas trois pastilles éparses.

            Relevé du chantier : « les 3 boutons de placement d'éléments élec
            ne sont pas forcément compréhensibles de tous ». Trois ronds
            portant PC, INT et LUM ne disent rien à qui n'a pas le jargon —
            et même à qui l'a, ils ne disent pas qu'on POSE quelque chose sur
            le mur qu'on filme.

            Trois réponses dans le même bloc : le SYMBOLE du plan — celui
            qu'on retrouvera sur le dossier, donc la même langue d'un bout à
            l'autre —, le MOT en clair dessous, et un « ? » qui rouvre
            l'explication. Réunis sur un fond commun, ils se lisent comme un
            outil, pas comme trois boutons qui traînent.
          */}
          <View style={styles.poseBloc}>
            {POSABLES.map(({ kind, mot, symbole }) => (
              <TouchableOpacity
                key={kind}
                style={styles.poseBouton}
                accessibilityLabel={`Poser ${mot} à l’endroit visé`}
                onPress={() => poser(kind)}>
                <Svg width={22} height={22} viewBox="-14 -14 28 28">
                  {symbole.map((seg, i) => (
                    <Path
                      key={i}
                      d={seg.d}
                      stroke={c.scanInk}
                      strokeWidth={1.9}
                      strokeLinecap="round"
                      fill="none"
                    />
                  ))}
                </Svg>
                <Text style={styles.poseTexte}>{mot}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.poseSeparateur} />
            <View style={styles.poseRangeeBasse}>
              <TouchableOpacity
                style={styles.poseSecondaire}
                accessibilityLabel="À quoi servent ces boutons"
                onPress={() => setGuide(true)}>
                <Text style={styles.poseSecondaireTexte}>?</Text>
              </TouchableOpacity>
              {poses > 0 && (
                <TouchableOpacity
                  style={styles.poseSecondaire}
                  accessibilityLabel="Retirer le dernier appareil posé"
                  onPress={async () => {
                    if (await RoomScan.retirerDerniereAncre()) {
                      setPoses((n) => Math.max(0, n - 1));
                      haptic('leger');
                    }
                  }}>
                  <Text style={styles.poseSecondaireTexte}>↺</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {(poses > 0 || refus || annonce) && (
            <View style={styles.poseBandeau} pointerEvents="none">
              <Text style={styles.instructionText}>
                {/* Le refus passe avant tout : c'est le seul cas où le
                    geste n'a rien produit. Puis la cote qu'on vient de
                    poser, tant qu'elle est fraîche ; le compte reprend la
                    place ensuite. */}
                {refus
                  ? 'Visez un mur déjà relevé — balayez-le d’abord'
                  : annonce ??
                    `${poses} appareil${poses > 1 ? 's' : ''} posé${
                      poses > 1 ? 's' : ''
                    }`}
              </Text>
            </View>
          )}
        </>
      )}

      {/* Coins inférieurs uniquement : le centre-bas appartient à la
          miniature 3D live de RoomPlan. */}
      <View style={styles.bottomHud} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.pauseButton}
          accessibilityLabel={paused ? 'Reprendre le scan' : 'Mettre en pause'}
          onPress={paused ? resume : pause}>
          {/* Icône dessinée : même hauteur (18) que l'éclair et la croix. */}
          <Svg width={18} height={18} viewBox="0 0 24 24">
            {paused ? (
              <Path
                d="M8 4.5 L19.5 12 L8 19.5 z"
                fill="#F4F6FA"
                stroke="#F4F6FA"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            ) : (
              <>
                <Path
                  d="M8.5 5 v14"
                  stroke="#F4F6FA"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
                <Path
                  d="M15.5 5 v14"
                  stroke="#F4F6FA"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
              </>
            )}
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity style={styles.stopButton} onPress={stop}>
          <Text style={styles.stopText}>Terminer</Text>
        </TouchableOpacity>
      </View>

      {/*
        L'EXPLICATION PASSE AVANT LE SCAN, pas pendant.

        Elle s'ouvre sur l'écran encore vide — au moment où l'on découvre
        ces boutons —, et le scan continue derrière : RoomPlan tourne, la
        pièce se relève, rien n'est perdu à lire trois phrases.
      */}
      <GuidePose visible={guide && !processing} onFermer={fermerGuide} />

      {/*
        UNE FIN DE SCAN QUI ÉCHOUE SE DIT ICI.

        Le post-traitement de RoomPlan échoue parfois — c'est le cas connu,
        « aucun mur détecté ». Le magasin retenait bien le message, mais
        SEUL l'écran d'accueil l'affiche : on restait donc devant une caméra
        morte, sans un mot, à réappuyer sur « Terminer » sur une session
        déjà close. L'application paraissait plantée alors qu'elle avait
        parfaitement compris.

        Le message se dit là où l'on est, et la sortie est à côté.
      */}
      {!!error && !processing && (
        <View style={styles.pannePanneau}>
          <Text style={styles.panneTitre}>Le relevé n’a pas abouti</Text>
          <Text style={styles.panneTexte}>{error}</Text>
          <TouchableOpacity
            style={styles.panneBouton}
            accessibilityLabel="Quitter le scan"
            onPress={cancel}>
            <Text style={styles.panneBoutonTexte}>Quitter le scan</Text>
          </TouchableOpacity>
        </View>
      )}

      {processing && (
        <View style={styles.processing}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.processingTitle}>Assemblage du modèle 3D…</Text>
          <Text style={styles.processingText}>
            Murs et ouvertures sont en cours de calcul, puis les pièces sont
            reconnues et nommées d'après le mobilier trouvé dedans.
          </Text>
        </View>
      )}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  /* Le panneau d'échec : au milieu, lisible sur la caméra, avec sa sortie. */
  pannePanneau: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '38%',
    zIndex: 5,
    backgroundColor: 'rgba(11,13,18,0.92)',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  panneTitre: { color: '#F4F6FA', fontSize: 17, fontWeight: '700' },
  panneTexte: {
    color: '#C6CDD8',
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  panneBouton: {
    marginTop: 8,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: '#F4F6FA',
  },
  panneBoutonTexte: { color: '#0B0D12', fontSize: 15, fontWeight: '700' },
  cancelButton: {
    position: 'absolute',
    top: 58,
    left: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.scanPillSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchButton: {
    position: 'absolute',
    top: 58,
    right: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.scanPillSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchButtonOn: { backgroundColor: '#F4F6FA' },
  /* Sous le voile d'assemblage : plus rien à toucher. */
  cacheEnAssemblage: { opacity: 0, zIndex: 0 },
  /* Le viseur : quatre coins, pas un cadre plein — on doit VOIR le mur. */
  /*
    LE CARRÉ EST OÙ LE RAYON PART, ET PAS AILLEURS.

    Il était dessiné à 46 % de la hauteur — quatre points au-dessus du
    centre, pour dégager la miniature 3D du bas. Mais le rayon qui pose
    l'appareil part du CENTRE EXACT de l'image (0,5 ; 0,5) : l'appareil se
    posait donc quelques centimètres sous le carré qu'on venait de viser.

    Relevé du chantier : « centre l'élément au carré que l'on a au milieu de
    l'écran ». Deux repères pour un seul geste, c'est un de trop : le carré
    descend au centre vrai, là où le rayon tire.
  */
  viseur: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 74,
    height: 74,
    marginLeft: -37,
    marginTop: -37,
  },
  viseurCoin: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#F4F6FA',
  },
  viseurHG: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  viseurHD: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  viseurBG: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  viseurBD: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  /* Les boutons de pose : une colonne contre le bord droit, à hauteur du
     pouce, hors du chemin de la miniature 3D. */
  /*
    UN SEUL BLOC, contre le bord droit, à hauteur de pouce.

    Les trois boutons vivaient séparés, chacun sur sa pastille ronde : rien
    ne disait qu'ils allaient ensemble, ni qu'ils s'adressaient au viseur du
    centre. Réunis dans un même tiroir, ils se lisent comme la boîte à
    outils qu'ils sont — et le « ? » y a naturellement sa place.
  */
  /*
    UN CRAN PLUS PETIT — relevé du chantier.

    Le bloc prenait le tiers de la hauteur de l'écran, sur une vue où l'on
    a besoin de VOIR ce qu'on scanne : trois boutons de cinquante-quatre
    points, plus le séparateur et la rangée du bas. Réduits, ils restent
    largement à portée du pouce — un carré de quarante-six points est la
    taille d'une touche de clavier — et rendent la moitié de la place au
    relevé.
  */
  poseBloc: {
    position: 'absolute',
    right: 12,
    top: '32%',
    backgroundColor: c.scanPill,
    borderRadius: 17,
    padding: 5,
    gap: 3,
    alignItems: 'center',
  },
  poseBouton: {
    width: 48,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  poseTexte: { color: c.scanInk, fontSize: 9.5, fontWeight: '700' },
  poseSeparateur: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  poseRangeeBasse: { flexDirection: 'row', gap: 4 },
  poseSecondaire: {
    width: 27,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poseSecondaireTexte: {
    color: c.scanInk,
    fontSize: 15,
    fontWeight: '800',
    opacity: 0.85,
  },
  poseBandeau: {
    position: 'absolute',
    bottom: 118,
    alignSelf: 'center',
    backgroundColor: c.scanPill,
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  topHud: {
    position: 'absolute',
    top: 58,
    left: 66,
    right: 66,
    alignItems: 'center',
  },
  statsPill: {
    flexDirection: 'row',
    backgroundColor: c.scanPill,
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 2,
  },
  stat: { alignItems: 'center', paddingHorizontal: 9 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)' },
  statValue: { color: c.scanInk, fontSize: 15, fontWeight: '800' },
  statLabel: {
    color: 'rgba(244,246,250,0.62)',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 1,
  },
  instructionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.scanPillSoft,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 10,
  },
  pausedPill: { backgroundColor: 'rgba(232,161,59,0.85)' },
  /* Ambre comme la pause : c'est un avertissement, pas une faute. */
  douteuxPill: { backgroundColor: 'rgba(232,161,59,0.9)' },
  instructionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.blue,
    marginRight: 8,
  },
  instructionText: { color: c.scanInk, fontSize: 14, fontWeight: '600' },
  bottomHud: {
    position: 'absolute',
    bottom: 46,
    left: 22,
    right: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pauseButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: c.scanPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIcon: { color: c.scanInk, fontSize: 16, fontWeight: '700' },
  stopButton: {
    backgroundColor: c.blue,
    borderRadius: 27,
    paddingHorizontal: 26,
    paddingVertical: 16,
    shadowColor: c.blue,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  stopText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  processing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,10,14,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  processingTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 18,
  },
  processingText: {
    color: 'rgba(244,246,250,0.65)',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
}));
