export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export interface DeckCard { type: string; suit: Suit; value: number; }
export interface CardInstance extends DeckCard { id: string; }

export type RoleName = 'sheriff' | 'deputy' | 'outlaw' | 'renegade';
export type WinnerTeam = 'sheriff' | 'outlaws' | 'renegade';

export interface OfflinePlayer {
  id: string;
  seatPosition: number;
  isBot: boolean;
  nickname: string;
  character: string;
  role: RoleName;
  isSheriff: boolean;
  isAlive: boolean;
  lifePoints: number;
  maxLifePoints: number;
  hasPlayedBangThisTurn: boolean;
}

export interface PendingTargetState {
  playerId: string;
  isCurrentTurn: boolean;
  cancelsNeeded: number;
  cancelsAchieved: number;
  barrelTriesUsed: number;
  orderIndex?: number;
}

export interface PendingState {
  type: string;
  initiatorId: string;
  targets: PendingTargetState[];
  eventId: string | null;
}

export interface GameEvent {
  id: string;
  eventType: string;
  actorSeat: number | null;
  targetSeat: number | null;
  cardType: string | null;
  amount: number | null;
  drawnSuit: string | null;
  drawnValue: number | null;
  drawnSuit2: string | null;
  drawnValue2: number | null;
  threadId: string;
  createdAt: number;
}

export interface OfflineGameState {
  status: 'in_progress' | 'finished';
  players: OfflinePlayer[];
  hands: Record<string, CardInstance[]>;
  equipment: Record<string, CardInstance[]>;
  deck: CardInstance[];
  discardPile: CardInstance[];
  generalStoreCards: CardInstance[];
  currentPlayerId: string;
  turnPhase: 'draw' | 'play';
  pending: PendingState | null;
  events: GameEvent[];
  winnerTeam: WinnerTeam | null;
  killedBy: Record<string, string | null>;
}