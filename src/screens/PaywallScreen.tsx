/**
 * LA PAGE D'ABONNEMENT — une offre, son prix, ce qu'elle apporte.
 *
 * Elle a longtemps été un COMPARATIF : deux colonnes côte à côte, Gratuit
 * contre Pro, chacune avec son pouce d'argile. Le comparatif se défend
 * quand on hésite entre deux formules ; ici il n'y en a qu'une à vendre, et
 * la colonne « Gratuit » prenait la moitié de l'écran pour rappeler ce que
 * l'utilisateur a DÉJÀ — en tête de page, à l'endroit où l'on décide.
 *
 * Le patron a donné un design à suivre, et la page le suit : une barre
 * sobre, un titre qui nomme l'offre, le choix de la facturation, une carte
 * de prix qui énumère ce qu'on achète, et UN bouton, épinglé en bas, qui ne
 * quitte jamais l'écran.
 *
 * Ce qui ne bouge pas, parce que ça ne peut pas : le champ de code promo
 * (offres du patron — CARIDI12 déverrouille, FIRST20 remise) et
 * « Restaurer l'achat », qu'Apple exige dès qu'on vend un abonnement.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { BadgePro } from '../components/BadgePro';
import { LightRibbon, RIBBON_H } from '../components/LightRibbon';
import { ContourVif, TexteVif } from '../components/ContourVif';
import { SOLAIRES } from '../ui/solaires';
import {
  MOIS_OFFERTS,
  PRIX_PRO,
  PRIX_PRO_AN,
  prixRemise,
  useAccountStore,
  type Offre,
} from '../store/accountStore';
import { dark, radius, shadowCard, useTheme, type Palette } from '../theme';
import { alerte } from '../ui/alerte';

/**
 * CE QU'ON ACHÈTE, ÉNUMÉRÉ.
 *
 * Un prix sans liste ne dit pas ce qu'on paie, et la moitié de ce que
 * l'application sait faire ne se devine pas depuis l'accueil : le tableau
 * existant, le DXF pour l'architecte, le télémètre au Bluetooth. Chaque
 * ligne nomme une chose qui se FAIT, jamais une qualité.
 *
 * ET LA LISTE DIT POUR QUI C'EST — relevé du patron : « l'app n'est pas
 * destinée de base qu'aux électriciens (...) comment faire comprendre à
 * l'utilisateur que ce n'est pas que pour les élec mais aussi pour
 * modéliser son appartement et placer des meubles pour se projeter ».
 *
 * Elle vendait six choses, dont DEUX électriques et AUCUNE qui parle de
 * meubles, de 3D ou d'aménagement. C'est le pire endroit où oublier la
 * moitié du produit : celui où l'on demande de l'argent. Quelqu'un venu
 * meubler son appartement lisait une facture d'électricien et refermait.
 *
 * La ligne du mobilier entre donc, et en DEUXIÈME — juste après le
 * relevé, à la place où l'œil s'arrête encore. L'ordre raconte l'usage :
 * on relève, on meuble, on partage, puis vient le métier. Rien n'est
 * retiré : la norme et le tableau existant sont ce qui distingue
 * l'application de tous les scanners de pièces du magasin, et ils restent
 * écrits mot pour mot.
 */
const ATOUTS: { icone: keyof typeof SOLAIRES; mot: string }[] = [
  { icone: 'rooms', mot: 'Relevés illimités' },
  { icone: 'furniture', mot: 'Meubles, 3D et cotes au centimètre' },
  { icone: 'partage', mot: 'Tous les exports : PDF, DXF, CSV' },
  { icone: 'save', mot: 'Plans gardés sous votre compte' },
  { icone: 'elec', mot: 'Contrôle NF C 15-100 et matériel' },
  { icone: 'metre', mot: 'Tableau existant et diagnostic' },
  { icone: 'etoile', mot: 'Les nouveautés en premier' },
];

