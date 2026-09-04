/**
 * LA PHOTO DU MUR DERRIÈRE SON ÉLÉVATION — huitième des dix améliorations.
 *
 * L'établi dessine un mur vu de face, et l'on y pose les prises. À côté, dans
 * un bouton, dort une photo DE CE MUR — prise sur place, une minute plus tôt,
 * pour se souvenir de la gaine qui en sort. Les deux ne se sont jamais
 * rencontrées : on ouvrait la photo en grand, on la refermait, et on
 * replaçait sa prise de mémoire.
 *
 * Elle se pose maintenant DERRIÈRE le dessin, dans le rectangle exact du mur,
 * et un rideau qu'on tire découvre l'un ou l'autre. C'est l'avant/après du
 * chantier : à gauche ce qui existe, à droite ce qu'on projette.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ELLE NE S'ALIGNE PAS TOUTE SEULE, ET ON NE PRÉTEND PAS LE CONTRAIRE.
 *
 * Une photo prise à main levée, de biais, n'est pas une élévation : la caler
 * automatiquement demanderait de redresser la perspective, et une photo mal
 * redressée est PIRE qu'une photo brute — on y placerait des prises au
 * mauvais endroit en croyant mesurer. On la pose donc au mieux (elle couvre
 * le mur), et on donne le geste pour la caler à la main. Elle est un REPÈRE,
 * jamais une cote.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  CALAGE_NEUTRE,
  bornerCalage,
  bornerRideau,
  cadreDeLaPhoto,
  ECHELLE_MIN,
  ECHELLE_MAX,
} from '../src/ui/calage';

/** Un mur de 4 m sur 2,50 m, dessiné à 100 points le mètre. */
const MUR = { w: 400, h: 250 };

describe('la photo se pose au mieux, sans qu’on lui demande rien', () => {
  it('elle COUVRE le mur : pas de bandes vides autour d’un repère', () => {
    /*
      Un repère visuel qui laisse deux bandes grises de chaque côté se lit
      comme une vignette posée sur le mur, pas comme le mur lui-même. On
      couvre, et l'on rogne ce qui dépasse.
    */
    const c = cadreDeLaPhoto(MUR, { w: 4032, h: 3024 }, CALAGE_NEUTRE);
    expect(c.w).toBeGreaterThanOrEqual(MUR.w - 0.01);
    expect(c.h).toBeGreaterThanOrEqual(MUR.h - 0.01);
    // Et l'image garde ses proportions : une photo étirée ne sert de repère
    // à rien du tout.
    expect(c.w / c.h).toBeCloseTo(4032 / 3024, 5);
  });

  it('et elle est centrée sur le mur', () => {
    const c = cadreDeLaPhoto(MUR, { w: 4032, h: 3024 }, CALAGE_NEUTRE);
    expect(c.x + c.w / 2).toBeCloseTo(MUR.w / 2, 5);
    expect(c.y + c.h / 2).toBeCloseTo(MUR.h / 2, 5);
  });

  it('une photo debout couvre aussi — c’est la hauteur qui commande', () => {
    const c = cadreDeLaPhoto(MUR, { w: 3024, h: 4032 }, CALAGE_NEUTRE);
    expect(c.w).toBeGreaterThanOrEqual(MUR.w - 0.01);
    expect(c.h).toBeGreaterThanOrEqual(MUR.h - 0.01);
  });

  it('tant qu’on ne connaît pas ses côtes, elle prend celles du mur', () => {
    /*
      Les dimensions d'une image se demandent au système, et la réponse
      arrive une image plus tard. En attendant, la photo occupe le
      rectangle du mur : elle apparaît d'un coup, à la bonne place, au lieu
      de sauter d'une taille à l'autre sous les yeux.
    */
    const c = cadreDeLaPhoto(MUR, null, CALAGE_NEUTRE);
    expect(c).toEqual({ x: 0, y: 0, w: MUR.w, h: MUR.h });
  });
});

