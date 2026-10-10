import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { RoomScan, RoomScanView, scanEvents, type EtatDeVisee } from 'react-native-room-scan';
import { themedStyles, useTheme, type Palette } from '../theme';
import { useScanStore } from '../store/scanStore';
import { useModeElec } from '../store/usage';
import { useRoomScan } from '../native/useRoomScan';
import { CloseCross } from '../components/CloseCross';
import { haptic } from '../ui/haptic';
import { panne as expliquer } from '../ui/panne';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GuidePose } from './scan/GuidePose';
import { aimanterHauteur, apercuDeHauteur, natureAuMur } from '../geometry/viseur';
import { PRODUITS_DU_SCAN, configurationDeLaPose, produitDuScan } from '../geometry/poseAR';
import { VignetteProduit } from '../components/VignetteProduit';
import { FondDeVerre, SUR_VERRE } from '../components/Verre';
import { alerte } from '../ui/alerte';

/** Le guide de pose a été lu : on ne le remontre plus de lui-même. */
const GUIDE_POSE_KEY = 'echoplan.guide-pose';

/*
  CE QU'ON PEUT POSER AU VISEUR — en PHOTOS, et plus en symboles.

  Relevé du patron : « revois complètement l'interface du scan pour le
  placement des produits électriques, intègre directement les éléments en
  3D, et revois aussi les icônes pour du réaliste ». Trois boutons au
  symbole de plan (« Prise · Inter · Lumière ») sont devenus un rail de onze
  produits, chacun avec la photo du catalogue et du devis (voir
  `PRODUITS_DU_SCAN`) : on choisit ce qu'on achètera, pas un trait de plan.
*/

/**
 * LA PHRASE DU VISEUR, au présent : ce qui se posera si l'on appuie.
 *
 * Le produit flotte déjà en 3D à cet endroit ; la phrase dit sa cote, celle
 * du métier (« Prise plinthe · 25 cm »), ou ce qu'il faut viser.
 */
function phraseDeVisee(kind: string, visee: EtatDeVisee | null): string {
  const produit = produitDuScan(kind);
  if (!visee || visee.kind !== kind || !visee.ok) {
    if (produit?.ou !== 'plafond') return 'Visez un mur relevé';
    return natureAuMur(kind) !== kind ? 'Visez le plafond ou un mur' : 'Visez le plafond';
  }
  if (visee.plafond) return `${produit?.mot ?? kind} · au plafond`;
  return apercuDeHauteur(natureAuMur(kind), visee.hauteur);
}

/**
 * Écran de scan. RoomPlan dessine lui-même ses guides ET la miniature 3D
 * temps réel en bas au centre — le HUD laisse cette zone libre : stats en
 * haut, commandes dans les coins inférieurs.
 */
