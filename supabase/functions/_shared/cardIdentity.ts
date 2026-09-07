const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

export function randomSuitValue() {
  return { suit: SUITS[Math.floor(Math.random() * 4)], value: 2 + Math.floor(Math.random() * 13) };
}