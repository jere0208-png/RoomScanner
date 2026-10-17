/**
 * LE PREMIER LANCEMENT — la question, et rien d'autre.
 *
 * PLUS DE TUTORIEL À L'OUVERTURE — demande du patron : « enlève le tuto à
 * la première ouverture de l'app ». Le film (`FilmTutoriel`) ne se joue plus
 * d'office ; il ne reste que la question d'usage, qui règle le mode, et
 * seulement si personne n'y a encore répondu.
 *
 * (Historique : le premier lancement jouait d'abord le film, puis la question.)
 *
 * Relevé du patron : « les tutos de comment ça marche sont mal faits : un
 * tutoriel réaliste, en motion design, fluide et rapide, avec une coupure
 * entre chaque étape et un bouton « Suivant » qui apparaît ». C'est
 * `FilmTutoriel` : cinq chapitres — scanner, le plan, l'aménagement, la 3D,
 * le dossier — qui jouent chacun leur scène, puis attendent qu'on les suive.
 *
 * Le même film se rejoue depuis « Comment ça marche », sur l'accueil.
 */
import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { estSombre, radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { IconeAmenager, IconeElec } from './IconesUsage';
import { haptic } from '../ui/haptic';
import { useUsage } from '../store/usage';
import { useScanStore } from '../store/scanStore';

/*
  LA QUESTION, APRÈS LE FILM — et seulement si personne n'y a répondu.
  Après avoir vu ce que fait l'application, pas avant : demander « êtes-vous
  électricien ? » à qui ne sait pas encore ce qu'il a téléchargé, c'est lui
  faire choisir à l'aveugle. « Passer » reste possible et laisse le grand
  public ; le menu du plan reproposera le mode à qui le cherche.
*/
const CHOIX: { elec: boolean; titre: string; phrase: string }[] = [
  {
    elec: false,
    titre: 'Mesurer et aménager',
    phrase: 'Scanner son logement, voir ses mesures, le meubler. L’image du plan se partage gratuitement.',
  },
  /*
    POUR L'ÉLECTRICIEN, ET POUR QUI PRÉVOIT SON ÉLECTRICITÉ — revues
    « Sophie » et « Paul » : « Je suis électricien » éloignait le particulier
    qui voulait placer ses prises ; il découvrait ensuite qu'il les avait
    cachées dans toute l'app.

    SANS LE NOM DE LA NORME — revue des découvreurs (clair-04) : « NF C
    15-100 » ne dit rien au particulier qui hésite entre les deux cartes ;
    il choisit sur ce qu'il fera, pas sur une référence. La norme reste
    nommée là où l'on s'en sert (le contrôle, le dossier).
  */
  {
    elec: true,
    titre: 'Prévoir l’électricité',
    phrase: 'En plus : placer prises et lumières sur le plan, vérifier que tout est aux normes et chiffrer les travaux.',
  },
];

/** L'ambre de l'électricité : chaude, lisible sur clair comme sur sombre. */
const AMBRE = '#F5A524';

/** Sans capteur : ce qu'on fera, en une ligne. */
export const AVIS_SANS_LIDAR = 'Sans capteur LiDAR ici : vous dessinerez le plan.';

export function PremierLancement({ onFini }: { onFini: () => void }) {
  const c = useTheme();
  const styles = getStyles(c);
  const marges = useSafeAreaInsets();
  const aRepondu = useUsage((u) => u.choisi);
  const choisir = useUsage((u) => u.choisir);
  // Déjà répondu À L'OUVERTURE (réinstallation, compte retrouvé) : rien à
  // montrer. Lu une fois : une réponse donnée ici referme déjà par `repondre`.
  const dejaRepondu = useRef(aRepondu).current;
  useEffect(() => {
    if (dejaRepondu) onFini();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /*
    LE CAPTEUR, DIT DÈS LA PREMIÈRE MINUTE — revue de lisibilité : sur un
    iPhone sans LiDAR, on n'apprenait qu'à l'accueil, devant une tuile
    grisée, que le scan était hors de portée. On le dit ici, sans rien
    bloquer. (L'accueil, dessous, a déjà posé la réponse du téléphone.)

    EN UNE LIGNE — revue des découvreurs : le LiDAR était expliqué trois
    ou quatre fois du lancement à l'accueil. Ici, une ligne ; à l'accueil,
    la tuile éteinte ; nulle part ailleurs.
  */
  const sansLidar = useScanStore((st) => st.supported) === false;
  const sombre = estSombre(c);

  const repondre = (elec: boolean) => {
    haptic('succes');
    choisir(elec);
    onFini();
  };
  /*
    « PASSER » EST UNE RÉPONSE : LE GRAND PUBLIC — relevé « renovation » :
    « Passer » au premier lancement allumait ensuite le mode Électricité.
    Laissée sans réponse, la question ouvrait la porte à `deduireDuPasse` :
    au lancement suivant, le plan d'exemple enregistré (qui porte des
    prises) suffisait à tout passer en électricité, dans le dos de celui qui
    avait justement refusé de choisir. Passer laisse le grand public, et le
    dit au stockage ; le profil rallume le mode à qui le cherche.
  */
  const passer = () => {
    choisir(false);
    onFini();
  };

  if (dejaRepondu) return null;
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={passer}>
      <View style={[styles.fond, { paddingTop: marges.top + 8, paddingBottom: Math.max(marges.bottom, 14) + 6 }]}>
        <View style={styles.barre}>
          <Pressable accessibilityRole="button" accessibilityLabel="Passer la question" hitSlop={12} onPress={passer}>
            <Text style={styles.passer}>Passer</Text>
          </Pressable>
        </View>
        {/*
          LA FICHE DU CHOIX — demande du patron : « une belle fiche moderne au
          début pour le choix si on veut l'élec ou pas, avec des grosses icônes
          animées légèrement, effet 3D léger ». Deux grandes cartes, chacune
          sa scène teintée et son icône en relief (`IconesUsage`), puis ce
          qu'on y fera. Un appui choisit et ferme, comme avant.
        */}
        <ScrollView contentContainerStyle={styles.question}>
          <Text style={styles.surtitre}>BIENVENUE</Text>
          <Text style={styles.questionTitre}>À quoi va vous servir EchoPlan ?</Text>
          <Text style={styles.questionPhrase}>
            Vous pourrez changer d’avis à tout moment, dans votre profil.
          </Text>
          {sansLidar && (
            <View style={styles.avis} testID="avis-lidar-premier">
              <Text style={styles.avisTexte} numberOfLines={1} adjustsFontSizeToFit>
                {AVIS_SANS_LIDAR}
              </Text>
            </View>
          )}
          {CHOIX.map((x) => {
            const teinte = x.elec ? AMBRE : c.blue;
            return (
              <Pressable
                key={x.titre}
                accessibilityRole="button"
                accessibilityLabel={x.titre}
                accessibilityHint={x.phrase}
                style={({ pressed }) => [styles.choix, pressed && styles.choixEnfonce]}
                onPress={() => repondre(x.elec)}>
                <View style={[styles.scene, { backgroundColor: teinte + (sombre ? '26' : '14') }]}>
                  {x.elec ? <IconeElec teinte={teinte} sombre={sombre} /> : <IconeAmenager teinte={teinte} sombre={sombre} />}
                </View>
                <View style={styles.texte}>
                  <View style={styles.ligneTitre}>
                    <Text style={styles.choixTitre}>{x.titre}</Text>
                    <View style={[styles.fleche, { backgroundColor: teinte }]}>
                      <Text style={styles.flecheTexte}>›</Text>
                    </View>
                  </View>
                  <Text style={styles.choixPhrase}>
                    {sansLidar && !x.elec ? x.phrase.replace('Scanner son logement', 'Dessiner son logement') : x.phrase}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 20 },
    barre: { flexDirection: 'row', justifyContent: 'flex-end', minHeight: 32 },
    passer: { color: c.inkSoft, fontSize: 16, fontWeight: '600' },
    question: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 4, paddingBottom: 8 },
    surtitre: {
      color: c.blue,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 1.6,
      textAlign: 'center',
      marginBottom: 8,
    },
    questionTitre: {
      color: c.ink,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '800',
      letterSpacing: -0.9,
      textAlign: 'center',
    },
    questionPhrase: {
      color: c.inkSoft,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 14,
    },
    /* Deux grandes cartes : la scène et son icône en relief, puis ce qu'on y
       fera — on choisit sur ce qu'on fera, pas sur un mot. */
    choix: {
      alignSelf: 'stretch',
      backgroundColor: c.surface,
      borderRadius: 24,
      marginTop: 14,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      ...shadowCard,
      shadowOpacity: 0.08,
    },
    scene: { height: 156, alignItems: 'center', justifyContent: 'center' },
    texte: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16 },
    ligneTitre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fleche: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 10,
    },
    flecheTexte: { color: '#FFFFFF', fontSize: 22, lineHeight: 24, fontWeight: '700', marginLeft: 2 },
    avis: {
      alignSelf: 'stretch',
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 4,
    },
    avisTexte: { color: c.inkSoft, fontSize: 14, lineHeight: 19, textAlign: 'center' },
    choixEnfonce: { opacity: 0.9, transform: [{ scale: 0.97 }] },
    choixTitre: { color: c.ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.3, flexShrink: 1 },
    choixPhrase: { color: c.inkSoft, fontSize: 14.5, lineHeight: 20, marginTop: 5 },
  }),
);
