export const colors = {
  parchment: '#EFDDB8',
  parchmentLight: '#F7EDD3',
  ink: '#2B1B12',
  leather: '#6B4226',
  leatherDark: '#4A2D1A',
  blood: '#A6321C',
  brass: '#C6952B',
  sage: '#4B5F44',
};

export const fonts = {
  display: 'Rye_400Regular',
  body: 'Arvo_400Regular',
  bodyBold: 'Arvo_700Bold',
};

export const cardLabels: Record<string, string> = {
  bang: 'Bang!', missed: 'Raté!', beer: 'Bière', duel: 'Duel', indians: 'Indiens!',
  prison: 'Prison', dynamite: 'Dynamite', barrel: 'Planque',
  saloon: 'Saloon', stagecoach: 'Diligence', wells_fargo: 'Convoi', mustang: 'Mustang', scope: 'Lunette',
  panic: 'Braquage!', cat_balou: 'Coup de foudre', gatling: 'Gatling', general_store: 'Magasin',
  schofield: 'Schofield', remington: 'Remington', carbine: 'Carabine', winchester: 'Winchester', volcanic: 'Volcanic',
};

export const equipmentTags: Record<string, string> = {
  prison: '🔒', dynamite: '💣', barrel: '🛢️', mustang: '🐎', scope: '🔭',
  schofield: '🔫', remington: '🔫', carbine: '🔫', winchester: '🔫', volcanic: '🌋',
};

export const roleLabels: Record<string, string> = {
  sheriff: 'Shérif', deputy: 'Adjoint', outlaw: 'Hors-la-loi', renegade: 'Renégat',
};

export const roleObjectives: Record<string, string> = {
  sheriff: 'Éliminer tous les Hors-la-loi et le Renégat.',
  deputy: 'Protéger le Shérif jusqu\u2019à la victoire.',
  outlaw: 'Éliminer le Shérif.',
  renegade: 'Être le dernier survivant en jeu.',
};

export const winnerTeamLabels: Record<string, string> = {
  sheriff: 'Shérif', outlaws: 'Hors-la-loi', renegade: 'Renégat',
};

export const suitLabels: Record<string, string> = {
  hearts: 'Cœur', diamonds: 'Carreau', clubs: 'Trèfle', spades: 'Pique',
};

export const characterLabels: Record<string, string> = {
  bart_cassidy: 'Bart Cassidy', black_jack: 'Black Jack', calamity_janet: 'Calamity Janet', el_gringo: 'El Gringo',
  jesse_jones: 'Jesse Jones', jourdonnais: 'Jourdonnais', kit_carlson: 'Kit Carlson', lucky_duke: 'Lucky Duke',
  paul_regret: 'Paul Regret', pedro_ramirez: 'Pedro Ramirez', rose_doolan: 'Rose Doolan', sid_ketchum: 'Sid Ketchum',
  slab_the_killer: 'Slab le Flingueur', suzy_lafayette: 'Suzy Lafayette', vulture_sam: 'Sam le Vautour', willy_the_kid: 'Willy le Kid',
};

export const characterDescriptions: Record<string, string> = {
  bart_cassidy: 'Pioche 1 carte à chaque perte de vie.',
  black_jack: 'Pioche une 3ᵉ carte si la 2ᵉ est Cœur ou Carreau.',
  calamity_janet: 'Bang! et Raté! sont interchangeables.',
  el_gringo: 'Vole une carte à qui lui inflige des dégâts.',
  jesse_jones: 'Peut piocher dans la main d\u2019un adversaire.',
  jourdonnais: 'Compte comme s\u2019il avait toujours une Planque.',
  kit_carlson: 'Regarde 3 cartes de la pioche, en garde 2.',
  lucky_duke: 'Dégaine avec 2 cartes, garde la meilleure.',
  paul_regret: 'Compte comme s\u2019il avait toujours un Mustang.',
  pedro_ramirez: 'Peut piocher depuis la défausse.',
  rose_doolan: 'Compte comme si elle avait toujours une Lunette.',
  sid_ketchum: 'Défausse 2 cartes à tout moment pour +1 PV.',
  slab_the_killer: 'Ses cibles doivent jouer 2 Raté! pour l\u2019annuler.',
  suzy_lafayette: 'Pioche 1 carte dès que sa main est vide.',
  vulture_sam: 'Récupère les cartes d\u2019un joueur éliminé.',
  willy_the_kid: 'Peut jouer autant de Bang! qu\u2019il veut.',
};

export function renderPips(current: number, max: number): string {
  const safeCurrent = Math.max(0, Math.min(current, max));
  return '●'.repeat(safeCurrent) + '○'.repeat(Math.max(0, max - safeCurrent));
}