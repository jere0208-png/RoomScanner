/**
 * LA PRÉSENTATION CLIENT — le relevé qui se raconte tout seul.
 *
 * Montrer un plan à un client, c'est aujourd'hui lui tendre le téléphone et
 * tourner le modèle du doigt en commentant : « là c'est la chambre, la prise
 * est sur ce mur… ». Ça marche, et ça ne se délègue pas — l'électricien doit
 * être là, le doigt sur l'écran, et il montre toujours la même chose deux
 * fois par visite.
 *
 * Cette visite guidée joue la même chose sans lui : le logement tourne, la
 * caméra s'arrête sur chaque pièce puis se place FACE à chaque mur équipé,
 * et un carton annonce ce qu'on regarde — « Mur nord · Chambre », les
 * appareils qui s'y trouvent, nommés comme sur le dossier. On la lance et on
 * laisse le client regarder.
 *
 * Ce n'est pas un fichier vidéo, et il faut le dire franchement : produire
 * un .mp4 demanderait d'encoder les images une par une côté natif. En
 * attendant, l'enregistrement d'écran d'iOS capture cette visite en un
 * geste, et le résultat s'envoie comme n'importe quelle vidéo.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Pause, Play, X } from 'lucide-react-native';
import { Iso3DView, type View3DParams } from './Iso3DView';
import {
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import {
  roomParts,
  segLength,
  type Pt,
  type WallSeg,
} from '../geometry/floorplan';
import { FIXTURES } from '../geometry/electrical';
import { deviceNames, wallCardinal } from '../geometry/naming';
import { fixturePlacement, roomInputsOf } from '../geometry/nfc15100';
import { useScanStore } from '../store/scanStore';

/** Un moment de la visite : une caméra d'arrivée, un carton, une durée. */
interface Etape {
  /** Ce qu'on annonce, en haut. */
  titre: string;
  sous?: string;
  /** Le détail, en bas — les appareils du mur, par exemple. */
  detail?: string;
  /** Pièce isolée pendant l'étape, ou `null` pour le logement entier. */
  roomId: string | null;
  /** Caméra visée. Le mouvement s'y rend en douceur depuis la précédente. */
  vue: View3DParams;
  /** Tour d'horizon pendant l'étape, en degrés (0 = caméra fixe). */
  balayage: number;
  /**
   * ZOOM D'ARRIVÉE, s'il doit continuer à bouger pendant l'étape.
   *
   * Une caméra qui tourne à distance constante devient vite un manège. En
   * avançant lentement pendant le tour d'horizon, on donne le sentiment
   * d'entrer dans la pièce plutôt que de tourner autour — c'est ce que
   * demandait le chantier : « une immersion totale mais dynamique ».
   */
  zoomFin?: number;
  /**
   * L'étape présente UN MUR : on trace alors les cotes des appareils, et
   * on pose leur désignation. Le reste du temps, la scène reste nue — un
   * client ne lit pas dix nombres sur un volume qui tourne.
   */
  mur?: boolean;
  /** Durée, en millisecondes. */
  duree: number;
}

const lissage = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

const fr1 = (v: number) => v.toFixed(1).replace('.', ',');

/**
 * L'AZIMUT QUI MET UN MUR DE FACE.
 *
 * La vue projette un point du monde en tournant le plan de `theta` : la
 * profondeur y suit la direction (sin θ, cos θ). Regarder un mur de face,
 * c'est donc aligner cette direction sur sa normale — celle qui va du
 * centre de la pièce vers le mur, puisque la caméra se tient dans la pièce.
 */
function azimutFaceAuMur(wall: WallSeg, centre: Pt): number {
  const milieu = {
    x: (wall.a.x + wall.b.x) / 2,
    z: (wall.a.z + wall.b.z) / 2,
  };
  const dx = milieu.x - centre.x;
  const dz = milieu.z - centre.z;
  return (Math.atan2(dx, dz) * 180) / Math.PI;
}

