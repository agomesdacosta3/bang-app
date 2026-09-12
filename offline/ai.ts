import { OfflineEngine } from './engine';
import { computeReputations } from './suspicion';

function isPending(engine: OfflineEngine): boolean {
  return !!engine.getState().pending;
}

function characterOf(engine: OfflineEngine, id: string): string {
  return engine.getState().players.find(p => p.id === id)?.character ?? '';
}

function roleLabelFr(role: string): string {
  return role === 'sheriff' ? 'Shérif' : role === 'deputy' ? 'Adjoint' : role === 'outlaw' ? 'Hors-la-loi' : 'Renégat';
}

// Choix de cible orienté objectif : Shérif/Adjoint visent le plus suspect ; Hors-la-loi vise
// toujours le Shérif en priorité, sinon une cible de diversion (la moins suspecte) ; Renégat évite
// d'achever le Shérif tant que d'autres joueurs sont en vie, et préfère affaiblir le plus fragile.
function pickTarget(engine: OfflineEngine, botId: string, maxRange: number, excludeSheriff = false): string | null {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  const sheriff = state.players.find(p => p.isSheriff);
  const aliveCount = state.players.filter(p => p.isAlive).length;
  let candidates = state.players.filter(p => p.isAlive && p.id !== botId && engine.distanceBetween(botId, p.id) <= maxRange);
  if (excludeSheriff && sheriff) candidates = candidates.filter(c => c.id !== sheriff.id);
  if (!candidates.length) return null;

  const reputations = computeReputations(state);
  const roleLabel = roleLabelFr(me.role);

  if (me.role === 'outlaw' && !excludeSheriff) {
    if (sheriff && candidates.some(c => c.id === sheriff.id)) return sheriff.id;
    const sorted = [...candidates].sort((a, b) => (reputations[a.id] ?? 0) - (reputations[b.id] ?? 0));
    const target = sorted[0];
    console.log(`[IA] ${me.nickname} (${roleLabel}) vise ${target.nickname} en diversion (réputation ${(reputations[target.id] ?? 0).toFixed(1)})`);
    return target.id;
  }

  if (me.role === 'renegade' && !excludeSheriff) {
    if (sheriff && candidates.some(c => c.id === sheriff.id)) {
      if (aliveCount === 2) {
        console.log(`[IA] ${me.nickname} (${roleLabel}) vise le Shérif ${sheriff.nickname} — dernier adversaire restant`);
        return sheriff.id;
      }
      const others = candidates.filter(c => c.id !== sheriff.id);
      if (!others.length) {
        console.log(`[IA] ${me.nickname} (${roleLabel}) évite d'achever le Shérif trop tôt, aucune autre cible à portée`);
        return null;
      }
      const weakest = [...others].sort((a, b) => a.lifePoints - b.lifePoints)[0];
      console.log(`[IA] ${me.nickname} (${roleLabel}) vise ${weakest.nickname} (le plus faible) plutôt que le Shérif`);
      return weakest.id;
    }
    const weakest = [...candidates].sort((a, b) => a.lifePoints - b.lifePoints)[0];
    console.log(`[IA] ${me.nickname} (${roleLabel}) vise ${weakest.nickname} (le plus faible)`);
    return weakest.id;
  }

  const sorted = [...candidates].sort((a, b) => (reputations[b.id] ?? 0) - (reputations[a.id] ?? 0));
  const best = sorted[0];
  const bestRep = reputations[best.id] ?? 0;
  if (bestRep > 0) {
    console.log(`[IA] ${me.nickname} (${roleLabel}) vise ${best.nickname}, le plus suspect (réputation ${bestRep.toFixed(1)})`);
    return best.id;
  }
  const random = candidates[Math.floor(Math.random() * candidates.length)];
  console.log(`[IA] ${me.nickname} (${roleLabel}) n'a aucun suspect clair, vise ${random.nickname} au hasard`);
  return random.id;
}

function shouldDrinkBeerToSurvive(engine: OfflineEngine, botId: string): boolean {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  const aliveCount = state.players.filter(p => p.isAlive).length;
  return me.lifePoints <= 1 && aliveCount > 2 && (state.hands[botId] ?? []).some(c => c.type === 'beer');
}

function tryPlayBeerIfLow(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  if (me.lifePoints < me.maxLifePoints && state.hands[botId]?.some(c => c.type === 'beer')) {
    try { engine.playBeer(botId); } catch {}
  }
}

