/**
 * LA FEUILLE DES TRAVAUX — « ce qu'il faut acheter », lisible d'un coup d'œil.
 *
 * Relevé du patron : plaire « à tout le monde qui souhaite scanner son
 * appartement sans y connaître en élec ». Les achats qu'on fait en refaisant
 * une pièce : la peinture des murs, celle des plafonds, le revêtement de
 * sol, les plinthes, la faïence — chacun avec ce qu'on met dans le chariot
 * (des pots, des cartons, des barres), en gros.
 *
 * DANS L'ORDRE OÙ L'ON DÉCIDE — revue du designer : le choix des pièces, qui
 * détermine tout, était tout en bas, sous les chiffres qu'il commande. Les
 * pièces d'abord (des puces qu'on coche), les quantités ensuite, l'envoi
 * enfin. Et diagnostic du patron : « la page de la liste trop remplie de
 * texte, peu agréable visuellement ». Chaque carte dit sa quantité et rien
 * d'autre ; la règle de calcul de chaque chiffre — un nombre sans sa règle
 * ne se vérifie pas en magasin — se replie derrière « Comment c'est
 * calculé », sans rien perdre.
 *
 * ON CHOISIT SES PIÈCES. On repeint rarement tout un logement : une coche
 * par pièce, toutes cochées au départ, et les totaux suivent — jusqu'au
 * dossier PDF et au tableur, qui lisent la même coche (`horsTravaux`), et la
 * même faïence murale des pièces d'eau (`faienceMurale`).
 *
 * ET ELLES SE RÈGLENT — relevé du patron, point 3 de la réflexion « grand
 * public » : le rendement est écrit sur le pot qu'on achète, la surface sur
 * le carton de sol. « Régler le calcul » ouvre leurs crans ; « Estimer le
 * prix » ajoute, à des prix d'unité qu'on corrige, un ordre d'idée par
 * achat et pour le tout. Les réglages restent sur l'appareil
 * (`store/reglagesTravaux`) et partent tels quels dans le dossier PDF.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SheetShell } from './Sheet';
import { Bouton } from './Bouton';
import { haptic } from '../ui/haptic';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import {
  HAUTEURS_FAIENCE,
  achats,
  cleHorsTravaux,
  coutDesAchats,
  euros,
  nombre,
  piecesRetenues,
  type HypothesesTravaux,
  type PieceTravaux,
  type PrixTravaux,
} from '../geometry/travaux';
import { useReglagesTravaux } from '../store/reglagesTravaux';
import { useScanStore } from '../store/scanStore';
import { PEINTURE_DEFAUT, hexDePeinture, nomDeTeinte } from '../ui/peintures';

const COCHE = 'M6 12.5 l4 4 l8 -9';
const CHEVRON = 'M6 9 l6 6 l6 -6';

/** Un cran de réglage : la valeur suivante, ou précédente, dans une liste. */
const cran = (liste: number[], v: number, sens: 1 | -1): number => {
  const i = liste.findIndex((x) => Math.abs(x - v) < 1e-9);
  if (i < 0) {
    // Une valeur hors liste (lue sur le disque) reprend au plus proche.
    const j = liste.findIndex((x) => x > v);
    const apres = j < 0 ? liste.length : j;
    return sens > 0 ? liste[Math.min(liste.length - 1, apres)] : liste[Math.max(0, apres - 1)];
  }
  return liste[Math.min(liste.length - 1, Math.max(0, i + sens))];
};
const plage = (de: number, a: number, pas: number) =>
  Array.from({ length: Math.round((a - de) / pas) + 1 }, (_, i) => Math.round((de + i * pas) * 100) / 100);
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/*
  LE CARTON DE SOL — revue du retraité bricoleur : le carrelage se vend en
  cartons, pas en « paquets » ; le stratifié et le parquet aussi, en rayon.
  L'hypothèse garde son nom (`paquet`) : c'est elle que lisent le disque et
  le dossier.
*/
/** Les crans des hypothèses — ceux qu'on trouve en rayon. */
const CRANS: { cle: keyof HypothesesTravaux; libelle: string; valeurs: number[]; dire: (v: number) => string }[] = [
  { cle: 'couches', libelle: 'Couches', valeurs: [1, 2, 3, 4], dire: (v) => pluriel(v, 'couche') },
  { cle: 'rendement', libelle: '1 litre couvre', valeurs: plage(6, 16, 1), dire: (v) => `${nombre(v)} m²/L` },
  { cle: 'pot', libelle: 'Pot de peinture', valeurs: [0.5, 1, 2, 2.5, 3, 5, 10, 15], dire: (v) => `${nombre(v)} L` },
  { cle: 'chute', libelle: 'Marge pour les coupes', valeurs: [0, 0.05, 0.08, 0.1, 0.12, 0.15, 0.2], dire: (v) => `${Math.round(v * 100)} %` },
  { cle: 'paquet', libelle: 'Carton de sol', valeurs: plage(0.5, 4, 0.1), dire: (v) => `${nombre(v)} m²` },
  { cle: 'barre', libelle: 'Barre de plinthe', valeurs: [1, 2, 2.2, 2.4, 2.5, 3], dire: (v) => `${nombre(v)} m` },
];
const CRANS_PRIX: { cle: keyof PrixTravaux; libelle: string }[] = [
  { cle: 'potMurs', libelle: 'Pot pour les murs' },
  { cle: 'potPlafond', libelle: 'Pot pour les plafonds' },
  { cle: 'paquetSol', libelle: 'Carton de sol' },
  { cle: 'barrePlinthe', libelle: 'Barre de plinthe' },
];
const VALEURS_PRIX = [...plage(0, 20, 1), ...plage(22, 60, 2), ...plage(65, 150, 5), ...plage(160, 400, 10)];

