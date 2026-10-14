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
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ObjectData } from 'react-native-room-scan';
import { SheetShell } from './Sheet';
import { haptic } from '../ui/haptic';
import { SOLAIRES } from '../ui/solaires';
import { PEINTURES, PEINTURE_DEFAUT, type Peinture } from '../ui/peintures';
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
      cutaway
    />
  );
}

type Onglet = 'murs' | 'sol' | 'meubles';

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
  const nomDeLaPiece = (r: (typeof rooms)[number], i: number) => {
    const nom = r.name || `Pièce ${i + 1}`;
    return plusieursNiveaux ? `${nom} · ${nomDuNiveau(niveauDe(r))}` : nom;
  };
  const [pieceId, setPieceId] = useState<string | null>(null);
  /*
    LA PIÈCE CHOISIE NE SE PERD PLUS — relevé du patron : « lorsqu'on change
    de pièce, on revient à la première pièce si on change de couleur ». La
    pièce se reprenait à CHAQUE changement des pièces du plan — et peindre
    un mur en est un. Elle ne se reprend plus qu'à l'ouverture de la feuille.
  */
  const etaitVisible = useRef(false);
  useEffect(() => {
    if (visible && !etaitVisible.current) setPieceId(pieceInitiale ?? nommees[0]?.id ?? null);
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

  /** Une rangée de pastilles : la coche sur celle qui est prise. */
  const nuancier = (
    liste: (Peinture & { motif?: 'parquet' | 'carrelage' | null })[],
    prise: string,
    dire: (p: Peinture) => string,
    choisir: (cle: string) => void,
    taille = 40,
  ) => (
    <View style={s.nuancier}>
      {liste.map((p) => {
        const on = p.cle === prise;
        /*
          LE NOM SOUS LE ROND — revue « Chloé » : sept blancs et beiges
          indiscernables sur fond blanc, deux gris unis pour le béton ciré et
          la moquette, et rien pour dire « vert sauge et chêne clair » à
          quelqu'un. La grille des peintures du mur l'écrivait déjà.
        */
        return (
          <View key={p.cle} style={[s.teinte, { width: taille + 18 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={dire(p)}
            accessibilityState={{ selected: on }}
            hitSlop={4}
            onPress={() => {
              haptic('leger');
              choisir(p.cle);
            }}
            style={[
              s.pastille,
              { width: taille, height: taille, borderRadius: taille / 2, backgroundColor: p.hex },
              on && { borderColor: c.blue, borderWidth: 3 },
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
                  d={SOLAIRES.check}
                  fill="none"
                  stroke={sombre(p.hex) ? '#FFFFFF' : c.ink}
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

  const st = useScanStore.getState;
  const { height: hauteurEcran } = useWindowDimensions();
  // L'aperçu prend un tiers de l'écran : on décore ce qu'on voit.
  const hauteurApercu = Math.round(Math.min(360, Math.max(220, hauteurEcran * 0.34)));
  const repos = useRef(0);
  const [onglet, setOnglet] = useState<Onglet>('murs');
  const [meubleId, setMeubleId] = useState<string | null>(null);
  // Une autre pièce : on repart des murs, sans meuble choisi.
  useEffect(() => {
    setOnglet('murs');
    setMeubleId(null);
  }, [piece?.id]);
  const meuble = meubles.find((o) => o.id === meubleId) ?? meubles[0] ?? null;
  const peinture = piece ? PEINTURES.find((p) => p.cle === (piece.peinture ?? PEINTURE_DEFAUT)) : undefined;
  const sol = piece ? SOLS.find((p) => p.cle === (piece.sol ?? SOL_DEFAUT)) : undefined;
  const pastilleDe = (o: ObjectData) =>
    TEINTES_MEUBLES.find((p) => p.cle === (o.teinte ? cleDeTeinte(o.teinte) : TEINTE_ORIGINE));

  /*
    TROIS ONGLETS, PAS UNE LISTE SANS FIN — relevé du patron : « revois une
    amélioration en termes de facilité pour décorer ». Tout s'empilait :
    les murs, le sol, puis un nuancier entier par meuble — trente rangées de
    ronds pour une chambre meublée, dans une fenêtre de 340 points. Chaque
    onglet montre sa teinte du moment : on sait ce qui est pris avant
    d'ouvrir.
  */
  const ongletBouton = (cle: Onglet, nom: string, libelle: string, hex?: string) => {
    const pris = onglet === cle;
    return (
      <TouchableOpacity
        key={cle}
        accessibilityRole="tab"
        accessibilityLabel={nom}
        accessibilityState={{ selected: pris }}
        style={[s.onglet, pris && s.ongletPris]}
        onPress={() => {
          haptic('leger');
          setOnglet(cle);
        }}>
        {hex ? <View style={[s.ongletTeinte, { backgroundColor: hex }]} /> : null}
        <Text style={[s.ongletTexte, pris && s.ongletTextePris]} numberOfLines={1}>
          {libelle}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SheetShell visible={visible} onClose={onClose} defile={false}>
      <View style={s.tete}>
        <Text style={s.titre}>Décorer</Text>
        <Text style={s.sous}>Touchez une teinte : la pièce change sous vos yeux. Le relevé, lui, ne bouge pas.</Text>
      </View>
      {visible && piece ? (
        <View style={[s.apercu, { height: hauteurApercu }]}>
          <PieceTournante pieceId={piece.id} niveau={niveauDe(piece)} repos={repos} />
        </View>
      ) : null}
      {nommees.length === 0 ? (
        <Text style={s.vide}>Aucune pièce sur ce plan : tracez ou redétectez les pièces pour les décorer.</Text>
      ) : (
        <>
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
                  <TouchableOpacity
                    key={r.id}
                    accessibilityLabel={nomDeLaPiece(r, i)}
                    accessibilityState={{ selected: prise }}
                    style={[s.puce, prise && { backgroundColor: c.blue, borderColor: c.blue }]}
                    onPress={() => {
                      haptic('leger');
                      setPieceId(r.id);
                    }}>
                    <Text style={[s.puceTexte, prise && { color: '#FFFFFF' }]} numberOfLines={1}>
                      {nomDeLaPiece(r, i)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          {piece && (
            <View style={s.onglets} accessibilityRole="tablist">
              {ongletBouton('murs', 'Murs', 'Murs', peinture?.hex)}
              {ongletBouton('sol', 'Sol', 'Sol', sol?.hex)}
              {ongletBouton('meubles', 'Meubles', meubles.length > 0 ? `Meubles · ${meubles.length}` : 'Meubles')}
            </View>
          )}
          <ScrollView
            style={s.corps}
            contentContainerStyle={s.corpsFond}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onTouchStart={() => (repos.current = Date.now())}
            onScrollBeginDrag={() => (repos.current = Date.now())}>
            {piece && onglet === 'murs' && (
              <>
                <Text style={s.section}>{`Les murs : ${peinture?.nom ?? ''}`}</Text>
                {nuancier(
                  PEINTURES,
                  piece.peinture ?? PEINTURE_DEFAUT,
                  (p) => `Murs : ${p.nom}`,
                  (cle) => st().setRoomPeinture(piece.id, cle === PEINTURE_DEFAUT ? null : cle),
                  44,
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
                <Text style={s.section}>{`Le sol : ${sol?.nom ?? ''}`}</Text>
                {nuancier(
                  SOLS,
                  piece.sol ?? SOL_DEFAUT,
                  (p) => `Sol : ${p.nom}`,
                  (cle) => st().setRoomSol(piece.id, cle === SOL_DEFAUT ? null : cle),
                  44,
                )}
              </>
            )}
            {piece && onglet === 'meubles' && (
              meubles.length === 0 || !meuble ? (
                <Text style={[s.vide, s.videMeubles]}>Aucun meuble dans cette pièce.</Text>
              ) : (
                <>
                  {/*
                    LES MEUBLES SE VOIENT D'UN COUP D'ŒIL — « apporte une
                    meilleure visibilité aux éléments listés à décorer ».
                    Chacun est une pastille à sa teinte du moment ; on en
                    touche un, son nuancier s'ouvre dessous.
                  */}
                  <View style={s.meubles}>
                    {meubles.map((o) => {
                      const nom = nomsDesMeubles.get(o.id) ?? nomDuMeuble(o);
                      const pris = o.id === meuble.id;
                      const teinte = pastilleDe(o);
                      return (
                        <TouchableOpacity
                          key={o.id}
                          accessibilityLabel={nom}
                          accessibilityState={{ selected: pris }}
                          style={[s.meublePuce, pris && s.meublePucePris]}
                          onPress={() => {
                            haptic('leger');
                            setMeubleId(o.id);
                          }}>
                          <View style={[s.meubleTeinte, { backgroundColor: teinte?.hex ?? c.surface }]} />
                          <Text style={[s.meubleNom, pris && s.meubleNomPris]} numberOfLines={1}>
                            {nom}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {(() => {
                    const nom = nomsDesMeubles.get(meuble.id) ?? nomDuMeuble(meuble);
                    return (
                      <>
                        <Text style={s.section}>{`${nom} : ${pastilleDe(meuble)?.nom ?? ''}`}</Text>
                        {nuancier(
                          TEINTES_MEUBLES,
                          meuble.teinte ? cleDeTeinte(meuble.teinte) : TEINTE_ORIGINE,
                          (p) => `${nom} : ${p.nom}`,
                          (cle) => st().setObjectTeinte(meuble.id, hexDeTeinte(cle)),
                          40,
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
    tete: { paddingRight: 44, paddingLeft: 2 },
    titre: { color: c.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
    sous: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 3 },
    apercu: {
      marginTop: 10,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: c.surfaceSunken,
    },
    corps: { flexShrink: 1, minHeight: 150, marginTop: 4 },
    corpsFond: { paddingBottom: 14 },
    pucesBande: { flexGrow: 0, marginTop: 10 },
    puces: { flexDirection: 'row', gap: 8, paddingRight: 8 },
    puce: {
      paddingHorizontal: 14,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
      justifyContent: 'center',
    },
    puceTexte: { color: c.ink, fontSize: 14, fontWeight: '700' },
    onglets: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 10,
      padding: 4,
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
    },
    onglet: {
      flex: 1,
      height: 40,
      borderRadius: radius.md - 3,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 6,
    },
    ongletPris: {
      backgroundColor: c.surface,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    ongletTeinte: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
    ongletTexte: { color: c.inkSoft, fontSize: 14, fontWeight: '700' },
    ongletTextePris: { color: c.ink, fontWeight: '800' },
    meubles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    meublePuce: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 40,
      paddingLeft: 6,
      paddingRight: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
      maxWidth: '100%',
    },
    meublePucePris: { borderColor: c.blue, borderWidth: 2, backgroundColor: c.blueSoft },
    meubleTeinte: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
    meubleNom: { color: c.ink, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    meubleNomPris: { fontWeight: '800' },
    section: {
      color: c.inkSoft,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      marginTop: 16,
      marginBottom: 8,
    },
    nuancier: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, rowGap: 8 },
    teinte: { alignItems: 'center' },
    teinteNom: { color: c.inkSoft, fontSize: 12, lineHeight: 15, marginTop: 4, textAlign: 'center' },
    teinteNomPrise: { color: c.ink, fontWeight: '800' },
    pastille: {
      borderWidth: 1,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    vide: { color: c.inkSoft, fontSize: 13.5, lineHeight: 19, marginTop: 10 },
    videMeubles: { marginTop: 16 },
    aide: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 14 },
    achats: {
      marginTop: 14,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    achatsTexte: { color: c.blue, fontSize: 15, fontWeight: '700' },
  }),
);
