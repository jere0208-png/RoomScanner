import React, { useEffect, useState } from 'react';
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
import { CEILING_SYMBOL } from '../geometry/ceiling';

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
    const ok = await RoomScan.poserAuViseur(kind);
    if (ok) {
      setPoses((n) => n + 1);
      setRefus(false);
      haptic('succes');
    } else {
      setRefus(true);
      haptic('alerte');
    }
  };
  useEffect(() => {
    return () => {
      RoomScan.setTorch(false).catch(() => {});
    };
  }, []);
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

      <TouchableOpacity
        style={styles.cancelButton}
        accessibilityLabel="Arrêter le scan"
        onPress={cancel}>
        <CloseCross size={20} color={c.scanInk} weight={3} />
      </TouchableOpacity>

      {/* Torche : rond façon bouton de thème, avec un éclair. */}
      <TouchableOpacity
        style={[styles.torchButton, torch && styles.torchButtonOn]}
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
                <Svg width={26} height={26} viewBox="-14 -14 28 28">
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
          {(poses > 0 || refus) && (
            <View style={styles.poseBandeau} pointerEvents="none">
              <Text style={styles.instructionText}>
                {refus
                  ? 'Visez un mur déjà relevé — balayez-le d’abord'
                  : `${poses} appareil${poses > 1 ? 's' : ''} posé${
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
  /* Le viseur : quatre coins, pas un cadre plein — on doit VOIR le mur. */
  viseur: {
    position: 'absolute',
    top: '46%',
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
  poseBloc: {
    position: 'absolute',
    right: 14,
    top: '30%',
    backgroundColor: c.scanPill,
    borderRadius: 20,
    padding: 6,
    gap: 4,
    alignItems: 'center',
  },
  poseBouton: {
    width: 58,
    height: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  poseTexte: { color: c.scanInk, fontSize: 10.5, fontWeight: '700' },
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
