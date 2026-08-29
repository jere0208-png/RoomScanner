/**
 * LE GARDE-FOU — l'application ne se ferme plus, elle dit ce qui s'est passé.
 *
 * Relevé du patron : « l'app a quitté plusieurs fois après des clics sur des
 * meubles. Fais en sorte qu'on ait un diagnostic d'erreurs. »
 *
 * DEUX PORTES, ET IL FAUT LES DEUX — c'est le point qu'on rate d'habitude.
 *
 *   LE RENDU. Une erreur pendant qu'un composant se dessine remonte aux
 *   frontières d'erreur de React. C'est ce que fait la classe ci-dessous, et
 *   c'est la seule chose que React sait attraper.
 *
 *   LE RESTE. Une erreur dans un GESTIONNAIRE D'APPUI — le doigt sur un
 *   meuble — ne passe PAS par les frontières : React ne les voit pas. Elle
 *   remonte au gestionnaire global de la plateforme, et en production elle est
 *   FATALE : l'application se ferme, sans un mot.
 *
 * Le relevé décrit exactement ce second cas. Une frontière d'erreur seule
 * n'aurait rien changé — on aurait ajouté un filet là où personne ne tombe.
 *
 * CE QU'ON MONTRE À LA PLACE : un écran qui dit ce qui s'est passé, propose de
 * REPRENDRE — le plan est toujours en mémoire — et donne le détail technique
 * en clair, pour qu'il se lise sur le téléphone du chantier deux jours plus
 * tard.
 *
 * REPRENDRE PLUTÔT QUE REDÉMARRER, et c'est un choix. Après une erreur, l'état
 * peut être bancal : le réflexe prudent serait de tout remettre à zéro. Mais
 * « tout remettre à zéro » veut dire JETER LE RELEVÉ EN COURS, c'est-à-dire
 * faire exactement le dégât qu'on cherche à éviter. On remonte donc la
 * frontière et l'on rend la main : au pire, ça recasse, et l'on aura une
 * seconde panne dans le journal — ce qui est encore une information.
 */
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { enregistrerPanne, type Panne } from '../ui/journalPannes';
import { light } from '../theme';

interface Etat {
  panne: Panne | null;
}

export class GardeFou extends React.Component<
  { children: React.ReactNode; ecran?: () => string },
  Etat
