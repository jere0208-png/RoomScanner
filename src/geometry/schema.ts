/**
 * Schémas d'installation : unifilaire et multifilaire.
 *
 * Deux documents que tout dossier électrique porte, et que l'app peut
 * déduire du relevé puisqu'elle connaît déjà les circuits :
 *
 * - **l'unifilaire** montre l'ARCHITECTURE : le branchement, les
 *   différentiels, un départ par circuit avec son calibre et sa section.
 *   Un trait par circuit, barré du nombre de conducteurs ;
 * - **le multifilaire** montre le CÂBLAGE d'un circuit : chaque conducteur
 *   séparément, avec sa couleur, du disjoncteur jusqu'aux appareils.
 *
 * Les couleurs ne sont pas décoratives, elles sont normatives (NF C 15-100,
 * qui reprend la CEI 60446) :
 *
 * | Conducteur | Couleur |
 * | ---------- | ------- |
 * | Phase | rouge, marron ou noir — jamais bleu ni vert/jaune |
 * | Neutre | bleu clair, réservé |
 * | Terre | vert/jaune, réservé, jamais autre chose |
 * | Navette (va-et-vient) | orange, violet — n'importe quelle couleur de phase |
 *
 * Ce module ne dessine rien : il produit la STRUCTURE des deux schémas. Le
 * PDF s'occupe du tracé, l'écran pourra s'en servir plus tard.
 */
import { FIXTURES, postsOf, type Fixture, type FixtureKind } from './electrical';
import type { Circuit, Differential } from './nfc15100';
import { conduitFor } from './conduits';

/** Rôle d'un conducteur, au sens de la norme. */
export type WireRole = 'phase' | 'neutre' | 'terre' | 'navette' | 'retour';

export interface Wire {
  role: WireRole;
  /** Couleur normalisée, en hexadécimal, pour le tracé. */
  color: string;
  /** Son nom en clair : c'est lui qu'on lit sur le schéma. */
  label: string;
  /** Section en mm². */
  section: number;
}

/** Les couleurs de la norme, et rien d'autre. */
export const WIRE_COLORS: Record<WireRole, { color: string; label: string }> = {
  phase: { color: '#B8352A', label: 'Phase — rouge' },
  neutre: { color: '#2E6FD6', label: 'Neutre — bleu clair' },
  terre: { color: '#5A9E31', label: 'Terre — vert/jaune' },
  navette: { color: '#D98324', label: 'Navette — orange' },
  retour: { color: '#7B4BA8', label: 'Retour de lampe — violet' },
};

/**
 * Les conducteurs d'un circuit.
 *
 * Trois fils pour un circuit de prises (phase, neutre, terre) ; un
 * éclairage simple allumage en compte autant plus le retour de lampe ; un
 * va-et-vient ajoute deux navettes. Un circuit de communication n'a ni
 * phase ni terre : ce sont des paires, on ne les colorie pas comme du 230 V.
 */
/** Les appareils qui COMMANDENT : eux seuls appellent un retour de lampe. */
export const COMMANDES: FixtureKind[] = [
  'inter',
  'inter2',
  'inter3',
  'va',
  'poussoir',
  'variateur',
];
/** Les POINTS LUMINEUX : sans l'un d'eux, il n'y a rien à retourner. */
export const LUMIERES: FixtureKind[] = ['applique', 'boite', 'sortieCable'];

/**
 * Les conducteurs d'un circuit — ceux qu'on tire VRAIMENT.
 *
 * Tout circuit d'éclairage recevait six fils : phase, neutre, terre, retour
 * de lampe et deux navettes. C'est le câblage d'un va-et-vient, pas celui
 * d'un circuit d'éclairage en général. Le schéma annonçait donc un retour
 * de lampe là où le plan ne porte aucun point lumineux, et deux navettes
 * pour un simple interrupteur — quatre mètres de fil imaginaires par
 * départ, reportés au métré puis à la commande.
 *
 * On compte donc ce qui est POSÉ :
 *
 * - le retour de lampe suppose une commande ET un point lumineux ;
 * - les navettes supposent DEUX commandes (ou un va-et-vient déclaré).
 *
 * Sans la liste des appareils, on s'en tient au câblage le plus courant —
 * une commande, un point — plutôt que d'inventer un va-et-vient.
 */
