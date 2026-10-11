/**
 * LE DIAGNOSTIC D'UN PLAN — ce que l'application y voit, ce que
 * l'utilisateur y a vu, et l'envoi au support.
 *
 * Relevé du patron : « fais en sorte qu'on puisse diagnostiquer un plan
 * pour lire tous les problèmes et les données du plan ; envoie les
 * diagnostics complets à echoplansupport@gmail.com ; donne la possibilité à
 * l'utilisateur de marquer ce qui n'allait pas avec son plan, en vue d'une
 * amélioration de l'application ».
 *
 * Une PAGE, pas une feuille : une liste de problèmes, une liste à cocher et
 * un champ de texte doivent défiler, et une feuille qui défile se dispute
 * le geste avec sa propre poignée.
 *
 * C'EST L'UTILISATEUR QUI ENVOIE : le composeur d'iOS s'ouvre rempli, il
 * voit ce qui part. Le dossier joint porte les données du plan — pas ses
 * photos, pas les coordonnées de son client (`dossierDuDiagnostic`).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import {
  REMARQUES,
  diagnostiquerPlan,
  dossierDuDiagnostic,
  fichierDuDiagnostic,
  rapportDuDiagnostic,
} from '../geometry/diagnosticPlan';
import { COURRIEL_SUPPORT, envoyerUnDiagnostic, infosDeLApp } from '../native/support';
import { useScanStore } from '../store/scanStore';
import { radius, shadowCard, useTheme, type Palette } from '../theme';
import { usePannes } from '../ui/journalPannes';

type Etat = 'pret' | 'envoi' | 'sent' | 'cancelled' | 'partage' | 'unavailable';

const m2 = (v: number) => `${v.toFixed(1).replace('.', ',')} m²`;

export function DiagnosticPlanScreen() {
  const c = useTheme();
  const s = themed(c);
  const insets = useSafeAreaInsets();
  const setScreen = useScanStore((st) => st.setScreen);
  const id = useScanStore((st) => st.diagnosticId);
  const saves = useScanStore((st) => st.saves);
  /* Le plan tel qu'on le verrait en l'ouvrant : ses retouches en attente comprises. */
  const plan = useMemo(() => {
    const trouve = saves.find((x) => x.id === id);
    return trouve?.retouche ? { ...trouve, ...trouve.retouche.plan } : trouve;
  }, [saves, id]);
  const diag = useMemo(
    () =>
      plan
        ? diagnostiquerPlan({
            name: plan.name,
            walls: plan.walls ?? [],
            openings: plan.openings ?? [],
            rooms: plan.rooms ?? [],
            objects: plan.objects ?? [],
            fixtures: plan.fixtures,
            photos: plan.photos,
            notes: plan.notes,
            mesures: plan.mesures,
          })
        : null,
    [plan],
  );
  const [remarques, setRemarques] = useState<string[]>([]);
  const [commentaire, setCommentaire] = useState('');
  const [etat, setEtat] = useState<Etat>('pret');
  /*
    LE CLAVIER NE CACHE PLUS CE QU'ON ÉCRIT — relevé du patron, capture à
    l'appui : « la saisie de texte empêche de voir ce que l'on écrit, et on
    ne peut pas valider en ayant ce bloc gênant ». La page laisse la place
    du clavier (`automaticallyAdjustKeyboardInsets`) et, au toucher du
    champ, défile jusqu'à lui — il est en bas, avec le bouton d'envoi.
    « Terminé » range le clavier ; un glissé vers le bas aussi.
  */
  const defile = useRef<ScrollView>(null);
  const amenerLeChamp = () => {
    // Le temps que le clavier monte et que la page lui ait fait sa place.
    setTimeout(() => defile.current?.scrollToEnd({ animated: true }), 300);
  };

  const retour = () => setScreen('library');
  const basculer = (cle: string) =>
    setRemarques((r) => (r.includes(cle) ? r.filter((x) => x !== cle) : [...r, cle]));

  const envoyer = async () => {
    if (!plan || !diag || etat === 'envoi') return;
    Keyboard.dismiss();
    setEtat('envoi');
    const contexte = await infosDeLApp();
    const fichier = fichierDuDiagnostic(plan.name);
    const pannes = usePannes.getState();
    const contenu = dossierDuDiagnostic({
      plan: plan as unknown as Record<string, unknown>,
      diag,
      remarques,
      commentaire,
      contexte,
      journal: { incidents: pannes.incidents, dernierScan: pannes.dernierScan },
    });
    const corps = rapportDuDiagnostic({ nom: plan.name, diag, remarques, commentaire, contexte, fichier });
    const sortie = await envoyerUnDiagnostic(`Diagnostic EchoPlan — ${plan.name}`, corps, fichier, contenu);
    setEtat(sortie);
  };

  if (!plan || !diag) {
    return (
      <RetourGlisse onRetour={retour} style={[s.fond, { paddingTop: insets.top }]}>
        <Barre s={s} c={c} onRetour={retour} />
        <Text style={s.chapeau}>Ce plan n’existe plus.</Text>
      </RetourGlisse>
    );
  }

  const r = diag.resume;
  const donnees: [string, string][] = [
    ['Pièces', r.piecesOuvertes > 0 ? `${r.pieces} (dont ${r.piecesOuvertes} ouverte${r.piecesOuvertes > 1 ? 's' : ''})` : `${r.pieces}`],
    ['Surface', m2(r.surface)],
    ['Murs', `${r.murs}`],
    ['Hauteur', `${r.hauteur.toFixed(2).replace('.', ',')} m`],
    ['Portes', `${r.portes}`],
    ['Fenêtres', `${r.fenetres}`],
    ['Passages', `${r.passages}`],
    ['Meubles', `${r.meubles}`],
    ['Appareils', `${r.appareils}`],
    ['Niveaux', `${r.niveaux}`],
  ];
  const message: Partial<Record<Etat, string>> = {
    sent: 'Merci ! Le diagnostic est parti : il nous aidera à améliorer EchoPlan.',
    partage: `Choisissez votre messagerie, et envoyez le dossier à ${COURRIEL_SUPPORT}.`,
    cancelled: 'Envoi annulé : rien n’est parti.',
    unavailable: `Impossible d’ouvrir une messagerie. Écrivez-nous à ${COURRIEL_SUPPORT}.`,
  };

  return (
    <RetourGlisse onRetour={retour} style={[s.fond, { paddingTop: insets.top }]}>
      <Barre s={s} c={c} onRetour={retour} />
      <ScrollView
        ref={defile}
        contentContainerStyle={[s.contenu, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        <Text style={s.nom}>{plan.name}</Text>
        <Text style={s.chapeau}>
          Ce que l’application voit dans ce plan, et ce que vous pouvez nous signaler pour l’améliorer.
        </Text>

        <Text style={s.section}>Ce que l’application a vu</Text>
        <View style={s.bloc}>
          {diag.problemes.length === 0 ? (
            <View style={s.ligneProbleme}>
              <View style={[s.pastille, { backgroundColor: c.green }]} />
              <Text style={s.probTitre}>Aucun problème détecté.</Text>
            </View>
          ) : (
            diag.problemes.map((p, i) => (
              <View key={`${p.code}-${i}`} style={[s.ligneProbleme, i > 0 && s.separe]}>
                <View style={[s.pastille, { backgroundColor: p.gravite === 'alerte' ? c.danger : c.amber }]} />
                <View style={s.probTexte}>
                  <Text style={s.probTitre}>{p.titre}</Text>
                  <Text style={s.probDetail}>{p.detail}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={s.section}>Les données du plan</Text>
        <View style={s.bloc}>
          <View style={s.grille}>
            {donnees.map(([k, v]) => (
              <View key={k} style={s.case}>
                <Text style={s.caseValeur}>{v}</Text>
                <Text style={s.caseCle}>{k}</Text>
              </View>
            ))}
          </View>
          {diag.pieces.map((p) => (
            <View key={p.id} style={[s.lignePiece, s.separe]}>
              <Text style={s.pieceNom} numberOfLines={1}>
                {p.nom}
              </Text>
              <Text style={[s.pieceInfo, !p.fermee && { color: c.danger }]}>
                {`${p.murs} murs · ${m2(p.aire)} · ${p.fermee ? 'fermée' : 'ne se ferme pas'}`}
              </Text>
            </View>
          ))}
        </View>

        <Text style={s.section}>Ce qui n’allait pas</Text>
        <View style={s.bloc}>
          {REMARQUES.map((x, i) => {
            const coche = remarques.includes(x.cle);
            return (
              <TouchableOpacity
                key={x.cle}
                accessibilityRole="checkbox"
                accessibilityLabel={x.libelle}
                accessibilityState={{ checked: coche }}
                activeOpacity={0.7}
                style={[s.ligneCoche, i > 0 && s.separe]}
                onPress={() => basculer(x.cle)}>
                <View style={[s.coche, coche && { backgroundColor: c.blue, borderColor: c.blue }]}>
                  {coche ? (
                    <Svg width={12} height={12} viewBox="0 0 24 24">
                      <Path d="M5 12.5 l4.5 4.5 L19 7.5" stroke="#FFFFFF" strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  ) : null}
                </View>
                <Text style={s.cocheTexte}>{x.libelle}</Text>
              </TouchableOpacity>
            );
          })}
          <TextInput
            accessibilityLabel="Ce qui n’allait pas, en quelques mots"
            placeholder="Racontez-nous, en quelques mots : où, et ce que vous attendiez."
            placeholderTextColor={c.inkFaint}
            multiline
            value={commentaire}
            onChangeText={setCommentaire}
            onFocus={amenerLeChamp}
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={() => Keyboard.dismiss()}
            style={[s.champ, { color: c.ink, borderColor: c.line, backgroundColor: c.bg }]}
          />
        </View>

        <Text style={s.note}>
          {`Le diagnostic part à ${COURRIEL_SUPPORT} depuis votre messagerie : vous le voyez avant de l’envoyer. ` +
            'Il contient les données du plan (murs, pièces, meubles, appareillage), sans vos photos ni les coordonnées de votre client.'}
        </Text>

        {message[etat] ? (
          <View style={[s.bandeau, { backgroundColor: etat === 'sent' ? c.blueSoft : c.surface }]}>
            <Text style={s.bandeauTexte}>{message[etat]}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Envoyer le diagnostic"
          activeOpacity={0.8}
          disabled={etat === 'envoi'}
          style={[s.bouton, { backgroundColor: c.blue }, etat === 'envoi' && s.boutonAttente]}
          onPress={envoyer}>
          <Text style={s.boutonTexte}>{etat === 'envoi' ? 'Préparation…' : 'Envoyer le diagnostic'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </RetourGlisse>
  );
}

function Barre({ s, c, onRetour }: { s: ReturnType<typeof themed>; c: Palette; onRetour: () => void }) {
  return (
    <View style={s.barre}>
      <Pressable accessibilityRole="button" accessibilityLabel="Retour" style={s.rondBarre} hitSlop={10} onPress={onRetour}>
        <BackChevron color={c.ink} />
      </Pressable>
      <Text style={s.titreBarre}>Diagnostic du plan</Text>
      <View style={s.videBarre} />
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
      paddingHorizontal: 22,
      marginTop: 8,
      marginBottom: 10,
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
    nom: { color: c.ink, fontSize: 22, fontWeight: '800', marginBottom: 4 },
    chapeau: { color: c.inkSoft, fontSize: 14.5, lineHeight: 20, marginBottom: 6, paddingHorizontal: 0 },
    section: {
      color: c.inkSoft,
      fontSize: 12.5,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 18,
      marginBottom: 8,
    },
    bloc: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingHorizontal: 16,
      paddingVertical: 6,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    separe: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    ligneProbleme: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
    pastille: { width: 9, height: 9, borderRadius: 4.5, marginTop: 5, marginRight: 10 },
    probTexte: { flex: 1 },
    probTitre: { color: c.ink, fontSize: 14.5, fontWeight: '600' },
    probDetail: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 2 },
    grille: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 6 },
    case: { width: '50%', paddingVertical: 6 },
    caseValeur: { color: c.ink, fontSize: 15, fontWeight: '700' },
    caseCle: { color: c.inkSoft, fontSize: 12, marginTop: 1 },
    lignePiece: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
    pieceNom: { color: c.ink, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
    pieceInfo: { color: c.inkSoft, fontSize: 12.5 },
    ligneCoche: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
    coche: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    cocheTexte: { color: c.ink, fontSize: 14.5, flex: 1 },
    champ: {
      minHeight: 90,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.sm,
      padding: 12,
      fontSize: 14.5,
      textAlignVertical: 'top',
      marginTop: 6,
      marginBottom: 10,
    },
    note: { color: c.inkFaint, fontSize: 12, lineHeight: 17, marginTop: 14 },
    bandeau: { borderRadius: radius.md, padding: 14, marginTop: 14 },
    bandeauTexte: { color: c.ink, fontSize: 14, lineHeight: 19, fontWeight: '600' },
    bouton: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
    boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    boutonAttente: { opacity: 0.6 },
  });
