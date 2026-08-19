/**
 * LE TABLEAU ÉLECTRIQUE, DESSINÉ — et ce qu'un électricien y exige.
 *
 * L'app savait répartir l'appareillage en circuits ; elle en donnait la
 * liste. Or un tableau ne se monte pas avec une liste : rangée par rangée,
 * module par module, et ce qu'on cherche sur le chantier c'est « qu'est-ce
 * qui va où ». Le dossier d'exécution en était donc à moitié vide.
 *
 * Ce banc juge la RÉPARTITION — un calcul, pas un dessin —, puis vérifie
 * dans le flux du PDF que le coffret est bien tracé et qu'il ne sort pas de
 * son cadre.
 */
import { boardRows, buildMaterialPdf } from '../src/export/pdf';
import type { Circuit, Differential, MaterialList } from '../src/geometry/nfc15100';

const circuit = (
  label: string,
  nature: Circuit['nature'],
  breaker: number | null,
  section: number | null,
  rooms: string[] = ['Séjour'],
): Circuit => ({
  id: label,
  label,
  nature,
  points: 4,
  section,
  breaker,
  rooms,
  fixtureIds: [],
});

/** Un logement courant : cuisson, deux spécialisés, prises, éclairage, VDI. */
function liste(circuits: Circuit[], differentials: Differential[]): MaterialList {
  return {
    rooms: [],
    circuits,
    differentials,
    board: [],
    issues: [],
  };
}

const CIRCUITS = [
  circuit('Cuisson', 'cuisson', 32, 6),
  circuit('Spécialisé 1', 'specialise', 20, 2.5),
  circuit('Spécialisé 2', 'specialise', 20, 2.5),
  circuit('Prises 1', 'prises', 20, 2.5),
  circuit('Prises 2', 'prises', 20, 2.5),
  circuit('Éclairage 1', 'eclairage', 16, 1.5),
  circuit('Courants faibles', 'vdi', null, null),
];
const DIFFS: Differential[] = [
  {
    label: 'Différentiel type A 1',
    type: 'A',
    rating: 40,
    circuits: ['Cuisson', 'Spécialisé 1', 'Spécialisé 2'],
  },
  {
    label: 'Différentiel type AC 1',
    type: 'AC',
    rating: 40,
    circuits: ['Prises 1', 'Prises 2', 'Éclairage 1'],
  },
];

