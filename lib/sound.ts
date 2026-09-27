import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------- Sources (résolues une seule fois au chargement du module) ----------

const CARD_SOUND_SOURCES: Record<string, number> = {
  bang: require('../assets/sounds/cards/card_bang.wav'),
  missed: require('../assets/sounds/cards/card_missed.wav'),
  beer: require('../assets/sounds/cards/card_beer.wav'),
  duel: require('../assets/sounds/cards/card_duel.wav'),
  indians: require('../assets/sounds/cards/card_indians.wav'),
  gatling: require('../assets/sounds/cards/card_gatling.wav'),
  general_store: require('../assets/sounds/cards/card_general_store.wav'),
  saloon: require('../assets/sounds/cards/card_saloon.wav'),
  stagecoach: require('../assets/sounds/cards/card_stagecoach.wav'),
  wells_fargo: require('../assets/sounds/cards/card_wells_fargo.wav'),
  panic: require('../assets/sounds/cards/card_panic.wav'),
  cat_balou: require('../assets/sounds/cards/card_cat_balou.wav'),
  barrel: require('../assets/sounds/cards/card_barrel.wav'),
  mustang: require('../assets/sounds/cards/card_mustang.wav'),
  scope: require('../assets/sounds/cards/card_scope.wav'),
  dynamite: require('../assets/sounds/cards/card_dynamite_place.wav'),
  prison: require('../assets/sounds/cards/card_prison_place.wav'),
  schofield: require('../assets/sounds/cards/card_weapon.wav'),
  remington: require('../assets/sounds/cards/card_weapon.wav'),
  carbine: require('../assets/sounds/cards/card_weapon.wav'),
  winchester: require('../assets/sounds/cards/card_weapon.wav'),
  volcanic: require('../assets/sounds/cards/card_weapon.wav'),
};

const EXTRA_SOUND_SOURCES: Record<string, number> = {
  dynamite_explode: require('../assets/sounds/cards/card_dynamite_explode.wav'),
  prison_escape: require('../assets/sounds/cards/card_prison_escape.wav'),
};

const ABILITY_SOUND_SOURCES: Record<string, number> = {
  bart_cassidy_draw: require('../assets/sounds/abilities/bart_cassidy_draw.wav'),
  el_gringo_steal: require('../assets/sounds/abilities/el_gringo_steal.wav'),
  sid_ketchum_heal: require('../assets/sounds/abilities/sid_ketchum_heal.wav'),
  vulture_sam_loot: require('../assets/sounds/abilities/vulture_sam_loot.wav'),
  suzy_lafayette_draw: require('../assets/sounds/abilities/suzy_lafayette_draw.wav'),
  black_jack_bonus_draw: require('../assets/sounds/abilities/black_jack_bonus_draw.wav'),
  lucky_duke_draw: require('../assets/sounds/abilities/lucky_duke_draw.wav'),
  jesse_jones_steal: require('../assets/sounds/abilities/jesse_jones_steal.wav'),
  pedro_ramirez_discard_draw: require('../assets/sounds/abilities/pedro_ramirez_discard_draw.wav'),
  kit_carlson_pick: require('../assets/sounds/abilities/kit_carlson_pick.wav'),
};

const GAME_SOUND_SOURCES = {
  turn_draw: require('../assets/sounds/game/turn_draw.wav'),
  turn_discard: require('../assets/sounds/game/turn_discard.wav'),
  damage_taken: require('../assets/sounds/game/damage_taken.wav'),
  heal: require('../assets/sounds/game/heal.wav'),
  player_eliminated: require('../assets/sounds/game/player_eliminated.wav'),
  victory: require('../assets/sounds/game/victory.wav'),
  defeat: require('../assets/sounds/game/defeat.wav'),
  timer_urgent: require('../assets/sounds/game/timer_urgent.wav'),
} as const;

const UI_SOUND_SOURCES = {
  button_tap: require('../assets/sounds/ui/button_tap.wav'),
  target_picker_open: require('../assets/sounds/ui/target_picker_open.wav'),
  action_invalid: require('../assets/sounds/ui/action_invalid.wav'),
} as const;

const MUSIC_SOURCES = {
  menu: require('../assets/sounds/music/theme_menu.mp3'),
  game: require('../assets/sounds/music/theme_game.mp3'),
} as const;

export type GameSoundKey = keyof typeof GAME_SOUND_SOURCES;
export type UiSoundKey = keyof typeof UI_SOUND_SOURCES;
export type MusicTrack = keyof typeof MUSIC_SOURCES;

// ---------- Correspondance événement de jeu → son à jouer, centralisée ici ----------
// Les deux écrans (en ligne / hors ligne) appellent playSoundForGameEvent avec les
// valeurs déjà extraites de leur propre objet événement — aucune duplication de cette
// table à faire ailleurs si une nouvelle carte ou capacité est ajoutée un jour.

const CARD_SOUND_BY_EVENT_TYPE: Record<string, string> = {
  bang_played: 'bang',
  duel_bang_discarded: 'bang',
  indians_defended: 'bang',
  missed_played: 'missed',
  beer_played: 'beer',
  beer_saved_from_death: 'beer',
  duel_played: 'duel',
  indians_played: 'indians',
  gatling_played: 'gatling',
  general_store_played: 'general_store',
  saloon_played: 'saloon',
  stagecoach_played: 'stagecoach',
  wellsfargo_played: 'wells_fargo',
  panic_played: 'panic',
  catbalou_played: 'cat_balou',
  barrel_equipped: 'barrel',
  mustang_equipped: 'mustang',
  scope_equipped: 'scope',
  dynamite_played: 'dynamite',
  prison_played: 'prison',
};

