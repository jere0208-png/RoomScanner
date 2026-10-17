/**
 * « PLAN SUPPRIMÉ — ANNULER » : un glissé se fait aussi par erreur.
 *
 * Supprimer un plan d'un geste du pouce, c'est aussi pouvoir le faire sans
 * le vouloir, en faisant défiler la liste. La suppression ATTEND donc
 * quelques secondes : la ligne disparaît tout de suite — le geste a pris —,
 * le bandeau propose de revenir dessus, et c'est seulement à son départ que
 * le plan, ses photos et son modèle 3D s'en vont pour de bon. Quitter l'écran
 * entre-temps confirme : on ne garde pas sous le coude une suppression
 * qu'on a déjà vue se faire.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { dark, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';
import { annoncer, useLecteurDEcran } from '../ui/annoncer';

/** Le temps de se raviser. */
export const DELAI_ANNULER = 4500;
/**
 * LE TEMPS DE SE RAVISER, AVEC VOICEOVER — revue d'accessibilité.
 *
 * Quatre secondes et demie suffisent à un pouce : le bandeau est sous les
 * yeux, « Annuler » à portée. Avec la synthèse vocale, il faut d'abord
 * entendre le bandeau, puis y amener le curseur, puis activer : c'était
 * pratiquement impossible dans le temps. Le délai passe à douze secondes
 * quand VoiceOver est actif, et le curseur est posé sur « Annuler ». Sans
 * VoiceOver, rien ne change.
 */
export const DELAI_ANNULER_LECTEUR = 12000;

/**
 * La suppression qui attend. `masque` est l'identifiant à cacher dès
 * maintenant ; `jeter` lance l'attente (et confirme celle d'avant) ;
 * `annuler` la défait.
 */
export function useSuppressionDifferee(supprimer: (id: string) => void) {
  const [enAttente, setEnAttente] = useState<{ id: string; nom: string } | null>(null);
  const courant = useRef<{ id: string; nom: string } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const faire = useRef(supprimer);
  faire.current = supprimer;
  // Suivi pour que la décision, à l'instant du geste, lise le bon état.
  const lecteur = useLecteurDEcran();
  const lecteurRef = useRef(lecteur);
  lecteurRef.current = lecteur;

  const confirmer = useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    const parti = courant.current;
    courant.current = null;
    if (parti) faire.current(parti.id);
  }, []);

  const jeter = useCallback(
    (id: string, nom: string) => {
      // Une seconde suppression confirme la première : un seul bandeau à la fois.
      confirmer();
      haptic('leger');
      courant.current = { id, nom };
      setEnAttente({ id, nom });
      minuteur.current = setTimeout(() => {
        confirmer();
        setEnAttente(null);
      }, lecteurRef.current ? DELAI_ANNULER_LECTEUR : DELAI_ANNULER);
    },
    [confirmer],
  );

  const annuler = useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    courant.current = null;
    setEnAttente(null);
  }, []);

  // Quitter l'écran confirme ce qui attendait.
  useEffect(() => () => confirmer(), [confirmer]);

  return { masque: enAttente?.id ?? null, enAttente, jeter, annuler };
}

export function BandeauAnnuler({
  texte,
  bas,
  onAnnuler,
}: {
  texte: string;
  /** Distance au bas de l'écran, marge de sécurité comprise. */
  bas: number;
  onAnnuler: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const bouton = useRef<View>(null);
  const lecteur = useLecteurDEcran();
  /*
    LE BANDEAU SE DIT, ET LE CURSEUR VA SUR « ANNULER ».

    Il apparaissait en silence : VoiceOver restait sur la ligne qui venait
    de partir. L'annonce dit ce qui s'est passé et qu'on peut revenir
    dessus ; le curseur posé sur le bouton évite d'aller le chercher. Rien
    ne bouge pour qui n'a pas VoiceOver (l'annonce est alors sans effet).
  */
  useEffect(() => {
    annoncer(`${texte}. Annuler disponible.`);
    if (!lecteur) return;
    // Laisser l'annonce partir avant de déplacer le curseur.
    const t = setTimeout(() => {
      try {
        if (bouton.current) AccessibilityInfo.sendAccessibilityEvent(bouton.current, 'focus');
      } catch {
        // Sans curseur, le bouton reste trouvable par balayage.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [texte, lecteur]);
  return (
    <View style={[s.bandeau, { bottom: bas }]} pointerEvents="box-none">
      <View style={s.pilule}>
        <Text style={s.mot} numberOfLines={1}>
          {texte}
        </Text>
        <Pressable
          ref={bouton}
          accessibilityRole="button"
          accessibilityLabel="Annuler la suppression"
          hitSlop={10}
          onPress={onAnnuler}>
          <Text style={s.annuler}>Annuler</Text>
        </Pressable>
      </View>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    bandeau: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
    pilule: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 18,
      maxWidth: '88%',
      backgroundColor: c === dark ? '#2A303B' : '#1C2028',
      borderRadius: 999,
      paddingVertical: 12,
      paddingHorizontal: 20,
    },
    mot: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '500', flexShrink: 1 },
    annuler: { color: '#7FA6FF', fontSize: 14.5, fontWeight: '700' },
  }),
);
