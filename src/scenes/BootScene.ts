import Phaser from 'phaser';
import { HEROES, HERO_FRAMES, heroRunAnim, heroTexture } from '../heroes';
import { GAME_WIDTH, GAME_HEIGHT, textStyle } from '../ui';

/** Загружает все картинки и звуки один раз и создаёт общие анимации. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Загрузка…', textStyle(28)).setOrigin(0.5);

    this.load.setPath('assets/');
    for (const { color } of HEROES) {
      for (const f of HERO_FRAMES) this.load.image(heroTexture(color, f), `heroes/${color}_${f}.png`);
    }
    for (const t of ['grass', 'sand', 'purple']) {
      this.load.image(`${t}_top`, `ground/${t}_top.png`);
      this.load.image(`${t}_fill`, `ground/${t}_fill.png`);
    }
    for (const b of ['clouds', 'hills', 'trees', 'desert', 'mushrooms']) this.load.image(`bg_${b}`, `bg/${b}.png`);
    this.load.image('crate', 'tiles/block_empty.png');
    this.load.image('crate_ok', 'tiles/block_green.png');
    this.load.image('crate_hit', 'tiles/block_red.png');
    for (const t of [
      'coin_gold',
      'hud_coin',
      'star',
      'bush',
      'grass',
      'cactus',
      'mushroom_red',
      'mushroom_brown',
      'flag_green_a',
      'flag_green_b',
      'lock_yellow',
    ]) {
      this.load.image(t, `tiles/${t}.png`);
    }
    for (const s of ['jump', 'coin', 'hurt', 'bump', 'select', 'gem', 'finish']) this.load.audio(`sfx_${s}`, `audio/${s}.ogg`);
  }

  create(): void {
    for (const { color } of HEROES) {
      this.anims.create({
        key: heroRunAnim(color),
        frames: [{ key: heroTexture(color, 'walk_a') }, { key: heroTexture(color, 'walk_b') }],
        frameRate: 8,
        repeat: -1,
      });
    }
    this.anims.create({
      key: 'flag_wave',
      frames: [{ key: 'flag_green_a' }, { key: 'flag_green_b' }],
      frameRate: 4,
      repeat: -1,
    });

    const g = this.add.graphics();
    g.fillStyle(0xffffff).fillCircle(8, 8, 8);
    g.generateTexture('dot', 16, 16);
    g.destroy();

    this.scene.start('map');
  }
}
