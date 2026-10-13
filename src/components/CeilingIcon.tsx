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
import Svg, { Circle, Path } from 'react-native-svg';
// Une icône, un module : l'import groupé de Lucide faisait entrer ses
// quelque 1 770 icônes dans l'application, évaluées à l'ouverture du plan.
import AirVent from 'lucide-react-native/icons/air-vent';
import AlarmSmoke from 'lucide-react-native/icons/alarm-smoke';
import Cctv from 'lucide-react-native/icons/cctv';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import LampCeiling from 'lucide-react-native/icons/lamp-ceiling';
import LampWallUp from 'lucide-react-native/icons/lamp-wall-up';
import ScanEye from 'lucide-react-native/icons/scan-eye';
import { useTheme } from '../theme';
import { CEILINGS, CEILING_SYMBOL, type CeilingKind } from '../geometry/ceiling';

/**
 * LES QUATRE PALES DU VENTILATEUR, dans le carré de 24 des icônes au trait :
 * le dessin du plan (`CEILING_SYMBOL.ventilateur`), à la graisse de Lucide.
 */
const PALES = [
  'M13.91 8.68 L16.88 4.58 A2.6 2.6 0 0 1 20.56 8.25 L15.32 10.09 Z',
  'M15.32 13.91 L19.42 16.88 A2.6 2.6 0 0 1 15.75 20.56 L13.91 15.32 Z',
  'M10.09 15.32 L7.12 19.42 A2.6 2.6 0 0 1 3.44 15.75 L8.68 13.91 Z',
  'M8.68 10.09 L4.58 7.12 A2.6 2.6 0 0 1 8.25 3.44 L10.09 8.68 Z',
];

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
  const teinteFamille =
    kind === 'spots' ? CEILINGS.spot.color : CEILINGS[kind].color;
  /*
    LE VENTILATEUR DE PLAFOND — relevé du patron : « il y a 3 hélices et
    l'icône est mal faite ». Le tourbillon plein (`black-hole-3`) était la
    seule silhouette d'un jeu au trait, et ses trois bras ne disaient pas
    un ventilateur. Il prend le dessin du plan — quatre pales autour du
    moyeu — au trait de Lucide, les pales à peine teintées. Sa couleur reste
    l'ambre de l'éclairage : il porte un point lumineux et se commande.
  */
  if (kind === 'ventilateur') {
    const t = teinteFamille || c.ink;
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {PALES.map((d, i) => (
          <Path
            key={i}
            d={d}
            stroke={t}
            strokeWidth={1.9}
            strokeLinejoin="round"
            fill={t}
            fillOpacity={0.2}
          />
        ))}
        <Circle cx={12} cy={12} r={2.6} stroke={t} strokeWidth={1.9} fill="none" />
      </Svg>
    );
  }
  /*
    LE RUBAN LED ET LE SPOT AU SOL n'ont pas d'icône au trait dans ce jeu :
    ils se dessinent comme sur le plan, d'après la légende de l'architecte.
  */
  if (kind === 'led' || kind === 'spotSol') {
    return (
      <Svg width={size} height={size} viewBox="-12 -12 24 24">
        {CEILING_SYMBOL[kind].map((seg, i) => (
          <Path
            key={i}
            d={seg.d}
            stroke={teinteFamille || c.ink}
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    );
  }
  const Icone = JEU[kind];
  // La teinte de la famille : lumière, sécurité, ventilation. C'est la
  // même sur le plan et dans le dossier — on reconnaît un détecteur de
  // fumée à son rouge avant même de lire le mot.
  return <Icone size={size} color={teinteFamille || c.ink} strokeWidth={1.9} />;
}
