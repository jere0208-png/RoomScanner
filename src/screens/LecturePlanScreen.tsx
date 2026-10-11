/**
 * LIRE UN PLAN PAPIER — la page.
 *
 * Relevé du patron : « une grosse mise à jour strictement fonctionnelle :
 * lecture de plan papier, à la place de "Comment ça marche" sur l'accueil.
 * On ouvre une page photo avec les détails qui demandent à scanner un plan
 * papier de manière moderne. Si la vision détecte le plan, il le scanne, et
 * crée à partir de celui-ci un plan 2D. Le système doit être fiable et
 * facilement utilisable. »
 *
 * QUATRE MOMENTS, UNE PAGE.
 *
 *   1. L'INVITATION — ce qu'il faut pour une bonne lecture, en quatre
 *      images, et deux portes : le scanner (la feuille se détecte, se prend
 *      et se redresse seule) ou une photo déjà prise.
 *   2. LA LECTURE — la page prise, une ligne qui la balaie, et les étapes
 *      qui s'allument : on voit que ça travaille, et sur quoi.
 *   3. CE QU'ON A LU — le plan reconstruit, dessiné, et son bilan : les
 *      cotes qui le tiennent, ce qui a été écarté, les murs à vérifier, les
 *      symboles convertis à nos appareils. On le crée d'un appui, ou l'on
 *      reprend la photo. Rien n'est créé sans qu'on l'ait vu.
 *   4. CE QUI BLOQUE — dit en clair, avec la seule porte utile : se
 *      connecter, passer au Pro, réessayer.
 *
 * FIABLE, ET QUI LE DIT. La lecture annonce sa confiance : « bonne » quand
 * chaque mur est tenu par des cotes qui s'accordent (sur le banc, un plan
 * annoncé bon est juste à trois centimètres près 98 fois sur 100), « à
 * vérifier » sinon, et les murs en cause se dessinent en orange.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { roomParts, segLength } from '../geometry/floorplan';
import { reconstruirePlan, type PlanLu } from '../geometry/lecturePlan';
import { importerUnPlan, ouvrirUnFichier, pageDuPdf, scannerUnPlan, type PageDePlan } from '../native/lecturePlan';
import { envoyerLePlan, type ReponseDeLecture } from '../net/lecturePlan';
import { useAccountStore } from '../store/accountStore';
import { useScanStore } from '../store/scanStore';
import { radius, shadowCard, useTheme, type Palette } from '../theme';
import { ENCRE_ELEC } from '../ui/encreElec';
import { haptic } from '../ui/haptic';
import { SOLAIRES } from '../ui/solaires';

/** Ce qu'il faut pour qu'une lecture réussisse — dit avant, pas après. */
const CONSEILS: { icone: keyof typeof SOLAIRES; titre: string; texte: string }[] = [
  { icone: 'soleil', titre: 'Bien éclairé', texte: 'Sans reflet ni ombre portée : près d’une fenêtre, flash éteint.' },
  { icone: 'scanner', titre: 'La feuille entière', texte: 'Ses quatre coins dans le cadre, posée à plat sur une table.' },
  { icone: 'cotes2d', titre: 'Les cotes lisibles', texte: 'Ce sont elles qui donnent les mesures exactes : rien ne les cache.' },
  { icone: 'prise', titre: 'Les symboles aussi', texte: 'Prises, interrupteurs, points lumineux : ils seront convertis aux nôtres.' },
];

/** Les étapes de la lecture, dans l'ordre où elles se font. */
const ETAPES = ['Page redressée et textes lus', 'Lecture du plan par l’IA', 'Mise à l’échelle sur les cotes', 'Reconstruction des pièces'];

