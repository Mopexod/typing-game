export type HeroColor = 'green' | 'pink' | 'yellow' | 'purple' | 'beige';

export interface Hero {
  color: HeroColor;
  name: string;
  price: number; // в монетках
}

export const HEROES: Hero[] = [
  { color: 'green', name: 'Квак', price: 0 },
  { color: 'pink', name: 'Ириска', price: 30 },
  { color: 'yellow', name: 'Лимончик', price: 60 },
  { color: 'purple', name: 'Черничка', price: 100 },
  { color: 'beige', name: 'Пончик', price: 150 },
];

export const HERO_FRAMES = ['walk_a', 'walk_b', 'jump', 'hit', 'idle', 'front'] as const;
export type HeroFrame = (typeof HERO_FRAMES)[number];

export function heroTexture(color: HeroColor, frame: HeroFrame): string {
  return `${color}_${frame}`;
}

export function heroRunAnim(color: HeroColor): string {
  return `${color}_run`;
}