describe('on la cale à la main, et le calage se tient', () => {
  it('le décalage se compte en fractions du mur, pas en points', () => {
    /*
      Un calage retenu en POINTS d'écran ne veut plus rien dire sur un autre
      téléphone, ni après une rotation : le même dossier ouvert sur un iPad
      retrouverait sa photo à trente centimètres du mur. En fractions, il
      voyage.
    */
    const c = cadreDeLaPhoto(MUR, { w: 400, h: 250 }, {
      dx: 0.25,
      dy: -0.1,
      k: 1,
    });
    expect(c.x).toBeCloseTo(0.25 * MUR.w, 5);
    expect(c.y).toBeCloseTo(-0.1 * MUR.h, 5);
  });

  it('le grossissement part du CENTRE du mur, pas du coin', () => {
    /*
      Un zoom qui part du coin fait fuir l'image en diagonale : on cherche à
      grossir un détail du milieu, et il sort du cadre. Le centre reste le
      centre.
    */
    const c = cadreDeLaPhoto(MUR, { w: 400, h: 250 }, { dx: 0, dy: 0, k: 2 });
    expect(c.w).toBeCloseTo(MUR.w * 2, 5);
    expect(c.x + c.w / 2).toBeCloseTo(MUR.w / 2, 5);
    expect(c.y + c.h / 2).toBeCloseTo(MUR.h / 2, 5);
  });

  it('on ne peut pas perdre la photo : l’échelle et le décalage sont bornés', () => {
    /*
      Deux doigts qui s'échappent, et la photo part à mille pour cent, hors
      du mur : elle n'est plus nulle part, et rien à l'écran ne dit comment
      la ramener. Les bornes sont le seul chemin de retour.
    */
    expect(bornerCalage({ dx: 9, dy: -9, k: 40 })).toEqual({
      dx: expect.any(Number),
      dy: expect.any(Number),
      k: ECHELLE_MAX,
    });
    expect(bornerCalage({ dx: 9, dy: 0, k: 0.01 }).k).toBe(ECHELLE_MIN);
    expect(Math.abs(bornerCalage({ dx: 9, dy: 0, k: 1 }).dx)).toBeLessThanOrEqual(1.5);
  });

  it('un calage qui n’est pas un nombre revient au neutre', () => {
    /*
      La leçon de la maison : une garde qui nomme ce qu'elle REFUSE laisse
      passer les NaN. Un pincement dont un doigt s'est levé donne un facteur
      NaN, et une photo à NaN point disparaît sans laisser d'adresse.
    */
    expect(bornerCalage({ dx: NaN, dy: 0, k: 1 })).toEqual(CALAGE_NEUTRE);
    expect(bornerCalage({ dx: 0, dy: 0, k: Infinity })).toEqual(CALAGE_NEUTRE);
    expect(bornerCalage(undefined)).toEqual(CALAGE_NEUTRE);
  });
});

describe('le rideau va d’un bord à l’autre, et pas au-delà', () => {
  it('il se borne entre le mur nu et la photo entière', () => {
    expect(bornerRideau(-3)).toBe(0);
    expect(bornerRideau(0.42)).toBeCloseTo(0.42, 5);
    expect(bornerRideau(12)).toBe(1);
    expect(bornerRideau(NaN)).toBe(0);
  });
});