> {
  state: Etat = { panne: null };
  /** Le désabonnement du gestionnaire global, rendu au démontage. */
  private rendreLaMain: (() => void) | null = null;

  componentDidMount() {
    /*
      LE GESTIONNAIRE GLOBAL — celui qui attrape ce que React ne voit pas.

      `ErrorUtils` est la porte de sortie des erreurs JavaScript de React
      Native. On garde l'ancien gestionnaire et on l'appelle : le nôtre
      OBSERVE, il ne remplace pas. Écraser celui de la plateforme couperait
      les rapports de plantage et le message rouge du mode développement,
      c'est-à-dire les deux choses qui servent à déboguer.
    */
    const utils = (
      global as unknown as {
        ErrorUtils?: {
          getGlobalHandler: () => (e: unknown, fatal?: boolean) => void;
          setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void;
        };
      }
    ).ErrorUtils;
    if (!utils) return;
    const avant = utils.getGlobalHandler();
    const notre = (erreur: unknown, fatale?: boolean) => {
      const panne = enregistrerPanne(erreur, {
        ecran: this.props.ecran?.() ?? '?',
        fatale: !!fatale,
      });
      /*
        ON NE MONTRE L'ÉCRAN QUE POUR CE QUI TUAIT L'APPLICATION.

        Une erreur non fatale — une promesse rejetée dans un coin — est
        écrite dans le journal et ne dérange personne : l'application marche
        encore, et l'interrompre pour un incident qu'elle a digéré serait
        pire que le silence d'avant.
      */
      if (fatale) this.setState({ panne });
      try {
        avant?.(erreur, fatale);
      } catch {
        // L'ancien gestionnaire qui tombe ne doit pas emporter le nôtre.
      }
    };
    utils.setGlobalHandler(notre);
    this.rendreLaMain = () => utils.setGlobalHandler(avant);
  }

  componentWillUnmount() {
    this.rendreLaMain?.();
  }

  /**
   * LA FRONTIÈRE DOIT BASCULER ICI, ET PAS AILLEURS.
   *
   * Premier jet : cette méthode rendait `null` — « l'état se pose dans
   * `componentDidCatch`, c'est là qu'on a le détail ». Le banc l'a fait
   * tomber tout de suite, et il avait raison : rendre `null`, c'est dire à
   * React « je n'ai pas changé d'état ». Il redessine donc les enfants, qui
   * relèvent la même erreur, et au bout de deux tours il abandonne et la
   * REJETTE — la frontière ne servait à rien.
   *
   * On bascule donc dès maintenant, avec ce qu'on a sous la main : le
   * message. `componentDidCatch` repassera derrière avec la pile, l'écran et
   * l'écriture au journal. Ce que React exige, c'est l'ARRÊT ; le détail peut
   * attendre une image.
   */
  static getDerivedStateFromError(erreur: unknown): Etat {
    return {
      panne: {
        quand: Date.now(),
        message:
          erreur instanceof Error ? erreur.message : String(erreur ?? 'Erreur'),
        pile: '',
        ecran: '?',
        fatale: true,
      },
    };
  }

  componentDidCatch(erreur: Error) {
    this.setState({
      panne: enregistrerPanne(erreur, {
        ecran: this.props.ecran?.() ?? '?',
        fatale: true,
      }),
    });
  }

  render() {
    const { panne } = this.state;
    if (!panne) return this.props.children;
    return (
      <View style={styles.fond}>
        <View style={styles.bloc}>
          <Text style={styles.titre}>L’application s’est arrêtée net</Text>
          <Text style={styles.phrase}>
            Votre relevé est toujours en mémoire. Reprenez : si le problème
            revient au même endroit, envoyez-nous le détail ci-dessous.
          </Text>
          {/*
            LE DÉTAIL EST LISIBLE, PAS CACHÉ.

            C'est la seule information qui permette de corriger, et la
            personne qui l'a sous les yeux est celle qui vient de le
            provoquer. La cacher derrière un « afficher les détails »
            garantit qu'on ne la recevra jamais.
          */}
          <ScrollView style={styles.detail}>
            <Text style={styles.detailTexte} selectable>
              {`${panne.ecran} · ${panne.message}\n\n${panne.pile}`}
            </Text>
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reprendre"
            style={styles.bouton}
            onPress={() => this.setState({ panne: null })}>
            <Text style={styles.boutonTexte}>Reprendre</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

/*
  LES COULEURS SONT ÉCRITES EN DUR, ET C'EST LE SEUL ENDROIT DE L'APPLICATION
  OÙ C'EST JUSTE.

  Cet écran s'affiche quand quelque chose vient de casser. Aller chercher le
  thème, c'est appeler un magasin et un contexte — donc du code qui peut être
  précisément celui qui a échoué. Un écran de secours ne dépend de rien.
*/
const styles = StyleSheet.create({
  fond: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: light.bg,
    padding: 22,
    justifyContent: 'center',
  },
  bloc: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    maxHeight: '86%',
  },
  titre: { color: light.ink, fontSize: 22, fontWeight: '800' },
  phrase: {
    color: light.inkSoft,
    fontSize: 14.5,
    lineHeight: 20,
    marginTop: 8,
  },
  detail: {
    marginTop: 14,
    marginBottom: 16,
    backgroundColor: light.surfaceSunken,
    borderRadius: 12,
    padding: 12,
    maxHeight: 260,
  },
  detailTexte: { color: light.inkSoft, fontSize: 11.5, lineHeight: 16 },
  bouton: {
    backgroundColor: light.blue,
    borderRadius: 999,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonTexte: { color: '#FFFFFF', fontSize: 16.5, fontWeight: '800' },
});
