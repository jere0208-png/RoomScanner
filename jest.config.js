module.exports = {
  preset: '@react-native/jest-preset',
  // Le doublet du module natif, pour toutes les suites : voir jest.setup.js.
  setupFiles: ['<rootDir>/jest.setup.js'],
};