const GAME_SOUND_BY_EVENT_TYPE: Partial<Record<string, GameSoundKey>> = {
  damage_taken: 'damage_taken',
  player_eliminated: 'player_eliminated',
};

// Ces événements font gagner de la vie via une carte qui a déjà son propre son :
// on superpose un petit signal de confirmation ("heal") par-dessus, sans le remplacer.
const HEAL_LAYER_EVENT_TYPES = new Set(['beer_played', 'saloon_played', 'beer_saved_from_death']);

export function playSoundForGameEvent(eventType: string, cardType?: string | null) {
  if (eventType === 'weapon_equipped' && cardType) {
    playCardSound(cardType);
    return;
  }
  if (eventType === 'prison_escaped') {
    playPrisonEscape();
    return;
  }
  const cardSoundKey = CARD_SOUND_BY_EVENT_TYPE[eventType];
  if (cardSoundKey) playCardSound(cardSoundKey);

  const gameSoundKey = GAME_SOUND_BY_EVENT_TYPE[eventType];
  if (gameSoundKey) playGameSound(gameSoundKey);

  if (HEAL_LAYER_EVENT_TYPES.has(eventType)) playGameSound('heal');
}

// ---------- État interne ----------

const players: Record<string, AudioPlayer> = {};
let sfxEnabled = true;
let musicEnabled = true;
let initialized = false;

function makePlayer(key: string, source: number) {
  if (players[key]) return;
  try {
    players[key] = createAudioPlayer(source);
  } catch (err) {
    console.log(`Son introuvable ou invalide pour "${key}" :`, err);
  }
}

export async function initSounds() {
  if (initialized) return;
  initialized = true;

  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  } catch (err) {
    console.log('Configuration audio impossible :', err);
  }

  try {
    const stored = await AsyncStorage.multiGet(['sfxEnabled', 'musicEnabled']);
    sfxEnabled = stored[0][1] !== 'false';
    musicEnabled = stored[1][1] !== 'false';
  } catch { /* valeurs par défaut conservées */ }

  for (const [key, source] of Object.entries(CARD_SOUND_SOURCES)) makePlayer(`card_${key}`, source);
  for (const [key, source] of Object.entries(EXTRA_SOUND_SOURCES)) makePlayer(`extra_${key}`, source);
  for (const [key, source] of Object.entries(ABILITY_SOUND_SOURCES)) makePlayer(`ability_${key}`, source);
  for (const [key, source] of Object.entries(GAME_SOUND_SOURCES)) makePlayer(`game_${key}`, source);
  for (const [key, source] of Object.entries(UI_SOUND_SOURCES)) makePlayer(`ui_${key}`, source);
}

async function trigger(playerKey: string) {
  const player = players[playerKey];
  if (!player) return;
  try {
    await player.seekTo(0);
    player.play();
  } catch (err) {
    console.log(`Lecture impossible pour "${playerKey}" :`, err);
  }
}

export function playCardSound(cardType: string) {
  if (!sfxEnabled) return;
  trigger(`card_${cardType}`);
}
export function stopCardSound(cardType: string) {
  const player = players[`card_${cardType}`];
  if (player) player.pause();
}
export function stopGameSound(key: GameSoundKey) {
  const player = players[`game_${key}`];
  if (player) player.pause();
}
export function playDynamiteExplosion() {
  if (!sfxEnabled) return;
  trigger('extra_dynamite_explode');
}
export function playPrisonEscape() {
  if (!sfxEnabled) return;
  trigger('extra_prison_escape');
}
export function playAbilitySound(eventType: string) {
  if (!sfxEnabled) return;
  trigger(`ability_${eventType}`);
}
export function playGameSound(key: GameSoundKey) {
  if (!sfxEnabled) return;
  trigger(`game_${key}`);
}
export function playUiSound(key: UiSoundKey) {
  if (!sfxEnabled) return;
  trigger(`ui_${key}`);
}

export async function setSfxEnabled(enabled: boolean) {
  sfxEnabled = enabled;
  await AsyncStorage.setItem('sfxEnabled', enabled ? 'true' : 'false');
}
export function isSfxEnabled() { return sfxEnabled; }

// ---------- Musique de fond ----------

let musicPlayer: AudioPlayer | null = null;
let currentTrack: MusicTrack | null = null;

export function playMusic(track: MusicTrack) {
  if (currentTrack === track && musicPlayer?.playing) return;
  if (musicPlayer) {
    musicPlayer.pause();
    musicPlayer.remove();
    musicPlayer = null;
  }
  currentTrack = track;
  if (!musicEnabled) return;

  musicPlayer = createAudioPlayer(MUSIC_SOURCES[track]);
  musicPlayer.loop = true;
  musicPlayer.volume = 0.5;
  musicPlayer.play();
}

export function stopMusic() {
  if (musicPlayer) {
    musicPlayer.pause();
    musicPlayer.remove();
    musicPlayer = null;
  }
  currentTrack = null;
}

export async function setMusicEnabled(enabled: boolean) {
  musicEnabled = enabled;
  await AsyncStorage.setItem('musicEnabled', enabled ? 'true' : 'false');
  if (!enabled) {
    if (musicPlayer) { musicPlayer.pause(); musicPlayer.remove(); musicPlayer = null; }
  } else if (currentTrack) {
    const track = currentTrack;
    currentTrack = null; // force playMusic à recréer le lecteur
    playMusic(track);
  }
}
export function isMusicEnabled() { return musicEnabled; }