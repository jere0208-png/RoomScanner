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
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { roomParts, segLength } from '../geometry/floorplan';
import { reconstruirePlan, type LectureBrute, type PlanLu } from '../geometry/lecturePlan';
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
  | { phase: 'lu'; page: PageDePlan; plan: PlanLu; essai: boolean; brut: LectureBrute }
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
  const ouvrirPaywall = useAccountStore((st) => st.ouvrirPaywall);
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
    setEtat({ phase: 'lu', page, plan: plan.plan, essai: r.essai, brut: r.lecture });
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
      {/*
        PLUS DE DÉFILEMENT — relevé du patron : « fais une refonte de la page
        pour la partie lecture d'un plan, sans scroll. Privilégie le visuel au
        texte, avec des boutons qui donnent envie. » Chaque moment tient dans
        l'écran : ce qui a de la place à prendre (l'illustration, la page
        photographiée, le plan lu) prend la hauteur qui reste, le reste se
        cale autour.
      */}
      <View style={[s.contenu, { paddingBottom: insets.bottom + 12 }]}>
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
            brut={etat.brut}
            onCreer={() => creer(etat.plan)}
            onReprendre={() => setEtat({ phase: 'invitation' })}
          />
        )}
        {etat.phase === 'echec' && (
          <View testID="lecture-echec" style={s.echec}>
            <View style={s.echecCarte}>
              <View style={[s.echecRond, { backgroundColor: etat.motif === 'pro' ? c.blueSoft : `${c.amber}22` }]}>
                <Icone
                  nom={etat.motif === 'pro' ? 'etoile' : etat.motif === 'compte' ? 'avatar' : etat.motif === 'fichier' ? 'planPapier' : 'aide'}
                  taille={34}
                  teinte={etat.motif === 'pro' ? c.blue : c.amber}
                />
              </View>
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
            </View>
            <View style={s.boutons}>
              {etat.motif === 'pro' && (
                // Revues « Thomas » et « Sophie » : il levait le drapeau des
                // tarifs du devis, et l'écran ne bougeait pas.
                <Bouton s={s} principal icone="etoile" libelle="Passer au Pro" onPress={() => ouvrirPaywall()} />
              )}
              {etat.motif === 'compte' && (
                <Bouton
                  s={s}
                  principal
                  icone="avatar"
                  libelle={compte ? 'Me reconnecter' : 'Me connecter'}
                  onPress={() => seReconnecter(etat.page)}
                />
              )}
              {(etat.motif === 'reseau' || etat.motif === 'refus') && etat.page && (
                <Bouton s={s} principal icone="pivoter" libelle="Réessayer" onPress={() => void lire(etat.page!)} />
              )}
              <Bouton
                s={s}
                libelle={etat.motif === 'fichier' ? 'Choisir un autre fichier' : 'Reprendre une photo'}
                onPress={() => setEtat({ phase: 'invitation' })}
              />
            </View>
          </View>
        )}
      </View>
    </RetourGlisse>
  );
}

// ------------------------------------------------------------------ les briques

/** Une icône Solar, à la taille et la teinte voulues. */
function Icone({ nom, taille, teinte }: { nom: keyof typeof SOLAIRES; taille: number; teinte: string }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24">
      <Path d={SOLAIRES[nom]} fill={teinte} fillRule="evenodd" />
    </Svg>
  );
}