type Etat =
  | { phase: 'invitation' }
  | { phase: 'apercu'; page: PageDePlan; charge?: boolean }
  | { phase: 'lecture'; page: PageDePlan; etape: number }
  | { phase: 'lu'; page: PageDePlan; plan: PlanLu; essai: boolean }
  | {
      phase: 'echec';
      page?: PageDePlan;
      motif: Extract<ReponseDeLecture, { ok: false }>['motif'] | 'plan' | 'fichier';
      message: string;
    };

/**
 * LA PAGE QUI ATTEND LA RECONNEXION — relevé du patron : « ils me disent "Un
 * compte, d'abord" et me proposent de me connecter, bouton qui ne fait rien.
 * Je suis pourtant connecté. »
 *
 * Le compte était là, sans jeton : la connexion s'était faite pendant que le
 * serveur ne répondait pas, ou son jeton ne valait plus. Seule une nouvelle
 * connexion en rend un. « Me reconnecter » ouvre donc la connexion — et la
 * page déjà prise attend ici : de retour, on la relance sans rescanner.
 */
let pageARelire: PageDePlan | null = null;

/** Pourquoi le fichier ne s'ouvre pas, en clair. */
const MOTS_DU_FICHIER: Record<'format' | 'protege' | 'vide', string> = {
  format: 'Il faut un PDF ou une image (JPEG, PNG, HEIC). Enregistrez le plan dans l’un de ces formats, puis ouvrez-le.',
  protege:
    'Ce PDF est protégé par un mot de passe : ouvrez-le, enregistrez-en une copie sans protection, puis choisissez cette copie.',
  vide: 'Ce PDF ne contient aucune page.',
};

