/**
 * LE DEVIS — « combien j'en aurais pour mon installation actuelle ».
 *
 * Relevé du patron, 27/08/2026 : un bouton vert en haut de l'écran, une page
 * de questions étape par étape (le modèle d'appareillage voulu), et un prix
 * approximatif avec un récapitulatif détaillé et un plan qui EXPLIQUE ce
 * prix.
 *
 * UNE PAGE ENTIÈRE, ET PAS UNE FEUILLE. C'est la troisième forme, et les
 * deux premières ont échoué sur le même point : le défilement. Relevé du
 * patron, deux fois, la seconde sans appel — « ça ne scrolle pas du tout.
 * Fais des pages entières pas des pop-up ».
 *
 *   POURQUOI LA FEUILLE NE POUVAIT PAS MARCHER. `SheetShell` enveloppe tout
 *   son contenu dans deux `Pressable` — le voile qui ferme, et la feuille
 *   elle-même qui arrête l'appui pour ne pas se fermer sous le doigt. Un
 *   `Pressable` prend le geste DÈS LE POSÉ du doigt ; une liste posée
 *   dessous doit ensuite le lui reprendre au premier millimètre de
 *   mouvement, et ce rattrapage ne se fait pas. Réduire la page à un seul
 *   rouleau avait amélioré les choses sans les régler : le défaut n'est pas
 *   dans le nombre de zones, il est dans la coquille.
 *
 *   UNE PAGE, ELLE, N'A PAS DE COQUILLE. Le rouleau est posé à même l'écran,
 *   rien au-dessus de lui ne réclame le doigt, et le retour se fait par le
 *   chevron ou par le bord — comme sur les quatre autres écrans de
 *   l'application, qui défilent tous très bien.
 *
 * DES ÉTAPES QUI SE VOIENT. Relevé du même passage : « fais des étapes
 * modernes avec des gros titres et numéros ». Un fil de trois pastilles
 * numérotées en tête, la pastille courante pleine, celles qui sont faites
 * cochées ; puis « ÉTAPE 2 SUR 3 » et un titre qui tient sur une ligne et
 * demie. On sait où on est sans compter.
 *
 * TOUT LE DEVIS EST BLEU. Il a été vert — relevé du patron : « change le
 * vert du bouton en bleu pour le devis, et même les couleurs dans les pages,
 * on veut du bleu ; donne un style unique à ton bleu, partout ». Le vert dit
 * « conforme » dans cette application, et la pastille des normes le dit déjà
 * juste à côté : deux verts voisins pour deux choses sans rapport. C'est donc
 * `c.blue`, celui de toute l'application — une teinte qui n'existe qu'à un
 * endroit n'est pas une couleur, c'est une exception.
 *
 * LE PLAN EXPLIQUE, IL NE DÉCORE PAS — et il l'explique EN UNE FOIS. La
 * première version faisait défiler des lots entourés d'une bague verte, un
 * toutes les trois secondes ; retirée sur relevé du patron : « ne fais pas
 * l'animation, fais un simple listing avec les icônes en légende du plan ».
 * Il avait raison sur le fond — on ne lit pas un prix en attendant son tour.
 */
