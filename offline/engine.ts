import { CardInstance, DeckCard, GameEvent, OfflineGameState, OfflinePlayer, PendingState, RoleName } from './types';
import { buildDeck } from './deck';
import { shuffle, newId } from './utils';
import { computeDistance } from '../lib/distance';
import { getWeaponRange, WEAPON_TYPES } from '../lib/weapons';

const ROLE_SETUP: Record<number, { outlaws: number; deputies: number }> = {
  4: { outlaws: 2, deputies: 0 }, 5: { outlaws: 2, deputies: 1 },
  6: { outlaws: 3, deputies: 1 }, 7: { outlaws: 3, deputies: 2 },
};

function toCard(c: DeckCard): CardInstance {
  return { id: newId('card'), ...c };
}

export class OfflineEngine {
  private state: OfflineGameState;

  private constructor(state: OfflineGameState) {
    this.state = state;
  }

  static create(humanNickname: string, botCount: number): OfflineEngine {
    const total = 1 + botCount;
    if (!ROLE_SETUP[total]) throw new Error('Nombre de joueurs invalide (4 à 7 au total)');

    const basePlayers: OfflinePlayer[] = [];
    basePlayers.push({
      id: newId('player'), seatPosition: 0, isBot: false, nickname: humanNickname,
      role: 'outlaw', isSheriff: false, isAlive: true, lifePoints: 4, maxLifePoints: 4, hasPlayedBangThisTurn: false,
    });
    for (let i = 0; i < botCount; i++) {
      basePlayers.push({
        id: newId('player'), seatPosition: i + 1, isBot: true, nickname: `Bandit ${i + 1}`,
        role: 'outlaw', isSheriff: false, isAlive: true, lifePoints: 4, maxLifePoints: 4, hasPlayedBangThisTurn: false,
      });
    }

    const { outlaws, deputies } = ROLE_SETUP[total];
    const shuffledForRoles = shuffle(basePlayers);
    const sheriff = shuffledForRoles[0];
    const renegade = shuffledForRoles[1];
    const outlawPlayers = shuffledForRoles.slice(2, 2 + outlaws);
    const deputyPlayers = shuffledForRoles.slice(2 + outlaws, 2 + outlaws + deputies);

    sheriff.role = 'sheriff'; sheriff.isSheriff = true;
    renegade.role = 'renegade';
    outlawPlayers.forEach(p => { p.role = 'outlaw'; });
    deputyPlayers.forEach(p => { p.role = 'deputy'; });

    let deck = buildDeck().map(toCard);
    const hands: Record<string, CardInstance[]> = {};

    for (const p of basePlayers) {
      const life = p.isSheriff ? 5 : 4;
      p.lifePoints = life; p.maxLifePoints = life;
      hands[p.id] = deck.slice(-life);
      deck = deck.slice(0, -life);
    }

    const state: OfflineGameState = {
      status: 'in_progress',
      players: basePlayers.sort((a, b) => a.seatPosition - b.seatPosition),
      hands,
      equipment: Object.fromEntries(basePlayers.map(p => [p.id, []])),
      deck,
      discardPile: [],
      generalStoreCards: [],
      currentPlayerId: sheriff.id,
      turnPhase: 'draw',
      pending: null,
      events: [],
      winnerTeam: null,
    };

    return new OfflineEngine(state);
  }

  getState(): OfflineGameState {
    return JSON.parse(JSON.stringify(this.state));
  }

  getHumanId(): string {
    return this.state.players.find(p => !p.isBot)!.id;
  }

  // ---------- Aides internes ----------

  private player(id: string): OfflinePlayer {
    const p = this.state.players.find(pl => pl.id === id);
    if (!p) throw new Error('Joueur introuvable');
    return p;
  }

  private alivePlayers(): OfflinePlayer[] {
    return this.state.players.filter(p => p.isAlive);
  }

  private hand(id: string): CardInstance[] {
    return this.state.hands[id] ?? [];
  }

  private equip(id: string): CardInstance[] {
    return this.state.equipment[id] ?? [];
  }

  private seatedForDistance() {
    return this.state.players.map(p => ({ id: p.id, seat_position: p.seatPosition, is_alive: p.isAlive }));
  }

