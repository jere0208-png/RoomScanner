module.exports = {
  preset: '@react-native/jest-preset',
  // Le doublet du module natif et celui des icônes : voir jest.setup.js.
  setupFiles: ['<rootDir>/jest.setup.js'],
};