export function LecturePlanScreen() {
  const c = useTheme();
  const s = useMemo(() => themed(c), [c]);
  const insets = useSafeAreaInsets();
  const setScreen = useScanStore((st) => st.setScreen);
  const ouvrirPlanLu = useScanStore((st) => st.ouvrirPlanLu);
  const demanderLesTarifs = useScanStore((st) => st.demanderLesTarifs);
  const compte = useAccountStore((st) => st.compte);
  const jeton = useAccountStore((st) => st.jeton);
  const pro = useAccountStore((st) => st.pro);
  const proVia = useAccountStore((st) => st.proVia);
  const quitterInvite = useAccountStore((st) => st.quitterInvite);
  const [etat, setEtat] = useState<Etat>(() => {
    // De retour de la connexion : la page prise avant attend sa lecture.
    const p = pageARelire;
    pageARelire = null;
    return p && compte && jeton ? { phase: 'apercu', page: p } : { phase: 'invitation' };
  });
  const deconnecter = useAccountStore((st) => st.deconnecter);
  /** Ce que dit l'écran quand le serveur ne nous reconnaît pas. */
  const sansIdentite = (): Etat => ({
    phase: 'echec',
    motif: 'compte',
    message: compte
      ? 'Le serveur d’EchoPlan n’a pas validé votre connexion : elle s’est faite hors ligne, ou elle a expiré. Reconnectez-vous une fois, et vous reviendrez ici.'
      : 'Connectez-vous pour faire lire un plan : la lecture d’essai est attachée à votre compte.',
  });
  /** La lecture en cours : celle qu'on quitte ne doit plus rien écrire. */
  const enCours = useRef(0);
  useEffect(() => () => void (enCours.current += 1), []);

  const lire = async (page: PageDePlan) => {
    const n = ++enCours.current;
    setEtat({ phase: 'lecture', page, etape: 1 });
    const r = await envoyerLePlan(
      page,
      compte && jeton ? { identifiant: compte.id, jeton } : null,
      pro && proVia === 'abonnement',
    );
    if (n !== enCours.current) return;
    if (!r.ok) {
      haptic('alerte');
      setEtat({ phase: 'echec', page, motif: r.motif, message: r.message });
      return;
    }
    setEtat({ phase: 'lecture', page, etape: 3 });
    const plan = reconstruirePlan(r.lecture, { largeur: page.largeur, hauteur: page.hauteur });
    if (n !== enCours.current) return;
    if (!plan.ok) {
      haptic('alerte');
      setEtat({ phase: 'echec', page, motif: 'plan', message: plan.raison });
      return;
    }
    haptic('succes');
    setEtat({ phase: 'lu', page, plan: plan.plan, essai: r.essai });
  };

  const prendre = async (source: 'scanner' | 'photo' | 'fichier') => {
    haptic('leger');
    /*
      L'IDENTITÉ D'ABORD, LA FEUILLE ENSUITE : scanner un plan pour
      apprendre après coup qu'il faut se (re)connecter, c'est un geste perdu.
    */
    if (!compte || !jeton) {
      setEtat(sansIdentite());
      return;
    }
    if (source === 'fichier') {
      const r = await ouvrirUnFichier();
      if (!r) return;
      if ('erreur' in r) {
        haptic('alerte');
        setEtat({ phase: 'echec', motif: 'fichier', message: MOTS_DU_FICHIER[r.erreur] });
        return;
      }
      /*
        UN PDF DE PLUSIEURS PAGES SE MONTRE AVANT DE PARTIR : une lecture
        coûte, et la page de garde d'un dossier n'est pas un plan. Le natif
        a retenu la page la plus cotée ; on en change d'un geste.
      */
      if ((r.pages ?? 1) > 1) {
        setEtat({ phase: 'apercu', page: r });
        return;
      }
      await lire(r);
      return;
    }
    const page = source === 'scanner' ? await scannerUnPlan() : await importerUnPlan();
    if (page) await lire(page);
  };

  const changerDePage = async (n: number) => {
    if (etat.phase !== 'apercu') return;
    const avant = etat.page;
    setEtat({ phase: 'apercu', page: avant, charge: true });
    const p = await pageDuPdf(n);
    setEtat({ phase: 'apercu', page: p ?? avant });
  };

  const seReconnecter = (page?: PageDePlan) => {
    pageARelire = page ?? null;
    haptic('leger');
    // Plus de compte à l'écran : la porte de connexion s'ouvre, et l'app
    // revient sur cette page une fois reconnecté (`screen` n'a pas bougé).
    if (compte) deconnecter();
    else quitterInvite();
  };

  const creer = (plan: PlanLu) => {
    haptic('succes');
    ouvrirPlanLu(plan, `Plan lu le ${new Date().toLocaleDateString('fr-FR')}`);
  };

  const retour = () => {
    enCours.current += 1;
    setScreen('home');
  };

  return (
    <RetourGlisse onRetour={retour} style={[s.fond, { paddingTop: insets.top }]}>
      <View style={s.barre}>
        <Pressable accessibilityRole="button" accessibilityLabel="Retour" style={s.rondBarre} hitSlop={10} onPress={retour}>
          <BackChevron color={c.ink} />
        </Pressable>
        <Text style={s.titreBarre}>Lire un plan papier</Text>
        <View style={s.videBarre} />
      </View>
      <ScrollView
        contentContainerStyle={[s.contenu, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>
        {etat.phase === 'invitation' && (
          <Invitation
            s={s}
            c={c}
            pro={pro}
            onScanner={() => void prendre('scanner')}
            onPhoto={() => void prendre('photo')}
            onFichier={() => void prendre('fichier')}
          />
        )}
        {etat.phase === 'apercu' && (
          <Apercu
            s={s}
            c={c}
            page={etat.page}
            charge={!!etat.charge}
            onPage={(n) => void changerDePage(n)}
            onLire={() => void lire(etat.page)}
            onAutre={() => setEtat({ phase: 'invitation' })}
          />
        )}
        {etat.phase === 'lecture' && <Lecture s={s} c={c} page={etat.page} etape={etat.etape} />}
        {etat.phase === 'lu' && (
          <Lu
            s={s}
            c={c}
            plan={etat.plan}
            essai={etat.essai}
            onCreer={() => creer(etat.plan)}
            onReprendre={() => setEtat({ phase: 'invitation' })}
          />
        )}
        {etat.phase === 'echec' && (
          <View testID="lecture-echec" style={s.carte}>
            <Text style={s.echecTitre}>
              {etat.motif === 'pro'
                ? 'Réservé au Pro'
                : etat.motif === 'compte'
                  ? compte
                    ? 'Reconnectez-vous'
                    : 'Un compte, d’abord'
                  : etat.motif === 'plan'
                    ? 'Ce plan ne se lit pas'
                    : etat.motif === 'fichier'
                      ? 'Ce fichier ne s’ouvre pas'
                      : 'La lecture n’a pas abouti'}
            </Text>
            <Text style={s.echecTexte}>{etat.message}</Text>
            {etat.motif === 'pro' && (
              <Bouton s={s} principal libelle="Passer au Pro" onPress={() => demanderLesTarifs()} />
            )}
            {etat.motif === 'compte' && (
              <Bouton
                s={s}
                principal
                libelle={compte ? 'Me reconnecter' : 'Me connecter'}
                onPress={() => seReconnecter(etat.page)}
              />
            )}
            {(etat.motif === 'reseau' || etat.motif === 'refus') && etat.page && (
              <Bouton s={s} principal libelle="Réessayer" onPress={() => void lire(etat.page!)} />
            )}
            <Bouton
              s={s}
              libelle={etat.motif === 'fichier' ? 'Choisir un autre fichier' : 'Reprendre une photo'}
              onPress={() => setEtat({ phase: 'invitation' })}
            />
          </View>
        )}
      </ScrollView>
    </RetourGlisse>
  );
}

// ------------------------------------------------------------------ 1. l'invitation

function Invitation({
  s,
  c,
  pro,
  onScanner,
  onPhoto,
  onFichier,
}: {
  s: ReturnType<typeof themed>;
  c: Palette;
  pro: boolean;
  onScanner: () => void;
  onPhoto: () => void;
  onFichier: () => void;
}) {
  return (
    <>
      <View style={s.heros}>
        <FeuilleDessinee c={c} />
        <Text style={s.herosTitre}>Votre plan papier, en plan 2D</Text>
        <Text style={s.herosTexte}>
          Photographiez la feuille, ou ouvrez le plan reçu en PDF : ses murs, ses cotes, ses pièces et ses symboles
          électriques sont lus, mis à l’échelle et redessinés. Vous vérifiez, puis vous modifiez comme n’importe quel
          plan.
        </Text>
      </View>
      {CONSEILS.map((k) => (
        <View key={k.titre} style={s.conseil}>
          <View style={s.conseilIcone}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d={SOLAIRES[k.icone]} fill={c.blue} fillRule="evenodd" />
            </Svg>
          </View>
          <View style={s.conseilTextes}>
            <Text style={s.conseilTitre}>{k.titre}</Text>
            <Text style={s.conseilTexte}>{k.texte}</Text>
          </View>
        </View>
      ))}
      <Bouton s={s} principal libelle="Scanner le plan" onPress={onScanner} />
      <Bouton s={s} libelle="Importer une photo" onPress={onPhoto} />
      <Bouton s={s} libelle="Ouvrir un fichier" onPress={onFichier} />
      <Text style={s.mention}>PDF ou image, depuis Fichiers, iCloud Drive ou une pièce jointe enregistrée.</Text>
      <Text style={s.mention}>
        {pro
          ? 'Compris dans votre abonnement Pro.'
          : 'Une lecture offerte pour essayer, puis réservée au Pro.'}{' '}
        Le plan est lu par une IA (Claude, d’Anthropic) : nous ne le gardons pas.
      </Text>
    </>
  );
}

/** Une feuille de plan, ses coins de cadrage : ce que le scanner cherche. */
function FeuilleDessinee({ c }: { c: Palette }) {
  const coin = (x: number, y: number, sx: number, sy: number) => `M${x} ${y + sy * 14} V${y} H${x + sx * 14}`;
  return (
    <Svg width={150} height={118} viewBox="0 0 150 118">
      <Rect x={22} y={14} width={106} height={90} rx={6} fill={c.surface} stroke={c.line} strokeWidth={1.5} />
      <Path d="M38 32 H112 V88 H38 Z M38 60 H76 M76 32 V88 M92 60 V88" stroke={c.ink} strokeWidth={3} fill="none" strokeLinejoin="round" />
      <Line x1={38} y1={24} x2={112} y2={24} stroke={c.inkFaint} strokeWidth={1} />
      <Path d={[coin(12, 6, 1, 1), coin(138, 6, -1, 1), coin(12, 112, 1, -1), coin(138, 112, -1, -1)].join(' ')} stroke={c.blue} strokeWidth={3} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

// ------------------------------------------------------------------ 1 bis. l'aperçu

/**
 * LA PAGE AVANT LA LECTURE — un PDF de plusieurs pages, ou la page qui
 * attendait une reconnexion. On voit ce qui va partir, on change de page,
 * et rien n'est envoyé avant « Lire ».
 */
function Apercu({
  s,
  c,
  page,
  charge,
  onPage,
  onLire,
  onAutre,
}: {
  s: ReturnType<typeof themed>;
  c: Palette;
  page: PageDePlan;
  charge: boolean;
  onPage: (n: number) => void;
  onLire: () => void;
  onAutre: () => void;
}) {
  const { width } = useWindowDimensions();
  const larg = Math.min(width - 44, 420);
  const haut = Math.min(larg * (page.hauteur / Math.max(1, page.largeur)), 420);
  const n = page.page ?? 1;
  const total = page.pages ?? 1;
  return (
    <View testID="apercu-du-fichier">
      <View style={[s.page, { width: larg, height: haut }]}>
        <Image source={{ uri: `data:image/jpeg;base64,${page.base64}` }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        {charge && (
          <View style={[StyleSheet.absoluteFill, s.voile]}>
            <ActivityIndicator color={c.blue} />
          </View>
        )}
      </View>
      {total > 1 && (
        <>
          <Text style={s.bilan}>
            Page {n} sur {total}
          </Text>
          <Text style={s.mention}>Retenue : celle qui porte le plus de cotes. Changez-en si ce n’est pas le plan.</Text>
          <View style={s.rangee}>
            {n > 1 && <Bouton s={s} libelle="Page précédente" onPress={() => onPage(n - 1)} />}
            {n < total && <Bouton s={s} libelle="Page suivante" onPress={() => onPage(n + 1)} />}
          </View>
        </>
      )}
      <Bouton s={s} principal libelle={total > 1 ? 'Lire cette page' : 'Lire ce plan'} onPress={onLire} />
      <Bouton s={s} libelle="Choisir un autre plan" onPress={onAutre} />
    </View>
  );
}

// ------------------------------------------------------------------ 2. la lecture

function Lecture({ s, c, page, etape }: { s: ReturnType<typeof themed>; c: Palette; page: PageDePlan; etape: number }) {
  const { width } = useWindowDimensions();
  const larg = Math.min(width - 44, 420);
  const haut = Math.min(larg * (page.hauteur / Math.max(1, page.largeur)), 360);
  const balai = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(balai, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(balai, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [balai]);
  /* La seconde étape dure : on l'annonce, puis la suivante s'allume d'elle-même
     si la réponse tarde — l'écran ne reste pas figé sur un seul mot. */
  const [patience, setPatience] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPatience((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <View testID="lecture-en-cours">
      <View style={[s.page, { width: larg, height: haut }]}>
        <Image source={{ uri: `data:image/jpeg;base64,${page.base64}` }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        <Animated.View
          pointerEvents="none"
          style={[
            s.balai,
            { transform: [{ translateY: balai.interpolate({ inputRange: [0, 1], outputRange: [0, haut - 3] }) }] },
          ]}
        />
      </View>
      {ETAPES.map((e, i) => {
        const faite = i < etape;
        const active = i === etape;
        return (
          <View key={e} style={s.etape}>
            {faite ? (
              <Text style={[s.etapeMarque, { color: c.green }]}>✓</Text>
            ) : active ? (
              <ActivityIndicator size="small" color={c.blue} />
            ) : (
              <Text style={[s.etapeMarque, { color: c.inkFaint }]}>•</Text>
            )}
            <Text style={[s.etapeTexte, !faite && !active && { color: c.inkFaint }]}>{e}</Text>
          </View>
        );
      })}
      <Text style={s.mention}>
        {patience < 20
          ? 'La lecture prend de vingt secondes à une minute selon le plan.'
          : 'Un plan chargé demande un peu plus : la lecture continue.'}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ 3. ce qu'on a lu

function Lu({
  s,
  c,
  plan,
  essai,
  onCreer,
  onReprendre,
}: {
  s: ReturnType<typeof themed>;
  c: Palette;
  plan: PlanLu;
  essai: boolean;
  onCreer: () => void;
  onReprendre: () => void;
}) {
  const r = plan.rapport;
  const teinte = r.confiance === 'bonne' ? c.green : r.confiance === 'moyenne' ? c.amber : c.danger;
  const mot =
    r.confiance === 'bonne' ? 'Lecture sûre' : r.confiance === 'moyenne' ? 'Lecture à vérifier' : 'Lecture fragile';
  const conversions = useMemo(() => {
    const vus = new Map<string, number>();
    for (const x of r.symboles.convertis) {
      const cle = x.lu.toLowerCase() === x.vers.toLowerCase() ? x.vers : `${x.lu} → ${x.vers}`;
      vus.set(cle, (vus.get(cle) ?? 0) + 1);
    }
    return [...vus.entries()].slice(0, 8);
  }, [r.symboles.convertis]);
  return (
    <View testID="lecture-lue">
      <View style={s.carte}>
        <View style={s.confiance}>
          <View style={[s.pastille, { backgroundColor: teinte }]} />
          <Text style={[s.confianceMot, { color: teinte }]}>{mot}</Text>
        </View>
        <ApercuDuPlanLu plan={plan} c={c} />
        <Text style={s.bilan}>
          {plan.rooms.length} pièce{plan.rooms.length > 1 ? 's' : ''} · {plan.walls.length} murs ·{' '}
          {plan.openings.length} ouverture{plan.openings.length > 1 ? 's' : ''} · {r.symboles.poses} appareil
          {r.symboles.poses > 1 ? 's' : ''}
        </Text>
      </View>

      <View style={s.carte}>
        <Text style={s.carteTitre}>Les mesures</Text>
        <Text style={s.ligne}>
          {r.echelleDepuis === 'cotes'
            ? `${r.cotes.retenues} cote${r.cotes.retenues > 1 ? 's' : ''} lue${r.cotes.retenues > 1 ? 's' : ''} tiennent le plan`
            : r.echelleDepuis === 'surfaces'
              ? 'Aucune cote lisible : l’échelle vient des surfaces écrites'
              : 'Aucune cote lisible : l’échelle vient de la largeur des portes'}
          {r.cotes.relues > 0 ? ` (dont ${r.cotes.relues} relue${r.cotes.relues > 1 ? 's' : ''} dans leur unité)` : ''}.
        </Text>
        {r.cotes.ecartees.length > 0 && (
          <Text style={[s.ligne, { color: c.amber }]}>
            Écartée{r.cotes.ecartees.length > 1 ? 's' : ''} : {r.cotes.ecartees.map((e) => `« ${e.texte} »`).join(', ')} — contredite
            {r.cotes.ecartees.length > 1 ? 's' : ''} par le reste du plan.
          </Text>
        )}
        {r.murs.aVerifier.length > 0 && (
          <Text style={[s.ligne, { color: c.amber }]}>
            {r.murs.aVerifier.length} mur{r.murs.aVerifier.length > 1 ? 's' : ''} sans cote qui le
            {r.murs.aVerifier.length > 1 ? 's' : ''} confirme, en orange : vérifiez-le
            {r.murs.aVerifier.length > 1 ? 's' : ''} sur la feuille.
          </Text>
        )}
        {r.surfacesDouteuses.map((d) => (
          <Text key={d.piece} style={[s.ligne, { color: c.amber }]}>
            {d.piece} : {d.ecrite} m² écrits, {d.calculee} m² dessinés.
          </Text>
        ))}
      </View>

      {(conversions.length > 0 || r.symboles.inconnus.length > 0) && (
        <View style={s.carte}>
          <Text style={s.carteTitre}>Les symboles</Text>
          {conversions.map(([k, n]) => (
            <Text key={k} style={s.ligne}>
              {n > 1 ? `${n} × ` : ''}
              {k}
            </Text>
          ))}
          {r.symboles.inconnus.length > 0 && (
            <Text style={[s.ligne, { color: c.amber }]}>
              Non reconnu{r.symboles.inconnus.length > 1 ? 's' : ''}, non posé{r.symboles.inconnus.length > 1 ? 's' : ''} :{' '}
              {r.symboles.inconnus.slice(0, 5).join(', ')}.
            </Text>
          )}
        </View>
      )}

      <Bouton s={s} principal libelle="Créer le plan" onPress={onCreer} />
      <Bouton s={s} libelle="Reprendre la photo" onPress={onReprendre} />
      {essai && (
        <Text style={s.mention}>C’était votre lecture d’essai : les suivantes sont comprises dans le Pro.</Text>
      )}
    </View>
  );
}

/** Le plan reconstruit, à la largeur de la carte : murs, baies, pièces, appareils. */
function ApercuDuPlanLu({ plan, c }: { plan: PlanLu; c: Palette }) {
  const { width } = useWindowDimensions();
  const L = Math.min(width - 76, 400);
  const xs = plan.walls.flatMap((w) => [w.a.x, w.b.x]);
  const zs = plan.walls.flatMap((w) => [w.a.z, w.b.z]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const larg = Math.max(0.5, Math.max(...xs) - x0);
  const prof = Math.max(0.5, Math.max(...zs) - z0);
  const k = Math.min((L - 16) / larg, 280 / prof);
  const H = prof * k + 16;
  const px = (p: { x: number; z: number }) => ({ x: 8 + (p.x - x0) * k, y: 8 + (p.z - z0) * k });
  const aVerifier = new Set(plan.rapport.murs.aVerifier);
  const parts = useMemo(() => roomParts(plan.walls, plan.rooms), [plan.walls, plan.rooms]);
  return (
    <Svg testID="apercu-plan-lu" width={L} height={H} style={{ alignSelf: 'center', marginVertical: 8 }}>
      {plan.walls.map((w) => {
        const a = px(w.a);
        const b = px(w.b);
        return (
          <Line
            key={w.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={aVerifier.has(w.id) ? c.amber : c.ink}
            strokeWidth={Math.max(2, (w.epaisseur ?? 0.14) * k)}
            strokeLinecap="square"
          />
        );
      })}
      {plan.openings.map((o) => {
        const a = px(o.a);
        const b = px(o.b);
        const w = plan.walls.find((m) => segLength(m) > 0);
        return (
          <Line
            key={o.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={o.type === 'window' ? c.sky : c.surface}
            strokeWidth={Math.max(2.5, ((w?.epaisseur ?? 0.14) * k) / 1.4)}
          />
        );
      })}
      {plan.fixtures.map((f) => {
        const w = plan.walls.find((m) => m.id === f.wallId);
        if (!w) return null;
        const len = segLength(w) || 1;
        const t = f.along / len;
        const p = px({ x: w.a.x + (w.b.x - w.a.x) * t, z: w.a.z + (w.b.z - w.a.z) * t });
        return <Rect key={f.id} x={p.x - 2} y={p.y - 2} width={4} height={4} rx={1} fill={ENCRE_ELEC} />;
      })}
      {plan.ceiling.map((cl) => {
        const p = px(cl.at);
        return <Rect key={cl.id} x={p.x - 2.5} y={p.y - 2.5} width={5} height={5} rx={2.5} fill={ENCRE_ELEC} opacity={0.75} />;
      })}
      {parts.map((p) => {
        const nom = plan.rooms.find((r) => r.id === p.roomId)?.name;
        if (!nom || !p.surface) return null;
        const q = px(p.labelAt);
        return (
          <SvgText key={p.roomId} x={q.x} y={q.y + 4} fontSize={11} fontWeight="600" fill={c.inkSoft} textAnchor="middle">
            {nom}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ------------------------------------------------------------------ les boutons

function Bouton({
  s,
  libelle,
  principal,
  onPress,
}: {
  s: ReturnType<typeof themed>;
  libelle: string;
  principal?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      style={({ pressed }) => [principal ? s.boutonPrincipal : s.boutonSecond, pressed && { opacity: 0.75 }]}
      onPress={onPress}>
      <Text style={principal ? s.boutonPrincipalTexte : s.boutonSecondTexte}>{libelle}</Text>
    </Pressable>
  );
}

const themed = (c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    barre: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
      marginTop: 8,
      marginBottom: 10,
    },
    rondBarre: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.07,
    },
    titreBarre: { color: c.ink, fontSize: 17, fontWeight: '700' },
    videBarre: { width: 40, height: 40 },
    contenu: { paddingHorizontal: 22 },
    heros: { alignItems: 'center', marginBottom: 14 },
    herosTitre: { color: c.ink, fontSize: 21, fontWeight: '800', textAlign: 'center', marginTop: 6 },
    herosTexte: { color: c.inkSoft, fontSize: 14.5, lineHeight: 20, textAlign: 'center', marginTop: 8 },
    conseil: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 12,
      marginBottom: 8,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    conseilIcone: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    conseilTextes: { flex: 1 },
    conseilTitre: { color: c.ink, fontSize: 14.5, fontWeight: '700' },
    conseilTexte: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 2 },
    boutonPrincipal: {
      height: 52,
      borderRadius: 26,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    boutonPrincipalTexte: { color: '#FFFFFF', fontSize: 16.5, fontWeight: '700' },
    boutonSecond: {
      height: 48,
      borderRadius: 24,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      borderWidth: 1,
      borderColor: c.line,
    },
    boutonSecondTexte: { color: c.blue, fontSize: 15.5, fontWeight: '600' },
    mention: { color: c.inkSoft, fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: 14 },
    rangee: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
    voile: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)' },
    page: {
      alignSelf: 'center',
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: c.surface,
      marginBottom: 16,
      ...shadowCard,
    },
    balai: { position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: c.blue, opacity: 0.85 },
    etape: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
    etapeMarque: { width: 20, fontSize: 15, fontWeight: '800', textAlign: 'center' },
    etapeTexte: { color: c.ink, fontSize: 14.5, marginLeft: 10 },
    carte: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 16,
      marginBottom: 10,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    carteTitre: { color: c.ink, fontSize: 15, fontWeight: '700', marginBottom: 6 },
    confiance: { flexDirection: 'row', alignItems: 'center' },
    pastille: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    confianceMot: { fontSize: 15, fontWeight: '700' },
    bilan: { color: c.inkSoft, fontSize: 13.5, textAlign: 'center' },
    ligne: { color: c.inkSoft, fontSize: 13.5, lineHeight: 19, marginTop: 4 },
    echecTitre: { color: c.ink, fontSize: 17, fontWeight: '700' },
    echecTexte: { color: c.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 6 },
  });