describe('la répartition en rangées', () => {
  const rows = boardRows(liste(CIRCUITS, DIFFS));

  it('donne une rangée par interrupteur différentiel', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toContain('type A');
    expect(rows[1].label).toContain('type AC');
  });

  it('met le différentiel en tête de SA rangée, sur deux modules', () => {
    for (const r of rows) {
      expect(r.modules[0].differentiel).toBe(true);
      expect(r.modules[0].largeur).toBe(2);
      expect(r.modules[0].marque).toBe('ID');
      // Et rien d'autre n'est un différentiel dans la rangée.
      expect(r.modules.slice(1).every((m) => !m.differentiel)).toBe(true);
    }
  });

  it('numérote les modules à la suite, sans trou ni doublon', () => {
    const nums = rows.flatMap((r) => r.modules.map((m) => m.numero));
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it('porte chaque circuit protégé une fois, et le calibre en clair', () => {
    const legendes = rows.flatMap((r) => r.modules.map((m) => m.legende));
    for (const c of CIRCUITS.filter((x) => x.nature !== 'vdi')) {
      expect(legendes.filter((l) => l.startsWith(`${c.label} ·`))).toHaveLength(1);
    }
    // Les courants faibles ne sont pas protégés : ils n'ont rien à faire ici.
    expect(legendes.some((l) => l.startsWith('Courants faibles'))).toBe(false);
    // Le calibre et la section suivent le circuit, c'est ce qu'on commande.
    expect(legendes.some((l) => l.includes('32 A · 6 mm²'))).toBe(true);
    expect(legendes.some((l) => l.includes('16 A · 1,5 mm²'))).toBe(true);
  });

  /**
   * LA RÉSERVE EST DESSINÉE, PAS SOUS-ENTENDUE.
   *
   * La norme demande 20 % de modules libres. Un tableau plein à ras bord est
   * un tableau qu'on ne fera pas évoluer — et c'est le genre de détail qu'on
   * découvre trois ans plus tard, une chignole à la main.
   */
  it('laisse voir les emplacements libres', () => {
    for (const r of rows) {
      const pris = r.modules.reduce((n, m) => n + m.largeur, 0);
      expect(pris + r.libres).toBe(13);
      expect(r.libres).toBeGreaterThan(0);
    }
  });

  /**
   * UNE RANGÉE NE DÉBORDE JAMAIS DU COFFRET.
   *
   * Treize modules, pas quatorze : au-delà, le différentiel suivant passe à
   * la rangée d'après. Sans ça, on dessinerait des disjoncteurs hors du
   * coffret — et le dessin mentirait sur ce qu'on peut monter.
   */
  it('reporte le trop-plein sur une rangée de plus', () => {
    const gros: Circuit[] = Array.from({ length: 16 }, (_, i) =>
      circuit(`Prises ${i + 1}`, 'prises', 20, 2.5),
    );
    const rows2 = boardRows(
      liste(gros, [
        {
          label: 'Différentiel type AC 1',
          type: 'AC',
          rating: 40,
          circuits: gros.map((c) => c.label),
        },
      ]),
    );
    expect(rows2.length).toBeGreaterThan(1);
    for (const r of rows2) {
      const pris = r.modules.reduce((n, m) => n + m.largeur, 0);
      expect(pris).toBeLessThanOrEqual(13);
    }
    // Les seize circuits sont tous là, une fois chacun.
    const legendes = rows2.flatMap((r) => r.modules.map((m) => m.legende));
    for (const c of gros) {
      expect(legendes.filter((l) => l.startsWith(`${c.label} ·`))).toHaveLength(1);
    }
  });
});

/** Le flux du PDF, lisible caractère par caractère. */
const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

describe('le coffret dans le PDF', () => {
  const pdf = latin1(buildMaterialPdf('Essai', liste(CIRCUITS, DIFFS)));

  /**
   * Les modules sont des QUADRILATÈRES du flux : quatre sommets, un
   * `m` puis trois `l`, refermés par `b`, `f` ou `s`. C'est ainsi que la
   * classe de dessin écrit un rectangle — pas avec l'opérateur `re`.
   */
  const quadrilateres = () => {
    const out: { x: number; y: number }[][] = [];
    const re =
      /([-\d.]+) ([-\d.]+) m ([-\d.]+) ([-\d.]+) l ([-\d.]+) ([-\d.]+) l ([-\d.]+) ([-\d.]+) l [bfs]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pdf))) {
      out.push([
        { x: parseFloat(m[1]), y: parseFloat(m[2]) },
        { x: parseFloat(m[3]), y: parseFloat(m[4]) },
        { x: parseFloat(m[5]), y: parseFloat(m[6]) },
        { x: parseFloat(m[7]), y: parseFloat(m[8]) },
      ]);
    }
    return out;
  };

  it('trace des modules et les annonce', () => {
    expect(pdf).toContain('Tableau');
    // Deux rangées : deux rails, treize emplacements chacun, plus le reste
    // de la feuille. On en attend largement plus de dix.
    expect(quadrilateres().length).toBeGreaterThan(10);
  });

  /**
   * ET RIEN NE SORT DU CADRE.
   *
   * La règle de toute l'app : aucun élément du PDF ne déborde de sa feuille.
   * Un coffret dessiné à treize modules sur une page A4 y tient — encore
   * faut-il que la largeur d'un module ait été calculée sur la place
   * disponible, et non posée en dur.
   */
  it('tient dans la feuille', () => {
    const quads = quadrilateres();
    expect(quads.length).toBeGreaterThan(10);
    for (const q of quads) {
      for (const p of q) {
        expect(p.x).toBeGreaterThanOrEqual(28);
        expect(p.x).toBeLessThanOrEqual(567);
        expect(p.y).toBeGreaterThanOrEqual(28);
        expect(p.y).toBeLessThanOrEqual(814);
      }
    }
  });

  /**
   * LE RÉCAPITULATIF D'UN DIFFÉRENTIEL NOMME TOUS SES CIRCUITS.
   *
   * La ligne « Différentiel type A 1 … : Cuisson, Spécialisé 1, … » se
   * tronquait à la largeur d'une colonne de valeurs… qui est VIDE sur cette
   * ligne : « Spéciali… ». Une liste de circuits amputée ne dit plus ce que
   * le différentiel protège — et la place était là.
   */
  it('nomme tous les circuits de chaque différentiel, sans troncature', () => {
    const doc = (pdf.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? [])
      .map((m) => m.slice(1, m.lastIndexOf(')')))
      .join(' | ');
    expect(doc).toContain('Cuisson, Spécialisé 1, Spécialisé 2');
    expect(doc).toContain('Prises 1, Prises 2, Éclairage 1');
  });
});
