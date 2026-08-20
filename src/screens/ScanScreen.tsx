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
