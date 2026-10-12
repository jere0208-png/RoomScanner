/**
 * UN FAUX PLAFOND RESTE DANS SA PIÈCE — revue « Claire », architecte
 * d'intérieur.
 *
 * Un faux plafond à 2,60 m dans le couloir d'un haussmannien à 3,20 m
 * abaissait aussi les murs que le couloir partage avec le double séjour :
 * l'élévation du séjour disait « sous 2,60 m », et la 3D laissait un vide
 * de 60 cm. La hauteur sous plafond devient une donnée de la PIÈCE ; un mur
 * mitoyen garde la hauteur de sa voisine.
 *
 * Et « Hugo » : sur un petit écran, le nom d'une pièce s'abrège avant que
 * sa surface ne disparaisse.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useScanStore } from '../src/store/scanStore';
import { hauteurDeLaPiece, roomParts, segLength, type WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const partDe = (nom: string) => {
  const r = st().rooms.find((x) => x.name === nom)!;
  return roomParts(st().walls, st().rooms).find((p) => p.roomId === r.id)!;
};

/** Un séjour, et un couloir accolé à son mur est. */
function deuxPieces() {
  st().reset();
  st().commencerAuClavier();
  const sejour = st().addRoomLibre(5, 4, 'Séjour', { auNu: true })!;
  const murs = st().walls.filter((w) => (st().rooms[0].wallIds ?? []).includes(w.id));
  const est = murs.sort((a, b) => Math.max(b.a.x, b.b.x) - Math.max(a.a.x, a.b.x) || segLength(b) - segLength(a))[0];
  st().addRoomBox(1.2, 4, 'Couloir', est.id, { auNu: true });
  st().setAllRoomHeights(3.2);
  return sejour;
}

describe('le faux plafond', () => {
  it('abaisse sa pièce, pas le mur qu’elle partage avec sa voisine', () => {
    deuxPieces();
    const couloir = st().rooms.find((r) => r.name === 'Couloir')!;
    st().setRoomHeight(couloir.id, 2.6);
    expect(hauteurDeLaPiece(partDe('Couloir'))).toBeCloseTo(2.6, 9);
    expect(hauteurDeLaPiece(partDe('Séjour'))).toBeCloseTo(3.2, 9);
    // Les murs du séjour, mitoyen compris, restent à 3,20 m.
    expect(partDe('Séjour').walls.every((w: WallSeg) => Math.abs(w.height - 3.2) < 1e-9)).toBe(true);
    // Ceux du couloir seul descendent.
    const seuls = partDe('Couloir').walls.filter((w) => !partDe('Séjour').walls.some((x) => x.id === w.id));
    expect(seuls.every((w) => Math.abs(w.height - 2.6) < 1e-9)).toBe(true);
  });

  it('remonté à la hauteur de ses murs, il s’efface ; « tout le niveau » l’efface aussi', () => {
    deuxPieces();
    const id = st().rooms.find((r) => r.name === 'Couloir')!.id;
    st().setRoomHeight(id, 2.6);
    expect(st().rooms.find((r) => r.id === id)!.hauteur).toBeCloseTo(2.6, 9);
    st().setRoomHeight(id, 3.2);
    expect(st().rooms.find((r) => r.id === id)!.hauteur).toBeUndefined();
    st().setRoomHeight(id, 2.5);
    st().setAllRoomHeights(2.7);
    expect(st().rooms.find((r) => r.id === id)!.hauteur).toBeUndefined();
    expect(hauteurDeLaPiece(partDe('Couloir'))).toBeCloseTo(2.7, 9);
  });

  it('survit à « Redétecter »', () => {
    deuxPieces();
    const id = st().rooms.find((r) => r.name === 'Couloir')!.id;
    st().setRoomHeight(id, 2.6);
    st().redetectRooms();
    expect(hauteurDeLaPiece(partDe('Couloir'))).toBeCloseTo(2.6, 9);
  });
});

describe('le cartouche sur un petit écran', () => {
  it('abrège le nom avant de taire la surface', () => {
    const plan = readFileSync(join(__dirname, '..', 'src', 'components', 'FloorplanEditor.tsx'), 'utf8');
    const i = plan.indexOf('const nomCourt = couperNom(roomName);');
    const j = plan.indexOf('variantes.push(textes.slice(0, 1));');
    expect(i).toBeGreaterThan(0);
    // La variante « nom abrégé + surface » passe AVANT celle du nom seul.
    expect(i).toBeLessThan(j);
  });
});
