/**
 * DÉCORER — les murs, le sol et les meubles d'une pièce, au même endroit.
 *
 * Relevé du patron : « je ne vois pas la possibilité de changer la couleur
 * des meubles ou du sol ». Elle existait, mais en trois endroits cachés du
 * mode édition, sur le PLAN : la barre d'une pièce (« Peindre »), celle d'un
 * mur, celle d'un meuble. Or c'est en 3D qu'on voit ce qu'on change. La
 * maquette porte donc un bouton « Décorer », et cette feuille tient tout :
 * la pièce, puis ses murs, son sol, et chacun de ses meubles. Un appui
 * s'applique aussitôt — la maquette, au-dessus, se repeint sous les yeux.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ObjectData } from 'react-native-room-scan';
import { SheetShell } from './Sheet';
import { haptic } from '../ui/haptic';
import { SOLAIRES } from '../ui/solaires';
import { COULEUR_PERSONNALISEE, PEINTURES, estCouleurLibre, hexDePeinture, type Peinture } from '../ui/peintures';
import { SOLS, SOL_DEFAUT, TEINTES_MEUBLES, TEINTE_ORIGINE, cleDeTeinte, hexDeTeinte } from '../ui/habillage';
import { lireHex } from '../ui/couleurLibre';
import { NuancierLibre } from './NuancierLibre';
import { VignetteMeuble } from './VignetteMeuble';
import { nomDuMeuble } from '../geometry/furniture';
import { useScanStore } from '../store/scanStore';
import { niveauDe, nomDuNiveau, roomParts } from '../geometry/floorplan';
import { achats, nombre, travauxDesPieces } from '../geometry/travaux';
import { useReglagesTravaux } from '../store/reglagesTravaux';
import { useImageSansLogo } from '../store/accountStore';
import { RAPPORT, usePriseDeVue, type FormatImage } from '../ui/partageRendu';
import { alerte } from '../ui/alerte';
import { DEFAULT_VIEW3D, Iso3DView, type View3DParams } from './Iso3DView';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

/** Une teinte foncée : la coche s'y pose en blanc. */
const sombre = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  if (!isFinite(v)) return false;
  return 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255) < 140;
};

/** Le nom d'un meuble : voir `geometry/furniture`. */
export { nomDuMeuble };

/*
  LA PIÈCE TOURNE SOUS LES YEUX — relevé du patron : « améliore cette option
  décorer pour voir en temps réel les changements avec une vue 3D
  tournante ». La maquette elle-même, réduite à la pièce qu'on décore
  (`focusRoomId`), qui tourne d'un tour lent ; un doigt la reprend, et elle
  repart seule deux secondes et demie après. Elle vit à part : vingt images
  par seconde n'ont pas à redessiner tout le nuancier.

  ET ELLE SE TAIT QUAND ON CHOISIT — relevé du patron : « le scroll des
  éléments est trop capricieux ». Vingt images par seconde de maquette
  occupaient le fil de l'application pendant qu'on faisait défiler les
  teintes : le doigt accrochait. Un toucher dans la liste l'arrête, comme
  un toucher sur elle (`repos`).

  LES MURS DE DEVANT S'EFFACENT — « les murs avant sont gênants » : la
  maquette est en écorché, quoi qu'on ait réglé ailleurs, et cadrée plus
  serré (« modèle trop petit »).
*/
/*
  AU TEMPS, PLUS À LA MINUTERIE — revue de lisibilité : un `setInterval` de
  50 ms avançait d'un pas FIXE ; le fil occupé, les pas se perdaient et la
  pièce saccadait. Elle tourne maintenant à l'image (`requestAnimationFrame`)
  d'un angle proportionnel au temps écoulé — 24° par seconde, le même tour
  lent qu'avant —, et ne se redessine qu'une fois le vingtième de seconde
  passé : le coût de la maquette reste celui qu'il était (voir plus haut).
  Et « Réduire les animations » l'arrête tout à fait : on la tourne au doigt.
*/
export const DEGRES_PAR_SECONDE = 24;
const IMAGE_MIN = 50;
const REPOS_APRES_LE_DOIGT = 2500;
const ZOOM_DECOR = 1.3;
/*
  LA PHOTO, SOUS UN BEL ANGLE — revue « découvreurs » (influenceuse déco) :
  une image partagée ne se prend pas au hasard du tour. Le temps de la
  capture, la pièce s'arrête de tourner et se pose de trois quarts, à
  l'angle par défaut de la maquette, recentrée ; elle repart ensuite d'où
  elle était.
*/
export const VUE_PHOTO: View3DParams = { ...DEFAULT_VIEW3D, tilt: 50, zoom: ZOOM_DECOR };

/** « Réduire les animations », lu au système et suivi s'il change. */
function useMoinsDeMouvement(): boolean {
  const [moins, setMoins] = useState(false);
  useEffect(() => {
    let vivant = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => vivant && setMoins(!!v))
      .catch(() => {});
    const abo = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setMoins(!!v));
    return () => {
      vivant = false;
      abo?.remove?.();
    };
  }, []);
  return moins;
}

function PieceTournante({
  pieceId,
  niveau,
  repos,
  photo = false,
}: {
  pieceId: string | null;
  niveau?: number;
  /** L'instant du dernier toucher, sur la maquette ou dans la liste. */
  repos: React.MutableRefObject<number>;
  /** Une photo se prend : l'angle de `VUE_PHOTO`, et le rendu que la capture sait lire. */
  photo?: boolean;
}) {
  const [vue, setVue] = useState<View3DParams>({ ...DEFAULT_VIEW3D, tilt: 50, zoom: ZOOM_DECOR });
  const moinsDeMouvement = useMoinsDeMouvement();
  const enPhoto = useRef(photo);
  enPhoto.current = photo;
  useEffect(() => {
    if (moinsDeMouvement) return;
    let id = 0;
    let avant = Date.now();
    let cumul = 0;
    const image = () => {
      const maintenant = Date.now();
      // Une application revenue du fond ne fait pas un tour d'un coup.
      const dt = Math.min(maintenant - avant, 250);
      avant = maintenant;
      if (enPhoto.current || maintenant - repos.current < REPOS_APRES_LE_DOIGT) {
        cumul = 0;
      } else {
        cumul += dt;
        if (cumul >= IMAGE_MIN) {
          const pas = (DEGRES_PAR_SECONDE * cumul) / 1000;
          cumul = 0;
          setVue((v) => ({ ...v, theta: (v.theta + pas) % 360 }));
        }
      }
      id = requestAnimationFrame(image);
    };
    id = requestAnimationFrame(image);
    return () => cancelAnimationFrame(id);
  }, [repos, moinsDeMouvement]);
  return (
    <Iso3DView
      value={photo ? VUE_PHOTO : vue}
      onChange={(v) => {
        if (enPhoto.current) return;
        repos.current = Date.now();
        setVue(v);
      }}
      // La vue native (Metal) sort noire d'une capture : le rendu en
      // JavaScript la remplace le temps de la photo, comme sur le plan.
      gpu={!photo}
      focusRoomId={pieceId}
      niveau={niveau}
      showMeasures={false}
      showNorth={false}
      decor
      cutaway
    />
  );
}

