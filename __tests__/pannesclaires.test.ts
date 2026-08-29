/**
 * UNE PANNE DIT QUOI FAIRE, PAS CE QUI A CASSÉ.
 *
 * Relevé du patron, après une passe globale : « on doit penser utilisateur
 * simple, sans professionnalisme forcément. »
 *
 * L'APPLICATION DISAIT LA PANNE, JAMAIS LA SORTIE :
 *
 *     « Export impossible » — « Erreur inconnue »
 *     « Capture impossible » — « Erreur inconnue »
 *     « Enregistrement impossible » — le message brut du système
 *
 * « Impossible » est un constat, et « Erreur inconnue » est un aveu. Ni l'un
 * ni l'autre ne dit ce qu'on peut faire, et c'est pourtant la seule chose que
 * cherche quelqu'un devant un écran bloqué. Le ton juste existait déjà dans
 * l'application — le guide du scan dit « balayez plus lentement, du sol au
 * plafond » — il n'était simplement nulle part ailleurs.
 *
 * CE QUE CE BANC TIENT, ET POURQUOI IL LE TIENT AINSI. Une phrase se juge mal
 * par machine. On mesure donc ce qui se mesure : qu'il y ait un VERBE D'ACTION
 * dans chaque message, qu'aucun ne renvoie l'aveu d'origine, et que le détail
 * technique s'AJOUTE à la phrase au lieu de la remplacer — un développeur en a
 * besoin, l'utilisateur n'en a pas besoin en premier.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUJETS, panne } from '../src/ui/panne';

/** Ce qu'on peut faire : la marque d'une phrase qui aide. */
const VERBES =
  /(Vérifiez|Réessayez|Libérez|Éclairez|Revenez|Rapprochez|Fermez|Reprenez|Touchez|Reconnectez|Redémarrez|Balayez)/;

describe('chaque panne dit quoi faire', () => {
  it('toutes portent un verbe d’action', () => {
    for (const s of SUJETS) {
      const { message } = panne(s);
      expect(`${s} : ${VERBES.test(message)}`).toBe(`${s} : true`);
    }
  });

  it('et un titre qui n’est pas un constat', () => {
    /*
      « Export impossible » dit ce qui n'a pas eu lieu, ce que l'utilisateur
      sait déjà — il vient de le voir. Un titre utile nomme la CHOSE qui a
      manqué, pour qu'on sache tout de suite s'il faut recommencer ou changer
      quelque chose.
    */
    for (const s of SUJETS) {
      const { titre } = panne(s);
      expect(`${s} : ${/impossible/i.test(titre)}`).toBe(`${s} : false`);
      expect(titre.length).toBeGreaterThan(8);
    }
  });

  it('aucune ne dit « Erreur inconnue »', () => {
    for (const s of SUJETS) {
      expect(panne(s).message).not.toMatch(/inconnue/i);
      expect(panne(s, new Error('')).message).not.toMatch(/inconnue/i);
    }
  });
});

describe('le détail technique s’ajoute, il ne remplace pas', () => {
  it('la phrase reste, le détail suit', () => {
    const nu = panne('export').message;
    const avec = panne('export', new Error('disk full')).message;
    expect(avec.startsWith(nu)).toBe(true);
    expect(avec).toContain('disk full');
  });

  it('sans détail, aucune parenthèse vide', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il vient d'un défaut classique : une
      concaténation qui ne teste rien laisse « (undefined) » ou « () » à la
      fin de la phrase, ce qui se lit exactement comme un bug.
    */
    for (const cause of [undefined, null, '', new Error(''), {}]) {
      const m = panne('capture', cause).message;
      expect(`${JSON.stringify(cause)} : ${/\(\s*\)|undefined|null/.test(m)}`).toBe(
        `${JSON.stringify(cause)} : false`,
      );
    }
  });

  it('et un détail à rallonge n’est pas recopié', () => {
    /*
      Une trace d'appel de six lignes collée sous la phrase, c'est la phrase
      qu'on ne lit plus. Au-delà d'une longueur raisonnable, on garde la
      consigne seule — le détail reste dans les journaux, à sa place.
    */
    const long = 'x'.repeat(400);
    const m = panne('export', new Error(long)).message;
    expect(m).not.toContain(long);
    expect(m).toBe(panne('export').message);
  });

  it('un détail déjà dit ne se répète pas', () => {
    // Le message du système redit parfois la consigne. On ne l'écrit pas deux
    // fois : deux phrases identiques se lisent comme un défaut d'affichage.
    const nu = panne('connexion').message;
    expect(panne('connexion', new Error(nu)).message).toBe(nu);
  });
});

describe('et les écrans s’en servent', () => {
  /*
    L'ÉPREUVE DE L'OUVRAGE, et c'est elle qui compte. Le module peut être
    parfait et les écrans continuer d'écrire « Erreur inconnue » : c'est
    exactement ce qui s'était passé pour le mois des tarifs, corrigé d'un côté
    et pas de l'autre.
  */
  const ECRANS = [
    'screens/ResultScreen.tsx',
    'screens/ExportScreen.tsx',
    'screens/PaywallScreen.tsx',
    'screens/ProfilScreen.tsx',
    'screens/SignInScreen.tsx',
    'screens/ScanScreen.tsx',
  ];
  const source = (f: string) =>
    readFileSync(join(__dirname, '..', 'src', f), 'utf8');

  it('plus un seul « Erreur inconnue » dans les écrans', () => {
    for (const f of ECRANS) {
      expect(`${f} : ${source(f).includes('Erreur inconnue')}`).toBe(
        `${f} : false`,
      );
    }
  });

  it('et plus un seul titre en « … impossible »', () => {
    for (const f of ECRANS) {
      const restes = [...source(f).matchAll(/'[^']*impossible'/gi)].map(
        (m) => m[0],
      );
      expect(`${f} : ${restes.join(', ')}`).toBe(`${f} : `);
    }
  });
});
