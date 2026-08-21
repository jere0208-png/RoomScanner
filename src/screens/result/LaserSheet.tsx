/**
 * LE TÉLÉMÈTRE LASER — la cote juste, prise à la source.
 *
 * RoomPlan se trompe de deux à trois centimètres sur une pièce : sans
 * conséquence pour un plan d'ambiance, trop pour percer. Le mètre laser
 * donne le millimètre — et il le donne DEVANT LE CLIENT, ce qui compte
 * autant : un outil de chantier qu'on sort et qui parle à l'application,
 * ça se voit.
 *
 * LA RADIO NE VIT QUE TANT QUE CETTE FEUILLE EST OUVERTE. Chercher en
 * permanence viderait la batterie pour un outil qu'on sort trois fois par
 * mois, et ferait apparaître la demande d'autorisation Bluetooth au premier
 * lancement de l'application, sans rapport avec ce qu'on faisait.
 *
 * ON N'ÉCRASE JAMAIS UNE COTE SUR UN DOUTE. Le télémètre ne sait pas quel
 * mur on vise : braqué sur la cloison d'en face, il envoie une cote
 * parfaitement valable qui remplacerait un relevé juste. Quand l'écart au
 * scan ne peut plus être une imprécision, la feuille le dit et demande
 * confirmation — c'est le seul geste de cet écran qui coûte cher.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RoomScan, laserEvents } from 'react-native-room-scan';
import { radius, shadowCard, useTheme, type Palette } from '../../theme';
import { auCentimetre, ecartAuScan, mesurePlausible } from '../../geometry/telemetre';
import { haptic } from '../../ui/haptic';
import { fr } from './format';

type Etat =
  | 'recherche'
  | 'pret'
  | 'connecte'
  | 'eteint'
  | 'refuse'
  | 'indisponible'
  | 'echec';

const MOT_ETAT: Record<Etat, string> = {
  recherche: 'Recherche du télémètre…',
  pret: 'Allumez votre télémètre et activez son Bluetooth.',
  connecte: 'Connecté — appuyez sur le bouton de mesure.',
  eteint: 'Le Bluetooth du téléphone est éteint.',
  refuse: 'L’accès Bluetooth a été refusé pour cette application.',
  indisponible: 'Cet appareil ne gère pas le Bluetooth.',
  echec: 'La connexion a échoué — rallumez le télémètre.',
};

export function LaserSheet({
  visible,
  onClose,
  /** Ce qu'on cote : son nom, et la valeur que le scan avait relevée. */
  cible,
  onAppliquer,
}: {
  visible: boolean;
  onClose: () => void;
  cible: { nom: string; actuelle: number | null } | null;
  onAppliquer: (metres: number) => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const [etat, setEtat] = useState<Etat>('recherche');
  const [appareils, setAppareils] = useState<{ id: string; nom: string }[]>([]);
  const [nomConnecte, setNomConnecte] = useState<string | null>(null);
  const [mesure, setMesure] = useState<number | null>(null);

  /*
    LA RADIO S'OUVRE AVEC LA FEUILLE ET SE FERME AVEC ELLE.

    Les abonnements aussi : un écouteur laissé derrière recevrait des
    mesures pour un écran qui n'existe plus, et le compteur de Bluetooth
    resterait allumé pour rien.
  */
  useEffect(() => {
    if (!visible) return;
    setMesure(null);
    setAppareils([]);
    setEtat('recherche');
    const abos = [
      laserEvents.addListener(
        'onLaserAppareil',
        (a: { id: string; nom: string }) => {
          setAppareils((liste) =>
            liste.some((x) => x.id === a.id) ? liste : [...liste, a],
          );
        },
      ),
      laserEvents.addListener(
        'onLaserEtat',
        (e: { etat: string; nom?: string }) => {
          if (e.etat === 'connecte') {
            setNomConnecte(e.nom ?? 'Télémètre');
            setEtat('connecte');
            haptic('succes');
          } else if (e.etat === 'deconnecte') {
            setNomConnecte(null);
            setEtat('pret');
          } else if (
            ['pret', 'eteint', 'refuse', 'indisponible', 'echec'].includes(
              e.etat,
            )
          ) {
            setEtat(e.etat as Etat);
          }
        },
      ),
      laserEvents.addListener('onLaserMesure', (m: { metres: number }) => {
        if (!mesurePlausible(m.metres)) return;
        setMesure(auCentimetre(m.metres));
        haptic('succes');
      }),
    ];
    RoomScan.laserChercher().catch(() => {});
    return () => {
      abos.forEach((a) => a.remove());
      RoomScan.laserArreter().catch(() => {});
    };
  }, [visible]);

  const k = mesure !== null ? ecartAuScan(mesure, cible?.actuelle) : null;
  const [confirme, setConfirme] = useState(false);

  const appliquer = () => {
    if (mesure === null) return;
    if (k?.suspect && !confirme) {
      setConfirme(true);
      haptic('alerte');
      return;
    }
    onAppliquer(mesure);
    haptic('succes');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.fond} onPress={onClose}>
        <Pressable style={styles.carte} onPress={() => {}}>
          <View style={styles.tete}>
            <View style={styles.teteTexte}>
              <Text style={styles.titre}>Télémètre laser</Text>
              <Text style={styles.sousTitre}>
                {cible
                  ? `Coter ${cible.nom.toLowerCase()}`
                  : 'Relever une distance'}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Fermer"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={onClose}>
              <Text style={styles.croix}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* --------------------------------------------- la mesure, en grand */}
          <View style={styles.cadran}>
            <Text style={styles.valeur}>
              {mesure !== null ? `${fr(mesure, 2)} m` : '— , — — m'}
            </Text>
            {cible?.actuelle ? (
              <Text style={styles.reference}>
                {`Le scan avait relevé ${fr(cible.actuelle, 2)} m`}
              </Text>
            ) : null}
          </View>

          {/* ------------------------------------------- l'état de la liaison */}
          <View style={styles.etatLigne}>
            <View
              style={[
                styles.voyant,
                {
                  backgroundColor:
                    etat === 'connecte'
                      ? c.green
                      : etat === 'recherche' || etat === 'pret'
                        ? c.amber
                        : c.danger,
                },
              ]}
            />
            <Text style={styles.etatTexte}>
              {nomConnecte && etat === 'connecte'
                ? `${nomConnecte} — appuyez sur son bouton de mesure`
                : MOT_ETAT[etat]}
            </Text>
          </View>

          {/* ------------------------------------ les télémètres à portée */}
          {etat !== 'connecte' && (
            <ScrollView style={styles.liste} keyboardShouldPersistTaps="handled">
              {appareils.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.appareil}
                  accessibilityLabel={`Se connecter à ${a.nom}`}
                  onPress={() => RoomScan.laserConnecter(a.id).catch(() => {})}>
                  <Text style={styles.appareilNom}>{a.nom}</Text>
                  <Text style={styles.appareilAction}>Connecter</Text>
                </TouchableOpacity>
              ))}
              {appareils.length === 0 && (
                <Text style={styles.vide}>
                  Aucun télémètre trouvé pour l’instant. Les Leica DISTO sont
                  reconnus ; il faut que le Bluetooth de l’appareil soit
                  activé dans ses réglages.
                </Text>
              )}
            </ScrollView>
          )}

          {/* ------------------------------------------- le garde-fou, s'il faut */}
          {k?.suspect && (
            <View style={styles.alerte}>
              <Text style={styles.alerteTitre}>Vérifiez ce que vous visez</Text>
              <Text style={styles.alerteTexte}>
                {`L’écart avec le relevé est de ${fr(
                  Math.abs(k.ecart),
                  2,
                )} m. Le télémètre ne sait pas quel mur vous visez : si c’est ` +
                  'bien celui-ci, appuyez une seconde fois.'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.valider, mesure === null && styles.validerEteint]}
            disabled={mesure === null}
            accessibilityLabel="Appliquer la mesure"
            onPress={appliquer}>
            <Text style={styles.validerTexte}>
              {k?.suspect && !confirme
                ? 'Appliquer quand même'
                : mesure !== null
                  ? `Appliquer ${fr(mesure, 2)} m`
                  : 'En attente d’une mesure'}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const getStyles = (c: Palette) =>
  StyleSheet.create({
    fond: {
      flex: 1,
      backgroundColor: 'rgba(11,13,18,0.45)',
      justifyContent: 'flex-end',
    },
    carte: {
      backgroundColor: c.bg,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 22,
      maxHeight: '86%',
      ...shadowCard,
    },
    tete: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    teteTexte: { flex: 1 },
    titre: { color: c.ink, fontSize: 19, fontWeight: '800' },
    sousTitre: { color: c.inkFaint, fontSize: 13, marginTop: 2 },
    croix: { color: c.inkFaint, fontSize: 17, fontWeight: '700' },
    cadran: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingVertical: 22,
      alignItems: 'center',
      marginTop: 14,
    },
    valeur: {
      color: c.ink,
      fontSize: 40,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    reference: { color: c.inkFaint, fontSize: 12.5, marginTop: 6 },
    etatLigne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      marginTop: 14,
    },
    voyant: { width: 9, height: 9, borderRadius: 5 },
    etatTexte: { flex: 1, color: c.inkSoft, fontSize: 13 },
    liste: { marginTop: 10, maxHeight: 168 },
    appareil: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingVertical: 13,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    appareilNom: { flex: 1, color: c.ink, fontSize: 15, fontWeight: '700' },
    appareilAction: { color: c.blue, fontSize: 13.5, fontWeight: '700' },
    vide: {
      color: c.inkFaint,
      fontSize: 12.5,
      lineHeight: 18,
      paddingVertical: 10,
    },
    alerte: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      borderLeftColor: c.amber,
      padding: 12,
      marginTop: 12,
    },
    alerteTitre: { color: c.ink, fontSize: 14, fontWeight: '800' },
    alerteTexte: {
      color: c.inkSoft,
      fontSize: 12.5,
      lineHeight: 18,
      marginTop: 3,
    },
    valider: {
      backgroundColor: c.blue,
      borderRadius: radius.md,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    validerEteint: { backgroundColor: c.surface },
    validerTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  });