export function wiresOf(circuit: Circuit, fixtures?: Fixture[]): Wire[] {
  const section = circuit.section ?? 0;
  if (circuit.section === null) {
    return [
      { role: 'phase', color: '#8A94A6', label: 'Paires torsadées', section: 0 },
    ];
  }
  const base: Wire[] = [
    { role: 'phase', ...WIRE_COLORS.phase, section },
    { role: 'neutre', ...WIRE_COLORS.neutre, section },
    { role: 'terre', ...WIRE_COLORS.terre, section },
  ];
  if (circuit.nature !== 'eclairage') return base;

  const poses = fixtures
    ? circuit.fixtureIds
        .map((id) => fixtures.find((f) => f.id === id))
        .filter((f): f is Fixture => !!f)
    : null;
  const commandes = poses
    ? poses.filter((f) => COMMANDES.includes(f.kind)).length
    : 1;
  /*
    LES POINTS DE PLAFOND COMPTENT AUSSI — et c'est ce qui manquait.

    Releve du patron : « le schema multifilaire dit n'importe quoi,
    interrupteur et point lumineux il dit juste 3 fils a l'eclairage ». La
    cause est une frontiere interne : un DCL, un spot, une VMC ne vivent pas
    dans la liste de l'appareillage MURAL — ils ont la leur, parce qu'ils se
    posent dans une piece et non sur une face de mur.

    Le calcul ne regardait que les murs, n'y trouvait aucune lampe, et
    concluait qu'il n'y avait rien a commander : phase, neutre, terre, et
    rien d'autre. Or le retour de lampe est precisement le conducteur qui
    distingue un circuit d'eclairage d'une simple alimentation — l'oublier,
    c'est sous-compter le fil au metre et decrire un cablage qui n'existe
    pas sur un document technique.
  */
  const auPlafond = circuit.ceilingIds?.length ?? 0;
  const lumieres =
    (poses ? poses.filter((f) => LUMIERES.includes(f.kind)).length : 1) +
    auPlafond;
  const vaEtVient = poses
    ? commandes >= 2 || poses.some((f) => f.kind === 'va')
    : false;

  const out = [...base];
  if (commandes >= 1 && lumieres >= 1) {
    out.push({ role: 'retour', ...WIRE_COLORS.retour, section });
  }
  if (vaEtVient) {
    out.push({ role: 'navette', ...WIRE_COLORS.navette, section });
    out.push({ role: 'navette', ...WIRE_COLORS.navette, section });
  }
  return out;
}

/** Ce qu'un départ dessert — c'est ce qui décide de ses conducteurs. */
export type RoleDepart = 'commande' | 'lumiere' | 'autre';

/**
 * LES CONDUCTEURS D'UN DÉPART — et non ceux du circuit entier.
 *
 * Relevé du patron, le PDF en main : « pour l'éclairage, le PDF d'un simple
 * allumage montre 4 fils, alors qu'il n'y a que le retour lampe, bleu,
 * terre ». Il a raison, et l'erreur était de compter par CIRCUIT.
 *
 * Un circuit d'éclairage emploie bien quatre conducteurs — phase, neutre,
 * terre, retour de lampe — mais aucun départ ne les porte tous les quatre.
 * Tout remonte au tableau (relevé du patron, la veille), donc :
 *
 *   — VERS UNE COMMANDE : la phase y monte, le retour de lampe en
 *     redescend. Pas de neutre — un interrupteur ne coupe que la phase — et
 *     pas de terre : il n'y a rien à mettre à la terre dans un boîtier
 *     d'appareillage. Un va-et-vient remplace le retour par ses deux
 *     navettes du côté de la seconde commande ; on tire donc trois fils de
 *     chaque côté, jamais six dans la même gaine ;
 *   — VERS UN POINT LUMINEUX : le neutre, la terre, et le retour de lampe.
 *     C'est exactement ce que dit le relevé — « retour lampe, bleu, terre » ;
 *   — VERS AUTRE CHOSE, une prise commandée par exemple : phase, neutre,
 *     terre, comme n'importe quel socle.
 *
 * ET ÇA NE CHANGE PAS QUE LE DESSIN. Le diamètre de la gaine se calcule sur
 * le nombre de fils qu'elle avale (règle du tiers, voir `conduitPour`) :
 * compter le circuit au lieu du départ faisait choisir de l'ICTA 20 là où du
 * 16 suffit. On sur-commandait, sur le document même qui sert à commander.
 */
