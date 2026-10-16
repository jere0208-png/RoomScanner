/**
 * L'ABONNEMENT CONFORME À L'APP STORE — et rien qui se paie deux fois.
 *
 * Ce que la revue a relevé, et que ce banc tient :
 * - l'invité peut ACHETER et RESTAURER sans compte (règles 5.1.1 et 3.1.1) :
 *   le Pro vient de l'abonnement de son identifiant Apple, et la
 *   restauration distingue « restauré » de « aucun » ;
 * - deux appuis sur « S'abonner » ne lancent qu'UN achat ;
 * - le bouton d'achat est PLEIN (la peau du bouton primaire), et son
 *   libellé suit la durée de l'offre d'Apple ;
 * - un achat « en attente » (Demander l'achat) le dit ;
 * - se déconnecter efface le jeton, et referme les codes internes ;
 * - le serveur ne croit plus l'app sur parole pour la lecture de plans.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../src/native/account', () => ({
  lireMarqueur: jest.fn(async () => null),
  ecrireMarqueur: jest.fn(async () => undefined),
  connexionApple: jest.fn(async () => ({ id: 'A1' })),
  acheterAbonnement: jest.fn(async () => true),
  restaurerAbonnement: jest.fn(async () => true),
  echeanceAbonnement: jest.fn(async () => null),
  produitsPro: jest.fn(async () => []),
  ouvrirCodeOffre: jest.fn(async () => true),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { StyleSheet, Text, type ViewStyle } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PaywallScreen, libelleAchat } from '../src/screens/PaywallScreen';
import { useAccountStore, type OffresPro } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';
import { useAlerte } from '../src/ui/alerte';
import { light } from '../src/theme';

const native = jest.requireMock('../src/native/account');
const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');
const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const alerteCourante = () => useAlerte.getState().courante;
const MARTIN = { id: 'email:martin@exemple.fr', methode: 'email' as const };

beforeEach(() => {
  native.acheterAbonnement.mockReset();
  native.acheterAbonnement.mockImplementation(async () => true);
  native.restaurerAbonnement.mockReset();
  native.restaurerAbonnement.mockImplementation(async () => true);
  native.echeanceAbonnement.mockReset();
  native.echeanceAbonnement.mockImplementation(async () => null);
  AsyncStorage.setItem.mockClear();
  act(() => {
    useAlerte.setState({ courante: null, file: [] } as never);
    useAccountStore.setState({
      charge: true,
      compte: null,
      invite: true,
      pro: false,
      proVia: null,
      jeton: null,
      paywallVisible: true,
      surpriseVisible: false,
      offres: null,
      achatEnCours: false,
      codesInternes: false,
    } as never);
    useScanStore.setState({ themePref: 'light' } as never);
  });
});

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});
const monter = () => {
  act(() => {
    arbre = TestRenderer.create(<PaywallScreen />);
  });
  return arbre!;
};
const boutonAchat = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props?.testID === 'bouton-sabonner' && typeof n.props?.onPress === 'function')[0];
const restaurer = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props?.accessibilityLabel === 'Restaurer l’achat' && typeof n.props?.onPress === 'function')[0];

describe('l’invité achète et restaure sans compte (5.1.1, 3.1.1)', () => {
  it('l’achat part sans compte, le Pro arrive, et le compte est PROPOSÉ ensuite', async () => {
    const issue = await useAccountStore.getState().acheterPro();
    expect(native.acheterAbonnement).toHaveBeenCalledTimes(1);
    expect(issue).toBe('achete');
    const s = useAccountStore.getState();
    expect(s.pro).toBe(true);
    expect(s.proVia).toBe('abonnement');
    expect(s.paywallVisible).toBe(false);
    // L'invité abonné envoie son PDF : c'est ce qu'il vient de payer.
    expect(s.exportOuvert()).toBe(true);
    // Le compte est proposé pour la sauvegarde, jamais exigé.
    expect(`${alerteCourante()?.titre} ${alerteCourante()?.message}`).toMatch(/sauvegard/i);
  });

  it('« Restaurer l’achat » en invité : restauré quand l’App Store le confirme', async () => {
    const t = monter();
    await act(async () => {
      await restaurer(t).props.onPress();
    });
    expect(useAccountStore.getState().pro).toBe(true);
    expect(alerteCourante()?.titre).toBe('Abonnement restauré');
  });

  it('et « aucun abonnement » seulement quand l’App Store n’en connaît pas — sans « Créez un compte »', async () => {
    native.restaurerAbonnement.mockImplementation(async () => false);
    expect(await useAccountStore.getState().restaurerPro()).toBe('aucun');
    act(() => useAlerte.setState({ courante: null, file: [] } as never));
    const t = monter();
    await act(async () => {
      await restaurer(t).props.onPress();
    });
    const q = alerteCourante()!;
    expect(q.titre).toBe('Aucun abonnement trouvé');
    expect(useAlerte.getState().file).toHaveLength(0);
    expect(`${q.titre} ${q.message}`).not.toMatch(/Créez un compte/);
  });

  it('l’abonnement de l’identifiant Apple revient à l’invité au démarrage — le Pro d’un code, jamais', async () => {
    native.echeanceAbonnement.mockImplementation(async () => ({
      produit: 'echoplan.pro.mensuel',
      expiration: Date.now() + 86400000,
      reconduit: true,
    }));
    await useAccountStore.getState().rafraichirEcheance();
    expect(useAccountStore.getState().pro).toBe(true);
    AsyncStorage.getItem.mockImplementationOnce(async () =>
      JSON.stringify({ compte: null, invite: true, pro: true, proVia: 'code' }),
    );
    native.echeanceAbonnement.mockImplementation(async () => ({ aucun: true }));
    await useAccountStore.getState().charger();
    expect(useAccountStore.getState().pro).toBe(false);
  });
});

describe('un seul achat à la fois', () => {
  it('deux appuis rapides sur « S’abonner » : une seule feuille d’achat, le bouton se grise', async () => {
    let finir!: (v: boolean) => void;
    native.acheterAbonnement.mockImplementation(() => new Promise<boolean>((r) => (finir = r)));
    const t = monter();
    await act(async () => {
      boutonAchat(t).props.onPress();
      boutonAchat(t).props.onPress();
      await Promise.resolve();
    });
    expect(native.acheterAbonnement).toHaveBeenCalledTimes(1);
    const b = boutonAchat(t);
    expect(b.props.disabled).toBe(true);
    expect(JSON.stringify(t.toJSON())).toContain('Achat en cours');
    await act(async () => {
      finir(false);
      await Promise.resolve();
    });
    expect(useAccountStore.getState().achatEnCours).toBe(false);
    expect(boutonAchat(t).props.disabled).toBe(false);
  });

  it('un achat qui échoue ne laisse pas le verrou fermé', async () => {
    native.acheterAbonnement.mockImplementation(async () => {
      throw new Error('réseau');
    });
    await expect(useAccountStore.getState().acheterPro()).rejects.toThrow('réseau');
    expect(useAccountStore.getState().achatEnCours).toBe(false);
  });
});

describe('le bouton d’achat, plein et juste', () => {
  it('est PLEIN, bleu de la maison, texte blanc — plus contouré', () => {
    const t = monter();
    const st = StyleSheet.flatten(boutonAchat(t).props.style({ pressed: false })) as ViewStyle;
    expect(st.backgroundColor).toBe(light.blue);
    const mot = boutonAchat(t).findAllByType(Text)[0];
    expect(StyleSheet.flatten(mot.props.style).color).toBe('#FFFFFF');
    expect(String(mot.props.children)).toBe('S’abonner pour 4,90 € par mois');
  });

  const avec = (offre: Record<string, unknown>): OffresPro => ({
    mensuel: {
      id: 'echoplan.pro.mensuel',
      prix: '4,90 €',
      valeur: 4.9,
      periode: { unite: 'mois', valeur: 1 },
      offre: { prix: '3,92 €', valeur: 3.92, periode: { unite: 'mois', valeur: 1 }, nombre: 1, mode: 'remise', eligible: true, ...offre } as never,
    },
  });

  it('dit la durée de l’offre : un mois, trois mois, d’avance, l’essai', () => {
    expect(libelleAchat(avec({}), 'mensuel', '4,90 €')).toBe('S’abonner pour 3,92 € le premier mois');
    expect(libelleAchat(avec({ nombre: 3 }), 'mensuel', '4,90 €')).toBe(
      'S’abonner pour 3,92 € par mois pendant 3 mois',
    );
    expect(libelleAchat(avec({ mode: 'avance', prix: '9,99 €', periode: { unite: 'mois', valeur: 3 } }), 'mensuel', '4,90 €')).toBe(
      'S’abonner pour 9,99 € les 3 premiers mois',
    );
    expect(libelleAchat(avec({ mode: 'essai' }), 'mensuel', '4,90 €')).toBe('Commencer l’essai gratuit');
    // Plus jamais « la première fois ».
    expect(lire('src', 'screens', 'PaywallScreen.tsx')).not.toMatch(/la première \$\{annuel \? 'année' : 'fois'\}/);
    // Sans offre éligible, le prix plein.
    expect(libelleAchat(avec({ eligible: false }), 'mensuel', '4,90 €')).toBe('S’abonner pour 4,90 € par mois');
  });
});

describe('l’achat en attente se dit', () => {
  it('« Demander l’achat » : ni Pro, ni silence — un message clair', async () => {
    native.acheterAbonnement.mockImplementation(async () => 'attente');
    const t = monter();
    await act(async () => {
      await boutonAchat(t).props.onPress();
    });
    expect(useAccountStore.getState().pro).toBe(false);
    expect(alerteCourante()?.titre).toMatch(/en attente/i);
  });

  it('le natif rend « attente », et la restauration se resynchronise avec l’App Store', () => {
    const swift = lire('modules', 'react-native-room-scan', 'ios', 'RoomScanAccount.swift');
    expect(swift).toMatch(/case \.pending:[\s\S]{0,600}resolve\("attente"\)/);
    const restaurerNatif = swift.slice(swift.indexOf('func restorePro'));
    expect(restaurerNatif.indexOf('try await AppStore.sync()')).toBeGreaterThan(-1);
    expect(restaurerNatif.indexOf('try await AppStore.sync()')).toBeLessThan(
      restaurerNatif.indexOf('Transaction.currentEntitlements'),
    );
  });
});

describe('se déconnecter, c’est tout rendre', () => {
  it('le jeton tombe, en mémoire ET dans le stockage, et les codes internes se referment', () => {
    useAccountStore.setState({ compte: MARTIN, invite: false, jeton: 'secret', codesInternes: true } as never);
    useAccountStore.getState().deconnecter();
    expect(useAccountStore.getState().jeton).toBeNull();
    expect(useAccountStore.getState().codesInternes).toBe(false);
    const ecrit = JSON.parse(AsyncStorage.setItem.mock.calls.at(-1)[1]);
    expect(ecrit.jeton).toBeNull();
  });

  it('« J’ai un code » ne montre jamais le code interne quand le serveur ne l’ouvre pas', async () => {
    const t = monter();
    const lien = t.root.findAll((n) => n.props?.accessibilityLabel === 'J’ai un code' && typeof n.props?.onPress === 'function')[0];
    await act(async () => {
      lien.props.onPress();
      await Promise.resolve();
    });
    expect(native.ouvrirCodeOffre).toHaveBeenCalled();
    expect(JSON.stringify(t.toJSON())).not.toContain('Code interne');
    // Et aucun code en clair dans la page.
    expect(lire('src', 'screens', 'PaywallScreen.tsx')).not.toMatch(/CARIDI12|FIRST20/);
  });
});

describe('le serveur ne croit plus l’app sur parole', () => {
  it('la lecture de plans ne s’ouvre qu’au Pro que la base connaît', () => {
    const api = lire('server', 'api.php');
    expect(api).not.toMatch(/\$corps\['abonne'\]/);
    expect(api).toMatch(/\$estPro = \$compte\['pro'\] === 'code' \|\| \$compte\['pro'\] === 'abonnement';/);
  });
});
