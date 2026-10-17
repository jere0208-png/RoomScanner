/**
 * L'ALBUM « ECHOPLAN » QUI FONCTIONNE VRAIMENT.
 *
 * Relevé du patron, point 5 de la synthèse des testeurs : « Album photo
 * EchoPlan qui ne fonctionne pas ». L'app ne demandait que l'ajout de
 * photos (`.addOnly`) : ni l'album ne pouvait être cherché ou créé, ni une
 * photo relue par son identifiant. Les photos de repérage tombaient en vrac
 * dans la pellicule, et rien ne se retrouvait après une réinstallation —
 * alors qu'Info.plist et la page Confidentialité promettaient l'inverse.
 *
 * Ce banc tient les quatre morceaux :
 * - le natif demande `.readWrite` à la première photo, range dans l'album
 *   en accès complet, dépose sans album en accès limité, et ne bloque rien
 *   en cas de refus (lu dans le source : le Swift ne compile pas ici) ;
 * - le JS dit l'état de l'accès après une photo, une fois, avec les
 *   Réglages pour l'élargir ;
 * - la fiche d'une photo perdue dit pourquoi, et propose le geste qui
 *   répare (cocher ses photos en accès limité) ;
 * - les textes — Info.plist, Confidentialité — disent ce qui est vrai.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import { Linking, NativeModules } from 'react-native';
import { type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';
import { useAlerte } from '../src/ui/alerte';
import {
  annoncerAccesPhotos,
  choisirPhotosVisibles,
  lireAccesPhotos,
  messageAccesPhotos,
  messagePhotoManquante,
  oublierAnnoncesPhotos,
  reposerDuCoffre,
} from '../src/ui/photos';
import { PhotoSheet } from '../src/screens/result/PhotoSheet';
import {
  ConfidentialiteScreen,
  ETAT_ACCES_PHOTOS,
} from '../src/screens/ConfidentialiteScreen';

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const SWIFT = lire('modules', 'react-native-room-scan', 'ios', 'RoomScanPhoto.swift');
/** Le Swift sans ses commentaires : on juge le code, pas sa prose. */
const CODE = SWIFT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const natif = NativeModules as Record<string, unknown>;
const poserNatif = (m: Record<string, unknown>) => {
  natif.RoomScanPhoto = m;
};
afterEach(() => {
  delete natif.RoomScanPhoto;
  oublierAnnoncesPhotos();
  useAlerte.setState({ courante: null, file: [] });
});

/** Tous les nœuds de l'arbre, à plat. */
const noeuds = (a: TestRenderer.ReactTestRenderer) =>
  a.root.findAll(() => true, { deep: true });
/** Tout le texte affiché, en une chaîne. */
const texte = (a: TestRenderer.ReactTestRenderer) =>
  noeuds(a)
    .flatMap((n) => (typeof n.props?.children === 'string' ? [n.props.children] : []))
    .join(' | ');
/**
 * Le bouton dont le texte est exactement celui-ci — le plus PROFOND : le
 * fond de la fiche, qui la referme, contient lui aussi tous les textes.
 */
const bouton = (a: TestRenderer.ReactTestRenderer, mot: string) =>
  noeuds(a)
    .filter(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        n.findAll((m) => m.props?.children === mot).length > 0,
    )
    .pop();
/** Laisse passer les promesses en vol (natif simulé, `then` du store). */
const vider = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

// ------------------------------------------------------------------ le natif

