/**
 * CE QUE SIX NOUVEAUX UTILISATEURS ONT BUTÉ — et ce qu'on en a corrigé.
 *
 * Relevé du patron : « lance des agents sur l'application, ils auront chacun
 * un but distinct ; ils devront juger indépendamment de la qualité et du
 * côté intuitif de l'application, sans connaissances préalables ». Six
 * parcours : Marie (mesurer et meubler), Karim (électricien, devis), Sophie
 * (le PDF de l'architecte), Paul (percer sans toucher un câble), Nadia
 * (64 ans, un plan pour l'agence), Thomas (ce qu'il paie, ses données).
 *
 * Ce banc tient ce qu'ils ont trouvé de plus grave, et que plusieurs ont
 * trouvé ensemble.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../src/native/account', () => ({
  lireMarqueur: jest.fn(async () => null),
  ecrireMarqueur: jest.fn(async () => undefined),
  connexionApple: jest.fn(async () => ({ id: 'A1', prenom: 'Jé' })),
  acheterAbonnement: jest.fn(async () => true),
  restaurerAbonnement: jest.fn(async () => true),
  echeanceAbonnement: jest.fn(async () => null),
  produitsPro: jest.fn(async () => []),
  ouvrirCodeOffre: jest.fn(async () => true),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';
import { useAlerte } from '../src/ui/alerte';
import { useUsage } from '../src/store/usage';
import { rangerLeTravail } from '../src/ui/miseDeCote';
import { ficheElec } from '../src/screens/result/ficheElec';
import { metresSaisis } from '../src/components/ObjectBar';
import { PremierLancement } from '../src/components/PremierLancement';
import { SurprisePro } from '../src/components/SurprisePro';

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const alerteCourante = () => useAlerte.getState().courante;

beforeEach(() => {
  act(() => {
    useAlerte.setState({ courante: null, file: [] } as never);
    useAccountStore.setState({
      charge: true,
      compte: null,
      invite: true,
      pro: false,
      proVia: null,
      jeton: null,
      paywallVisible: false,
      surpriseVisible: false,
      offres: null,
    } as never);
  });
});

// ------------------------------------------------------------------ l'argent, dit honnêtement

describe('ce qu’on paie, dit avant de payer (Thomas, Nadia, Marie)', () => {
  it('l’invité qui exporte apprend que le PDF est Pro — et que l’image est gratuite', () => {
    expect(useAccountStore.getState().exportOuvert()).toBe(false);
    const q = alerteCourante()!;
    const tout = `${q.titre} ${q.message ?? ''}`;
    // Plus de « un compte sert à l'envoyer en PDF » : un compte gratuit
    // ne suffisait pas, on le découvrait après l'avoir créé.
    expect(tout).not.toMatch(/Un compte sert à l.envoyer/);
    expect(tout).toMatch(/Pro/);
    expect(tout).toMatch(/image/i);
    expect(tout).toMatch(/gratuit/i);
  });

  /*
    MIS À JOUR (revue App Store, 5.1.1 et 3.1.1) : l'achat et la
    restauration ne demandent plus de compte. L'abonnement appartient à
    l'identifiant Apple ; le compte est proposé ENSUITE, pour la sauvegarde.
  */
  it('l’invité voit les prix avant de donner son e-mail — et achète sans compte', async () => {
    const native = jest.requireMock('../src/native/account');
    native.acheterAbonnement.mockClear();
    useAccountStore.getState().ouvrirPaywall();
    expect(useAccountStore.getState().paywallVisible).toBe(true);
    await useAccountStore.getState().acheterPro();
    expect(native.acheterAbonnement).toHaveBeenCalledTimes(1);
    expect(`${alerteCourante()?.message}`).toMatch(/sauvegard/i);
  });

  it('« Restaurer l’achat » en invité : pas de faux succès, pas de « Créez un compte »', async () => {
    const native = jest.requireMock('../src/native/account');
    native.restaurerAbonnement.mockImplementation(async () => false);
    const issue = await useAccountStore.getState().restaurerPro();
    native.restaurerAbonnement.mockImplementation(async () => true);
    expect(issue).toBe('aucun');
    expect(useAccountStore.getState().pro).toBe(false);
    expect(alerteCourante()).toBeNull();
  });

  it('la page Pro dit aussi la lecture de plans, et son plafond', () => {
    const page = lire('src', 'screens', 'PaywallScreen.tsx');
    expect(page).toMatch(/Lecture de plans par IA/);
    expect(page).toMatch(/20 par jour/);
    expect(page).not.toContain('Tout l’outil, sans compter.');
  });

  it('la surprise ne se vend pas d’un appui à côté : un vrai bouton, un vrai « Non merci »', () => {
    act(() => useAccountStore.setState({ compte: { id: 'email:a@b.fr' } as never, invite: false, surpriseVisible: true } as never));
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<SurprisePro />);
    });
    const parLabel = (l: string) => t.root.findAll((n) => n.props?.accessibilityLabel === l && typeof n.props?.onPress === 'function');
    // Une seule zone d'achat : le bouton.
    expect(parLabel('J’en profite')).toHaveLength(1);
    expect(parLabel('J’en profite')[0].findAll((n) => n.type === Text).map((n) => n.props.children).join('')).toBe('J’en profite');
    act(() => parLabel('Non merci')[0].props.onPress());
    expect(useAccountStore.getState().surpriseVisible).toBe(false);
    expect(useAccountStore.getState().paywallVisible).toBe(false);
    act(() => t.unmount());
  });

  it('et elle ne revient pas à chaque export : la deuxième fois, la page Pro', () => {
    const avecOffre = {
      mensuel: { id: 'pro', prix: 4.9, prixAffiche: '4,90 €', offreBienvenue: { prixAffiche: '3,92 €', periodes: 1, unite: 'mois', paiement: 'payAsYouGo' } },
    } as never;
    act(() => useAccountStore.setState({ compte: { id: 'email:a@b.fr' } as never, invite: false, offres: avecOffre } as never));
    useAccountStore.getState().ouvrirSurprise();
    const premiere = useAccountStore.getState().surpriseVisible;
    act(() => useAccountStore.setState({ surpriseVisible: false, paywallVisible: false } as never));
    useAccountStore.getState().ouvrirSurprise();
    // Qu'elle se soit montrée ou non la première fois, la seconde mène à
    // la page Pro.
    if (premiere) expect(useAccountStore.getState().surpriseVisible).toBe(false);
    expect(useAccountStore.getState().paywallVisible).toBe(true);
  });
});

