/** Une face projetée, telle que le rendu la manipule. */
export interface FaceTracee {
  proj: { sx: number; sy: number }[];
  fill: string;
  stroke: string;
  voile: number;
  dashed: boolean;
}

/**
 * LES FACES VOISINES DE MÊME PEAU SE DESSINENT D'UN SEUL TRACÉ.
 *
 * Relevé du patron : « le meublé est lourd, à peine quelques meubles et une
 * latence est largement visible ; pourtant sur MagicScan, un grand nombre de
 * meubles et aucun problème ». La comparaison est juste, et elle désigne la
 * vraie limite : chaque face est une VUE NATIVE que le moteur repeint et que
 * React réconcilie à chaque image. Cinq cent cinquante vues, c'est le mur —
 * et aucune optimisation du calcul n'y changera rien, il ne coûte déjà que
 * trois dixièmes de milliseconde.
 *
 * On ne peut pas retirer des faces sans abîmer le tri : c'est lui qui
 * empêche un meuble de traverser une cloison. Mais on peut réduire le
 * nombre de VUES. Dans l'ordre de peinture, les faces qui SE SUIVENT et
 * partagent la même peau — même remplissage, même trait, même opacité —
 * sont dessinées d'un seul tracé : un `Path` porte autant de contours
 * fermés qu'on veut.
 *
 * L'ordre est respecté à la lettre : on ne fusionne QUE des voisines, on ne
 * réordonne rien, on ne saute rien. Le dessin est donc rigoureusement le
 * même — c'est la même idée que les bandes d'un mur, prise par l'autre
 * bout : là on découpe pour trier juste, ici on recolle ce que le tri a
 * laissé côte à côte.
 *
 * Les ARÊTES (deux points) ne se mêlent pas aux aplats : un tracé est soit
 * une suite de contours fermés, soit une suite de traits ouverts.
 */
export function grouperTraces(
  faces: FaceTracee[],
): { d: string; fill: string; stroke: string; voile: number; dashed: boolean; trait: boolean }[] {
  const groupes: {
    d: string;
    fill: string;
    stroke: string;
    voile: number;
    dashed: boolean;
    trait: boolean;
  }[] = [];
  for (const f of faces) {
    const trait = f.proj.length === 2;
    const chemin =
      `M${f.proj.map((q) => `${q.sx.toFixed(2)} ${q.sy.toFixed(2)}`).join('L')}` +
      (trait ? '' : 'Z');
    const dernier = groupes[groupes.length - 1];
    if (
      dernier &&
      dernier.trait === trait &&
      dernier.fill === f.fill &&
      dernier.stroke === f.stroke &&
      dernier.voile === f.voile &&
      dernier.dashed === f.dashed
    ) {
      dernier.d += chemin;
      continue;
    }
    groupes.push({
      d: chemin,
      fill: f.fill,
      stroke: f.stroke,
      voile: f.voile,
      dashed: f.dashed,
      trait,
    });
  }
  return groupes;
}