function tryEquipBetterWeapon(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const hand = state.hands[botId] ?? [];
  const weaponCard = hand.find(c => ['schofield', 'remington', 'carbine', 'winchester', 'volcanic'].includes(c.type));
  if (weaponCard) { try { engine.playWeapon(botId, weaponCard.type); } catch {} }
}

function trySidKetchumHeal(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  if (me.character !== 'sid_ketchum' || me.lifePoints >= me.maxLifePoints) return;
  const hand = state.hands[botId] ?? [];
  const disposable = hand.filter(c => !['bang', 'missed', 'beer'].includes(c.type));
  if (disposable.length >= 2) {
    try { engine.sidKetchumHeal(botId, [disposable[0].id, disposable[1].id]); } catch {}
  }
}

function tryAttack(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  const hasVolcanic = (state.equipment[botId] ?? []).some(c => c.type === 'volcanic');
  if (me.hasPlayedBangThisTurn && !hasVolcanic && me.character !== 'willy_the_kid') return;

  const hand = state.hands[botId] ?? [];
  const hasBang = hand.some(c => c.type === 'bang');
  const hasMissedAsBang = me.character === 'calamity_janet' && hand.some(c => c.type === 'missed');
  if (!hasBang && !hasMissedAsBang) return;

  const target = pickTarget(engine, botId, engine.weaponRange(botId));
  if (!target) return;
  try { engine.playBang(botId, target, hasBang ? 'bang' : 'missed'); } catch {}
}

function tryPlayExtraCards(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const hand = state.hands[botId] ?? [];
  const equip = state.equipment[botId] ?? [];
  const has = (t: string) => hand.some(c => c.type === t);
  const hasEquip = (t: string) => equip.some(c => c.type === t);

  if (has('mustang') && !hasEquip('mustang')) { try { engine.playMustang(botId); } catch {} }
  if (has('scope') && !hasEquip('scope')) { try { engine.playScope(botId); } catch {} }
  if (has('barrel') && !hasEquip('barrel')) { try { engine.playBarrel(botId); } catch {} }
  if (has('dynamite') && !hasEquip('dynamite') && Math.random() < 0.5) { try { engine.playDynamite(botId); } catch {} }

  if (has('duel') && Math.random() < 0.5) {
    const target = pickTarget(engine, botId, Infinity);
    if (target) { try { engine.playDuel(botId, target); } catch {} }
  }
  if (isPending(engine)) return;

  if (has('indians') && Math.random() < 0.4) { try { engine.playIndians(botId); } catch {} }
  if (isPending(engine)) return;

  if (has('gatling') && Math.random() < 0.4) { try { engine.playGatling(botId); } catch {} }
  if (isPending(engine)) return;

  if (has('general_store') && Math.random() < 0.6) { try { engine.playGeneralStore(botId); } catch {} }
  if (isPending(engine)) return;

  if (has('saloon') && Math.random() < 0.5) { try { engine.playSaloon(botId); } catch {} }
  if (has('stagecoach')) { try { engine.playStagecoach(botId); } catch {} }
  if (has('wells_fargo')) { try { engine.playWellsFargo(botId); } catch {} }

  if (has('cat_balou') && Math.random() < 0.4) {
    const target = pickTarget(engine, botId, Infinity);
    if (target) { try { engine.playCatBalou(botId, target); } catch {} }
  }
  if (isPending(engine)) return;

  if (has('panic') && Math.random() < 0.4) {
    const target = pickTarget(engine, botId, 1);
    if (target) { try { engine.playPanic(botId, target, 'hand'); } catch {} }
  }
  if (isPending(engine)) return;

  if (has('prison') && Math.random() < 0.3) {
    const target = pickTarget(engine, botId, Infinity, true);
    const st = engine.getState();
    if (target && !(st.equipment[target] ?? []).some(c => c.type === 'prison')) {
      try { engine.playPrison(botId, target); } catch {}
    }
  }
}