describe('résilier et supprimer sans piège (Thomas, Nadia)', () => {
  it('la carte Pro du profil mène à la gestion de l’abonnement d’Apple', () => {
    const profil = lire('src', 'screens', 'ProfilScreen.tsx');
    expect(profil).toContain('Gérer l’abonnement');
    expect(profil).toContain('apps.apple.com/account/subscriptions');
  });

  it('supprimer son compte prévient que l’abonnement Apple continue', () => {
    const menu = lire('src', 'components', 'MenuCompte.tsx');
    expect(menu).toMatch(/abonnement/i);
    expect(menu).toMatch(/résili/i);
  });

  it('sans jeton, la suppression le dit : rien n’a pu être effacé en ligne', async () => {
    act(() => useAccountStore.setState({ compte: { id: 'email:a@b.fr' } as never, invite: false, jeton: null } as never));
    const r = await useAccountStore.getState().supprimerCompte();
    expect(r).toBe('local');
    expect(useAccountStore.getState().compte).toBeNull();
  });

  it('la confidentialité ne se contredit plus sur les photos', () => {
    const page = lire('src', 'screens', 'ConfidentialiteScreen.tsx');
    expect(page).not.toContain('Vos photos ne quittent jamais votre appareil');
    expect(page).toMatch(/plan papier/);
  });
});

// ------------------------------------------------------------------ ne jamais perdre son travail

