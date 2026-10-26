import Phaser from 'phaser';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import { BootScene } from './scenes/BootScene';
import { MapScene } from './scenes/MapScene';
import { RunScene } from './scenes/RunScene';
import { ShopScene } from './scenes/ShopScene';
import { GAME_WIDTH, GAME_HEIGHT } from './ui';

function startGame(): void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#c3e3ff',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 1800 }, debug: false },
    },
    scene: [BootScene, MapScene, RunScene, ShopScene],
  });

  // Доступ к игре из консоли браузера для отладки (только в dev-режиме).
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
}

// Canvas не ждёт веб-шрифты сам: без предзагрузки первые надписи нарисуются запасным шрифтом.
Promise.all([
  document.fonts.load('900 32px Nunito', 'ФЫВА ОЛДЖ 0123'),
  document.fonts.load('800 20px Nunito', 'Скорость 0123'),
])
  .catch(() => undefined)
  .finally(startGame);
