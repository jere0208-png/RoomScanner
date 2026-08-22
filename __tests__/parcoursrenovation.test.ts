/**
 * UNE RENOVATION, DU TABLEAU TROUVE AU DOSSIER REMIS.
 *
 * Cinquieme parcours complet. Un releve de renovation porte DEUX
 * installations : celle qui existe et celle qu'on va poser. La premiere ne
 * se dessine pas sur le plan — c'est une liste de departs, relevee devant
 * le tableau ouvert, un quart d'heure debout dans un couloir — mais elle
 * voyage avec le scan et s'imprime dans le dossier.
 *
 * C'est aussi le seul endroit ou l'application PORTE UN JUGEMENT sur du
 * travail deja fait : « porte-fusible », « pas de differentiel 30 mA »,
 * « aucune reserve au tableau ». Un jugement qui se trompe coute un devis.
 *
 * On verifie la chaine : ce qui est note se retrouve dans le diagnostic, le
 * diagnostic dans le dossier, et le tout survit a l'enregistrement — car ce
 * quart d'heure debout dans le couloir fait partie de ce qu'un telephone
 * qui meurt ne doit pas coûter.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { diagnosticExistant } from '../src/geometry/existant';
import { buildScanPdf } from '../src/export/pdf';

const st = () => useScanStore.getState();

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

describe('le parcours complet d’une renovation', () => {
  it('va du tableau trouve au dossier remis', () => {
    // 1. Le plan du logement.
    st().commencerAuClavier();
    st().addRoomBox(5, 4, 'Sejour');

    // 2. Le tableau trouve sur place : deux rangees de treize, pleines.
    st().decrireTableau({ rangees: 2, parRangee: 13 });
    expect(st().existant).toBeTruthy();

    // 3. Ce qu'on lit dedans : un AGCP, des porte-fusibles, et AUCUN
    //    differentiel 30 mA. C'est l'installation d'avant 1991.
    st().ajouterDepart({ organe: 'agcp', calibre: 45 });
    for (let i = 0; i < 6; i++) {
      st().ajouterDepart({
        organe: 'fusible',
        calibre: 16,
        usage: `Circuit ${i + 1}`,
      });
    }
    expect(st().existant!.departs).toHaveLength(7);

    // 4. On corrige une etiquette mal lue, on retire un depart en double.
    const premier = st().existant!.departs[1];
    st().modifierDepart(premier.id, { usage: 'Prises cuisine' });
    expect(
      st().existant!.departs.find((d) => d.id === premier.id)!.usage,
    ).toBe('Prises cuisine');
    st().retirerDepart(st().existant!.departs[6].id);
    expect(st().existant!.departs).toHaveLength(6);

    // 5. LE DIAGNOSTIC dit ce qui expose, et il le dit clairement.
    const constats = diagnosticExistant(st().existant!.departs, {
      rangees: 2,
      parRangee: 13,
    });
    /*
      UN CONSTAT PORTE UN TITRE ET UN REMEDE, PAS UN CODE.

      Le banc cherchait d'abord un `code`, par analogie avec le controle des
      normes du neuf. Ce n'en est pas un : `diagnosticExistant` juge du
      travail deja fait, et sa sortie est faite pour etre LUE — un titre, un
      detail, et un remede qui devient une ligne de devis. On verifie donc
      ce qui compte : que les deux dangers soient nommes.
    */
    const dit = constats.map((c) => `${c.titre} ${c.detail} ${c.remede}`).join(' | ');
    // Des porte-fusibles : l'installation est d'avant, ca se remplace.
    expect(dit).toMatch(/fusible/i);
    // Et surtout : personne n'est protege.
    expect(dit).toMatch(/diff[ée]rentiel/i);
    // Chaque constat porte son remede : sans lui, le diagnostic accuse
    // sans dire quoi faire, et ne se chiffre pas.
    for (const c of constats) {
      expect(c.remede.length).toBeGreaterThan(3);
    }

    // 6. TOUT SURVIT A L'ENREGISTREMENT ET A LA REOUVERTURE : le quart
    //    d'heure debout dans le couloir ne se refait pas.
    st().commitCurrent();
    const id = st().currentSaveId!;
    expect(st().saves[0].existant!.departs).toHaveLength(6);
    st().reset();
    st().openSave(id);
    expect(st().existant!.departs).toHaveLength(6);
    expect(st().existant!.rangees).toBe(2);
    expect(
      st().existant!.departs.find((d) => d.usage === 'Prises cuisine'),
    ).toBeTruthy();

    // 7. LE DOSSIER porte le tableau trouve : c'est ce qui justifie le
    //    devis de remise aux normes.
    const pdf = latin1(
      buildScanPdf(
        {
          name: 'Renovation Pasteur',
          walls: st().walls,
          openings: st().openings,
          objects: [],
          rooms: st().rooms,
        },
        false,
        { metre: true, existant: st().existant ?? undefined },
      ),
    );
    expect(pdf).toContain('Prises cuisine');
  });
});
