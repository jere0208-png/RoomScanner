/**
 * CE QUE L'APP STORE EXIGE POUR SORTIR — tenu par un banc, pas par la chance.
 *
 * Trois défauts dormaient dans les fichiers natifs, invisibles de tous les
 * bancs JavaScript, et chacun coûte un aller-retour avec la revue Apple
 * (deux jours, au mieux) :
 *
 *   — une chaîne d'usage VIDE (`NSLocationWhenInUseUsageDescription`) : la
 *     localisation n'est demandée nulle part — la boussole passe par
 *     CoreMotion, choisi justement pour ne rien demander — et une clé vide
 *     est un motif de rejet automatique ;
 *   — `ITSAppUsesNonExemptEncryption` absent : HTTPS standard uniquement,
 *     mais sans l'affirmation, CHAQUE envoi TestFlight pose la question de
 *     l'export de chiffrement ;
 *   — un manifeste de confidentialité qui jurait « rien collecté » alors que
 *     le serveur des comptes est configuré : e-mail et prénom à la
 *     connexion, identifiants de compte et d'appareil, et les plans
 *     eux-mêmes montent en sauvegarde. Mentir ici, c'est l'étiquette App
 *     Store qui ment aux utilisateurs.
 *
 * Ce banc lit les fichiers de l'app — le jour où quelqu'un ajoutera une
 * permission, il lui rappellera d'écrire sa phrase.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lire = (p: string) =>
  readFileSync(join(__dirname, '..', 'ios', 'RoomScanner', p), 'utf8');

describe('Info.plist', () => {
  const plist = lire('Info.plist');

  it('n’a aucune chaîne d’usage vide', () => {
    // Le motif exact du rejet : une clé *UsageDescription suivie d'une
    // chaîne vide.
    expect(plist).not.toMatch(
      /UsageDescription<[^>]*>[^<]*<string><[/]string>/,
    );
    expect(plist).not.toContain('<string></string>');
  });

  it('ne réclame pas la localisation : rien ne s’en sert', () => {
    expect(plist).not.toContain('NSLocationWhenInUseUsageDescription');
  });

  it('parle français à qui accorde la caméra', () => {
    expect(plist).toMatch(/NSCameraUsageDescription/);
    expect(plist).toContain('scanner votre pièce');
  });

  it('affirme son chiffrement exempté, une fois pour toutes', () => {
    expect(plist).toContain('ITSAppUsesNonExemptEncryption');
  });
});

describe('le manifeste de confidentialité', () => {
  const manifeste = lire('PrivacyInfo.xcprivacy');

  it('déclare ce qui monte au compte : identité et plans', () => {
    for (const type of [
      'NSPrivacyCollectedDataTypeEmailAddress',
      'NSPrivacyCollectedDataTypeName',
      'NSPrivacyCollectedDataTypeUserID',
      'NSPrivacyCollectedDataTypeDeviceID',
      'NSPrivacyCollectedDataTypeOtherUserContent',
    ]) {
      expect(manifeste).toContain(type);
    }
  });

  it('et jure — vrai — qu’aucune donnée ne sert au pistage', () => {
    expect(manifeste).toMatch(/NSPrivacyTracking/);
    // La valeur qui suit la clé est bien `false`.
    const apres = manifeste.split('NSPrivacyTracking')[1] ?? '';
    expect(apres).toMatch(/^<[^>]*>[^<]*<false[/]>/);
  });
});
