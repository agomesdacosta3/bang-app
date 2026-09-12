import { OfflineEngine } from './engine';

function isPending(engine: OfflineEngine): boolean {
  return !!engine.getState().pending;
}

function pickAttackTarget(engine: OfflineEngine, botId: string): string | null {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  const range = engine.weaponRange(botId);
  const targets = state.players.filter(p => p.isAlive && p.id !== botId && engine.distanceBetween(botId, p.id) <= range);
  if (!targets.length) return null;

  if (me.role === 'outlaw' || me.role === 'renegade') {
    const sheriff = targets.find(p => p.isSheriff);
    if (sheriff) return sheriff.id;
  }
  return targets[Math.floor(Math.random() * targets.length)].id;
}

function tryPlayBeerIfLow(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  if (me.lifePoints < me.maxLifePoints && state.hands[botId]?.some(c => c.type === 'beer')) {
    try { engine.playBeer(botId); } catch { /* conditions non réunies */ }
  }
}

function tryEquipBetterWeapon(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const hand = state.hands[botId] ?? [];
  const weaponCard = hand.find(c => ['schofield', 'remington', 'carbine', 'winchester', 'volcanic'].includes(c.type));
  if (weaponCard) {
    try { engine.playWeapon(botId, weaponCard.type); } catch { /* déjà équipé */ }
  }
}

function tryAttack(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  if (!(state.hands[botId] ?? []).some(c => c.type === 'bang')) return;
  const me = state.players.find(p => p.id === botId)!;
  if (me.hasPlayedBangThisTurn && !(state.equipment[botId] ?? []).some(c => c.type === 'volcanic')) return;
  const target = pickAttackTarget(engine, botId);
  if (target) { try { engine.playBang(botId, target); } catch { /* cible invalidée entre-temps */ } }
}

// Chaque action pouvant ouvrir une attente (Duel, Indiens!, Gatling, Magasin, Coup de foudre, Braquage!)
// est immédiatement suivie d'une vérification — dès qu'une attente s'ouvre, on arrête tout net pour
// laisser la confrontation se dérouler avant de reprendre le tour (au prochain passage de la boucle).
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
    const target = pickAttackTarget(engine, botId);
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
    const target = pickAttackTarget(engine, botId);
    if (target) { try { engine.playCatBalou(botId, target); } catch {} }
  }
  if (isPending(engine)) return;

  if (has('panic') && Math.random() < 0.4) {
    const target = pickAttackTarget(engine, botId);
    if (target) { try { engine.playPanic(botId, target, 'hand'); } catch {} }
  }
  if (isPending(engine)) return;

  if (has('prison') && Math.random() < 0.3) {
    const st = engine.getState();
    const candidate = st.players.find(p => p.isAlive && p.id !== botId && !p.isSheriff && !(st.equipment[p.id] ?? []).some(c => c.type === 'prison'));
    if (candidate) { try { engine.playPrison(botId, candidate.id); } catch {} }
  }
}

export function aiPlayFullTurn(engine: OfflineEngine, botId: string) {
  const equip = engine.getState().equipment[botId] ?? [];
  if (equip.some(c => c.type === 'dynamite' || c.type === 'prison')) {
    const ended = engine.performDrawPhaseDegainer(botId);
    if (ended) return;
  }
  if (engine.getState().turnPhase === 'draw') engine.drawCards(botId);

  tryPlayBeerIfLow(engine, botId);
  tryEquipBetterWeapon(engine, botId);

  tryAttack(engine, botId);
  if (isPending(engine)) return; // le tour reprendra tout seul, au prochain passage, une fois la confrontation résolue

  tryPlayExtraCards(engine, botId);
  if (isPending(engine)) return;

  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  const hand = state.hands[botId] ?? [];
  const excess = hand.length - me.lifePoints;
  const cardIds = excess > 0 ? hand.slice(0, excess).map(c => c.id) : [];
  engine.discardCards(botId, cardIds);
}

function shouldDrinkBeerToSurvive(engine: OfflineEngine, botId: string): boolean {
  const state = engine.getState();
  const me = state.players.find(p => p.id === botId)!;
  const aliveCount = state.players.filter(p => p.isAlive).length;
  return me.lifePoints <= 1 && aliveCount > 2 && (state.hands[botId] ?? []).some(c => c.type === 'beer');
}

export function aiRespondSingleAttack(engine: OfflineEngine, pendingType: 'bang_response' | 'gatling_response', botId: string) {
  const state = engine.getState();
  const hand = state.hands[botId] ?? [];
  const target = state.pending!.targets.find(t => t.playerId === botId)!;
  const hasBarrel = (state.equipment[botId] ?? []).some(c => c.type === 'barrel');
  const respond = pendingType === 'bang_response'
    ? (action: any) => engine.respondBang(botId, action)
    : (action: any) => engine.respondGatling(botId, action);

  if (hand.some(c => c.type === 'missed')) { respond('missed'); return; }
  if (hasBarrel && target.barrelTriesUsed < 1) { respond('try_barrel'); return; }
  if (shouldDrinkBeerToSurvive(engine, botId)) { respond('drink_beer'); return; }
  respond('accept_damage');
}

export function aiRespondDuel(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const hasBang = (state.hands[botId] ?? []).some(c => c.type === 'bang');
  if (hasBang) { engine.respondDuel(botId, 'discard_bang'); return; }
  if (shouldDrinkBeerToSurvive(engine, botId)) { engine.respondDuel(botId, 'drink_beer'); return; }
  engine.respondDuel(botId, 'accept_damage');
}

export function aiRespondIndians(engine: OfflineEngine, botId: string) {
  const state = engine.getState();
  const hasBang = (state.hands[botId] ?? []).some(c => c.type === 'bang');
  if (hasBang) { engine.respondIndians(botId, 'discard_bang'); return; }
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