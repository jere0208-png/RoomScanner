/**
 * LES APPAREILS DU TABLEAU, DE FACE, TELS QU'ILS SONT.
 *
 * Relevé du patron : « je ne veux pas un SVG mal fait, une reproduction
 * honnête des disjoncteurs Schneider. Pour chaque, tu devras te fier à
 * l'identique réaliste. » Et pour le répartiteur, la photo d'un répartiteur
 * 4 × 14 départs à l'appui.
 *
 * Chaque appareil est relevé sur la gamme Resi9 XE (embrochable), vu de face
 * dans un tableau EN SERVICE — manette levée, voyant « I.ON » :
 *
 *   — DISJONCTEUR (1 module) : la tête et ses deux bornes à vis en haut ; le
 *     NEZ saillant qui porte la marque, « Resi9 », « DM C16 » et la pastille
 *     XE ; la fenêtre d'état ; la manette verte dans sa lumière ; le calibre
 *     en gros en bas du nez ; le clip de rail bleu et le connecteur
 *     embrochable sous l'appareil.
 *   — INTERRUPTEUR DIFFÉRENTIEL (2 modules) : deux grosses bornes rondes en
 *     tête, le bouton test gris à gauche du nez, la marque à droite, la
 *     manette large, « 40A 30mA · Type AC » en bas à droite.
 *   — INTERRUPTEUR GÉNÉRAL (2 modules) : le même corps, manette grise, sans
 *     bouton test.
 *   — RÉPARTITEUR (6 modules) : le capot bleu translucide, les embouts gris
 *     clair du rail, quatre barres de bornes vues au travers, l'étiquette
 *     blanche à l'éclair et la rangée de vis du bas.
 *   — PARAFOUDRE, CONTACTEUR, TÉLÉRUPTEUR, PORTE-FUSIBLE, DISJONCTEUR
 *     D'ABONNÉ : chacun avec ce qui le distingue.
 *
 * Tout est en millimètres, dans le repère du coffret : 17,5 mm par module,
 * 80 mm de haut. Le logo n'est pas redessiné : la marque s'écrit en toutes
 * lettres, dans son vert, comme on la lit sur l'appareil.
 */
