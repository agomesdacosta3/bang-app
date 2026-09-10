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

export const suitLabels: Record<string, string> = {
  hearts: 'Cœur', diamonds: 'Carreau', clubs: 'Trèfle', spades: 'Pique',
};

export const characterLabels: Record<string, string> = {
  bart_cassidy: 'Bart Cassidy', black_jack: 'Black Jack', calamity_janet: 'Calamity Janet', el_gringo: 'El Gringo',
  jesse_jones: 'Jesse Jones', jourdonnais: 'Jourdonnais', kit_carlson: 'Kit Carlson', lucky_duke: 'Lucky Duke',
  paul_regret: 'Paul Regret', pedro_ramirez: 'Pedro Ramirez', rose_doolan: 'Rose Doolan', sid_ketchum: 'Sid Ketchum',
  slab_the_killer: 'Slab le Flingueur', suzy_lafayette: 'Suzy Lafayette', vulture_sam: 'Sam le Vautour', willy_the_kid: 'Willy le Kid',
};

export function renderPips(current: number, max: number): string {
  const safeCurrent = Math.max(0, Math.min(current, max));
  return '●'.repeat(safeCurrent) + '○'.repeat(Math.max(0, max - safeCurrent));
}