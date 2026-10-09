/**
 * LE MUR NEUF, AUX COTES QU'ON A PRISES.
 *
 * Relevé du patron : « l'ajout d'un mur n'est pas opérationnel, on doit le
 * placer au millimètre près nous-même, alors que les épaisseurs des murs
 * comptent ».
 *
 * Le mur neuf naissait à un mètre, et il fallait le tirer au doigt jusqu'à
 * sa cote. On touche maintenant une pose — au bout d'un mur, ou en T sur
 * son flanc — et cette feuille demande ce qu'on a mesuré au mètre ruban :
 * la longueur, la position pour une cloison en T, et l'épaisseur. Tout se
 * mesure d'une face à l'autre, comme sur le chantier ; la conversion vers
 * l'axe du plan est l'affaire de `murNeufCote`.
 *
 * Le petit schéma du haut dit, avant de valider, de quoi chaque nombre est
 * la cote : une valeur juste mesurée du mauvais côté est une valeur fausse.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { SheetShell } from './Sheet';
import {
  EPAISSEURS,
  coupeParDefaut,
  dimensionsDeCoupe,
  depuisParDefaut,
  type RoomPart,
  type SaisieCoupe,
  positionOuverture,
  segLength,
  type SaisieOuverture,
  epaisseurDe,
  type PoseDeMur,
  type SaisieMurNeuf,
  type WallSeg,
} from '../geometry/floorplan';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import {
  ALLEGES_COURANTES,
  hauteursCourantes,
  largeursCourantes,
  type Nature,
} from '../ui/cotesCourantes';

/** « 83,5 » → 0.835 m ; rien de lisible → null. */
export const lireCm = (t: string): number | null => {
  const v = parseFloat(t.replace(',', '.').replace(/\s/g, ''));
  return isFinite(v) && v > 0 ? v / 100 : null;
};

/** Comme `lireCm`, mais zéro est une cote : « collé au mur ». */
export const lireCote = (t: string): number | null => {
  const v = parseFloat(t.replace(',', '.').replace(/\s/g, ''));
  return isFinite(v) && v >= 0 ? v / 100 : null;
};

/** 0.835 m → « 83,5 ». */
export const ecrireCm = (m: number): string =>
  String(Math.round(m * 1000) / 10).replace('.', ',');

