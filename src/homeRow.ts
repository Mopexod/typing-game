// Основной ряд русской раскладки ЙЦУКЕН: буква, физическая клавиша и палец.
export interface HomeKey {
  ch: string;
  code: string; // KeyboardEvent.code — физическое положение клавиши
  finger: string;
  color: number;
}

const PINKY = 0xb07cff;
const RING = 0x5aa9ff;
const MIDDLE = 0x52d39a;
const INDEX = 0xffa94d;

export const HOME_ROW: HomeKey[] = [
  { ch: 'ф', code: 'KeyA', finger: 'левый мизинец', color: PINKY },
  { ch: 'ы', code: 'KeyS', finger: 'левый безымянный', color: RING },
  { ch: 'в', code: 'KeyD', finger: 'левый средний', color: MIDDLE },
  { ch: 'а', code: 'KeyF', finger: 'левый указательный', color: INDEX },
  { ch: 'о', code: 'KeyJ', finger: 'правый указательный', color: INDEX },
  { ch: 'л', code: 'KeyK', finger: 'правый средний', color: MIDDLE },
  { ch: 'д', code: 'KeyL', finger: 'правый безымянный', color: RING },
  { ch: 'ж', code: 'Semicolon', finger: 'правый мизинец', color: PINKY },
];

export const keyByChar = new Map(HOME_ROW.map((k) => [k.ch, k]));

const CYRILLIC = /^[а-яё]$/;
// Символы, которые печатаются с английской раскладкой на месте русских букв.
const LATIN_ON_CYRILLIC_KEYS = /^[a-z;'[\],.`]$/;

/** Нажатие похоже на включённую английскую раскладку — это не ошибка игрока. */
export function looksLikeWrongLayout(key: string): boolean {
  return !CYRILLIC.test(key) && LATIN_ON_CYRILLIC_KEYS.test(key);
}
