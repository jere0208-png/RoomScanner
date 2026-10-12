/**
 * AJOUTER UNE PIÈCE, sans tout recommencer.
 *
 * Un logement ne se relève pas toujours d'un trait : on scanne le séjour,
 * on est appelé ailleurs, on revient pour la chambre. La seule porte de
 * sortie était « Nouveau scan » — qui efface tout. On pose donc une pièce
 * aux cotes qu'on donne, accolée au plan, et on l'ajuste au doigt comme
 * n'importe quel mur.
 *
 * « SUR MESURE » SE TAPE ICI MÊME — revue « Hugo » (iPhone 13, sans
 * LiDAR). Le bouton fermait cette feuille pour en ouvrir une autre ; iOS ne
 * présente pas deux fenêtres à la fois, et la seconde ne s'ouvrait pas, ou
 * surgissait plus tard, au hasard. Quand elle s'ouvrait : un seul champ à
 * lettres pour « 3,60 x 2,80 », et une faute de frappe la refermait sur une
 * simple vibration. Deux champs numériques, en mètres, et l'erreur se dit
 * sous le champ — la feuille reste ouverte.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { RoomChoice } from '../../components/RoomChoice';
import { getStyles } from './styles';

/** Les gabarits proposés : des pièces qu'on rencontre, aux cotes usuelles. */
const MODELES = [
  { nom: 'Chambre', largeur: 3.4, profondeur: 3 },
  { nom: 'Séjour', largeur: 5, profondeur: 4 },
  { nom: 'Cuisine', largeur: 3.2, profondeur: 2.6 },
  { nom: 'Salle de bains', largeur: 2.4, profondeur: 2 },
  { nom: 'WC', largeur: 1.4, profondeur: 1 },
  { nom: 'Dégagement', largeur: 3, profondeur: 1.2 },
  { nom: 'Bureau', largeur: 3, profondeur: 2.6 },
  { nom: 'Buanderie', largeur: 2.2, profondeur: 1.8 },
];

const enMetres = (v: number) => `${v.toFixed(2).replace('.', ',')} m`;

/**
 * Ce qui ne va pas dans une cote tapée, dit en clair — ou rien.
 *
 * LES CENTIMÈTRES SE RECONNAISSENT : « 600 » pour une pièce, c'est six
 * mètres tapés en centimètres, pas une pièce de six cents mètres (la
 * saisie d'avant en faisait une de 3 600 m²). On propose la bonne lecture,
 * on ne la fait pas à la place de celui qui tape.
 */
export function fauteDeCote(texte: string, quoi: string): string | null {
  const v = parseFloat(texte.replace(',', '.').trim());
  if (!texte.trim() || !Number.isFinite(v) || v <= 0) {
    return `${quoi} : tapez une cote en mètres, par exemple 3,60.`;
  }
  if (v >= 30) {
    return v / 100 < 30
      ? `${quoi} en centimètres ? Vouliez-vous dire ${enMetres(v / 100)} ? Les cotes se tapent en mètres.`
      : `${quoi} : ${enMetres(v)}, c'est plus qu'un bâtiment.`;
  }
  if (v < 0.6) return `${quoi} : une pièce fait au moins 0,60 m de côté.`;
  return null;
}