  private distanceFlags() {
    const mustangIds = new Set<string>();
    const scopeIds = new Set<string>();
    for (const [pid, cards] of Object.entries(this.state.equipment)) {
      if (cards.some(c => c.type === 'mustang')) mustangIds.add(pid);
      if (cards.some(c => c.type === 'scope')) scopeIds.add(pid);
    }
    return { mustangIds, scopeIds };
  }

  distanceBetween(fromId: string, toId: string): number {
    return computeDistance(this.seatedForDistance(), fromId, toId, this.distanceFlags());
  }

  weaponRange(playerId: string): number {
    return getWeaponRange(this.equip(playerId).map(c => c.type));
  }

  private logEvent(type: string, fields: {
    actorSeat?: number; targetSeat?: number; cardType?: string; amount?: number;
    drawnSuit?: string; drawnValue?: number; drawnSuit2?: string; drawnValue2?: number; threadId?: string;
  } = {}): string {
    const id = newId('evt');
    const event: GameEvent = {
      id, eventType: type,
      actorSeat: fields.actorSeat ?? null, targetSeat: fields.targetSeat ?? null,
      cardType: fields.cardType ?? null, amount: fields.amount ?? null,
      drawnSuit: fields.drawnSuit ?? null, drawnValue: fields.drawnValue ?? null,
      drawnSuit2: fields.drawnSuit2 ?? null, drawnValue2: fields.drawnValue2 ?? null,
      threadId: fields.threadId ?? id, createdAt: Date.now(),
    };
    this.state.events.push(event);
    return id;
  }

  private drawFromDeck(n: number): CardInstance[] {
    if (this.state.deck.length < n) {
      const reshuffled = shuffle(this.state.discardPile);
      this.state.deck = [...reshuffled, ...this.state.deck];
      this.state.discardPile = [];
    }
    const drawn = this.state.deck.slice(-n);
    this.state.deck = this.state.deck.slice(0, -n);
    return drawn;
  }

  private degainer(playerId: string, threadId?: string): CardInstance {
    const [drawn] = this.drawFromDeck(1);
    this.state.discardPile.push(drawn);
    this.logEvent('degainer_draw', { actorSeat: this.player(playerId).seatPosition, drawnSuit: drawn.suit, drawnValue: drawn.value, threadId });
    return drawn;
  }

  private startPending(type: string, initiatorId: string, targets: { playerId: string; isCurrentTurn: boolean; cancelsNeeded?: number }[], eventId?: string) {
    this.state.pending = {
      type, initiatorId, eventId: eventId ?? null,
      targets: targets.map((t, i) => ({
        playerId: t.playerId, isCurrentTurn: t.isCurrentTurn, cancelsNeeded: t.cancelsNeeded ?? 1,
        cancelsAchieved: 0, barrelTriesUsed: 0, orderIndex: i,
      })),
    };
  }

  private clearPending() {
    this.state.pending = null;
  }

  private advanceTurn(fromId: string) {
    const alive = this.alivePlayers().sort((a, b) => a.seatPosition - b.seatPosition);
    const idx = alive.findIndex(p => p.id === fromId);
    const next = alive[(idx + 1) % alive.length] ?? alive[0];
    this.state.currentPlayerId = next.id;
    this.state.turnPhase = 'draw';
  }

  private applyDamage(playerId: string, amount: number, causedByPlayerId?: string, threadId?: string) {
    const p = this.player(playerId);
    p.lifePoints = Math.max(0, p.lifePoints - amount);
    const eliminated = p.lifePoints <= 0;
    this.logEvent('damage_taken', { actorSeat: p.seatPosition, amount, threadId });

    if (eliminated) {
      p.isAlive = false;
      this.state.discardPile.push(...this.hand(playerId));
      this.state.hands[playerId] = [];
      this.state.discardPile.push(...this.equip(playerId));
      this.state.equipment[playerId] = [];
      this.logEvent('player_eliminated', { actorSeat: p.seatPosition, threadId });
      this.checkVictory(playerId);
    }
  }

