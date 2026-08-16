/**
 * Les volumes de la salle d'eau.
 *
 * Le seul contrôle de l'app où une erreur est DANGEREUSE et non gênante :
 * une prise à 40 cm d'une baignoire ne se remarque pas sur un plan, et elle
 * tue. Deux exigences, donc, et la seconde compte autant que la première :
 * signaler ce qui est interdit, et NE RIEN AFFIRMER quand on ne sait pas —
 * sans baignoire ni douche relevée, l'app doit se taire plutôt que rassurer.
 */
import {
  VOLUME2_DEBORD,
  VOLUME_HAUT,
  volumeAt,
  volumeVerdict,
  wetZones,
} from '../src/geometry/volumes';

/** Une baignoire 1,70 × 0,75, bord à 55 cm, contre le mur nord. */
const baignoire = {
  id: 'b',
  category: 'bathtub',
  width: 1.7,
  depth: 0.75,
  height: 0.55,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.0, 0.275, 0.375, 1],
};

const douche = {
  ...baignoire,
  id: 'd',
  category: 'shower',
  width: 0.9,
  depth: 0.9,
  height: 0.2,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0.1, 0.45, 1],
};

describe('reconnaître les zones humides', () => {
  it('une baignoire et une douche en créent, les autres meubles non', () => {
    const zones = wetZones([
      baignoire,
      douche,
      { ...baignoire, id: 'x', category: 'toilet' },
      { ...baignoire, id: 'y', category: 'sink' },
    ]);
    expect(zones).toHaveLength(2);
    expect(zones.map((z) => z.kind).sort()).toEqual(['bathtub', 'shower']);
  });

  it('sans baignoire ni douche, il n’y a pas de volume — et on le dit', () => {
    expect(wetZones([{ ...baignoire, category: 'toilet' }])).toHaveLength(0);
    expect(volumeAt({ x: 1, z: 0.3 }, 0.3, [])).toBeNull();
  });
});

describe('situer un appareil dans les volumes', () => {
  const zones = wetZones([baignoire]);

  it('à l’aplomb de la baignoire, sous le bord : volume 0', () => {
    expect(volumeAt({ x: 1, z: 0.3 }, 0.3, zones)).toBe(0);
  });

  it('à l’aplomb, au-dessus du bord : volume 1', () => {
    expect(volumeAt({ x: 1, z: 0.3 }, 1.2, zones)).toBe(1);
    // Et même très haut : l'aplomb d'une baignoire reste le volume 1.
    expect(volumeAt({ x: 1, z: 0.3 }, 2.6, zones)).toBe(1);
  });

  it('à moins de 60 cm et sous 2,25 m : volume 2', () => {
    expect(volumeAt({ x: 1, z: 1.05 }, 1.1, zones)).toBe(2);
    expect(volumeAt({ x: 2.2, z: 0.3 }, 1.1, zones)).toBe(2);
  });

  it('au-delà de 60 cm : hors volume', () => {
    expect(volumeAt({ x: 1, z: 0.75 + VOLUME2_DEBORD + 0.05 }, 1.1, zones))
      .toBeNull();
  });

  it('au-dessus de 2,25 m, hors aplomb : hors volume', () => {
    expect(volumeAt({ x: 1, z: 1.05 }, VOLUME_HAUT + 0.1, zones)).toBeNull();
  });

  it('entre deux zones, c’est TOUJOURS la plus sévère qui gagne', () => {
    const deux = wetZones([baignoire, douche]);
    // Un point dans la baignoire et à portée de la douche : volume 0.
    expect(volumeAt({ x: 1, z: 0.3 }, 0.2, deux)).toBe(0);
  });
});

describe('ce que la norme permet, appareil par appareil', () => {
  it('rien dans le volume 0, quel que soit l’appareil', () => {
    for (const kind of ['prise', 'inter', 'applique', 'sortieCable']) {
      const v = volumeVerdict(kind, 0);
      expect(v.allowed).toBe(false);
      expect(v.regle).toMatch(/volume 0/i);
    }
  });

  it('un socle est interdit en volume 1 comme en volume 2', () => {
    expect(volumeVerdict('prise', 1).allowed).toBe(false);
    expect(volumeVerdict('prise2', 2).allowed).toBe(false);
    // Le rasoir sur transformateur est l'exception, et elle est écrite.
    expect(volumeVerdict('prise', 2).regle).toMatch(/rasoir/i);
  });

  it('une commande sort du volume 1, mais reste admise en 2', () => {
    expect(volumeVerdict('inter', 1).allowed).toBe(false);
    expect(volumeVerdict('inter', 1).regle).toMatch(/hors volume|TBTS/i);
    expect(volumeVerdict('va', 2).allowed).toBe(true);
    expect(volumeVerdict('va', 2).regle).toMatch(/IPX4/);
  });

  it('un luminaire est admis, à condition d’être le bon', () => {
    expect(volumeVerdict('applique', 1).allowed).toBe(true);
    expect(volumeVerdict('applique', 1).regle).toMatch(/TBTS|IPX4/);
    expect(volumeVerdict('applique', 2).regle).toMatch(/IPX4/);
  });

  it('chaque verdict porte SA règle : un interdit sans motif ne sert à rien', () => {
    for (const kind of ['prise', 'inter', 'applique', 'rj45']) {
      for (const vol of [0, 1, 2] as const) {
        const v = volumeVerdict(kind, vol);
        expect(v.regle.length).toBeGreaterThan(20);
        expect(v.volume).toBe(vol);
      }
    }
  });
});
