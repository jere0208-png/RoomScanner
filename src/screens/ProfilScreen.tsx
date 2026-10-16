/**
 * LA PAGE PROFIL — tout ce qui touche à l'utilisateur, au même endroit.
 *
 * Le compte tenait dans une carte modale ouverte depuis l'accueil : avatar,
 * nom, trois boutons, et c'était tout. Rien n'avait donc de place pour
 * grandir — ni les réglages, ni l'abonnement, ni l'apparence — et l'accueil
 * ramassait ce qui débordait : le bouton de thème y flottait dans un coin,
 * seul réglage de l'application à vivre sur l'écran d'arrivée, à portée
 * d'un doigt qui visait le scan.
 *
 * Le patron a donné un design à suivre, et cette page le suit : une barre
 * sobre, l'identité en tête, puis des sections titrées — l'abonnement en
 * carte, l'apparence en ronds, le reste en rangées à chevron. Chaque bloc
 * est une chose qu'on vient FAIRE ici, jamais une décoration.
 */
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { MoreDots } from '../components/MoreDots';
import { MenuCompte } from '../components/MenuCompte';
import { SupportSheet } from '../components/SupportSheet';
import { JournalSheet } from '../components/JournalSheet';
import { PromptSheet, type PromptData } from '../components/Sheet';
import { useEntreprise, type Entreprise } from '../store/entreprise';
import { usePannes } from '../ui/journalPannes';
import { useUsage } from '../store/usage';
import { ThemeGlyph } from '../components/ThemeGlyph';
import { ContourVif, TexteVif } from '../components/ContourVif';
import { SOLAIRES } from '../ui/solaires';
import { useAccountStore } from '../store/accountStore';
import { useModeDiagnostic } from '../diagnostic/mode';
import { usePremieresFois } from '../store/premieresFois';
import { useScanStore, type ThemePref } from '../store/scanStore';
import { ombreBouton, dark, radius, shadowCard, useTheme, type Palette } from '../theme';
import { ACCENTS } from '../ui/accents';
import { ICONES } from '../ui/icone';
import { alerte } from '../ui/alerte';
import { haptic } from '../ui/haptic';
import { panne as expliquer } from '../ui/panne';

/**
 * LES TROIS APPARENCES, DANS L'ORDRE DU DESIGN.
 *
 * « Système » vient en premier parce que c'est le réglage par défaut et le
 * bon conseil : le téléphone sait mieux que nous quand la nuit tombe. Les
 * deux autres sont des choix délibérés, qui l'emportent tant qu'on ne les
 * reprend pas.
 */
/**
 * UNE DATE EN TOUTES LETTRES, SANS `Intl`.
 *
 * `toLocaleDateString('fr-FR', { month: 'long' })` dépend de la variante
 * d'Hermès embarquée : sur certains builds elle rend « November ». Douze
 * mots dans un tableau ne dépendent de rien, et c'est la date d'un
 * PRÉLÈVEMENT — on ne la laisse pas au hasard d'une compilation.
 */
