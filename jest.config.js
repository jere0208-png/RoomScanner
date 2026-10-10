module.exports = {
  preset: '@react-native/jest-preset',
  // Le doublet du module natif et celui des icônes : voir jest.setup.js.
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Une icône Lucide importée seule : la même doublure que l'import groupé.
  moduleNameMapper: {
    '^lucide-react-native/icons/.+$': '<rootDir>/jest.icone-lucide.js',
  },
  /*
    VINGT SECONDES PAR ÉPREUVE, ET NON CINQ.

    Cinq secondes est le défaut de Jest, pensé pour des épreuves unitaires.
    Or la moitié des bancs de cette maison MONTE UN ÉCRAN ENTIER — le devis
    et ses trois cents lignes, l'établi et son mur, le plan et ses calques —
    puis le pilote au doigt. Sur une machine au repos, chacun tient
    largement ; sur une machine occupée, ils frôlent la borne.

    ET ILS SONT TOMBÉS DEUX FOIS DE SUITE À LA LIVRAISON, alors que la même
    suite passait en soixante-dix secondes à froid une minute plus tôt : neuf
    puis treize épreuves en dépassement, aucune assertion en cause, et des
    suites qui mettaient deux cent soixante-sept secondes au lieu de dix. Une
    chaîne de livraison qui échoue pour cette raison-là apprend surtout à ne
    plus lire ses échecs.

    CELA N'AFFAIBLIT AUCUNE VÉRIFICATION : une épreuve qui PEND vraiment
    échoue toujours, un peu plus tard. Ce qu'on retire, c'est la sanction de
    la lenteur — qui ne prouve rien sur le code.
  */
  testTimeout: 20000,
};
