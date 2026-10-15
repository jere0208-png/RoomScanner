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
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ObjectData } from 'react-native-room-scan';
import { SheetShell } from './Sheet';
import { haptic } from '../ui/haptic';
import { SOLAIRES } from '../ui/solaires';
import { PEINTURES, type Peinture } from '../ui/peintures';
import { SOLS, SOL_DEFAUT, TEINTES_MEUBLES, TEINTE_ORIGINE, cleDeTeinte, hexDeTeinte } from '../ui/habillage';
import { nomDuMeuble } from '../geometry/furniture';
import { useScanStore } from '../store/scanStore';
import { niveauDe, nomDuNiveau } from '../geometry/floorplan';
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
const PAS_DU_TOUR = 1.2;
const REPOS_APRES_LE_DOIGT = 2500;
const ZOOM_DECOR = 1.3;

function PieceTournante({
  pieceId,
  niveau,
  repos,
}: {
  pieceId: string | null;
  niveau?: number;
  /** L'instant du dernier toucher, sur la maquette ou dans la liste. */
  repos: React.MutableRefObject<number>;
}) {
  const [vue, setVue] = useState<View3DParams>({ ...DEFAULT_VIEW3D, tilt: 50, zoom: ZOOM_DECOR });
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - repos.current < REPOS_APRES_LE_DOIGT) return;
      setVue((v) => ({ ...v, theta: (v.theta + PAS_DU_TOUR) % 360 }));
    }, 50);
    return () => clearInterval(id);
  }, [repos]);
  return (
    <Iso3DView
      value={vue}
      onChange={(v) => {
        repos.current = Date.now();
        setVue(v);
      }}
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

const hexPeinture = (cle: string) => PEINTURES.find((p) => p.cle === cle)?.hex ?? MUR_RELEVE.hex;
const hexSol = (cle: string) => SOLS.find((p) => p.cle === cle)?.hex ?? '#D9CBB4';

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
  const [meubleId, setMeubleId] = useState<string | null>(null);
  // Une autre pièce : on repart des murs, sans meuble choisi.
  useEffect(() => {
    setOnglet((o) => (o === 'ambiances' ? o : 'murs'));
    setMeubleId(null);
  }, [piece?.id]);
  const meuble = meubles.find((o) => o.id === meubleId) ?? meubles[0] ?? null;
  const peinture = piece
    ? piece.peinture
      ? PEINTURES.find((p) => p.cle === piece.peinture) ?? { cle: piece.peinture, nom: 'Teinte inconnue', hex: MUR_RELEVE.hex }
      : MUR_RELEVE
    : undefined;
  const sol = piece
    ? SOLS.find((p) => p.cle === (piece.sol ?? SOL_DEFAUT)) ?? { cle: piece.sol ?? '', nom: 'Sol inconnu', hex: '#D9CBB4', motif: null }
    : undefined;
  /*
    UNE TEINTE HORS NUANCIER SE DIT — revue « Hugo » : « D’origine » se
    cochait sur un meuble peint d'une couleur que le nuancier ne connaît pas.
  */
  const pastilleDe = (o: ObjectData) => {
    if (o.teinte && !TEINTES_MEUBLES.some((t) => t.hex.toLowerCase() === o.teinte!.toLowerCase())) {
      return { cle: '', nom: 'Teinte personnalisée', hex: o.teinte };
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
  const peindre = (roomId: string, cle: string) =>
    compter(() => st().setRoomPeinture(roomId, cle === ORIGINE ? null : cle));
  const poserSol = (roomId: string, cle: string) =>
    compter(() => st().setRoomSol(roomId, cle === SOL_DEFAUT ? null : cle));
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
  const ambianceActuelle = piece
    ? AMBIANCES.find((a) => a.peinture === (piece.peinture ?? ORIGINE) && a.sol === (piece.sol ?? SOL_DEFAUT))
    : undefined;

  /** Une grille de pastilles : la coche sur celle qui est prise, qui grossit. */
  const nuancier = (
    liste: (Peinture & { motif?: 'parquet' | 'carrelage' | null })[],
    prise: string,
    dire: (p: Peinture) => string,
    choisir: (cle: string) => void,
    taille = 46,
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
    </View>
  );

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
        {/* Annuler sans quitter : on ose essayer quand on peut revenir. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Annuler le dernier changement"
          accessibilityState={{ disabled: !peutAnnuler }}
          disabled={!peutAnnuler}
          hitSlop={8}
          style={({ pressed }) => [s.annuler, !peutAnnuler && { opacity: 0.35 }, pressed && { opacity: 0.6 }]}
          onPress={() => {
            haptic('leger');
            st().undo();
            setFaits((n) => Math.max(0, n - 1));
          }}>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d={SOLAIRES.undo} fill={c.ink} fillRule="evenodd" />
          </Svg>
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
                      <View style={[s.puceTeinte, s.puceTeinte2, { backgroundColor: hexSol(r.sol ?? SOL_DEFAUT) }]} />
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
              style={[s.apercu, { height: hauteurApercu }]}
              // Un doigt posé, même immobile, arrête le tour (revue « Hugo »).
              onTouchStart={() => (repos.current = Date.now())}
              onTouchMove={() => (repos.current = Date.now())}>
              <PieceTournante pieceId={piece.id} niveau={niveauDe(piece)} repos={repos} />
              {ambianceActuelle && ambianceActuelle.cle !== 'origine' ? (
                <View style={s.badgeAmbiance} pointerEvents="none">
                  <Text style={s.badgeAmbianceTexte}>{ambianceActuelle.nom}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {piece && (
            <View style={s.tuiles} accessibilityRole="tablist" onTouchStart={() => (repos.current = Date.now())}>
              {tuile('ambiances', 'Ambiance', ambianceActuelle?.nom ?? 'Personnalisée', rondTuile(c.blueSoft, null, SOLAIRES.baguette))}
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
            style={s.corps}
            contentContainerStyle={s.corpsFond}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onTouchStart={() => (repos.current = Date.now())}
            onScrollBeginDrag={() => (repos.current = Date.now())}>
            {piece && onglet === 'ambiances' && (
              <>
                <View style={s.ligneTitre}>
                  <Text style={s.section}>Une ambiance, en un appui</Text>
                  {nommees.length > 1 && (
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityLabel="Tout le logement"
                      accessibilityState={{ checked: partout }}
                      style={[s.portee, partout && s.porteeOn]}
                      onPress={() => {
                        haptic('leger');
                        setPartout((v) => !v);
                      }}>
                      <Text style={[s.porteeTexte, partout && s.porteeTexteOn]}>
                        {partout ? `Tout le logement · ${nommees.length} pièces` : 'Cette pièce'}
                      </Text>
                    </Pressable>
                  )}
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
                <Text style={s.section}>{nbsp(`Les murs : ${peinture?.nom ?? ''}`)}</Text>
                {nuancier(
                  [MUR_RELEVE, ...PEINTURES],
                  piece.peinture ?? ORIGINE,
                  (p) => `Murs : ${p.nom}`,
                  (cle) => peindre(piece.id, cle),
                )}
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
                <Text style={s.section}>{nbsp(`Le sol : ${sol?.nom ?? ''}`)}</Text>
                {nuancier(SOLS, piece.sol ?? SOL_DEFAUT, (p) => `Sol : ${p.nom}`, (cle) => poserSol(piece.id, cle))}
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
                          <View style={s.meubleHaut}>
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
                    return (
                      <>
                        <Text style={s.section}>{nbsp(`${nom} : ${pastilleDe(meuble)?.nom ?? ''}`)}</Text>
                        {nuancier(
                          TEINTES_MEUBLES,
                          meuble.teinte ? cleDeTeinte(meuble.teinte) : TEINTE_ORIGINE,
                          (p) => `${nom} : ${p.nom}`,
                          (cle) => compter(() => st().setObjectTeinte(meuble.id, hexDeTeinte(cle))),
                          44,
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
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    meublesBande: { flexGrow: 0, flexShrink: 0, height: 96, marginTop: 12 },
    meubles: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
    meubleCarte: {
      width: 104,
      height: 88,
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
      padding: 10,
      borderWidth: 2,
      borderColor: 'transparent',
      justifyContent: 'space-between',
    },
    meubleCartePrise: { borderColor: c.blue, backgroundColor: c.surface },
    meubleHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    meubleRang: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    meubleRangTexte: { color: c.surface, fontSize: 12, fontWeight: '800' },
    meubleTeinte: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
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
