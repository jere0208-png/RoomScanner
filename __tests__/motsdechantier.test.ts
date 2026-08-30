/**
 * LES MOTS DE CHARPENTE, TRADUITS POUR TOUT LE MONDE.
 *
 * C'était le point nº 1 du compte rendu « penser utilisateur simple », resté
 * en attente — et la sortie tout public le tranche : « allège », « linteau »,
 * « trumeau », « refend » sont les mots JUSTES du métier, et des mots que
 * personne d'autre n'emploie. Un particulier qui règle la hauteur d'une
 * fenêtre ne doit pas avoir besoin d'un lexique.
 *
 * LA RÈGLE : le mot simple mène, le mot du métier suit entre parenthèses là
 * où il apporte quelque chose (« Bas de fenêtre (allège) » — le pro s'y
 * retrouve, le particulier comprend), et il disparaît là où il n'apportait
 * rien (« mètre posé contre le mur » dit tout ce que « contre le refend »
 * disait).
 *
 * LE DOSSIER PDF, LUI, GARDE SA VOIX DE PRO : c'est un document d'étude
 * remis à des artisans, et « allège » y est le mot attendu.
 *
 * Ce banc lit le code source, comme `motsclairs` avant lui — sur des
 * PHRASES EXACTES : les commentaires du code parlent métier à des
 * développeurs, et c'est très bien ainsi ; seuls les textes montrés à
 * l’écran sont tenus.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = (p: string) =>
  readFileSync(join(__dirname, '..', 'src', p), 'utf8');

describe('l’écran du plan', () => {
  const src = source('screens/ResultScreen.tsx');

  it('dit « bas de fenêtre » et garde « allège » entre parenthèses', () => {
    expect(src).toContain("title: 'Bas de fenêtre (allège)'");
    expect(src).not.toContain("title: 'Allège'");
  });

  it('ne demande plus de savoir ce qu’est un linteau', () => {
    expect(src).not.toContain('c’est le linteau qui suit');
    expect(src).not.toContain("'Remonter le linteau'");
  });

  it('pose le mètre contre le mur, pas contre le refend', () => {
    expect(src).not.toContain('mètre posé contre le refend');
  });
});

describe('les règles NF C 15-100 montrées à l’écran', () => {
  const src = source('geometry/nfc15100.ts');

  it('ne renvoient personne au trumeau', () => {
    // « Décalez-le sur le trumeau » : le conseil est juste, et illisible
    // pour qui n'a pas le mot. « Sur le mur plein à côté de la baie » dit
    // la même chose à tout le monde.
    expect(src).not.toContain('sur le trumeau, ou au-dessus du linteau');
    expect(src).not.toContain('décalez-le sur le trumeau');
  });
});

describe('le choix d’une menuiserie', () => {
  it('donne la hauteur du bas, pas « allège 95 »', () => {
    expect(source('components/ChoixOuverture.tsx')).not.toContain('allège 95');
  });
});

describe('le diagnostic d’une baie rabotée', () => {
  it('parle de la baie, pas de son linteau', () => {
    expect(source('geometry/diagnostics.ts')).not.toContain(
      'remonte son linteau',
    );
  });
});
