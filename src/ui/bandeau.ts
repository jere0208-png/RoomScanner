/**
 * CE QUE LE DESSIN A RENDU À LA CARTE, LE DÉBORD LE REND AU DOIGT.
 *
 * Relevé du patron : « réduis légèrement la taille du bloc en diminuant les
 * boutons très légèrement, et surtout les blocs des champs pour les cm, ils
 * sont trop imposants ».
 *
 * Les bandeaux du bas se posent sur le plan, et chaque point qu'ils prennent
 * est un point de dessin en moins. Leurs boutons sont descendus à quarante
 * points dessinés, puis à trente-quatre — « la taille des blocs bleus des
 * boutons est trop grande, réduis sans réduire les icônes » : c'est le
 * disque qui pesait, pas le dessin. Mais la cible, elle, ne bouge pas : le
 * débord la ramène à quarante-six, au-delà des quarante-quatre du doigt. C'est déjà la règle
 * des pastilles de la rangée (« 38 dessinés, 44 sous le doigt ») ; elle vaut
 * ici pour la même raison.
 *
 * Il est EXPORTÉ d'un seul endroit : écrit dans les quatre bandeaux, il
 * aurait divergé au premier oubli, et un bouton de quarante points sans
 * débord est un bouton qu'on rate.
 */
export const DEBORD_DOIGT = { top: 6, bottom: 6, left: 6, right: 6 };
