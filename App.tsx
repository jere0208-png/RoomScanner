import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { ExportScreen } from './src/screens/ExportScreen';
import { CameraScreen } from './src/screens/CameraScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { useScanStore } from './src/store/scanStore';
import { useAccountStore } from './src/store/accountStore';

export default function App() {
  const screen = useScanStore((s) => s.screen);
  const loadSaves = useScanStore((s) => s.loadSaves);
  const compte = useAccountStore((s) => s.compte);
  const compteCharge = useAccountStore((s) => s.charge);
  const chargerCompte = useAccountStore((s) => s.charger);
  const c = useTheme();
  const darkContent = screen !== 'scan' && c.bg === '#F6F7F9';

  useEffect(() => {
    loadSaves();
    chargerCompte();
  }, [loadSaves, chargerCompte]);

  /**
   * PAS D'APP SANS COMPTE. La porte d'entrée se montre tant que personne
   * n'est connecté — et rien avant d'avoir LU le stockage : afficher la
   * connexion une demi-seconde à quelqu'un qui a déjà un compte ferait
   * croire à une déconnexion à chaque lancement.
   */
  if (compteCharge && !compte) {
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
      {screen === 'scan' && <ScanScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'library' && <LibraryScreen />}
      {screen === 'export' && <ExportScreen />}
      {screen === 'camera' && <CameraScreen />}
      <PaywallScreen />
    </SafeAreaProvider>
  );
}
