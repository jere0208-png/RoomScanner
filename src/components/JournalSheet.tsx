/**
 * LE JOURNAL DES PANNES, EN CLAIR — la page qu'on ouvre APRÈS le plantage.
 *
 * Relevé du patron : « l'app a quitté plusieurs fois après des clics sur des
 * meubles. Fais en sorte qu'on ait un diagnostic d'erreurs. »
 *
 * Le garde-fou attrape la panne et l'écrit ; ce volet la RELIT. Les deux sont
 * nécessaires et ne servent pas au même moment : l'écran de secours parle à
 * celui qui vient de tomber, ce volet parle à celui qui revient deux jours
 * plus tard avec le téléphone du chantier et cherche à comprendre.
 *
 * IL VIT DANS LE PROFIL, sous « Données et compte ». Ce n'est pas un réglage
 * et ça n'a rien à faire dans un écran de travail : on ne va le chercher que
 * quand quelque chose s'est mal passé, et c'est là qu'on va chercher.
 *
 * LE TEXTE EST SÉLECTIONNABLE, et c'est tout l'objet du volet. Un diagnostic
 * qu'on ne peut pas recopier ne sort pas du téléphone : il faut pouvoir le
 * garder, l'envoyer, le coller dans un message.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SheetShell } from './Sheet';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import { datePanne, usePannes } from '../ui/journalPannes';

export function JournalSheet({
  visible,
  fermer,
}: {
  visible: boolean;
  fermer: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const incidents = usePannes((x) => x.incidents);
  const vider = usePannes((x) => x.vider);

  return (
    <SheetShell visible={visible} onClose={fermer}>
      <>
      <Text style={s.titre}>Diagnostic</Text>
      <Text style={s.sous}>
        {incidents.length === 0
          ? 'Rien à signaler : l’application ne s’est pas arrêtée toute seule depuis son installation.'
          : `Les ${incidents.length} derniers arrêts inattendus, le plus récent en premier.`}
      </Text>
      {incidents.length > 0 && (
        <>
          <ScrollView style={s.liste}>
            {incidents.map((p) => (
              <View key={`${p.quand}-${p.message}`} style={s.bloc}>
                <Text style={s.entete}>
                  {`${datePanne(p.quand)} · ${p.ecran}${
                    p.fatale ? ' · arrêt' : ''
                  }`}
                </Text>
                <Text style={s.message} selectable>
                  {p.message}
                </Text>
                {!!p.pile && (
                  <Text style={s.pile} selectable numberOfLines={8}>
                    {p.pile}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Effacer le diagnostic"
            style={s.vider}
            onPress={vider}>
            <Text style={s.viderMot}>Effacer le diagnostic</Text>
          </Pressable>
        </>
      )}
      </>
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    titre: { color: c.ink, fontSize: 18, fontWeight: '800', paddingRight: 40 },
    sous: {
      color: c.inkSoft,
      fontSize: 13.5,
      lineHeight: 19,
      marginTop: 6,
      marginBottom: 10,
    },
    liste: { maxHeight: 380, marginTop: 4 },
    bloc: {
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.md,
      padding: 12,
      marginBottom: 8,
    },
    entete: {
      color: c.inkFaint,
      fontSize: 11.5,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    message: { color: c.ink, fontSize: 13.5, lineHeight: 18, marginTop: 4 },
    /* La pile en petit : elle sert à la recopier, pas à la lire. */
    pile: { color: c.inkFaint, fontSize: 10.5, lineHeight: 14, marginTop: 6 },
    vider: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
    viderMot: { color: c.danger, fontSize: 14.5, fontWeight: '700' },
  }),
);
