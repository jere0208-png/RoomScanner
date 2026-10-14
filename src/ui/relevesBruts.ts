/**
 * LES RELEVÉS BRUTS — ce que RoomPlan a rendu, avant que l'app n'y touche.
 *
 * Relevé du patron : « on doit avoir des cotes fiables ». Les bancs d'essai
 * rejouent des relevés imaginés ; rien ne vaut un relevé réel, accompagné
 * des cotes prises au mètre sur place. Chaque fin de scan garde donc son
 * résultat natif tel quel (murs, ouvertures, meubles, sols, trajet), et le
 * volet « Diagnostic » du profil permet de l'envoyer en fichier.
 *
 * On en garde DIX, les plus récents : quelques dizaines de kilo-octets
 * chacun, rien qui pèse sur le téléphone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScanResult } from 'react-native-room-scan';

export type ModeDuReleve = 'scan' | 'etage' | 'complement';

export interface ReleveBrutResume {
  cle: string;
  quand: number;
  mode: ModeDuReleve;
  murs: number;
  ouvertures: number;
  meubles: number;
}

const INDEX = 'releves-bruts';
const GARDES = 10;

async function lireIndex(): Promise<ReleveBrutResume[]> {
  try {
    const brut = await AsyncStorage.getItem(INDEX);
    const l = brut ? (JSON.parse(brut) as ReleveBrutResume[]) : [];
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

/** Garde le résultat natif d'une fin de scan. Ne lève jamais : c'est un à-côté. */
export async function garderLeReleveBrut(
  result: ScanResult,
  mode: ModeDuReleve,
  quand = Date.now(),
): Promise<ReleveBrutResume | null> {
  try {
    const surfaces = result.surfaces ?? [];
    const resume: ReleveBrutResume = {
      cle: `releve-brut:${quand}`,
      quand,
      mode,
      murs: surfaces.filter((s) => s.type === 'wall').length,
      ouvertures: surfaces.filter((s) => s.type !== 'wall').length,
      meubles: (result.objects ?? []).length,
    };
    await AsyncStorage.setItem(resume.cle, JSON.stringify({ format: 'echoplan-releve-brut', version: 1, quand, mode, releve: result }));
    const index = [resume, ...(await lireIndex()).filter((r) => r.cle !== resume.cle)];
    for (const vieux of index.slice(GARDES)) await AsyncStorage.removeItem(vieux.cle);
    await AsyncStorage.setItem(INDEX, JSON.stringify(index.slice(0, GARDES)));
    return resume;
  } catch {
    return null;
  }
}

/** Les relevés gardés, le plus récent d'abord. */
export const lesRelevesBruts = lireIndex;

/** Le fichier à envoyer : son nom et son contenu, ou `null` s'il a disparu. */
export async function fichierDuReleveBrut(r: ReleveBrutResume): Promise<{ nom: string; contenu: string } | null> {
  try {
    const contenu = await AsyncStorage.getItem(r.cle);
    if (!contenu) return null;
    const d = new Date(r.quand);
    const p = (n: number) => String(n).padStart(2, '0');
    const nom = `releve-brut-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}h${p(d.getMinutes())}.json`;
    return { nom, contenu };
  } catch {
    return null;
  }
}

/** « 14/10 · 18 h 05 · 12 murs, 7 ouvertures, 9 meubles » */
export function phraseDuReleveBrut(r: ReleveBrutResume): string {
  const d = new Date(r.quand);
  const p = (n: number) => String(n).padStart(2, '0');
  const quoi = r.mode === 'etage' ? ' · étage' : r.mode === 'complement' ? ' · passage de plus' : '';
  const n = (v: number, mot: string) => `${v} ${mot}${v > 1 ? 's' : ''}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} · ${d.getHours()} h ${p(d.getMinutes())}${quoi} · ${n(r.murs, 'mur')}, ${n(r.ouvertures, 'ouverture')}, ${n(r.meubles, 'meuble')}`;
}