export function PaywallScreen() {
  const c = useTheme();
  const s = themed(c);
  const insets = useSafeAreaInsets();
  const { width: largeur } = useWindowDimensions();
  const visible = useAccountStore((st) => st.paywallVisible);
  const fermer = useAccountStore((st) => st.fermerPaywall);
  const utiliserCode = useAccountStore((st) => st.utiliserCode);
  const acheterPro = useAccountStore((st) => st.acheterPro);
  const restaurerPro = useAccountStore((st) => st.restaurerPro);
  const remisePct = useAccountStore((st) => st.remisePct);
  const codeOffert = useAccountStore((st) => st.codeOffert);
  const [code, setCode] = useState('');
  /*
    LE MENSUEL D'ABORD.

    C'est l'engagement le plus court : personne ne prend un an d'une app
    qu'il découvre, et proposer l'annuel en premier ferait lire le prix le
    plus gros avant tout le reste.
  */
  const [offre, setOffre] = useState<Offre>('mensuel');
  /** La feuille du code promo : appelee par « J'ai un code ». */
  const [feuilleCode, setFeuilleCode] = useState(false);

  const annuel = offre === 'annuel';
  const prixPlein = annuel ? PRIX_PRO_AN : PRIX_PRO;
  const prix = remisePct > 0 ? prixRemise(remisePct, offre) : prixPlein;

  /*
    LE CODE OFFERT ARRIVE DÉJÀ ÉCRIT. La surprise applique FIRST20 toute
    seule ; le champ le MONTRE, pour que la remise ait une explication
    visible — un prix qui baisse sans raison ressemble à une erreur.
  */
  useEffect(() => {
    if (visible && codeOffert) setCode(codeOffert);
  }, [visible, codeOffert]);

  const valideCode = () => {
    if (utiliserCode(code)) {
      alerte('Bienvenue en Pro', 'Le code a été appliqué : tout est débloqué.');
    } else {
      alerte('Code inconnu', 'Vérifiez le code — il ne correspond à aucune offre.');
    }
  };

  const acheter = async () => {
    try {
      await acheterPro(offre);
    } catch (e) {
      alerte('Achat impossible', (e as Error).message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={fermer}>
      {/* Le bord gauche ferme la page, comme la flèche et comme le bouton
          « retour » d'Android : une page qui s'ouvre en glissant doit pouvoir
          se fermer pareil. */}
      <RetourGlisse
        onRetour={fermer}
        style={[s.fond, { paddingTop: insets.top }]}>
        <View style={s.barre}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={s.rondBarre}
            hitSlop={10}
            onPress={fermer}>
            <BackChevron color={c.ink} />
          </Pressable>
          <Text style={s.titreBarre}>Abonnement</Text>
          {/*
            LE VIDE À DROITE RECENTRE LE TITRE, et rien de plus — relevé du
            patron : « un bloc blanc rond en haut à droite sans raison ». Il
            avait pris la peau du bouton de retour, ombre comprise : un
            bouton qui ne fait rien, c'est un bouton qu'on essaie.
          */}
          <View style={s.videBarre} />
        </View>

        {/*
          L'IDENTITÉ DE LA MAISON, DERRIÈRE LE TITRE.

          Le design donné par le patron pose un dégradé coloré derrière son
          en-tête ; nous, on a mieux qu'un dégradé — le RUBAN de l'accueil,
          les ondes qui disent d'où vient le nom EchoPlan. Il passe ici
          derrière le titre, bien plus discret que sur l'accueil : c'est un
          fond, pas un spectacle, et il ne reçoit jamais le doigt.
        */}
        <View style={s.ruban} pointerEvents="none">
          <LightRibbon width={largeur} palette={c} sombre={c === dark} />
        </View>

        <ScrollView
          contentContainerStyle={s.contenu}
          showsVerticalScrollIndicator={false}>
          {/*
            LE TITRE EST CENTRÉ, ET LA MARQUE PORTE LA COULEUR.

            Calibré sur le design donné par le patron : « Passer en » à
            l'encre, sur sa ligne, et le nom en dessous — plus gros, dans
            le bleu vivant qui signe le Pro partout ailleurs (le badge, la
            carte, le bouton). Aligné à gauche, le bloc penchait ; centré,
            il tient l'écran comme une affiche, et le regard tombe droit
            sur le nom.
          */}
          <Text style={s.titre}>Passer en</Text>
          <TexteVif
            texte="EchoPlan Pro"
            taille={31}
            fond={c.bg}
            style={s.titreNom}
          />
          <Text style={s.sousTitre}>
            Tout l’outil, sans compter. Résiliable à tout moment.
          </Text>

          {/*
            LE CHOIX DE LA FACTURATION, EN DEUX ONGLETS.

            Les deux prix ne se comparent pas dans la tête : 4,90 par mois
            contre 49 l'an demande une multiplication. L'onglet annuel écrit
            donc ce qu'il fait gagner, en mois offerts — c'est la seule
            façon de le rendre lisible sans calculette.
          */}
          <View style={s.segment}>
            {(['mensuel', 'annuel'] as Offre[]).map((o) => {
              const actif = offre === o;
              return (
                <Pressable
                  key={o}
                  accessibilityRole="button"
                  accessibilityLabel={
                    o === 'mensuel' ? 'Facturation mensuelle' : 'Facturation annuelle'
                  }
                  accessibilityState={{ selected: actif }}
                  style={[s.onglet, actif && s.ongletActif]}
                  onPress={() => setOffre(o)}>
                  <Text style={[s.ongletMot, actif && s.ongletMotActif]}>
                    {o === 'mensuel' ? 'Mensuel' : 'Annuel'}
                  </Text>
                  {o === 'annuel' && (
                    <Text style={s.ongletNote}>
                      {`${MOIS_OFFERTS} mois offerts`}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* La carte qu'on vend porte le contour d'or : la peau du badge,
              celle du bouton, celle de la marque. Le badge flotte AU-DESSUS
              de son bord — il vit hors du rognage du contour, sinon sa
              moitié haute serait coupée. */}
          <View style={s.carteZone}>
          <ContourVif rayon={22} fond={c.surface} style={s.carte}>
            <View style={s.carteDedans}>
              <View style={s.prixRangee}>
                <TexteVif texte={prix} taille={30} fond={c.surface} />
                <Text style={s.parQuoi}>{annuel ? '/an' : '/mois'}</Text>
                {/* L'ancien prix reste visible, barré : une remise sans
                    référence n'est qu'un prix comme un autre. */}
                {remisePct > 0 && <Text style={s.prixBarre}>{prixPlein}</Text>}
              </View>
              <Text style={s.prixNote}>
                {annuel
                  ? 'Un an d’un coup, deux mois pour rien.'
                  : 'Sans engagement : vous arrêtez quand vous voulez.'}
              </Text>

              <View style={s.separateur}>
                <View style={s.filet} />
                <Text style={s.separateurMot}>Ce que ça débloque</Text>
                <View style={s.filet} />
              </View>

              {ATOUTS.map((a) => (
                <View key={a.mot} testID="ligne-atout" style={s.atout}>
                  <Svg width={19} height={19} viewBox="0 0 24 24">
                    <Path d={SOLAIRES[a.icone]} fill={c.blue} fillRule="evenodd" />
                  </Svg>
                  <Text style={s.atoutMot}>{a.mot}</Text>
                </View>
              ))}
            </View>
          </ContourVif>
            <BadgePro style={s.badge} />
          </View>

          {/*
            DEUX LIENS SUR UNE LIGNE, SOUS LA CARTE.

            Le champ de code promo vivait ici, en toutes lettres : un champ,
            un bouton, quarante points de hauteur — et c'est le PRIX qui
            sortait de l'écran pour lui faire place. Relevé du patron :
            « tout doit être visible sans scroll ». Un code ne se saisit
            qu'une fois dans une vie d'abonné ; il passe dans une feuille
            qu'on appelle, et la restauration l'accompagne : elle non plus
            ne sert qu'à qui la cherche.
          */}
          <View style={s.liens}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restaurer l’achat"
              hitSlop={8}
              onPress={async () => {
                try {
                  const ok = await restaurerPro();
                  alerte(
                    ok ? 'Abonnement restauré' : 'Aucun achat trouvé',
                    ok
                      ? 'Votre Pro est de retour.'
                      : 'L’App Store ne connaît pas d’abonnement pour ce compte Apple.',
                  );
                } catch (e) {
                  alerte('Restauration impossible', (e as Error).message);
                }
              }}>
              <Text style={s.lien}>Restaurer l’achat</Text>
            </Pressable>
            <Text style={s.lienPoint}>·</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="J’ai un code"
              hitSlop={8}
              onPress={() => setFeuilleCode(true)}>
              <Text style={s.lien}>J’ai un code</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/*
          LE BOUTON NE QUITTE JAMAIS L'ÉCRAN.

          Il vivait au fil du texte, entre les cartes et le code promo :
          quiconque faisait défiler pour lire ce qu'il achetait devait
          remonter pour l'acheter. Épinglé en pied de page, il est là au
          moment où la décision se prend, quel que soit l'endroit où l'on
          en est de la lecture.
        */}
        <View style={[s.pied, { paddingBottom: insets.bottom + 14 }]}>
          {remisePct > 0 && (
            <Text style={s.remiseNote}>✓ Remise de bienvenue appliquée</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="S’abonner"
            style={({ pressed }) => [s.ctaCadre, pressed && s.enfonce]}
            onPress={acheter}>
            <ContourVif rayon={18} fond={c.surface} style={s.pleine}>
              <View style={s.ctaDedans}>
                {/* Une PHRASE, pas une formule — relevé du patron : « trop
                    de chiffres et de tirets ». Un seul nombre, zéro tiret. */}
                <TexteVif
                  texte={`S’abonner pour ${prix} par ${annuel ? 'an' : 'mois'}`}
                  taille={16.5}
                  fond={c.surface}
                />
              </View>
            </ContourVif>
          </Pressable>
        </View>

        {/*
          LA FEUILLE DU CODE PROMO — appelée, jamais posée.

          Elle porte le champ et son bouton, et rien d'autre : le code
          arrive déjà écrit quand la surprise l'a offert, il ne reste qu'à
          appuyer. Fermée, elle ne coûte pas un point de hauteur à la page
          qui vend.
        */}
        <Modal
          visible={feuilleCode}
          transparent
          animationType="fade"
          onRequestClose={() => setFeuilleCode(false)}>
          <Pressable
            testID="voile-code"
            style={s.voile}
            onPress={() => setFeuilleCode(false)}>
            <Pressable style={s.feuille} onPress={() => {}}>
              <Text style={s.feuilleTitre}>Code promo</Text>
              <View style={s.promo}>
                <TextInput
                  accessibilityLabel="Code promo"
                  style={s.champ}
                  placeholder="Votre code"
                  placeholderTextColor={c.inkFaint}
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Appliquer le code"
                  style={({ pressed }) => [s.btnCode, pressed && s.enfonce]}
                  onPress={valideCode}>
                  <Text style={s.btnCodeTexte}>Appliquer</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </RetourGlisse>
    </Modal>
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
      marginBottom: 6,
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
    contenu: { paddingHorizontal: 22, paddingBottom: 10 },
    /*
      LE RUBAN EST UN FOND : posé en absolu, il ne pousse rien, déborde des
      deux côtés (un ruban qui s'arrête aux marges a l'air rangé dans une
      boîte) et se tient très en retrait — vingt-deux pour cent, contre
      l'opacité pleine de l'accueil : ici, ce qu'on doit lire, c'est le
      prix.
    */
    ruban: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 56,
      height: RIBBON_H,
      alignItems: 'center',
      opacity: 0.22,
      zIndex: -1,
    },
    // Le titre est en deux morceaux : l'encre annonce, l'or nomme.
    // Le « Passer en » est la MISE EN BOUCHE : plus petit que le nom, il
    // le laisse porter l'affiche. Serré dessus (interligne court), les
    // deux lignes se lisent comme un seul titre.
    titre: {
      color: c.ink,
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 2,
    },
    titreNom: { alignSelf: 'center', marginTop: -2 },
    sousTitre: {
      color: c.inkSoft,
      fontSize: 14,
      lineHeight: 19,
      textAlign: 'center',
      marginTop: 8,
      paddingHorizontal: 8,
    },
    // Le segment : une gouttière claire, la pastille blanche glisse dedans.
    segment: {
      flexDirection: 'row',
      alignSelf: 'center',
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.pill,
      padding: 4,
      marginTop: 14,
      marginBottom: 14,
    },
    onglet: {
      paddingHorizontal: 26,
      paddingVertical: 9,
      borderRadius: radius.pill,
    },
    /*
      LA PASTILLE ACTIVE SE DÉTACHE VRAIMENT — relevé du patron : le design
      donné porte « un léger design sur les boutons mensuel/annuel ». Une
      pastille blanche posée sur du gris clair se distingue à peine ; elle
      prend donc un cheveu de bleu au bord et une ombre courte, teintée du
      bleu de la marque. On voit LEQUEL des deux est choisi sans le lire.
    */
    ongletActif: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.blueSoft,
      shadowColor: c.blue,
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    ongletMot: { color: c.inkSoft, fontSize: 14.5, fontWeight: '700' },
    ongletMotActif: { color: c.blue, fontWeight: '800' },
    /*
      LE MOT « ÉCONOMIE » VIT SUR L'ONGLET, pas dans la carte : c'est au
      moment de CHOISIR la facturation qu'on veut savoir ce que l'annuel
      fait gagner — après, il est trop tard, on a déjà choisi.
    */
    ongletNote: {
      color: c.blue,
      fontSize: 10.5,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 1,
    },
    carteZone: { alignSelf: 'stretch' },
    carte: { alignSelf: 'stretch' },
    // La place du badge sur la carte ; sa peau (blanc, or animé) est a lui.
    badge: { position: 'absolute', top: -11, right: 16 },
    carteDedans: { padding: 18, gap: 2 },
    prixRangee: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    // Cale « /mois » sur la ligne de pied du prix, à un cheveu près.
    parQuoi: { color: c.inkSoft, fontSize: 15, fontWeight: '700', marginBottom: 5 },
    prixBarre: {
      color: c.inkFaint,
      fontSize: 15,
      fontWeight: '600',
      textDecorationLine: 'line-through',
      marginBottom: 6,
    },
    prixNote: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 2 },
    separateur: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginVertical: 11,
    },
    filet: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.line },
    separateurMot: { color: c.inkFaint, fontSize: 12, fontWeight: '700' },
    atout: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3.5 },
    atoutMot: { flex: 1, color: c.ink, fontSize: 13.5, lineHeight: 18 },
    liens: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
    },
    lien: { color: c.blue, fontSize: 13, fontWeight: '600' },
    lienPoint: { color: c.inkFaint, fontSize: 13 },
    voile: {
      flex: 1,
      backgroundColor: 'rgba(8, 10, 14, 0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 26,
    },
    feuille: {
      alignSelf: 'stretch',
      borderRadius: radius.lg,
      backgroundColor: c.surface,
      padding: 20,
      ...shadowCard,
    },
    feuilleTitre: {
      color: c.ink,
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 12,
    },
    promo: { flexDirection: 'row', gap: 10 },
    champ: {
      flex: 1,
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
      color: c.ink,
      paddingHorizontal: 14,
      fontSize: 15,
    },
    btnCode: {
      height: 48,
      borderRadius: 12,
      paddingHorizontal: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnCodeTexte: { color: c.ink, fontSize: 15, fontWeight: '700' },
    // Le pied se pose SUR le fond, pas dans le défilement : il porte donc
    // sa propre surface, sinon le texte qui glisse dessous se lirait au
    // travers.
    pied: {
      paddingHorizontal: 22,
      paddingTop: 12,
      backgroundColor: c.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.line,
    },
    remiseNote: {
      color: c.blue,
      fontSize: 12.5,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 8,
    },
    ctaCadre: { height: 56 },
    pleine: { flex: 1 },
    ctaDedans: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    enfonce: { transform: [{ scale: 0.97 }] },
  });
