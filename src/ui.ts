import Phaser from 'phaser';
import { music, type SongKey } from './music';
import {
  SPEED_LEVELS,
  getSpeedLevel,
  isMusicMuted,
  isMuted,
  setMusicMuted,
  setMuted,
  setSpeedLevel,
} from './progress';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const GROUND_Y = 390; // верх земли

export const FONT = 'Nunito, Arial, sans-serif';
export const INK = '#35354a'; // цвет контура, как у спрайтов Kenney
export const INK_HEX = 0x35354a;
export const SFX_VOLUME = 0.5;

export function textStyle(size: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: '800',
    color: '#ffffff',
    stroke: INK,
    strokeThickness: Math.max(3, Math.round(size / 5)),
    ...extra,
  };
}

export function sfx(scene: Phaser.Scene, key: string, volume = SFX_VOLUME): void {
  scene.sound.play(`sfx_${key}`, { volume });
}

/** Музыка играет через аудиоконтекст игры; без WebAudio (очень старый браузер) её просто нет. */
export function playMusic(scene: Phaser.Scene, key: SongKey, transpose = 0): void {
  if (!(scene.sound instanceof Phaser.Sound.WebAudioSoundManager)) return;
  music.attach(scene.sound.context);
  music.setMuted(isMusicMuted());
  music.play(key, transpose);
}

/** Тёмная плашка со скруглёнными углами и белой рамкой. */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, alpha = 0.88): void {
  g.fillStyle(INK_HEX, alpha).fillRoundedRect(x, y, w, h, 22);
  g.lineStyle(4, 0xffffff, 0.9).strokeRoundedRect(x, y, w, h, 22);
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  size = 24,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, label, textStyle(size, { backgroundColor: INK, padding: { x: 12, y: 2 }, strokeThickness: 0 }))
    .setOrigin(1, 0.5)
    .setDepth(7)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', onClick);
}

export interface WorldLayers {
  clouds: Phaser.GameObjects.TileSprite;
  hills: Phaser.GameObjects.TileSprite;
  groundTop: Phaser.GameObjects.TileSprite;
  groundFill: Phaser.GameObjects.TileSprite;
}

/** Фон из полос, которые едут с разной скоростью: облака, холмы, земля. */
export function createWorld(scene: Phaser.Scene, bg: string, ground: string): WorldLayers {
  return {
    clouds: scene.add.tileSprite(0, -66, GAME_WIDTH, 256, 'bg_clouds').setOrigin(0),
    hills: scene.add.tileSprite(0, 190, GAME_WIDTH, 256, bg).setOrigin(0),
    groundTop: scene.add.tileSprite(0, GROUND_Y, GAME_WIDTH, 64, `${ground}_top`).setOrigin(0).setDepth(1),
    groundFill: scene.add
      .tileSprite(0, GROUND_Y + 64, GAME_WIDTH, GAME_HEIGHT - GROUND_Y - 64, `${ground}_fill`)
      .setOrigin(0)
      .setDepth(1),
  };
}

export function createCoinCounter(scene: Phaser.Scene, value: number) {
  const icon = scene.add.image(32, 30, 'hud_coin').setScale(0.6).setDepth(7);
  const text = scene.add.text(54, 30, String(value), textStyle(26)).setOrigin(0, 0.5).setDepth(7);
  return { icon, text };
}

export interface TopBar {
  changeSpeed(delta: number): void;
}

/**
 * Правый верхний угол: музыка, звуки и скорость. Скорость меняется кнопками − + и стрелками ↑ ↓,
 * стрелки сцена подключает сама через changeSpeed. Выключенная кнопка звука/музыки — бледная.
 */
export function createTopBar(scene: Phaser.Scene, onSpeedChange?: (level: number) => void): TopBar {
  scene.sound.mute = isMuted();
  const y = 30;
  const plus = makeButton(scene, GAME_WIDTH - 16, y, '+', () => changeSpeed(1));
  const speedText = scene.add
    .text(plus.x - plus.width - 10, y, '', textStyle(20))
    .setOrigin(1, 0.5)
    .setDepth(7);
  // Ширина рассчитана на самую длинную надпись «Скорость: 10 из 10», чтобы кнопка не прыгала.
  const minus = makeButton(scene, speedText.x - 196, y, '−', () => changeSpeed(-1));
  const soundBtn = makeButton(scene, minus.x - minus.width - 16, y, 'Звуки', () => {
    scene.sound.mute = !scene.sound.mute;
    setMuted(scene.sound.mute);
    refreshSound();
  }, 20);
  const musicBtn = makeButton(scene, soundBtn.x - soundBtn.width - 8, y, 'Музыка', () => {
    const muted = !isMusicMuted();
    setMusicMuted(muted);
    music.setMuted(muted);
    refreshSound();
  }, 20);

  const refreshSpeed = () => speedText.setText(`Скорость: ${getSpeedLevel()} из ${SPEED_LEVELS}`);
  const refreshSound = () => {
    soundBtn.setAlpha(scene.sound.mute ? 0.4 : 1);
    musicBtn.setAlpha(isMusicMuted() ? 0.4 : 1);
  };
  const changeSpeed = (delta: number) => {
    const level = Phaser.Math.Clamp(getSpeedLevel() + delta, 1, SPEED_LEVELS);
    if (level === getSpeedLevel()) return;
    setSpeedLevel(level);
    sfx(scene, 'select', 0.3);
    refreshSpeed();
    onSpeedChange?.(level);
  };

  refreshSpeed();
  refreshSound();
  return { changeSpeed };
}
