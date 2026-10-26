import type { HeroColor } from './heroes';

// Всё, что игра помнит между запусками, хранится в браузере (localStorage).
// Если хранилище недоступно (приватный режим и т. п.), игра работает, но ничего не запоминает.

const PROGRESS_KEY = 'typing-game.progress';
const SPEED_KEY = 'typing-game.speedLevel';
const MUTED_KEY = 'typing-game.muted'; // звуковые эффекты
const MUSIC_MUTED_KEY = 'typing-game.musicMuted';
const LEGACY_COINS_KEY = 'typing-game.coins'; // до появления уровней монетки хранились отдельно

export const SPEED_LEVELS = 10;
export const DEFAULT_SPEED_LEVEL = 4;

export interface Progress {
  stars: number[]; // лучший результат по каждому уровню, 0 — не пройден
  coins: number;
  owned: HeroColor[];
  hero: HeroColor;
}

export const progress: Progress = loadProgress();

export function saveProgress(): void {
  write(PROGRESS_KEY, JSON.stringify(progress));
}

export function getSpeedLevel(): number {
  const level = Number(read(SPEED_KEY));
  return Number.isInteger(level) && level >= 1 && level <= SPEED_LEVELS ? level : DEFAULT_SPEED_LEVEL;
}

export function setSpeedLevel(level: number): void {
  write(SPEED_KEY, String(level));
}

export function isMuted(): boolean {
  return read(MUTED_KEY) === '1';
}

export function setMuted(muted: boolean): void {
  write(MUTED_KEY, muted ? '1' : '0');
}

export function isMusicMuted(): boolean {
  return read(MUSIC_MUTED_KEY) === '1';
}

export function setMusicMuted(muted: boolean): void {
  write(MUSIC_MUTED_KEY, muted ? '1' : '0');
}

function loadProgress(): Progress {
  const fresh: Progress = { stars: [], coins: 0, owned: ['green'], hero: 'green' };
  let p = fresh;
  try {
    const saved = JSON.parse(read(PROGRESS_KEY) ?? 'null') as Partial<Progress> | null;
    if (saved && typeof saved === 'object') {
      p = {
        stars: Array.isArray(saved.stars) ? saved.stars.map((s) => Number(s) || 0) : [],
        coins: Number(saved.coins) || 0,
        owned: Array.isArray(saved.owned) && saved.owned.length ? saved.owned : ['green'],
        hero: saved.hero ?? 'green',
      };
    }
  } catch {
    p = fresh; // испорченная запись — начинаем заново
  }

  const legacy = Number(read(LEGACY_COINS_KEY));
  if (legacy > 0) {
    p.coins += legacy;
    remove(LEGACY_COINS_KEY);
    write(PROGRESS_KEY, JSON.stringify(p));
  }
  return p;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // хранилище недоступно — значение просто не запомнится
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // хранилище недоступно
  }
}
