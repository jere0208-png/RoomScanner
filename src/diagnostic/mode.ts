/**
 * LE RÉGLAGE DU MODE DIAGNOSTIC — un interrupteur, gardé sur l'appareil.
 *
 * Il ne vit QUE chez l'administrateur : la section qui le montre ne paraît
 * dans le profil que si le compte est `admin` (voir `ProfilScreen`), et App
 * ne démarre la surveillance que si `admin ET actif`. Le réglage lui-même est
 * une préférence d'APPAREIL, comme le thème ou le mode électricité : il tient
 * dans AsyncStorage, pas dans le compte.
 *
 * COUPÉ DÈS QU'ON N'EST PLUS ADMINISTRATEUR. Si le serveur retire l'admin
 * (compte changé, liste mise à jour), App appelle `regler(false)` : le
 * réglage retombe, et ne se rallume pas tout seul au prochain lancement.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLE = 'echoplan.diagnostic.v1';

interface EtatModeDiag {
  /** Le réglage a-t-il été lu du disque ? */
  charge: boolean;
  /** L'administrateur a-t-il allumé le mode diagnostic ? */
  actif: boolean;
  charger: () => Promise<void>;
  regler: (actif: boolean) => void;
}

export const useModeDiagnostic = create<EtatModeDiag>((set) => ({
  charge: false,
  actif: false,
  charger: async () => {
    let actif = false;
    try {
      actif = (await AsyncStorage.getItem(CLE)) === '1';
    } catch {
      // Un stockage illisible vaut « éteint » : le mode ne s'allume jamais
      // par accident.
    }
    set({ charge: true, actif });
  },
  regler: (actif) => {
    set({ actif });
    AsyncStorage.setItem(CLE, actif ? '1' : '0').catch(() => {});
  },
}));
