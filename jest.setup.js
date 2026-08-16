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