describe('le natif demande l’accès qui permet l’album', () => {
  it('ne demande plus l’ajout seul, mais l’accès complet', () => {
    expect(CODE).not.toContain('.addOnly');
    expect(CODE).toContain('PHPhotoLibrary.requestAuthorization(for: .readWrite)');
    // Une seule porte vers la question : `autoriser`.
    expect(CODE.match(/requestAuthorization\(/g)?.length).toBe(1);
    // Déjà décidé : on ne redemande rien.
    expect(CODE).toMatch(
      /let statut = PHPhotoLibrary\.authorizationStatus\(for: \.readWrite\)\s*guard statut == \.notDetermined else \{\s*suite\(statut\)/,
    );
  });

  it('range dans l’album en accès complet, sans album en accès limité, rien en cas de refus', () => {
    const corps = CODE.slice(CODE.indexOf('private func archiver('), CODE.indexOf('private func deposer('));
    expect(corps).toMatch(/case \.authorized:\s*self\.album \{ collection in\s*self\.deposer\(data, dans: collection\)/);
    expect(corps).toMatch(/case \.limited:\s*self\.deposer\(data, dans: nil\)/);
    expect(corps).toMatch(/default:\s*suite\(nil, statut\)/);
  });

  it('la photo est demandée APRÈS que le fichier local soit écrit : un refus ne la perd pas', () => {
    const delegue = CODE.slice(CODE.indexOf('didFinishPickingMediaWithInfo'));
    const ecrit = delegue.indexOf('self.save(image)');
    const coffre = delegue.indexOf('self.archiver(fait.donnees)');
    expect(ecrit).toBeGreaterThan(0);
    expect(coffre).toBeGreaterThan(ecrit);
    // Et la prise rend l'état de l'accès, sur le fil principal.
    expect(delegue).toMatch(
      /self\.archiver\(fait\.donnees\) \{ id, statut in\s*let acces = Self\.mot\(statut\)\s*DispatchQueue\.main\.async \{\s*self\.finish\(fait\.chemin, asset: id, acces: acces\)/,
    );
  });

  it('la relecture passe par l’autorisation, jamais par une demande implicite', () => {
    const corps = CODE.slice(CODE.indexOf('@objc func restorePhoto('), CODE.indexOf('@objc func takePhoto('));
    const auto = corps.indexOf('Self.autoriser');
    const lecture = corps.indexOf('self.imageDe(');
    expect(auto).toBeGreaterThan(0);
    expect(lecture).toBeGreaterThan(auto);
    expect(corps).toMatch(/guard statut == \.authorized \|\| statut == \.limited else \{\s*resolve\(Self\.relue\(nil, acces\)\)/);
    // Toujours une réponse, même quand l'écriture du cache échoue.
    expect(corps.match(/resolve\(/g)?.length).toBe(4);
  });

  it('ne relit que nos identifiants, jamais toute la photothèque', () => {
    expect(CODE).toContain('PHAsset.fetchAssets(\n      withLocalIdentifiers: [id]');
    expect(CODE).not.toMatch(/PHAsset\.fetchAssets\(with:/);
  });

  it('dit l’état de l’accès avec les quatre mots du JS', () => {
    const corps = CODE.slice(CODE.indexOf('private static func mot('));
    expect(corps).toContain('case .authorized: return "complet"');
    expect(corps).toContain('case .limited: return "limite"');
    expect(corps).toContain('case .notDetermined: return "indetermine"');
    expect(corps).toContain('case .denied, .restricted: return "refuse"');
    expect(corps).toContain('@unknown default: return "refuse"');
    // Et ce sont exactement les clés que la page Confidentialité sait dire.
    expect(Object.keys(ETAT_ACCES_PHOTOS).sort()).toEqual(
      ['complet', 'indetermine', 'limite', 'refuse'],
    );
  });

  it('sait élargir un accès limité, sur le fil principal', () => {
    expect(SWIFT).toContain('import PhotosUI');
    const corps = CODE.slice(CODE.indexOf('@objc func pickLimitedPhotos('), CODE.indexOf('private static func ecranDuDessus('));
    expect(corps).toMatch(/DispatchQueue\.main\.async \{/);
    expect(corps).toMatch(/guard statut == \.limited, let haut = Self\.ecranDuDessus\(\) else/);
    expect(corps).toContain('PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: haut) { _ in');
  });

  it('expose les deux nouvelles méthodes au pont, avec les mêmes sélecteurs', () => {
    const m = lire('modules', 'react-native-room-scan', 'ios', 'RoomScan.m');
    const bloc = m.slice(m.indexOf('RCT_EXTERN_MODULE(RoomScanPhoto'), m.indexOf('RCT_EXTERN_MODULE(RoomScanLecturePlan'));
    expect(bloc).toContain('RCT_EXTERN_METHOD(photoAccess:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)');
    expect(bloc).toContain('RCT_EXTERN_METHOD(pickLimitedPhotos:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)');
    expect(CODE).toContain('@objc func photoAccess(_ resolve: @escaping RCTPromiseResolveBlock,\n                         reject: @escaping RCTPromiseRejectBlock)');
    expect(CODE).toContain('@objc func pickLimitedPhotos(_ resolve: @escaping RCTPromiseResolveBlock,\n                               reject: @escaping RCTPromiseRejectBlock)');
  });

  it('reste équilibré (accolades, parenthèses, crochets)', () => {
    for (const [o, f] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      expect(CODE.split(o).length).toBe(CODE.split(f).length);
    }
  });
});

// ------------------------------------------------------------------ les textes

describe('les textes disent ce qui est vrai', () => {
  const plist = lire('ios', 'RoomScanner', 'Info.plist');
  const phrase = (cle: string) =>
    plist.match(new RegExp(`${cle}</key>\\s*<string>([^<]*)</string>`))?.[1] ?? '';

  it('Info.plist parle de l’album, de la réinstallation, et de rien d’autre', () => {
    const lecture = phrase('NSPhotoLibraryUsageDescription');
    expect(lecture).toContain('album « EchoPlan »');
    expect(lecture).toContain('réinstallation');
    expect(lecture).toContain('ne parcourt jamais vos autres photos');
    const ajout = phrase('NSPhotoLibraryAddUsageDescription');
    expect(ajout).toContain('photos de repérage');
    expect(ajout).toContain('réinstallez');
  });

  it('iOS ne relance pas sa propre alerte d’accès limité : l’app propose le geste elle-même', () => {
    expect(plist).toMatch(/<key>PHPhotoLibraryPreventAutomaticLimitedAccessAlert<\/key>\s*<true\/>/);
  });

  it('la page Confidentialité dit les trois cas', () => {
    const page = lire('src', 'screens', 'ConfidentialiteScreen.tsx');
    expect(page).toContain('Avec l’accès complet');
    expect(page).toContain('Avec l’accès limité');
    expect(page).toContain('Si vous refusez');
    // Plus de promesse sans condition.
    expect(page).not.toContain('Les photos de mur sont rangées dans votre photothèque');
  });
});

// ------------------------------------------------------------------ le JS

describe('le coffre, côté JS', () => {
  it('comprend l’ancienne réponse (un chemin) et la nouvelle (chemin et accès)', async () => {
    poserNatif({ restorePhoto: async () => '/docs/photos/a.jpg' });
    expect(await reposerDuCoffre('A')).toEqual({ chemin: '/docs/photos/a.jpg' });
    poserNatif({ restorePhoto: async () => ({ path: '/docs/photos/b.jpg', acces: 'complet' }) });
    expect(await reposerDuCoffre('B')).toEqual({ chemin: '/docs/photos/b.jpg', acces: 'complet' });
    poserNatif({ restorePhoto: async () => ({ path: null, acces: 'limite' }) });
    expect(await reposerDuCoffre('C')).toEqual({ chemin: null, acces: 'limite' });
    poserNatif({ restorePhoto: async () => null });
    expect(await reposerDuCoffre('D')).toEqual({ chemin: null });
    poserNatif({ restorePhoto: async () => { throw new Error('non'); } });
    expect(await reposerDuCoffre('E')).toEqual({ chemin: null });
    delete natif.RoomScanPhoto;
    expect(await reposerDuCoffre('F')).toEqual({ chemin: null });
  });

  it('lit l’accès sans rien demander, et rend null sans natif', async () => {
    expect(await lireAccesPhotos()).toBeNull();
    poserNatif({ photoAccess: async () => 'limite' });
    expect(await lireAccesPhotos()).toBe('limite');
    expect(await choisirPhotosVisibles()).toBeNull();
    poserNatif({ pickLimitedPhotos: async () => 'limite' });
    expect(await choisirPhotosVisibles()).toBe('limite');
  });

  it('n’a rien à dire en accès complet', () => {
    expect(messageAccesPhotos('complet')).toBeNull();
    expect(messageAccesPhotos('indetermine')).toBeNull();
    expect(messageAccesPhotos(undefined)).toBeNull();
  });

  it('dit clairement un refus : la photo reste dans l’app, et ce qu’on risque', () => {
    const m = messageAccesPhotos('refuse')!;
    expect(m.titre).toBe('Photo gardée dans EchoPlan');
    expect(m.message).toContain('reste dans l’application');
    expect(m.message).toContain('perdue si vous supprimez EchoPlan');
    expect(m.message).toContain('Réglages');
  });

  it('dit un accès limité : photo gardée, relue seule, mais pas d’album', () => {
    const m = messageAccesPhotos('limite')!;
    expect(m.message).toContain('ne relit que les photos qu’il a prises');
    expect(m.message).toContain('album « EchoPlan »');
    expect(m.message).toContain('accès complet');
  });

  it('l’annonce une fois par lancement, avec les Réglages', () => {
    const ouvrir = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    annoncerAccesPhotos({ path: '/p.jpg', acces: 'complet' });
    expect(useAlerte.getState().courante).toBeNull();
    annoncerAccesPhotos({ path: '/p.jpg', acces: 'refuse' });
    const a = useAlerte.getState().courante!;
    expect(a.titre).toBe('Photo gardée dans EchoPlan');
    expect(a.actions?.map((x) => x.label)).toEqual(['Plus tard', 'Réglages']);
    a.actions![1].onPress!();
    expect(ouvrir).toHaveBeenCalledTimes(1);
    useAlerte.getState().fermer();
    // La photo suivante ne rouvre pas la même fenêtre.
    annoncerAccesPhotos({ path: '/p2.jpg', acces: 'refuse' });
    expect(useAlerte.getState().courante).toBeNull();
    // Un ÉTAT nouveau, lui, se dit.
    annoncerAccesPhotos({ path: '/p3.jpg', acces: 'limite' });
    expect(useAlerte.getState().courante?.titre).toBe('Accès limité à vos Photos');
    ouvrir.mockRestore();
  });

  it('les deux prises de vue l’annoncent juste après avoir punaisé la photo', () => {
    for (const f of ['src/screens/ResultScreen.tsx', 'src/components/WallElevation.tsx']) {
      const s = lire(f);
      const punaise = s.indexOf('prise.path, prise.asset);');
      const annonce = s.indexOf('annoncerAccesPhotos(prise);');
      expect(punaise).toBeGreaterThan(0);
      expect(annonce).toBeGreaterThan(punaise);
    }
  });
});

// ------------------------------------------------------------------ le store

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
const neuf = () =>
  useScanStore.setState({
    walls: [mur('n', 0, 0, 4, 0)],
    photos: [],
    dirty: false,
  });

describe('reposer une photo dit pourquoi elle manque', () => {
  it.each([
    [{ path: null, acces: 'refuse' }, 'refuse'],
    [{ path: null, acces: 'limite' }, 'limite'],
    [{ path: null, acces: 'complet' }, 'introuvable'],
    [null, 'introuvable'],
  ])('réponse %j → %s', async (reponse, issue) => {
    poserNatif({ restorePhoto: async () => reponse });
    neuf();
    const id = useScanStore.getState().addPhoto('n', 2, '/docs/photos/perdu.jpg', 'PH-1');
    expect(await useScanStore.getState().reposerPhoto(id)).toBe(issue);
    expect(useScanStore.getState().photos[0].path).toBe('/docs/photos/perdu.jpg');
  });

  it('reposée : le nouveau chemin remplace l’ancien', async () => {
    poserNatif({ restorePhoto: async () => ({ path: '/docs/photos/neuf.jpg', acces: 'limite' }) });
    neuf();
    const id = useScanStore.getState().addPhoto('n', 2, '/docs/photos/perdu.jpg', 'PH-1');
    expect(await useScanStore.getState().reposerPhoto(id)).toBe('repose');
    expect(useScanStore.getState().photos[0].path).toBe('/docs/photos/neuf.jpg');
  });

  it('sans identifiant, rien à demander au coffre', async () => {
    const restorePhoto = jest.fn(async () => null);
    poserNatif({ restorePhoto });
    neuf();
    const id = useScanStore.getState().addPhoto('n', 2, '/docs/photos/a.jpg');
    expect(await useScanStore.getState().reposerPhoto(id)).toBe('sans-coffre');
    expect(restorePhoto).not.toHaveBeenCalled();
  });

  it('chaque issue a son message, et le bon geste', () => {
    expect(messagePhotoManquante('limite')?.geste).toBe('choisir');
    expect(messagePhotoManquante('refuse')?.geste).toBe('reglages');
    expect(messagePhotoManquante('introuvable')?.geste).toBeUndefined();
    expect(messagePhotoManquante('sans-coffre')?.texte).toContain('réinstallée');
    expect(messagePhotoManquante('repose')).toBeNull();
  });
});

// ------------------------------------------------------------------ la fiche

describe('la fiche d’une photo perdue propose de réparer', () => {
  it('accès limité : « Choisir les photos », puis la photo revient', async () => {
    let visible = false;
    const restorePhoto = jest.fn(async () =>
      visible ? { path: '/docs/photos/revenue.jpg', acces: 'limite' } : { path: null, acces: 'limite' },
    );
    const pickLimitedPhotos = jest.fn(async () => {
      visible = true;
      return 'limite';
    });
    poserNatif({ restorePhoto, pickLimitedPhotos });
    neuf();
    const id = useScanStore.getState().addPhoto('n', 2, '/docs/photos/perdu.jpg', 'PH-9');
    const Fiche = () => {
      const photos = useScanStore((s) => s.photos);
      return (
        <PhotoSheet
          photoId={id}
          photos={photos}
          walls={useScanStore.getState().walls}
          onClose={() => {}}
          onDelete={() => {}}
        />
      );
    };
    let a: TestRenderer.ReactTestRenderer;
    act(() => {
      a = TestRenderer.create(<Fiche />);
    });
    const image = () => noeuds(a).find((n) => n.props?.source?.uri && n.props?.onError)!;
    expect(image().props.source.uri).toBe('file:///docs/photos/perdu.jpg');
    // Le fichier manque : c'est une app réinstallée.
    await act(async () => {
      image().props.onError();
      await vider();
    });
    expect(restorePhoto).toHaveBeenCalledTimes(1);
    expect(texte(a!)).toContain('Ajoutez-la à la sélection');
    await act(async () => {
      bouton(a!, 'Choisir les photos')!.props.onPress();
      await vider();
    });
    expect(pickLimitedPhotos).toHaveBeenCalledTimes(1);
    expect(restorePhoto).toHaveBeenCalledTimes(2);
    expect(image().props.source.uri).toBe('file:///docs/photos/revenue.jpg');
    expect(texte(a!)).not.toContain('Ajoutez-la à la sélection');
  });

  it('refus : « Ouvrir les Réglages »', async () => {
    const ouvrir = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    poserNatif({ restorePhoto: async () => ({ path: null, acces: 'refuse' }) });
    neuf();
    const id = useScanStore.getState().addPhoto('n', 2, '/docs/photos/perdu.jpg', 'PH-2');
    let a: TestRenderer.ReactTestRenderer;
    act(() => {
      a = TestRenderer.create(
        <PhotoSheet
          photoId={id}
          photos={useScanStore.getState().photos}
          walls={useScanStore.getState().walls}
          onClose={() => {}}
          onDelete={() => {}}
        />,
      );
    });
    await act(async () => {
      noeuds(a!).find((n) => n.props?.onError)!.props.onError();
      await vider();
    });
    expect(texte(a!)).toContain('L’accès à vos Photos est refusé');
    act(() => {
      bouton(a!, 'Ouvrir les Réglages')!.props.onPress();
    });
    expect(ouvrir).toHaveBeenCalledTimes(1);
    ouvrir.mockRestore();
  });
});

// ------------------------------------------------------------------ la page

describe('la page Confidentialité montre l’accès, et le geste pour l’élargir', () => {
  const rendrePage = async () => {
    let a: TestRenderer.ReactTestRenderer;
    await act(async () => {
      a = TestRenderer.create(<ConfidentialiteScreen />);
      await vider();
    });
    return a!;
  };

  it('accès limité : l’état, « Choisir les photos visibles » et les Réglages', async () => {
    const pickLimitedPhotos = jest.fn(async () => 'limite');
    poserNatif({ photoAccess: async () => 'limite', pickLimitedPhotos });
    const a = await rendrePage();
    expect(texte(a)).toContain(ETAT_ACCES_PHOTOS.limite);
    expect(bouton(a, 'Ouvrir les Réglages')).toBeDefined();
    await act(async () => {
      bouton(a, 'Choisir les photos visibles')!.props.onPress();
      await vider();
    });
    expect(pickLimitedPhotos).toHaveBeenCalledTimes(1);
  });

  it('accès complet : l’album, et aucun bouton', async () => {
    poserNatif({ photoAccess: async () => 'complet' });
    const a = await rendrePage();
    expect(texte(a)).toContain('album « EchoPlan »');
    expect(bouton(a, 'Ouvrir les Réglages')).toBeUndefined();
  });

  it('refus : dit le risque, propose les Réglages', async () => {
    poserNatif({ photoAccess: async () => 'refuse' });
    const a = await rendrePage();
    expect(texte(a)).toContain(ETAT_ACCES_PHOTOS.refuse);
    expect(bouton(a, 'Ouvrir les Réglages')).toBeDefined();
    expect(bouton(a, 'Choisir les photos visibles')).toBeUndefined();
  });

  it('sans natif (hors iOS), pas de ligne d’état', async () => {
    const a = await rendrePage();
    for (const t of Object.values(ETAT_ACCES_PHOTOS)) expect(texte(a)).not.toContain(t);
  });
});