type Onglet = 'ambiances' | 'murs' | 'sol' | 'meubles';

/*
  « D'ORIGINE » N'EST PAS « BLANC CASSÉ » — revue « Inès » : le blanc se
  rangeait comme « aucune peinture », et sur un plan scanné le mur gardait
  la couleur relevée ; « Scandinave » laissait des murs verts. Le blanc
  s'enregistre désormais pour lui-même, et « D'origine » a sa pastille.
*/
const ORIGINE = 'origine';
const MUR_RELEVE = { cle: ORIGINE, nom: 'D’origine', hex: '#E6E9EE' };
/** Une coche se lit sur la teinte, quel que soit le thème. */
const COCHE_CLAIRE = '#0B0D12';
const nbsp = (texte: string) => texte.replace(/ :/g, '\u00A0:');

/*
  LES AMBIANCES, EN UN APPUI — relevé du patron : « trop compliqué pour
  choisir… fais une refonte intelligente, plus ludique et moderne ». Une
  ambiance pose ensemble les murs et le sol qui vont ensemble ; on part
  d'elle, puis on retouche. « D'origine » rend la pièce telle que relevée.
*/
export const AMBIANCES: { cle: string; nom: string; peinture: string; sol: string }[] = [
  { cle: 'scandinave', nom: 'Scandinave', peinture: 'blanc', sol: 'blanchi' },
  { cle: 'nature', nom: 'Nature', peinture: 'sauge', sol: 'chene' },
  { cle: 'douceur', nom: 'Douceur', peinture: 'lin', sol: 'blanchi' },
  { cle: 'terre', nom: 'Terre cuite', peinture: 'terracotta', sol: 'ciment' },
  { cle: 'mer', nom: 'Bord de mer', peinture: 'bleuGris', sol: 'carrelage' },
  { cle: 'mineral', nom: 'Minéral', peinture: 'perle', sol: 'beton' },
  { cle: 'chic', nom: 'Chic', peinture: 'anthracite', sol: 'noyer' },
  { cle: 'origine', nom: 'D’origine', peinture: ORIGINE, sol: SOL_DEFAUT },
];

// Une clé du nuancier, ou une couleur libre (`#RRGGBB`) : `hexDePeinture` lit les deux.
const hexPeinture = (cle: string) => hexDePeinture(cle) ?? MUR_RELEVE.hex;
const hexSol = (cle: string, teinteLibre?: string) =>
  lireHex(teinteLibre) ?? SOLS.find((p) => p.cle === cle)?.hex ?? '#D9CBB4';

/*
  « AUTRE COULEUR… » — relevé du patron : « donne la possibilité de choisir
  beaucoup de couleurs pour meubles, murs, sols, dans une palette de
  sélection RGB ». La dernière pastille de chaque nuancier ouvre le
  sélecteur (`NuancierLibre`), posé sur la couleur du moment ; les teintes
  du nuancier restent devant, en raccourcis.
*/
/** La clé qu'aucune pastille du nuancier ne porte : la couleur est libre. */
const PRISE_LIBRE = '#libre';
/** Les six quartiers de l'arc-en-ciel de la pastille « Autre couleur… ». */
const ARC_EN_CIEL = ['#FF4D4D', '#FFB23F', '#F5E663', '#4CD07D', '#3E8BFF', '#A35BFF'];
const quartier = (i: number, n: number) => {
  const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
  const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
  const p = (a: number) => `${(12 + 12 * Math.cos(a)).toFixed(3)} ${(12 + 12 * Math.sin(a)).toFixed(3)}`;
  return `M12 12 L${p(a0)} A12 12 0 0 1 ${p(a1)} Z`;
};

/** La taille des vignettes de meuble, en points : dans la carte, et en grand. */
export const VIGNETTE_CARTE = { largeur: 92, hauteur: 54 };
export const VIGNETTE_GRANDE = { largeur: 168, hauteur: 104 };

