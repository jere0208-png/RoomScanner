/**
 * TOUT BOUTON DIT SON NOM.
 *
 * L'app est faite de pictogrammes : une corbeille, un appareil photo, une
 * torche, un éclair, une croix. C'est ce qui la rend rapide sous le doigt —
 * et complètement muette pour VoiceOver, qui annonce « bouton », « bouton »,
 * « bouton ». Un électricien qui travaille en lumière rasante, un chef
 * d'équipe qui grossit les caractères, n'importe qui à qui le système lit
 * l'écran : tous tombent sur la même liste de « bouton ».
 *
 * Onze boutons étaient dans ce cas — la torche et la pause du scan, la
 * photo de repérage du mur, les quatre commandes d'un mur sur le plan, les
 * cotes d'un appareil de plafond, le retour de l'écran des résultats, le
 * nouveau dossier de la bibliothèque, la remise à zéro des cadrages.
 *
 * Cette épreuve lit le CODE plutôt qu'un rendu : elle attrape chaque
 * `<TouchableOpacity>` de l'app et exige qu'il porte un nom, ou du texte
 * qui en tienne lieu. Un bouton muet ajouté demain la fera tomber.
 */
import * as fs from 'fs';
import * as path from 'path';

const RACINE = path.join(__dirname, '..', 'src');

/** Tous les fichiers d'interface de l'app. */
function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/**
 * Un bouton se nomme de deux façons : par son étiquette
 * d'accessibilité, ou par le texte qu'il affiche — « Enregistrer » se lit
 * tout seul. Ce qui ne porte ni l'un ni l'autre est muet.
 */
function muets(src: string): number[] {
  const out: number[] = [];
  const re = /<TouchableOpacity\b((?:[^>]|\n)*?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1].includes('accessibilityLabel')) continue;
    const suite = src.slice(m.index + m[0].length, m.index + m[0].length + 400);
    if (/<Text[^>]*>\s*\{?[^<]{2,}/.test(suite)) continue;
    out.push(src.slice(0, m.index).split('\n').length);
  }
  return out;
}

describe('les boutons de l’app', () => {
  it('portent tous un nom, ou un texte qui en tient lieu', () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      const lignes = muets(fs.readFileSync(f, 'utf8'));
      for (const l of lignes) fautifs.push(`${path.basename(f)}:${l}`);
    }
    expect(`boutons muets : ${fautifs.join(', ') || 'aucun'}`).toBe(
      'boutons muets : aucun',
    );
  });

  /**
   * ET L'ÉPREUVE SAIT ENCORE VOIR UN BOUTON MUET.
   *
   * Un détecteur qui ne détecte plus rien passe au vert tous les jours.
   */
  it('et l’épreuve reconnaît encore un bouton muet', () => {
    expect(muets('<TouchableOpacity onPress={f}><Svg /></TouchableOpacity>')).toHaveLength(
      1,
    );
    expect(
      muets('<TouchableOpacity accessibilityLabel="X" onPress={f}><Svg /></TouchableOpacity>'),
    ).toHaveLength(0);
    expect(
      muets('<TouchableOpacity onPress={f}><Text>Enregistrer</Text></TouchableOpacity>'),
    ).toHaveLength(0);
  });
});
