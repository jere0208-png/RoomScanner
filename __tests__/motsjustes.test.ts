const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

/**
 * LES PETITS MOTS QUI TRAHISSENT UNE APPLICATION.
 *
 * Deux defauts que le patron a sous les yeux depuis le debut, sur chacune des
 * captures qu'il envoie, et qu'on ne voyait plus a force de les croiser.
 *
 * « 1 OBJETS ». La ligne de resume d'un scan, dans la bibliotheque, ecrit
 * « 4 murs · 9,8 m² · 1 objets ». L'application sait pourtant accorder — le
 * choix d'apres-scan dit « 1 meuble detecte », la visite client dit
 * « 1 piece » — mais chaque endroit refaisait le calcul dans son coin, et
 * trois d'entre eux l'avaient oublie. Un pluriel fautif sur un dossier qu'on
 * montre au client, c'est le genre de detail qui fait douter du reste.
 *
 * « SCAN DU 25/08 A 2… ». Le nom que porte un releve neuf tient en vingt et
 * un caracteres, et l'en-tete du plan en affiche dix-huit : il est tronque
 * A CHAQUE FOIS, des la premiere seconde, sur l'ecran ou l'on passe le plus
 * de temps. Trois mots n'y servaient a rien — « du », « a », et l'espace
 * qu'ils prennent : « Scan 25/08 · 23h45 » dit la meme chose et tient.
 *
 * Le point important : on ne renomme PAS les releves existants. Un nom est
 * ce que l'electricien a sous les yeux depuis des semaines, parfois ce qu'il
 * a dicte au client. Seuls les nouveaux prennent la forme courte.
 */
import { pluriel, resumeDuScan } from '../src/ui/mots';
import { defaultName } from '../src/store/scanStore';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('l’accord au singulier', () => {
  it('dit « 1 objet », pas « 1 objets »', () => {
    expect(pluriel(1, 'objet')).toBe('1 objet');
    expect(pluriel(2, 'objet')).toBe('2 objets');
  });

  it('vaut pour zero, qui reste au singulier en francais', () => {
    // « 0 mur », et non « 0 murs » : la regle du francais, pas celle de
    // l'anglais.
    expect(pluriel(0, 'mur')).toBe('0 mur');
  });

  it('accorde aussi ce qui ne prend pas un simple s', () => {
    // Une piece prend un accent, pas une exception ; mais un « x » en prend
    // une, et le jour ou l'app dira « 2 bureaux » elle ne dira pas
    // « 2 bureauxs ».
    expect(pluriel(2, 'pièce')).toBe('2 pièces');
    expect(pluriel(2, 'bureau', 'bureaux')).toBe('2 bureaux');
    expect(pluriel(1, 'bureau', 'bureaux')).toBe('1 bureau');
  });
});

describe('le resume d’un scan dans la bibliotheque', () => {
  it('accorde tout ce qu’il compte', () => {
    expect(
      resumeDuScan({ pieces: 1, murs: 1, objets: 1, surface: null }),
    ).toBe('1 mur · 1 objet');
  });

  it('ne dit le nombre de pieces que s’il y en a plusieurs', () => {
    // Une piece unique, c'est le cas normal : le dire n'apprend rien.
    const seule = resumeDuScan({ pieces: 1, murs: 4, objets: 0, surface: null });
    expect(seule).toBe('4 murs');
    const deux = resumeDuScan({ pieces: 2, murs: 6, objets: 0, surface: null });
    expect(deux).toContain('2 pièces');
  });

  it('tait ce qu’il n’a pas', () => {
    // Pas de meuble releve : « 0 objet » remplirait la ligne pour rien.
    expect(resumeDuScan({ pieces: 1, murs: 4, objets: 0, surface: null })).not.toContain(
      'objet',
    );
  });

  it('porte la surface quand elle est connue, et son « environ »', () => {
    expect(
      resumeDuScan({ pieces: 1, murs: 4, objets: 0, surface: { area: 9.75, exact: true } }),
    ).toContain('9,8 m²');
    expect(
      resumeDuScan({ pieces: 1, murs: 4, objets: 0, surface: { area: 9.75, exact: false } }),
    ).toContain('≈ 9,8 m²');
  });
});

/*
  ET CES MOTS-LA ARRIVENT BIEN A L'ECRAN.

  Un module qui sait accorder ne sert a rien si l'ecran refait le calcul dans
  son coin — c'est exactement ce qui s'etait passe : l'application accordait a
  trois endroits, et l'oubliait a trois autres. On lit donc les sources : plus
  personne ne fabrique ces comptes a la main.
*/
describe('plus personne ne recompte dans son coin', () => {
  const lire = (f: string) =>
    readFileSync(join(__dirname, '..', 'src', f), 'utf8');

  it('la bibliotheque passe par le module', () => {
    const src = lire('screens/LibraryScreen.tsx');
    expect(src).toContain('resumeDuScan');
    // Le pluriel fige a disparu, avec le « 1 objets » qu'il produisait.
    expect(src).not.toMatch(/\}\s*objets/);
  });

  it('la visite client aussi', () => {
    const src = lire('components/ClientTour.tsx');
    expect(src).toContain('pluriel(');
    expect(src).not.toMatch(/\}\s*murs/);
  });
});

/*
  LE NOM D'UN RELEVE NEUF TIENT DANS L'EN-TETE.

  Dix-huit caracteres : c'est ce que l'en-tete du plan affiche avant de
  tronquer. « Scan du 25/08 a 23h45 » en faisait vingt et un, et se coupait a
  chaque fois. On ne verifie pas le format — il changera peut-etre — mais la
  LONGUEUR, qui est la raison d'etre du changement.
*/
describe('le nom d’un releve neuf', () => {
  it('tient dans l’en-tete du plan', () => {
    // Le 25 aout a 23h45 : la capture du releve, au caractere pres.
    const nom = defaultName(new Date(2026, 7, 25, 23, 45));
    expect(nom.length).toBeLessThanOrEqual(18);
    // Il dit toujours QUAND, c'est tout ce qu'on lui demande.
    expect(nom).toContain('25/08');
    expect(nom).toContain('23h45');
  });

  it('garde ses deux chiffres, meme en janvier a une heure du matin', () => {
    expect(defaultName(new Date(2026, 0, 2, 1, 5))).toContain('02/01');
    expect(defaultName(new Date(2026, 0, 2, 1, 5))).toContain('01h05');
  });
});