import React, { useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { FloorplanEditor } from '../components/FloorplanEditor';
import { DevisDemo } from '../components/DevisDemo';
import { cleDeLigne, type Devis, type LigneDevis, type LigneLegende } from '../geometry/devis';
import { chiffrerLePlan } from '../geometry/devisplan';
import { CEILINGS, CEILING_SYMBOL, type CeilingKind } from '../geometry/ceiling';
import { FIXTURES, postsSymbol, type FixtureKind } from '../geometry/electrical';
import { GAMMES } from '../geometry/prix';
import { photoDe } from '../ui/produits';
import { pourChercher } from '../ui/mots';
import { fr } from './result/format';
import { haptic } from '../ui/haptic';
import { useScanStore } from '../store/scanStore';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';

/** Un prix, écrit comme sur un ticket : virgule, et l'euro collé au nombre. */
const euros = (v: number) => `${fr(v, 2)} €`;

const ETAPES = [
  { titre: 'Quel appareillage ?', court: 'Appareillage' },
  { titre: 'Comment on compte', court: 'Méthode' },
  { titre: 'Votre estimation', court: 'Prix' },
];

/**
 * LE SYMBOLE D'UN APPAREIL, tel que le plan le dessine.
 *
 * Pas une icône « qui y ressemble » : le MÊME tracé et la MÊME couleur que
 * `FixtureLayer` et `CeilingLayer` posent sur le plan, lus dans les mêmes
 * tables. Une légende qui redessinerait ses propres symboles cesserait
 * d'être une légende le jour où l'un des deux changerait.
 *
 * Les deux calques ne dessinent pas dans la même boîte — le mur travaille
 * sur vingt-deux points de côté, le plafond sur dix-huit : chacun garde donc
 * la sienne, faute de quoi la moitié des symboles sortirait rognée.
 */
function SymboleDuPlan({ ligne }: { ligne: LigneLegende }) {
  if (ligne.plafond) {
    const kind = ligne.kind as CeilingKind;
    const spec = CEILINGS[kind];
    return (
      <Svg width={24} height={24} viewBox="-9 -9 18 18">
        {(CEILING_SYMBOL[kind] ?? []).map((seg, i) => (
          <Path
            key={i}
            d={seg.d}
            stroke={spec.color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={seg.fill ? spec.color : 'none'}
          />
        ))}
      </Svg>
    );
  }
  const kind = ligne.kind as FixtureKind;
  const spec = FIXTURES[kind];
  return (
    <Svg width={24} height={24} viewBox="-11 -11 22 22">
      {postsSymbol([kind], kind).map((seg, i) => (
        <Path
          key={i}
          d={seg.d}
          stroke={spec.color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={seg.fill ? spec.color : 'none'}
        />
      ))}
    </Svg>
  );
}

/**
 * LA VIGNETTE D'UNE LIGNE DU TICKET.
 *
 * La photo du produit quand on l'a — c'est ce que le patron a demandé, et
 * c'est ce qui fait qu'on reconnaît l'article avant de lire son nom. À
 * défaut, LE SYMBOLE DU PLAN : un article sans photo garde ainsi une image,
 * et le ticket ne se troue pas. C'est aussi ce qui rend le catalogue de
 * photos facultatif — on peut en ajouter une demain sans toucher à l'écran.
 */
function Vignette({ ligne }: { ligne: { code: string } }) {
  const photo = photoDe(ligne.code);
  if (photo) {
    return <Image source={photo} style={styles_vignette.image} resizeMode="contain" />;
  }
  const plafond = ligne.code.startsWith('plafond-');
  const kind = plafond ? ligne.code.slice(8) : ligne.code.slice(5);
  if (!ligne.code.startsWith('meca-') && !plafond) return null;
  return <SymboleDuPlan ligne={{ kind, plafond } as LigneLegende} />;
}

const styles_vignette = StyleSheet.create({
  image: { width: 38, height: 38 },
});

/**
 * UNE LIGNE DU TICKET — et le geste qui l'écarte.
 *
 * Relevé du patron : « fais en sorte qu'on puisse désélectionner des éléments
 * dans le devis si on en a pas besoin, le prix doit s'adapter ». Toute la
 * ligne est le bouton : viser une case à cocher de vingt points au milieu
 * d'une liste, sur un chantier, avec des gants, ne marche pas. La case dit ce
 * qui se passe ; c'est la ligne qui le fait.
 */
function Article({
  ligne,
  styles,
  onBasculer,
}: {
  ligne: LigneDevis;
  styles: ReturnType<typeof getStyles>;
  onBasculer: () => void;
}) {
  const hors = !!ligne.ecarte;
  return (
    <TouchableOpacity
      accessibilityLabel={`${ligne.libelle}${hors ? ', écarté du devis' : ''}`}
      accessibilityRole="button"
      activeOpacity={0.7}
      style={styles.article}
      onPress={onBasculer}>
      <View style={[styles.vignette, hors && styles.efface]}>
        <Vignette ligne={ligne} />
      </View>
      <View style={styles.texts}>
        <Text style={[styles.articleNom, hors && styles.barre]}>
          {ligne.libelle}
        </Text>
        <Text style={styles.articleDetail}>
          {ligne.pu === null
            ? `${ligne.quantite} ${ligne.unite} — pas de prix au catalogue`
            : `${ligne.quantite} ${ligne.unite} × ${euros(ligne.pu)}`}
        </Text>
        {!!ligne.note && <Text style={styles.articleNote}>{ligne.note}</Text>}
      </View>
      <Text style={[styles.articlePrix, hors && styles.barre]}>
        {hors
          ? euros((ligne.pu ?? 0) * ligne.quantite)
          : euros(ligne.total)}
      </Text>
    </TouchableOpacity>
  );
}

export function DevisScreen() {
  const c = useTheme();
  const styles = getStyles(c);
  const setScreen = useScanStore((s) => s.setScreen);
  const walls = useScanStore((s) => s.walls);
  const rooms = useScanStore((s) => s.rooms);
  const fixtures = useScanStore((s) => s.fixtures);
  const ceiling = useScanStore((s) => s.ceiling);
  const openings = useScanStore((s) => s.openings);

  const gamme = useScanStore((s) => s.gammeDevis);
  const setGamme = useScanStore((s) => s.setGammeDevis);
  const ecartes = useScanStore((s) => s.devisEcartes);
  const basculer = useScanStore((s) => s.basculerArticleDevis);
  const toutRemettre = useScanStore((s) => s.remettreLesArticlesDevis);
  const [etape, setEtape] = useState(0);
  const [cherche, setCherche] = useState('');
  const [tri, setTri] = useState<'rayon' | 'cher' | 'pasCher'>('rayon');

  /*
    LE MÊME CALCUL QUE LE BOUTON DU PLAN.

    Le total écrit sur la pastille verte et le détail de cette page sortent
    de `chiffrerLePlan` : deux lectures d'un seul calcul. Le jour où l'une
    recompterait de son côté, le bouton annoncerait un prix que la page ne
    retrouverait pas.
  */
  const horsJeu = useMemo(() => new Set(ecartes), [ecartes]);
  const devis: Devis = useMemo(
    () => chiffrerLePlan(walls, rooms, fixtures, ceiling, gamme, horsJeu, openings),
    [walls, rooms, fixtures, ceiling, gamme, horsJeu, openings],
  );

  /*
    TRIER ET CHERCHER — « si jamais la liste est longue ».

    Relevé du patron. Elle l'est : un logement complet passe la trentaine
    d'articles, et l'on cherche rarement tout le ticket — on cherche « les
    disjoncteurs » ou « ce qui coûte le plus cher ».

    PAR RAYON, LE TICKET GARDE SES SECTIONS ; dès qu'on trie par prix ou qu'on
    cherche un mot, il s'aplatit. C'est voulu : les rayons sont l'ordre dans
    lequel on remplit le chariot, et cet ordre n'a plus de sens quand on
    demande « le plus cher d'abord ». Un en-tête de rayon qui ne regrouperait
    plus rien serait un mensonge de mise en page.
  */
  const filtrees = useMemo(() => {
    const q = pourChercher(cherche.trim());
    const gardees = q
      ? devis.lignes.filter((l) =>
          pourChercher(`${l.libelle} ${l.precision ?? ''} ${l.famille}`).includes(q),
        )
      : devis.lignes;
    if (tri === 'rayon') return gardees;
    const prix = (l: LigneDevis) => (l.pu ?? 0) * l.quantite;
    return [...gardees].sort((a, b) =>
      tri === 'cher' ? prix(b) - prix(a) : prix(a) - prix(b),
    );
  }, [devis.lignes, cherche, tri]);
  /** À plat dès qu'on trie autrement ou qu'on cherche. */
  const aPlat = tri !== 'rayon' || cherche.trim().length > 0;

  const avancer = (n: number) => {
    haptic('leger');
    setEtape(n);
  };

  return (
    <RetourGlisse onRetour={() => setScreen('result')} style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.roundButton}
          accessibilityLabel="Retour"
          accessibilityRole="button"
          onPress={() => setScreen('result')}>
          <BackChevron color={c.ink} />
        </TouchableOpacity>
        <Text style={styles.titrePage}>Devis</Text>
      </View>

      {/*
        LE FIL DES ÉTAPES — relevé du patron : « fais des étapes modernes avec
        des gros titres et numéros ».

        Trois pastilles, un trait entre elles. Celle où l'on est se remplit ;
        celles qu'on a passées portent une coche et RESTENT TOUCHABLES — on
        revient sur son choix d'appareillage sans avoir à refaire le chemin.
        Celles d'après ne le sont pas : on ne saute pas la page qui dit ce
        que le prix ne contient pas.
      */}
      <View style={styles.fil}>
        {ETAPES.map((e, i) => {
          const faite = i < etape;
          const ici = i === etape;
          return (
            <React.Fragment key={e.court}>
              {i > 0 && <View style={[styles.filTrait, faite && styles.filTraitFait]} />}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Étape ${i + 1}, ${e.court}${
                  ici ? ', en cours' : faite ? ', faite' : ', à venir'
                }`}
                disabled={i > etape}
                activeOpacity={0.75}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                onPress={() => avancer(i)}
                style={styles.filCase}>
                <View
                  style={[
                    styles.pastille,
                    (ici || faite) && styles.pastillePleine,
                  ]}>
                  <Text
                    style={[
                      styles.pastilleTexte,
                      (ici || faite) && styles.pastilleTexteFort,
                    ]}>
                    {faite ? '✓' : String(i + 1)}
                  </Text>
                </View>
                <Text style={[styles.filNom, ici && styles.filNomFort]}>
                  {e.court}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>

      <Text style={styles.rang}>{`ÉTAPE ${etape + 1} SUR ${ETAPES.length}`}</Text>
      <Text style={styles.gros}>{ETAPES[etape].titre}</Text>

      {/*
        LE ROULEAU EST POSÉ À MÊME LA PAGE.

        Rien au-dessus de lui ne réclame le doigt — c'est toute la différence
        avec la feuille modale, où deux `Pressable` prenaient le geste au
        posé et ne le rendaient jamais.
      */}
      <ScrollView
        style={styles.rouleau}
        contentContainerStyle={styles.rouleauFond}
        showsVerticalScrollIndicator={false}>
        {etape === 0 && (
          <>
            <Text style={styles.sous}>
              C’est ce qui change le plus le prix : d’une gamme à l’autre, un
              même logement va du simple au double. Le reste — gaines, fils,
              boîtes, tableau — ne bouge pas.
            </Text>
            {GAMMES.map((g) => {
              const choisi = g.id === gamme;
              return (
                <TouchableOpacity
                  key={g.id}
                  accessibilityLabel={`${g.marque} ${g.nom}${
                    choisi ? ', choisi' : ''
                  }`}
                  accessibilityRole="button"
                  activeOpacity={0.75}
                  style={[styles.carte, choisi && styles.carteChoisie]}
                  onPress={() => {
                    haptic('leger');
                    setGamme(g.id);
                  }}>
                  <View style={styles.texts}>
                    <Text style={styles.carteNom}>{`${g.marque} ${g.nom}`}</Text>
                    <Text style={styles.carteNote}>{g.note}</Text>
                  </View>
                  <View style={[styles.coche, choisi && styles.cocheOn]}>
                    {choisi && <Text style={styles.cocheTexte}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {etape === 1 && (
          /*
            ON MONTRE, ON N'ÉNUMÈRE PLUS.

            Relevé du patron : « la deuxième page, on ne comprend pas bien ce
            qui est compté ». Elle listait trois exclusions — luminaires,
            main-d'œuvre, chutes — c'est-à-dire qu'elle répondait à une
            question que personne ne se pose devant un devis qu'il n'a pas
            encore vu. Ce qu'on veut savoir, c'est comment le chiffre se
            fabrique.

            La démonstration le joue : un tableau, un interrupteur, un point
            lumineux, la gaine qui part et le compteur qui monte, et le ticket
            qui se remplit ligne par ligne. Voir `DevisDemo`.
          */
          <>
            <Text style={styles.sous}>
              Le prix se calcule sur le plan que vous avez relevé : chaque
              appareil fait une ligne, chaque mètre de gaine se mesure.
            </Text>
            <DevisDemo gamme={gamme} />
            {devis.sansPrix.length > 0 && (
              /*
                CE QUE LE CATALOGUE NE SAIT PAS CHIFFRER SE DIT ICI.

                Un article sans prix compte pour zéro dans le total. Tant
                qu'on ne le dit pas, le total a l'air complet — et c'est la
                seule erreur d'un devis que personne ne rattrape.
              */
              <View style={styles.manque}>
                <Text style={styles.manqueTitre}>
                  {`${devis.sansPrix.length} article${
                    devis.sansPrix.length > 1 ? 's' : ''
                  } sans prix au catalogue`}
                </Text>
                <Text style={styles.manqueTexte}>
                  {`${devis.sansPrix.join(', ')} — comptés pour zéro dans le total.`}
                </Text>
              </View>
            )}
          </>
        )}

        {etape === 2 && (
          /*
            LE TICKET DE CAISSE — relevé du patron : « au clic on affiche une
            page entière moderne qui affiche tout bien fait comme un ticket de
            caisse… une petite image avant son titre et son prix, quantité
            etc. »

            C'est la bonne image, et pas seulement pour le décor : un ticket
            se lit d'un coup, du haut vers le bas, une ligne par article, et
            le total en gros à la fin. Personne n'a jamais eu besoin qu'on lui
            explique comment on lit un ticket.

            Les rayons du bordereau font les sections du ticket — c'est
            l'ordre dans lequel on remplit le chariot —, et chaque ligne porte
            LA PHOTO de l'article, son nom, sa quantité au prix unitaire, puis
            son total. Rien n'est replié : un ticket qu'il faut déplier n'est
            plus un ticket.
          */
          <>
            <View style={styles.entete}>
              <Text style={styles.enseigne}>ESTIMATION DE FOURNITURE</Text>
              <Text style={styles.sousEnseigne}>
                {`${GAMMES.find((g) => g.id === gamme)?.marque ?? ''} ${
                  GAMMES.find((g) => g.id === gamme)?.nom ?? gamme
                } · tarifs ${devis.version}`}
              </Text>
            </View>

            {/*
              CHERCHER ET TRIER — « si jamais la liste est longue ».

              Elle l'est : un logement complet passe la trentaine d'articles.
              Trois pastilles et un champ, posés juste sous l'en-tête, là où
              l'on regarde avant de faire défiler.
            */}
            <View style={styles.outils}>
              <TextInput
                accessibilityLabel="Chercher un article"
                style={styles.recherche}
                placeholder="Chercher un article…"
                placeholderTextColor={c.inkFaint}
                value={cherche}
                onChangeText={setCherche}
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
            <View style={styles.tris}>
              {(
                [
                  ['rayon', 'Par rayon'],
                  ['cher', 'Prix ↓'],
                  ['pasCher', 'Prix ↑'],
                ] as const
              ).map(([id, nom]) => (
                <TouchableOpacity
                  key={id}
                  accessibilityLabel={`Trier : ${nom}`}
                  accessibilityRole="button"
                  activeOpacity={0.75}
                  style={[styles.triPille, tri === id && styles.triPilleOn]}
                  onPress={() => {
                    haptic('leger');
                    setTri(id);
                  }}>
                  <Text style={[styles.triTexte, tri === id && styles.triTexteOn]}>
                    {nom}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {filtrees.length === 0 && (
              <Text style={styles.vide}>
                {`Aucun article ne correspond à « ${cherche.trim()} ».`}
              </Text>
            )}

            {aPlat
              ? filtrees.map((l) => (
                  <Article
                    key={`${l.famille}-${l.libelle}`}
                    ligne={l}
                    styles={styles}
                    onBasculer={() => {
                      haptic('leger');
                      basculer(cleDeLigne(l));
                    }}
                  />
                ))
              : devis.parFamille.map((f) => (
                  <View key={f.famille}>
                    <View style={styles.rayon}>
                      <Text style={styles.rayonNom}>{f.famille}</Text>
                      <Text style={styles.rayonPrix}>{euros(f.total)}</Text>
                    </View>
                    {filtrees
                      .filter((l) => l.famille === f.famille)
                      .map((l) => (
                        <Article
                          key={`${f.famille}-${l.libelle}`}
                          ligne={l}
                          styles={styles}
                          onBasculer={() => {
                            haptic('leger');
                            basculer(cleDeLigne(l));
                          }}
                        />
                      ))}
                  </View>
                ))}

            {/* Le trait de découpe, puis le total : la fin d'un ticket. */}
            <View style={styles.decoupe} />
            <View style={styles.rayon}>
              <Text style={styles.totalNom}>TOTAL TTC</Text>
              <Text style={styles.total}>{euros(devis.total)}</Text>
            </View>
            {/*
              CE QU'ON A ÉCARTÉ SE DIT SOUS LE TOTAL.

              Un total plus bas sans explication est un total suspect : celui
              qui reprend le devis huit jours plus tard doit voir, à côté du
              chiffre, qu'on a retiré six articles — et pouvoir tout remettre
              d'un appui.
            */}
            {ecartes.length > 0 && (
              <TouchableOpacity
                accessibilityLabel="Tout remettre au devis"
                accessibilityRole="button"
                activeOpacity={0.75}
                style={styles.remettre}
                onPress={() => {
                  haptic('leger');
                  toutRemettre();
                }}>
                <Text style={styles.remettreTexte}>
                  {`${ecartes.length} article${
                    ecartes.length > 1 ? 's' : ''
                  } écarté${ecartes.length > 1 ? 's' : ''} — tout remettre`}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={styles.mentions}>
              Fourniture seule, hors main-d’œuvre et hors luminaires. Prix
              publics approximatifs, à valider au comptoir.
            </Text>

            {/*
              LE PLAN EN PIED DE TICKET — d'où sortent ces quantités.

              Il vient APRÈS les lignes et non avant : un ticket commence par
              ce qu'on achète. Il est là pour la question qui suit — « pourquoi
              ce prix ? » — et la légende du dessus y répond déjà, appareil par
              appareil.
            */}
            <Text style={styles.rayonNom}>D’où viennent ces quantités</Text>
            <View style={styles.cadrePlan} pointerEvents="none">
              <View style={styles.plan}>
                <FloorplanEditor
                  showMeasures={false}
                  editable={false}
                  selectedWallId={null}
                  onSelectWall={() => {}}
                />
              </View>
            </View>
            {/*
              LA LÉGENDE DU PLAN, sous le plan — et avec SON symbole.

              Ici la photo du produit ne servirait à rien : ce qu'on cherche,
              c'est à relier un chiffre du ticket à un dessin du plan. On
              reprend donc le tracé EXACT que le calque pose sur le dessin,
              lu dans la même table. Une légende qui redessinerait ses propres
              symboles cesserait d'être une légende le jour où l'un des deux
              changerait.
            */}
            {devis.legende.map((l) => (
              <View key={`${l.plafond ? 'p' : 'm'}-${l.kind}`} style={styles.legende}>
                <SymboleDuPlan ligne={l} />
                <Text style={styles.legendeNom}>{l.titre}</Text>
                <Text style={styles.legendeCompte}>{`× ${l.quantite}`}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Le bouton reste POSÉ SUR LA PAGE, sous le rouleau : on ne fait pas
          défiler trente lignes pour retrouver « Continuer ». */}
      {etape < 2 && (
        <TouchableOpacity
          accessibilityLabel={etape === 0 ? 'Continuer' : 'Voir le prix'}
          accessibilityRole="button"
          activeOpacity={0.85}
          style={styles.action}
          onPress={() => avancer(etape + 1)}>
          <Text style={styles.actionTexte}>
            {etape === 0 ? 'Continuer' : 'Voir le prix'}
          </Text>
        </TouchableOpacity>
      )}
    </RetourGlisse>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
      paddingTop: 58,
      paddingHorizontal: 18,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    roundButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.07,
      shadowRadius: 8,
    },
    titrePage: {
      color: c.ink,
      fontSize: 21,
      fontWeight: '800',
      letterSpacing: -0.3,
      marginLeft: 12,
    },
    // ------------------------------------------------------ le fil d'étapes
    fil: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
    filCase: { alignItems: 'center', width: 74 },
    filTrait: {
      flex: 1,
      height: 2,
      borderRadius: 1,
      backgroundColor: c.line,
      marginTop: 15,
    },
    filTraitFait: { backgroundColor: c.blue },
    pastille: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: c.line,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pastillePleine: { backgroundColor: c.blue, borderColor: c.blue },
    pastilleTexte: { color: c.inkFaint, fontSize: 14, fontWeight: '800' },
    pastilleTexteFort: { color: '#FFFFFF' },
    filNom: { color: c.inkFaint, fontSize: 11, fontWeight: '700', marginTop: 5 },
    filNomFort: { color: c.ink },
    // ------------------------------------------------------- le gros titre
    rang: {
      color: c.blue,
      fontSize: 11.5,
      fontWeight: '800',
      letterSpacing: 1.1,
    },
    gros: {
      color: c.ink,
      fontSize: 30,
      lineHeight: 35,
      fontWeight: '800',
      letterSpacing: -0.9,
      marginTop: 2,
      marginBottom: 4,
    },
    sous: { color: c.inkFaint, fontSize: 13, lineHeight: 18, marginBottom: 14 },
    // ----------------------------------------------------------- le rouleau
    rouleau: { flex: 1 },
    rouleauFond: { paddingTop: 10, paddingBottom: 24 },
    texts: { flex: 1 },
    // -------------------------------------------------------- les gammes
    carte: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: 'transparent',
      paddingHorizontal: 15,
      paddingVertical: 14,
      marginBottom: 9,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    carteChoisie: { borderColor: c.blue },
    carteNom: { color: c.ink, fontSize: 15.5, fontWeight: '800' },
    carteNote: {
      color: c.inkFaint,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 3,
    },
    coche: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: c.inkFaint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cocheOn: { backgroundColor: c.blue, borderColor: c.blue },
    cocheTexte: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
    // ----------------------------------------------------- les exclusions
    exclusion: { flexDirection: 'row', gap: 9, marginBottom: 12 },
    tiret: { color: c.inkFaint, fontSize: 14, lineHeight: 19 },
    exclusionTexte: { flex: 1, color: c.inkSoft, fontSize: 14, lineHeight: 19 },
    manque: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      borderLeftColor: c.danger,
      paddingHorizontal: 13,
      paddingVertical: 11,
      marginTop: 6,
    },
    manqueTitre: { color: c.ink, fontSize: 13.5, fontWeight: '800' },
    manqueTexte: {
      color: c.inkFaint,
      fontSize: 12,
      lineHeight: 16.5,
      marginTop: 3,
    },
    // ----------------------------------------------- chercher et trier
    outils: { marginTop: 14 },
    recherche: {
      height: 42,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      paddingHorizontal: 16,
      color: c.ink,
      fontSize: 14.5,
    },
    tris: { flexDirection: 'row', gap: 8, marginTop: 9 },
    /* Quarante points sous le doigt : c'est une commande, pas une étiquette. */
    triPille: {
      height: 34,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    triPilleOn: { backgroundColor: c.blue },
    triTexte: { color: c.inkSoft, fontSize: 13, fontWeight: '700' },
    triTexteOn: { color: '#FFFFFF' },
    vide: {
      color: c.inkFaint,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 18,
      textAlign: 'center',
    },
    // ---------------------------------------------------------- le ticket
    /* L'en-tête d'un ticket : ce qu'on a acheté et où. Centré, en petites
       capitales espacées — la typographie d'une caisse, pas d'un formulaire. */
    entete: { alignItems: 'center', marginBottom: 6 },
    enseigne: {
      color: c.ink,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 1.6,
    },
    sousEnseigne: { color: c.inkFaint, fontSize: 11.5, marginTop: 3 },
    /* Le nom d'un rayon et son sous-total, sur la même ligne : c'est ce
       qu'on lit en diagonale pour savoir où part l'argent. */
    rayon: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: c.line,
      paddingTop: 12,
      marginTop: 16,
      marginBottom: 2,
    },
    rayonNom: {
      color: c.ink,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    rayonPrix: { color: c.ink, fontSize: 13, fontWeight: '800' },
    /* Une ligne d'article : la photo, le nom, le compte, le prix. Aucun
       cadre, aucune ombre — un ticket est une colonne, pas des cartes. */
    article: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 9,
    },
    vignette: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    articleNom: { color: c.ink, fontSize: 14, fontWeight: '700' },
    articleDetail: { color: c.inkFaint, fontSize: 12, marginTop: 2 },
    articleNote: { color: c.inkFaint, fontSize: 11, lineHeight: 15, marginTop: 3 },
    articlePrix: { color: c.ink, fontSize: 14, fontWeight: '800' },
    /* Un article écarté : barré et pâli, mais TOUJOURS LISIBLE — c'est son
       prix qu'on regarde pour décider de le remettre. */
    barre: {
      textDecorationLine: 'line-through',
      color: c.inkFaint,
      fontWeight: '600',
    },
    efface: { opacity: 0.35 },
    remettre: {
      alignSelf: 'flex-start',
      height: 34,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    remettreTexte: { color: c.blue, fontSize: 12.5, fontWeight: '700' },
    /* Le trait de découpe : deux filets, comme la perforation d'un rouleau. */
    decoupe: {
      borderTopWidth: 2,
      borderTopColor: c.ink,
      marginTop: 20,
      opacity: 0.85,
    },
    totalNom: {
      color: c.ink,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    total: {
      color: c.blue,
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: -0.9,
    },
    mentions: {
      color: c.inkFaint,
      fontSize: 11,
      lineHeight: 15.5,
      marginTop: 6,
      marginBottom: 18,
    },
    cadrePlan: {
      borderRadius: radius.md,
      backgroundColor: c.surface,
      overflow: 'hidden',
      marginTop: 8,
    },
    plan: { height: 220 },
    /* La légende du plan : le symbole, le nom, le compte. Serrée — c'est une
       liste de repérage, pas une seconde facture. */
    legende: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 5,
    },
    legendeNom: { flex: 1, color: c.inkSoft, fontSize: 12.5 },
    legendeCompte: { color: c.ink, fontSize: 12.5, fontWeight: '800' },
    // ------------------------------------------------------------ l'action
    action: {
      height: 50,
      borderRadius: radius.pill,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      marginBottom: 22,
    },
    actionTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  }),
);
