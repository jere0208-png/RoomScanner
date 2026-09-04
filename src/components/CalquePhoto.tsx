/**
 * LA PHOTO DU MUR, DERRIÈRE SON ÉLÉVATION — l'avant/après du chantier.
 *
 * Huitième des dix améliorations. L'établi dessine un mur vu de face, et l'on
 * y pose les prises. À côté, dans un bouton, dort une photo DE CE MUR — prise
 * sur place une minute plus tôt, pour se souvenir de la gaine qui en sort.
 * Les deux ne se sont jamais rencontrées : on ouvrait la photo en grand, on
 * la refermait, et on replaçait sa prise de mémoire.
 *
 * Elle se pose maintenant dans le rectangle EXACT du mur, derrière le dessin,
 * et un rideau qu'on tire découvre l'un ou l'autre : à gauche ce qui existe,
 * à droite ce qu'on projette.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS DÉCISIONS QUI TIENNENT TOUT LE FICHIER.
 *
 * 1. LA PHOTO EST UN REPÈRE, PAS UNE COTE, et l'établi le dit en toutes
 *    lettres. Prise à main levée, de biais, elle ne mesure rien. La caler
 *    automatiquement demanderait de redresser la perspective — et une photo
 *    mal redressée est PIRE qu'une photo brute : on y placerait des prises au
 *    mauvais endroit en croyant mesurer.
 *
 * 2. ELLE NE PREND JAMAIS LE DOIGT, sauf en mode calage. L'établi sert à
 *    poser des appareils ; un calque qui intercepte les touchers casserait le
 *    geste principal pour un confort d'appoint.
 *
 * 3. LE RIDEAU EST LE SEUL RÉGLAGE VISIBLE. Un curseur d'opacité, une
 *    bascule, un choix de photo et un mode calage feraient quatre commandes
 *    pour un calque. On tire le rideau, et c'est tout ; le calage se range
 *    dans la rangée d'outils, là où il ne gêne personne.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX MORCEAUX, ET C'EST L'EMPILEMENT QUI L'EXIGE.
 *
 * La photo doit être SOUS le dessin — sans quoi elle cacherait les prises
 * qu'on est venu poser — et sa poignée AU-DESSUS, sans quoi on ne pourrait
 * pas l'attraper. Deux enfants d'un même parent s'empilent dans leur ordre
 * d'écriture : le calque se monte donc en DEUX fois, de part et d'autre du
 * dessin, plutôt que de faire dépendre l'affichage d'un `zIndex` négatif —
 * qui marche, jusqu'au jour où quelqu'un ajoute un troisième calque.
 */
import React from 'react';
import { Image, PanResponder, Text, View } from 'react-native';
import { useTheme } from '../theme';
import {
  bornerCalage,
  bornerRideau,
  cadreDeLaPhoto,
  type Calage,
} from '../ui/calage';
import { haptic } from '../ui/haptic';

/** Ce que le calque a besoin de savoir du mur, en points d'écran. */
export interface CadreMur {
  left: number;
  top: number;
  w: number;
  h: number;
}

/**
 * LE FOND : la photo elle-même, rognée par le rideau.
 *
 * Elle ne prend JAMAIS le doigt — pas même en calage : c'est la poignée, qui
 * est au-dessus du dessin, qui reçoit le geste et le lui rapporte.
 */
export function CalquePhotoFond({
  cadre,
  uri,
  calage,
  rideau,
}: {
  cadre: CadreMur;
  uri: string;
  calage: Calage | undefined;
  /** 0 = le mur nu, 1 = la photo entière. */
  rideau: number;
}) {
  /*
    LES CÔTES DE L'IMAGE arrivent une image plus tard : `onLoad` les rend
    quand le système a lu le fichier. En attendant, la photo occupe le
    rectangle du mur — elle apparaît d'un coup, à la bonne place, au lieu de
    sauter d'une taille à l'autre sous les yeux.
  */
  const [taille, setTaille] = React.useState<{ w: number; h: number } | null>(
    null,
  );
  React.useEffect(() => setTaille(null), [uri]);

  const place = cadreDeLaPhoto({ w: cadre.w, h: cadre.h }, taille, calage);
  const decouvert = cadre.w * bornerRideau(rideau);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cadre.left,
        top: cadre.top,
        width: cadre.w,
        height: cadre.h,
        overflow: 'hidden',
      }}>
      <View style={{ width: decouvert, height: cadre.h, overflow: 'hidden' }}>
        <Image
          source={{ uri }}
          onLoad={(e) => {
            const s = e.nativeEvent?.source;
            if (s?.width && s?.height) setTaille({ w: s.width, h: s.height });
          }}
          style={{
            position: 'absolute',
            left: place.x,
            top: place.y,
            width: place.w,
            height: place.h,
          }}
          /*
            « stretch » et non « cover » : le cadre est DÉJÀ calculé aux
            bonnes proportions (`cadreDeLaPhoto` couvre en gardant le
            rapport). Laisser l'image se recadrer elle-même ajouterait un
            second recadrage par-dessus le premier, et le calage au doigt ne
            correspondrait plus à ce qu'on voit.
          */
          resizeMode="stretch"
        />
      </View>
    </View>
  );
}

