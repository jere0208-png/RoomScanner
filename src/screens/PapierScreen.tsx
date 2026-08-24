/**
 * SCANNER UN PLAN PAPIER — l'écran.
 *
 * Trois moments, et pas un de plus : on donne une photo, on attend, on
 * regarde ce qui a été compris. Tout le travail est ailleurs (`src/papier/`)
 * ; ici on ne fait que le rendre lisible, et surtout HONNÊTE.
 *
 * CE QUI EST DIT AVANT D'OUVRIR LE PLAN. Un relevé lu sur un dessin n'a pas
 * le statut d'un relevé fait au LiDAR : l'échelle peut être estimée, un
 * symbole peut n'avoir pas été reconnu, un mur peut manquer. L'écran affiche
 * donc, en clair, D'OÙ VIENT L'ÉCHELLE et ce dont le lecteur doute — avant
 * le bouton qui ouvre le plan, jamais après. On commande la gaine sur ces
 * cotes-là.
 *
 * ET SI L'ÉCHELLE EST ESTIMÉE, ON PROPOSE DE LA DONNER. Une cote connue —
 * la longueur du plus grand mur — suffit à recaler tout le plan, sans rien
 * relire : c'est le geste que fait n'importe quel dessinateur devant un plan
 * sans cartouche.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChevron } from '../components/BackChevron';
import { GlowButton } from '../components/GlowButton';
import { ScanGlyph } from '../components/ScanGlyph';
import { useScanStore } from '../store/scanStore';
import { radius, shadowCard, useTheme, type Palette } from '../theme';
import { echelleALaMain } from '../papier/echelle';
import { lirePlanPapier, nommerLesPieces, type PlanLu } from '../papier/lecture';
import type { PhotoDePlan } from '../papier/entree';
import { choisirPlan, disponible } from '../ui/planPapier';
import { haptic } from '../ui/haptic';

type Etat =
  | { pas: 'attente' }
  | { pas: 'lecture' }
  | { pas: 'resultat'; photo: PhotoDePlan; plan: PlanLu }
  | { pas: 'vide'; raison: string };

/** Ce que le lecteur a compris, en une ligne par nature. */
function bilan(plan: PlanLu) {
  const surfaces = plan.resultat.surfaces ?? [];
  const murs = surfaces.filter((s) => s.type === 'wall').length;
  const portes = surfaces.filter((s) => s.type === 'door').length;
  const fenetres = surfaces.filter((s) => s.type === 'window').length;
  const baies = surfaces.filter((s) => s.type === 'opening').length;
  const appareils = (plan.resultat.elec ?? []).length;
  return [
    { quoi: 'Murs', combien: murs },
    { quoi: 'Portes', combien: portes },
    { quoi: 'Fenêtres', combien: fenetres },
    { quoi: 'Baies', combien: baies },
    { quoi: 'Appareils', combien: appareils },
    { quoi: 'À qualifier', combien: plan.reperes.length },
  ].filter((l) => l.combien > 0);
}

