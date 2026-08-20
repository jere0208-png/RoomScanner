/**
 * CE QUI TOURNE QUAND PERSONNE NE REGARDE.
 *
 * Relevé du chantier : « l'application fait chauffer le téléphone et perdre
 * la batterie rapidement ».
 *
 * Une animation en boucle infinie ne se voit pas dans un profil de code :
 * elle se voit sur le dos de la main. Et toutes ne se valent pas — celle qui
 * vit sur le FIL NATIF coûte un peu de GPU, celle qui vit sur le FIL JS
 * réveille JavaScript soixante fois par seconde, pour toujours, même quand
 * l'écran ne bouge pas d'un pixel.
 *
 * `strokeDashoffset` est un attribut SVG : il n'existe pas côté natif. Le
 * liseré qui court autour du bouton principal tournait donc en JS, en
 * permanence, sur l'écran que l'application montre le plus longtemps — celui
 * qu'on regarde en réfléchissant à ce qu'on va faire. C'est exactement le
 * profil d'une application qui chauffe sans rien faire.
 *
 * Ce banc dit la règle : une boucle sur le fil JS est BORNÉE. Le liseré fait
 * ses tours, se montre, puis rend la main.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { GlowButton } from '../src/components/GlowButton';
import { parImage } from '../src/ui/parImage';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/** Les boucles lancées pendant le rendu, avec leurs options. */
const boucles: { config?: Animated.LoopAnimationConfig; natif: boolean }[] = [];

beforeEach(() => {
  boucles.length = 0;
  // On marque chaque animation de son pilote au passage : c'est lui qui
  // décide si la boucle réveille JavaScript ou se contente du fil natif.
  const vrai = Animated.timing;
  jest
    .spyOn(Animated, 'timing')
    .mockImplementation((valeur, config) => {
      const anim = vrai(valeur, config) as unknown as Record<string, unknown>;
      anim.__natif = config.useNativeDriver !== false;
      return anim as never;
    });
  jest.spyOn(Animated, 'loop').mockImplementation((anim, config) => {
    const brut = anim as unknown as { __natif?: boolean };
    boucles.push({ config, natif: brut.__natif !== false });
    return { start: jest.fn(), stop: jest.fn(), reset: jest.fn() } as never;
  });
});

afterEach(() => jest.restoreAllMocks());

describe('le liseré du bouton principal', () => {
  it('ne tourne pas indéfiniment sur le fil JS', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <GlowButton label="Scanner" onPress={() => {}} variant="primary" />,
      );
    });
    const enJS = boucles.filter((b) => !b.natif);
    expect(enJS.length).toBeGreaterThan(0);
    for (const b of enJS) {
      // Une boucle JS sans compte est une boucle qui ne s'arrête jamais.
      expect(b.config?.iterations).toBeGreaterThan(0);
      expect(b.config?.iterations).toBeLessThan(10);
    }
    act(() => t.unmount());
  });
});

/**
 * LE DOIGT VA PLUS VITE QUE L ECRAN.
 *
 * Sur un iPhone recent, le tactile remonte jusqu a cent vingt fois par
 * seconde. Chaque mouvement redessinait la scene 3D en entier — plusieurs
 * centaines de traces — alors qu entre deux images affichees, tous les
 * rendus intermediaires sauf le dernier finissent a la poubelle.
 */
describe('un seul rendu par image', () => {
  it('ne garde que la derniere valeur du battement', () => {
    const rendus: number[] = [];
    const poser = parImage<number>((v) => rendus.push(v));
    poser(1);
    poser(2);
    poser(3);
    // Rien n est encore affiche : on attend le battement de l ecran.
    expect(rendus).toEqual([]);
    jest.advanceTimersByTime(20);
    expect(rendus).toEqual([3]);
    // Le battement suivant repart proprement.
    poser(4);
    jest.advanceTimersByTime(20);
    expect(rendus).toEqual([3, 4]);
  });

  it('annule ce qui attendait, au demontage', () => {
    const rendus: number[] = [];
    const poser = parImage<number>((v) => rendus.push(v));
    poser(1);
    poser.annuler();
    jest.advanceTimersByTime(50);
    expect(rendus).toEqual([]);
  });
});
