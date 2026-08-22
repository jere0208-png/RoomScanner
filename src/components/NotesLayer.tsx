/**
 * LES MOTS ÉCRITS SUR LE PLAN.
 *
 * Le relevé papier posait la remarque LÀ OÙ ELLE PORTE — au droit de la
 * colonne, sur la cloison à percer — et c'est ce point qui lui donne son
 * sens : « gaine à reprendre » ne veut rien dire au milieu du salon.
 * L'application n'avait aucun endroit pour ces phrases, et elles finissaient
 * dans le nom du plan ou dans la tête de celui qui a fait le relevé.
 *
 * ELLES S'ÉCRIVENT À TAILLE CONSTANTE. Un mot tracé dans le repère du plan
 * devient illisible au dézoom et géant au zoom : c'est déjà la règle des
 * cotes, elle vaut pour les mots. Seule leur POSITION suit le plan.
 *
 * ET ELLES NE SE PEIGNENT QU'À LEUR ÉTAGE, comme les murs et les meubles —
 * une remarque sur la colonne du rez n'a rien à faire par-dessus le premier.
 */
import React from 'react';
import { G, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Palette } from '../theme';
import type { PlanNote } from '../store/scanStore';

interface Mapping {
  scale: number;
  toPx: (p: { x: number; z: number }) => { x: number; y: number };
}

/** Taille de lecture du mot, en pixels d'écran. Elle ne suit pas le zoom. */
const TAILLE = 11;
/**
 * Ce qui se peint sur le plan, et ce qui se lit en touchant.
 *
 * Une phrase entière étalée sur le dessin masque la maçonnerie qu'on est
 * venu regarder. La pastille en montre le DÉBUT — assez pour reconnaître
 * laquelle c'est — et le reste s'ouvre à l'appui, là où il y a la place.
 */
const APERCU = 22;

export function NotesLayer({
  notes,
  mapping,
  niveau,
  selectedId,
  onSelect,
  c,
}: {
  notes: PlanNote[];
  mapping: Mapping;
  /** L'étage regardé : les autres ne se peignent pas. */
  niveau: number;
  selectedId: string | null;
  onSelect?: (id: string) => void;
  c: Palette;
}) {
  return (
    <>
      {notes
        .filter((n) => (n.niveau ?? 0) === niveau)
        .map((n) => {
          const p = mapping.toPx(n.at);
          const vif = n.id === selectedId;
          const court =
            n.text.length > APERCU ? `${n.text.slice(0, APERCU - 1)}…` : n.text;
          // La largeur se déduit du nombre de caractères : mesurer un texte
          // demanderait un aller-retour natif à chaque image, pour un
          // cartouche qu'on veut simplement assez grand.
          const larg = Math.max(34, court.length * TAILLE * 0.56 + 22);
          return (
            <G
              key={n.id}
              accessibilityLabel={`Note : ${n.text}`}
              onPress={onSelect ? () => onSelect(n.id) : undefined}>
              {/* Le cartouche : un fond franc, parce qu'un mot posé sur des
                  hachures de mur ne se lit pas. */}
              <Rect
                x={p.x + 6}
                y={p.y - TAILLE}
                width={larg}
                height={TAILLE + 8}
                rx={5}
                fill={vif ? c.blue : c.surface}
                stroke={vif ? c.blue : c.line}
                strokeWidth={1}
                opacity={0.96}
              />
              {/* La punaise : c'est ELLE qui marque le point visé. Le
                  cartouche, lui, s'écarte pour ne pas couvrir ce point. */}
              <Path
                d={`M${p.x} ${p.y} l6 -4 v8 Z`}
                fill={vif ? c.blue : c.lineStrong}
              />
              <SvgText
                x={p.x + 16}
                y={p.y + 1}
                fill={vif ? '#FFFFFF' : c.ink}
                fontSize={TAILLE}
                fontWeight="600">
                {court}
              </SvgText>
            </G>
          );
        })}
    </>
  );
}
