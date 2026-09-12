import { OfflineGameState } from './types';

const ATTACK_EVENT_TYPES = ['bang_played', 'duel_played', 'indians_played', 'gatling_played', 'catbalou_played', 'panic_played', 'prison_played'];

// Score public de "ressemble à un ennemi du Shérif", calculé uniquement à partir d'informations
// publiques (actions observées, rôles révélés à l'élimination) — jamais en lisant le vrai rôle
// d'un joueur encore vivant.
export function computeReputations(state: OfflineGameState): Record<string, number> {
  const rep: Record<string, number> = {};
  state.players.forEach(p => { rep[p.id] = 0; });

  const sheriff = state.players.find(p => p.isSheriff);

  for (const e of state.events) {
    const actor = state.players.find(p => p.seatPosition === e.actorSeat);
    const target = state.players.find(p => p.seatPosition === e.targetSeat);
    if (!actor) continue;

    if (ATTACK_EVENT_TYPES.includes(e.eventType)) {
      if (target && sheriff && target.id === sheriff.id) {
        rep[actor.id] += 4; // s'en prendre au Shérif est le signal le plus fort
      } else if (target) {
        rep[actor.id] += 0.5; // agressivité générale, signal faible
      }
    }
    if (e.eventType === 'beer_played' || e.eventType === 'saloon_played') {
      rep[actor.id] -= 0.3; // geste de soin, léger indice de bienveillance
    }
  }

  // Jugement rétroactif : un rôle n'est connu qu'une fois le joueur éliminé
  for (const p of state.players) {
    if (p.isAlive) continue;
    const killerId = state.killedBy[p.id];
    if (!killerId || !rep[killerId] === undefined) continue;
    const wasEnemy = p.role === 'outlaw' || p.role === 'renegade';
    rep[killerId] = (rep[killerId] ?? 0) + (wasEnemy ? -2 : 3);
  }

  return rep;
}