/**
 * LA POIGNÉE — le rideau qu'on tire, et le calage quand on le demande.
 *
 * Elle vit AU-DESSUS du dessin, sinon on ne pourrait pas l'attraper.
 */
export function CalquePhotoPoignee({
  cadre,
  calage,
  onCalage,
  rideau,
  onRideau,
  calant,
}: {
  cadre: CadreMur;
  calage: Calage | undefined;
  onCalage: (c: Calage) => void;
  rideau: number;
  onRideau: (v: number) => void;
  /** En calage, le doigt déplace la PHOTO et non les appareils. */
  calant: boolean;
}) {
  const c = useTheme();
  const vif = React.useRef({ calage, cadre, rideau });
  vif.current = { calage, cadre, rideau };

  /*
    LE CALAGE AU DOIGT — un déplacement, et un pincement.

    L'écart entre deux doigts se lit dans `touches` et non dans l'état de
    geste : la maison sait que `PanResponder` recalcule le sien depuis
    l'historique des touchers, où l'écartement ne figure pas.
  */
  const depart = React.useRef({ dx: 0, dy: 0, k: 1, ecart: 0 });
  const panCalage = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const base = bornerCalage(vif.current.calage);
          const t = e.nativeEvent.touches ?? [];
          depart.current = {
            ...base,
            ecart:
              t.length >= 2
                ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY)
                : 0,
          };
          haptic('accroche');
        },
        onPanResponderMove: (e, g) => {
          const m = vif.current.cadre;
          const t = e.nativeEvent.touches ?? [];
          if (t.length >= 2 && depart.current.ecart > 8) {
            const ecart = Math.hypot(
              t[0].pageX - t[1].pageX,
              t[0].pageY - t[1].pageY,
            );
            onCalage(
              bornerCalage({
                dx: depart.current.dx,
                dy: depart.current.dy,
                k: depart.current.k * (ecart / depart.current.ecart),
              }),
            );
            return;
          }
          onCalage(
            bornerCalage({
              dx: depart.current.dx + (m.w > 0 ? g.dx / m.w : 0),
              dy: depart.current.dy + (m.h > 0 ? g.dy / m.h : 0),
              k: depart.current.k,
            }),
          );
        },
      }),
    [onCalage],
  );

  const departRideau = React.useRef(0);
  const panRideau = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          departRideau.current = vif.current.rideau;
          haptic('accroche');
        },
        onPanResponderMove: (_e, g) => {
          const m = vif.current.cadre;
          if (m.w <= 0) return;
          onRideau(bornerRideau(departRideau.current + g.dx / m.w));
        },
      }),
    [onRideau],
  );

  const decouvert = cadre.w * bornerRideau(rideau);

  return (
    <>
      {/* En calage, tout le mur reçoit le geste : c'est la photo qu'on
          déplace, et elle fait la taille du mur. */}
      {calant && (
        <View
          {...panCalage.panHandlers}
          accessibilityLabel="Caler la photo sur le mur"
          style={{
            position: 'absolute',
            left: cadre.left,
            top: cadre.top,
            width: cadre.w,
            height: cadre.h,
            borderWidth: 2,
            borderColor: c.blue,
            borderRadius: 4,
          }}
        />
      )}
      <View
        {...panRideau.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Rideau de la photo"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(rideau * 100) }}
        /* Quarante-quatre points de préhension pour un trait de deux : un
           filet ne se vise pas au pouce. */
        style={{
          position: 'absolute',
          left: cadre.left + decouvert - 22,
          top: cadre.top,
          width: 44,
          height: cadre.h,
          alignItems: 'center',
        }}>
        <View style={{ width: 2, flex: 1, backgroundColor: c.blue, opacity: 0.9 }} />
        <View
          style={{
            position: 'absolute',
            top: cadre.h / 2 - 15,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: c.surface,
            borderWidth: 2,
            borderColor: c.blue,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ color: c.blue, fontSize: 13, fontWeight: '900' }}>
            ↔
          </Text>
        </View>
      </View>
    </>
  );
}
