/**
 * L'ICÔNE D'UN APPAREIL DE PLAFOND — prise dans une bibliothèque, pas dessinée.
 *
 * Le catalogue du plafond se lisait en trois lignes grises par appareil :
 * deux écrans à dérouler pour toucher un spot. Un électricien sait ce qu'est
 * un détecteur de fumée ; ce qu'il lui faut, c'est le reconnaître d'un coup
 * d'œil et le toucher. Restait à trouver neuf dessins — et un dessin de plus
 * fait maison, c'est une convention de plus à tenir.
 *
 * On prend donc Lucide (`lucide-react-native`), qui rend en `react-native-svg`
 * — déjà là — et n'apporte AUCUN fichier natif : pas de police à embarquer,
 * pas d'étape de build en plus. Ses mille sept cents icônes suffisent
 * largement à couvrir un plafond d'appartement.
 *
 * Les symboles NORMALISÉS, eux, ne bougent pas : le plan et le PDF gardent
 * ceux de la CEI 60617 (`CEILING_SYMBOL`). Une icône d'interface et un
 * symbole de schéma n'ont ni le même public ni les mêmes règles — la
 * première aide à choisir, le second fait foi.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import {
  AirVent,
  AlarmSmoke,
  Cctv,
  CircleDot,
  Ellipsis,
  LampCeiling,
  LampWallUp,
  ScanEye,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { SOLAIRES } from '../ui/solaires';
import { CEILINGS, type CeilingKind } from '../geometry/ceiling';

/** « spots » = la ligne de spots, qui n'est pas un appareil mais un geste. */
export type CeilingIconKind = CeilingKind | 'spots';

const JEU = {
  spots: Ellipsis,
  dcl: LampCeiling,
  spot: CircleDot,
  applique: LampWallUp,
  daaf: AlarmSmoke,
  camera: Cctv,
  vmc: AirVent,
  detecteur: ScanEye,
} as const;

export function CeilingIcon({
  kind,
  size = 22,
}: {
  kind: CeilingIconKind;
  size?: number;
}) {
  const c = useTheme();
  /*
    LE VENTILATEUR DE PLAFOND — relevé du patron, lien à l'appui :
    « remplace le ventilateur actuel par cette icône » (`black-hole-3`),
    « de la couleur que tu ferais la lumière ».

    Vu du dessous, un ventilateur de plafond n'a pas de pales : il a des
    cercles. C'est ce que dessine ce tracé, et c'est ce qu'on voit sur un
    plan. Sa teinte ne change pas pour autant : le ventilateur appartient
    déjà à la famille ÉCLAIRAGE — il porte un point lumineux et se commande
    — et il en portait donc déjà l'ambre.

    C'est la seule silhouette du catalogue : les huit autres viennent de
    Lucide, au trait. Une exception assumée, pour un dessin qui n'existe pas
    au trait dans ce jeu-là.
  */
  const teinteFamille =
    kind === 'spots' ? CEILINGS.spot.color : CEILINGS[kind].color;
  if (kind === 'ventilateur') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d={SOLAIRES.ventilateur}
          fill={teinteFamille || c.ink}
          fillRule="evenodd"
        />
      </Svg>
    );
  }
  const Icone = JEU[kind];
  // La teinte de la famille : lumière, sécurité, ventilation. C'est la
  // même sur le plan et dans le dossier — on reconnaît un détecteur de
  // fumée à son rouge avant même de lire le mot.
  return <Icone size={size} color={teinteFamille || c.ink} strokeWidth={1.9} />;
}