function performDrawPhase(engine: OfflineEngine, botId: string) {
  const character = characterOf(engine, botId);

  if (character === 'jesse_jones') {
    const state = engine.getState();
    const targets = state.players.filter(p => p.isAlive && p.id !== botId && (state.hands[p.id]?.length ?? 0) > 0);
    if (targets.length && Math.random() < 0.7) {
      const reputations = computeReputations(state);
      const sorted = [...targets].sort((a, b) => (reputations[b.id] ?? 0) - (reputations[a.id] ?? 0));
      try { engine.drawJesseSteal(botId, sorted[0].id); return; } catch {}
    }
    engine.drawCards(botId);
    return;
  }

  if (character === 'pedro_ramirez') {
    const state = engine.getState();
    if (state.discardPile.length && Math.random() < 0.5) {
      try { engine.drawPedroDiscard(botId); return; } catch {}
    }
    engine.drawCards(botId);
    return;
  }

  if (character === 'kit_carlson') {
    try {
      const cards = engine.peekKitCarlson(botId);
      const priority = (t: string) => (['bang', 'missed', 'beer'].includes(t) ? 0 : 1);
      const indices = [0, 1, 2].sort((a, b) => priority(cards[a].type) - priority(cards[b].type)).slice(0, 2);
      engine.kitCarlsonChoose(botId, indices);
      return;
    } catch { /* retombe sur la pioche normale */ }
  }

  engine.drawCards(botId);
}

export function aiPlayFullTurn(engine: OfflineEngine, botId: string) {
  const equip = engine.getState().equipment[botId] ?? [];
  if (equip.some(c => c.type === 'dynamite' || c.type === 'prison')) {
    const ended = engine.performDrawPhaseDegainer(botId);
    if (ended) return;
  }
  if (engine.getState().turnPhase === 'draw') performDrawPhase(engine, botId);

  trySidKetchumHeal(engine, botId);
  tryPlayBeerIfLow(engine, botId);
  tryEquipBetterWeapon(engine, botId);

  tryAttack(engine, botId);
  if (isPending(engine)) return;

  tryPlayExtraCards(engine, botId);
  if (isPending(engine)) return;

  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  const hand = state.hands[botId] ?? [];
  const excess = hand.length - me.lifePoints;
  const cardIds = excess > 0 ? hand.slice(0, excess).map(c => c.id) : [];
  engine.discardCards(botId, cardIds);
}

export function aiRespondSingleAttack(engine: OfflineEngine, pendingType: 'bang_response' | 'gatling_response', botId: string) {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  const hand = state.hands[botId] ?? [];
  const target = state.pending!.targets.find(t => t.playerId === botId)!;
  const hasBarrel = (state.equipment[botId] ?? []).some(c => c.type === 'barrel');
  const maxBarrelTries = (me.character === 'jourdonnais' ? 1 : 0) + (hasBarrel ? 1 : 0);
  const respond = pendingType === 'bang_response'
    ? (action: any, cardType?: any) => engine.respondBang(botId, action, cardType)
    : (action: any, cardType?: any) => engine.respondGatling(botId, action, cardType);

  if (hand.some(c => c.type === 'missed')) { respond('missed'); return; }
  if (me.character === 'calamity_janet' && hand.some(c => c.type === 'bang')) { respond('missed', 'bang'); return; }
  if (maxBarrelTries > 0 && target.barrelTriesUsed < maxBarrelTries) { respond('try_barrel'); return; }
  if (shouldDrinkBeerToSurvive(engine, botId)) { respond('drink_beer'); return; }
  respond('accept_damage');
}

export function aiRespondDuel(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  const hand = state.hands[botId] ?? [];
  if (hand.some(c => c.type === 'bang')) { engine.respondDuel(botId, 'discard_bang'); return; }
  if (me.character === 'calamity_janet' && hand.some(c => c.type === 'missed')) { engine.respondDuel(botId, 'discard_bang', 'missed'); return; }
  if (shouldDrinkBeerToSurvive(engine, botId)) { engine.respondDuel(botId, 'drink_beer'); return; }
  engine.respondDuel(botId, 'accept_damage');
}

export function aiRespondIndians(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  const hand = state.hands[botId] ?? [];
  if (hand.some(c => c.type === 'bang')) { engine.respondIndians(botId, 'discard_bang'); return; }
  if (me.character === 'calamity_janet' && hand.some(c => c.type === 'missed')) { engine.respondIndians(botId, 'discard_bang', 'missed'); return; }
  if (shouldDrinkBeerToSurvive(engine, botId)) { engine.respondIndians(botId, 'drink_beer'); return; }
  engine.respondIndians(botId, 'accept_damage');
}

export function aiRespondCatBalou(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const hand = state.hands[botId] ?? [];
  const equip = state.equipment[botId] ?? [];
  if (hand.length) { engine.respondCatBalou(botId, hand[0].id); return; }
  if (equip.length) { engine.respondCatBalou(botId, undefined, equip[0].type); return; }
}

export function aiRespondGeneralStore(engine: OfflineEngine, botId: string) {
  engine.pickGeneralStoreCard(botId);
}