const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
export function dateEnLettres(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

const APPARENCES: { cle: ThemePref; mot: string; label: string }[] = [
  { cle: 'system', mot: 'Système', label: 'Thème système' },
  { cle: 'light', mot: 'Clair', label: 'Thème clair' },
  { cle: 'dark', mot: 'Sombre', label: 'Thème sombre' },
];

/** Ce que dit la carte d'abonnement hors Pro : ce que le Pro ajoute. */
export const PHRASE_GRATUIT = 'Passer en Pro pour exporter vos plans';

/** Ce qui est choisi, dit sur la rangée repliée : « Système · Bleu ». */
export function resumeApparence(theme: ThemePref, accent: string): string {
  const t = APPARENCES.find((a) => a.cle === theme)?.mot ?? 'Système';
  const a = ACCENTS.find((x) => x.cle === accent)?.nom;
  return a ? `${t} · ${a}` : t;
}

export function ProfilScreen() {
  const modeElec = useUsage((u) => u.modeElec);
  const choisirUsage = useUsage((u) => u.choisir);
  const c = useTheme();
  const s = themed(c);
  const insets = useSafeAreaInsets();
  const setScreen = useScanStore((st) => st.setScreen);
  const revoir = usePremieresFois((st) => st.revoir);
  const themePref = useScanStore((st) => st.themePref);
  const accentPref = useScanStore((st) => st.accentPref);
  const iconePref = useScanStore((st) => st.iconePref);
  const setIconePref = useScanStore((st) => st.setIconePref);
  const setAccentPref = useScanStore((st) => st.setAccentPref);
  const setThemePref = useScanStore((st) => st.setThemePref);
  // Le compte des plans ne compte pas la corbeille.
  const saves = useScanStore((st) => st.saves).filter((x) => !x.corbeille);
  const compte = useAccountStore((st) => st.compte);
  const pro = useAccountStore((st) => st.pro);
  const admin = useAccountStore((st) => st.admin);
  const diagActif = useModeDiagnostic((st) => st.actif);
  const reglerDiag = useModeDiagnostic((st) => st.regler);
  const [journal, setJournal] = useState(false);
  const incidents = usePannes((x) => x.incidents);
  const proVia = useAccountStore((st) => st.proVia);
  const ouvrirPaywall = useAccountStore((st) => st.ouvrirPaywall);
  const proEcheance = useAccountStore((st) => st.proEcheance);
  const proReconduit = useAccountStore((st) => st.proReconduit);
  const restaurerPro = useAccountStore((st) => st.restaurerPro);
  const [menu, setMenu] = useState(false);
  /** Le mot au service client : sujet, message, photo. */
  const [support, setSupport] = useState(false);
  /** L'entreprise de l'électricien, et le champ qu'on est en train d'écrire. */
  const entreprise = useEntreprise();
  useEffect(() => {
    if (!entreprise.charge) entreprise.charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [prompt, setPrompt] = useState<PromptData | null>(null);
  /*
    L'APPARENCE SE REPLIE — revue des découvreurs (clair-31/32) : le thème,
    la teinte et l'icône prenaient un écran et demi entre l'abonnement et
    « Mes plans », pour des réglages qu'on touche une fois. Ils tiennent
    derrière une rangée « Apparence » qui dit ce qui est choisi, et
    s'ouvrent d'un appui. Rien n'est retiré.
  */
  const [apparenceOuverte, setApparenceOuverte] = useState(false);

  const quitterInvite = useAccountStore((st) => st.quitterInvite);
  // L'invité s'appelle par son état, pas par un « Mon compte » qui promet
  // une identité qu'il n'a pas.
  const nom = compte?.prenom || compte?.email || 'Invité';

  const restaurer = async () => {
    // L'invité restaure aussi : l'abonnement est à l'identifiant Apple.
    try {
      const ok = (await restaurerPro()) === 'restaure';
      alerte(
        ok ? 'Abonnement restauré' : 'Aucun achat trouvé',
        ok
          ? 'Votre Pro est de retour.'
          : 'L’App Store ne connaît pas d’abonnement pour ce compte Apple.',
      );
    } catch (e) {
      alerte(
        expliquer('restauration', e).titre,
        expliquer('restauration', e).message,
      );
    }
  };

  return (
    /* Le bord gauche ramène à l'accueil, comme la flèche. En enveloppe : la
       page défile, et une bande posée dessus lui volerait ses appuis. */
    <RetourGlisse
      onRetour={() => setScreen('home')}
      style={[s.fond, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[s.contenu, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>
        <View style={s.barre}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={s.rondBarre}
            hitSlop={10}
            onPress={() => setScreen('home')}>
            <BackChevron color={c.ink} />
          </Pressable>
          <Text style={s.titreBarre}>Profil</Text>
          {/*
            LA PORTE VERS UN HUMAIN — relevé du patron : une icône de tchat
            pour le service client. L'application n'avait aucun endroit où
            dire quelque chose à son auteur ; elle en a un, et il est là où
            l'on va déjà quand quelque chose cloche avec son compte.
          */}
          <View style={s.barreDroite}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Écrire au service client"
              style={s.rondBarre}
              hitSlop={10}
              onPress={() => setSupport(true)}>
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d={SOLAIRES.tchat} fill={c.ink} fillRule="evenodd" />
              </Svg>
            </Pressable>
            {/* Se déconnecter ou supprimer un compte qu'on n'a pas n'est
                pas un geste : l'invité n'a pas ce menu. */}
            {compte && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Plus d’options"
                style={s.rondBarre}
                hitSlop={10}
                onPress={() => setMenu(true)}>
                <MoreDots color={c.ink} size={20} />
              </Pressable>
            )}
          </View>
        </View>

        {/*
          L'IDENTITÉ EN TÊTE, ET RIEN QUI SE CLIQUE.

          Le design pose un grand avatar, le nom, l'adresse. On n'a pas de
          photo à montrer — l'app ne demande pas la pellicule pour ça — donc
          l'avatar est notre silhouette Solar, cerclée d'or quand le compte
          est Pro : le grade se VOIT sans qu'on l'écrive, exactement comme
          sur l'accueil.
        */}
        {pro ? (
          <ContourVif rayon={44} fond={c.bg} style={s.avatarCadre}>
            <View style={s.avatarDedans}>
              <Svg width={84} height={84} viewBox="0 0 24 24">
                <Path d={SOLAIRES.avatar} fill={c.blue} fillRule="evenodd" />
              </Svg>
            </View>
          </ContourVif>
        ) : (
          <View style={s.avatar}>
            <Svg width={88} height={88} viewBox="0 0 24 24">
              <Path d={SOLAIRES.avatar} fill={c.blue} fillRule="evenodd" />
            </Svg>
          </View>
        )}
        {pro ? (
          <TexteVif texte={nom} taille={21} fond={c.bg} style={s.nomOr} />
        ) : (
          <Text style={s.nom} numberOfLines={1}>
            {nom}
          </Text>
        )}
        {!!compte?.email && (
          <Text style={s.email} numberOfLines={1}>
            {compte.email}
          </Text>
        )}
        {/*
          LA PORTE DE L'INVITÉ : la connexion — c'est exactement ce qui lui
          manque. Le drapeau retombe, et la porte d'entrée de l'app montre
          l'écran de connexion.
        */}
        {!compte && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Créer un compte ou se connecter"
            style={({ pressed }) => [s.seConnecter, pressed && { opacity: 0.7 }]}
            onPress={quitterInvite}>
            <Text style={s.seConnecterTexte}>Créer un compte ou se connecter</Text>
          </Pressable>
        )}

        <Text style={s.section}>Abonnement</Text>
        {/*
          LA CARTE DIT L'ÉTAT, PAS L'ENVIE.

          En gratuit elle vend, en Pro elle rassure : proposer d'acheter ce
          qu'on a déjà est la faute qui fait douter d'un paiement passé — et
          c'est la première chose qu'on vient vérifier ici après avoir payé.
        */}
        <View style={s.carteAbo}>
          {/* Le rond garde le BLEU de l'app, Pro ou pas — relevé du
              patron. Il passait au vert en Pro : une couleur qui ne sert
              qu'ici, sur un écran qui n'en a pas d'autre, se lit comme une
              alerte plutôt que comme un grade. */}
          <View style={s.rondEtoile}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path d={SOLAIRES.etoile} fill="#FFFFFF" fillRule="evenodd" />
            </Svg>
          </View>
          <View style={s.aboTextes}>
            {/*
              L'ÉTAT D'ABORD, L'OFFRE ENSUITE — revue des découvreurs :
              « Passer en Pro · Gratuit · scans illimités » mêlait le titre
              d'une offre et l'état du compte ; on ne savait pas si l'on
              était gratuit ou déjà Pro. Le titre dit ce qu'on a, la ligne
              dessous ce que le Pro ajoute.
            */}
            <Text style={s.aboTitre}>
              {pro ? 'EchoPlan Pro' : 'Gratuit'}
            </Text>
            <Text style={s.aboSous} numberOfLines={2}>
              {pro
                ? proVia === 'code'
                  ? 'Débloqué par code · exports et sauvegarde en ligne'
                  : 'Abonnement actif · exports et sauvegarde en ligne'
                : PHRASE_GRATUIT}
            </Text>
            {/*
              JUSQU'À QUAND — relevé du patron : « sur le profil on doit voir
              la date d'expiration de l'abonnement ».

              C'est la question qu'on vient poser ici après avoir payé, et
              « actif » n'y répond pas. Le mot dit aussi ce qui va SE PASSER :
              un abonnement en cours se RECONDUIT, un abonnement résilié
              court JUSQU'À sa date puis s'arrête. Confondre les deux, c'est
              soit faire attendre un prélèvement qui ne viendra pas, soit
              laisser quelqu'un perdre ses relevés illimités sans prévenir.

              Rien ne s'écrit sans date : le Pro par code n'en a pas (il est
              donné une fois), et l'App Store peut être muet — une échéance
              inventée serait pire que pas d'échéance.
            */}
            {pro && proVia !== 'code' && !!proEcheance && (
              <Text style={s.aboDate}>
                {proReconduit
                  ? `Renouvellement le ${dateEnLettres(proEcheance)}`
                  : `Actif jusqu’au ${dateEnLettres(proEcheance)}`}
              </Text>
            )}
          </View>
          {/*
            UNE SEULE ACTION PRINCIPALE — revue des découvreurs : chez
            l'invité, « Créer un compte » et « Voir l'offre » étaient deux
            boutons noirs pleins l'un sous l'autre ; aucun ne l'emportait.
            Sans compte, c'est la connexion qui ouvre tout le reste : l'offre
            passe en bouton cerclé. Avec un compte, elle redevient pleine.
          */}
          {!pro && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voir l’offre Pro"
              testID="bouton-offre"
              style={({ pressed }) => [compte ? s.boutonAbo : s.boutonAboSecondaire, pressed && s.enfonce]}
              onPress={ouvrirPaywall}>
              <Text style={compte ? s.boutonAboTexte : s.boutonAboSecondaireTexte}>Voir l’offre</Text>
            </Pressable>
          )}
          {/*
            GÉRER, RÉSILIER — revues « Thomas » et « Nadia » : la carte disait
            « Renouvellement le … » sans aucun moyen de l'arrêter ; le chemin
            n'était écrit que dans la page Confidentialité. Le bouton ouvre
            les abonnements du compte Apple, là où l'on résilie.
          */}
          {pro && proVia !== 'code' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gérer l’abonnement"
              style={({ pressed }) => [s.boutonAbo, pressed && s.enfonce]}
              onPress={() => {
                Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {});
              }}>
              <Text style={s.boutonAboTexte}>Gérer</Text>
            </Pressable>
          )}
        </View>

        {/*
          MON USAGE — l'interrupteur du mode Électricité.

          Relevé du patron : « une proposition pour passer à un mode
          "Électricité", sans quoi on pourrait simplement scanner la pièce
          pour les cotes, meubles etc. » Il vit ici, avec l'apparence : c'est
          une préférence de l'APPAREIL, pas du plan — c'est la personne qui
          est électricienne, pas le salon (voir `store/usage`).

          Un interrupteur d'iOS, et non deux boutons : on l'allume ou on
          l'éteint, il n'y a pas de troisième réponse. Et sa phrase dit ce
          qu'il ajoute, en mots de particulier — quelqu'un qui hésite doit
          pouvoir trancher sans connaître la NF C 15-100.
        */}
        <Text style={s.section}>Mon usage</Text>
        <View style={s.carteAbo}>
          <View style={s.aboTextes}>
            <Text style={s.aboTitre}>Mode Électricité</Text>
            <Text style={s.aboSous}>
              Prises, éclairage et tableau sur le plan, contrôle des normes
              et devis. Pour les électriciens.
            </Text>
          </View>
          <Switch
            testID="interrupteur-electricite"
            accessibilityLabel="Mode Électricité"
            value={modeElec}
            onValueChange={(v) => {
              haptic('leger');
              choisirUsage(v);
            }}
            trackColor={{ true: c.blue, false: c.line }}
          />
        </View>
        {/*
          MON ENTREPRISE — correctif de l'audit : le dossier PDF n'avait ni le
          nom ni les coordonnées de l'artisan, et la marque EchoPlan y était
          figée. Renseignée une fois ici, elle prend la place de la marque en
          tête de chaque feuille. Pour l'électricien, et pour tout abonné
          Pro (revues « Thomas » et « Inès » : l'architecte, l'agente
          immobilière remettent aussi le dossier à un client).
        */}
        {modeElec || pro ? (
          <>
            <Text style={s.section}>Mon entreprise</Text>
            <Text style={s.sectionDit}>En tête de chaque feuille de vos dossiers, à la place d’EchoPlan.</Text>
            {CHAMPS_ENTREPRISE.map((f) => (
              <Rangee
                key={f.cle}
                s={s}
                c={c}
                icone={f.icone}
                label={f.label}
                valeur={entreprise[f.cle] || 'À renseigner'}
                onPress={() =>
                  setPrompt({
                    title: f.label,
                    subtitle: f.cle === 'nom' ? 'Il paraît en tête de chaque feuille du dossier.' : undefined,
                    value: entreprise[f.cle],
                    okLabel: 'Enregistrer',
                    onSubmit: (t: string) => entreprise.regler({ [f.cle]: t }),
                  })
                }
              />
            ))}
          </>
        ) : null}
        {/*
          ADMINISTRATEUR — le mode diagnostic, et rien que pour le patron.

          Relevé du patron : « fais-moi un bouton admin […] un mode
          diagnostique […] au clic sur un bouton visible, les 10 dernières
          secondes de mes faits et gestes te seront envoyés, écran compris ».
          La section n'existe QUE si le serveur dit `admin` (sa liste
          `ADMIN_EMAILS`) : le dépôt est public, aucune adresse n'y figure.

          L'interrupteur se lit avant de s'allumer : la phrase dit exactement
          ce qui est gardé, pour que rien ne se capte en douce.
        */}
        {admin && (
          <>
            <Text style={s.section}>Administrateur</Text>
            <View style={s.carteAbo}>
              <View style={s.aboTextes}>
                <Text style={s.aboTitre}>Mode diagnostic</Text>
                <Text style={s.aboSous}>
                  Garde en mémoire vos 10 dernières secondes — gestes, écran,
                  état du plan — pour les envoyer au développeur d’un appui.
                </Text>
              </View>
              <Switch
                testID="interrupteur-diagnostic"
                accessibilityLabel="Mode diagnostic"
                value={diagActif}
                onValueChange={(v) => {
                  haptic('leger');
                  reglerDiag(v);
                }}
                trackColor={{ true: c.blue, false: c.line }}
              />
            </View>
            {/*
              LE DIAGNOSTIC — ce qui s'est passé quand l'application s'est
              arrêtée. Relevé du patron : « l'app a quitté plusieurs fois
              après des clics sur des meubles. Fais en sorte qu'on ait un
              diagnostic d'erreurs. »

              RÉSERVÉ À L'ADMINISTRATEUR — revue des découvreurs (clair-32) :
              une rangée « Diagnostic » à l'icône de gyrophare, chez un
              particulier, se lisait comme une alarme. C'est un outil de
              développeur : il vit avec le mode diagnostic. Le compte écrit à
              côté dit qu'il y a quelque chose à lire.
            */}
            <View style={s.espaceAdmin} />
            <Rangee
              s={s}
              c={c}
              icone="sirene"
              label="Diagnostic"
              note={incidents.length ? String(incidents.length) : undefined}
              onPress={() => setJournal(true)}
            />
          </>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apparence"
          accessibilityHint={apparenceOuverte ? 'Replier les réglages d’apparence' : 'Afficher les réglages d’apparence'}
          accessibilityState={{ expanded: apparenceOuverte }}
          testID="section-apparence"
          style={({ pressed }) => [s.rangee, s.rangeeApparence, pressed && s.rangeeEnfoncee]}
          onPress={() => {
            haptic('leger');
            setApparenceOuverte((v) => !v);
          }}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d={SOLAIRES.couleurs} fill={c.inkSoft} fillRule="evenodd" />
          </Svg>
          <Text style={s.rangeeMot}>Apparence</Text>
          <Text style={s.rangeeValeur} numberOfLines={1}>
            {resumeApparence(themePref, accentPref)}
          </Text>
          <View style={apparenceOuverte ? s.chevronOuvert : s.chevronFerme}>
            <BackChevron color={c.inkFaint} size={20} weight={2.2} />
          </View>
        </Pressable>
        {apparenceOuverte && (
          <View testID="reglages-apparence" style={s.reglagesApparence}>
            {/*
              TROIS RONDS, PAS UNE LISTE — c'est le design du patron, et c'est
              le bon geste : trois choix exclusifs se comparent d'un coup d'œil
              quand ils sont côte à côte, alors qu'une liste les fait lire un
              par un. Le choix du moment porte l'anneau bleu ; sans marque, on
              ne sait pas d'où l'on part.
            */}
            <View style={s.apparences}>
              {APPARENCES.map((a) => {
                const actif = themePref === a.cle;
                return (
                  <Pressable
                    key={a.cle}
                    accessibilityRole="button"
                    accessibilityLabel={a.label}
                    accessibilityState={{ selected: actif }}
                    style={s.apparence}
                    onPress={() => setThemePref(a.cle)}>
                    <View style={[s.apparenceRond, actif && s.apparenceRondActif]}>
                      {a.cle === 'system' ? (
                        <Svg width={24} height={24} viewBox="0 0 24 24">
                          <Path
                            d={SOLAIRES.telephone}
                            fill={actif ? c.blue : c.inkSoft}
                            fillRule="evenodd"
                          />
                        </Svg>
                      ) : (
                        <ThemeGlyph
                          quoi={a.cle === 'dark' ? 'lune' : 'soleil'}
                          size={24}
                          color={actif ? c.blue : c.inkSoft}
                        />
                      )}
                    </View>
                    <Text style={[s.apparenceMot, actif && s.apparenceMotActif]}>
                      {a.mot}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/*
              LA TEINTE D'ACCENT — neuvième des dix améliorations.

              Elle est POSÉE SOUS le clair et le sombre, dans la même section :
              les trois règlent la même chose, l'allure de l'application. Une
              section « Couleurs » à part ferait chercher à deux endroits ce qui
              se décide d'un seul coup d'œil.

              QUATRE PASTILLES DE LA COULEUR QU'ELLES POSENT — pas de mots, sinon
              celui de la teinte. On choisit une couleur en la voyant ; « Prune »
              écrit en gris ne dit rien à personne.
            */}
            <View style={s.teintes}>
              {ACCENTS.map((a) => {
                const actif = accentPref === a.cle;
                const teinte = c === dark ? a.sombre.blue : a.clair.blue;
                return (
                  <Pressable
                    key={a.cle}
                    accessibilityRole="button"
                    accessibilityLabel={`Teinte ${a.nom}`}
                    accessibilityState={{ selected: actif }}
                    style={s.teinte}
                    onPress={() => {
                      setAccentPref(a.cle);
                      haptic('leger');
                    }}>
                    <View
                      style={[
                        s.teinteRond,
                        { backgroundColor: teinte },
                        actif && { borderColor: c.ink },
                      ]}
                    />
                    <Text style={[s.teinteMot, actif && s.apparenceMotActif]}>
                      {a.nom}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/*
              L'ICÔNE DE L'APPLICATION — sous les teintes, et à PART d'elles.

              Elles vont ensemble, mais changer d'icône fait apparaître une
              alerte du système qu'aucune application ne peut supprimer : les
              lier ferait surgir cette alerte à chaque essai de teinte. La ligne
              le dit, plutôt que de laisser la surprise arriver.
            */}
            <Text style={s.teinteTitre}>Icône de l’application</Text>
            <View style={s.teintes}>
              {ICONES.map((i) => {
                const actif = iconePref === i.cle;
                const habit = ACCENTS.find((a) => a.cle === i.cle);
                const teinte = i.natif
                  ? habit?.clair.blueDark ?? c.ink
                  : c.surface;
                return (
                  <Pressable
                    key={i.cle}
                    accessibilityRole="button"
                    accessibilityLabel={`Icône ${i.nom}`}
                    accessibilityState={{ selected: actif }}
                    style={s.teinte}
                    onPress={() => {
                      setIconePref(i.cle);
                      haptic('leger');
                    }}>
                    <View
                      style={[
                        s.iconeCarre,
                        { backgroundColor: teinte },
                        actif && { borderColor: c.ink },
                      ]}>
                      <Svg width={22} height={22} viewBox="0 0 24 24">
                        <Path
                          d={SOLAIRES.rooms}
                          fill={i.natif ? '#FFFFFF' : c.ink}
                          fillRule="evenodd"
                        />
                      </Svg>
                    </View>
                    <Text style={[s.teinteMot, actif && s.apparenceMotActif]}>
                      {i.nom}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Text style={s.section}>Données et compte</Text>
        <Rangee
          s={s}
          c={c}
          icone="rooms"
          label="Mes plans"
          note={saves.length ? String(saves.length) : undefined}
          onPress={() => setScreen('library')}
        />
        <Rangee
          s={s}
          c={c}
          icone="save"
          label="Restaurer l’achat"
          onPress={restaurer}
        />
        <Rangee
          s={s}
          c={c}
          icone="bouclier"
          label="Confidentialité des données"
          onPress={() => setScreen('confidentialite')}
        />
        {/*
          LE FILM DE LA PRÉSENTATION — il avait sa tuile sur l'accueil, que la
          lecture des plans papier a prise. Il se revoit d'ici : on le
          rejoue, et l'on revient à l'accueil, où il se joue.
        */}
        <Rangee
          s={s}
          c={c}
          icone="aide"
          label="Revoir la présentation"
          onPress={() => {
            revoir('accueil');
            setScreen('home');
          }}
        />
      </ScrollView>

      <MenuCompte visible={menu} fermer={() => setMenu(false)} />
      <SupportSheet visible={support} fermer={() => setSupport(false)} />
      <JournalSheet visible={journal} fermer={() => setJournal(false)} />
      <PromptSheet data={prompt} onClose={() => setPrompt(null)} />
    </RetourGlisse>
  );
}

/** Une rangée de réglage : icône, mot, chevron — le motif du design. */
function Rangee({
  s,
  c,
  icone,
  label,
  note,
  valeur,
  onPress,
}: {
  s: ReturnType<typeof themed>;
  c: Palette;
  icone: keyof typeof SOLAIRES;
  label: string;
  note?: string;
  /** Ce que le réglage vaut, en clair, à droite. */
  valeur?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.rangee, pressed && s.rangeeEnfoncee]}
      onPress={onPress}>
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path d={SOLAIRES[icone]} fill={c.inkSoft} fillRule="evenodd" />
      </Svg>
      <Text style={s.rangeeMot}>{label}</Text>
      {!!note && <Text style={s.rangeeNote}>{note}</Text>}
      {!!valeur && (
        <Text style={s.rangeeValeur} numberOfLines={1}>
          {valeur}
        </Text>
      )}
      {/* Le chevron pointe à droite : la même flèche que le retour, retournée. */}
      <View style={s.chevronDroit}>
        <BackChevron color={c.inkFaint} size={20} weight={2.2} />
      </View>
    </Pressable>
  );
}

/**
 * LES CHAMPS DE L'ENTREPRISE — dans l'ordre du cartouche : le nom d'abord,
 * puis ce qu'on lit pour joindre l'artisan.
 */
const CHAMPS_ENTREPRISE: { cle: keyof Entreprise; label: string; icone: keyof typeof SOLAIRES }[] = [
  { cle: 'nom', label: 'Nom de l’entreprise', icone: 'etiquette' },
  { cle: 'telephone', label: 'Téléphone', icone: 'telephone' },
  { cle: 'email', label: 'E-mail', icone: 'tchat' },
  { cle: 'adresse', label: 'Adresse', icone: 'maison' },
  { cle: 'siret', label: 'SIRET', icone: 'bouclier' },
  { cle: 'decennale', label: 'Assurance décennale', icone: 'bouclier' },
];

const themed = (c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    contenu: { paddingHorizontal: 22 },
    barre: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 18,
    },
    // Les deux ronds de la barre sont jumeaux : deux tailles inégales sur
    // la même ligne se lisent comme un accident.
    rondBarre: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...ombreBouton,
    },
    titreBarre: { color: c.ink, fontSize: 17, fontWeight: '700' },
    // Deux ronds jumeaux à droite : le tchat, puis le menu.
    barreDroite: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    /*
      L'ICÔNE EST LE DISQUE — relevé du patron : « refais l'avatar en bleu
      et le contour autour de l'icône, sans marge blanche ».

      La silhouette Solar est un cercle PLEIN dont le buste est découpé :
      peinte en bleu, elle EST l'avatar, et il n'y a plus de disque de
      fond à poser derrière — c'est lui qui faisait la marge claire. Le
      cadre ne garde donc que le centrage.
    */
    avatar: { alignSelf: 'center' },
    // Le contour AU RAS : quatre-vingt-huit pour une icône de
    // quatre-vingt-quatre, soit l'épaisseur du trait de chaque côté. Le
    // même réglage que sur l'accueil, où l'anneau avait déjà dû se
    // rapprocher — un disque clair entre les deux se lit comme un défaut.
    avatarCadre: { width: 88, height: 88, alignSelf: 'center' },
    avatarDedans: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    nom: {
      color: c.ink,
      fontSize: 21,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: 12,
    },
    nomOr: { alignSelf: 'center', marginTop: 12 },
    email: {
      color: c.inkFaint,
      fontSize: 13.5,
      textAlign: 'center',
      marginTop: 3,
    },
    /* La porte de l'invité : un bouton d'encre, sobre — le frère de celui
       du tracé de l'accueil. */
    seConnecter: {
      marginTop: 14,
      alignSelf: 'center',
      backgroundColor: c.ink,
      borderRadius: 999,
      paddingHorizontal: 20,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    seConnecterTexte: { color: c.bg, fontSize: 14, fontWeight: '700' },
    // Les titres de section : petits, gras, à gauche — ils découpent la
    // page sans jamais se disputer la vedette avec le nom.
    section: {
      color: c.ink,
      fontSize: 16,
      fontWeight: '600',
      marginTop: 26,
      marginBottom: 10,
    },
    carteAbo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingVertical: 14,
      paddingHorizontal: 14,
      ...shadowCard,
      shadowOpacity: 0.06,
    },
    rondEtoile: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aboTextes: { flex: 1, minWidth: 0 },
    aboTitre: { color: c.ink, fontSize: 15.5, fontWeight: '700' },
    aboSous: { color: c.inkSoft, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
    // La date se lit d'un ton en dessous : c'est une précision, pas le
    // titre — mais elle porte la graisse, parce qu'on vient la chercher.
    aboDate: { color: c.blue, fontSize: 12, fontWeight: '700', marginTop: 3 },
    // Le bouton de la carte est PLEIN et sombre, comme dans le design : sur
    // une carte blanche, c'est le seul contraste qui dit « touche ici ».
    boutonAbo: {
      backgroundColor: c.ink,
      borderRadius: radius.pill,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    boutonAboTexte: { color: c.bg, fontSize: 13, fontWeight: '600' },
    // Le même bouton, cerclé : quand une autre action est la principale.
    boutonAboSecondaire: {
      borderRadius: radius.pill,
      paddingHorizontal: 15,
      paddingVertical: 8,
      borderWidth: 1.5,
      borderColor: c.lineStrong,
    },
    boutonAboSecondaireTexte: { color: c.ink, fontSize: 13, fontWeight: '600' },
    espaceAdmin: { height: 10 },
    reglagesApparence: { marginTop: 6, marginBottom: 4 },
    rangeeApparence: { marginTop: 26 },
    // Le chevron du repli : vers le bas fermé, vers le haut ouvert.
    chevronFerme: { transform: [{ rotate: '-90deg' }] },
    chevronOuvert: { transform: [{ rotate: '90deg' }] },
    apparences: { flexDirection: 'row', gap: 12 },
    apparence: { flex: 1, alignItems: 'center', gap: 7 },
    apparenceRond: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'transparent',
      ...shadowCard,
      shadowOpacity: 0.06,
    },
    apparenceRondActif: { borderColor: c.blue, backgroundColor: c.blueSoft },
    apparenceMot: { color: c.inkSoft, fontSize: 12.5, fontWeight: '600' },
    /* Les teintes d'accent : quatre pastilles de la couleur qu'elles posent.
       On choisit une couleur en la voyant. */
    teintes: { flexDirection: 'row', gap: 12, marginTop: 14 },
    teinte: { flex: 1, alignItems: 'center', gap: 6 },
    teinteRond: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2.5,
      borderColor: 'transparent',
      // La règle de la maison pour tout bloc rond : il déclare son centrage,
      // même vide — la coche qu'on y posera un jour tombera juste.
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.08,
    },
    teinteMot: { color: c.inkSoft, fontSize: 11.5, fontWeight: '600' },
    teinteTitre: {
      color: c.inkSoft,
      fontSize: 12.5,
      fontWeight: '700',
      marginTop: 18,
      marginBottom: 2,
    },
    /* L'icône est un CARRÉ arrondi, pas un rond : c'est la forme qu'elle
       aura sur l'écran d'accueil, et une pastille ronde ferait croire à une
       troisième teinte. */
    iconeCarre: {
      width: 44,
      height: 44,
      borderRadius: 11,
      borderWidth: 2.5,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.08,
    },
    apparenceMotActif: { color: c.blue, fontWeight: '600' },
    rangee: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingVertical: 15,
      paddingHorizontal: 14,
      marginBottom: 10,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    rangeeEnfoncee: { backgroundColor: c.surfaceSunken },
    rangeeMot: { flex: 1, color: c.ink, fontSize: 14.5, fontWeight: '600' },
    rangeeNote: { color: c.inkFaint, fontSize: 13, fontWeight: '700' },
    rangeeValeur: { color: c.inkSoft, fontSize: 13, maxWidth: '55%' },
    sectionDit: { color: c.inkSoft, fontSize: 13, marginTop: -4, marginBottom: 8 },
    chevronDroit: { transform: [{ rotate: '180deg' }] },
    enfonce: { transform: [{ scale: 0.97 }] },
  });
