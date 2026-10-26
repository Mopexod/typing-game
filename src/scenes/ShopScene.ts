import Phaser from 'phaser';
import { HEROES, heroRunAnim, heroTexture, type Hero } from '../heroes';
import { progress, saveProgress } from '../progress';
import {
  GAME_WIDTH,
  GROUND_Y,
  INK_HEX,
  createCoinCounter,
  createWorld,
  makeButton,
  playMusic,
  sfx,
  textStyle,
} from '../ui';

const CARD_W = 160;
const CARD_H = 250;
const CARD_GAP = 18;
const CARD_TOP = 125;

interface Card {
  hero: Hero;
  x: number;
  sprite: Phaser.GameObjects.Sprite;
  status: Phaser.GameObjects.Text;
  priceIcon: Phaser.GameObjects.Image;
}

/** Магазин героев: монетки, накопленные в забегах, тратятся на новых персонажей. */
export class ShopScene extends Phaser.Scene {
  private cursor = 0;
  private cards: Card[] = [];
  private cardGfx!: Phaser.GameObjects.Graphics;
  private coinsText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private toast!: Phaser.GameObjects.Text;
  private sparkle!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('shop');
  }

  init(): void {
    this.cards = [];
    this.cursor = Math.max(0, HEROES.findIndex((h) => h.color === progress.hero));
  }

  create(): void {
    createWorld(this, 'bg_hills', 'grass');
    ({ icon: this.coinIcon, text: this.coinsText } = createCoinCounter(this, progress.coins));
    makeButton(this, GAME_WIDTH - 16, 30, '← Карта', () => this.back());
    playMusic(this, 'map');
    this.add.text(GAME_WIDTH / 2, 82, 'Герои', textStyle(32)).setOrigin(0.5).setDepth(7);

    this.cardGfx = this.add.graphics().setDepth(2);
    const totalW = HEROES.length * CARD_W + (HEROES.length - 1) * CARD_GAP;
    HEROES.forEach((hero, i) => {
      const x = (GAME_WIDTH - totalW) / 2 + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      const sprite = this.add
        .sprite(x, CARD_TOP + 150, heroTexture(hero.color, 'idle'))
        .setOrigin(0.5, 1)
        .setScale(0.9)
        .setDepth(3);
      this.add.text(x, CARD_TOP + 172, hero.name, textStyle(22)).setOrigin(0.5).setDepth(3);
      const priceIcon = this.add.image(x - 26, CARD_TOP + 215, 'hud_coin').setScale(0.5).setDepth(3);
      const status = this.add.text(x, CARD_TOP + 215, '', textStyle(20)).setOrigin(0.5).setDepth(3);
      this.add
        .zone(x, CARD_TOP + CARD_H / 2, CARD_W, CARD_H)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.cursor = i;
          this.activate();
        });
      this.cards.push({ hero, x, sprite, status, priceIcon });
    });

    this.add
      .text(GAME_WIDTH / 2, GROUND_Y + 80, '← → — выбрать   ·   Пробел — купить или надеть   ·   Esc — на карту', textStyle(18))
      .setOrigin(0.5)
      .setDepth(7);
    this.toast = this.add
      .text(GAME_WIDTH / 2, GROUND_Y + 30, '', textStyle(22, { color: '#ffe066', backgroundColor: '#35354acc', padding: { x: 14, y: 8 } }))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(9);
    this.sparkle = this.add
      .particles(0, 0, 'star', { speed: { min: 80, max: 200 }, scale: { start: 0.4, end: 0 }, lifespan: 600, emitting: false })
      .setDepth(10);

    this.render();
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        const next = Phaser.Math.Clamp(this.cursor + (e.code === 'ArrowLeft' ? -1 : 1), 0, HEROES.length - 1);
        if (next !== this.cursor) {
          this.cursor = next;
          sfx(this, 'select', 0.25);
          this.render();
        }
        break;
      }
      case 'Space':
      case 'Enter':
        e.preventDefault();
        this.activate();
        break;
      case 'Escape':
        this.back();
        break;
    }
  }

  /** Купить героя под курсором или надеть уже купленного. */
  private activate(): void {
    const card = this.cards[this.cursor];
    const { hero } = card;
    if (!progress.owned.includes(hero.color)) {
      if (progress.coins < hero.price) {
        this.showToast(`Нужно ещё ${hero.price - progress.coins} монеток — проходи уровни!`);
        sfx(this, 'hurt', 0.3);
        this.tweens.add({ targets: card.sprite, angle: { from: -8, to: 8 }, duration: 60, yoyo: true, repeat: 2, onComplete: () => card.sprite.setAngle(0) });
        this.render();
        return;
      }
      progress.coins -= hero.price;
      progress.owned.push(hero.color);
      this.coinsText.setText(String(progress.coins));
      this.tweens.add({ targets: this.coinIcon, scale: { from: 0.8, to: 0.6 }, duration: 160 });
      sfx(this, 'coin', 0.5);
      this.sparkle.explode(14, card.x, CARD_TOP + 100);
    } else {
      sfx(this, 'select', 0.4);
    }
    progress.hero = hero.color;
    saveProgress();
    this.tweens.add({ targets: card.sprite, y: { from: CARD_TOP + 150, to: CARD_TOP + 130 }, duration: 150, yoyo: true });
    this.render();
  }

  private render(): void {
    const g = this.cardGfx.clear();
    this.cards.forEach((card, i) => {
      const owned = progress.owned.includes(card.hero.color);
      const chosen = progress.hero === card.hero.color;
      const atCursor = i === this.cursor;
      const left = card.x - CARD_W / 2;
      g.fillStyle(INK_HEX, atCursor ? 0.9 : 0.7).fillRoundedRect(left, CARD_TOP, CARD_W, CARD_H, 18);
      g.lineStyle(atCursor ? 6 : 3, atCursor ? 0xffffff : chosen ? 0x7ee08a : 0x8a8aa0, 1);
      g.strokeRoundedRect(left, CARD_TOP, CARD_W, CARD_H, 18);

      if (atCursor) card.sprite.play(heroRunAnim(card.hero.color), true);
      else card.sprite.stop().setTexture(heroTexture(card.hero.color, 'idle'));
      card.sprite.setAlpha(owned ? 1 : 0.75);

      card.priceIcon.setVisible(!owned);
      if (chosen) card.status.setText('Выбран ✓').setColor('#7ee08a').setX(card.x);
      else if (owned) card.status.setText('Надеть').setColor('#ffffff').setX(card.x);
      else card.status.setText(String(card.hero.price)).setColor(progress.coins >= card.hero.price ? '#ffe066' : '#c8c8d8').setX(card.x + 10);
    });
  }

  private showToast(text: string): void {
    this.toast.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1600, duration: 400 });
  }

  private back(): void {
    this.scene.start('map');
  }
}