export function MurNeufSheet({
  pose,
  walls,
  onClose,
  onPoser,
  onApercu,
}: {
  pose: PoseDeMur | null;
  walls: WallSeg[];
  onClose: () => void;
  onPoser: (saisie: SaisieMurNeuf) => void;
  /** Ce que donneraient les cotes tapées, à dessiner sur le plan derrière. */
  onApercu?: (saisie: SaisieMurNeuf | null) => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const enT = pose?.genre === 't';
  const hote = pose ? walls.find((w) => w.id === pose.wallId) : undefined;
  const [longueur, setLongueur] = useState('100');
  const [depuis, setDepuis] = useState('');
  const [depuisB, setDepuisB] = useState(false);
  const [epaisseur, setEpaisseur] = useState(0.07);
  const attente = useRef<null | (() => void)>(null);

  /*
    LES VALEURS DE DÉPART, à chaque pose touchée. Un mur qui prolonge un
    autre en prend l'épaisseur ; une cloison en T part en cloison, sept
    centimètres — c'est presque toujours ce qu'on recoupe dans une pièce.
  */
  useEffect(() => {
    if (!pose) return;
    const e = pose.genre === 't' ? 0.07 : hote ? epaisseurDe(hote) : 0.14;
    setEpaisseur(e);
    setLongueur('100');
    setDepuisB(false);
    setDepuis(pose.genre === 't' ? ecrireCm(depuisParDefaut(walls, pose, e)) : '');
    // Une pose touchée = une saisie neuve ; les murs bougent pendant, pas elle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose]);

  const L = lireCm(longueur);
  const D = enT ? lireCm(depuis) ?? (depuis.trim() === '0' ? 0 : null) : 0;
  const pret = L !== null && L >= 0.2 && D !== null;

  /*
    L'APERÇU SUR LE PLAN — le mur se dessine derrière la feuille à chaque
    chiffre tapé : on voit tout de suite s'il tombe du bon côté, et depuis
    quel coin se compte la cote.
  */
  useEffect(() => {
    if (!onApercu) return;
    onApercu(
      pose && pret
        ? { longueur: L!, epaisseur, ...(enT ? { depuis: D!, depuisB } : {}) }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose, L, D, depuisB, epaisseur, pret]);

  const valider = () => {
    if (!pret) return;
    const saisie: SaisieMurNeuf = {
      longueur: L!,
      epaisseur,
      ...(enT ? { depuis: D!, depuisB } : {}),
    };
    attente.current = () => onPoser(saisie);
    onClose();
  };

  const sousTitre = enT
    ? 'Une cloison en T, sur le flanc du mur.'
    : pose?.angle === 0
      ? 'Dans le prolongement du mur.'
      : 'À l’équerre, au bout du mur.';

  return (
    <SheetShell
      visible={!!pose}
      onClose={onClose}
      onClosed={() => {
        const suite = attente.current;
        attente.current = null;
        suite?.();
      }}>
      <Text style={s.titre}>Nouveau mur</Text>
      <Text style={s.sous}>{sousTitre}</Text>

      <Schema
        c={c}
        enT={enT}
        droit={pose?.angle === 0}
        longueur={longueur}
        depuis={depuis}
        epaisseur={epaisseur}
      />

      <View style={s.ligne}>
        <Text style={s.etiquette}>Longueur</Text>
        <View style={s.champ}>
          <TextInput
            testID="champ-longueur"
            accessibilityLabel="Longueur du mur, en centimètres"
            style={s.saisie}
            value={longueur}
            onChangeText={setLongueur}
            keyboardType="decimal-pad"
            selectTextOnFocus
            autoFocus
            returnKeyType="done"
            onSubmitEditing={valider}
          />
          <Text style={s.unite}>cm</Text>
        </View>
      </View>

      {enT && (
        <View style={s.ligne}>
          <Text style={s.etiquette}>Depuis le coin</Text>
          <View style={s.champ}>
            <TextInput
              testID="champ-depuis"
              accessibilityLabel="Distance depuis le coin, en centimètres"
              style={s.saisie}
              value={depuis}
              onChangeText={setDepuis}
              keyboardType="decimal-pad"
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={valider}
            />
            <Text style={s.unite}>cm</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mesurer depuis l’autre coin"
            hitSlop={6}
            style={({ pressed }) => [s.autreCoin, pressed && s.presse]}
            onPress={() => {
              const b = !depuisB;
              setDepuisB(b);
              // La même cloison, vue de l'autre coin : la cote se recalcule
              // au milieu, on ne garde pas un nombre qui parlait de l'autre.
              if (pose) setDepuis(ecrireCm(depuisParDefaut(walls, pose, epaisseur, b)));
            }}>
            <Text style={s.autreCoinTexte}>Autre coin</Text>
          </Pressable>
        </View>
      )}

      <Text style={[s.etiquette, s.etiquetteSeule]}>Épaisseur</Text>
      <View style={s.pastilles}>
        {EPAISSEURS.map((ep) => {
          const choisie = Math.abs(ep.m - epaisseur) < 1e-6;
          return (
            <Pressable
              key={ep.mot}
              accessibilityRole="button"
              accessibilityLabel={`Épaisseur ${ep.mot}`}
              accessibilityState={{ selected: choisie }}
              style={({ pressed }) => [
                s.pastille,
                choisie && s.pastilleChoisie,
                pressed && s.presse,
              ]}
              onPress={() => setEpaisseur(ep.m)}>
              <Text style={[s.pastilleMot, choisie && s.pastilleMotChoisi]}>{ep.mot}</Text>
              <Text style={[s.pastilleCote, choisie && s.pastilleMotChoisi]}>
                {`${Math.round(ep.m * 100)} cm`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.note}>
        Mesurez au mètre, d’une face à l’autre : l’épaisseur des murs est comptée.
      </Text>

      <View style={s.actions}>
        <Pressable style={s.secondaire} onPress={onClose}>
          <Text style={s.secondaireTexte}>Annuler</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Poser le mur"
          accessibilityState={{ disabled: !pret }}
          style={[s.principal, !pret && s.inactif]}
          onPress={valider}>
          <Text style={s.principalTexte}>Poser le mur</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

const CADRE_SCHEMA = { alignItems: 'center', marginTop: 10 } as const;

/**
 * LE SCHÉMA DES COTES — le mur de départ en gris, le neuf en bleu, et
 * chaque nombre tapé écrit à l'endroit qu'il mesure.
 */
function Schema({
  c,
  enT,
  droit,
  longueur,
  depuis,
  epaisseur,
}: {
  c: Palette;
  enT: boolean;
  droit: boolean;
  longueur: string;
  depuis: string;
  epaisseur: number;
}) {
  const W = 280;
  const H = 118;
  const ep = Math.max(6, Math.min(16, epaisseur * 70));
  const gris = c.inkFaint;
  const bleu = c.blue;
  const cote = (x1: number, y1: number, x2: number, y2: number, mot: string, dx = 0, dy = 0) => (
    <>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.inkSoft} strokeWidth={1} />
      <Line x1={x1 - (y2 - y1 ? 4 : 0)} y1={y1 - (x2 - x1 ? 4 : 0)} x2={x1 + (y2 - y1 ? 4 : 0)} y2={y1 + (x2 - x1 ? 4 : 0)} stroke={c.inkSoft} strokeWidth={1} />
      <Line x1={x2 - (y2 - y1 ? 4 : 0)} y1={y2 - (x2 - x1 ? 4 : 0)} x2={x2 + (y2 - y1 ? 4 : 0)} y2={y2 + (x2 - x1 ? 4 : 0)} stroke={c.inkSoft} strokeWidth={1} />
      <SvgText
        x={(x1 + x2) / 2 + dx}
        y={(y1 + y2) / 2 + dy}
        fill={c.ink}
        fontSize={12}
        fontWeight="700"
        textAnchor="middle">
        {`${mot || '—'} cm`}
      </SvgText>
    </>
  );
  if (droit) {
    // Le mur de départ, puis le neuf dans son prolongement.
    const y = 52;
    return (
      <View style={CADRE_SCHEMA}>
        <Svg width={W} height={H} testID="schema-mur-neuf">
          <Rect x={10} y={y - 7} width={100} height={14} fill={gris} rx={1} />
          <Rect x={110} y={y - ep / 2} width={150} height={ep} fill={bleu} rx={1} />
          {cote(110, y + 26, 260, y + 26, longueur, 0, 16)}
        </Svg>
      </View>
    );
  }
  // Le mur de départ en haut ; le neuf descend de sa face.
  const yFace = 26;
  const x = enT ? 168 : 40;
  return (
    <View style={CADRE_SCHEMA}>
      <Svg width={W} height={H} testID="schema-mur-neuf">
        <Rect x={enT ? 10 : 40 - ep / 2} y={yFace - 14} width={enT ? 260 : 230} height={14} fill={gris} rx={1} />
        {enT && <Rect x={10} y={yFace - 14} width={10} height={H - 12} fill={gris} rx={1} />}
        <Rect x={x - ep / 2} y={yFace} width={ep} height={H - yFace - 8} fill={bleu} rx={1} />
        {cote(x + ep / 2 + 16, yFace, x + ep / 2 + 16, H - 8, longueur, 30, 4)}
        {enT && cote(20, yFace + 22, x - ep / 2, yFace + 22, depuis, 0, -6)}
      </Svg>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    titre: { color: c.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
    sous: { color: c.inkFaint, fontSize: 13, marginTop: 3 },
    ligne: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    etiquette: { color: c.ink, fontSize: 15, fontWeight: '600', width: 112 },
    etiquetteSeule: { width: undefined, marginTop: 16 },
    champ: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.lineStrong,
      paddingHorizontal: 14,
    },
    saisie: { flex: 1, color: c.ink, fontSize: 19, fontWeight: '700', paddingVertical: 11 },
    unite: { color: c.inkFaint, fontSize: 14, fontWeight: '600' },
    autreCoin: {
      paddingHorizontal: 12,
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: radius.pill,
      backgroundColor: c.blueSoft,
    },
    autreCoinTexte: { color: c.blue, fontSize: 13.5, fontWeight: '600' },
    pastilles: { flexDirection: 'row', gap: 8, marginTop: 8 },
    pastille: {
      flex: 1,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.lineStrong,
    },
    pastilleChoisie: { borderColor: c.blue, backgroundColor: c.blueSoft },
    pastilleMot: { color: c.ink, fontSize: 13.5, fontWeight: '600' },
    pastilleCote: { color: c.inkFaint, fontSize: 12, marginTop: 1 },
    pastilleMotChoisi: { color: c.blue },
    presse: { opacity: 0.7 },
    note: { color: c.inkFaint, fontSize: 12.5, lineHeight: 17, marginTop: 12 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    secondaire: {
      flex: 1,
      borderRadius: radius.pill,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: c.blueSoft,
    },
    secondaireTexte: { color: c.blue, fontWeight: '600', fontSize: 15 },
    principal: {
      flex: 1.4,
      borderRadius: radius.pill,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: c.blue,
    },
    principalTexte: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
    inactif: { opacity: 0.4 },
    courantes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginLeft: 122 },
    courante: {
      minHeight: 32,
      paddingHorizontal: 11,
      justifyContent: 'center',
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.lineStrong,
    },
    couranteTexte: { color: c.ink, fontSize: 13, fontWeight: '600' },
  }),
);

/**
 * COUPER UNE PIÈCE, À LA COTE ET À L'ÉPAISSEUR QU'ON DONNE.
 *
 * Relevé du patron : « fais pareil pour la sélection d'une pièce ».
 * « Scinder » posait une cloison au milieu, sans rien demander. On dit
 * maintenant dans quel sens, à combien du mur — au nu, comme au mètre — et
 * de quelle épaisseur ; la cloison se dessine derrière la feuille à chaque
 * chiffre tapé.
 */
export function CoupeSheet({
  part,
  onClose,
  onCouper,
  onApercu,
}: {
  part: RoomPart | null;
  onClose: () => void;
  onCouper: (saisie: SaisieCoupe) => void;
  onApercu?: (saisie: SaisieCoupe | null) => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const [sens, setSens] = useState<SaisieCoupe['sens']>('longueur');
  const [depuis, setDepuis] = useState('');
  const [depuisAutre, setDepuisAutre] = useState(false);
  const [epaisseur, setEpaisseur] = useState(0.07);
  const attente = useRef<null | (() => void)>(null);
  const dims = part ? dimensionsDeCoupe(part) : null;

  // À chaque pièce ouverte : la coupe au milieu de la longueur, en cloison.
  useEffect(() => {
    if (!part) return;
    setSens('longueur');
    setDepuisAutre(false);
    setEpaisseur(0.07);
    setDepuis(ecrireCm(coupeParDefaut(part, 'longueur', 0.07)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part?.roomId]);

  const D = lireCote(depuis);
  const pret = D !== null;
  const saisie: SaisieCoupe | null = pret ? { sens, depuis: D!, epaisseur, depuisAutre } : null;

  useEffect(() => {
    onApercu?.(part ? saisie : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part?.roomId, sens, D, epaisseur, depuisAutre]);

  const choisirSens = (v: SaisieCoupe['sens']) => {
    setSens(v);
    if (part) setDepuis(ecrireCm(coupeParDefaut(part, v, epaisseur)));
  };
  const valider = () => {
    if (!saisie) return;
    const x = saisie;
    attente.current = () => onCouper(x);
    onClose();
  };
  const m = (v?: number) => (v === undefined ? '' : `${String(Math.round(v * 100) / 100).replace('.', ',')} m`);

  return (
    <SheetShell
      visible={!!part}
      onClose={onClose}
      onClosed={() => {
        const suite = attente.current;
        attente.current = null;
        suite?.();
      }}>
      <Text style={s.titre}>Couper la pièce</Text>
      <Text style={s.sous}>Une cloison d’un mur à l’autre, à la cote du mètre.</Text>

      <View style={s.pastilles}>
        {(['longueur', 'largeur'] as const).map((v) => {
          const choisi = sens === v;
          return (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={v === 'longueur' ? 'Couper la longueur' : 'Couper la largeur'}
              accessibilityState={{ selected: choisi }}
              style={({ pressed }) => [s.pastille, choisi && s.pastilleChoisie, pressed && s.presse]}
              onPress={() => choisirSens(v)}>
              <Text style={[s.pastilleMot, choisi && s.pastilleMotChoisi]}>
                {v === 'longueur' ? 'Dans la longueur' : 'Dans la largeur'}
              </Text>
              <Text style={[s.pastilleCote, choisi && s.pastilleMotChoisi]}>
                {m(v === 'longueur' ? dims?.longueur : dims?.largeur)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={s.ligne}>
        <Text style={s.etiquette}>Depuis le mur</Text>
        <View style={s.champ}>
          <TextInput
            testID="champ-coupe"
            accessibilityLabel="Distance depuis le mur, en centimètres"
            style={s.saisie}
            value={depuis}
            onChangeText={setDepuis}
            keyboardType="decimal-pad"
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={valider}
          />
          <Text style={s.unite}>cm</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mesurer depuis le mur d’en face"
          hitSlop={6}
          style={({ pressed }) => [s.autreCoin, pressed && s.presse]}
          onPress={() => setDepuisAutre((x) => !x)}>
          <Text style={s.autreCoinTexte}>Mur d’en face</Text>
        </Pressable>
      </View>

      <Text style={[s.etiquette, s.etiquetteSeule]}>Épaisseur de la cloison</Text>
      <View style={s.pastilles}>
        {EPAISSEURS.map((ep) => {
          const choisie = Math.abs(ep.m - epaisseur) < 1e-6;
          return (
            <Pressable
              key={ep.mot}
              accessibilityRole="button"
              accessibilityLabel={`Épaisseur ${ep.mot}`}
              accessibilityState={{ selected: choisie }}
              style={({ pressed }) => [s.pastille, choisie && s.pastilleChoisie, pressed && s.presse]}
              onPress={() => setEpaisseur(ep.m)}>
              <Text style={[s.pastilleMot, choisie && s.pastilleMotChoisi]}>{ep.mot}</Text>
              <Text style={[s.pastilleCote, choisie && s.pastilleMotChoisi]}>
                {`${Math.round(ep.m * 100)} cm`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.note}>
        Du nu du mur au nu de la cloison. Les deux parties deviennent deux pièces.
      </Text>

      <View style={s.actions}>
        <Pressable style={s.secondaire} onPress={onClose}>
          <Text style={s.secondaireTexte}>Annuler</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Couper"
          accessibilityState={{ disabled: !pret }}
          style={[s.principal, !pret && s.inactif]}
          onPress={valider}>
          <Text style={s.principalTexte}>Couper</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

/**
 * LES COTES D'UNE PORTE OU D'UNE FENÊTRE, ENSEMBLE — relevé du patron :
 * « fais pareil pour les ouvertures ».
 *
 * Une menuiserie neuve se posait au milieu du mur, aux cotes du catalogue,
 * et il fallait ensuite ouvrir quatre fenêtres de saisie l'une après
 * l'autre. Surtout, la POSITION se comptait depuis l'axe du mur d'angle :
 * sept centimètres de plus que ce que lit le mètre posé contre le refend.
 * Ici tout se tape d'un coup, au nu, depuis le coin qu'on veut — et la
 * menuiserie se dessine sur le plan à chaque chiffre.
 */
export function OuvertureSheet({
  ouverture,
  walls,
  sol,
  onClose,
  onAppliquer,
  onApercu,
}: {
  ouverture: WallSeg | null;
  walls: WallSeg[];
  /** Le sol du mur porteur : l'allège se compte depuis lui. */
  sol: number;
  onClose: () => void;
  onAppliquer: (saisie: SaisieOuverture) => void;
  onApercu?: (saisie: SaisieOuverture | null) => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const [largeur, setLargeur] = useState('');
  const [hauteur, setHauteur] = useState('');
  const [allege, setAllege] = useState('');
  const [depuis, setDepuis] = useState('');
  const [depuisB, setDepuisB] = useState(false);
  const attente = useRef<null | (() => void)>(null);
  const porte = ouverture?.type === 'door';
  const nature: Nature = (ouverture?.type as Nature) ?? 'opening';
  const pos = ouverture ? positionOuverture(ouverture, walls) : null;

  // Les cotes actuelles, depuis le coin LE PLUS PROCHE : c'est de lui
  // qu'on mesure sur place.
  useEffect(() => {
    if (!ouverture) return;
    setLargeur(ecrireCm(segLength(ouverture)));
    setHauteur(ecrireCm(ouverture.height));
    setAllege(ecrireCm(Math.max(0, ouverture.yCenter - ouverture.height / 2 - sol)));
    const b = !!pos && pos.depuisB < pos.depuisA;
    setDepuisB(b);
    setDepuis(pos ? ecrireCm(Math.max(0, b ? pos.depuisB : pos.depuisA)) : '0');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverture?.id]);

  const l = lireCm(largeur);
  const h = lireCm(hauteur);
  const al = porte ? 0 : lireCote(allege);
  const d = lireCote(depuis);
  const pret = l !== null && h !== null && al !== null && d !== null;
  const saisie: SaisieOuverture | null = pret
    ? { largeur: l!, hauteur: h!, allege: al!, depuis: d!, depuisB }
    : null;

  useEffect(() => {
    onApercu?.(ouverture ? saisie : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverture?.id, l, h, al, d, depuisB]);

  const centrer = () => {
    if (!pos || l === null) return;
    const nu = segLength(pos.mur) - pos.retraitA - pos.retraitB;
    setDepuisB(false);
    setDepuis(ecrireCm(Math.max(0, (nu - l) / 2)));
  };
  const valider = () => {
    if (!saisie) return;
    const x = saisie;
    attente.current = () => onAppliquer(x);
    onClose();
  };

  const champ = (
    mot: string,
    valeur: string,
    poser: (v: string) => void,
    id: string,
    choix?: number[],
  ) => (
    <>
      <View style={s.ligne}>
        <Text style={s.etiquette}>{mot}</Text>
        <View style={s.champ}>
          <TextInput
            testID={id}
            accessibilityLabel={mot + ', en centimètres'}
            style={s.saisie}
            value={valeur}
            onChangeText={poser}
            keyboardType="decimal-pad"
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={valider}
          />
          <Text style={s.unite}>cm</Text>
        </View>
      </View>
      {choix && choix.length > 0 ? (
        <View style={s.courantes}>
          {choix.map((v) => {
            const t = ecrireCm(v);
            const choisie = t === valeur;
            return (
              <Pressable
                key={t}
                accessibilityRole="button"
                accessibilityLabel={mot + ' ' + t}
                style={({ pressed }) => [s.courante, choisie && s.pastilleChoisie, pressed && s.presse]}
                onPress={() => poser(t)}>
                <Text style={[s.couranteTexte, choisie && s.pastilleMotChoisi]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </>
  );

  return (
    <SheetShell
      visible={!!ouverture}
      onClose={onClose}
      onClosed={() => {
        const suite = attente.current;
        attente.current = null;
        suite?.();
      }}>
      <Text style={s.titre}>
        {porte ? 'Cotes de la porte' : nature === 'window' ? 'Cotes de la fenêtre' : 'Cotes de la baie'}
      </Text>
      <Text style={s.sous}>Au mètre, d’une face à l’autre.</Text>

      {champ('Largeur', largeur, setLargeur, 'champ-largeur', largeursCourantes(nature))}
      {champ('Hauteur', hauteur, setHauteur, 'champ-hauteur', hauteursCourantes(nature))}
      {!porte && champ('Bas (allège)', allege, setAllege, 'champ-allege', ALLEGES_COURANTES)}

      <View style={s.ligne}>
        <Text style={s.etiquette}>Depuis le coin</Text>
        <View style={s.champ}>
          <TextInput
            testID="champ-position"
            accessibilityLabel="Distance depuis le coin, en centimètres"
            style={s.saisie}
            value={depuis}
            onChangeText={setDepuis}
            keyboardType="decimal-pad"
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={valider}
          />
          <Text style={s.unite}>cm</Text>
        </View>
      </View>
      <View style={s.courantes}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mesurer depuis l’autre coin"
          style={({ pressed }) => [s.courante, pressed && s.presse]}
          onPress={() => {
            // La MÊME menuiserie, cotée de l'autre côté : la cote change,
            // la menuiserie ne bouge pas.
            const b = !depuisB;
            setDepuisB(b);
            if (pos) setDepuis(ecrireCm(Math.max(0, b ? pos.depuisB : pos.depuisA)));
          }}>
          <Text style={s.couranteTexte}>Autre coin</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Centrer sur le mur"
          style={({ pressed }) => [s.courante, pressed && s.presse]}
          onPress={centrer}>
          <Text style={s.couranteTexte}>Centrer</Text>
        </Pressable>
      </View>

      <View style={s.actions}>
        <Pressable style={s.secondaire} onPress={onClose}>
          <Text style={s.secondaireTexte}>Annuler</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Appliquer les cotes"
          accessibilityState={{ disabled: !pret }}
          style={[s.principal, !pret && s.inactif]}
          onPress={valider}>
          <Text style={s.principalTexte}>Appliquer</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}