export function wiresOfRun(
  circuit: Circuit,
  role: RoleDepart,
  vaEtVient = false,
): Wire[] {
  const section = circuit.section ?? 0;
  if (circuit.section === null) {
    return [
      { role: 'phase', color: '#8A94A6', label: 'Paires torsadées', section: 0 },
    ];
  }
  const fil = (r: WireRole): Wire => ({ role: r, ...WIRE_COLORS[r], section });
  if (circuit.nature !== 'eclairage' || role === 'autre') {
    return [fil('phase'), fil('neutre'), fil('terre')];
  }
  if (role === 'commande') {
    return vaEtVient
      ? [fil('phase'), fil('navette'), fil('navette')]
      : [fil('phase'), fil('retour')];
  }
  return [fil('neutre'), fil('terre'), fil('retour')];
}

/** Ce circuit se câble-t-il en va-et-vient ? Deux commandes, ou un « va ». */
export function estVaEtVient(circuit: Circuit, fixtures?: Fixture[]): boolean {
  if (!fixtures) return false;
  const poses = circuit.fixtureIds
    .map((id) => fixtures.find((f) => f.id === id))
    .filter((f): f is Fixture => !!f);
  return (
    poses.filter((f) => COMMANDES.includes(f.kind)).length >= 2 ||
    poses.some((f) => f.kind === 'va')
  );
}

export interface SchemaRow {
  /** Repère porté sur le plan et sur le tableau : C1, C2… */
  mark: string;
  circuitId: string;
  label: string;
  /** Calibre du disjoncteur, nul en courants faibles. */
  breaker: number | null;
  section: number | null;
  conduit: number;
  /** Nombre de conducteurs du départ. */
  wires: number;
  /** Ce que le départ dessert, en clair. */
  points: string;
  /** Différentiel qui le protège, s'il y en a un. */
  under?: string;
}

/** Un repère par circuit, dans l'ordre du tableau : C1, C2, C3… */
export function circuitMarks(circuits: Circuit[]): Map<string, string> {
  return new Map(circuits.map((c, i) => [c.id, `C${i + 1}`]));
}

/** Le repère de chaque APPAREIL : c'est lui qu'on lit sur le plan. */
export function fixtureMarks(circuits: Circuit[]): Map<string, string> {
  const marks = circuitMarks(circuits);
  const out = new Map<string, string>();
  for (const c of circuits) {
    for (const id of c.fixtureIds) out.set(id, marks.get(c.id) ?? '');
  }
  return out;
}

/** Ce que dessert un départ, en toutes lettres. */
function pointsOf(circuit: Circuit, fixtures: Fixture[]): string {
  const parType = new Map<FixtureKind, number>();
  for (const id of circuit.fixtureIds) {
    const f = fixtures.find((x) => x.id === id);
    if (!f) continue;
    for (const k of postsOf(f.kind)) {
      parType.set(k, (parType.get(k) ?? 0) + 1);
    }
  }
  if (parType.size === 0) return '—';
  return [...parType.entries()]
    .map(([k, n]) => `${n} × ${FIXTURES[k].label.toLowerCase()}`)
    .join(', ');
}

/**
 * L'unifilaire, ligne par ligne, dans l'ordre du tableau.
 *
 * On ne réinvente pas les circuits : ce sont ceux qui protègent déjà
 * l'installation dans la liste du matériel. Le schéma ne fait que les
 * mettre en forme — un document qui contredirait la liste ne servirait à
 * rien.
 */
export function schemaRows(
  circuits: Circuit[],
  differentials: Differential[],
  fixtures: Fixture[],
): SchemaRow[] {
  const marks = circuitMarks(circuits);
  const protecteur = new Map<string, string>();
  differentials.forEach((d, i) => {
    for (const nom of d.circuits) protecteur.set(nom, `ID${i + 1}`);
  });
  return circuits.map((c) => ({
    mark: marks.get(c.id) ?? '',
    circuitId: c.id,
    label: c.label,
    breaker: c.breaker,
    section: c.section,
    conduit: conduitFor(c.section),
    wires: wiresOf(c, fixtures).length,
    points: pointsOf(c, fixtures),
    under: protecteur.get(c.label),
  }));
}

