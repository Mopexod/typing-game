// Буквы основного ряда добавляются парами от указательных пальцев к мизинцам:
// уровень с новой парой, затем уровень-повторение со всеми выученными буквами.

export interface Theme {
  name: string;
  bg: string; // текстура полосы с холмами
  ground: string; // префикс текстур земли: <ground>_top / <ground>_fill
  decor: string[];
  color: number; // цвет кнопки уровня на карте
  transpose: number; // сдвиг музыки забега в полутонах, чтобы миры звучали по-разному
}

export interface Level {
  letters: string[];
  newLetters: string[];
  crates: number;
  theme: Theme;
}

const MEADOW: Theme = { name: 'Луг', bg: 'bg_hills', ground: 'grass', decor: ['bush', 'grass'], color: 0x2ecc71, transpose: 0 };
const FOREST: Theme = { name: 'Лес', bg: 'bg_trees', ground: 'grass', decor: ['bush', 'grass', 'mushroom_brown'], color: 0x1fa463, transpose: 2 };
const DESERT: Theme = { name: 'Пустыня', bg: 'bg_desert', ground: 'sand', decor: ['cactus'], color: 0xe8a23c, transpose: -3 };
const MUSHROOMS: Theme = {
  name: 'Грибное королевство',
  bg: 'bg_mushrooms',
  ground: 'purple',
  decor: ['mushroom_red', 'mushroom_brown'],
  color: 0xb46ee8,
  transpose: -1,
};

export const LEVELS: Level[] = [
  { letters: ['а', 'о'], newLetters: ['а', 'о'], crates: 12, theme: MEADOW },
  { letters: ['в', 'л'], newLetters: ['в', 'л'], crates: 12, theme: MEADOW },
  { letters: ['а', 'о', 'в', 'л'], newLetters: [], crates: 15, theme: FOREST },
  { letters: ['ы', 'д'], newLetters: ['ы', 'д'], crates: 12, theme: FOREST },
  { letters: ['а', 'о', 'в', 'л', 'ы', 'д'], newLetters: [], crates: 18, theme: DESERT },
  { letters: ['ф', 'ж'], newLetters: ['ф', 'ж'], crates: 12, theme: DESERT },
  { letters: ['ф', 'ы', 'в', 'а', 'о', 'л', 'д', 'ж'], newLetters: [], crates: 20, theme: MUSHROOMS },
  { letters: ['ф', 'ы', 'в', 'а', 'о', 'л', 'д', 'ж'], newLetters: [], crates: 30, theme: MUSHROOMS },
];

/** Уровень открыт, если предыдущий пройден хотя бы на одну звезду. */
export function isUnlocked(index: number, stars: number[]): boolean {
  return index === 0 || (stars[index - 1] ?? 0) > 0;
}

/** Пройти уровень можно всегда — звёзды зависят только от точности. */
export function starsFor(accuracy: number): number {
  if (accuracy >= 95) return 3;
  if (accuracy >= 80) return 2;
  return 1;
}