/** Un dégradé qui remplit son bloc, en fond. */
function Degrade({ id, de, a }: { id: string; de: string; a: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={de} />
          <Stop offset="1" stopColor={a} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** La taille d'un bloc qui prend la place qui reste : on la lit, puis on dessine dedans. */
function useCadre(): [{ w: number; h: number }, (e: LayoutChangeEvent) => void] {
  const [cadre, setCadre] = useState({ w: 0, h: 0 });
  const surMesure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCadre((p) => (Math.abs(p.w - width) < 0.5 && Math.abs(p.h - height) < 0.5 ? p : { w: width, h: height }));
  };
  return [cadre, surMesure];
}

/** Entre deux tailles, selon la hauteur de l'écran : de l'iPhone SE à un grand écran. */
function useEchelle() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const k = Math.max(0, Math.min(1, (height - insets.top - insets.bottom - 620) / 260));
  return (petit: number, grand: number) => Math.round(petit + (grand - petit) * k);
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
  const entre = useEchelle();
  const [cadre, surCadre] = useCadre();
  return (
    <>
      {/* LE HÉROS : la feuille photographiée devient un plan. Il prend la place qui reste. */}
      <View style={s.heros}>
        <Degrade id="lecture-heros" de={c.blueSoft} a={c.surface} />
        <View style={s.herosDessin} onLayout={surCadre}>
          {cadre.h > 40 && <DuPapierAuPlan c={c} largeur={cadre.w} hauteur={cadre.h} />}
        </View>
        <Text style={[s.herosTitre, { fontSize: entre(22, 27) }]}>Du papier au plan 2D</Text>
        <Text style={s.herosTexte} numberOfLines={2}>
          Murs, cotes, pièces et symboles : tout est lu, mis à l’échelle et redessiné.
        </Text>
      </View>
      <View style={s.atouts}>
        {CONSEILS.map((k) => (
          <View key={k.titre} style={s.atoutCase}>
            <View style={[s.atout, { height: entre(48, 56) }]} accessibilityLabel={`${k.titre} : ${k.texte}`}>
              <View style={s.atoutIcone}>
                <Icone nom={k.icone} taille={18} teinte={c.blue} />
              </View>
              <Text style={s.atoutTitre} numberOfLines={2}>
                {k.titre}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <View style={s.portes}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scanner le plan"
          style={({ pressed }) => [s.scanner, { height: entre(64, 76) }, pressed && s.enfonce]}
          onPress={onScanner}>
          <Degrade id="lecture-scanner" de="#2D6BFF" a="#5B3DF5" />
          <View style={s.scannerIcone}>
            <Icone nom="scanner" taille={26} teinte="#FFFFFF" />
          </View>
          <View style={s.flexe}>
            <Text style={s.scannerTitre}>Scanner le plan</Text>
            <Text style={s.scannerSous} numberOfLines={1}>
              La feuille se détecte et se redresse seule
            </Text>
          </View>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d="M9 5l7 7-7 7" stroke="rgba(255,255,255,0.85)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </Pressable>
        <View style={s.deux}>
          <Tuile s={s} c={c} icone="image" titre="Une photo" sous="Photothèque" libelle="Importer une photo" hauteur={entre(58, 70)} onPress={onPhoto} />
          <Tuile s={s} c={c} icone="planPapier" titre="Un fichier" sous="PDF ou image" libelle="Ouvrir un fichier" hauteur={entre(58, 70)} onPress={onFichier} />
        </View>
      </View>
      <Text style={s.pied} numberOfLines={2}>
        {pro ? 'Compris dans votre abonnement Pro.' : 'Une lecture offerte pour essayer, puis réservée au Pro.'} Lu par une IA
        (Claude, d’Anthropic) : rien n’est gardé.
      </Text>
    </>
  );
}

/** Une porte secondaire : l'icône dans sa pastille, deux mots. */
function Tuile({
  s,
  c,
  icone,
  titre,
  sous,
  libelle,
  hauteur,
  onPress,
}: {
  s: ReturnType<typeof themed>;
  c: Palette;
  icone: keyof typeof SOLAIRES;
  titre: string;
  sous: string;
  libelle: string;
  hauteur: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      style={({ pressed }) => [s.tuile, { height: hauteur }, pressed && s.enfonce]}
      onPress={onPress}>
      <View style={s.tuileIcone}>
        <Icone nom={icone} taille={22} teinte={c.blue} />
      </View>
      <View style={s.flexe}>
        <Text style={s.tuileTitre} numberOfLines={1}>
          {titre}
        </Text>
        <Text style={s.tuileSous} numberOfLines={1}>
          {sous}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * LA FEUILLE QUI DEVIENT UN PLAN — la photo de gauche, ses coins de cadrage
 * et la ligne qui la balaie ; la flèche qui pousse ; le plan de droite, ses
 * pièces teintées et ses appareils. Dessinée à la taille du cadre.
 */
function DuPapierAuPlan({ c, largeur, hauteur }: { c: Palette; largeur: number; hauteur: number }) {
  const k = Math.min(largeur / 320, hauteur / 170);
  const balai = useRef(new Animated.Value(0)).current;
  const pousse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(balai, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(balai, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pousse, { toValue: 1, duration: 750, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(pousse, { toValue: 0, duration: 750, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(pousse, { toValue: 1, duration: 750, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(pousse, { toValue: 0, duration: 750, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [balai, pousse]);
  const coin = (x: number, y: number, sx: number, sy: number) => `M${x} ${y + sy * 20} V${y} H${x + sx * 20}`;
  return (
    <View style={[fixe.rangee, { width: 320 * k, height: 170 * k }]}>
      {/* La feuille, un peu de biais, comme posée sur la table. */}
      <View style={{ width: 160 * k, height: 170 * k, transform: [{ rotate: '-6deg' }] }}>
        <Svg width={160 * k} height={170 * k} viewBox="0 0 160 170">
          <Rect x={18} y={22} width={124} height={128} rx={8} fill={c.surface} stroke={c.lineStrong} strokeWidth={1.5} />
          <Path d="M36 44 H124 V132 H36 Z M36 88 H82 M82 44 V132 M100 88 V132" stroke={c.ink} strokeOpacity={0.78} strokeWidth={3} fill="none" strokeLinejoin="round" />
          <Path d="M36 36 H124" stroke={c.inkFaint} strokeWidth={1} />
          <Path
            d={[coin(8, 12, 1, 1), coin(152, 12, -1, 1), coin(8, 160, 1, -1), coin(152, 160, -1, -1)].join(' ')}
            stroke={c.blue}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
        <Animated.View
          pointerEvents="none"
          style={[
            fixe.balai,
            {
              left: 18 * k,
              width: 124 * k,
              top: 22 * k,
              backgroundColor: c.blue,
              transform: [{ translateY: balai.interpolate({ inputRange: [0, 1], outputRange: [0, 125 * k] }) }],
            },
          ]}
        />
      </View>
      <Animated.View style={{ transform: [{ translateX: pousse.interpolate({ inputRange: [0, 1], outputRange: [-3 * k, 4 * k] }) }] }}>
        <Svg width={40 * k} height={24 * k} viewBox="0 0 40 24">
          <Path d="M6 12 H32 M24 4 L34 12 L24 20" stroke={c.blue} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
      {/* Le plan dessiné : ses pièces teintées, ses appareils. */}
      <Svg width={120 * k} height={130 * k} viewBox="0 0 120 130">
        <Rect x={4} y={4} width={112} height={122} rx={14} fill={c.surface} />
        <Rect x={18} y={20} width={40} height={44} fill={`${c.blue}1A`} />
        <Rect x={58} y={20} width={44} height={90} fill={`${c.green}1A`} />
        <Rect x={18} y={64} width={40} height={46} fill={`${c.amber}22`} />
        <Path d="M18 20 H102 V110 H18 Z M18 64 H58 M58 20 V110" stroke={c.ink} strokeWidth={4} fill="none" strokeLinejoin="round" />
        <Path d="M68 110 h14" stroke={c.surface} strokeWidth={5} />
        <Path d="M34 20 h12" stroke={c.sky} strokeWidth={5} />
        <Circle cx={38} cy={42} r={3.5} fill={ENCRE_ELEC} />
        <Circle cx={80} cy={65} r={3.5} fill={ENCRE_ELEC} />
        <Circle cx={38} cy={87} r={3.5} fill={ENCRE_ELEC} />
      </Svg>
    </View>
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
  const n = page.page ?? 1;
  const total = page.pages ?? 1;
  return (
    <View testID="apercu-du-fichier" style={s.phase}>
      <PageVue s={s} c={c} page={page}>
        {charge && (
          <View style={[StyleSheet.absoluteFill, s.voile]}>
            <ActivityIndicator color={c.blue} />
          </View>
        )}
      </PageVue>
      {total > 1 && (
        <View style={s.pages}>
          <Fleche s={s} c={c} sens={-1} libelle="Page précédente" visible={n > 1} onPress={() => onPage(n - 1)} />
          <View style={s.pagesMilieu}>
            <Text style={s.pagesNumero}>
              Page {n} sur {total}
            </Text>
            <Text style={s.pagesNote} numberOfLines={2}>
              Retenue : celle qui porte le plus de cotes.
            </Text>
          </View>
          <Fleche s={s} c={c} sens={1} libelle="Page suivante" visible={n < total} onPress={() => onPage(n + 1)} />
        </View>
      )}
      <View style={s.boutons}>
        <Bouton s={s} principal icone="oeil" libelle={total > 1 ? 'Lire cette page' : 'Lire ce plan'} onPress={onLire} />
        <Bouton s={s} libelle="Choisir un autre plan" onPress={onAutre} />
      </View>
    </View>
  );
}

/** Un rond fléché : la page d'avant, celle d'après. Absent au bout. */
function Fleche({
  s,
  c,
  sens,
  libelle,
  visible,
  onPress,
}: {
  s: ReturnType<typeof themed>;
  c: Palette;
  sens: 1 | -1;
  libelle: string;
  visible: boolean;
  onPress: () => void;
}) {
  if (!visible) return <View style={s.flecheVide} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      hitSlop={8}
      style={({ pressed }) => [s.fleche, pressed && s.enfonce]}
      onPress={onPress}>
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path
          d={sens > 0 ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'}
          stroke={c.blue}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

/** La page prise, dans la place qui reste : l'image entière, jamais rognée. */
function PageVue({
  s,
  c,
  page,
  children,
}: {
  s: ReturnType<typeof themed>;
  c: Palette;
  page: PageDePlan;
  /** Ce qui se pose sur la page : un dessin, ou une fonction de sa taille. */
  children?: React.ReactNode | ((cadre: { w: number; h: number }) => React.ReactNode);
}) {
  const [cadre, surCadre] = useCadre();
  const ratio = page.hauteur / Math.max(1, page.largeur);
  const w = Math.min(cadre.w, cadre.h / Math.max(ratio, 1e-3));
  const h = w * ratio;
  return (
    <View style={s.pageCadre} onLayout={surCadre}>
      {cadre.w > 0 && (
        <View style={[s.page, { width: w, height: h, backgroundColor: c.surface }]}>
          <Image source={{ uri: `data:image/jpeg;base64,${page.base64}` }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          {typeof children === 'function' ? children({ w, h }) : children}
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ 2. la lecture

function Lecture({ s, c, page, etape }: { s: ReturnType<typeof themed>; c: Palette; page: PageDePlan; etape: number }) {
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
    <View testID="lecture-en-cours" style={s.phase}>
      <PageVue s={s} c={c} page={page}>
        {({ h }: { w: number; h: number }) => (
          <Animated.View
            pointerEvents="none"
            style={[s.balai, { transform: [{ translateY: balai.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, h - 3)] }) }] }]}
          />
        )}
      </PageVue>
      <View style={s.etapes}>
        {ETAPES.map((e, i) => {
          const faite = i < etape;
          const active = i === etape;
          return (
            <View key={e} style={s.etape}>
              <View style={[s.etapeRond, faite && { backgroundColor: c.green }, active && { backgroundColor: c.blueSoft }]}>
                {faite ? (
                  <Svg width={14} height={14} viewBox="0 0 24 24">
                    <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </Svg>
                ) : active ? (
                  <ActivityIndicator size="small" color={c.blue} />
                ) : (
                  <View style={s.etapePoint} />
                )}
              </View>
              <Text style={[s.etapeTexte, !faite && !active && { color: c.inkFaint }]} numberOfLines={1}>
                {e}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={s.pied}>
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
  brut,
  onCreer,
  onReprendre,
}: {
  s: ReturnType<typeof themed>;
  c: Palette;
  plan: PlanLu;
  essai: boolean;
  /** Ce que l'IA a rendu, tel quel : pour le diagnostic. */
  brut?: LectureBrute;
  onCreer: () => void;
  onReprendre: () => void;
}) {
  const entre = useEchelle();
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
    return [...vus.entries()];
  }, [r.symboles.convertis]);
  const [details, setDetails] = useState(false);
  const [cadre, surCadre] = useCadre();
  const echelle =
    r.echelleDepuis === 'cotes'
      ? `${r.cotes.retenues} cote${r.cotes.retenues > 1 ? 's' : ''} lue${r.cotes.retenues > 1 ? 's' : ''} tiennent le plan`
      : r.echelleDepuis === 'surfaces'
        ? 'Échelle prise sur les surfaces écrites'
        : 'Échelle prise sur la largeur des portes';
  const alertes = r.murs.aVerifier.length + r.cotes.ecartees.length + r.surfacesDouteuses.length + r.symboles.inconnus.length;
  const chiffres: [keyof typeof SOLAIRES, number, string][] = [
    ['rooms', plan.rooms.length, plan.rooms.length > 1 ? 'pièces' : 'pièce'],
    ['murs', plan.walls.length, 'murs'],
    ['ouvertures', plan.openings.length, plan.openings.length > 1 ? 'ouvertures' : 'ouverture'],
    ['prise', r.symboles.poses, r.symboles.poses > 1 ? 'appareils' : 'appareil'],
  ];
  return (
    <View testID="lecture-lue" style={s.phase}>
      {/* LE PLAN LU, dans toute la place qui reste, et sa confiance par-dessus. */}
      <View style={s.planCarte}>
        <View testID="apercu-plan-lu" style={s.flexe} onLayout={surCadre}>
          {cadre.h > 40 && <ApercuDuPlanLu plan={plan} c={c} largeur={cadre.w} hauteur={cadre.h} />}
        </View>
        {/*
          LE DIAGNOSTIC, D'UN APPUI LONG — relevé du patron : « il a scanné
          cela, rien à voir ». Pour savoir si la faute est à la lecture de
          l'IA ou à la reconstruction, il faut ce qu'elle a rendu, tel quel :
          un appui long sur la confiance le partage (rien ne part sans ce
          geste, et rien n'est gardé).
        */}
        <Pressable
          testID="confiance-de-lecture"
          style={[s.confiance, { backgroundColor: `${teinte}1F` }]}
          delayLongPress={700}
          onLongPress={() => {
            if (!brut) return;
            haptic('leger');
            Share.share({ message: JSON.stringify(brut) }).catch(() => {});
          }}>
          <View style={[s.pastille, { backgroundColor: teinte }]} />
          <Text style={[s.confianceMot, { color: teinte }]}>{mot}</Text>
        </Pressable>
      </View>
      <View style={s.chiffres}>
        {chiffres.map(([icone, v, l]) => (
          <View key={l} style={[s.chiffre, { height: entre(62, 74) }]} accessibilityLabel={`${v} ${l}`}>
            <Icone nom={icone} taille={16} teinte={c.blue} />
            <Text style={s.chiffreValeur}>{v}</Text>
            <Text style={s.chiffreLibelle} numberOfLines={1}>
              {l}
            </Text>
          </View>
        ))}
      </View>
      {/* CE QUI TIENT LE PLAN, ce qu'il faut vérifier : des pastilles, et le détail d'un appui. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Le détail de la lecture"
        style={({ pressed }) => [s.badges, pressed && s.enfonce]}
        onPress={() => setDetails(true)}>
        <View style={[s.badge, { backgroundColor: `${c.green}1A` }]}>
          <Icone nom="cotes2d" taille={16} teinte={c.green} />
          <Text style={s.badgeTexte} numberOfLines={1}>
            {echelle}
          </Text>
        </View>
        {alertes > 0 && (
          <View style={[s.badge, { backgroundColor: `${c.amber}1F` }]}>
            <Icone nom="murs" taille={16} teinte={c.amber} />
            <Text style={s.badgeTexte} numberOfLines={1}>
              {r.murs.aVerifier.length > 0
                ? `${r.murs.aVerifier.length} mur${r.murs.aVerifier.length > 1 ? 's' : ''} à vérifier, en orange`
                : `${alertes} point${alertes > 1 ? 's' : ''} à vérifier`}
            </Text>
            <Text style={s.badgePlus}>Détail</Text>
          </View>
        )}
        {conversions.length > 0 && (
          <View style={[s.badge, { backgroundColor: c.surface }]}>
            <Icone nom="prise" taille={16} teinte={c.blue} />
            <Text style={s.badgeTexte} numberOfLines={1}>
              {conversions[0][1] > 1 ? `${conversions[0][1]} × ` : ''}
              {conversions[0][0]}
            </Text>
            {conversions.length > 1 && <Text style={s.badgePlus}>{`+${conversions.length - 1}`}</Text>}
          </View>
        )}
      </Pressable>
      <View style={s.boutons}>
        <Bouton s={s} principal icone="valider" libelle="Créer le plan" onPress={onCreer} />
        <Bouton s={s} lien libelle="Reprendre la photo" onPress={onReprendre} />
      </View>
      {essai && (
        <Text style={s.pied}>C’était votre lecture d’essai : les suivantes sont comprises dans le Pro.</Text>
      )}
      <DetailsDeLaLecture
        visible={details}
        onFermer={() => setDetails(false)}
        s={s}
        c={c}
        plan={plan}
        conversions={conversions}
        echelle={echelle}
      />
    </View>
  );
}

/**
 * LE DÉTAIL DE LA LECTURE, d'un appui sur les pastilles : toutes les cotes
 * écartées, les surfaces qui ne collent pas, chaque symbole converti. La
 * page n'en montre que l'essentiel ; le compagnon qui veut tout savoir
 * l'ouvre.
 */
function DetailsDeLaLecture({
  visible,
  onFermer,
  s,
  c,
  plan,
  conversions,
  echelle,
}: {
  visible: boolean;
  onFermer: () => void;
  s: ReturnType<typeof themed>;
  c: Palette;
  plan: PlanLu;
  conversions: [string, number][];
  echelle: string;
}) {
  const r = plan.rapport;
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFermer}>
      <Pressable style={s.voileModal} onPress={onFermer} accessibilityLabel="Fermer le détail" />
      <View style={[s.feuille, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.poignee} />
        <Text style={s.feuilleTitre}>Le détail de la lecture</Text>
        <ScrollView style={s.feuilleListe} contentContainerStyle={s.feuilleContenu}>
          <Text style={s.carteTitre}>Les mesures</Text>
          <Text style={s.ligne}>
            {echelle}
            {r.cotes.relues > 0 ? ` (dont ${r.cotes.relues} relue${r.cotes.relues > 1 ? 's' : ''} dans leur unité)` : ''}.
          </Text>
          {r.cotes.ecartees.length > 0 && (
            <Text style={[s.ligne, { color: c.amber }]}>
              Écartée{r.cotes.ecartees.length > 1 ? 's' : ''} : {r.cotes.ecartees.map((e) => `« ${e.texte} »`).join(', ')} —
              contredite{r.cotes.ecartees.length > 1 ? 's' : ''} par le reste du plan.
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
          {(conversions.length > 0 || r.symboles.inconnus.length > 0) && (
            <Text style={[s.carteTitre, fixe.espace]}>Les symboles</Text>
          )}
          {conversions.map(([k, n]) => (
            <Text key={k} style={s.ligne}>
              {n > 1 ? `${n} × ` : ''}
              {k}
            </Text>
          ))}
          {r.symboles.inconnus.length > 0 && (
            <Text style={[s.ligne, { color: c.amber }]}>
              Non reconnu{r.symboles.inconnus.length > 1 ? 's' : ''}, non posé{r.symboles.inconnus.length > 1 ? 's' : ''} :{' '}
              {r.symboles.inconnus.slice(0, 8).join(', ')}.
            </Text>
          )}
        </ScrollView>
        <Bouton s={s} principal libelle="Fermer" onPress={onFermer} />
      </View>
    </Modal>
  );
}

/** Le plan reconstruit, à la taille de sa carte : murs, baies, pièces, appareils. */
function ApercuDuPlanLu({ plan, c, largeur, hauteur }: { plan: PlanLu; c: Palette; largeur: number; hauteur: number }) {
  const xs = plan.walls.flatMap((w) => [w.a.x, w.b.x]);
  const zs = plan.walls.flatMap((w) => [w.a.z, w.b.z]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const larg = Math.max(0.5, Math.max(...xs) - x0);
  const prof = Math.max(0.5, Math.max(...zs) - z0);
  // La place sous la pastille de confiance est laissée libre.
  const marge = 14;
  const haut = 40;
  const k = Math.min((largeur - 2 * marge) / larg, (hauteur - haut - marge) / prof);
  const ox = (largeur - larg * k) / 2;
  const oy = haut + (hauteur - haut - marge - prof * k) / 2;
  const px = (p: { x: number; z: number }) => ({ x: ox + (p.x - x0) * k, y: oy + (p.z - z0) * k });
  const aVerifier = new Set(plan.rapport.murs.aVerifier);
  const parts = useMemo(() => roomParts(plan.walls, plan.rooms), [plan.walls, plan.rooms]);
  const teintes = [c.blue, c.green, c.amber, c.sky, '#7C5CFF'];
  return (
    <Svg width={largeur} height={hauteur}>
      {/* Les pièces, teintées : on voit d'un coup d'œil ce qui a été reconnu. */}
      {parts.map((p, i) =>
        p.surface ? (
          <Path
            key={`sol-${p.roomId}`}
            d={`${p.surface.pts.map((q, j) => `${j ? 'L' : 'M'}${px(q).x} ${px(q).y}`).join(' ')} Z`}
            fill={`${teintes[i % teintes.length]}1A`}
          />
        ) : null,
      )}
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
        return <Rect key={f.id} x={p.x - 2.5} y={p.y - 2.5} width={5} height={5} rx={1} fill={ENCRE_ELEC} />;
      })}
      {plan.ceiling.map((cl) => {
        const p = px(cl.at);
        return <Circle key={cl.id} cx={p.x} cy={p.y} r={3} fill={ENCRE_ELEC} opacity={0.8} />;
      })}
      {parts.map((p) => {
        const nom = plan.rooms.find((r) => r.id === p.roomId)?.name;
        if (!nom || !p.surface) return null;
        const q = px(p.labelAt);
        return (
          <SvgText key={p.roomId} x={q.x} y={q.y + 4} fontSize={12} fontWeight="700" fill={c.inkSoft} textAnchor="middle">
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
  lien,
  icone,
  onPress,
}: {
  s: ReturnType<typeof themed>;
  libelle: string;
  principal?: boolean;
  /** Un simple lien, sous le bouton principal. */
  lien?: boolean;
  icone?: keyof typeof SOLAIRES;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      style={({ pressed }) => [
        principal ? s.boutonPrincipal : lien ? s.boutonLien : s.boutonSecond,
        pressed && s.enfonce,
      ]}
      onPress={onPress}>
      {principal && icone && <Icone nom={icone} taille={20} teinte="#FFFFFF" />}
      <Text style={principal ? s.boutonPrincipalTexte : s.boutonSecondTexte}>{libelle}</Text>
    </Pressable>
  );
}

/** Ce qui ne dépend pas du thème. */
const fixe = StyleSheet.create({
  rangee: { flexDirection: 'row', alignItems: 'center' },
  balai: { position: 'absolute', height: 3, opacity: 0.85 },
  espace: { marginTop: 14 },
});

const themed = (c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    flexe: { flex: 1 },
    barre: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      marginTop: 6,
      marginBottom: 6,
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
    // La page tient l'écran : une colonne, et sur tablette la largeur d'un téléphone.
    contenu: { flex: 1, paddingHorizontal: 18, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
    phase: { flex: 1, gap: 12 },
    enfonce: { transform: [{ scale: 0.97 }], opacity: 0.92 },

    heros: {
      flex: 1,
      minHeight: 150,
      borderRadius: 28,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    herosDessin: { alignSelf: 'stretch', flex: 1, alignItems: 'center', justifyContent: 'center' },
    herosTitre: { color: c.ink, fontWeight: '900', letterSpacing: -0.4, textAlign: 'center', marginTop: 6 },
    herosTexte: { color: c.inkSoft, fontSize: 13.5, lineHeight: 18, textAlign: 'center', marginTop: 4, maxWidth: 320 },
    atouts: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 8 },
    atoutCase: { width: '50%', paddingHorizontal: 4 },
    atout: {
      backgroundColor: c.surface,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 12,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    atoutIcone: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: c.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    atoutTitre: { flex: 1, color: c.ink, fontSize: 13.5, fontWeight: '700' },
    portes: { gap: 10 },
    scanner: {
      borderRadius: 22,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      shadowColor: '#2D6BFF',
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    scannerIcone: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scannerTitre: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    scannerSous: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
    deux: { flexDirection: 'row', gap: 10 },
    tuile: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      ...shadowCard,
      shadowOpacity: 0.06,
    },
    tuileIcone: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: c.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tuileTitre: { color: c.ink, fontSize: 14, fontWeight: '800' },
    tuileSous: { color: c.inkSoft, fontSize: 11.5, fontWeight: '600' },
    pied: { color: c.inkSoft, fontSize: 11.5, lineHeight: 15.5, textAlign: 'center' },

    pageCadre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    page: { borderRadius: radius.md, overflow: 'hidden', ...shadowCard },
    voile: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)' },
    pages: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pagesMilieu: { flex: 1, alignItems: 'center' },
    pagesNumero: { color: c.ink, fontSize: 16, fontWeight: '800' },
    pagesNote: { color: c.inkSoft, fontSize: 12, textAlign: 'center', marginTop: 2 },
    fleche: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.07,
    },
    flecheVide: { width: 46, height: 46 },
    balai: { position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: c.blue, opacity: 0.85 },
    etapes: { backgroundColor: c.surface, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, gap: 2, ...shadowCard, shadowOpacity: 0.05 },
    etape: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 34 },
    etapeRond: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    etapePoint: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.inkFaint },
    etapeTexte: { flex: 1, color: c.ink, fontSize: 14, fontWeight: '600' },

    planCarte: {
      flex: 1,
      minHeight: 140,
      backgroundColor: c.surface,
      borderRadius: 26,
      overflow: 'hidden',
      ...shadowCard,
      shadowOpacity: 0.06,
    },
    confiance: {
      position: 'absolute',
      left: 12,
      top: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
    },
    pastille: { width: 8, height: 8, borderRadius: 4 },
    confianceMot: { fontSize: 13.5, fontWeight: '800' },
    chiffres: { flexDirection: 'row', gap: 8 },
    chiffre: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    chiffreValeur: { color: c.ink, fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
    chiffreLibelle: { color: c.inkSoft, fontSize: 11, fontWeight: '600' },
    badges: { gap: 6 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
    badgeTexte: { flex: 1, color: c.ink, fontSize: 13, fontWeight: '600' },
    badgePlus: {
      color: c.blue,
      backgroundColor: c.blueSoft,
      borderRadius: 999,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 1,
      fontSize: 12,
      fontWeight: '800',
    },
    boutons: { gap: 4 },
    boutonPrincipal: {
      height: 54,
      borderRadius: 18,
      backgroundColor: c.blue,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: c.blue,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    boutonPrincipalTexte: { color: '#FFFFFF', fontSize: 16.5, fontWeight: '800' },
    boutonSecond: {
      height: 48,
      borderRadius: 16,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.line,
      marginTop: 6,
    },
    boutonLien: { height: 40, alignItems: 'center', justifyContent: 'center' },
    boutonSecondTexte: { color: c.blue, fontSize: 15, fontWeight: '700' },

    echec: { flex: 1, justifyContent: 'space-between', gap: 12 },
    echecCarte: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
    echecRond: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    echecTitre: { color: c.ink, fontSize: 22, fontWeight: '900', textAlign: 'center' },
    echecTexte: { color: c.inkSoft, fontSize: 14.5, lineHeight: 20.5, marginTop: 8, textAlign: 'center' },

    voileModal: { flex: 1, backgroundColor: 'rgba(8,10,14,0.45)' },
    feuille: {
      maxHeight: '80%',
      backgroundColor: c.surface,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 18,
      paddingTop: 10,
    },
    poignee: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.lineStrong, marginBottom: 10 },
    feuilleTitre: { color: c.ink, fontSize: 18, fontWeight: '800', marginBottom: 6 },
    feuilleListe: { flexGrow: 0 },
    feuilleContenu: { paddingBottom: 12 },
    carteTitre: { color: c.ink, fontSize: 15, fontWeight: '700', marginBottom: 4 },
    ligne: { color: c.inkSoft, fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  });
