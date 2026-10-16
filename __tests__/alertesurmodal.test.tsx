/**
 * L'ALERTE PAR-DESSUS UNE FENETRE OUVERTE.
 *
 * Releve de la revue App Review : « Supprimer mon compte » et « S'abonner »
 * ne montraient RIEN. L'hote unique, monte en bas d'`App`, presentait sa
 * fenetre depuis la vue de l'application — qui presentait deja le menu du
 * compte ou la page Pro. iOS refuse cette seconde presentation en silence,
 * et React Native se croit presente quand meme : toutes les alertes
 * suivantes restaient muettes jusqu'au redemarrage.
 *
 * Une fenetre imbriquee DANS une fenetre se presente bien. Ce banc tient
 * donc la pile d'hotes : fenetre ouverte, l'alerte se dessine DANS son
 * arbre, pas dans celui de l'hote racine ; fenetre fermee, l'alerte en
 * cours redescend a la racine sans se perdre.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));
jest.mock('../src/native/account', () => ({
  acheterAbonnement: jest.fn(async () => true),
  restaurerAbonnement: jest.fn(async () => false),
  connexionApple: jest.fn(async () => null),
  lireMarqueur: jest.fn(async () => null),
  ecrireMarqueur: jest.fn(async () => {}),
  produitsPro: jest.fn(async () => []),
  ouvrirCodeOffre: jest.fn(async () => true),
  echeanceAbonnement: jest.fn(async () => null),
}));

import React, { useState } from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AlerteHote } from '../src/components/AlerteHote';
import { MenuCompte } from '../src/components/MenuCompte';
import { SheetShell } from '../src/components/Sheet';
import { PaywallScreen } from '../src/screens/PaywallScreen';
import { ExportSheet } from '../src/screens/result/ExportSheet';
import { DELAI_RELAIS, alerte, useAlerte } from '../src/ui/alerte';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
beforeEach(() => {
  useAlerte.setState({ courante: null, file: [], hotes: [] });
  useScanStore.setState({ themePref: 'light' });
});
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (el: React.ReactElement) => {
  act(() => {
    arbre = TestRenderer.create(el);
  });
  return arbre!;
};

const attendre = (ms = DELAI_RELAIS + 50) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

/** Le texte, et l'arbre ou il s'est dessine : dans quel composant ? */
const dessineDans = (
  t: TestRenderer.ReactTestRenderer,
  mot: string,
  type: React.ElementType,
) => {
  const n = t.root.findAllByType(Text).find((x) => String(x.props.children) === mot);
  if (!n) return null;
  let p: TestRenderer.ReactTestInstance | null = n;
  while (p) {
    if (p.type === type) return true;
    p = p.parent;
  }
  return false;
};

function FeuilleOuverte({ ouverte }: { ouverte: boolean }) {
  return ouverte ? (
    <SheetShell visible onClose={() => {}}>
      <Text>Contenu</Text>
    </SheetShell>
  ) : null;
}

describe('une alerte levee pendant qu’une fenetre est ouverte', () => {
  it('se dessine DANS la feuille ouverte, pas dans l’hote racine', () => {
    const t = monter(
      <>
        <FeuilleOuverte ouverte />
        <AlerteHote />
      </>,
    );
    expect(useAlerte.getState().hotes).toHaveLength(1);
    act(() => alerte('Export impossible', 'Le dossier est plein.'));
    attendre();
    expect(dessineDans(t, 'Export impossible', FeuilleOuverte)).toBe(true);
    // Et une seule fois : l'hote racine se tait.
    expect(
      t.root.findAllByType(Text).filter((x) => x.props.children === 'Export impossible'),
    ).toHaveLength(1);
  });

  it('redescend a l’hote racine quand la fenetre se ferme, sans se perdre', () => {
    function Banc() {
      const [ouverte, setOuverte] = useState(true);
      return (
        <>
          <FeuilleOuverte ouverte={ouverte} />
          <Text testID="fermer" onPress={() => setOuverte(false)}>
            x
          </Text>
          <AlerteHote />
        </>
      );
    }
    const t = monter(<Banc />);
    act(() => alerte('Enregistrement impossible'));
    attendre();
    expect(dessineDans(t, 'Enregistrement impossible', FeuilleOuverte)).toBe(true);
    act(() => t.root.findByProps({ testID: 'fermer' }).props.onPress());
    expect(useAlerte.getState().hotes).toEqual([]);
    // Le relais attend que la fenetre native ait fini de s'effacer.
    attendre();
    expect(dessineDans(t, 'Enregistrement impossible', FeuilleOuverte)).toBe(false);
    // ... mais bien dessinee par l'hote racine.
    expect(dessineDans(t, 'Enregistrement impossible', AlerteHote)).toBe(true);
    expect(useAlerte.getState().courante?.titre).toBe('Enregistrement impossible');
  });

  it('ne s’ouvre pas dans une fenetre qui s’en va : l’hote se retire des qu’elle se ferme', () => {
    const banc = (visible: boolean) => (
      <>
        <ExportSheet
          visible={visible}
          onClose={() => {}}
          onDismiss={() => {}}
          onPdf={() => {}}
          onObj={() => {}}
          onMaterial={() => {}}
          onCsv={() => {}}
          onDxf={() => {}}
          onImage={() => {}}
        />
        <AlerteHote />
      </>
    );
    const t = monter(banc(true));
    expect(useAlerte.getState().hotes).toHaveLength(1);
    // La feuille se ferme ; sa fenetre native s'efface encore (iOS la garde
    // montee jusqu'a `onDismiss`), mais son hote a deja rendu la main.
    act(() => t.update(banc(false)));
    expect(useAlerte.getState().hotes).toEqual([]);
    act(() => alerte('Export impossible'));
    attendre();
    expect(dessineDans(t, 'Export impossible', ExportSheet)).toBe(false);
    expect(t.root.findAllByType(Text).some((x) => x.props.children === 'Export impossible')).toBe(true);
  });

  it('« Supprimer le compte ? » s’ouvre dans le menu du compte', () => {
    useAccountStore.setState({ compte: { id: 'c1', prenom: 'Sam', methode: 'email' } });
    const t = monter(
      <>
        <MenuCompte visible fermer={() => {}} />
        <AlerteHote />
      </>,
    );
    const bouton = t.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Supprimer mon compte' && typeof n.props.onPress === 'function',
    )[0];
    act(() => bouton.props.onPress());
    attendre();
    expect(dessineDans(t, 'Supprimer le compte ?', MenuCompte)).toBe(true);
  });

  it('« Achat impossible » s’ouvre dans la page Pro', () => {
    useAccountStore.setState({
      charge: true,
      compte: { id: 'c1', prenom: 'Sam', methode: 'email' },
      pro: false,
      paywallVisible: true,
      offres: null,
    });
    const t = monter(
      <>
        <PaywallScreen />
        <AlerteHote />
      </>,
    );
    act(() => alerte('Achat impossible', 'L’App Store n’a pas répondu.'));
    attendre();
    expect(dessineDans(t, 'Achat impossible', PaywallScreen)).toBe(true);
    act(() => useAccountStore.setState({ paywallVisible: false }));
  });

  it('sans fenetre ouverte, l’hote racine affiche tout de suite', () => {
    const t = monter(<AlerteHote />);
    act(() => alerte('Capture impossible'));
    expect(t.root.findAllByType(Text).some((x) => x.props.children === 'Capture impossible')).toBe(true);
  });
});
