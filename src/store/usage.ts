/**
 * LE MODE D'USAGE — l'application grand public, et l'atelier d'électricien
 * derrière un interrupteur.
 *
 * Relevé du patron : « elle doit être suggérée à un public large sur l'App
 * Store et non seulement aux électriciens. Mais j'ai édité l'application pour
 * qu'elle me serve à moi aussi, en tant qu'électricien. Sauf que c'est trop
 * axé électricité et pas très intuitif pour ceux qui n'y comprennent rien. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE PRÉFÉRENCE DE L'APPAREIL, PAS DU PLAN.
 *
 * On aurait pu la ranger dans chaque relevé — « ce plan est un plan
 * d'électricien ». Ce serait faux : c'est la PERSONNE qui est électricienne,
 * pas le salon. Un électricien ouvre aussi le plan de sa propre cuisine, et
 * il veut ses outils ; un particulier qui reçoit un plan équipé d'un artisan
 * ne doit pas voir l'application changer de visage.
 *
 * ELLE MASQUE, ELLE N'EFFACE PAS. Les prises, les gaines, le plafond équipé
 * restent dans le relevé : on les retrouve en rallumant le mode. Un
 * interrupteur qui effacerait le travail d'un chantier ne serait pas un
 * interrupteur.
 *
 * TROIS ÉTATS, ET LE TROISIÈME COMPTE. Grand public, électricité — et « pas
 * encore répondu ». C'est ce dernier qui permet au premier lancement de poser
 * la question une fois, et à la déduction de ne jamais écraser une réponse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE STOCKAGE SE CHARGE À LA DEMANDE, et c'est voulu : les bancs démarrent en
 * mode Électricité (ils décrivent l'atelier tel qu'il a été construit — voir
 * `jest.setup.js`), et le setup qui l'allume tourne AVANT que chaque banc
 * n'ait posé son propre doublet du disque. Importé en tête de module, le
 * stockage natif se serait chargé trop tôt, sans doublet, et aurait fait
 * tomber la suite entière.
 */
import { create } from 'zustand';

/** Où la préférence dort entre deux lancements. */
export const CLE_USAGE = 'echoplan.usage.v1';

/** Le stockage du téléphone, pris au moment où l'on s'en sert. */
function disque(): {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
}

interface Etat {
  /** Le disque a-t-il répondu ? Avant, on ne décide rien qui en dépende. */
  charge: boolean;
  /** Le mode Électricité est-il allumé ? */
  modeElec: boolean;
  /** L'utilisateur a-t-il répondu, ou l'a-t-on déduit de ses plans ? */
  choisi: boolean;
  charger: () => Promise<void>;
  /** La réponse de l'utilisateur — ou du réglage du profil. */
  choisir: (modeElec: boolean) => void;
  /**
   * LA DÉDUCTION, POUR CEUX QUI ÉTAIENT LÀ AVANT.
   *
   * Le patron a des dizaines de plans équipés : le jour de la mise à jour,
   * lui demander « êtes-vous électricien ? » serait une question idiote, et
   * lui retirer ses prises jusqu'à ce qu'il trouve le réglage, une
   * régression. Si sa bibliothèque porte des appareils, le mode s'allume
   * tout seul.
   *
   * Elle ne fait RIEN si une réponse existe déjà — quelqu'un qui a choisi le
   * grand public puis reçu le plan d'un collègue électricien ne doit pas voir
   * l'application changer dans son dos.
   */
  deduireDuPasse: (
    plans: { fixtures?: unknown[]; ceiling?: unknown[] }[],
  ) => void;
}

function ecrire(modeElec: boolean): void {
  try {
    disque()
      .setItem(CLE_USAGE, JSON.stringify({ modeElec }))
      .catch(() => {});
  } catch {
    // Pas de disque : la préférence vit le temps de la session, c'est tout.
  }
}

export const useUsage = create<Etat>((set, get) => ({
  charge: false,
  modeElec: false,
  choisi: false,

  charger: async () => {
    let brut: string | null = null;
    try {
      brut = await disque().getItem(CLE_USAGE);
    } catch {
      brut = null;
    }
    let lu: { modeElec?: unknown } | null = null;
    try {
      lu = brut ? JSON.parse(brut) : null;
    } catch {
      // Un disque illisible ne casse rien : on repart du grand public, et le
      // premier lancement reposera la question.
      lu = null;
    }
    if (lu && typeof lu.modeElec === 'boolean') {
      set({ charge: true, modeElec: lu.modeElec, choisi: true });
    } else {
      set({ charge: true });
    }
  },

  choisir: (modeElec) => {
    set({ modeElec, choisi: true });
    ecrire(modeElec);
  },

  deduireDuPasse: (plans) => {
    if (get().choisi) return;
    const equipe = plans.some(
      (p) => (p.fixtures?.length ?? 0) > 0 || (p.ceiling?.length ?? 0) > 0,
    );
    if (equipe) get().choisir(true);
  },
}));

/** Le mode Électricité est-il allumé ? Le seul accès que les vues emploient. */
export const useModeElec = (): boolean => useUsage((s) => s.modeElec);