/**
 * Le multifilaire d'un circuit : les conducteurs, et ce qu'ils relient.
 *
 * On s'en tient à ce que le relevé sait vraiment — le nombre d'appareils et
 * leur nature. Un vrai multifilaire de va-et-vient dépend du câblage choisi
 * sur place ; celui-ci montre le principe, avec les bonnes couleurs et le
 * bon nombre de fils, ce qui est déjà ce qu'on vérifie sur un dossier.
 */
export interface MultiWireSchema {
  mark: string;
  label: string;
  /** Tous les conducteurs du circuit, réunis : l'en-tête du départ. */
  wires: Wire[];
  /**
   * LE CÂBLAGE, DÉPART PAR DÉPART.
   *
   * Relevé du patron, le PDF en main : « pour l'éclairage, le PDF d'un simple
   * allumage montre 4 fils, alors qu'il n'y a que le retour lampe, bleu,
   * terre ».
   *
   * La feuille traçait les conducteurs du CIRCUIT, quatre traits qui
   * couraient d'un bord à l'autre — ce qui est vrai du circuit et faux de
   * chaque gaine. Un multifilaire montre le câblage : il se lit départ par
   * départ, et chacun n'a que ses fils.
   */
  runs: { titre: string; wires: Wire[] }[];
  /** Appareils desservis, dans l'ordre du plan. */
  devices: { id: string; kind: FixtureKind; label: string }[];
  note?: string;
}

export function multiWire(
  circuit: Circuit,
  fixtures: Fixture[],
  mark: string,
): MultiWireSchema {
  const devices = circuit.fixtureIds
    .map((id) => fixtures.find((f) => f.id === id))
    .filter((f): f is Fixture => !!f)
    .map((f) => ({ id: f.id, kind: f.kind, label: FIXTURES[f.kind].label }));
  const commandes = devices.filter((d) =>
    ['inter', 'inter2', 'inter3', 'va', 'poussoir', 'variateur'].includes(d.kind),
  ).length;
  const va = estVaEtVient(circuit, fixtures);
  /*
    UN BLOC PAR NATURE DE DÉPART, ET SEULEMENT CEUX QU'ON A.

    Trois départs vers trois points lumineux se câblent pareil : les répéter
    remplirait la feuille de copies. On montre donc le TYPE de départ — vers
    une commande, vers un point lumineux, vers le reste — et le nombre
    d'appareils est déjà écrit en haut du bloc.
  */
  const aCommande = devices.some((d) => COMMANDES.includes(d.kind));
  const aLumiere =
    devices.some((d) => LUMIERES.includes(d.kind)) ||
    (circuit.ceilingIds?.length ?? 0) > 0;
  const aAutre = devices.some(
    (d) => !COMMANDES.includes(d.kind) && !LUMIERES.includes(d.kind),
  );
  const runs: { titre: string; wires: Wire[] }[] = [];
  if (circuit.nature !== 'eclairage' || circuit.section === null) {
    runs.push({
      titre: 'Vers chaque appareil',
      wires: wiresOfRun(circuit, 'autre'),
    });
  } else {
    if (aCommande) {
      runs.push({
        titre: va ? 'Vers chaque commande' : 'Vers la commande',
        wires: wiresOfRun(circuit, 'commande', va),
      });
    }
    if (aLumiere) {
      runs.push({
        titre: 'Vers le point lumineux',
        wires: wiresOfRun(circuit, 'lumiere', va),
      });
    }
    if (aAutre) {
      runs.push({
        titre: 'Vers les autres appareils',
        wires: wiresOfRun(circuit, 'autre', va),
      });
    }
  }

  return {
    mark,
    label: circuit.label,
    wires: wiresOf(circuit, fixtures),
    runs,
    devices,
    note:
      circuit.nature === 'eclairage' && commandes > 1
        ? 'Deux commandes ou plus : va-et-vient, deux navettes entre les ' +
          'boîtiers, retour de lampe au point lumineux.'
        : circuit.nature === 'eclairage' && !aLumiere
        ? /*
             LE PLAFOND COMPTE AUSSI — et la note l'ignorait.

             Elle ne regardait que l'appareillage MURAL. Sur un circuit
             commandant un DCL, la feuille dessinait le retour de lampe et
             écrivait dessous « aucun point lumineux posé sur ce circuit » :
             deux phrases contradictoires sur la même ligne. C'est la même
             frontière interne qui avait déjà fait sous-compter les
             conducteurs (voir `wiresOf`) — un point de plafond ne vit pas
             dans la liste des appareils de mur.
          */
          'Aucun point lumineux posé sur ce circuit : pas de retour de ' +
          'lampe. Ajoutez le point sur le plan pour l’obtenir.'
        : circuit.section === null
        ? 'Courants faibles : paires torsadées, jamais dans la même gaine ' +
          'que la puissance.'
        : undefined,
  };
}