export function ScanScreen() {
  const wallCount = useScanStore((s) => s.wallCount);
  const objectCount = useScanStore((s) => s.objectCount);
  const doorCount = useScanStore((s) => s.doorCount);
  const windowCount = useScanStore((s) => s.windowCount);
  const paused = useScanStore((s) => s.paused);
  /* Ce que RoomPlan voit mal, tant qu'on peut encore y retourner. */
  const mursDouteux = useScanStore((s) => s.mursDouteux);
  /* Le mur qui manque : on le dit en terminant, pas pendant qu'on balaie. */
  const trouContour = useScanStore((s) => s.trouContour);
  const processing = useScanStore((s) => s.processing);
  /* Ce que le post-traitement a refusé de faire : il faut bien le dire. */
  const error = useScanStore((s) => s.error);
  const { pause, resume, stop, cancel } = useRoomScan();
  /*
    LE VISEUR EST UN OUTIL D'ÉLECTRICIEN.

    Un carré au centre et trois boutons « Prise · Inter · Lumière » : pour
    quelqu'un venu relever son salon, c'est la première impression de
    l'application — et elle annonce un métier qui n'est pas le sien. Le
    grand public scanne, tout simplement ; le bloc et son guide attendent le
    mode Électricité.
  */
  const modeElec = useModeElec();
  const c = useTheme();
  const styles = getStyles(c);

  // Torche : éteinte en quittant l'écran.
  const [torch, setTorch] = useState(false);
  /**
   * CE QU'ON A POSÉ AU VISEUR — le compte, et le refus.
   *
   * Relevé du chantier : « pendant un scan, permet d'ajouter manuellement
   * des PC, inter, point lumineux ». On est DEVANT le mur : c'est le
   * moment. Le compte rassure (on sait ce qu'on a saisi), et le refus se
   * dit franchement quand le rayon ne rencontre rien — poser au jugé
   * mettrait un appareil au hasard dans le plan.
   */
  /*
    CE QU'ON A POSÉ, DANS L'ORDRE — pour compter, et pour retirer le dernier.
    Le compte seul ne disait pas QUOI : la pile garde le produit de chaque
    pose, et le dernier se montre en photo à côté du compte.
  */
  const [posees, setPosees] = useState<string[]>([]);
  const poses = posees.length;
  const [refus, setRefus] = useState<string | null>(null);
  /*
    LE PRODUIT CHOISI AU RAIL — celui qui flotte au viseur, en 3D, à la cote
    où il se posera. Une prise d'abord : c'est ce qu'on pose le plus.
  */
  const [choisi, setChoisi] = useState<string>('prise');
  /* Ce que le natif dit viser, dix fois par seconde au plus. */
  const [visee, setVisee] = useState<EtatDeVisee | null>(null);
  /*
    LE RAIL SE RANGE, pour voir la pièce en grand le temps d'un balayage — et
    il COMMENCE rangé. Relevé du patron : « lors du scan, réduis le menu Poser
    par défaut ». Un scan commence par balayer la pièce, pas par poser des
    prises : la pastille « Poser » attend contre le bord qu'on la touche. Le
    viseur et son produit en 3D ne tournent qu'à ce moment-là — la caméra et
    la batterie sont au relevé d'abord.
  */
  const [railOuvert, setRailOuvert] = useState(false);
  /*
    CE QU'ON VIENT DE POSER, ET À QUELLE COTE.

    Relevé du patron : « un message doit apparaître sans gêner : "Prise
    plinthe placée à 25 cm" ». L'application ne pose plus à la hauteur du
    doigt mais à la cote du métier (voir `aimanterHauteur`) — il faut donc
    le DIRE, sinon l'électricien croit avoir raté sa visée.

    Il s'efface tout seul et rend la place au compte : un message qui reste
    devient un bandeau de plus, et c'est justement ce qu'on nous demande
    d'éviter.
  */
  const [annonce, setAnnonce] = useState<string | null>(null);
  const minuteurAnnonce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (minuteurAnnonce.current) clearTimeout(minuteurAnnonce.current);
    },
    [],
  );
  /*
    LE GUIDE S'OUVRE UNE FOIS, à la première ouverture du rail.

    Relevé du chantier : les trois boutons « ne sont pas forcément
    compréhensibles de tous ». On explique donc AVANT de s'en servir — et
    jamais plus ensuite : une explication qui revient à chaque scan devient
    un obstacle, et on finit par la fermer sans la lire. Le « ? » du bloc la
    rouvre quand on la veut.

    Elle s'ouvrait à la première caméra ; le rail commence maintenant rangé
    (voir `railOuvert`) : elle attend qu'on touche « Poser », là où elle
    explique ce qu'on a sous les yeux.
  */
  const [guide, setGuide] = useState(false);
  const guideLu = useRef<boolean | null>(null);
  useEffect(() => {
    let vivant = true;
    AsyncStorage.getItem(GUIDE_POSE_KEY)
      .then((vu) => {
        if (vivant) guideLu.current = vu === '1';
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);
  const ouvrirLeRail = () => {
    setRailOuvert(true);
    if (guideLu.current === false) setGuide(true);
  };
  const fermerGuide = () => {
    setGuide(false);
    guideLu.current = true;
    AsyncStorage.setItem(GUIDE_POSE_KEY, '1').catch(() => {});
  };
  /*
    LES MODÈLES PARTENT UNE FOIS, au premier scan en mode Électricité : la
    prise, l'interrupteur, l'applique en 3D, et les règles de hauteur. Le
    natif les garde, même si sa vue naît après l'envoi.
  */
  const configure = useRef(false);
  useEffect(() => {
    if (!modeElec || configure.current) return;
    configure.current = true;
    RoomScan.configurerPose(configurationDeLaPose()).catch(() => {});
  }, [modeElec]);
  /*
    LE PRODUIT FLOTTE QUAND ON PEUT LE POSER, et seulement alors : en pause,
    pendant l'assemblage, rail rangé, il n'y a rien à viser — et une visée
    à vingt images par seconde pour rien, c'est de la batterie.
  */
  const viseurActif = modeElec && railOuvert && !paused && !processing;
  useEffect(() => {
    RoomScan.choisirAuViseur(viseurActif ? choisi : null);
  }, [viseurActif, choisi]);
  useEffect(() => () => RoomScan.choisirAuViseur(null), []);
  /*
    LE VISEUR DIT S'IL A TROUVÉ OÙ POSER — et la main le sent : un petit
    déclic quand le produit s'accroche au mur. On ne regarde pas l'écran en
    permanence en balayant une pièce.
  */
  const accroche = useRef(false);
  useEffect(() => {
    const abo = scanEvents.addListener('onVisee', (e: EtatDeVisee) => {
      setVisee(e);
      if (e.ok && !accroche.current) haptic('accroche');
      accroche.current = !!e.ok;
    });
    return () => abo.remove();
  }, []);
  const produit = produitDuScan(choisi) ?? PRODUITS_DU_SCAN[0];
  const pret = !!visee && visee.kind === choisi && visee.ok;
  const derniere = useMemo(
    () => (posees.length > 0 ? produitDuScan(posees[posees.length - 1]) : undefined),
    [posees],
  );

  const poser = async (kind: string) => {
    const pose = await RoomScan.poserAuViseur(kind);
    if (pose) {
      setPosees((l) => [...l, kind]);
      setRefus(null);
      haptic('succes');
      /*
        AU PLAFOND, LA POSITION SE DÉCIDE APRÈS.

        Le centrage a besoin du contour de la pièce, que le scan ne livre
        qu'à la fin. On annonce donc ce qui va se passer plutôt qu'une cote
        qu'on n'a pas : promettre un chiffre faux serait pire que se taire.
      */
      /*
        ET AU MUR, ON DIT « APPLIQUE ».

        Le bouton « Lumière » pose un `dcl`, qui n'a pas de cote murale :
        l'annonce restait donc muette pour une applique, le seul appareil
        qu'on posait sans que rien ne le confirme. C'est la même traduction
        que fait l'ancrage (`natureAuMur`) — les deux ne peuvent plus se
        contredire.
      */
      const mot = pose.plafond
        ? kind === 'dcl'
          ? 'Point lumineux — il sera centré dans la pièce'
          : `${produitDuScan(kind)?.mot ?? 'Appareil'} posé au plafond`
        : aimanterHauteur(natureAuMur(kind), pose.height).mot;
      if (mot) {
        setAnnonce(mot);
        if (minuteurAnnonce.current) clearTimeout(minuteurAnnonce.current);
        minuteurAnnonce.current = setTimeout(() => setAnnonce(null), 3200);
      }
    } else {
      /*
        LE REFUS DIT QUOI VISER. Un produit de plafond ne se pose pas sur
        un mur, et l'inverse : la phrase le dit au lieu d'un « non » sec.
      */
      const ou = produitDuScan(kind)?.ou;
      setRefus(
        ou !== 'plafond'
          ? 'Visez un mur déjà relevé — balayez-le d’abord'
          : natureAuMur(kind) !== kind
          ? 'Visez un mur relevé ou le plafond de la pièce'
          : 'Visez le plafond de la pièce',
      );
      haptic('alerte');
      /*
        ET LE REFUS S'EFFACE, COMME L'ANNONCE.

        Il ne partait qu'à la pose suivante RÉUSSIE : on balayait la pièce
        pendant deux minutes avec, sous les yeux, un reproche qui ne valait
        plus. Trois secondes suffisent à le lire ; passé ce délai, l'écran
        appartient au relevé.
      */
      if (minuteurAnnonce.current) clearTimeout(minuteurAnnonce.current);
      minuteurAnnonce.current = setTimeout(() => setRefus(null), 3200);
    }
  };
  useEffect(() => {
    return () => {
      RoomScan.setTorch(false).catch(() => {});
    };
  }, []);
  /**
   * LA CROIX DEMANDE, quand il y a quelque chose à perdre.
   *
   * Elle est en haut à gauche, là où se pose l'index de la main qui tient
   * le téléphone : c'est le bouton qu'on frôle, pas celui qu'on cherche. Et
   * ce qu'il jette ne se rattrape pas — un relevé n'a pas d'annulation.
   *
   * Mais tant que rien n'est relevé, il ne demande rien : une confirmation
   * inutile est une confirmation qu'on apprend à balayer sans lire.
   */
  const abandonner = () => {
    if (wallCount === 0) {
      cancel();
      return;
    }
    alerte(
      'Abandonner ce relevé ?',
      `${wallCount} mur${wallCount > 1 ? 's' : ''} déjà relevé${
        wallCount > 1 ? 's' : ''
      } — rien ne sera enregistré.`,
      [
        { label: 'Continuer le scan' },
        { label: 'Abandonner', danger: true, onPress: cancel },
      ],
    );
  };
  /*
    TERMINER, SAUF SI UN MUR MANQUE — et on le dit à ce moment-là, pas
    pendant qu'on balaie : un voyant qui s'allume au milieu d'un relevé en
    cours se lit comme une faute, alors que les murs arrivent un par un.

    Une pièce dont un pan n'a pas été vu ressort OUVERTE : le plan la
    referme ensuite en ligne droite, à la main, et l'on ne sait plus ce
    qu'il y avait là. Le natif repère deux bouts de mur libres qui se font
    face (`trouDuContour`) ; dix secondes devant ce pan valent mieux qu'une
    retouche au bureau.
  */
  const terminer = () => {
    if (wallCount < 3 || !(trouContour >= 0.3)) {
      stop();
      return;
    }
    const m =
      trouContour < 1
        ? `${Math.round(trouContour * 100)} cm`
        : `${trouContour.toFixed(1).replace('.', ',')} m`;
    alerte(
      'Il manque un mur',
      `Le contour n’est pas fermé : un pan d’environ ${m} n’a pas été vu. ` +
        'Balayez-le avant de terminer — sinon il faudra le refermer à la main sur le plan.',
      [
        { label: 'Continuer le scan' },
        { label: 'Terminer quand même', onPress: stop },
      ],
    );
  };
  const toggleTorch = () => {
    const next = !torch;
    setTorch(next);
    RoomScan.setTorch(next).catch(() => {});
  };

  const stats: [string, number][] = [
    ['Murs', wallCount],
    ['Portes', doorCount],
    ['Fenêtres', windowCount],
    ['Objets', objectCount],
  ];

  return (
    <View style={styles.container}>
      {/* La vue AR native se rend elle-même à 60 FPS ; l'UI RN flotte au-dessus. */}
      <RoomScanView style={StyleSheet.absoluteFill} />

      {/*
        LA CROIX ET LA TORCHE S'EFFACENT PENDANT L'ASSEMBLAGE.

        Elles portent un `zIndex` et flottaient donc AU-DESSUS du voile
        d'assemblage, qui n'en a pas : on pouvait abandonner un relevé
        pendant que RoomPlan le calculait. Le résultat arrivait quand même
        quelques secondes plus tard, et ouvrait le plan qu'on venait de
        jeter. Il n'y a rien à faire pendant ces secondes-là : on retire ce
        qui peut être frôlé.
      */}
      {!processing && (
        <TouchableOpacity
          style={[styles.cancelButton, SUR_VERRE]}
          accessibilityLabel="Arrêter le scan"
          onPress={abandonner}>
          <FondDeVerre rayon={20} sombre voile={0.55} />
          <CloseCross size={20} color={c.scanInk} weight={3} />
        </TouchableOpacity>
      )}

      {/* Torche : rond façon bouton de thème, avec un éclair. */}
      <TouchableOpacity
        style={[
          styles.torchButton,
          torch ? styles.torchButtonOn : SUR_VERRE,
          processing && styles.cacheEnAssemblage,
        ]}
        accessibilityLabel={torch ? 'Éteindre la torche' : 'Allumer la torche'}
        onPress={toggleTorch}>
        {!torch && <FondDeVerre rayon={20} sombre voile={0.55} />}
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M13 2 L5 13.5 h5 L8 22 l8.5 -11.5 h-5 z"
            stroke={torch ? '#0B0D12' : '#F4F6FA'}
            strokeWidth={2}
            strokeLinejoin="round"
            fill={torch ? '#0B0D12' : 'none'}
          />
        </Svg>
      </TouchableOpacity>

      {/* RoomPlan affiche déjà ses propres instructions : pas de doublon. */}
      <View style={styles.topHud} pointerEvents="none">
        <View style={[styles.statsPill, SUR_VERRE]}>
          <FondDeVerre rayon={16} sombre voile={0.55} />
          {stats.map(([label, n], i) => (
            <View key={label} style={[styles.stat, i > 0 && styles.statBorder]}>
              <Text style={styles.statValue}>{n}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
        {paused && (
          <View style={[styles.instructionPill, styles.pausedPill]}>
            <Text style={styles.instructionText}>Scan en pause</Text>
          </View>
        )}
        {/*
          CE QUE LE RELEVÉ VOIT MAL, PENDANT QU'ON PEUT ENCORE Y RETOURNER.

          RoomPlan accorde une confiance à chaque surface et nous la donne
          deux fois par seconde ; l'app n'en gardait que le nombre de murs.
          C'est pourtant là que tout se joue : un mur douteux se repasse en
          dix secondes tant qu'on est dans la pièce, et coûte une demi-heure
          de retouches une fois rentré — trous à combler, linteaux à
          remonter, pièces qui ne se referment pas.

          Un compte, pas une liste : on ne lit pas un inventaire en
          balayant une pièce. Et rien du tout quand tout est franc — un
          voyant qui s'allume toujours n'avertit plus de rien.
        */}
        {!paused && mursDouteux > 0 && (
          <View style={[styles.instructionPill, styles.douteuxPill]}>
            <View style={styles.instructionDot} />
            <Text style={styles.instructionText}>
              {`${mursDouteux} mur${mursDouteux > 1 ? 's' : ''} mal vu${
                mursDouteux > 1 ? 's' : ''
              } · repassez lentement dessus`}
            </Text>
          </View>
        )}
      </View>

      {/*
        LE VISEUR, ET CE QU'ON Y POSE — refait de fond en comble.

        Relevé du patron : « revois complètement l'interface du scan pour le
        placement des produits électriques, intègre directement les éléments
        en 3D, et revois aussi les icônes pour du réaliste ».

        — AU CENTRE, le viseur, et le PRODUIT EN 3D qui y flotte (le natif le
          dessine : voir `ScenePoseAR`), plaqué au mur visé, à la cote où il
          se posera. Le viseur passe au vert quand le produit a trouvé où
          s'accrocher, et la phrase dessous dit ce qui se posera :
          « Prise plinthe · 25 cm ».
        — À DROITE, le rail des produits, en photos : on choisit ce qu'on
          achètera, pas un symbole. Il se range pour balayer la pièce en
          grand.
        — SOUS LE POUCE, le déclencheur, à la photo du produit choisi : un
          appui, le produit se pose et reste au mur, en vrai.
        — À GAUCHE, ce qu'on a posé : le compte, le dernier en photo, et la
          flèche qui le retire — on vise mal une fois sur dix.
      */}
      {modeElec && !paused && !processing && railOuvert && (
        <>
          <View style={styles.viseur} pointerEvents="none">
            {(['viseurHG', 'viseurHD', 'viseurBG', 'viseurBD'] as const).map((coin) => (
              <View
                key={coin}
                style={[styles.viseurCoin, styles[coin], pret ? styles.viseurPret : styles.viseurAttente]}
              />
            ))}
          </View>
          <View style={[styles.phraseViseur, SUR_VERRE]} pointerEvents="none">
            <FondDeVerre rayon={14} sombre voile={0.55} />
            <Text style={styles.phraseViseurTexte} numberOfLines={1}>
              {/* Le refus passe avant tout : c'est le seul cas où le geste
                  n'a rien produit. Puis la cote qu'on vient de poser, tant
                  qu'elle est fraîche ; la visée en direct reprend ensuite. */}
              {refus ?? annonce ?? phraseDeVisee(choisi, visee)}
            </Text>
          </View>

          <View style={[styles.rail, SUR_VERRE]}>
            <FondDeVerre rayon={18} sombre voile={0.55} />
            <View style={styles.railTete}>
              <TouchableOpacity
                style={styles.railBouton}
                accessibilityLabel="À quoi servent ces boutons"
                onPress={() => setGuide(true)}>
                <Text style={styles.railBoutonTexte}>?</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.railBouton}
                accessibilityLabel="Ranger la pose"
                onPress={() => setRailOuvert(false)}>
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Path d="M9 5 L16 12 L9 19" stroke={c.scanInk} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </Svg>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.railDefile}
              contentContainerStyle={styles.railContenu}
              showsVerticalScrollIndicator={false}>
              {PRODUITS_DU_SCAN.map((p, i) => {
                const actif = p.kind === choisi;
                const nouveauRayon = i > 0 && PRODUITS_DU_SCAN[i - 1].ou !== p.ou;
                return (
                  <View key={p.kind}>
                    {nouveauRayon && <Text style={styles.railRayon}>Plafond</Text>}
                    <TouchableOpacity
                      style={[styles.tuile, actif && styles.tuileActive]}
                      accessibilityLabel={`Choisir ${p.mot}`}
                      accessibilityState={{ selected: actif }}
                      onPress={() => {
                        if (p.kind !== choisi) haptic('leger');
                        setChoisi(p.kind);
                      }}>
                      <View style={styles.tuilePhoto}>
                        <VignetteProduit code={p.photo} libelle={p.mot} taille={38} />
                      </View>
                      <Text style={[styles.tuileMot, actif && styles.tuileMotActif]} numberOfLines={2}>
                        {p.mot}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* Le déclencheur : la photo du produit choisi, sous le pouce. */}
          <TouchableOpacity
            style={[styles.declencheur, !pret && styles.declencheurAttente]}
            accessibilityRole="button"
            accessibilityLabel={`Poser ${produit.mot} à l’endroit visé`}
            onPress={() => poser(choisi)}>
            <View style={styles.declencheurCoeur}>
              <VignetteProduit code={produit.photo} libelle={produit.mot} taille={40} />
            </View>
          </TouchableOpacity>

          {poses > 0 && (
            <View style={[styles.posees, SUR_VERRE]}>
              <FondDeVerre rayon={18} sombre voile={0.55} />
              <TouchableOpacity
                style={styles.poseesRetirer}
                accessibilityLabel="Retirer le dernier appareil posé"
                onPress={async () => {
                  if (await RoomScan.retirerDerniereAncre()) {
                    setPosees((l) => l.slice(0, -1));
                    haptic('leger');
                  }
                }}>
                <Text style={styles.poseesRetirerTexte}>↺</Text>
              </TouchableOpacity>
              {derniere && (
                <VignetteProduit code={derniere.photo} libelle={derniere.mot} taille={26} />
              )}
              <Text style={styles.poseesTexte}>
                {`${poses} posé${poses > 1 ? 's' : ''}`}
              </Text>
            </View>
          )}
        </>
      )}
      {/* Rail rangé : une pastille pour le rouvrir, et rien d'autre sur la vue. */}
      {modeElec && !paused && !processing && !railOuvert && (
        <TouchableOpacity
          style={[styles.railFerme, SUR_VERRE]}
          accessibilityLabel="Afficher la pose"
          onPress={ouvrirLeRail}>
          <FondDeVerre rayon={18} sombre voile={0.55} />
          <VignetteProduit code={produit.photo} libelle={produit.mot} taille={24} />
          <Text style={styles.railFermeTexte}>Poser</Text>
        </TouchableOpacity>
      )}

      {/* Coins inférieurs uniquement : le centre-bas appartient à la
          miniature 3D live de RoomPlan. */}
      <View style={styles.bottomHud} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.pauseButton, SUR_VERRE]}
          accessibilityLabel={paused ? 'Reprendre le scan' : 'Mettre en pause'}
          onPress={paused ? resume : pause}>
          <FondDeVerre rayon={27} sombre voile={0.55} />
          {/* Icône dessinée : même hauteur (18) que l'éclair et la croix. */}
          <Svg width={18} height={18} viewBox="0 0 24 24">
            {paused ? (
              <Path
                d="M8 4.5 L19.5 12 L8 19.5 z"
                fill="#F4F6FA"
                stroke="#F4F6FA"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            ) : (
              <>
                <Path
                  d="M8.5 5 v14"
                  stroke="#F4F6FA"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
                <Path
                  d="M15.5 5 v14"
                  stroke="#F4F6FA"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
              </>
            )}
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity style={styles.stopButton} onPress={terminer}>
          <Text style={styles.stopText}>Terminer</Text>
        </TouchableOpacity>
      </View>

      {/*
        L'EXPLICATION PASSE AVANT LE SCAN, pas pendant.

        Elle s'ouvre sur l'écran encore vide — au moment où l'on découvre
        ces boutons —, et le scan continue derrière : RoomPlan tourne, la
        pièce se relève, rien n'est perdu à lire trois phrases.
      */}
      <GuidePose visible={modeElec && guide && !processing} onFermer={fermerGuide} />

      {/*
        UNE FIN DE SCAN QUI ÉCHOUE SE DIT ICI.

        Le post-traitement de RoomPlan échoue parfois — c'est le cas connu,
        « aucun mur détecté ». Le magasin retenait bien le message, mais
        SEUL l'écran d'accueil l'affiche : on restait donc devant une caméra
        morte, sans un mot, à réappuyer sur « Terminer » sur une session
        déjà close. L'application paraissait plantée alors qu'elle avait
        parfaitement compris.

        Le message se dit là où l'on est, et la sortie est à côté.
      */}
      {!!error && !processing && (
        <View style={styles.pannePanneau}>
          {/*
            LE MÊME TEXTE QUE PARTOUT AILLEURS. Ce panneau disait déjà la
            bonne chose — c'est ici que le ton juste avait été trouvé — et il
            l'écrivait en dur, pour lui seul. Il le prend maintenant à la
            source commune : une consigne qui ne vit qu'à un endroit ne peut
            pas se contredire ailleurs.
          */}
          <Text style={styles.panneTitre}>{expliquer('releve').titre}</Text>
          <Text style={styles.panneTexte}>
            {expliquer('releve', error).message}
          </Text>
          <TouchableOpacity
            style={styles.panneBouton}
            accessibilityLabel="Quitter le scan"
            onPress={cancel}>
            <Text style={styles.panneBoutonTexte}>Quitter le scan</Text>
          </TouchableOpacity>
        </View>
      )}

      {processing && (
        <View style={styles.processing}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.processingTitle}>Assemblage du modèle 3D…</Text>
          <Text style={styles.processingText}>
            Murs et ouvertures sont en cours de calcul, puis les pièces sont
            reconnues et nommées d'après le mobilier trouvé dedans.
          </Text>
        </View>
      )}
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  /* Le panneau d'échec : au milieu, lisible sur la caméra, avec sa sortie. */
  pannePanneau: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '38%',
    zIndex: 5,
    backgroundColor: 'rgba(11,13,18,0.92)',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  panneTitre: { color: '#F4F6FA', fontSize: 17, fontWeight: '700' },
  panneTexte: {
    color: '#C6CDD8',
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  panneBouton: {
    marginTop: 8,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: '#F4F6FA',
  },
  panneBoutonTexte: { color: '#0B0D12', fontSize: 15, fontWeight: '700' },
  cancelButton: {
    position: 'absolute',
    top: 58,
    left: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.scanPillSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchButton: {
    position: 'absolute',
    top: 58,
    right: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.scanPillSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchButtonOn: { backgroundColor: '#F4F6FA' },
  /* Sous le voile d'assemblage : plus rien à toucher. */
  cacheEnAssemblage: { opacity: 0, zIndex: 0 },
  /* Le viseur : quatre coins, pas un cadre plein — on doit VOIR le mur. */
  /*
    LE CARRÉ EST OÙ LE RAYON PART, ET PAS AILLEURS.

    Il était dessiné à 46 % de la hauteur — quatre points au-dessus du
    centre, pour dégager la miniature 3D du bas. Mais le rayon qui pose
    l'appareil part du CENTRE EXACT de l'image (0,5 ; 0,5) : l'appareil se
    posait donc quelques centimètres sous le carré qu'on venait de viser.

    Relevé du chantier : « centre l'élément au carré que l'on a au milieu de
    l'écran ». Deux repères pour un seul geste, c'est un de trop : le carré
    descend au centre vrai, là où le rayon tire.
  */
  viseur: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 74,
    height: 74,
    marginLeft: -37,
    marginTop: -37,
  },
  viseurCoin: {
    position: 'absolute',
    width: 20,
    height: 20,
  },
  /* Blanc tant qu'il cherche, vert quand le produit s'est accroché. */
  viseurAttente: { borderColor: 'rgba(244,246,250,0.85)' },
  viseurPret: { borderColor: '#34C759' },
  viseurHG: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  viseurHD: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  viseurBG: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  viseurBD: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  /* La phrase du viseur, juste sous lui : on la lit sans quitter la cible. */
  phraseViseur: {
    position: 'absolute',
    top: '50%',
    marginTop: 50,
    alignSelf: 'center',
    maxWidth: '70%',
    backgroundColor: c.scanPill,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  phraseViseurTexte: { color: c.scanInk, fontSize: 13.5, fontWeight: '600' },
  /*
    LE RAIL DES PRODUITS, contre le bord droit, sous la torche : une colonne
    de photos qui défile. Soixante-six points de large — la photo, son mot
    sur deux lignes, et rien qui morde sur la pièce qu'on scanne.
  */
  rail: {
    position: 'absolute',
    right: 10,
    top: 108,
    bottom: 204,
    width: 68,
    backgroundColor: c.scanPill,
    borderRadius: 18,
    paddingTop: 4,
    overflow: 'hidden',
  },
  railTete: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  railBouton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  railBoutonTexte: { color: c.scanInk, fontSize: 15, fontWeight: '700', opacity: 0.9 },
  railDefile: { flex: 1 },
  railContenu: { paddingHorizontal: 4, paddingBottom: 8, gap: 4 },
  railRayon: {
    color: 'rgba(244,246,250,0.62)',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  tuile: {
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tuileActive: { borderColor: '#34C759', backgroundColor: 'rgba(52,199,89,0.16)' },
  /* La photo sur un rond clair : un produit blanc se lit sur la vue sombre. */
  tuilePhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(244,246,250,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tuileMot: {
    color: 'rgba(244,246,250,0.78)',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 11,
  },
  tuileMotActif: { color: c.scanInk, fontWeight: '800' },
  /* Le déclencheur, comme celui d'un appareil photo : un anneau, un cœur. */
  declencheur: {
    position: 'absolute',
    right: 12,
    bottom: 118,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#F4F6FA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,14,20,0.35)',
  },
  declencheurAttente: { opacity: 0.6 },
  declencheurCoeur: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F4F6FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Ce qu'on a posé : le compte, le dernier en photo, la flèche qui le retire. */
  posees: {
    position: 'absolute',
    left: 12,
    bottom: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.scanPill,
    borderRadius: 18,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 12,
  },
  poseesRetirer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,246,250,0.14)',
  },
  poseesRetirerTexte: { color: c.scanInk, fontSize: 16, fontWeight: '700' },
  poseesTexte: { color: c.scanInk, fontSize: 13, fontWeight: '700' },
  /* Le rail rangé : une pastille contre le bord, à la photo du produit choisi. */
  railFerme: {
    position: 'absolute',
    right: 10,
    top: 108,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.scanPill,
    borderRadius: 18,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
  },
  railFermeTexte: { color: c.scanInk, fontSize: 13, fontWeight: '700' },
  topHud: {
    position: 'absolute',
    top: 58,
    left: 66,
    right: 66,
    alignItems: 'center',
  },
  statsPill: {
    flexDirection: 'row',
    backgroundColor: c.scanPill,
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 2,
  },
  stat: { alignItems: 'center', paddingHorizontal: 9 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)' },
  statValue: { color: c.scanInk, fontSize: 15, fontWeight: '600' },
  statLabel: {
    color: 'rgba(244,246,250,0.62)',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 1,
  },
  instructionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.scanPillSoft,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 10,
  },
  pausedPill: { backgroundColor: 'rgba(232,161,59,0.85)' },
  /* Ambre comme la pause : c'est un avertissement, pas une faute. */
  douteuxPill: { backgroundColor: 'rgba(232,161,59,0.9)' },
  instructionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.blue,
    marginRight: 8,
  },
  instructionText: { color: c.scanInk, fontSize: 14, fontWeight: '600' },
  bottomHud: {
    position: 'absolute',
    bottom: 46,
    left: 22,
    right: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pauseButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: c.scanPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIcon: { color: c.scanInk, fontSize: 16, fontWeight: '700' },
  stopButton: {
    backgroundColor: c.blue,
    borderRadius: 27,
    paddingHorizontal: 26,
    paddingVertical: 16,
    shadowColor: c.blue,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  stopText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  processing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,10,14,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  processingTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 18,
  },
  processingText: {
    color: 'rgba(244,246,250,0.65)',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
}));