export function DecorSheet({
  visible,
  onClose,
  pieceInitiale,
  onAchats,
}: {
  visible: boolean;
  onClose: () => void;
  /** Ouvre « Ce qu'il faut acheter » : les pots de la teinte choisie. */
  onAchats?: () => void;
  /** La pièce à décorer d'abord : celle qu'on regarde, ou la première. */
  pieceInitiale?: string | null;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const rooms = useScanStore((st) => st.rooms);
  const objects = useScanStore((st) => st.objects);
  const canUndo = useScanStore((st) => st.canUndo);
  // « Annuler » ne défait que ce qu'on a changé ici (revue « Inès » : il
  // pouvait défaire une retouche du plan faite avant d'ouvrir la feuille).
  /*
    SUR PLUSIEURS NIVEAUX, CHAQUE PIÈCE DIT LE SIEN — correctif de l'audit :
    deux « Chambre » ne se distinguaient pas, et l'aperçu restait celui du
    niveau affiché. Les pièces se rangent par niveau, du rez-de-chaussée en
    montant, puis les sous-sols.
  */
  const plusieursNiveaux = new Set(rooms.map((r) => niveauDe(r))).size > 1;
  const nommees = useMemo(
    () =>
      plusieursNiveaux
        ? [...rooms].sort((a, b) => {
            const rang = (n: number) => (n >= 0 ? n : 100 - n);
            return rang(niveauDe(a)) - rang(niveauDe(b));
          })
        : rooms,
    [rooms, plusieursNiveaux],
  );
  const nomDeLaPiece = (r: (typeof rooms)[number], _i: number) => {
    // Le même numéro que sur le plan, pas celui du tri par niveau.
    const nom = r.name || `Pièce ${rooms.indexOf(r) + 1}`;
    return plusieursNiveaux ? `${nom} · ${nomDuNiveau(niveauDe(r))}` : nom;
  };
  const [pieceId, setPieceId] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('murs');
  const [partout, setPartout] = useState(false);
  /** Les changements faits depuis l'ouverture : « Annuler » ne défait qu'eux. */
  const [faits, setFaits] = useState(0);
  const peutAnnuler = canUndo && faits > 0;
  /*
    LA PIÈCE CHOISIE NE SE PERD PLUS — relevé du patron : « lorsqu'on change
    de pièce, on revient à la première pièce si on change de couleur ». Elle
    ne se reprend qu'à l'ouverture de la feuille.
  */
  const etaitVisible = useRef(false);
  useEffect(() => {
    if (visible && !etaitVisible.current) {
      setPieceId(pieceInitiale ?? nommees[0]?.id ?? null);
      // Chaque ouverture repart des murs, sur la pièce seule (revue « Inès » :
      // « Tout le logement » restait armé d'une fois sur l'autre).
      setOnglet('murs');
      setPartout(false);
      setFaits(0);
    }
    etaitVisible.current = visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const piece = nommees.find((r) => r.id === pieceId) ?? nommees[0] ?? null;
  /*
    LES TAPIS SE DÉCORENT AUSSI — revue « Yasmine » : ils n'étaient pas dans
    la liste, alors que la 3D sait les teindre (`tapis`, dans `modeles3d`).
  */
  const meubles = useMemo(
    () => (piece ? objects.filter((o) => o.roomId === piece.id) : []),
    [objects, piece],
  );
  // « Chaise 1 », « Chaise 2 » : deux meubles du même nom se distinguent.
  const nomsDesMeubles = useMemo(() => {
    const total = new Map<string, number>();
    for (const o of meubles) total.set(nomDuMeuble(o), (total.get(nomDuMeuble(o)) ?? 0) + 1);
    const vu = new Map<string, number>();
    return new Map(
      meubles.map((o) => {
        const nom = nomDuMeuble(o);
        if ((total.get(nom) ?? 0) < 2) return [o.id, nom];
        const k = (vu.get(nom) ?? 0) + 1;
        vu.set(nom, k);
        return [o.id, `${nom} ${k}`];
      }),
    );
  }, [meubles]);

  const st = useScanStore.getState;
  const { height: hauteurEcran } = useWindowDimensions();
  // L'aperçu prend un bon quart de l'écran : on décore ce qu'on voit, et
  // tout le reste tient en dessous sans se marcher dessus.
  const hauteurApercu = Math.round(
    hauteurEcran < 700 ? Math.max(150, hauteurEcran * 0.22) : Math.min(320, Math.max(180, hauteurEcran * 0.29)),
  );
  const repos = useRef(0);
  /*
    PARTAGER LA PIÈCE DÉCORÉE — revue « découvreurs » : « la vue de la pièce
    dans Décorer est la plus belle image de l'app, et elle ne peut pas
    sortir ». La mécanique de l'image du plan (`usePriseDeVue`) : un cadre
    carré par défaut (les réseaux), 4:3 à l'appui long (une annonce), un fond
    propre, la pièce et son ambiance en légende, le logo sur l'image
    gratuite — pas de barrière : c'est une signature.
  */
  const estPro = useImageSansLogo();
  const { capturant, prete, prendre } = usePriseDeVue();
  const cadre = useRef<View>(null);
  const largeurApercu = useRef(0);
  const partager = (format: FormatImage) => {
    if (!piece) return;
    prendre(cadre, format, () => {
      const w = largeurApercu.current;
      return w > 0 ? { w, h: w / RAPPORT[format] } : null;
    });
  };
  const choisirFormat = () => {
    if (!piece) return;
    haptic('leger');
    alerte('Format de l’image', undefined, [
      { label: 'Carré · réseaux sociaux', onPress: () => partager('carre') },
      { label: 'Paysage 4:3 · annonce', onPress: () => partager('paysage') },
    ]);
  };
  const [meubleId, setMeubleId] = useState<string | null>(null);
  /** Le sélecteur libre ouvert, et pour quoi. */
  const [libre, setLibre] = useState<Onglet | null>(null);
  /** Un doigt dans le sélecteur : la liste ne défile pas sous lui. */
  const [geste, setGeste] = useState(false);
  const corps = useRef<ScrollView>(null);
  const versLeSelecteur = useRef(false);
  // Une autre pièce : on repart des murs, sans meuble choisi.
  useEffect(() => {
    setOnglet((o) => (o === 'ambiances' ? o : 'murs'));
    setMeubleId(null);
  }, [piece?.id]);
  // Un autre onglet, un autre meuble, une autre pièce : le sélecteur se referme.
  useEffect(() => {
    setLibre(null);
    setGeste(false);
  }, [onglet, meubleId, piece?.id, visible]);
  const meuble = meubles.find((o) => o.id === meubleId) ?? meubles[0] ?? null;
  const peinture = piece
    ? piece.peinture
      ? estCouleurLibre(piece.peinture)
        ? { cle: piece.peinture, nom: COULEUR_PERSONNALISEE, hex: piece.peinture }
        : PEINTURES.find((p) => p.cle === piece.peinture) ?? { cle: piece.peinture, nom: 'Teinte inconnue', hex: MUR_RELEVE.hex }
      : MUR_RELEVE
    : undefined;
  const solDuNuancier = piece
    ? SOLS.find((p) => p.cle === (piece.sol ?? SOL_DEFAUT)) ?? { cle: piece.sol ?? '', nom: 'Sol inconnu', hex: '#D9CBB4', motif: null }
    : undefined;
  /*
    LA TEINTE LIBRE DU SOL garde sa matière : « Chêne clair, teinte libre »
    reste un parquet, repeint.
  */
  const solLibre = lireHex(piece?.solTeinte);
  const sol =
    solDuNuancier && solLibre
      ? {
          ...solDuNuancier,
          hex: solLibre,
          nom: solDuNuancier.cle === SOL_DEFAUT ? COULEUR_PERSONNALISEE : `${solDuNuancier.nom}, teinte libre`,
        }
      : solDuNuancier;
  /*
    UNE TEINTE HORS NUANCIER SE DIT — revue « Hugo » : « D’origine » se
    cochait sur un meuble peint d'une couleur que le nuancier ne connaît pas.
  */
  const pastilleDe = (o: ObjectData) => {
    if (o.teinte && !TEINTES_MEUBLES.some((t) => t.hex.toLowerCase() === o.teinte!.toLowerCase())) {
      return { cle: PRISE_LIBRE, nom: COULEUR_PERSONNALISEE, hex: o.teinte };
    }
    return TEINTES_MEUBLES.find((p) => p.cle === (o.teinte ? cleDeTeinte(o.teinte) : TEINTE_ORIGINE));
  };

  /** Un changement compté seulement s'il change quelque chose. */
  const compter = (fait: () => void) => {
    const avant = st().rooms;
    const avantMeubles = st().objects;
    fait();
    if (st().rooms !== avant || st().objects !== avantMeubles) setFaits((n) => n + 1);
  };
  /*
    « TOUT LE LOGEMENT » VAUT AUSSI POUR LES MURS ET LE SOL — et pour une
    couleur libre : la même teinte partout, en UN geste qu'« Annuler » défait.
  */
  const visees = (roomId: string) => (partout ? nommees.map((r) => r.id) : [roomId]);
  const peindre = (roomId: string, cle: string) =>
    compter(() => st().setPeintureDesPieces(visees(roomId), cle === ORIGINE ? null : cle));
  const poserSol = (roomId: string, cle: string) =>
    compter(() => st().setSolDesPieces(visees(roomId), cle === SOL_DEFAUT ? null : cle));
  const teinterSol = (roomId: string, hex: string) => compter(() => st().setSolTeinteDesPieces(visees(roomId), hex));
  /** L'ambiance, sur la pièce — ou sur tout le logement. */
  const appliquer = (a: { peinture: string; sol: string }) => {
    if (!piece) return;
    haptic('succes');
    compter(() =>
      st().appliquerAmbiance(
        (partout ? nommees : [piece]).map((r) => r.id),
        a.peinture === ORIGINE ? null : a.peinture,
        a.sol === SOL_DEFAUT ? null : a.sol,
      ),
    );
  };
  /** Le hasard : une teinte de mur et un sol qui ne sont pas ceux d'avant. */
  const surprise = () => {
    if (!piece) return;
    const murs = PEINTURES.filter((p) => p.cle !== (piece.peinture ?? ORIGINE));
    const sols = SOLS.filter((p) => p.cle !== SOL_DEFAUT && p.cle !== (piece.sol ?? SOL_DEFAUT));
    appliquer({
      peinture: murs[Math.floor(Math.random() * murs.length)].cle,
      sol: sols[Math.floor(Math.random() * sols.length)].cle,
    });
  };
  /*
    LES POTS, LÀ OÙ L'ON CHOISIT LA TEINTE — revue de lisibilité : la
    quantité vivait derrière « Voir ma liste d'achats », sous treize
    pastilles, hors de l'écran. Elle se lit en tête de l'onglet Murs dès
    qu'une teinte est posée — le calcul de la liste d'achats (`travaux`),
    pas un second : mêmes murs nets, mêmes couches, même pot.
  */
  const walls = useScanStore((st) => st.walls);
  const openings = useScanStore((st) => st.openings);
  const hypotheses = useReglagesTravaux((r) => r.hypotheses);
  const teintePosee = piece?.peinture && piece.peinture !== ORIGINE ? piece.peinture : null;
  const potsDeLaPiece = useMemo(() => {
    if (!piece || !teintePosee) return null;
    const n = niveauDe(piece);
    const part = roomParts(
      walls.filter((w) => niveauDe(w) === n),
      rooms.filter((r) => niveauDe(r) === n),
    ).find((p) => p.roomId === piece.id);
    if (!part) return null;
    const pieces = travauxDesPieces(
      [part],
      openings.filter((o) => niveauDe(o) === n),
      () => piece.name || 'Pièce',
      (id) => rooms.find((r) => r.id === id),
    );
    const a = achats(pieces, hypotheses);
    const pots = a.murs.parTeinte?.find((x) => x.cle === teintePosee)?.pots ?? 0;
    return pots > 0 ? { pots, pot: hypotheses.pot } : null;
  }, [piece, teintePosee, walls, openings, rooms, hypotheses]);
  const ambianceActuelle = piece
    ? AMBIANCES.find(
        (a) => !piece.solTeinte && a.peinture === (piece.peinture ?? ORIGINE) && a.sol === (piece.sol ?? SOL_DEFAUT),
      )
    : undefined;

  /** Une grille de pastilles : la coche sur celle qui est prise, qui grossit. */
  const nuancier = (
    liste: (Peinture & { motif?: 'parquet' | 'carrelage' | null })[],
    prise: string,
    dire: (p: Peinture) => string,
    choisir: (cle: string) => void,
    taille = 46,
    autre?: { hex: string; actif: boolean; quoi: string; ouvert: boolean; ouvrir: () => void },
  ) => (
    <View style={s.nuancier}>
      {liste.map((p) => {
        const on = p.cle === prise;
        /*
          LE NOM SOUS LE ROND — revue « Chloé » : sept blancs et beiges
          indiscernables sur fond blanc, et rien pour dire « vert sauge et
          chêne clair » à quelqu'un.
        */
        return (
          <View key={p.cle} style={s.teinte}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dire(p)}
              accessibilityState={{ selected: on }}
              hitSlop={4}
              onPress={() => {
                haptic('leger');
                choisir(p.cle);
              }}
              style={({ pressed }) => [
                s.pastille,
                { width: taille, height: taille, borderRadius: taille / 2, backgroundColor: p.hex },
                on && { borderColor: c.blue, borderWidth: 3, transform: [{ scale: 1.08 }] },
                pressed && { transform: [{ scale: 0.92 }] },
              ]}>
              {p.motif ? (
                <Svg width={taille} height={taille} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
                  {p.motif === 'parquet'
                    ? [6, 12, 18].map((y) => <Path key={y} d={`M0 ${y} H24`} stroke="#00000026" strokeWidth={0.8} />)
                    : [8, 16].flatMap((k) => [
                        <Path key={`h${k}`} d={`M0 ${k} H24`} stroke="#FFFFFF99" strokeWidth={0.9} />,
                        <Path key={`v${k}`} d={`M${k} 0 V24`} stroke="#FFFFFF99" strokeWidth={0.9} />,
                      ])}
                </Svg>
              ) : null}
              {on && (
                <Svg width={taille * 0.5} height={taille * 0.5} viewBox="0 0 24 24">
                  <Path
                    d={SOLAIRES.coche}
                    fill="none"
                    stroke={sombre(p.hex) ? '#FFFFFF' : COCHE_CLAIRE}
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              )}
            </Pressable>
            <Text style={[s.teinteNom, on && s.teinteNomPrise]} numberOfLines={2}>
              {p.nom}
            </Text>
          </View>
        );
      })}
      {autre ? (
        <View style={s.teinte}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${autre.quoi} : autre couleur…`}
            accessibilityHint="Ouvre le sélecteur de couleur RGB"
            accessibilityState={{ selected: autre.actif, expanded: autre.ouvert }}
            hitSlop={4}
            testID={`autre-couleur-${onglet}`}
            onPress={() => {
              haptic('leger');
              autre.ouvrir();
            }}
            style={({ pressed }) => [
              s.pastille,
              { width: taille, height: taille, borderRadius: taille / 2 },
              (autre.actif || autre.ouvert) && { borderColor: c.blue, borderWidth: 3, transform: [{ scale: 1.08 }] },
              pressed && { transform: [{ scale: 0.92 }] },
            ]}>
            {/* L'arc-en-ciel, et la couleur libre du moment au cœur. */}
            <Svg width={taille} height={taille} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
              {ARC_EN_CIEL.map((t, i) => (
                <Path key={t} d={quartier(i, ARC_EN_CIEL.length)} fill={t} />
              ))}
            </Svg>
            <View
              style={[
                s.autreCoeur,
                { width: taille * 0.5, height: taille * 0.5, borderRadius: taille * 0.25 },
                { backgroundColor: autre.actif ? autre.hex : c.surface },
              ]}>
              {autre.actif ? null : (
                <Svg width={taille * 0.3} height={taille * 0.3} viewBox="0 0 24 24">
                  <Path d="M12 5v14M5 12h14" stroke={c.ink} strokeWidth={3} strokeLinecap="round" />
                </Svg>
              )}
            </View>
          </Pressable>
          <Text style={[s.teinteNom, autre.actif && s.teinteNomPrise]} numberOfLines={2}>
            {autre.actif ? autre.hex.toUpperCase() : 'Autre couleur…'}
          </Text>
        </View>
      ) : null}
    </View>
  );

  /** Ouvre (ou referme) le sélecteur libre de l'onglet, et y fait défiler la liste. */
  const basculerLibre = (quoi: Onglet) => {
    setLibre((l) => {
      const ouvre = l !== quoi;
      versLeSelecteur.current = ouvre;
      return ouvre ? quoi : null;
    });
  };
  /** Le sélecteur libre, sous le nuancier de l'onglet. */
  const selecteur = (titre: string, initiale: string, appliquerTel: (hex: string) => void) => {
    /*
      LA MÊME COULEUR NE CHANGE RIEN — ouvrir le sélecteur sur « Vert sauge »
      et valider sans y toucher ne doit pas changer la clé du nuancier en
      couleur libre (ni compter un geste). Sauf sur « Tout le logement » :
      c'est alors étendre la couleur aux autres pièces.
    */
    const appliquer = (hex: string) => {
      if (!partout && hex.toUpperCase() === initiale.toUpperCase()) return;
      appliquerTel(hex);
    };
    return (
      <View
        key={`libre-${onglet}-${piece?.id ?? ''}-${meuble?.id ?? ''}`}
        onLayout={(e) => {
          if (!versLeSelecteur.current) return;
          versLeSelecteur.current = false;
          corps.current?.scrollTo?.({ y: Math.max(0, e.nativeEvent.layout.y - 8), animated: true });
        }}>
        <NuancierLibre
          titre={titre}
          initiale={initiale}
          onGeste={setGeste}
          onLacher={appliquer}
          onAppliquer={(hex) => {
            appliquer(hex);
            setLibre(null);
            setGeste(false);
          }}
          onFermer={() => {
            setLibre(null);
            setGeste(false);
          }}
          enTete={onglet !== 'meubles' ? portee() : null}
        />
      </View>
    );
  };

  /** « Cette pièce » / « Tout le logement » : là où l'on choisit une ambiance, une peinture, un sol. */
  const portee = () =>
    nommees.length > 1 ? (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Tout le logement"
        accessibilityState={{ checked: partout }}
        hitSlop={7}
        style={[s.portee, partout && s.porteeOn]}
        onPress={() => {
          haptic('leger');
          setPartout((v) => !v);
        }}>
        <Text style={[s.porteeTexte, partout && s.porteeTexteOn]}>
          {partout ? `Tout le logement · ${nommees.length} pièces` : 'Cette pièce'}
        </Text>
      </Pressable>
    ) : null;

  /*
    QUATRE TUILES, CE QU'ON CHANGE — la refonte. Les puces des pièces, les
    onglets et les nuanciers se chevauchaient dans la feuille (relevé du
    patron, capture à l'appui) : trois bandes souples se disputaient une
    hauteur fixe. Chaque bande a maintenant sa hauteur ; seule la liste du
    bas défile. Une tuile montre sa teinte du moment, en grand : on sait ce
    qui est pris avant d'ouvrir.
  */
  const tuile = (cle: Onglet, nom: string, valeur: string, visuel: React.ReactNode) => {
    const pris = onglet === cle;
    return (
      <Pressable
        key={cle}
        accessibilityRole="tab"
        accessibilityLabel={nom}
        accessibilityState={{ selected: pris }}
        style={({ pressed }) => [s.tuile, pris && s.tuilePrise, pressed && { transform: [{ scale: 0.96 }] }]}
        onPress={() => {
          haptic('leger');
          setOnglet(cle);
        }}>
        {visuel}
        <Text style={[s.tuileNom, pris && s.tuileNomPris]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {nom}
        </Text>
        <Text style={s.tuileValeur} numberOfLines={2}>
          {valeur}
        </Text>
      </Pressable>
    );
  };
  const rondTuile = (hex: string, motif?: 'parquet' | 'carrelage' | null, icone?: string) => (
    <View style={[s.tuileRond, { backgroundColor: hex }]}>
      {motif ? (
        <Svg width={30} height={30} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
          {motif === 'parquet'
            ? [6, 12, 18].map((y) => <Path key={y} d={`M0 ${y} H24`} stroke="#00000026" strokeWidth={0.8} />)
            : [8, 16].flatMap((k) => [
                <Path key={`h${k}`} d={`M0 ${k} H24`} stroke="#FFFFFF99" strokeWidth={0.9} />,
                <Path key={`v${k}`} d={`M${k} 0 V24`} stroke="#FFFFFF99" strokeWidth={0.9} />,
              ])}
        </Svg>
      ) : null}
      {icone ? (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d={icone} fill={sombre(hex) ? '#FFFFFF' : COCHE_CLAIRE} fillRule="evenodd" />
        </Svg>
      ) : null}
    </View>
  );

  return (
    <SheetShell visible={visible} onClose={onClose} defile={false}>
      <View style={s.tete} onTouchStart={() => (repos.current = Date.now())}>
        <Text style={s.titre}>Décorer</Text>
        {piece ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Partager une image de la pièce"
            accessibilityHint="Appui long pour choisir carré ou paysage 4:3"
            accessibilityActions={[{ name: 'longpress', label: 'Choisir le format' }]}
            onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && choisirFormat()}
            accessibilityState={{ busy: !!capturant }}
            hitSlop={8}
            style={({ pressed }) => [s.partager, pressed && { opacity: 0.6 }]}
            onPress={() => partager('carre')}
            onLongPress={choisirFormat}>
            <Svg width={17} height={17} viewBox="0 0 24 24">
              <Path d={SOLAIRES.partage} fill={c.ink} fillRule="evenodd" />
            </Svg>
          </Pressable>
        ) : null}
        {/* Annuler sans quitter : on ose essayer quand on peut revenir.
            Revue de lisibilité : une flèche seule, à 35 % quand rien n'est
            à défaire, ne se lisait pas. Le mot l'accompagne, et l'état
            éteint passe par la couleur (`inkFaint`, 4,5:1), pas l'opacité. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Annuler le dernier changement"
          accessibilityState={{ disabled: !peutAnnuler }}
          disabled={!peutAnnuler}
          hitSlop={8}
          style={({ pressed }) => [s.annuler, pressed && { opacity: 0.6 }]}
          onPress={() => {
            haptic('leger');
            st().undo();
            setFaits((n) => Math.max(0, n - 1));
          }}>
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path d={SOLAIRES.undo} fill={peutAnnuler ? c.ink : c.inkFaint} fillRule="evenodd" />
          </Svg>
          <Text style={[s.annulerMot, !peutAnnuler && s.annulerMotEteint]}>Annuler</Text>
        </Pressable>
      </View>

      {nommees.length === 0 ? (
        <Text style={s.vide}>Aucune pièce sur ce plan : dessinez vos pièces sur le plan pour les décorer.</Text>
      ) : (
        <>
          {/* LES PIÈCES, chacune avec ses deux couleurs du moment. */}
          {nommees.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.pucesBande}
              contentContainerStyle={s.puces}
              onTouchStart={() => (repos.current = Date.now())}>
              {nommees.map((r, i) => {
                const prise = r.id === piece?.id;
                return (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    accessibilityLabel={nomDeLaPiece(r, i)}
                    accessibilityState={{ selected: prise }}
                    style={[s.puce, prise && s.pucePrise]}
                    onPress={() => {
                      haptic('leger');
                      setPieceId(r.id);
                    }}>
                    <View style={s.puceTeintes}>
                      <View style={[s.puceTeinte, { backgroundColor: hexPeinture(r.peinture ?? ORIGINE) }]} />
                      <View style={[s.puceTeinte, s.puceTeinte2, { backgroundColor: hexSol(r.sol ?? SOL_DEFAUT, r.solTeinte) }]} />
                    </View>
                    <View style={s.puceMots}>
                      <Text style={[s.puceTexte, prise && s.puceTextePris]} numberOfLines={1}>
                        {r.name || `Pièce ${rooms.indexOf(r) + 1}`}
                      </Text>
                      {plusieursNiveaux ? (
                        <Text style={[s.puceNiveau, prise && s.puceTextePris]} numberOfLines={1}>
                          {nomDuNiveau(niveauDe(r))}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {visible && piece ? (
            <View
              style={[s.apercu, { height: hauteurApercu }, capturant && s.apercuPhoto]}
              onLayout={(e) => (largeurApercu.current = e.nativeEvent.layout.width)}
              // Un doigt posé, même immobile, arrête le tour (revue « Hugo »).
              onTouchStart={() => (repos.current = Date.now())}
              onTouchMove={() => (repos.current = Date.now())}>
              {/*
                LE CADRE DE LA PHOTO — le même arbre que l'aperçu, pour que la
                maquette ne se remonte pas : il prend, le temps de la capture,
                la forme de l'image (carré ou 4:3, sur toute la largeur) et
                passe par-dessus les tuiles. Rien d'autre n'y entre : ni la
                pastille d'ambiance, ni les boutons.
              */}
              <View
                ref={cadre}
                collapsable={false}
                testID="cadre-photo-decor"
                style={
                  capturant
                    ? [
                        s.cadrePhoto,
                        largeurApercu.current > 0
                          ? { height: largeurApercu.current / RAPPORT[capturant] }
                          : { aspectRatio: RAPPORT[capturant] },
                      ]
                    : StyleSheet.absoluteFill
                }>
                <PieceTournante pieceId={piece.id} niveau={niveauDe(piece)} repos={repos} photo={!!capturant} />
                {!capturant && ambianceActuelle && ambianceActuelle.cle !== 'origine' ? (
                  <View style={s.badgeAmbiance} pointerEvents="none">
                    <Text style={s.badgeAmbianceTexte}>{ambianceActuelle.nom}</Text>
                  </View>
                ) : null}
                {capturant ? (
                  <View style={s.legendePhoto} pointerEvents="none">
                    <Text style={s.legendePhotoPiece} numberOfLines={1}>
                      {piece.name || `Pièce ${rooms.indexOf(piece) + 1}`}
                    </Text>
                    {ambianceActuelle && ambianceActuelle.cle !== 'origine' ? (
                      <Text style={s.legendePhotoAmbiance} numberOfLines={1}>
                        {`Ambiance ${ambianceActuelle.nom}`}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {/* Le logo signe l'image gratuite, pas celle du Pro (revue « Inès »). */}
                {capturant && !estPro ? (
                  <View style={s.logoPhoto} pointerEvents="none" testID="logo-photo-decor">
                    <Image source={require('../assets/echoplan.png')} style={s.logoPhotoImage} resizeMode="contain" />
                  </View>
                ) : null}
              </View>
              {prete && !capturant ? (
                <View style={s.prete} pointerEvents="none" testID="image-prete" accessibilityLiveRegion="polite">
                  <Svg width={14} height={14} viewBox="0 0 24 24">
                    <Path d={SOLAIRES.coche} fill="none" stroke={c.blue} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                  <Text style={s.preteTexte}>Image prête</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {piece && (
            <View style={s.tuiles} accessibilityRole="tablist" onTouchStart={() => (repos.current = Date.now())}>
              {tuile('ambiances', 'Ambiance', ambianceActuelle?.nom ?? 'Libre', rondTuile(c.blueSoft, null, SOLAIRES.baguette))}
              {tuile('murs', 'Murs', peinture?.nom ?? '', rondTuile(peinture?.hex ?? '#FFFFFF'))}
              {tuile('sol', 'Sol', sol?.nom ?? '', rondTuile(sol?.hex ?? '#D9CBB4', sol?.motif))}
              {tuile(
                'meubles',
                'Meubles',
                meubles.length > 0 ? `${meubles.length} meuble${meubles.length > 1 ? 's' : ''}` : 'Aucun',
                rondTuile(c.surfaceSunken, null, SOLAIRES.meubles),
              )}
            </View>
          )}

          <ScrollView
            ref={corps}
            style={s.corps}
            contentContainerStyle={s.corpsFond}
            scrollEnabled={!geste}
            keyboardShouldPersistTaps="handled"
            onTouchStart={() => (repos.current = Date.now())}
            onScrollBeginDrag={() => (repos.current = Date.now())}>
            {piece && onglet === 'ambiances' && (
              <>
                <View style={s.ligneTitre}>
                  <Text style={s.section}>Une ambiance, en un appui</Text>
                  {portee()}
                </View>
                <View style={s.ambiances}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Surprise : une ambiance au hasard"
                    style={({ pressed }) => [s.ambiance, s.ambianceSurprise, pressed && { transform: [{ scale: 0.96 }] }]}
                    onPress={surprise}>
                    <Text style={s.de}>🎲</Text>
                    <Text style={[s.ambianceNom, { color: '#FFFFFF' }]}>Surprise</Text>
                  </Pressable>
                  {AMBIANCES.map((a) => {
                    const prise = ambianceActuelle?.cle === a.cle;
                    return (
                      <Pressable
                        key={a.cle}
                        accessibilityRole="button"
                        accessibilityLabel={`Ambiance : ${a.nom}`}
                        accessibilityState={{ selected: prise }}
                        style={({ pressed }) => [s.ambiance, prise && s.ambiancePrise, pressed && { transform: [{ scale: 0.96 }] }]}
                        onPress={() => appliquer(a)}>
                        {/* Le mur au-dessus, le sol en dessous : la pièce en miniature. */}
                        <View style={s.miniature}>
                          <View style={[s.miniMur, { backgroundColor: hexPeinture(a.peinture) }]} />
                          <View style={[s.miniSol, { backgroundColor: hexSol(a.sol) }]} />
                        </View>
                        <Text style={[s.ambianceNom, prise && s.ambianceNomPris]} numberOfLines={1}>
                          {a.nom}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={s.aide}>
                  Une ambiance pose les murs et le sol ensemble ; retouchez ensuite avec « Murs », « Sol » ou « Meubles ».
                </Text>
              </>
            )}
            {piece && onglet === 'murs' && (
              <>
                {potsDeLaPiece ? (
                  <View style={s.pots} testID="pots-de-la-piece">
                    <Text
                      style={s.potsTexte}
                      accessibilityLabel={`Environ ${potsDeLaPiece.pots} pot${potsDeLaPiece.pots > 1 ? 's' : ''} de ${nombre(potsDeLaPiece.pot)} litres pour les murs de cette pièce${estCouleurLibre(teintePosee) ? ', teinte sur mesure' : ''}`}>
                      {`≈ ${potsDeLaPiece.pots} pot${potsDeLaPiece.pots > 1 ? 's' : ''} de ${nombre(potsDeLaPiece.pot)}\u00A0L`}
                      {/* Une couleur libre n'a pas de pot au rayon : elle se fait teinter. */}
                      {estCouleurLibre(teintePosee) ? ' · teinte sur mesure' : ''}
                    </Text>
                    {onAchats ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Voir la liste d’achats"
                        hitSlop={10}
                        onPress={onAchats}>
                        <Text style={s.potsLien}>· Voir la liste</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                <View style={s.ligneTitre}>
                  <Text style={s.section}>
                    {nbsp(`Les murs : ${peinture?.nom ?? ''}${estCouleurLibre(piece.peinture) ? ` ${piece.peinture}` : ''}`)}
                  </Text>
                  {libre === 'murs' ? null : portee()}
                </View>
                {nuancier(
                  [MUR_RELEVE, ...PEINTURES],
                  estCouleurLibre(piece.peinture) ? PRISE_LIBRE : piece.peinture ?? ORIGINE,
                  (p) => `Murs : ${p.nom}`,
                  (cle) => peindre(piece.id, cle),
                  46,
                  {
                    hex: peinture?.hex ?? MUR_RELEVE.hex,
                    actif: estCouleurLibre(piece.peinture),
                    quoi: 'Murs',
                    ouvert: libre === 'murs',
                    ouvrir: () => basculerLibre('murs'),
                  },
                )}
                {libre === 'murs' &&
                  selecteur('Couleur des murs', peinture?.hex ?? MUR_RELEVE.hex, (hex) => peindre(piece.id, hex))}
                {/*
                  LA COULEUR MÈNE AUX POTS — revue « Bernard » : choisir la
                  teinte et compter les pots vivaient à deux endroits sans
                  lien. On y va d'un appui.
                */}
                {onAchats && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Voir ma liste d’achats"
                    style={({ pressed }) => [s.achats, pressed && { opacity: 0.7 }]}
                    onPress={onAchats}>
                    <Text style={s.achatsTexte}>Voir ma liste d’achats</Text>
                  </Pressable>
                )}
                <Text style={s.aide}>
                  Pour peindre un seul mur : en mode Édition, touchez-le sur le plan, puis « Peindre ».
                </Text>
              </>
            )}
            {piece && onglet === 'sol' && (
              <>
                <View style={s.ligneTitre}>
                  <Text style={s.section}>{nbsp(`Le sol : ${sol?.nom ?? ''}${solLibre ? ` ${solLibre}` : ''}`)}</Text>
                  {libre === 'sol' ? null : portee()}
                </View>
                {nuancier(
                  SOLS,
                  solLibre ? PRISE_LIBRE : piece.sol ?? SOL_DEFAUT,
                  (p) => `Sol : ${p.nom}`,
                  (cle) => poserSol(piece.id, cle),
                  46,
                  {
                    hex: sol?.hex ?? '#D9CBB4',
                    actif: !!solLibre,
                    quoi: 'Sol',
                    ouvert: libre === 'sol',
                    ouvrir: () => basculerLibre('sol'),
                  },
                )}
                {libre === 'sol' &&
                  selecteur(
                    solDuNuancier && solDuNuancier.cle !== SOL_DEFAUT
                      ? `Teinte du sol · ${solDuNuancier.nom}`
                      : 'Teinte du sol',
                    sol?.hex ?? '#D9CBB4',
                    (hex) => teinterSol(piece.id, hex),
                  )}
                <Text style={s.aide}>
                  Une autre couleur garde la matière du sol : un parquet reste un parquet, teinté.
                </Text>
              </>
            )}
            {piece && onglet === 'meubles' && (
              meubles.length === 0 || !meuble ? (
                <Text style={[s.vide, s.videMeubles]}>Aucun meuble dans cette pièce.</Text>
              ) : (
                <>
                  {/*
                    LES MEUBLES EN CARTES QUI DÉFILENT — chacune à sa teinte du
                    moment ; on en touche une, son nuancier s'ouvre dessous.
                  */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={s.meublesBande}
                    contentContainerStyle={s.meubles}
                    onTouchStart={() => (repos.current = Date.now())}>
                    {meubles.map((o) => {
                      const nom = nomsDesMeubles.get(o.id) ?? nomDuMeuble(o);
                      const pris = o.id === meuble.id;
                      const teinte = pastilleDe(o);
                      // Le numéro à part : coupé en fin de nom, il ne distinguait plus rien.
                      const rang = nom === nomDuMeuble(o) ? null : nom.slice(nomDuMeuble(o).length + 1);
                      return (
                        <Pressable
                          key={o.id}
                          accessibilityRole="button"
                          accessibilityLabel={nom}
                          accessibilityState={{ selected: pris }}
                          style={({ pressed }) => [s.meubleCarte, pris && s.meubleCartePrise, pressed && { transform: [{ scale: 0.96 }] }]}
                          onPress={() => {
                            haptic('leger');
                            setMeubleId(o.id);
                          }}>
                          {/*
                            LE MODÈLE DU MEUBLE, À SA TEINTE — relevé du patron :
                            « le choix des meubles dans Décorer doit afficher le
                            modèle du meuble choisi ». La pastille reste, en
                            petit, par-dessus : la teinte se lit d'un coup d'œil.
                          */}
                          <View style={s.meubleHaut}>
                            <VignetteMeuble
                              objet={o}
                              largeur={VIGNETTE_CARTE.largeur}
                              hauteur={VIGNETTE_CARTE.hauteur}
                              testID={`vignette-meuble-${o.id}`}
                            />
                            <View style={[s.meubleTeinte, { backgroundColor: teinte?.hex ?? c.surface }]} />
                            {rang ? (
                              <View style={s.meubleRang}>
                                <Text style={s.meubleRangTexte}>{rang}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={[s.meubleNom, pris && s.meubleNomPris]} numberOfLines={2}>
                            {nomDuMeuble(o)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {(() => {
                    const nom = nomsDesMeubles.get(meuble.id) ?? nomDuMeuble(meuble);
                    const pastille = pastilleDe(meuble);
                    const horsNuancier = pastille?.cle === PRISE_LIBRE;
                    return (
                      <>
                        <Text style={s.section}>
                          {nbsp(`${nom} : ${pastille?.nom ?? ''}${horsNuancier ? ` ${pastille.hex.toUpperCase()}` : ''}`)}
                        </Text>
                        {/* Le meuble choisi, en grand, au-dessus de son nuancier. */}
                        <View style={s.meubleGrand} testID="vignette-meuble-choisi">
                          <VignetteMeuble
                            objet={meuble}
                            largeur={VIGNETTE_GRANDE.largeur}
                            hauteur={VIGNETTE_GRANDE.hauteur}
                            devant
                            testID={`vignette-grande-${meuble.id}`}
                          />
                        </View>
                        {nuancier(
                          TEINTES_MEUBLES,
                          horsNuancier ? PRISE_LIBRE : meuble.teinte ? cleDeTeinte(meuble.teinte) : TEINTE_ORIGINE,
                          (p) => `${nom} : ${p.nom}`,
                          (cle) => compter(() => st().setObjectTeinte(meuble.id, hexDeTeinte(cle))),
                          44,
                          {
                            hex: pastille?.hex ?? '#D8E1F2',
                            actif: horsNuancier,
                            quoi: nom,
                            ouvert: libre === 'meubles',
                            ouvrir: () => basculerLibre('meubles'),
                          },
                        )}
                        {libre === 'meubles' &&
                          selecteur(`Couleur · ${nom}`, meuble.teinte ?? pastille?.hex ?? '#D8E1F2', (hex) =>
                            compter(() => st().setObjectTeinte(meuble.id, hex)),
                          )}
                      </>
                    );
                  })()}
                </>
              )
            )}
          </ScrollView>
        </>
      )}
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    tete: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 48, paddingLeft: 2, flexShrink: 0 },
    titre: { color: c.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, flex: 1 },
    annuler: {
      flexDirection: 'row',
      gap: 6,
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 18,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    annulerMot: { color: c.ink, fontSize: 14, fontWeight: '700' },
    partager: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    annulerMotEteint: { color: c.inkFaint },
    pots: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
      backgroundColor: c.blueSoft,
    },
    potsTexte: { color: c.ink, fontSize: 14, fontWeight: '700' },
    potsLien: { color: c.blue, fontSize: 14, fontWeight: '700' },
    pucesBande: { flexGrow: 0, flexShrink: 0, height: 48, marginTop: 10 },
    puces: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
    puce: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 6,
      paddingRight: 14,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surfaceSunken,
    },
    pucePrise: { backgroundColor: c.ink },
    puceTeintes: { flexDirection: 'row' },
    puceTeinte: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.surface },
    puceTeinte2: { marginLeft: -8 },
    puceMots: { maxWidth: 190 },
    puceTexte: { color: c.ink, fontSize: 14, fontWeight: '700' },
    puceNiveau: { color: c.inkSoft, fontSize: 10.5, fontWeight: '600' },
    puceTextePris: { color: c.surface },
    apercu: {
      flexShrink: 0,
      marginTop: 8,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: c.surfaceSunken,
    },
    // Le temps de la photo, le cadre déborde de l'aperçu, par-dessus les tuiles.
    apercuPhoto: { overflow: 'visible', zIndex: 10 },
    cadrePhoto: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      borderRadius: radius.lg,
      overflow: 'hidden',
      // Un fond propre et uni : rien d'autre que la pièce.
      backgroundColor: c.surface,
    },
    legendePhoto: { position: 'absolute', left: 14, bottom: 12, right: 120 },
    legendePhotoPiece: { color: c.ink, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
    legendePhotoAmbiance: { color: c.inkSoft, fontSize: 12.5, fontWeight: '600', marginTop: 1 },
    logoPhoto: {
      position: 'absolute',
      bottom: 10,
      right: 10,
      backgroundColor: 'rgba(255,255,255,0.88)',
      borderRadius: 9,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    logoPhotoImage: { width: 72, height: 46, opacity: 0.85 },
    prete: {
      position: 'absolute',
      top: 10,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.surfaceVoile,
    },
    preteTexte: { color: c.ink, fontSize: 13, fontWeight: '700' },
    badgeAmbiance: {
      position: 'absolute',
      top: 10,
      left: 10,
      paddingHorizontal: 10,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.surfaceVoile,
      justifyContent: 'center',
    },
    badgeAmbianceTexte: { color: c.ink, fontSize: 12.5, fontWeight: '800' },
    tuiles: { flexDirection: 'row', gap: 8, marginTop: 10, flexShrink: 0 },
    tuile: {
      flex: 1,
      height: 102,
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    tuilePrise: { backgroundColor: c.surface, borderColor: c.blue },
    tuileRond: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    tuileNom: { color: c.ink, fontSize: 13.5, fontWeight: '700', marginTop: 6 },
    tuileNomPris: { color: c.blue, fontWeight: '800' },
    tuileValeur: { color: c.inkSoft, fontSize: 11, lineHeight: 13, marginTop: 1, textAlign: 'center' },
    corps: { flexShrink: 1, minHeight: 140, marginTop: 4 },
    corpsFond: { paddingBottom: 18 },
    ligneTitre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    section: {
      flexShrink: 1,
      color: c.inkSoft,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      marginTop: 14,
      marginBottom: 10,
    },
    portee: {
      flexShrink: 0,
      marginTop: 6,
      height: 30,
      paddingHorizontal: 12,
      borderRadius: 15,
      backgroundColor: c.surfaceSunken,
      justifyContent: 'center',
    },
    porteeOn: { backgroundColor: c.blue },
    porteeTexte: { color: c.ink, fontSize: 12.5, fontWeight: '700' },
    porteeTexteOn: { color: '#FFFFFF' },
    ambiances: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    ambiance: {
      width: '30%',
      flexGrow: 1,
      minWidth: 96,
      height: 92,
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
      padding: 8,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    ambiancePrise: { borderColor: c.blue, backgroundColor: c.surface },
    ambianceSurprise: { backgroundColor: c.blue, alignItems: 'center', justifyContent: 'center' },
    de: { fontSize: 28 },
    miniature: { flex: 1, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: c.line },
    miniMur: { flex: 1.4 },
    miniSol: { flex: 1 },
    ambianceNom: { color: c.ink, fontSize: 13, fontWeight: '700', marginTop: 6, textAlign: 'center' },
    ambianceNomPris: { color: c.blue, fontWeight: '800' },
    // Cinq par rangée, sur toute la largeur : plus de vide à droite.
    nuancier: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
    teinte: { alignItems: 'center', width: '20%' },
    teinteNom: { color: c.inkSoft, fontSize: 12, lineHeight: 15, marginTop: 5, textAlign: 'center' },
    teinteNomPrise: { color: c.ink, fontWeight: '700' },
    pastille: {
      borderWidth: 1,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    meublesBande: { flexGrow: 0, flexShrink: 0, height: 120, marginTop: 12 },
    meubles: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
    meubleCarte: {
      width: 112,
      height: 112,
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
      padding: 8,
      borderWidth: 2,
      borderColor: 'transparent',
      justifyContent: 'space-between',
    },
    meubleCartePrise: { borderColor: c.blue, backgroundColor: c.surface },
    meubleHaut: { width: 92, height: 54, alignSelf: 'center' },
    meubleGrand: {
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: 120,
      marginBottom: 12,
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
    },
    autreCoeur: { borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    meubleRang: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    meubleRangTexte: { color: c.surface, fontSize: 12, fontWeight: '800' },
    // La pastille de teinte, en petit, sur la vignette.
    meubleTeinte: {
      position: 'absolute',
      top: -2,
      left: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: c.surface,
    },
    meubleNom: { color: c.ink, fontSize: 13, fontWeight: '600' },
    meubleNomPris: { fontWeight: '800' },
    vide: { color: c.inkSoft, fontSize: 13.5, lineHeight: 19, marginTop: 10 },
    videMeubles: { marginTop: 16 },
    aide: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 14 },
    achats: {
      marginTop: 16,
      minHeight: 46,
      borderRadius: 14,
      backgroundColor: c.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    achatsTexte: { color: c.blue, fontSize: 15, fontWeight: '700' },
  }),
);