export function ClientTour({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const walls = useScanStore((s) => s.walls);
  const rooms = useScanStore((s) => s.rooms);
  const fixtures = useScanStore((s) => s.fixtures);
  const ceiling = useScanStore((s) => s.ceiling);
  const north = useScanStore((s) => s.north);
  const scanName = useScanStore((s) => s.scanName);

  /**
   * LE SCÉNARIO, tiré du plan lui-même.
   *
   * Rien n'est écrit à la main : les pièces viennent du relevé, les murs de
   * leur géométrie, les noms d'appareils du même calcul que le dossier
   * imprimé. Un plan modifié change donc la visite, sans qu'on y touche.
   */
  const etapes = useMemo<Etape[]>(() => {
    const parts = roomParts(walls, rooms);
    const centres = new Map(parts.map((p) => [p.roomId, p.labelAt]));
    const placement = fixturePlacement(fixtures, walls, roomInputsOf(rooms, parts));
    const noms = deviceNames(
      fixtures,
      walls,
      placement,
      Object.fromEntries(rooms.map((r) => [r.id, r.name])),
      centres,
      north,
    );
    const surface = parts.reduce((t, p) => t + (p.surface?.area ?? 0), 0);
    const out: Etape[] = [];

    // 1. Le logement entier, qui tourne : on prend la mesure du volume.
    out.push({
      titre: scanName || 'Le logement',
      sous: `${rooms.length} pièce${rooms.length > 1 ? 's' : ''} · ${fr1(
        surface,
      )} m² · ${fixtures.length} appareil${fixtures.length > 1 ? 's' : ''}`,
      roomId: null,
      // Un tour COMPLET du logement, vu de haut : avant d'entrer quelque
      // part, le client doit savoir à quoi ressemble l'ensemble.
      vue: { theta: -32, tilt: 56, zoom: 1, ox: 0, oy: 0 },
      balayage: 360,
      duree: 8000,
    });

    for (const room of rooms) {
      const part = parts.find((p) => p.roomId === room.id);
      const centre = centres.get(room.id);
      if (!part || !centre) continue;
      const murs = part.walls
        .map((w) => walls.find((x) => x.id === w.id))
        .filter((w): w is WallSeg => !!w && segLength(w) > 0.4);

      /*
        2. ON ENTRE DANS LA PIÈCE, ET ON EN FAIT LE TOUR.

        Relevé du chantier : « d'abord un tour d'ensemble, puis rentrer
        TOTALEMENT au centre de chaque pièce pour présenter chaque mur qui
        se trouve autour — une immersion totale mais dynamique ».

        Trois réglages font l'immersion. Le REGARD descend à hauteur d'homme
        (dix-sept degrés au lieu de cinquante) : on ne survole plus une
        maquette, on se tient dedans. Le CADRAGE se serre sur la seule
        pièce — elle est isolée, la vue se recadre donc sur elle et son
        centre devient le centre de l'image. Et la caméra fait un TOUR
        COMPLET : chaque mur passe devant l'œil, l'un après l'autre, sans
        qu'on ait à les énumérer.

        L'écorché fait le reste : le mur qui se trouve entre la caméra et la
        pièce s'efface en gardant son arête. On voit donc du dedans, comme
        si l'on se tenait au milieu.
      */
      const premier = murs[0];
      out.push({
        titre: room.name || 'Pièce',
        sous: part.surface
          ? `${fr1(part.surface.area)} m² · ${murs.length} murs`
          : undefined,
        detail: 'Au centre de la pièce — tour complet',
        roomId: room.id,
        vue: {
          // On démarre face à un mur : un tour qui commence dans un angle
          // ne montre d'abord que deux bouts de cloison.
          theta: premier ? azimutFaceAuMur(premier, centre) : -32,
          tilt: 17,
          zoom: 2.1,
          ox: 0,
          oy: 0,
        },
        // Et l'on avance encore pendant le tour : c'est ce mouvement-là qui
        // fait entrer, plutôt que tourner autour.
        zoomFin: 2.6,
        balayage: 360,
        duree: 9000,
      });

      // 3. Chaque mur ÉQUIPÉ, vu de face, avec ses appareils nommés.
      for (const w of murs) {
        const dessus = fixtures.filter((f) => f.wallId === w.id);
        if (dessus.length === 0) continue;
        const aire = wallCardinal(w, centre, north);
        out.push({
          titre: aire
            ? `Mur ${aire} · ${room.name || 'pièce'}`
            : `Mur de ${fr1(segLength(w))} m · ${room.name || 'pièce'}`,
          sous: `${dessus.length} appareil${dessus.length > 1 ? 's' : ''}`,
          detail: dessus
            .map((f) => noms.get(f.id)?.nom ?? FIXTURES[f.kind].label)
            .join(' · '),
          roomId: room.id,
          mur: true,
          /**
           * PRESQUE DE FACE, ET LENTEMENT.
           *
           * De face pile, un mur devient un rectangle plat : on ne voit
           * plus ni son épaisseur ni la profondeur de la pièce, et
           * l'image paraît figée. Quelques degrés de biais suffisent à
           * garder le volume, et un balayage lent — dix degrés sur six
           * secondes — fait vivre l'image sans qu'on ait à suivre.
           */
          vue: {
            theta: azimutFaceAuMur(w, centre) - 5,
            tilt: 26,
            zoom: 1.55,
            ox: 0,
            oy: 0,
          },
          balayage: 10,
          duree: 6200,
        });
      }
    }

    // 4. Le mot de la fin : ce qu'il y a dans le devis, en trois chiffres.
    out.push({
      titre: 'Installation complète',
      sous: `${fixtures.length} appareil${fixtures.length > 1 ? 's' : ''}${
        ceiling.length > 0
          ? ` · ${ceiling.length} au plafond`
          : ''
      } · ${fr1(surface)} m²`,
      detail: 'Plans, schémas et liste du matériel dans le dossier PDF.',
      roomId: null,
      vue: { theta: 148, tilt: 62, zoom: 0.95, ox: 0, oy: 0 },
      balayage: 120,
      duree: 6000,
    });
    return out;
  }, [walls, rooms, fixtures, ceiling, north, scanName]);

  const [index, setIndex] = useState(0);
  const [joue, setJoue] = useState(true);
  const [vue, setVue] = useState<View3DParams>(etapes[0]?.vue ?? {
    theta: -32,
    tilt: 56,
    zoom: 1,
    ox: 0,
    oy: 0,
  });
  const [avance, setAvance] = useState(0);
  /**
   * ON PRÉPARE, PUIS ON JOUE.
   *
   * Le modèle se bâtit à la première image : murs extrudés, mobilier,
   * appareillage, sols. Sur un logement meublé, c'est le plus gros calcul
   * de l'app — et il tombait pendant les premières secondes de la
   * présentation, celles où la caméra démarre. Le client voyait donc un
   * départ haché, puis ça se calmait : exactement l'inverse de ce qu'on
   * veut montrer.
   *
   * On lève donc le rideau seulement quand le modèle est monté : la vue
   * 3D se rend une première fois derrière un carton de préparation, et
   * l'horloge ne part qu'ensuite.
   */
  const [pret, setPret] = useState(false);
  /** Les pièces traversées par la présentation, sans doublon. */
  const pieces = useMemo(
    () => [...new Set(etapes.map((e) => e.roomId ?? null))],
    [etapes],
  );
  /** Avancement du tracé des cotes, ou `null` hors des étapes de mur. */
  const [cotes, setCotes] = useState<number | null>(null);

  /**
   * LE CARTON CHANGE, ET ÇA SE VOIT.
   *
   * Le titre se remplaçait d'une image à l'autre : « Mur nord » devenait
   * « Mur est » sans que rien ne bouge, et on ne savait pas si on avait
   * changé de mur ou mal lu. Devant un client, ce silence-là coûte cher :
   * c'est le moment où il faut qu'il comprenne qu'on passe à autre chose.
   *
   * Le carton sort donc par la gauche en s'effaçant, et le suivant entre
   * par la droite — le geste d'une page qu'on tourne. Les trois éléments
   * ne partent pas ensemble : le titre mène, le sous-titre suit à quarante
   * millisecondes, le détail à quatre-vingts. C'est ce décalage qui donne
   * l'impression d'un mouvement vivant plutôt que d'un bloc qui glisse.
   */
  const carton = useRef(new Animated.Value(1)).current;
  const [vu, setVu] = useState<Etape | null>(null);
  useEffect(() => {
    const cible = etapes[Math.min(index, etapes.length - 1)];
    if (!cible) return;
    if (vu === cible) return;
    if (!vu) {
      setVu(cible);
      return;
    }
    Animated.timing(carton, {
      toValue: 0,
      duration: 170,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setVu(cible);
      Animated.timing(carton, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }).start();
    });
  }, [index, etapes, vu, carton]);

  /** Le décalage d'un élément du carton, selon son rang. */
  const glisse = (rang: number) => ({
    opacity: carton.interpolate({
      inputRange: [0, 0.25 + rang * 0.12, 1],
      outputRange: [0, 0, 1],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        translateX: carton.interpolate({
          inputRange: [0, 1],
          outputRange: [26 + rang * 10, 0],
        }),
      },
    ],
  });

  const etape = etapes[Math.min(index, etapes.length - 1)];
  const depart = useRef<View3DParams>(vue);
  const debut = useRef(0);
  const boucle = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Remet la visite à son début — à l'ouverture, et à la fin. */
  const rembobiner = useCallback(() => {
    setIndex(0);
    setAvance(0);
    depart.current = etapes[0]?.vue ?? vue;
    setVue(etapes[0]?.vue ?? vue);
    debut.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapes]);

  useEffect(() => {
    if (!visible) {
      setPret(false);
      return;
    }
    rembobiner();
    setJoue(true);
    setPret(false);
    // Deux images pour que la vue 3D se monte et se peigne, puis un souffle
    // — le temps que le modèle soit vraiment à l'écran plutôt que dans la
    // file de rendu.
    let a = 0;
    let b = 0;
    const t = setTimeout(() => {
      a = requestAnimationFrame(() => {
        b = requestAnimationFrame(() => setPret(true));
      });
    }, 380);
    return () => {
      clearTimeout(t);
      if (a) cancelAnimationFrame(a);
      if (b) cancelAnimationFrame(b);
    };
  }, [visible, rembobiner]);

  /**
   * LE MOUVEMENT — une horloge, pas une animation native.
   *
   * Ce qu'on anime n'est pas un style mais les paramètres d'une caméra que
   * la vue 3D reprojette : ça passe forcément par JavaScript. On tient donc
   * notre propre horloge, à trente images par seconde — assez pour que le
   * mouvement soit fluide, assez peu pour que le rendu d'un logement entier
   * suive sans saccader.
   */
  useEffect(() => {
    if (!visible || !joue || !etape || !pret) return;
    let vivant = true;
    const t0 = Date.now() - debut.current;
    const tick = () => {
      if (!vivant) return;
      const passe = Date.now() - t0;
      const t = Math.min(1, passe / etape.duree);
      // Deux temps : on rejoint la caméra de l'étape, puis on balaie
      // doucement — arriver ET tourner en même temps donne un mouvement
      // mou, qui ne montre rien. Devant un mur, l'arrivée prend son temps :
      // c'est le moment où le client comprend ce qu'il regarde.
      const arrivee = lissage(Math.min(1, t / (etape.mur ? 0.45 : 0.34)));
      const d = depart.current;
      const a = etape.vue;
      const balaye = etape.balayage * Math.max(0, (t - 0.2) / 0.8);
      // Le zoom continue de monter PENDANT le tour d'horizon : la caméra
      // avance dans la pièce au lieu d'en faire le tour à distance fixe.
      const zCible =
        a.zoom +
        ((etape.zoomFin ?? a.zoom) - a.zoom) * Math.max(0, (t - 0.25) / 0.75);
      setVue({
        theta: d.theta + (a.theta - d.theta) * arrivee + balaye,
        tilt: d.tilt + (a.tilt - d.tilt) * arrivee,
        zoom: d.zoom + (zCible - d.zoom) * arrivee,
        ox: 0,
        oy: 0,
      });
      /**
       * LES COTES SE TRACENT, PUIS S'EFFACENT.
       *
       * Elles montent après l'arrivée de la caméra — sinon elles
       * s'étirent pendant que l'image tourne, et rien ne se lit —, tiennent
       * le temps qu'on les lise, et se rétractent avant le mur suivant. Un
       * client retient un geste : le mètre qu'on déroule, puis qu'on range.
       */
      setCotes(
        !etape.mur
          ? null
          : t < 0.5
          ? Math.max(0, (t - 0.42) / 0.08)
          : t < 0.86
          ? 1
          : Math.max(0, 1 - (t - 0.86) / 0.1),
      );
      setAvance(t);
      debut.current = passe;
      if (t >= 1) {
        depart.current = {
          ...a,
          theta: a.theta + etape.balayage,
          zoom: etape.zoomFin ?? a.zoom,
        };
        debut.current = 0;
        if (index + 1 < etapes.length) setIndex(index + 1);
        else setJoue(false);
        return;
      }
      boucle.current = setTimeout(tick, 33);
    };
    tick();
    return () => {
      vivant = false;
      if (boucle.current) clearTimeout(boucle.current);
    };
  }, [visible, joue, etape, index, etapes.length, pret]);

  if (!etape) return null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.plein}>
        {/*
          LES AUTRES MURS S'EFFACENT.

          Une pièce isolée reste une boîte fermée : la cloison qui se
          trouve entre la caméra et le mur présenté cachait précisément ce
          qu'on venait montrer. L'écorché les rend transparentes — elles
          gardent leur arête, donc la pièce garde sa forme.
        */}
        <Iso3DView
          value={vue}
          showMeasures={false}
          showElecTags={!!etape.mur}
          showNorth={false}
          cutaway
          elecCotes={cotes}
          focusRoomId={etape.roomId}
          /* Le modèle bouge tout seul, trente fois par seconde : on le
             rend en pans d'un seul tenant. La découpe en bandes ne se voit
             pas sur une image qui tourne — les saccades, si. */
          light
          /* Et toutes les pièces qu'on va montrer sont bâties D'AVANCE,
             derrière le rideau : sans ça, chaque changement de pièce refait
             le modèle en plein mouvement — un à-coup par étape, toujours au
             même endroit. */
          prebuildRooms={pieces}
        />

        {/*
          LE RIDEAU DE PRÉPARATION.

          Il couvre la première image — celle qui coûte : murs extrudés,
          mobilier, appareillage — et se retire quand tout est monté. Sans
          lui, on assistait à la construction du modèle, ce qui n'intéresse
          personne, surtout pas un client.

          Il n'est pas décoratif : tant qu'il est là, l'horloge de la
          présentation ne tourne pas. Le mouvement commence donc à la
          première image où il peut être fluide.
        */}
        {!pret && (
          <View style={styles.rideau} accessibilityLabel="Préparation">
            <Text style={styles.rideauTitre}>{scanName}</Text>
            <Text style={styles.rideauSous}>Préparation de la présentation…</Text>
          </View>
        )}

        {/* Le carton : il monte du bas, il ne clignote pas. Un titre qu'on
            lit sans effort pendant que le modèle tourne derrière. */}
        <View pointerEvents="none" style={styles.carton}>
          <Animated.Text style={[styles.titre, glisse(0)]} numberOfLines={2}>
            {(vu ?? etape).titre}
          </Animated.Text>
          {(vu ?? etape).sous ? (
            <Animated.Text style={[styles.sous, glisse(1)]} numberOfLines={1}>
              {(vu ?? etape).sous}
            </Animated.Text>
          ) : null}
          {(vu ?? etape).detail ? (
            <Animated.Text style={[styles.detail, glisse(2)]} numberOfLines={3}>
              {(vu ?? etape).detail}
            </Animated.Text>
          ) : null}
        </View>

        {/* La barre d'avancement : une graduation par étape, remplie au fur
            et à mesure. On sait toujours où on en est, et combien il reste. */}
        <View pointerEvents="none" style={styles.rail}>
          {etapes.map((_, i) => (
            <View key={i} style={styles.railCase}>
              <View
                style={[
                  styles.railFill,
                  {
                    width: `${
                      i < index ? 100 : i === index ? avance * 100 : 0
                    }%`,
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.commandes}>
          <TouchableOpacity
            style={styles.rond}
            accessibilityLabel={joue ? 'Pause' : 'Reprendre'}
            onPress={() => {
              if (!joue && index === etapes.length - 1 && avance >= 1) {
                rembobiner();
              }
              setJoue((v) => !v);
            }}>
            {joue ? (
              <Pause size={20} color="#FFFFFF" strokeWidth={2.4} />
            ) : (
              <Play size={20} color="#FFFFFF" strokeWidth={2.4} />
            )}
          </TouchableOpacity>
          <Pressable
            style={styles.rond}
            accessibilityLabel="Fermer la présentation"
            onPress={onClose}>
            <X size={20} color="#FFFFFF" strokeWidth={2.6} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    plein: { flex: 1, backgroundColor: c.bg, paddingTop: 40 },
  rideau: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.bg,
    gap: 6,
  },
  rideauTitre: { color: c.ink, fontSize: 20, fontWeight: '800' },
  rideauSous: { color: c.inkFaint, fontSize: 13 },
    carton: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 108,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingHorizontal: 18,
      paddingVertical: 14,
      ...shadowCard,
      shadowOpacity: 0.12,
      shadowRadius: 18,
    },
    titre: { color: c.ink, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
    sous: { color: c.blue, fontSize: 13.5, fontWeight: '800', marginTop: 3 },
    detail: {
      color: c.inkSoft,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 7,
    },
    rail: {
      position: 'absolute',
      top: 52,
      left: 20,
      right: 20,
      flexDirection: 'row',
      gap: 4,
    },
    railCase: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: c.line,
      overflow: 'hidden',
    },
    railFill: { height: 3, backgroundColor: c.blue, borderRadius: 2 },
    commandes: {
      position: 'absolute',
      right: 20,
      bottom: 44,
      flexDirection: 'row',
      gap: 10,
    },
    rond: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.16,
    },
  }),
);