export function AddRoomSheet({
  visible,
  accolee,
  planVide = false,
  onClose,
  onChoose,
}: {
  visible: boolean;
  /** Un mur est désigné : la pièce viendra s'y accoler. */
  accolee: boolean;
  /** Rien n'est encore dessiné : la feuille ne parle pas d'un plan absent. */
  planVide?: boolean;
  onClose: () => void;
  onChoose: (largeur: number, profondeur: number, nom: string) => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const [surMesure, setSurMesure] = useState(false);
  const [largeur, setLargeur] = useState('');
  const [profondeur, setProfondeur] = useState('');
  /*
    LE NOM SE TAPE AVEC LES COTES — revue « Sophie » : huit pièces « Sur
    mesure » sortaient « Pièce sans nom », à renommer une à une. Facultatif :
    sans lui, la pièce reste sans nom, comme avant.
  */
  const [nom, setNom] = useState('');
  const [faute, setFaute] = useState<string | null>(null);
  // Chaque ouverture repart des gabarits.
  useEffect(() => {
    if (visible) return;
    setSurMesure(false);
    setFaute(null);
    setNom('');
  }, [visible]);

  const ajouter = () => {
    const f = fauteDeCote(largeur, 'Largeur') ?? fauteDeCote(profondeur, 'Profondeur');
    if (f) {
      setFaute(f);
      return;
    }
    setFaute(null);
    onChoose(
      parseFloat(largeur.replace(',', '.')),
      parseFloat(profondeur.replace(',', '.')),
      nom.trim(),
    );
  };

  const sousTitre = surMesure
    ? accolee
      ? 'Cotes intérieures : la largeur le long du mur choisi, depuis son début ; la profondeur, du nu de ce mur au nu du mur du fond.'
      : 'Cotes intérieures, de mur à mur, en mètres — celles du mètre ruban.'
    : accolee
      ? 'Elle s’accole au mur choisi et le partage avec lui, depuis son début : ' +
        'la largeur se prend le long du mur, la profondeur s’en éloigne.'
      : planVide
        ? 'Choisissez un gabarit, puis ajustez ses cotes — ou tapez-les avec « Sur mesure ».'
        : 'Elle se pose à côté du plan. Pour l’accoler, touchez ' +
          'd’abord le mur qui les séparera, puis ajoutez-la.';

  const champ = (
    label: string,
    valeur: string,
    changer: (t: string) => void,
    suivant?: () => void,
  ) => (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.modalSubtitle}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          style={[styles.modalInput, { flex: 1 }]}
          accessibilityLabel={label}
          value={valeur}
          onChangeText={(t) => {
            changer(t);
            setFaute(null);
          }}
          keyboardType="decimal-pad"
          placeholder="3,60"
          placeholderTextColor={c.inkFaint}
          returnKeyType={suivant ? 'next' : 'done'}
          onSubmitEditing={suivant}
        />
        <Text style={styles.modalSubtitle}>m</Text>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>
            {surMesure ? 'Pièce sur mesure' : 'Ajouter une pièce'}
          </Text>
          <Text style={styles.modalSubtitle}>{sousTitre}</Text>
          {surMesure ? (
            <View>
              {champ('Largeur', largeur, setLargeur)}
              {champ('Profondeur', profondeur, setProfondeur, ajouter)}
              <View style={{ marginTop: 10 }}>
                <Text style={styles.modalSubtitle}>Nom</Text>
                <TextInput
                  style={styles.modalInput}
                  accessibilityLabel="Nom de la pièce"
                  value={nom}
                  onChangeText={setNom}
                  placeholder="Chambre, cuisine… (facultatif)"
                  placeholderTextColor={c.inkFaint}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  onSubmitEditing={ajouter}
                />
              </View>
              {faute && (
                <Text style={{ color: c.danger, fontSize: 13, marginTop: 10 }} accessibilityLiveRegion="polite">
                  {faute}
                </Text>
              )}
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalGhost}
                  accessibilityRole="button"
                  accessibilityLabel="Retour aux gabarits"
                  onPress={() => {
                    setSurMesure(false);
                    setFaute(null);
                  }}>
                  <Text style={styles.modalGhostText}>Gabarits</Text>
                </Pressable>
                <Pressable
                  style={styles.modalPrimary}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter la pièce"
                  onPress={ajouter}>
                  <Text style={styles.modalPrimaryText}>Ajouter</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <ScrollView style={styles.nameScroll}>
                <RoomChoice
                  modeles={MODELES}
                  onChoose={(m) =>
                    onChoose(m.largeur, Math.min(m.largeur, m.profondeur), m.nom)
                  }
                  onCustom={() => setSurMesure(true)}
                />
              </ScrollView>
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalGhost}
                  accessibilityRole="button"
                  accessibilityLabel="Annuler"
                  onPress={onClose}>
                  <Text style={styles.modalGhostText}>Annuler</Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
