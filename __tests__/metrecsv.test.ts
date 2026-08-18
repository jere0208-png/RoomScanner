/**
 * LE MÉTRÉ EN TABLEUR — et les trois pièges du CSV français.
 *
 * Un export CSV se casse toujours de la même façon, et jamais chez celui qui
 * l'écrit : il l'ouvre sur sa machine, en anglais, et tout va bien. Chez le
 * patron électricien, en français, le fichier s'ouvre en une seule colonne,
 * les surfaces ne s'additionnent pas et « Séjour » s'écrit « SÃ©jour ».
 *
 * Ce banc tient les trois : le séparateur point-virgule, la virgule
 * décimale, la marque d'ordre des octets. Plus ce qui compte pour le devis —
 * qu'aucune ligne ne manque, et qu'un nom de pièce contenant un
 * point-virgule ne décale pas toute la grille.
 */
import { buildMetreCsv, metreFilename, type RoomMetre } from '../src/export/csv';
import type { MaterialList } from '../src/geometry/nfc15100';

const PIECES: RoomMetre[] = [
  { name: 'Séjour', area: 21.35, perimeter: 18.4, height: 2.5, walls: 4 },
  { name: 'Cuisine', area: 8.2, perimeter: 11.6, height: 2.5, walls: 4 },
  // Une pièce dont le contour n'est pas fermé : rien à écrire, pas un zéro.
  { name: 'Dégagement', area: null, perimeter: null, height: null, walls: 2 },
];

const LISTE: MaterialList = {
  rooms: [
    {
      room: 'Séjour',
      use: 'Séjour',
      area: 21.35,
      rows: [
        { label: 'Prise 16 A', quantity: 6 },
        { label: 'Interrupteur simple', quantity: 2 },
      ],
    },
    {
      room: 'Cuisine',
      use: 'Cuisine',
      area: 8.2,
      rows: [{ label: 'Prise 20 A', quantity: 3 }],
    },
  ],
  circuits: [
    {
      id: 'c1',
      label: 'Prises 1',
      nature: 'prises',
      points: 8,
      section: 2.5,
      breaker: 20,
      rooms: ['Séjour'],
      fixtureIds: [],
      cable: 42.5,
    },
    {
      id: 'c2',
      label: 'Éclairage 1',
      nature: 'eclairage',
      points: 5,
      section: 1.5,
      breaker: 16,
      rooms: ['Séjour', 'Cuisine'],
      fixtureIds: [],
    },
  ],
  differentials: [
    { label: 'Différentiel type A 1', type: 'A', rating: 40, circuits: ['Cuisson'] },
    { label: 'Différentiel type AC 1', type: 'AC', rating: 40, circuits: [] },
  ],
  board: [{ label: 'Disjoncteur 20 A', quantity: 1 }],
  issues: [
    {
      code: 'socles',
      severity: 'alerte',
      message: 'Séjour : 6 socles pour 21 m², il en faut 7.',
      regle: 'Un socle par tranche de 4 m², cinq au minimum.',
    },
  ],
};

const csv = () => buildMetreCsv('Chantier test', PIECES, LISTE);
/** Les lignes utiles, marque d'ordre des octets ôtée. */
const lignes = () => csv().replace(/^﻿/, '').trimEnd().split('\r\n');

describe('le métré en tableur', () => {
  it('commence par la marque d’ordre des octets', () => {
    // Sans elle, Excel lit le fichier dans son encodage régional.
    expect(csv().charCodeAt(0)).toBe(0xfeff);
    expect(csv()).toContain('Séjour');
  });

  it('sépare au point-virgule et compte à la virgule', () => {
    const l = lignes();
    const sejour = l.find((x) => x.startsWith('Séjour;'))!;
    expect(sejour).toBeDefined();
    const cases = sejour.split(';');
    expect(cases[1]).toBe('21,35');
    expect(cases[2]).toBe('18,4');
    expect(cases[3]).toBe('2,5');
    // La surface murale se calcule : périmètre × hauteur, arrondie.
    expect(cases[5]).toBe('46');
    // Et jamais un point décimal nulle part dans le fichier.
    expect(csv()).not.toMatch(/\d\.\d/);
  });

  it('laisse vide ce qu’il ne sait pas, plutôt que d’écrire zéro', () => {
    const l = lignes().find((x) => x.startsWith('Dégagement;'))!;
    expect(l).toBe('Dégagement;;;;2;');
  });

  it('totalise les surfaces et le câble', () => {
    const l = lignes();
    expect(l.some((x) => x === 'TOTAL;29,55;;;;')).toBe(true);
    expect(l.some((x) => x.startsWith('TOTAL;;;;;42,5'))).toBe(true);
  });

  it('porte les quatre tables du devis', () => {
    const t = csv();
    for (const titre of [
      'MÉTRÉ PAR PIÈCE',
      'APPAREILLAGE PAR PIÈCE',
      'CIRCUITS',
      'INTERRUPTEURS DIFFÉRENTIELS',
      'TABLEAU',
      'CONFORMITÉ NF C 15-100',
    ]) {
      expect(t).toContain(titre);
    }
    // Une ligne par article, pièce en première colonne : c'est ce qu'on trie.
    expect(lignes()).toContain('Séjour;Séjour;Prise 16 A;6');
    expect(lignes()).toContain('Cuisine;Cuisine;Prise 20 A;3');
    // Le circuit porte sa nature en clair, pas son code interne.
    expect(lignes()).toContain('Prises 1;Prises 16 A;8;2,5;20;42,5;Séjour');
    // Un différentiel sans circuit le dit : c'est une ligne à trancher.
    expect(lignes()).toContain('Différentiel type AC 1;AC;40;à répartir');
    // Et ce qui manque se chiffre aussi.
    expect(csv()).toContain('À CORRIGER');
  });

  /**
   * UN NOM DE PIÈCE PEUT CONTENIR UN POINT-VIRGULE.
   *
   * L'utilisateur nomme ses pièces à la main. Une seule cellule non échappée
   * décale toute la grille à partir de là, et les colonnes ne veulent plus
   * rien dire — sans que rien ne le signale.
   */
  it('échappe ce qui casserait la grille', () => {
    const piege: RoomMetre[] = [
      { name: 'Cave ; réserve', area: 4, perimeter: 8, height: 2, walls: 4 },
      { name: 'Chambre "bleue"', area: 9, perimeter: 12, height: 2.5, walls: 4 },
    ];
    const l = buildMetreCsv('X', piege, LISTE).split('\r\n');
    expect(l.some((x) => x.startsWith('"Cave ; réserve";4;8;2;4;16'))).toBe(true);
    expect(l.some((x) => x.startsWith('"Chambre ""bleue""";9;'))).toBe(true);
  });

  it('nomme le fichier sans caractère interdit', () => {
    expect(metreFilename('Chantier 12/08')).toBe('Métré - Chantier 12-08.csv');
    expect(metreFilename('')).toBe('Métré - Scan.csv');
  });
});
