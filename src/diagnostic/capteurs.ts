/**
 * LES CAPTEURS DU MODE DIAGNOSTIC — branchés quand le mode tourne, débranchés
 * sinon, et JAMAIS un octet de coût quand il dort.
 *
 * Ils remplissent le journal (voir `journal.ts`) de ce que l'app vit : l'écran
 * qu'on regarde, le plan qui bouge, une alerte posée, un avertissement, une
 * erreur. Le natif, lui, tient la vidéo et les touchers.
 *
 * DEUX RÈGLES QUI NE SE DISCUTENT PAS.
 *
 * 1. NI JETON NI E-MAIL. Relevé du patron : le diagnostic sert à corriger, pas
 *    à ficher. `valeurSure` masque toute adresse et tout jeton, tronque le
 *    reste, et ne recopie jamais un objet entier. Un plan qui change se note
 *    par le NOM de ses clés et la LONGUEUR de ses tableaux, pas par son
 *    contenu.
 * 2. TOUT SE DÉFAIT. `brancher` garde de quoi `debrancher` : les abonnements
 *    se coupent, les consoles enveloppées retrouvent leur original, le
 *    gestionnaire d'erreurs reprend sa chaîne. Un capteur qui survivrait à
 *    l'arrêt serait une fuite.
 */
import { useScanStore } from '../store/scanStore';
import { useUsage } from '../store/usage';
import { useAlerte, type DonneesAlerte } from '../ui/alerte';
import { useAstuce, type DonneesAstuce } from '../ui/astuce';
import { noter } from './journal';

/** Une chaîne qui ressemble à une adresse e-mail. */
const RE_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * UNE VALEUR QU'ON PEUT JOURNALISER SANS REGRET.
 *
 * Adresse e-mail ou jeton : masqués. Tableau : sa longueur, pas son contenu.
 * Objet : juste un marqueur. Chaîne : tronquée. Le reste (nombre, booléen)
 * passe tel quel — il ne porte rien de personnel.
 */
export function valeurSure(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'string') {
    if (RE_EMAIL.test(v)) return '[e-mail masqué]';
    // Un jeton est une longue chaîne sans espace : on ne prend pas le risque.
    if (v.length >= 32 && !/\s/.test(v)) return '[masqué]';
    return v.length > 40 ? v.slice(0, 40) + '…' : v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return { longueur: v.length };
  return '[objet]';
}

/** Les clés du plan qu'on surveille : si l'une change, on le note. */
const CLES_PLAN = [
  'walls',
  'openings',
  'objects',
  'rooms',
  'fixtures',
  'ceiling',
  'scanName',
  'dirty',
] as const;

let branche = false;
let desaboScan: (() => void) | null = null;
let desaboUsage: (() => void) | null = null;
let poserAlerteOriginal: ((a: DonneesAlerte) => void) | null = null;
let poserAstuceOriginal: ((a: DonneesAstuce) => void) | null = null;
let warnOriginal: typeof console.warn | null = null;
let errorOriginal: typeof console.error | null = null;
let erreurGlobaleOriginale:
  | ((e: unknown, fatal?: boolean) => void)
  | null = null;

type AvecErrorUtils = {
  ErrorUtils?: {
    getGlobalHandler?: () => (e: unknown, fatal?: boolean) => void;
    setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void;
  };
};

