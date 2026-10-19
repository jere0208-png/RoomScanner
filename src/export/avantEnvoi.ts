/**
 * CE QU'IL VAUT MIEUX REGARDER AVANT D'ENVOYER LE DOSSIER — peaufinage
 * EXPORTS.
 *
 * Le dossier partait tel quel : une pièce qui ne se fermait pas sortait avec
 * une surface « ≈ » sur la garde et au métré, une pièce sans nom s'imprimait
 * « Pièce 3 », un dossier d'électricien partait sans tableau, et l'on ne le
 * découvrait qu'en relisant le PDF chez le client. L'écran d'export le dit
 * AVANT, en une ligne par point, avec le geste qui le corrige — sans jamais
 * empêcher d'envoyer.
 *
 * Les constats du plan viennent du diagnostic (`diagnostiquerPlan`) : un seul
 * jugement, celui que l'utilisateur voit déjà dans « Diagnostiquer le plan ».
 */
import { diagnostiquerPlan, type PlanADiagnostiquer } from '../geometry/diagnosticPlan';

export interface PointAvantEnvoi {
  /** Pour la clé de liste et les tests. */
  cle: 'contour' | 'sansNom' | 'client' | 'adresse' | 'tableau';
  titre: string;
  detail: string;
  /** Le geste qui corrige : revenir au plan, ou renseigner le client. */
  geste: 'plan' | 'client';
}

/** Un nom que l'app a donné faute de mieux : « Pièce 3 », ou rien. */
const NOM_PAR_DEFAUT = /^\s*(pi[eè]ce\s*\d*)?\s*$/i;

export function pointsAvantEnvoi(
  plan: Omit<PlanADiagnostiquer, 'fixtures'> & { fixtures?: { kind?: string }[] },
  o: { client: string; adresse: string; particulier: boolean; modeElec: boolean },
): PointAvantEnvoi[] {
  const out: PointAvantEnvoi[] = [];
  if (plan.walls.length === 0) return out;

  const diag = diagnostiquerPlan(plan);
  const ouvertes = diag.pieces.filter((p) => !p.fermee && p.murs > 0);
  if (ouvertes.length > 0) {
    out.push({
      cle: 'contour',
      titre:
        ouvertes.length === 1
          ? `${ouvertes[0].nom} ne se ferme pas`
          : `${ouvertes.length} pièces ne se ferment pas`,
      detail: 'Leur surface sera approchée (≈) sur la garde et au métré. Fermez le contour sur le plan.',
      geste: 'plan',
    });
  }

  const sansNom = plan.rooms.filter((r) => NOM_PAR_DEFAUT.test(r.name ?? ''));
  if (sansNom.length > 0) {
    out.push({
      cle: 'sansNom',
      titre: sansNom.length === 1 ? 'Une pièce n’a pas de nom' : `${sansNom.length} pièces n’ont pas de nom`,
      detail: 'Elles s’imprimeront « Pièce 1 », « Pièce 2 »… Touchez une pièce sur le plan pour la nommer.',
      geste: 'plan',
    });
  }

  if (!o.particulier) {
    if (!o.client.trim()) {
      out.push({
        cle: 'client',
        titre: 'Le client n’est pas renseigné',
        detail: 'Son nom paraît dans le cartouche de chaque feuille.',
        geste: 'client',
      });
    } else if (!o.adresse.trim()) {
      out.push({
        cle: 'adresse',
        titre: 'L’adresse du chantier manque',
        detail: 'Elle paraît dans le cartouche de chaque feuille.',
        geste: 'client',
      });
    }
  }

  if (o.modeElec && (plan.fixtures?.length ?? 0) > 0 && !plan.fixtures!.some((f) => f.kind === 'tableau')) {
    out.push({
      cle: 'tableau',
      titre: 'Aucun tableau électrique sur le plan',
      detail: 'Les gaines partent du tableau : sans lui, le plan des gaines et le métré de câble restent vides.',
      geste: 'plan',
    });
  }
  return out;
}
