/**
 * Le module natif n'existe pas sous Node — et il le fait savoir bruyamment.
 *
 * `react-native-room-scan` ouvre un `NativeEventEmitter` au chargement du
 * module ; sans binaire iOS en face, l'invariant de React Native fait
 * échouer la SUITE ENTIÈRE, avant même le premier test. Chaque fichier qui
 * rendait un composant touchant de près ou de loin au scan devait donc
 * répéter le même `jest.mock` — et celui qui l'oubliait voyait une erreur
 * qui ne parlait ni de son test ni de son composant.
 *
 * Le doublet est ici, une fois pour toutes. Un fichier qui veut autre chose
 * (une photo qui répond, un cap qui tourne) garde la main : son propre
 * `jest.mock` l'emporte sur celui-ci.
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => false),
    takePhoto: jest.fn(async () => null),
    readPhoto: jest.fn(async () => null),
    deletePhotos: jest.fn(async () => 0),
    startHeading: jest.fn(async () => false),
    stopHeading: jest.fn(async () => false),
    heading: jest.fn(async () => null),
    sharePDF: jest.fn(async () => true),
    shareText: jest.fn(async () => true),
    shareFile: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: { addListener: jest.fn(), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
}));

/**
 * Les icônes de Lucide, en doublet — pour le temps, pas pour la forme.
 *
 * Le paquet est publié en modules ES que Jest ne transforme pas, et sa
 * version CommonJS charge les mille sept cents icônes d'un bloc : soixante
 * secondes par suite qui touche un écran. Ce que nos tests vérifient, c'est
 * qu'une icône est demandée et où elle se pose, jamais son tracé.
 */
jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: (_cible, nom) => (nom === '__esModule' ? true : 'LucideIcon'),
    },
  ),
);

/**
 * La capture d'écran : native, elle aussi.
 *
 * `react-native-view-shot` est importé par l'écran des résultats — donc par
 * tout test qui veut le monter. Sous Node il n'a rien à capturer ; ce qu'on
 * vérifie ici, ce sont les bandeaux de réglage, jamais l'image produite.
 */
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///tmp/capture.png'),
}));

/**
 * LES MARGES DU SYSTÈME, sous Node.
 *
 * `useSafeAreaInsets` lit un contexte fourni par `SafeAreaProvider`, qui
 * lui-même mesure la fenêtre native. Sous Node il n'y en a pas, et le
 * module refuse de répondre plutôt que d'inventer — c'est la bonne
 * décision de sa part, et elle fait tomber tout écran qui l'appelle.
 *
 * Le banc rend donc les marges d'un iPhone à encoche : la barre du bas s'y
 * mesure comme sur l'appareil, et une épreuve peut vérifier qu'on la
 * respecte.
 */
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const marges = { top: 59, bottom: 34, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children }) => React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => marges,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
