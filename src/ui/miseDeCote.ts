/**
 * LE TRAVAIL NON ENREGISTRÉ SE RANGE EN PARTANT — sans rien demander.
 *
 * Relevé du patron : « lorsqu'on quitte un plan pas enregistré, on ne doit
 * plus voir le message pop-up qui embête ». La fenêtre « Modifications non
 * enregistrées » posait une question à chaque sortie ; on la balayait sans
 * la lire, et le jour où elle comptait, on la balayait aussi.
 *
 * Plus de question, donc, mais plus de perte non plus — `mettreDeCote` (voir
 * `scanStore`) range ce qu'il y a à ranger :
 *
 *   — UN PLAN NEUF, jamais enregistré, entre dans la liste des plans avec son
 *     compte à rebours, « Autosuppression dans 11 h 52 ». Douze heures pour
 *     l'enregistrer d'un appui ; ensuite il s'en va seul. C'est tout : la
 *     liste le dit, rien d'autre ne le répète ;
 *
 *   — LES MODIFICATIONS D'UN PLAN ENREGISTRÉ sont gardées à côté de lui. Une
 *     pastille passe en bas de l'écran — elle ne prend pas le doigt, ne
 *     bloque rien — avec de quoi les enregistrer sur-le-champ ; et la ligne
 *     du plan porte un rappel ambré tant qu'elles attendent.
 *
 * Un seul endroit pour les trois sorties (la flèche de retour, « Nouveau
 * scan », un autre plan ouvert depuis la bibliothèque) : une sortie qui
 * naîtrait demain n'aurait qu'à l'appeler.
 */
import { useEffect, useState } from 'react';
import { useScanStore, type SavedScan } from '../store/scanStore';
import { astuce } from './astuce';

const deux = (n: number) => String(n).padStart(2, '0');

/** « 11 h 05 », « 38 min », « moins d'une minute ». */
export function delaiRestant(jusqua: number, maintenant = Date.now()): string {
  const min = Math.floor((jusqua - maintenant) / 60000);
  if (min < 1) return 'moins d’une minute';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${deux(min % 60)}`;
}

/** Ce qu'une ligne de plan dit de son attente — ou rien. */
export function etatDAttente(
  scan: SavedScan,
  maintenant = Date.now(),
): { sorte: 'nouveau' | 'retouche'; texte: string } | null {
  if (scan.supprimeLe) {
    return {
      sorte: 'nouveau',
      texte: `Non enregistré · autosuppression dans ${delaiRestant(scan.supprimeLe, maintenant)}`,
    };
  }
  if (scan.retouche) {
    return {
      sorte: 'retouche',
      texte: `Modifications non enregistrées · perdues dans ${delaiRestant(scan.retouche.jusqua, maintenant)}`,
    };
  }
  return null;
}

/**
 * L'HEURE QUI AVANCE, pour les comptes à rebours — et le ménage qui va avec.
 *
 * Une fois par minute : c'est la finesse du compte à rebours affiché, et ce
 * qui a passé son échéance quitte la liste au même rythme, sous les yeux.
 */
export function useMaintenant(pas = 60000): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const tic = () => {
      setMaintenant(Date.now());
      useScanStore.getState().purgerLesEchus();
    };
    tic();
    const id = setInterval(tic, pas);
    return () => clearInterval(id);
  }, [pas]);
  return maintenant;
}

/** Range le travail de l'écran, et le dit quand il faut le dire. */
export function rangerLeTravail(): void {
  const st = useScanStore.getState();
  const id = st.currentSaveId;
  const sorte = st.mettreDeCote();
  if (sorte !== 'retouche' || !id) return;
  astuce('Modifications gardées 12 h : enregistrez-les pour ne pas les perdre.', {
    icone: 'save',
    action: {
      label: 'Enregistrer',
      faire: () => useScanStore.getState().enregistrerRetouche(id),
    },
  });
}