  private checkVictory(eliminatedId: string) {
    const eliminated = this.player(eliminatedId);
    const alive = this.alivePlayers();

    if (eliminated.role === 'sheriff') {
      if (alive.length === 1 && alive[0].role === 'renegade') {
        this.state.winnerTeam = 'renegade';
      } else {
        this.state.winnerTeam = 'outlaws';
      }
      this.state.status = 'finished';
      return;
    }
    if (alive.length === 1 && alive[0].role === 'renegade') {
      this.state.winnerTeam = 'renegade';
      this.state.status = 'finished';
      return;
    }
    const enemiesRemain = alive.some(p => p.role === 'outlaw' || p.role === 'renegade');
    if (!enemiesRemain) {
      this.state.winnerTeam = 'sheriff';
      this.state.status = 'finished';
    }
  }

  private assertOwnTurnPlayPhase(playerId: string) {
    if (this.state.status !== 'in_progress') throw new Error('La partie n’est pas en cours');
    if (this.state.pending) throw new Error('Une réponse est déjà en attente');
    if (this.state.currentPlayerId !== playerId) throw new Error('Ce n’est pas votre tour');
    if (this.state.turnPhase !== 'play') throw new Error('Ce n’est pas la phase de jeu');
  }

  private removeFromHand(playerId: string, cardId: string): CardInstance {
    const hand = this.hand(playerId);
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx === -1) throw new Error('Cette carte n’est pas dans votre main');
    const [card] = hand.splice(idx, 1);
    return card;
  }

  private findHandCardByType(playerId: string, type: string): CardInstance {
    const card = this.hand(playerId).find(c => c.type === type);
    if (!card) throw new Error(`Vous n’avez pas de carte ${type} en main`);
    return card;
  }

  // ---------- Début de tour ----------

  performDrawPhaseDegainer(playerId: string): boolean {
    const me = this.player(playerId);
    const equipment = this.equip(playerId);
    const dynamite = equipment.find(c => c.type === 'dynamite');
    const prison = equipment.find(c => c.type === 'prison');
    if (!dynamite && !prison) throw new Error('Rien à dégainer');

    if (dynamite) {
      const drawn = this.degainer(playerId);
      this.state.equipment[playerId] = equipment.filter(c => c.id !== dynamite.id);
      const explodes = drawn.suit === 'spades' && drawn.value >= 2 && drawn.value <= 9;

      if (explodes) {
        this.state.discardPile.push(dynamite);
        this.applyDamage(playerId, 3);
        if (!this.player(playerId).isAlive) {
          if (this.state.status === 'in_progress') { this.advanceTurn(playerId); }
          return true;
        }
      } else {
        const alive = this.alivePlayers().sort((a, b) => a.seatPosition - b.seatPosition);
        const idx = alive.findIndex(p => p.id === playerId);
        const neighbor = alive[(idx + 1) % alive.length];
        const passId = this.logEvent('dynamite_passed', { actorSeat: neighbor.seatPosition });
        this.state.equipment[neighbor.id] = [...this.equip(neighbor.id), { ...dynamite, id: newId('card') }];
        void passId;
      }
    }

    if (prison && this.player(playerId).isAlive) {
      const drawn = this.degainer(playerId);
      this.state.equipment[playerId] = this.equip(playerId).filter(c => c.id !== prison.id);
      this.state.discardPile.push(prison);
      if (drawn.suit !== 'hearts') {
        this.logEvent('prison_failed', { actorSeat: me.seatPosition });
        this.advanceTurn(playerId);
        return true;
      }
      this.logEvent('prison_escaped', { actorSeat: me.seatPosition });
    }

    return false;
  }

  drawCards(playerId: string) {
    if (this.state.status !== 'in_progress') throw new Error('La partie n’est pas en cours');
    if (this.state.pending) throw new Error('Une réponse est déjà en attente');
    if (this.state.currentPlayerId !== playerId) throw new Error('Ce n’est pas votre tour');
    if (this.state.turnPhase !== 'draw') throw new Error('Ce n’est pas la phase de pioche');
    if (this.equip(playerId).some(c => c.type === 'dynamite' || c.type === 'prison')) throw new Error('Vous devez d’abord dégainer');

    const drawn = this.drawFromDeck(2);
    this.state.hands[playerId] = [...this.hand(playerId), ...drawn];
    this.player(playerId).hasPlayedBangThisTurn = false;
    this.state.turnPhase = 'play';
  }

  // ---------- Cartes offensives ----------

  playBang(playerId: string, targetId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const me = this.player(playerId);
    const hasVolcanic = this.equip(playerId).some(c => c.type === 'volcanic');
    if (!hasVolcanic && me.hasPlayedBangThisTurn) throw new Error('Une seule carte Bang! par tour');
    const target = this.player(targetId);
    if (!target.isAlive) throw new Error('Cible invalide');
    const distance = this.distanceBetween(playerId, targetId);
    const range = this.weaponRange(playerId);
    if (distance > range) throw new Error(`Hors de portée (distance ${distance}, votre arme porte à ${range})`);

    const card = this.findHandCardByType(playerId, 'bang');
    this.removeFromHand(playerId, card.id);
    this.state.discardPile.push(card);
    me.hasPlayedBangThisTurn = true;

    const eventId = this.logEvent('bang_played', { actorSeat: me.seatPosition, targetSeat: target.seatPosition });
    this.startPending('bang_response', playerId, [{ playerId: targetId, isCurrentTurn: true }], eventId);
  }

  respondBang(playerId: string, action: 'missed' | 'try_barrel' | 'drink_beer' | 'accept_damage') {
    this.respondSingleTargetAttack('bang_response', playerId, action);
  }

  playGatling(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const me = this.player(playerId);
    const card = this.findHandCardByType(playerId, 'gatling');
    this.removeFromHand(playerId, card.id);
    this.state.discardPile.push(card);
    const eventId = this.logEvent('gatling_played', { actorSeat: me.seatPosition });
    const others = this.alivePlayers().filter(p => p.id !== playerId);
    this.startPending('gatling_response', playerId, others.map(p => ({ playerId: p.id, isCurrentTurn: true })), eventId);
  }

  respondGatling(playerId: string, action: 'missed' | 'try_barrel' | 'drink_beer' | 'accept_damage') {
    this.respondSingleTargetAttack('gatling_response', playerId, action, true);
  }

  private respondSingleTargetAttack(type: string, playerId: string, action: string, multi = false) {
    if (!this.state.pending || this.state.pending.type !== type) throw new Error('Aucune réponse en attente');
    const target = this.state.pending.targets.find(t => t.playerId === playerId);
    if (!target) throw new Error('Ce n’est pas à vous de répondre');
    const me = this.player(playerId);
    const threadId = this.state.pending.eventId ?? undefined;

    let resolved = false;
    if (action === 'missed') {
      const card = this.findHandCardByType(playerId, 'missed');
      this.removeFromHand(playerId, card.id);
      this.state.discardPile.push(card);
      this.logEvent('missed_played', { actorSeat: me.seatPosition, threadId });
      target.cancelsAchieved += 1;
      resolved = target.cancelsAchieved >= target.cancelsNeeded;
    } else if (action === 'try_barrel') {
      const hasBarrel = this.equip(playerId).some(c => c.type === 'barrel');
      if (!hasBarrel) throw new Error('Vous n’avez pas de Planque en jeu');
      if (target.barrelTriesUsed >= 1) throw new Error('Vous avez déjà utilisé votre essai de Planque');
      target.barrelTriesUsed += 1;
      const drawn = this.degainer(playerId, threadId);
      if (drawn.suit !== 'hearts') {
        this.logEvent('barrel_failed', { actorSeat: me.seatPosition, threadId });
        return;
      }
      this.logEvent('barrel_used', { actorSeat: me.seatPosition, threadId });
      target.cancelsAchieved += 1;
      resolved = target.cancelsAchieved >= target.cancelsNeeded;
    } else if (action === 'drink_beer') {
      const aliveCount = this.alivePlayers().length;
      if (aliveCount <= 2) throw new Error('La Bière n’a aucun effet à 2 joueurs ou moins');
      if (me.lifePoints > 1) throw new Error('Cette option n’est possible que si le tir est mortel');
      const card = this.findHandCardByType(playerId, 'beer');
      this.removeFromHand(playerId, card.id);
      this.state.discardPile.push(card);
      me.lifePoints = 1;
      this.logEvent('beer_saved_from_death', { actorSeat: me.seatPosition, threadId });
      resolved = true;
    } else if (action === 'accept_damage') {
      this.applyDamage(playerId, 1, this.state.pending.initiatorId, threadId);
      resolved = true;
    } else {
      throw new Error('Action inconnue');
    }

    if (!this.state.pending) return; // la partie a pu se terminer entre-temps

    if (!multi) {
      if (resolved) this.clearPending();
      return;
    }

    if (resolved) {
      this.state.pending.targets = this.state.pending.targets.filter(t => t.playerId !== playerId);
      if (this.state.pending.targets.length === 0) this.clearPending();
    }
  }

  playDuel(playerId: string, targetId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const target = this.player(targetId);
    if (!target.isAlive || targetId === playerId) throw new Error('Cible invalide');
    const card = this.findHandCardByType(playerId, 'duel');
    this.removeFromHand(playerId, card.id);
    this.state.discardPile.push(card);
    const eventId = this.logEvent('duel_played', { actorSeat: this.player(playerId).seatPosition, targetSeat: target.seatPosition });
    this.startPending('duel_response', playerId, [
      { playerId: targetId, isCurrentTurn: true },
      { playerId, isCurrentTurn: false },
    ], eventId);
  }

  respondDuel(playerId: string, action: 'discard_bang' | 'drink_beer' | 'accept_damage') {
    if (!this.state.pending || this.state.pending.type !== 'duel_response') throw new Error('Aucun Duel en attente');
    const myTarget = this.state.pending.targets.find(t => t.playerId === playerId && t.isCurrentTurn);
    if (!myTarget) throw new Error('Ce n’est pas à vous de répondre au Duel');
    const me = this.player(playerId);
    const threadId = this.state.pending.eventId ?? undefined;

    if (action === 'discard_bang') {
      const card = this.findHandCardByType(playerId, 'bang');
      this.removeFromHand(playerId, card.id);
      this.state.discardPile.push(card);
      const opponent = this.state.pending.targets.find(t => t.playerId !== playerId)!;
      myTarget.isCurrentTurn = false;
      opponent.isCurrentTurn = true;
      this.logEvent('duel_bang_discarded', { actorSeat: me.seatPosition, threadId });
    } else if (action === 'drink_beer') {
      const aliveCount = this.alivePlayers().length;
      if (aliveCount <= 2) throw new Error('La Bière n’a aucun effet à 2 joueurs ou moins');
      if (me.lifePoints > 1) throw new Error('Cette option n’est possible que si le tir est mortel');
      const card = this.findHandCardByType(playerId, 'beer');
      this.removeFromHand(playerId, card.id);
      this.state.discardPile.push(card);
      me.lifePoints = 1;
      this.logEvent('beer_saved_from_death', { actorSeat: me.seatPosition, threadId });
      this.clearPending();
    } else if (action === 'accept_damage') {
      const opponent = this.state.pending.targets.find(t => t.playerId !== playerId)!;
      this.applyDamage(playerId, 1, opponent.playerId, threadId);
      if (this.state.pending) this.clearPending();
    } else {
      throw new Error('Action inconnue');
    }
  }

  playIndians(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const card = this.findHandCardByType(playerId, 'indians');
    this.removeFromHand(playerId, card.id);
    this.state.discardPile.push(card);
    const eventId = this.logEvent('indians_played', { actorSeat: this.player(playerId).seatPosition });
    const others = this.alivePlayers().filter(p => p.id !== playerId);
    this.startPending('indians_response', playerId, others.map(p => ({ playerId: p.id, isCurrentTurn: true })), eventId);
  }

  respondIndians(playerId: string, action: 'discard_bang' | 'drink_beer' | 'accept_damage') {
    if (!this.state.pending || this.state.pending.type !== 'indians_response') throw new Error('Aucun Indiens! en attente');
    const target = this.state.pending.targets.find(t => t.playerId === playerId);
    if (!target) throw new Error('Vous n’avez pas à répondre à cet Indiens!');
    const me = this.player(playerId);
    const threadId = this.state.pending.eventId ?? undefined;

    if (action === 'discard_bang') {
      const card = this.findHandCardByType(playerId, 'bang');
      this.removeFromHand(playerId, card.id);
      this.state.discardPile.push(card);
      this.logEvent('indians_defended', { actorSeat: me.seatPosition, threadId });
    } else if (action === 'drink_beer') {
      const aliveCount = this.alivePlayers().length;
      if (aliveCount <= 2) throw new Error('La Bière n’a aucun effet à 2 joueurs ou moins');
      if (me.lifePoints > 1) throw new Error('Cette option n’est possible que si le tir est mortel');
      const card = this.findHandCardByType(playerId, 'beer');
      this.removeFromHand(playerId, card.id);
      this.state.discardPile.push(card);
      me.lifePoints = 1;
      this.logEvent('beer_saved_from_death', { actorSeat: me.seatPosition, threadId });
    } else if (action === 'accept_damage') {
      this.applyDamage(playerId, 1, this.state.pending.initiatorId, threadId);
    } else {
      throw new Error('Action inconnue');
    }

    if (!this.state.pending) return;
    this.state.pending.targets = this.state.pending.targets.filter(t => t.playerId !== playerId);
    if (this.state.pending.targets.length === 0) this.clearPending();
  }

  playPanic(playerId: string, targetId: string, source: 'hand' | 'in_play', cardType?: string): string {
    this.assertOwnTurnPlayPhase(playerId);
    const target = this.player(targetId);
    if (!target.isAlive || targetId === playerId) throw new Error('Cible invalide');
    if (this.distanceBetween(playerId, targetId) > 1) throw new Error('Hors de portée (Braquage! : portée 1)');

    const panicCard = this.findHandCardByType(playerId, 'panic');
    let stolenType = '';

    if (source === 'hand') {
      const targetHand = this.hand(targetId);
      if (!targetHand.length) throw new Error('Ce joueur n’a aucune carte en main');
      const idx = Math.floor(Math.random() * targetHand.length);
      const [stolen] = targetHand.splice(idx, 1);
      this.state.hands[playerId] = [...this.hand(playerId), stolen];
      stolenType = stolen.type;
    } else {
      const targetEquip = this.equip(targetId);
      const idx = targetEquip.findIndex(c => c.type === cardType);
      if (idx === -1) throw new Error('Ce joueur n’a pas cette carte en jeu');
      const [stolen] = targetEquip.splice(idx, 1);
      this.state.equipment[playerId] = [...this.equip(playerId), stolen];
      stolenType = stolen.type;
    }

    this.removeFromHand(playerId, panicCard.id);
    this.state.discardPile.push(panicCard);
    this.logEvent('panic_played', { actorSeat: this.player(playerId).seatPosition, targetSeat: target.seatPosition, cardType: stolenType });
    return stolenType;
  }

  playCatBalou(playerId: string, targetId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const target = this.player(targetId);
    if (!target.isAlive || targetId === playerId) throw new Error('Cible invalide');
    if (!this.hand(targetId).length && !this.equip(targetId).length) throw new Error('Ce joueur n’a aucune carte à défausser');

    const card = this.findHandCardByType(playerId, 'cat_balou');
    this.removeFromHand(playerId, card.id);
    this.state.discardPile.push(card);
    const eventId = this.logEvent('catbalou_played', { actorSeat: this.player(playerId).seatPosition, targetSeat: target.seatPosition });
    this.startPending('cat_balou_discard', playerId, [{ playerId: targetId, isCurrentTurn: true }], eventId);
  }

  respondCatBalou(playerId: string, handCardId?: string, inPlayCardType?: string) {
    if (!this.state.pending || this.state.pending.type !== 'cat_balou_discard') throw new Error('Aucun choix de défausse en attente');
    if (!this.state.pending.targets.some(t => t.playerId === playerId)) throw new Error('Ce n’est pas à vous de choisir');
    const me = this.player(playerId);
    const threadId = this.state.pending.eventId ?? undefined;
    let cardType = '';

    if (handCardId) {
      const card = this.removeFromHand(playerId, handCardId);
      this.state.discardPile.push(card);
      cardType = card.type;
    } else if (inPlayCardType) {
      const equip = this.equip(playerId);
      const idx = equip.findIndex(c => c.type === inPlayCardType);
      if (idx === -1) throw new Error('Vous n’avez pas cette carte en jeu');
      const [card] = equip.splice(idx, 1);
      this.state.discardPile.push(card);
      cardType = card.type;
    } else {
      throw new Error('Indiquez une carte à défausser');
    }

    this.logEvent('card_discarded_forced', { actorSeat: me.seatPosition, cardType, threadId });
    this.clearPending();
  }

  playPrison(playerId: string, targetId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const target = this.player(targetId);
    if (!target.isAlive) throw new Error('Cible invalide');
    if (target.isSheriff) throw new Error('Impossible de jouer Prison sur le Shérif');
    if (this.equip(targetId).some(c => c.type === 'prison')) throw new Error('Ce joueur est déjà en prison');

    const card = this.findHandCardByType(playerId, 'prison');
    this.removeFromHand(playerId, card.id);
    this.logEvent('prison_played', { actorSeat: this.player(playerId).seatPosition, targetSeat: target.seatPosition });
    this.state.equipment[targetId] = [...this.equip(targetId), card];
  }

  playDynamite(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    if (this.equip(playerId).some(c => c.type === 'dynamite')) throw new Error('Vous avez déjà une Dynamite en jeu');
    const card = this.findHandCardByType(playerId, 'dynamite');
    this.removeFromHand(playerId, card.id);
    this.logEvent('dynamite_played', { actorSeat: this.player(playerId).seatPosition });
    this.state.equipment[playerId] = [...this.equip(playerId), card];
  }

  playBarrel(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    if (this.equip(playerId).some(c => c.type === 'barrel')) throw new Error('Vous avez déjà une Planque en jeu');
    const card = this.findHandCardByType(playerId, 'barrel');
    this.removeFromHand(playerId, card.id);
    this.logEvent('barrel_equipped', { actorSeat: this.player(playerId).seatPosition });
    this.state.equipment[playerId] = [...this.equip(playerId), card];
  }

  playMustang(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    if (this.equip(playerId).some(c => c.type === 'mustang')) throw new Error('Vous avez déjà un Mustang en jeu');
    const card = this.findHandCardByType(playerId, 'mustang');
    this.removeFromHand(playerId, card.id);
    this.logEvent('mustang_equipped', { actorSeat: this.player(playerId).seatPosition });
    this.state.equipment[playerId] = [...this.equip(playerId), card];
  }

  playScope(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    if (this.equip(playerId).some(c => c.type === 'scope')) throw new Error('Vous avez déjà une Lunette en jeu');
    const card = this.findHandCardByType(playerId, 'scope');
    this.removeFromHand(playerId, card.id);
    this.logEvent('scope_equipped', { actorSeat: this.player(playerId).seatPosition });
    this.state.equipment[playerId] = [...this.equip(playerId), card];
  }

  playWeapon(playerId: string, cardType: string) {
    this.assertOwnTurnPlayPhase(playerId);
    if (!WEAPON_TYPES.includes(cardType)) throw new Error('Arme invalide');
    const card = this.findHandCardByType(playerId, cardType);
    const current = this.equip(playerId).find(c => WEAPON_TYPES.includes(c.type));
    if (current) {
      this.state.equipment[playerId] = this.equip(playerId).filter(c => c.id !== current.id);
      this.state.discardPile.push(current);
    }
    this.removeFromHand(playerId, card.id);
    this.logEvent('weapon_equipped', { actorSeat: this.player(playerId).seatPosition, cardType });
    this.state.equipment[playerId] = [...this.equip(playerId), card];
  }

  playBeer(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const me = this.player(playerId);
    if (this.alivePlayers().length <= 2) throw new Error('La Bière n’a aucun effet à 2 joueurs ou moins');
    if (me.lifePoints >= me.maxLifePoints) throw new Error('Vous êtes déjà au maximum de points de vie');
    const card = this.findHandCardByType(playerId, 'beer');
    this.removeFromHand(playerId, card.id);
    this.state.discardPile.push(card);
    me.lifePoints += 1;
    this.logEvent('beer_played', { actorSeat: me.seatPosition });
  }

  playSaloon(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const card = this.findHandCardByType(playerId, 'saloon');
    this.removeFromHand(playerId, card.id);
    this.state.discardPile.push(card);
    for (const p of this.alivePlayers()) p.lifePoints = Math.min(p.maxLifePoints, p.lifePoints + 1);
    this.logEvent('saloon_played', { actorSeat: this.player(playerId).seatPosition });
  }

  playStagecoach(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const card = this.findHandCardByType(playerId, 'stagecoach');
    this.removeFromHand(playerId, card.id);
    this.state.discardPile.push(card);
    const drawn = this.drawFromDeck(2);
    this.state.hands[playerId] = [...this.hand(playerId), ...drawn];
    this.logEvent('stagecoach_played', { actorSeat: this.player(playerId).seatPosition });
  }

  playWellsFargo(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const card = this.findHandCardByType(playerId, 'wells_fargo');
    this.removeFromHand(playerId, card.id);
    this.state.discardPile.push(card);
    const drawn = this.drawFromDeck(3);
    this.state.hands[playerId] = [...this.hand(playerId), ...drawn];
    this.logEvent('wellsfargo_played', { actorSeat: this.player(playerId).seatPosition });
  }

  playGeneralStore(playerId: string) {
    this.assertOwnTurnPlayPhase(playerId);
    const card = this.findHandCardByType(playerId, 'general_store');
    this.removeFromHand(playerId, card.id);
    this.state.discardPile.push(card);

    const alive = this.alivePlayers().sort((a, b) => a.seatPosition - b.seatPosition);
    const revealed = this.drawFromDeck(alive.length);
    this.state.generalStoreCards = revealed;

    const myIndex = alive.findIndex(p => p.id === playerId);
    const order = [...alive.slice(myIndex), ...alive.slice(0, myIndex)];
    const eventId = this.logEvent('general_store_played', { actorSeat: this.player(playerId).seatPosition });
    this.startPending('general_store', playerId, order.map(p => ({ playerId: p.id, isCurrentTurn: p.id === order[0].id })), eventId);
  }

  pickGeneralStoreCard(playerId: string, cardId?: string) {
    if (!this.state.pending || this.state.pending.type !== 'general_store') throw new Error('Aucun Magasin en cours');
    const target = this.state.pending.targets.find(t => t.playerId === playerId && t.isCurrentTurn);
    if (!target) throw new Error('Ce n’est pas à vous de choisir');

    let card: CardInstance | undefined;
    if (cardId) {
      const idx = this.state.generalStoreCards.findIndex(c => c.id === cardId);
      if (idx === -1) throw new Error('Cette carte n’est plus disponible');
      [card] = this.state.generalStoreCards.splice(idx, 1);
    } else {
      const idx = Math.floor(Math.random() * this.state.generalStoreCards.length);
      [card] = this.state.generalStoreCards.splice(idx, 1);
    }
    this.state.hands[playerId] = [...this.hand(playerId), card!];
    this.logEvent('store_card_taken', { actorSeat: this.player(playerId).seatPosition, cardType: card!.type, threadId: this.state.pending.eventId ?? undefined });

    const remaining = this.state.pending.targets.filter(t => t.playerId !== playerId);
    if (remaining.length === 0) {
      this.clearPending();
    } else {
      remaining.forEach((t, i) => { t.isCurrentTurn = i === 0; });
      this.state.pending.targets = remaining;
    }
  }

  discardCards(playerId: string, cardIds: string[]) {
    this.assertOwnTurnPlayPhase(playerId);
    const me = this.player(playerId);
    const hand = this.hand(playerId);
    const excess = hand.length - me.lifePoints;
    if (excess > 0 && cardIds.length !== excess) throw new Error(`Vous devez défausser exactement ${excess} carte(s)`);

    for (const id of cardIds) {
      const idx = hand.findIndex(c => c.id === id);
      if (idx === -1) throw new Error('Une des cartes indiquées ne vous appartient pas');
      const [card] = hand.splice(idx, 1);
      this.state.discardPile.push(card);
    }

    this.advanceTurn(playerId);
  }
}