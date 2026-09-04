import React, { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { ExportScreen } from './src/screens/ExportScreen';
import { DevisScreen } from './src/screens/DevisScreen';
import { CameraScreen } from './src/screens/CameraScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { ProfilScreen } from './src/screens/ProfilScreen';
import { ConfidentialiteScreen } from './src/screens/ConfidentialiteScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { EcranChargement } from './src/components/EcranChargement';
import { MagasinScreen } from './src/screens/MagasinScreen';
import { GammeScreen } from './src/screens/GammeScreen';
import { reprendreLesTarifs } from './src/net/tarifs';
import { EssaiEpuise } from './src/components/EssaiEpuise';
import { SurprisePro } from './src/components/SurprisePro';
import { AvisRecompense } from './src/components/AvisRecompense';
import { AlerteHote } from './src/components/AlerteHote';
import { AstuceHote } from './src/components/AstuceHote';
import { GardeFou } from './src/components/GardeFou';
import { usePannes } from './src/ui/journalPannes';
import { PremierLancement } from './src/components/PremierLancement';
import { usePremieresFois } from './src/store/premieresFois';
import { useScanStore } from './src/store/scanStore';
import { prendreLaDemande, suiteDuRaccourci } from './src/ui/raccourci';
import { astuce } from './src/ui/astuce';
import { useAccountStore } from './src/store/accountStore';

/**
 * LE GARDE-FOU ENVELOPPE TOUT — voir `src/components/GardeFou.tsx`.
 *
 * Relevé du patron : « l'app a quitté plusieurs fois après des clics sur des
 * meubles. Fais en sorte qu'on ait un diagnostic d'erreurs. »
 *
 * IL EST POSÉ AU-DESSUS DE TOUT, y compris du fournisseur de marges et du
 * thème : ce qu'on veut attraper, c'est une panne qui pouvait venir de
 * n'importe où — et un filet qui commence sous la branche cassée ne sert à
 * rien.
 *
 * IL LIT L'ÉCRAN AU MOMENT DE LA PANNE, et directement dans le magasin : un
 * composant de secours n'a pas le droit d'être abonné à quoi que ce soit,
 * puisque l'abonnement est peut-être ce qui vient de tomber.
 */
export default function App() {
  return (
    <GardeFou ecran={() => useScanStore.getState().screen}>
      <Application />
    </GardeFou>
  );
}

function Application() {
  const screen = useScanStore((s) => s.screen);
  const loadSaves = useScanStore((s) => s.loadSaves);
  const savesCharges = useScanStore((s) => s.savesCharges);
  const repriseAuBesoin = useScanStore((s) => s.repriseAuBesoin);
  const compte = useAccountStore((s) => s.compte);
  const invite = useAccountStore((s) => s.invite);
  const compteCharge = useAccountStore((s) => s.charge);
  const chargerCompte = useAccountStore((s) => s.charger);
  const c = useTheme();
  const darkContent = screen !== 'scan' && c.bg === '#F6F7F9';

  const chargerLesPremieresFois = usePremieresFois((s) => s.charger);
  const premierLancement = usePremieresFois((s) => s.charge && !s.vues.includes('accueil'));
  const marquerPremiere = usePremieresFois((s) => s.marquer);
  const chargerLesPannes = usePannes((s) => s.charger);

  useEffect(() => {
    loadSaves();
    chargerCompte();
    /*
      CE QU'ON N'A PAS ENCORE DIT, LU AU LANCEMENT.

      Tant que le disque n'a pas répondu, RIEN n'est neuf (voir `estNeuve`) :
      c'est le sens prudent, et il évite de montrer une visite guidée une
      demi-seconde avant que le disque ne dise qu'on l'a déjà vue.
    */
    chargerLesPremieresFois();
    /*
      ET LE JOURNAL DES PANNES, pour que le profil sache s'il a quelque chose
      à montrer. Il est lu au lancement et non à l'ouverture du profil : une
      pastille qui n'apparaît qu'après être entré dans la page ne dit à
      personne qu'il faut y entrer.
    */
    chargerLesPannes();
    /*
      LES PRIX GARDÉS REPRENNENT LEUR PLACE AU LANCEMENT.

      Sans réseau, et sans ouvrir le devis. La pastille du plan annonce un
      total avant même qu'on ait demandé le prix : si elle chiffrait aux prix
      embarqués pendant que le devis chiffre au dernier catalogue reçu, les
      deux se contrediraient — et c'est toujours celui qu'on n'a pas relu qui
      part au client.
    */
    reprendreLesTarifs().catch(() => {
      // Rien de gardé, ou stockage illisible : les prix embarqués chiffrent,
      // comme ils l'ont toujours fait.
    });
  }, [loadSaves, chargerCompte, chargerLesPremieresFois, chargerLesPannes]);

  /*
    « DIS SIRI, NOUVEAU RELEVÉ » — et l'appui long sur l'icône.

    L'écoute vit ICI, dans le seul composant toujours monté : la demande peut
    arriver alors que l'accueil ne l'est pas — on dit la phrase en marchant,
    l'application était restée sur un plan.

    ELLE SE PREND AU LANCEMENT ET À CHAQUE RETOUR AU PREMIER PLAN. Le
    lancement à froid est le cas le plus fréquent (on parle justement quand
    l'app est fermée) ; le retour couvre l'autre, où iOS ramène l'app sans
    la relancer.

    ET C'EST L'ACCUEIL QUI SCANNE, par son propre chemin — garde du palier
    gratuit comprise. Une porte dérobée qui contournerait l'offre serait un
    défaut, pas une facilité.
  */
  useEffect(() => {
    let vivant = true;
    const traiter = async () => {
      const demande = await prendreLaDemande();
      if (!vivant || !demande) return;
      const st = useScanStore.getState();
      const suite = suiteDuRaccourci({
        demande,
        screen: st.screen,
        dirty: st.dirty,
      });
      if (suite.faire === 'scanner') {
        if (st.screen !== 'home') st.setScreen('home');
        st.setRaccourciEnAttente(true);
      } else if (suite.faire === 'dire') {
        astuce(suite.message, { icone: 'save' });
      }
    };
    traiter();
    const abonne = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') traiter();
    });
    return () => {
      vivant = false;
      abonne.remove();
    };
  }, []);

  /*
    LES PLANS DU COMPTE REDESCENDENT DÈS QUE LES DEUX SONT LÀ.

    Deux chemins mènent ici, et c'est voulu : l'app rouverte avec un compte
    déjà en poche, et la connexion qui suit une réinstallation. Les deux
    lectures — bibliothèque locale et compte — sont asynchrones et
    n'arrivent pas dans un ordre garanti ; on attend donc les DEUX plutôt
    que de parier sur l'une. `repriseAuBesoin` se charge de ne le faire
    qu'une fois.
  */
  useEffect(() => {
    if (!compte || !savesCharges) return;
    repriseAuBesoin().catch(() => {
      // Un serveur muet ne se dit pas au lancement : les plans du téléphone
      // sont là, et la reprise se retentera au prochain démarrage.
    });
  }, [compte, savesCharges, repriseAuBesoin]);

  /**
   * PAS D'APP SANS COMPTE. La porte d'entrée se montre tant que personne
   * n'est connecté — et rien avant d'avoir LU le stockage : afficher la
   * connexion une demi-seconde à quelqu'un qui a déjà un compte ferait
   * croire à une déconnexion à chaque lancement.
   */
  /*
    RIEN TANT QUE LE COMPTE N'EST PAS LU — mais « rien » n'est pas une page
    vide.

    La règle ne change pas : afficher l'accueil une demi-seconde avant la
    porte d'entrée ferait croire à une déconnexion à chaque lancement. Ce qui
    change, c'est ce qu'on montre pendant ce temps. C'était le fond nu, entre
    l'écran de lancement d'iOS (l'icône, en grand, au centre) et l'accueil :
    une coupure au milieu d'une ouverture se lit comme un plantage.

    Relevé du patron : « au chargement de l'app, mets les 2 logos superposés
    comme on a fait pour l'accueil, mais centré à l'écran ».
  */
  if (!compteCharge) {
    return (
      <SafeAreaProvider>
        <StatusBar
          barStyle={darkContent ? 'dark-content' : 'light-content'}
          backgroundColor={c.bg}
        />
        <EcranChargement />
      </SafeAreaProvider>
    );
  }
  // Sans compte MAIS en invité, l'app s'ouvre : son cœur est local, et le
  // mur de connexion était l'écran où l'on perdait le plus de monde.
  if (!compte && !invite) {
    return (
      <SafeAreaProvider>
        <StatusBar
          barStyle={darkContent ? 'dark-content' : 'light-content'}
          backgroundColor={c.bg}
        />
        <SignInScreen />
      </SafeAreaProvider>
    );
  }

  /**
   * LES MARGES DU SYSTÈME, fournies à toute l'app.
   *
   * L'encoche en haut était absorbée par un `paddingTop` de 58 points écrit
   * à la main ; en bas, rien — et la barre d'outils du plan passait SOUS
   * l'indicateur d'accueil de l'iPhone, ses mots tranchés par le trait
   * blanc. On demande donc au système ce qu'il occupe, plutôt que de le
   * deviner : c'est la même mesure sur un iPhone à encoche, sur un modèle à
   * bouton, et sur un iPad.
   */
  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={darkContent ? 'dark-content' : 'light-content'}
        backgroundColor={screen === 'scan' ? '#000000' : c.bg}
      />
      {screen === 'home' && <HomeScreen />}
      {screen === 'profil' && <ProfilScreen />}
      {screen === 'confidentialite' && <ConfidentialiteScreen />}
      {screen === 'scan' && <ScanScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'library' && <LibraryScreen />}
      {screen === 'export' && <ExportScreen />}
      {screen === 'devis' && <DevisScreen />}
      {screen === 'magasin' && <MagasinScreen />}
      {screen === 'gamme' && <GammeScreen />}
      {screen === 'camera' && <CameraScreen />}
      <PaywallScreen />
      <EssaiEpuise />
      {/*
        LE PREMIER LANCEMENT, ET RIEN QU'UNE FOIS.

        Il ne se montre que sur l'ACCUEIL : quelqu'un qui a un scan en cours
        — l'application rouverte au milieu d'un relevé — n'a pas à recevoir
        une présentation par-dessus son travail.
      */}
      {screen === 'home' && premierLancement && (
        <PremierLancement onFini={() => marquerPremiere('accueil')} />
      )}
      <SurprisePro />
      <AvisRecompense />
      {/* Nos alertes à nous : voir `src/ui/alerte.ts`. Montée ici parce
          qu'un message d'erreur doit survivre à l'écran qui l'a levé — on
          apprend souvent EN QUITTANT qu'un enregistrement a échoué. */}
      <AlerteHote />
      {/*
        ET LE MOT QUI PASSE — voir `src/ui/astuce.ts`. Monté ici pour la même
        raison que l'alerte : une astuce naît là où le geste se produit, et
        l'écran qui l'a levée peut disparaître avant elle. C'est même le cas
        de la plus importante, celle du plan qu'on vient d'enregistrer juste
        avant de sortir.
      */}
      <AstuceHote />
    </SafeAreaProvider>
  );
}