describe('le travail ne se perd plus (Sophie, Karim, Nadia, Marie)', () => {
  beforeEach(() => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ saves: [], currentSaveId: null } as never);
    });
  });

  it('en mode Électricité, un relevé NEUF s’enregistre en quittant — il n’attend plus douze heures sa suppression', () => {
    act(() => {
      useUsage.getState().choisir(true);
      useScanStore.getState().commencerAuClavier();
      useScanStore.getState().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Séjour');
    });
    expect(useScanStore.getState().dirty).toBe(true);
    act(() => rangerLeTravail());
    const saves = useScanStore.getState().saves;
    expect(saves).toHaveLength(1);
    expect(saves[0].supprimeLe).toBeUndefined();
    act(() => useUsage.getState().choisir(false));
  });

  it('retirer une pièce se confirme, et « Annuler » est proposé ensuite', () => {
    const ecran = lire('src', 'screens', 'ResultScreen.tsx');
    expect(ecran).toMatch(/title: `Retirer « \$\{/);
    expect(ecran).toMatch(/Pièce retirée/);
  });

  it('la récupération des plans en ligne se retente si le serveur n’a pas répondu', () => {
    const magasin = lire('src', 'store', 'scanStore.ts');
    expect(magasin).toMatch(/if \(repris < 0\) return 0;/);
  });

  it('supprimer un plan dit où il part — la corbeille, sauvegarde en ligne comprise', () => {
    // Revues « Fatou » et « Hugo » : il part à la corbeille, 30 jours.
    for (const ecran of ['LibraryScreen.tsx', 'HomeScreen.tsx']) {
      expect(lire('src', 'screens', ecran)).toMatch(/mis à la corbeille/);
    }
    expect(lire('src', 'screens', 'LibraryScreen.tsx')).toMatch(/de votre sauvegarde en ligne/);
  });
});

// ------------------------------------------------------------------ l'électricité, pour tous et sans faux-semblant

describe('l’électricité sans faux-semblant (Paul, Sophie, Karim)', () => {
  it('le calque des gaines dit que c’est un tracé proposé, pas les câbles réels', () => {
    const barre = lire('src', 'screens', 'result', 'ResultToolbar.tsx');
    expect(barre).toMatch(/tracé proposé/i);
    expect(barre).toMatch(/pas vos câbles/);
    // Et le plan le rappelle tant que le calque est allumé.
    expect(lire('src', 'screens', 'ResultScreen.tsx')).toMatch(/ne vous y fiez pas pour percer/);
  });

  it('la fiche d’un appareil dit sa hauteur — et ne s’invente plus un circuit sans tableau', () => {
    const f = { id: 'p', kind: 'prise' as const, wallId: 'w', along: 0.85, height: 0.3, side: 1 as const };
    const { sousTitre } = ficheElec({ appareil: f, piece: 'Salon' });
    expect(sousTitre).toContain('à 30 cm du sol');
    expect(sousTitre).toContain('pas encore sur un circuit');
    expect(lire('src', 'screens', 'ResultScreen.tsx')).toMatch(/aTableau \? marks\.get\(f\.id\)/);
  });

  it('le menu ne réserve plus les prises « aux électriciens »', () => {
    const ecran = lire('src', 'screens', 'ResultScreen.tsx');
    expect(ecran).not.toMatch(/'Pour les électriciens\.'/);
    // MIS À JOUR — revue des « découvreurs » : la proposition du mode a
    // quitté le menu du plan (elle s'imposait aux non-électriciens) ; le mode
    // s'active au profil.
    expect(ecran).not.toContain("label: 'Placer prises et interrupteurs'");
  });

  it('« Passer » le film ne fait plus sauter la question de l’usage', () => {
    act(() => useUsage.setState({ choisi: false } as never));
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<PremierLancement onFini={() => {}} />);
    });
    const film = t.root.findAll((n) => typeof n.props?.onPasser === 'function')[0];
    act(() => film.props.onPasser());
    const vu = t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join('')).join(' | ');
    expect(vu).toContain('À quoi va vous servir EchoPlan ?');
    expect(vu).toContain('Prévoir l’électricité');
    act(() => t.unmount());
  });

  it('la page du mur pose SES questions dans sa fenêtre : la croix fonctionne', () => {
    const feuille = lire('src', 'screens', 'result', 'ElecSheet.tsx');
    expect(feuille).toContain('onDemander={onDemander ?? setDemande}');
    expect(feuille).toContain('<ActionSheet data={demande}');
  });
});

// ------------------------------------------------------------------ les petits pièges

describe('les petits pièges (Marie, Nadia, Sophie, Karim)', () => {
  it('« 160 » tapé pour un lit se lit en centimètres', () => {
    expect(metresSaisis('160')).toBeCloseTo(1.6);
    expect(metresSaisis('1,60')).toBeCloseTo(1.6);
    expect(metresSaisis('2.6')).toBeCloseTo(2.6);
    expect(metresSaisis('abc')).toBeNaN();
  });

  it('une adresse mal tapée ne fait plus accuser internet', () => {
    const ecran = lire('src', 'screens', 'SignInScreen.tsx');
    expect(ecran).toMatch(/semble incomplète/);
    expect(ecran).toMatch(/exemple : prenom@gmail\.com/);
  });

  it('l’image partagée emporte ses cotes, même si elles étaient éteintes', () => {
    expect(lire('src', 'screens', 'ResultScreen.tsx')).toMatch(/LES COTES PARTENT AVEC L.IMAGE/);
  });

  it('l’image du plan se dit gratuite dans « Exporter »', () => {
    const feuille = lire('src', 'screens', 'result', 'ExportSheet.tsx');
    expect(feuille).toContain('badge-gratuit-image');
    expect(feuille).toContain('Image du plan');
  });

  it('la pastille du devis porte le mot « Devis »', () => {
    expect(lire('src', 'components', 'DevisPastille.tsx')).toMatch(/Devis \$\{prixCourt\(total\)\}/);
  });

  it('la tuile de lecture dit qu’elle prend un PDF', () => {
    // « … de l'architecte » se coupait sur la tuile (revue de lisibilité) :
    // le PDF reste dit, plus court.
    // Le sous-titre se compose désormais (`sousLecture`) : il dit aussi la
    // lecture offerte hors Pro (revue des découvreurs).
    expect(lire('src', 'screens', 'HomeScreen.tsx')).toContain("pro ? 'Photo ou PDF' : 'Photo ou PDF · 1 lecture offerte'");
  });
});