/**
 * La teinte d'un circuit — la MÊME à l'écran et sur le PDF.
 *
 * Un repère « C3 » écrit en noir sur le plan et tracé en vert sur le schéma,
 * c'est deux documents qui parlent du même départ sans se ressembler. Sur le
 * chantier, on suit la couleur avant de lire le texte : elle doit donc être
 * décidée UNE fois, ici, et non dans chaque module qui dessine.
 *
 * DIX TEINTES, ET PAS UNE ROUGE — question du patron, sur une capture :
 * « pourquoi l'affichage des gaines est rouge pour l'interrupteur ? »
 *
 * Ce n'était pas un bug, et c'est ce qui le rendait gênant : la deuxième
 * teinte de la roue était rouge, et l'éclairage tombe en C2 dans un logement
 * sans plaque ni circuit spécialisé. L'interrupteur était rouge parce que son
 * circuit portait le numéro deux, et pour aucune autre raison.
 *
 * TROIS SENS POUR UNE COULEUR, À DIX CENTIMÈTRES LES UNS DES AUTRES. Le rouge
 * d'ALARME de l'application — le halo d'un meuble qu'on ne peut pas poser, la
 * pastille des normes non conformes. Le rouge NORMATIF du métier — la phase,
 * « rouge, marron ou noir », NF C 15-100 reprenant la CEI 60446. Et ce
 * troisième, qui ne voulait rien dire, et qui portait EXACTEMENT le code du
 * fil de phase, `#B8352A`.
 *
 * Arbitrage du patron : « évite le rouge mais il doit rester dans le schéma
 * pour la phase, le rouge est une norme pour le fil de phase. » La roue perd
 * donc ses deux teintes rouges — le rouge franc et le rouille — SANS
 * REMPLACEMENT : dix couleurs franchement distinctes valent mieux que douze
 * dont deux mentent. Sur le plan, le rouge ne dit plus qu'une seule chose.
 *
 * Au-delà de dix départs on recommence la roue : deux circuits de même teinte
 * restent distingués par leur repère, et une installation qui dépasse dix
 * départs a de toute façon son tableau pour référence.
 *
 * UNE FAIBLESSE CONNUE, MESURÉE : les deux verts (`#2E8B57` et `#127A5E`) ne
 * sont séparés que de 33 sur 255 — moins que les voisines de rang, qui sont
 * toutes au-delà de 50. Ils sont à huit rangs l'un de l'autre et ne se
 * rencontrent donc presque jamais sur un même plan ; les remplacer
 * demanderait une teinte franche de plus sur fond blanc, et l'espace des
 * couleurs ne la donne pas sans revenir vers le rouge ou vers un gris qui se
 * perdrait sur un aplat de sol.
 */
const ROUE = [
  '#2F6BFF', '#2E8B57', '#8A5CD1', '#C77A18', '#0F8C9E',
  '#B5326E', '#5C7A1E', '#3757A8', '#6B4FA0', '#127A5E',
] as const;

export function circuitColor(index: number): string {
  return ROUE[((index % ROUE.length) + ROUE.length) % ROUE.length];
}

/**
 * La teinte d'après le repère (« C3 » → la troisième). Les repères sont
 * numérotés dans l'ordre du tableau, ce qui suffit à retrouver le rang sans
 * traîner la liste des circuits jusqu'au composant qui dessine.
 */
export function markColor(mark: string): string {
  const n = parseInt(mark.replace(/^\D+/, ''), 10);
  return circuitColor(Number.isFinite(n) && n > 0 ? n - 1 : 0);
}