type CleCarte = 'murs' | 'plafonds' | 'sol' | 'plinthes' | 'faience';
interface Carte {
  cle: CleCarte;
  titre: string;
  /** Le chiffre, en grand. */
  chiffre: string;
  /** Son unité, à côté : « pots de 2,5 L ». */
  unite: string;
  /** La règle du chiffre — repliée sous « Comment c'est calculé ». */
  detail: string;
  /** La pastille : une couleur du thème, claire ou sombre. */
  teinte: string;
}

export function TravauxSheet({
  visible,
  onClose,
  pieces,
  niveau,
}: {
  visible: boolean;
  onClose: () => void;
  pieces: PieceTravaux[];
  /**
   * Le niveau compté, quand le logement en a plusieurs : la feuille ne
   * compte que celui qu'on regarde, et le dit (correctif de l'audit).
   */
  niveau?: string;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const {
    charge,
    charger,
    hypotheses,
    avecPrix,
    prix,
    horsTravaux,
    faienceMurale,
    regler,
    reglerPrix,
    reglerFaience,
    basculerPrix,
    basculerPiece,
    cocherToutes,
    reinitialiser,
  } = useReglagesTravaux();
  /*
    LA COCHE NE SE REMET PLUS À ZÉRO À L'OUVERTURE : le dossier PDF et le
    tableur la lisent, et ce qu'on voit ici doit être ce qui part.
  */
  // La coche est celle du plan ouvert (revue « Fatou »).
  const plan = useScanStore((st) => st.currentSaveId);
  const choisies = useMemo(
    () => piecesRetenues(pieces, horsTravaux, plan, faienceMurale),
    [pieces, horsTravaux, plan, faienceMurale],
  );
  useEffect(() => {
    if (visible && !charge) charger();
  }, [visible, charge, charger]);
  const [reglages, setReglages] = useState(false);
  const [explications, setExplications] = useState(false);
  const a = useMemo(() => achats(choisies, hypotheses), [choisies, hypotheses]);
  const cout = avecPrix ? coutDesAchats(a, prix) : null;
  const tout = choisies.length === pieces.length;
  const pot = nombre(hypotheses.pot);

  const basculer = (id: string) => {
    haptic('leger');
    basculerPiece(id, plan);
  };

  const carrelees = choisies.filter((p) => p.faienceMurale);
  const cartes: Carte[] = [
    {
      cle: 'murs',
      titre: 'Peinture des murs',
      // Revue « Bernard » : « 3 pots », mais de combien ? En rayon, il ne
      // savait pas quoi prendre.
      chiffre: String(a.murs.pots),
      unite: `pot${a.murs.pots > 1 ? 's' : ''} de ${pot} L`,
      detail:
        `${nombre(a.murs.litres)} L pour ${nombre(a.murs.surface)} m²` +
        (carrelees.length > 0 ? ', faïence murale déduite' : ''),
      teinte: c.blue,
    },
    {
      cle: 'plafonds',
      titre: 'Peinture des plafonds',
      chiffre: String(a.plafonds.pots),
      unite: `pot${a.plafonds.pots > 1 ? 's' : ''} de ${pot} L`,
      detail: `${nombre(a.plafonds.litres)} L pour ${nombre(a.plafonds.surface)} m²`,
      teinte: c.sky,
    },
    {
      cle: 'sol',
      // Revue « Paul » : il cherchait « carrelage » et ne le trouvait pas.
      titre: 'Sol (carrelage, parquet…)',
      chiffre: String(a.sol.paquets),
      unite: `carton${a.sol.paquets > 1 ? 's' : ''} de ${nombre(hypotheses.paquet)} m²`,
      detail: `${nombre(a.sol.avecChute)} m², marge des coupes comprise`,
      teinte: c.amber,
    },
    {
      cle: 'plinthes',
      titre: 'Plinthes',
      chiffre: String(a.plinthes.barres),
      unite: `barre${a.plinthes.barres > 1 ? 's' : ''} de ${nombre(hypotheses.barre)} m`,
      detail: `${nombre(a.plinthes.metres)} m, portes déduites`,
      teinte: c.green,
    },
    /*
      LA FAÏENCE — revue « Paul » : la crédence de la cuisine ; revue du
      retraité bricoleur : les murs des pièces d'eau. Seulement quand il y
      en a.
    */
    ...(a.faience.surface > 0
      ? [
          {
            cle: 'faience' as const,
            titre: 'Faïence',
            chiffre: nombre(a.faience.avecChute),
            unite: 'm²',
            detail:
              [
                a.faience.longueur > 0 ? `crédence : ${nombre(a.faience.longueur)} m de plan de travail × 60 cm` : '',
                ...carrelees.map((p) => `${p.nom} : ${nombre(p.faienceMurale!.surface)} m² de murs`),
              ]
                .filter(Boolean)
                .join(' ; ') + ', marge des coupes comprise',
            teinte: c.inkFaint,
          },
        ]
      : []),
  ];

  /** Les pièces d'eau cochées : leur faïence murale se règle ici. */
  const piecesDEau = pieces.filter(
    (p) => p.faienceSelon && !horsTravaux.includes(cleHorsTravaux(plan, p.roomId)),
  );

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <Text style={s.titre}>Liste d’achats</Text>
      <Text style={s.sous}>
        {tout
          ? niveau
            ? `Pour tout le niveau « ${niveau} ».`
            : 'Pour tout le logement.'
          : `Pour ${choisies.length} pièce${choisies.length > 1 ? 's' : ''} sur ${pieces.length}.`}
      </Text>

      {/* ---------- 1. Les pièces : ce qui détermine tout ---------- */}
      <View style={s.enteteSection} testID="travaux-pieces">
        <Text style={s.section}>Pièces</Text>
        {!tout && pieces.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tout cocher"
            hitSlop={10}
            onPress={() => {
              haptic('leger');
              cocherToutes(pieces.map((p) => p.roomId), plan);
            }}>
            <Text style={s.lien}>Tout cocher</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={s.puces}>
        {pieces.map((p) => {
          const on = !horsTravaux.includes(cleHorsTravaux(plan, p.roomId));
          return (
            <Pressable
              key={p.roomId}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={p.nom}
              style={({ pressed }) => [s.puce, on && s.puceOn, pressed && s.presse]}
              onPress={() => basculer(p.roomId)}>
              <View style={[s.coche, on && s.cocheOn]}>
                {on && (
                  <Svg width={11} height={11} viewBox="0 0 24 24">
                    <Path d={COCHE} stroke="#FFFFFF" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </Svg>
                )}
              </View>
              <Text style={[s.puceTexte, on && s.puceTexteOn]} numberOfLines={1}>
                {p.nom}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {pieces.length === 0 && (
        <Text style={s.vide}>Aucune pièce fermée sur ce plan : tracez ou redétectez les pièces pour en faire les comptes.</Text>
      )}
      {/*
        LA FAÏENCE MURALE DES PIÈCES D'EAU — revue du retraité bricoleur.
        Un cran par pièce, sous les puces : c'est un choix de pièce.
      */}
      {piecesDEau.map((p) => {
        const prise = faienceMurale[cleHorsTravaux(plan, p.roomId)] ?? 'aucune';
        return (
          <View key={p.roomId} style={s.faience} accessibilityRole="radiogroup" accessibilityLabel={`Faïence murale, ${p.nom}`}>
            <Text style={s.faienceTitre} numberOfLines={1}>
              {`Faïence murale · ${p.nom}`}
            </Text>
            <View style={s.segments}>
              {HAUTEURS_FAIENCE.map((h) => {
                const on = prise === h.cle;
                return (
                  <Pressable
                    key={h.cle}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`Faïence murale, ${p.nom} : ${h.libelle}`}
                    style={({ pressed }) => [s.segment, on && s.segmentOn, pressed && s.presse]}
                    onPress={() => {
                      haptic('leger');
                      reglerFaience(p.roomId, plan, h.cle);
                    }}>
                    <Text style={[s.segmentTexte, on && s.segmentTexteOn]} numberOfLines={1}>
                      {h.libelle}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      {/* ---------- 2. Les quantités ---------- */}
      <Text style={[s.section, s.sectionSeule]}>À acheter</Text>
      <View style={s.grille}>
        {cartes.map((k) => (
          <View
            key={k.cle}
            testID={`carte-${k.cle}`}
            style={s.carte}
            accessibilityLabel={`${k.titre} : ${k.chiffre} ${k.unite}, ${k.detail}`}>
            <View style={s.carteTete}>
              <View style={[s.pastille, { backgroundColor: k.teinte }]} />
              <Text style={s.carteTitre} numberOfLines={2}>
                {k.titre}
              </Text>
            </View>
            <Text style={s.carteGros}>
              {k.chiffre}
              <Text style={s.carteUnite}>{` ${k.unite}`}</Text>
            </Text>
            {cout && k.cle !== 'faience' ? <Text style={s.cartePrix}>{`≈ ${euros(cout[k.cle])}`}</Text> : null}
          </View>
        ))}
      </View>
      {/*
        LA PEINTURE, TEINTE PAR TEINTE — correctif de l'audit : les couleurs
        choisies dans « Décorer » s'achètent chacune à part. Diagnostic du
        patron : « Anthracite · Séjo… » — la teinte s'écrit EN ENTIER, ses
        pièces en dessous, discrètes.
      */}
      {a.murs.parTeinte ? (
        <View style={s.teintes} testID="travaux-teintes">
          <Text style={s.carteTitre}>Peinture des murs, par teinte</Text>
          {a.murs.parTeinte.map((t) => (
            <View
              key={t.cle || 'aucune'}
              style={s.teinte}
              accessibilityLabel={`${nomDeTeinte(t.cle)} : ${pluriel(t.pots, 'pot')} de ${pot} L`}>
              <View style={[s.teintePastille, { backgroundColor: hexDePeinture(t.cle || PEINTURE_DEFAUT) ?? c.line }]} />
              <View style={s.teinteTextes}>
                <Text style={s.teinteNom}>{nomDeTeinte(t.cle)}</Text>
                {t.pieces.length > 0 ? <Text style={s.teintePieces}>{t.pieces.join(', ')}</Text> : null}
              </View>
              <Text style={s.teintePots}>
                {String(t.pots)}
                <Text style={s.teinteUnite}>{` pot${t.pots > 1 ? 's' : ''}`}</Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {cout ? (
        <View style={s.total}>
          <Text style={s.totalMot}>Total estimé</Text>
          <Text style={s.totalChiffre}>{`≈ ${euros(cout.total)}`}</Text>
        </View>
      ) : null}

      {/*
        COMMENT C'EST CALCULÉ — toutes les règles, repliées : la mesure de
        chaque achat, chaque teinte, les hypothèses, chaque pièce. Rien ne
        s'est perdu ; tout s'est rangé.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Comment c’est calculé"
        accessibilityState={{ expanded: explications }}
        hitSlop={6}
        style={({ pressed }) => [s.replie, pressed && s.presse]}
        onPress={() => {
          haptic('leger');
          setExplications((v) => !v);
        }}>
        <Text style={s.lien}>Comment c’est calculé</Text>
        <Svg width={14} height={14} viewBox="0 0 24 24" style={explications ? s.chevronOuvert : undefined}>
          <Path d={CHEVRON} stroke={c.blue} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Pressable>
      {explications ? (
        <View style={s.explications} testID="travaux-explications">
          {cartes.map((k) => (
            <Text key={k.cle} style={s.explication}>
              {`${k.titre} : ${k.chiffre} ${k.unite} — ${k.detail}.`}
            </Text>
          ))}
          {(a.murs.parTeinte ?? []).map((t) => (
            <Text key={`t-${t.cle}`} style={s.explication}>
              {`${nomDeTeinte(t.cle)} : ${pluriel(t.pots, 'pot')} de ${pot} L · ${nombre(t.litres)} L pour ${nombre(t.surface)} m².`}
            </Text>
          ))}
          <Text style={[s.explication, s.hypotheses]}>
            {`Calculé pour ${pluriel(hypotheses.couches, 'couche')}, 1 litre pour ${nombre(hypotheses.rendement)} m² ` +
              `(regardez l’étiquette du pot), ${Math.round(hypotheses.chute * 100)} % de marge pour les coupes du sol et des plinthes. ` +
              `Portes et fenêtres déduites.` +
              (cout ? ' Prix indicatifs, à ajuster.' : '')}
          </Text>
          {choisies.map((p) => (
            <Text key={`p-${p.roomId}`} style={s.explication}>
              {`${p.nom} — sol ${nombre(p.sol)} m² · murs ${nombre(p.murs)} m² · hauteur ${p.hauteur.toFixed(2).replace('.', ',')} m` +
                (p.faienceMurale ? ` · faïence ${nombre(p.faienceMurale.surface)} m²` : '')}
            </Text>
          ))}
        </View>
      ) : null}

      {/*
        ---------- 3. L'envoi ----------
        LA LISTE S'EMPORTE, GRATUITEMENT — revue « Bernard » : la page
        d'achats n'existait que dans le PDF, réservé au Pro. Un texte simple
        part par Messages, Mail ou Notes, et se lit en rayon.
      */}
      {a.murs.pots + a.plafonds.pots + a.sol.paquets + a.plinthes.barres > 0 || a.faience.surface > 0 ? (
        <Bouton
          label="Envoyer ma liste"
          style={s.envoyer}
          onPress={() => {
            haptic('leger');
            const texte = [
              tout ? 'Ma liste d’achats' : `Ma liste d’achats (${pluriel(choisies.length, 'pièce')})`,
              ...cartes
                .filter((k) => k.chiffre !== '0')
                .map((k) => `• ${k.titre} : ${k.chiffre} ${k.unite} (${k.detail})`),
              ...(a.murs.parTeinte ?? []).map(
                (t) => `  – ${nomDeTeinte(t.cle)}${t.pieces.length > 0 ? ` (${t.pieces.join(', ')})` : ''} : ${pluriel(t.pots, 'pot')} de ${pot} L`,
              ),
            ].join('\n');
            Share.share({ message: texte }).catch(() => {});
          }}
        />
      ) : null}

      {/*
        DEUX BOUTONS JUMEAUX, LE MOT AU CENTRE — diagnostic du patron :
        « texte sur bouton mal centré ». « Estimer le prix » portait un
        interrupteur collé à son bord droit, qui poussait le mot à gauche.
        Le bouton se remplit quand le prix est affiché, comme « Régler le
        calcul » quand ses crans sont ouverts : l'état se lit sans élément
        de côté.
      */}
      <View style={s.boutons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Régler le calcul"
          accessibilityState={{ expanded: reglages }}
          style={({ pressed }) => [s.bouton, reglages && s.boutonOn, pressed && s.presse]}
          onPress={() => {
            haptic('leger');
            setReglages((v) => !v);
          }}>
          <Text style={[s.boutonTexte, reglages && s.boutonTexteOn]} numberOfLines={1}>
            Régler le calcul
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Estimer le prix"
          accessibilityState={{ checked: avecPrix }}
          style={({ pressed }) => [s.bouton, avecPrix && s.boutonOn, pressed && s.presse]}
          onPress={() => {
            haptic('leger');
            basculerPrix();
          }}>
          <Text style={[s.boutonTexte, avecPrix && s.boutonTexteOn]} numberOfLines={1}>
            Estimer le prix
          </Text>
        </Pressable>
      </View>

      {reglages ? (
        <View style={s.reglages}>
          {CRANS.map((r) => (
            <Cran
              key={r.cle}
              libelle={r.libelle}
              valeur={r.dire(hypotheses[r.cle])}
              onMoins={() => regler({ [r.cle]: cran(r.valeurs, hypotheses[r.cle], -1) })}
              onPlus={() => regler({ [r.cle]: cran(r.valeurs, hypotheses[r.cle], 1) })}
            />
          ))}
          {avecPrix
            ? CRANS_PRIX.map((r) => (
                <Cran
                  key={r.cle}
                  libelle={r.libelle}
                  valeur={euros(prix[r.cle])}
                  onMoins={() => reglerPrix({ [r.cle]: cran(VALEURS_PRIX, prix[r.cle], -1) })}
                  onPlus={() => reglerPrix({ [r.cle]: cran(VALEURS_PRIX, prix[r.cle], 1) })}
                />
              ))
            : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Revenir aux valeurs courantes"
            hitSlop={10}
            onPress={() => {
              haptic('leger');
              reinitialiser();
            }}>
            <Text style={s.remise}>Revenir aux valeurs courantes</Text>
          </Pressable>
        </View>
      ) : null}
    </SheetShell>
  );
}

/** Une ligne de réglage : son nom, sa valeur, deux crans. */
function Cran({
  libelle,
  valeur,
  onMoins,
  onPlus,
}: {
  libelle: string;
  valeur: string;
  onMoins: () => void;
  onPlus: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const bouton = (signe: '−' | '+', mot: 'moins' | 'plus', faire: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle} : ${mot}`}
      hitSlop={6}
      style={({ pressed }) => [s.cranBouton, pressed && s.presse]}
      onPress={() => {
        haptic('leger');
        faire();
      }}>
      <Text style={s.cranSigne}>{signe}</Text>
    </Pressable>
  );
  return (
    <View style={s.cran}>
      <Text style={s.cranLibelle} numberOfLines={1}>
        {libelle}
      </Text>
      {bouton('−', 'moins', onMoins)}
      <Text style={s.cranValeur} numberOfLines={1}>
        {valeur}
      </Text>
      {bouton('+', 'plus', onPlus)}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    titre: { color: c.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
    sous: { color: c.inkSoft, fontSize: 14, marginTop: 3 },
    enteteSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
    section: {
      color: c.inkSoft,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    sectionSeule: { marginTop: 22, marginBottom: 8 },
    lien: { color: c.blue, fontSize: 14, fontWeight: '600' },
    presse: { opacity: 0.6 },
    puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    puce: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      minHeight: 36,
      maxWidth: '100%',
      paddingLeft: 9,
      paddingRight: 13,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.lineStrong,
    },
    puceOn: { backgroundColor: c.blueSoft, borderColor: c.blue },
    puceTexte: { color: c.inkSoft, fontSize: 14.5, fontWeight: '600', flexShrink: 1 },
    puceTexteOn: { color: c.ink },
    coche: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: c.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cocheOn: { backgroundColor: c.blue, borderColor: c.blue },
    vide: { color: c.inkSoft, fontSize: 14, lineHeight: 20, paddingVertical: 8 },
    faience: { marginTop: 12 },
    faienceTitre: { color: c.inkSoft, fontSize: 13, fontWeight: '600', marginBottom: 6 },
    segments: {
      flexDirection: 'row',
      gap: 4,
      padding: 3,
      borderRadius: radius.pill,
      backgroundColor: c.bg,
    },
    segment: {
      flexGrow: 1,
      minHeight: 32,
      paddingHorizontal: 8,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentOn: { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
    segmentTexte: { color: c.inkSoft, fontSize: 13, fontWeight: '600', textAlign: 'center' },
    segmentTexteOn: { color: c.ink, fontWeight: '700' },
    grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    carte: {
      width: '48.5%',
      backgroundColor: c.bg,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    carteTete: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    pastille: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    carteTitre: { color: c.inkSoft, fontSize: 13, fontWeight: '600', flexShrink: 1 },
    carteGros: { color: c.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, marginTop: 6 },
    carteUnite: { color: c.inkSoft, fontSize: 13.5, fontWeight: '600', letterSpacing: 0 },
    cartePrix: { color: c.ink, fontSize: 13, fontWeight: '700', marginTop: 2 },
    teintes: { marginTop: 10, backgroundColor: c.bg, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    teinte: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    teintePastille: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.lineStrong,
    },
    teinteTextes: { flex: 1, minWidth: 0 },
    teinteNom: { color: c.ink, fontSize: 15, fontWeight: '600' },
    teintePieces: { color: c.inkSoft, fontSize: 12.5, marginTop: 1 },
    teintePots: { color: c.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
    teinteUnite: { color: c.inkSoft, fontSize: 13, fontWeight: '600', letterSpacing: 0 },
    total: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: radius.md,
      backgroundColor: c.blueSoft,
    },
    totalMot: { color: c.ink, fontSize: 15, fontWeight: '700' },
    totalChiffre: { color: c.blue, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
    replie: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, marginTop: 14, paddingVertical: 4 },
    chevronOuvert: { transform: [{ rotate: '180deg' }] },
    explications: { marginTop: 6, gap: 6, backgroundColor: c.bg, borderRadius: radius.md, padding: 12 },
    explication: { color: c.inkSoft, fontSize: 13, lineHeight: 18 },
    hypotheses: { color: c.ink },
    envoyer: { marginTop: 18 },
    boutons: { flexDirection: 'row', gap: 10, marginTop: 10 },
    bouton: {
      flex: 1,
      minHeight: 44,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    boutonOn: { backgroundColor: c.blue, borderColor: c.blue },
    boutonTexte: { color: c.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' },
    boutonTexteOn: { color: '#FFFFFF' },
    reglages: { marginTop: 12, backgroundColor: c.bg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 },
    cran: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    cranLibelle: { flex: 1, color: c.ink, fontSize: 14, fontWeight: '600' },
    cranBouton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cranSigne: { color: c.blue, fontSize: 18, fontWeight: '700', marginTop: -1 },
    cranValeur: { minWidth: 78, textAlign: 'center', color: c.ink, fontSize: 14, fontWeight: '700' },
    remise: { color: c.blue, fontSize: 13.5, fontWeight: '600', paddingVertical: 10, textAlign: 'center' },
  }),
);