describe('la photo retient son calage', () => {
  const { useScanStore } =
    require('../src/store/scanStore') as typeof import('../src/store/scanStore');

  beforeEach(() => {
    useScanStore.setState({
      photos: [
        { id: 'p1', wallId: 'm1', along: 1, path: '/a.jpg', at: 1 },
        { id: 'p2', wallId: 'm1', along: 2, path: '/b.jpg', at: 2 },
      ],
      dirty: false,
    });
  });

  it('caler une photo ne bouge pas sa voisine', () => {
    useScanStore.getState().setPhotoCalage('p1', { dx: 0.1, dy: 0, k: 1.4 });
    const photos = useScanStore.getState().photos;
    expect(photos.find((p) => p.id === 'p1')?.calage).toEqual({
      dx: 0.1,
      dy: 0,
      k: 1.4,
    });
    expect(photos.find((p) => p.id === 'p2')?.calage).toBeUndefined();
  });

  it('le calage est BORNÉ à l’entrée du magasin, pas seulement au dessin', () => {
    /*
      Ce qui s'enregistre doit être sain : un calage aberrant écrit dans le
      dossier ressort tel quel à la réouverture, et le garde-fou du dessin
      n'a plus rien à corriger si personne ne retouche la photo.
    */
    useScanStore.getState().setPhotoCalage('p1', { dx: 40, dy: 0, k: 900 });
    const c = useScanStore.getState().photos.find((p) => p.id === 'p1')!.calage!;
    expect(c.k).toBe(ECHELLE_MAX);
    expect(Math.abs(c.dx)).toBeLessThanOrEqual(1.5);
  });

  it('et le remettre à neutre EFFACE le champ', () => {
    /*
      Un champ retiré relit comme une photo jamais calée — ce qu'elle est
      redevenue. Deux façons de dire la même chose dans un dossier finissent
      toujours par diverger.
    */
    useScanStore.getState().setPhotoCalage('p1', { dx: 0.1, dy: 0, k: 1.4 });
    useScanStore.getState().setPhotoCalage('p1', null);
    const p1 = useScanStore.getState().photos.find((p) => p.id === 'p1')!;
    expect('calage' in p1).toBe(false);
  });

  it('une photo qui n’existe pas ne fabrique rien', () => {
    useScanStore.getState().setPhotoCalage('fantome', CALAGE_NEUTRE);
    expect(useScanStore.getState().photos).toHaveLength(2);
    expect(useScanStore.getState().dirty).toBe(false);
  });
});

describe('l’établi montre la photo, et dit ce qu’elle vaut', () => {
  const lire = (rel: string) => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return readFileSync(join(__dirname, '..', ...rel.split('/')), 'utf8');
  };

  it('le calque se monte EN DEUX, de part et d’autre du dessin', () => {
    /*
      La photo doit être SOUS le dessin — sans quoi elle cacherait les prises
      qu'on est venu poser — et sa poignée AU-DESSUS, sans quoi on ne
      pourrait pas l'attraper. Deux enfants d'un même parent s'empilent dans
      leur ordre d'écriture : le fond se monte donc avant le dessin, la
      poignée après. Plutôt qu'un `zIndex` négatif, qui marche jusqu'au jour
      où quelqu'un ajoute un troisième calque.
    */
    const etabli = lire('src/components/WallElevation.tsx');
    const fond = etabli.indexOf('<CalquePhotoFond');
    const dessin = etabli.indexOf('<Svg width={layout.w}');
    const poignee = etabli.indexOf('<CalquePhotoPoignee');
    expect(fond).toBeGreaterThan(0);
    expect(fond).toBeLessThan(dessin);
    expect(poignee).toBeGreaterThan(dessin);

    const calque = lire('src/components/CalquePhoto.tsx');
    expect(calque).toContain('cadreDeLaPhoto');
    expect(calque).toContain('bornerRideau');
    // Le fond ne prend JAMAIS le doigt : l'établi sert à poser des appareils.
    expect(calque).toContain("pointerEvents=\"none\"");
  });

  it('et l’écran dit que c’est un repère, pas une cote', () => {
    /*
      Une photo posée sur une élévation cotée se prend pour une élévation
      cotée. Elle ne l'est pas : prise à main levée, de biais, elle ne
      mesure rien. Le dire est la seule façon honnête de la montrer.
    */
    expect(lire('src/components/WallElevation.tsx')).toMatch(/repère/i);
  });
});