import React from 'react';
import { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { DepartExistant } from '../geometry/existant';

/** Le vert de la marque, celui de la manette et de la pastille XE. */
const VERT = '#3DCD58';
const ENCRE = '#1E2226';
const GRIS = '#7B838B';

/** Les dégradés partagés : à poser une fois dans le `<Svg>` du coffret. */
export function DefsResi9() {
  return (
    <Defs>
      {/* Le corps : la lumière vient de la gauche. */}
      <LinearGradient id="r9corps" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="0.7" stopColor="#F3F4F5" />
        <Stop offset="1" stopColor="#DADDE0" />
      </LinearGradient>
      {/* Le nez : plus clair en haut, une ombre propre en bas. */}
      <LinearGradient id="r9nez" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="0.85" stopColor="#F5F6F7" />
        <Stop offset="1" stopColor="#E3E6E9" />
      </LinearGradient>
      {/* La tête des bornes, en retrait. */}
      <LinearGradient id="r9tete" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#ECEEF0" />
        <Stop offset="1" stopColor="#DDE0E3" />
      </LinearGradient>
      {/* La manette verte, bombée. */}
      <LinearGradient id="r9manette" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#5BDC74" />
        <Stop offset="0.55" stopColor="#3DCD58" />
        <Stop offset="1" stopColor="#24A33F" />
      </LinearGradient>
      <LinearGradient id="r9manetteGrise" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#B3B9BF" />
        <Stop offset="0.55" stopColor="#959CA3" />
        <Stop offset="1" stopColor="#737A81" />
      </LinearGradient>
      {/* Une vis : la tête ronde éclairée par le haut. */}
      <RadialGradient id="r9vis" cx="0.38" cy="0.32" r="0.75">
        <Stop offset="0" stopColor="#F4F5F6" />
        <Stop offset="0.6" stopColor="#B7BDC3" />
        <Stop offset="1" stopColor="#7E868E" />
      </RadialGradient>
      {/* Le bouton test, gris et rond. */}
      <RadialGradient id="r9test" cx="0.4" cy="0.35" r="0.7">
        <Stop offset="0" stopColor="#D9DDE1" />
        <Stop offset="1" stopColor="#8E969E" />
      </RadialGradient>
      {/* Le capot bleu translucide du répartiteur. */}
      <LinearGradient id="r9bleu" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#3D6FE0" />
        <Stop offset="0.45" stopColor="#2554C4" />
        <Stop offset="1" stopColor="#173C9C" />
      </LinearGradient>
      <LinearGradient id="r9embout" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#ECEBE5" />
        <Stop offset="1" stopColor="#C9C8C0" />
      </LinearGradient>
      <LinearGradient id="r9abonne" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#D2D0CA" />
        <Stop offset="1" stopColor="#ADAAA3" />
      </LinearGradient>
    </Defs>
  );
}

/** Une vis de borne dans son logement carré, empreinte cruciforme. */
function Vis({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const c = r * 1.55;
  return (
    <G>
      <Rect x={cx - c} y={cy - c} width={2 * c} height={2 * c} rx={0.5} fill="#4C535A" />
      <Rect x={cx - c + 0.35} y={cy - c + 0.35} width={2 * c - 0.7} height={2 * c - 0.7} rx={0.4} fill="#2F3439" />
      <Circle cx={cx} cy={cy} r={r} fill="url(#r9vis)" stroke="#6B737B" strokeWidth={0.2} />
      <Line x1={cx - r * 0.6} y1={cy} x2={cx + r * 0.6} y2={cy} stroke="#5B636B" strokeWidth={r * 0.28} strokeLinecap="round" />
      <Line x1={cx} y1={cy - r * 0.6} x2={cx} y2={cy + r * 0.6} stroke="#5B636B" strokeWidth={r * 0.28} strokeLinecap="round" />
    </G>
  );
}

/** La pastille verte « XE » à la maison. */
function PastilleXE({ x, y, t }: { x: number; y: number; t: number }) {
  return (
    <G>
      <Rect x={x} y={y} width={t} height={t} rx={0.4} fill="#FFFFFF" stroke={VERT} strokeWidth={0.3} />
      <Path
        d={`M${x + t * 0.2} ${y + t * 0.55} L${x + t * 0.5} ${y + t * 0.25} L${x + t * 0.8} ${y + t * 0.55} L${x + t * 0.8} ${y + t * 0.85} L${x + t * 0.2} ${y + t * 0.85} Z`}
        fill="none"
        stroke={VERT}
        strokeWidth={0.3}
      />
      <Rect x={x} y={y + t + 0.3} width={t} height={t * 0.62} rx={0.3} fill={VERT} />
      <SvgText x={x + t / 2} y={y + t + 0.3 + t * 0.5} fontSize={t * 0.48} fill="#FFFFFF" fontWeight="700" textAnchor="middle">
        XE
      </SvgText>
    </G>
  );
}

/** La marque, en toutes lettres et dans son vert. */
function Marque({ x, y, taille, ancre = 'start' }: { x: number; y: number; taille: number; ancre?: 'start' | 'end' }) {
  return (
    <G>
      <SvgText x={x} y={y} fontSize={taille} fill={VERT} fontWeight="700" textAnchor={ancre}>
        Schneider
      </SvgText>
      <SvgText x={ancre === 'end' ? x : x + taille * 1.3} y={y + taille * 0.62} fontSize={taille * 0.48} fill={VERT} textAnchor={ancre}>
        Electric
      </SvgText>
    </G>
  );
}

/** La fenêtre d'état : rouge « I.ON », l'appareil est enclenché. */
function Voyant({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <G>
      <Rect x={x - 0.3} y={y - 0.3} width={w + 0.6} height={h + 0.6} rx={0.7} fill="#C9CED3" />
      <Rect x={x} y={y} width={w} height={h} rx={0.5} fill="#D7372E" />
      <SvgText x={x + w / 2} y={y + h * 0.72} fontSize={h * 0.62} fill="#FFFFFF" fontWeight="700" textAnchor="middle">
        I.ON
      </SvgText>
    </G>
  );
}

/** La manette dans sa lumière, levée (enclenchée). */
function Manette({ x, y, w, h, grise = false }: { x: number; y: number; w: number; h: number; grise?: boolean }) {
  const haut = h * 0.56;
  return (
    <G>
      <Rect x={x} y={y} width={w} height={h} rx={1.2} fill="#3A4046" />
      <Rect x={x + 0.35} y={y + 0.35} width={w - 0.7} height={h - 0.7} rx={1} fill="#262B30" />
      <Rect x={x + 0.5} y={y + 0.5} width={w - 1} height={haut} rx={1.3} fill={grise ? 'url(#r9manetteGrise)' : 'url(#r9manette)'} />
      {[0.32, 0.5, 0.68].map((k) => (
        <Line
          key={k}
          x1={x + 1.6}
          y1={y + 0.5 + haut * k}
          x2={x + w - 1.6}
          y2={y + 0.5 + haut * k}
          stroke={grise ? '#3E444A' : '#24A33F'}
          strokeWidth={0.35}
        />
      ))}
      <Rect x={x + 0.5} y={y + 0.5 + haut - 1} width={w - 1} height={1} rx={0.5} fill={grise ? '#33393F' : '#1E8A35'} />
    </G>
  );
}

/** Le bas de l'appareil : le clip de rail bleu et le connecteur embrochable. */
function Pied({ x, y, w }: { x: number; y: number; w: number }) {
  const cx = x + w / 2;
  return (
    <G>
      <Rect x={cx - 3.6} y={y} width={7.2} height={4.2} rx={0.6} fill="#2F80ED" stroke="#1D5FC0" strokeWidth={0.25} />
      <Rect x={cx - 1.6} y={y + 1} width={3.2} height={1.2} rx={0.3} fill="#1D5FC0" />
      <Rect x={cx - 3} y={y + 4.4} width={6} height={2.2} rx={0.4} fill="#F2C230" stroke="#C99A12" strokeWidth={0.2} />
    </G>
  );
}

/** Le corps commun : la tête des bornes, le nez saillant, le pied. */
function Corps({
  x,
  y,
  w,
  vis,
  grosses = false,
  children,
}: {
  x: number;
  y: number;
  w: number;
  /** Combien de bornes en tête. */
  vis: number;
  grosses?: boolean;
  children?: React.ReactNode;
}) {
  const r = grosses ? 2.3 : 1.55;
  return (
    <G>
      <Rect x={x} y={y} width={w} height={80} rx={1.4} fill="url(#r9corps)" stroke="#B9BEC3" strokeWidth={0.35} />
      {/* La tête : ses bornes à vis. */}
      <Rect x={x + 0.7} y={y + 1.2} width={w - 1.4} height={17} rx={1} fill="url(#r9tete)" />
      {Array.from({ length: vis }, (_, i) => (
        <Vis key={i} cx={x + (w / vis) * (i + 0.5)} cy={y + 9.5} r={r} />
      ))}
      {/* Le nez, en saillie : une ombre portée, puis la face. */}
      <Rect x={x + 0.9} y={y + 21.6} width={w - 1.8} height={47} rx={1.1} fill="#C7CCD1" />
      <Rect x={x + 0.6} y={y + 21} width={w - 1.2} height={46.6} rx={1.1} fill="url(#r9nez)" stroke="#CBD0D5" strokeWidth={0.3} />
      {children}
      <Pied x={x} y={y + 72.5} w={w} />
    </G>
  );
}

/** Un appareil de la gamme, dessiné à sa place. */
export function AppareilResi9({ d, x, y, w }: { d: DepartExistant; x: number; y: number; w: number }) {
  const cx = x + w / 2;
  switch (d.organe) {
    case 'differentiel': {
      const type = d.typeDiff ?? 'AC';
      return (
        <G testID={`module-${d.id}`}>
          <Corps x={x} y={y} w={w} vis={2} grosses>
            <Circle cx={x + 7.6} cy={y + 28.5} r={3.6} fill="url(#r9test)" stroke="#7E868E" strokeWidth={0.3} />
            <SvgText x={x + 7.6} y={y + 29.5} fontSize={2.2} fill="#4E565E" fontWeight="700" textAnchor="middle">
              T
            </SvgText>
            <SvgText x={x + 7.6} y={y + 34.6} fontSize={1.5} fill={GRIS} textAnchor="middle">
              Test régulier
            </SvgText>
            <Marque x={x + w - 1.8} y={y + 25.6} taille={2.6} ancre="end" />
            <SvgText x={x + w - 6.2} y={y + 31} fontSize={2.2} fill={ENCRE} fontWeight="700" textAnchor="end">
              Resi9
            </SvgText>
            <SvgText x={x + w - 6.2} y={y + 33.8} fontSize={1.9} fill={ENCRE} textAnchor="end">
              ID
            </SvgText>
            <PastilleXE x={x + w - 5.2} y={y + 28.4} t={3.2} />
            <Voyant x={x + 3} y={y + 38.2} w={w * 0.44} h={4.6} />
            <Manette x={x + 3} y={y + 45} w={w * 0.44} h={15} />
            <SvgText x={x + w - 2} y={y + 55} fontSize={1.7} fill={ENCRE} textAnchor="end">
              {`Type ${type}`}
            </SvgText>
            <SvgText x={x + w - 2} y={y + 61.5} fontSize={1.9} fill={ENCRE} textAnchor="end">
              {`${d.sensibilite ?? 30}mA`}
            </SvgText>
            <SvgText x={x + w * 0.52} y={y + 65.4} fontSize={4.2} fill={ENCRE} fontWeight="700">
              {`${d.calibre ?? 40}A`}
            </SvgText>
          </Corps>
        </G>
      );
    }
    case 'interrupteur':
      return (
        <G testID={`module-${d.id}`}>
          <Corps x={x} y={y} w={w} vis={2} grosses>
            <Marque x={x + w - 1.8} y={y + 25.6} taille={2.6} ancre="end" />
            <SvgText x={x + 2.4} y={y + 26.4} fontSize={2.2} fill={ENCRE} fontWeight="700">
              Resi9
            </SvgText>
            <SvgText x={x + 2.4} y={y + 29.4} fontSize={1.9} fill={ENCRE}>
              Interrupteur
            </SvgText>
            <SvgText x={x + 2.4} y={y + 32} fontSize={1.9} fill={ENCRE}>
              sectionneur
            </SvgText>
            <PastilleXE x={x + w - 5.2} y={y + 28.4} t={3.2} />
            <Voyant x={cx - w * 0.22} y={y + 38.2} w={w * 0.44} h={4.6} />
            <Manette x={cx - w * 0.22} y={y + 45} w={w * 0.44} h={15} grise />
            <SvgText x={x + w - 2} y={y + 65.4} fontSize={4.2} fill={ENCRE} fontWeight="700" textAnchor="end">
              {`${d.calibre ?? 63}A`}
            </SvgText>
          </Corps>
        </G>
      );
    case 'repartiteur':
      return <Repartiteur d={d} x={x} y={y} w={w} />;
    case 'parafoudre':
      return (
        <G testID={`module-${d.id}`}>
          <Corps x={x} y={y} w={w} vis={2} grosses>
            <Marque x={x + w - 1.8} y={y + 25.6} taille={2.6} ancre="end" />
            <SvgText x={x + 2.4} y={y + 26.4} fontSize={2.2} fill={ENCRE} fontWeight="700">
              Resi9
            </SvgText>
            <SvgText x={x + 2.4} y={y + 29.4} fontSize={1.9} fill={ENCRE}>
              Parafoudre
            </SvgText>
            {/* La fenêtre d'état de la cartouche : verte, elle protège. */}
            <Rect x={cx - 6} y={y + 36} width={12} height={6} rx={0.8} fill="#C9CED3" />
            <Rect x={cx - 5.6} y={y + 36.4} width={11.2} height={5.2} rx={0.6} fill={VERT} />
            <Voyant x={cx - w * 0.22} y={y + 45} w={w * 0.44} h={4.2} />
            <Manette x={cx - w * 0.22} y={y + 50.5} w={w * 0.44} h={12} />
          </Corps>
        </G>
      );
    case 'contacteur':
    case 'telerupteur':
    case 'autre':
      return (
        <G testID={`module-${d.id}`}>
          <Corps x={x} y={y} w={w} vis={2}>
            <SvgText x={cx} y={y + 25.4} fontSize={2.3} fill={VERT} fontWeight="700" textAnchor="middle">
              Schneider
            </SvgText>
            <SvgText x={cx} y={y + 29.6} fontSize={2} fill={ENCRE} fontWeight="700" textAnchor="middle">
              Resi9
            </SvgText>
            <SvgText x={cx} y={y + 32.4} fontSize={1.8} fill={ENCRE} textAnchor="middle">
              {d.organe === 'contacteur' ? 'CT' : d.organe === 'telerupteur' ? 'TL' : '—'}
            </SvgText>
            {d.organe === 'contacteur' ? (
              <>
                {/* Le sélecteur à trois positions : 0 · Auto · I. */}
                <Rect x={x + 2.6} y={y + 37} width={w - 5.2} height={6} rx={1} fill="#262B30" />
                <Rect x={cx - 1.6} y={y + 37.6} width={3.2} height={4.8} rx={0.6} fill="#E8EBEE" />
                <SvgText x={x + 3.4} y={y + 46.6} fontSize={1.6} fill={GRIS}>
                  0
                </SvgText>
                <SvgText x={cx} y={y + 46.6} fontSize={1.6} fill={GRIS} textAnchor="middle">
                  A
                </SvgText>
                <SvgText x={x + w - 3.4} y={y + 46.6} fontSize={1.6} fill={GRIS} textAnchor="end">
                  I
                </SvgText>
                <Circle cx={cx} cy={y + 53} r={1.3} fill={VERT} />
              </>
            ) : (
              <>
                {/* Le bouton de commande manuelle du télérupteur. */}
                <Rect x={cx - 3.2} y={y + 38} width={6.4} height={10} rx={1.4} fill="#4C535A" />
                <Rect x={cx - 2.6} y={y + 38.6} width={5.2} height={5} rx={1.2} fill="#C9CED3" />
                <Circle cx={cx} cy={y + 54} r={1.2} fill="#E0A800" />
              </>
            )}
            <SvgText x={cx} y={y + 64.6} fontSize={3} fill={ENCRE} fontWeight="700" textAnchor="middle">
              {d.calibre ? `${d.calibre}A` : ''}
            </SvgText>
          </Corps>
        </G>
      );
    case 'fusible':
      return (
        <G testID={`module-${d.id}`}>
          <Corps x={x} y={y} w={w} vis={2}>
            {/* Le tiroir porte-cartouche, à basculer. */}
            <Rect x={x + 2.2} y={y + 24} width={w - 4.4} height={36} rx={1.2} fill="#E3E6E9" stroke="#AEB4BA" strokeWidth={0.3} />
            <Rect x={cx - 2} y={y + 27} width={4} height={2.4} rx={0.6} fill="#8E969E" />
            <Rect x={x + 3.4} y={y + 33} width={w - 6.8} height={20} rx={1} fill="#F7F3E8" stroke="#C9C2B4" strokeWidth={0.3} />
            <Rect x={x + 3.4} y={y + 41.5} width={w - 6.8} height={2.6} fill="#C8372D" />
            <SvgText x={cx} y={y + 64.6} fontSize={3} fill={ENCRE} fontWeight="700" textAnchor="middle">
              {d.calibre ? `${d.calibre}A` : ''}
            </SvgText>
          </Corps>
        </G>
      );
    case 'agcp':
      // Le disjoncteur de branchement : son boîtier gris, sa grosse manette, son bouton test.
      return (
        <G testID={`module-${d.id}`}>
          <Rect x={x} y={y} width={w} height={80} rx={2} fill="url(#r9abonne)" stroke="#8E8B85" strokeWidth={0.4} />
          {[0.3, 0.7].map((k) => (
            <Vis key={k} cx={x + w * k} cy={y + 9.5} r={2.3} />
          ))}
          <Rect x={x + 2} y={y + 22} width={w - 4} height={44} rx={1.6} fill="#E2E0DA" stroke="#A9A69F" strokeWidth={0.3} />
          <Rect x={cx - 5} y={y + 26} width={10} height={24} rx={1.6} fill="#2A2E33" />
          <Rect x={cx - 4.4} y={y + 26.6} width={8.8} height={12} rx={1.4} fill="#4A5056" />
          <Circle cx={x + 6} cy={y + 58} r={2.4} fill="#C8372D" />
          <SvgText x={x + w - 3} y={y + 60} fontSize={2.6} fill={ENCRE} fontWeight="700" textAnchor="end">
            {d.calibre ? `${d.calibre}A` : ''}
          </SvgText>
        </G>
      );
    default:
      // Le disjoncteur divisionnaire, 1P+N : « DM C16 ».
      return (
        <G testID={`module-${d.id}`}>
          <Corps x={x} y={y} w={w} vis={2}>
            <SvgText x={x + 1.8} y={y + 24.8} fontSize={2.45} fill={VERT} fontWeight="700">
              Schneider
            </SvgText>
            <SvgText x={x + 6.4} y={y + 26.6} fontSize={1.2} fill={VERT}>
              Electric
            </SvgText>
            <SvgText x={x + 1.8} y={y + 30} fontSize={2.1} fill={ENCRE} fontWeight="700">
              Resi9
            </SvgText>
            <Line x1={x + 1.8} y1={y + 30.7} x2={x + 9.6} y2={y + 30.7} stroke={ENCRE} strokeWidth={0.18} />
            <SvgText x={x + 1.8} y={y + 33.2} fontSize={1.75} fill={ENCRE}>
              {`DM C${d.calibre ?? ''}`}
            </SvgText>
            <PastilleXE x={x + w - 4.6} y={y + 27.6} t={2.7} />
            <Voyant x={x + 2.4} y={y + 37.6} w={w - 4.8} h={4.4} />
            <Manette x={x + 3.6} y={y + 44.2} w={w - 7.2} h={14.4} />
            <SvgText x={x + 1.8} y={y + 65.2} fontSize={3.9} fill={ENCRE} fontWeight="700">
              {`C${d.calibre ?? ''}`}
            </SvgText>
            <SvgText x={x + w - 1.6} y={y + 64.8} fontSize={1.3} fill={GRIS} textAnchor="end">
              230V~
            </SvgText>
          </Corps>
        </G>
      );
  }
}

/**
 * LE RÉPARTITEUR — d'après la photo du patron : un 4 × 14 départs sous son
 * capot bleu translucide, entre deux embouts gris clair qui le tiennent au
 * rail. On voit les barres de bornes au travers ; l'étiquette blanche porte
 * l'éclair et les sections admises ; la rangée de vis du bas affleure.
 */
function Repartiteur({ d, x, y, w }: { d: DepartExistant; x: number; y: number; w: number }) {
  const bout = 6.5;
  const xi = x + bout;
  const wi = w - 2 * bout;
  const trous = 14;
  const pas = (wi - 4) / (trous - 1);
  const rangee = (yy: number, r: number, opacite: number) =>
    Array.from({ length: trous }, (_, i) => (
      <Circle key={i} cx={xi + 2 + i * pas} cy={yy} r={r} fill="#0D1A3D" opacity={opacite} />
    ));
  return (
    <G testID={`module-${d.id}`}>
      {/* Les embouts gris clair, qui clipsent sur le rail. */}
      {[x, x + w - bout].map((bx) => (
        <G key={bx}>
          <Rect x={bx} y={y + 4} width={bout} height={72} rx={1.4} fill="url(#r9embout)" stroke="#A9A89F" strokeWidth={0.35} />
          <Rect x={bx + 1.2} y={y + 30} width={bout - 2.4} height={4} rx={0.6} fill="#B5B4AB" />
          <Rect x={bx + 1.2} y={y + 46} width={bout - 2.4} height={4} rx={0.6} fill="#B5B4AB" />
        </G>
      ))}
      {/* Le capot bleu, et son reflet. */}
      <Rect x={xi} y={y + 1} width={wi} height={78} rx={1.6} fill="url(#r9bleu)" stroke="#123480" strokeWidth={0.4} />
      <Rect x={xi + 1} y={y + 1.8} width={wi - 2} height={7} rx={1.2} fill="#FFFFFF" opacity={0.18} />
      <Rect x={xi + wi * 0.3} y={y + 1} width={wi * 0.4} height={4} rx={0.8} fill="#4C7BE6" opacity={0.7} />
      {/* Les barres de bornes, au travers du capot. */}
      {rangee(y + 13, 1.7, 0.75)}
      {rangee(y + 21, 1.7, 0.65)}
      {rangee(y + 29, 1.5, 0.45)}
      <Line x1={xi} y1={y + 34.5} x2={xi + wi} y2={y + 34.5} stroke="#123480" strokeWidth={0.5} />
      {/* L'étiquette blanche : l'éclair, l'intensité, les sections admises. */}
      <Rect x={xi + wi * 0.42} y={y + 37} width={wi * 0.55} height={22} rx={0.6} fill="#F5F7FA" opacity={0.95} />
      <Path
        d={`M${xi + wi * 0.5} ${y + 39} l-2 6 h2.2 l-1.6 6 l4.4 -7.6 h-2.4 l1.6 -4.4 z`}
        fill="#1E2226"
      />
      <SvgText x={xi + wi * 0.94} y={y + 41.6} fontSize={2.2} fill={ENCRE} fontWeight="700" textAnchor="end">
        125A
      </SvgText>
      <SvgText x={xi + wi * 0.94} y={y + 44.6} fontSize={1.5} fill={ENCRE} textAnchor="end">
        4 × 14 départs
      </SvgText>
      {['Ø5,3', 'Ø7,5', 'Ø9', 'Ø9'].map((t, i) => (
        <G key={i}>
          <Rect x={xi + wi * (0.44 + i * 0.13)} y={y + 50} width={wi * 0.13} height={7.2} fill="none" stroke="#5B636B" strokeWidth={0.18} />
          <SvgText x={xi + wi * (0.44 + i * 0.13 + 0.065)} y={y + 52.6} fontSize={1.4} fill={ENCRE} textAnchor="middle">
            {t}
          </SvgText>
        </G>
      ))}
      <SvgText x={xi + 3} y={y + 46} fontSize={1.8} fill="#DDE6FA" fontWeight="700">
        L1
      </SvgText>
      <SvgText x={xi + 3} y={y + 52} fontSize={1.8} fill="#DDE6FA" fontWeight="700">
        N
      </SvgText>
      {/* La rangée de vis du bas, qui affleure. */}
      <Line x1={xi} y1={y + 63} x2={xi + wi} y2={y + 63} stroke="#123480" strokeWidth={0.5} />
      {Array.from({ length: trous }, (_, i) => (
        <G key={`v${i}`}>
          <Circle cx={xi + 2 + i * pas} cy={y + 70} r={1.9} fill="#1A3E99" stroke="#0D1A3D" strokeWidth={0.3} />
          <Line x1={xi + 2 + i * pas - 1.1} y1={y + 70} x2={xi + 2 + i * pas + 1.1} y2={y + 70} stroke="#0D1A3D" strokeWidth={0.4} />
          <Line x1={xi + 2 + i * pas} y1={y + 68.9} x2={xi + 2 + i * pas} y2={y + 71.1} stroke="#0D1A3D" strokeWidth={0.4} />
        </G>
      ))}
    </G>
  );
}