/** Branche tous les capteurs. Idempotent : un double appel ne double rien. */
export function brancher(): void {
  if (branche) return;
  branche = true;

  // L'écran de départ, pour savoir d'où l'on part.
  noter('ecran', { ecran: useScanStore.getState().screen });

  // LE PLAN ET L'ÉCRAN — ce qui change entre deux états du magasin de scan.
  let avant = useScanStore.getState();
  desaboScan = useScanStore.subscribe((st) => {
    if (st.screen !== avant.screen) {
      noter('ecran', { ecran: st.screen });
    }
    const change: Record<string, unknown> = {};
    for (const cle of CLES_PLAN) {
      if (st[cle] !== avant[cle]) {
        const v = st[cle];
        change[cle] = Array.isArray(v) ? v.length : valeurSure(v);
      }
    }
    if (Object.keys(change).length) {
      noter('plan', change);
    }
    avant = st;
  });

  // LE MODE ÉLECTRICITÉ — il change ce que montrent la plupart des écrans.
  let modeAvant = useUsage.getState().modeElec;
  desaboUsage = useUsage.subscribe((u) => {
    if (u.modeElec !== modeAvant) {
      modeAvant = u.modeElec;
      noter('usage', { modeElec: u.modeElec });
    }
  });

  // LES ALERTES POSÉES — on enveloppe `poser`, puis on appelle l'original.
  poserAlerteOriginal = useAlerte.getState().poser;
  const poserAlerte = poserAlerteOriginal;
  useAlerte.setState({
    poser: (a: DonneesAlerte) => {
      noter('alerte', { titre: valeurSure(a.titre) });
      poserAlerte(a);
    },
  });

  // LES ASTUCES — même geste, c'est le fil de ce qu'on a dit à l'écran.
  poserAstuceOriginal = useAstuce.getState().poser;
  const poserAstuce = poserAstuceOriginal;
  useAstuce.setState({
    poser: (a: DonneesAstuce) => {
      noter('astuce', { texte: valeurSure(a.texte) });
      poserAstuce(a);
    },
  });

  // CONSOLE.WARN / CONSOLE.ERROR — enveloppés, puis l'original.
  warnOriginal = console.warn;
  const warn = warnOriginal;
  console.warn = (...args: unknown[]) => {
    noter('avert', { texte: valeurSure(args.map(String).join(' ')) });
    warn(...(args as []));
  };
  errorOriginal = console.error;
  const error = errorOriginal;
  console.error = (...args: unknown[]) => {
    noter('erreur', { texte: valeurSure(args.map(String).join(' ')) });
    error(...(args as []));
  };

  // LES ERREURS JS GLOBALES — en CHAÎNANT l'ancien gestionnaire : on note,
  // puis on laisse le garde-fou faire son travail (voir `GardeFou`).
  const g = globalThis as AvecErrorUtils;
  if (g.ErrorUtils?.getGlobalHandler && g.ErrorUtils.setGlobalHandler) {
    erreurGlobaleOriginale = g.ErrorUtils.getGlobalHandler();
    const precedent = erreurGlobaleOriginale;
    g.ErrorUtils.setGlobalHandler((e: unknown, fatal?: boolean) => {
      noter('plantage', {
        message: valeurSure((e as Error)?.message ?? String(e)),
        fatal: !!fatal,
      });
      precedent?.(e, fatal);
    });
  }
}

/** Débranche tout, et rend son original à chaque chose enveloppée. */
export function debrancher(): void {
  if (!branche) return;
  branche = false;

  desaboScan?.();
  desaboScan = null;
  desaboUsage?.();
  desaboUsage = null;

  if (poserAlerteOriginal) {
    useAlerte.setState({ poser: poserAlerteOriginal });
    poserAlerteOriginal = null;
  }
  if (poserAstuceOriginal) {
    useAstuce.setState({ poser: poserAstuceOriginal });
    poserAstuceOriginal = null;
  }
  if (warnOriginal) {
    console.warn = warnOriginal;
    warnOriginal = null;
  }
  if (errorOriginal) {
    console.error = errorOriginal;
    errorOriginal = null;
  }
  const g = globalThis as AvecErrorUtils;
  if (erreurGlobaleOriginale && g.ErrorUtils?.setGlobalHandler) {
    g.ErrorUtils.setGlobalHandler(erreurGlobaleOriginale);
  }
  erreurGlobaleOriginale = null;
}

/** Pour le banc : le mode est-il branché ? */
export function estBranche(): boolean {
  return branche;
}