export function PapierScreen() {
  const setScreen = useScanStore((s) => s.setScreen);
  const finalize = useScanStore((s) => s.finalize);
  const setRoomName = useScanStore((s) => s.setRoomName);
  const c = useTheme();
  const s = themed(c);
  const insets = useSafeAreaInsets();
  const [etat, setEtat] = useState<Etat>({ pas: 'attente' });
  const [cote, setCote] = useState('');

  const lire = useCallback((photo: PhotoDePlan) => {
    setEtat({ pas: 'lecture' });
    /*
      LA LECTURE BLOQUE LE FIL JS — plusieurs secondes sur une grande photo.
      On la lance après une image, sinon l'écran d'attente ne s'afficherait
      jamais : React n'aurait pas eu le temps de peindre. C'est aussi pour
      ce moment-là que l'icône de scan est animée EN NATIF : elle continue
      de balayer pendant que le fil JS mouline.
    */
    setTimeout(() => {
      try {
        const plan = lirePlanPapier(photo);
        setEtat(
          plan.vu.murs.length
            ? { pas: 'resultat', photo, plan }
            : {
                pas: 'vide',
                raison:
                  'Aucun mur reconnu sur cette image. Cadrez le plan seul, ' +
                  'bien à plat et bien éclairé.',
              },
        );
      } catch {
        setEtat({ pas: 'vide', raison: 'Cette image n’a pas pu être lue.' });
      }
    }, 60);
  }, []);

  const demander = useCallback(
    async (source: 'camera' | 'galerie') => {
      haptic('leger');
      if (!disponible()) {
        setEtat({
          pas: 'vide',
          raison:
            'La lecture d’un plan papier demande la dernière version de ' +
            'l’application : recompilez-la pour l’activer.',
        });
        return;
      }
      const photo = await choisirPlan(source);
      if (photo) lire(photo);
    },
    [lire],
  );

  /** Recale tout le plan sur une longueur connue, sans rien relire. */
  const recaler = useCallback(() => {
    if (etat.pas !== 'resultat') return;
    const metres = Number(cote.replace(',', '.'));
    const plusLong = Math.max(0, ...etat.plan.vu.murs.map((m) => m.len));
    const echelle = echelleALaMain(plusLong, metres);
    if (!echelle) return;
    haptic('leger');
    setEtat({
      pas: 'resultat',
      photo: etat.photo,
      plan: lirePlanPapier(etat.photo, { echelle }),
    });
  }, [cote, etat]);

  const ouvrir = useCallback(() => {
    if (etat.pas !== 'resultat') return;
    haptic('succes');
    finalize(etat.plan.resultat);
    // Les noms écrits sur le plan valent mieux que ceux qu'on déduirait du
    // mobilier : ils viennent de celui qui a dessiné.
    const apres = useScanStore.getState();
    for (const { roomId, nom } of nommerLesPieces(
      etat.plan.etiquettes,
      apres.rooms,
      apres.walls,
    )) {
      setRoomName(roomId, nom);
    }
    setScreen('result');
  }, [etat, finalize, setRoomName, setScreen]);

  return (
    <View style={s.fond}>
      <View style={[s.barre, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={s.rondBarre}
          hitSlop={10}
          onPress={() => setScreen('home')}>
          <BackChevron color={c.ink} />
        </Pressable>
        <Text style={s.titreBarre}>Plan papier</Text>
        <View style={s.videBarre} />
      </View>

      <ScrollView
        contentContainerStyle={[s.contenu, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>
        <View style={s.glyphe}>
          <ScanGlyph taille={104} anime={etat.pas !== 'resultat'} teinte={c.blue} />
        </View>

        {etat.pas === 'lecture' && (
          <View style={s.bloc}>
            <Text style={s.blocTitre}>Lecture du plan…</Text>
            <Text style={s.blocTexte}>
              On cherche les murs, les menuiseries, les symboles, puis les
              cotes écrites qui donnent l’échelle.
            </Text>
            <ActivityIndicator color={c.blue} style={s.attente} />
          </View>
        )}

        {etat.pas === 'attente' && (
          <>
            <Text style={s.chapeau}>
              Photographiez un plan à plat, cadré seul, bien éclairé. On en
              tire les murs à leurs cotes, les portes et les fenêtres, et les
              symboles électriques qu’il porte.
            </Text>
            <GlowButton
              label="Photographier le plan"
              accessibilityLabel="Photographier le plan"
              onPress={() => demander('camera')}
            />
            <View style={s.second}>
              <GlowButton
                label="Choisir une image"
                variant="ghost"
                onPress={() => demander('galerie')}
              />
            </View>
          </>
        )}

        {etat.pas === 'vide' && (
          <>
            <View style={s.bloc}>
              <Text style={s.blocTitre}>Rien à lire</Text>
              <Text style={s.blocTexte}>{etat.raison}</Text>
            </View>
            <GlowButton
              label="Reprendre une photo"
              onPress={() => setEtat({ pas: 'attente' })}
            />
          </>
        )}

        {etat.pas === 'resultat' && (
          <>
            <View style={s.bloc}>
              <Text style={s.blocTitre}>Échelle</Text>
              <Text style={s.blocTexte}>
                {etat.plan.echelle
                  ? `${etat.plan.echelle.detail}.`
                  : 'Introuvable : donnez une cote connue ci-dessous.'}
              </Text>
            </View>

            <View style={s.bloc}>
              {bilan(etat.plan).map((l) => (
                <View key={l.quoi} style={s.ligne}>
                  <Text style={s.ligneQuoi}>{l.quoi}</Text>
                  <Text style={s.ligneCombien}>{l.combien}</Text>
                </View>
              ))}
            </View>

            {etat.plan.avertissements.map((a) => (
              <View key={a} style={[s.bloc, s.blocDoute]}>
                <Text style={s.blocTexte}>{a}</Text>
              </View>
            ))}

            {etat.plan.echelle?.origine !== 'cotes' && (
              <View style={s.bloc}>
                <Text style={s.blocTitre}>Donner une cote</Text>
                <Text style={s.blocTexte}>
                  Longueur du plus grand mur du plan, en mètres. Tout le
                  relevé se recale dessus.
                </Text>
                <View style={s.saisieRangee}>
                  <TextInput
                    style={s.saisie}
                    value={cote}
                    onChangeText={setCote}
                    keyboardType="decimal-pad"
                    placeholder="8,25"
                    placeholderTextColor={c.inkFaint}
                    accessibilityLabel="Longueur du plus grand mur en mètres"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Recaler le plan"
                    style={s.recaler}
                    onPress={recaler}>
                    <Text style={s.recalerTexte}>Recaler</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <GlowButton label="Ouvrir le plan" onPress={ouvrir} />
            <View style={s.second}>
              <GlowButton
                label="Reprendre une photo"
                variant="ghost"
                onPress={() => setEtat({ pas: 'attente' })}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const themed = (c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    barre: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    rondBarre: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.07,
    },
    titreBarre: { color: c.ink, fontSize: 17, fontWeight: '700' },
    videBarre: { width: 40, height: 40 },
    contenu: { paddingHorizontal: 22 },
    glyphe: { alignItems: 'center', marginVertical: 18 },
    chapeau: {
      color: c.inkSoft,
      fontSize: 14.5,
      lineHeight: 20,
      marginBottom: 16,
      textAlign: 'center',
    },
    bloc: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 16,
      marginBottom: 10,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    // Ce dont le lecteur doute porte la couleur de l'attention, pas celle
    // du danger : rien n'est cassé, il manque une certitude.
    blocDoute: { backgroundColor: c.surfaceSunken },
    blocTitre: { color: c.ink, fontSize: 15, fontWeight: '800' },
    blocTexte: { color: c.inkSoft, fontSize: 13.5, lineHeight: 19, marginTop: 6 },
    attente: { marginTop: 12 },
    ligne: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 5,
    },
    ligneQuoi: { color: c.inkSoft, fontSize: 14 },
    ligneCombien: { color: c.ink, fontSize: 14, fontWeight: '800' },
    saisieRangee: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    saisie: {
      flex: 1,
      height: 44,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.lineStrong,
      paddingHorizontal: 12,
      color: c.ink,
      fontSize: 16,
    },
    recaler: {
      marginLeft: 10,
      height: 44,
      paddingHorizontal: 18,
      borderRadius: radius.sm,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recalerTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    second: { marginTop: 10 },
  });
