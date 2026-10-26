import Phaser from 'phaser';
import { heroTexture } from '../heroes';
import { LEVELS, isUnlocked } from '../levels';
import { progress } from '../progress';
import {
  GAME_WIDTH,
  GROUND_Y,
  INK_HEX,
  createCoinCounter,
  createTopBar,
  createWorld,
  drawPanel,
  makeButton,
  playMusic,
  sfx,
  textStyle,
  type TopBar,
  type WorldLayers,
} from '../ui';

const NODE_SIZE = 68;
const LOCKED_COLOR = 0x9a9ab0;
const HERO_SCALE = 0.6;

interface Node {
  x: number;
  y: number;
}

/** Карта уровней: выбрать уровень, посмотреть звёзды, перейти к героям. */
export class MapScene extends Phaser.Scene {
  private selected = 0;
  private nodes: Node[] = [];
  private world!: WorldLayers;
  private hero!: Phaser.GameObjects.Sprite;
  private nodeGfx!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private infoPanel!: Phaser.GameObjects.Graphics;
  private topBar!: TopBar;

  constructor() {
    super('map');
  }

  init(data: { select?: number }): void {
    this.nodes = LEVELS.map((_, i) => ({ x: 100 + i * ((GAME_WIDTH - 200) / (LEVELS.length - 1)), y: i % 2 ? 275 : 205 }));
    // По умолчанию — первый ещё не пройденный открытый уровень.
    const firstNew = LEVELS.findIndex((_, i) => isUnlocked(i, progress.stars) && !progress.stars[i]);
    const fallback = firstNew >= 0 ? firstNew : LEVELS.length - 1;
    const wanted = data.select ?? fallback;
    this.selected = isUnlocked(wanted, progress.stars) ? wanted : fallback;
  }

  create(): void {
    this.world = createWorld(this, 'bg_hills', 'grass');
    createCoinCounter(this, progress.coins);
    makeButton(this, 250, 30, '★ Герои', () => this.scene.start('shop'));
    this.topBar = createTopBar(this);
    playMusic(this, 'map');
    this.add.text(GAME_WIDTH / 2, 92, 'Выбери уровень', textStyle(30)).setOrigin(0.5).setDepth(7);

    this.drawPath();
    this.nodeGfx = this.add.graphics().setDepth(3);
    LEVELS.forEach((level, i) => this.drawNodeContent(i, level.letters));
    this.renderNodes();

    const node = this.nodes[this.selected];
    this.hero = this.add
      .sprite(node.x, node.y - NODE_SIZE / 2, heroTexture(progress.hero, 'idle'))
      .setOrigin(0.5, 1)
      .setScale(HERO_SCALE)
      .setDepth(6);

    this.infoPanel = this.add.graphics().setDepth(6);
    this.info = this.add
      .text(GAME_WIDTH / 2, GROUND_Y + 70, '', textStyle(20, { align: 'center', strokeThickness: 0, lineSpacing: 4 }))
      .setOrigin(0.5)
      .setDepth(7);
    this.refreshInfo();

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
  }

  update(_time: number, delta: number): void {
    this.world.clouds.tilePositionX += delta * 0.01;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft':
        this.select(this.selected - 1);
        break;
      case 'ArrowRight':
        this.select(this.selected + 1);
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        this.topBar.changeSpeed(e.code === 'ArrowUp' ? 1 : -1);
        break;
      case 'Space':
      case 'Enter':
        e.preventDefault();
        this.play();
        break;
    }
  }

  private select(index: number): void {
    if (index < 0 || index >= LEVELS.length || index === this.selected) return;
    if (!isUnlocked(index, progress.stars)) {
      this.cameras.main.shake(80, 0.003);
      return;
    }
    this.selected = index;
    sfx(this, 'jump', 0.25);
    const node = this.nodes[index];
    this.tweens.killTweensOf(this.hero);
    this.tweens.add({ targets: this.hero, x: node.x, duration: 260, ease: 'Sine.easeInOut' });
    // Прыжок по дуге: вверх и на новую кнопку.
    this.tweens.add({
      targets: this.hero,
      y: { from: this.hero.y, to: node.y - NODE_SIZE / 2 },
      duration: 260,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({ targets: this.hero, scaleY: HERO_SCALE * 1.15, duration: 130, yoyo: true });
    this.renderNodes();
    this.refreshInfo();
  }

  private play(): void {
    this.scene.start('run', { level: this.selected });
  }

  private drawPath(): void {
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(0xffffff, 0.9);
    for (let i = 0; i < this.nodes.length - 1; i++) {
      const a = this.nodes[i];
      const b = this.nodes[i + 1];
      for (let t = 0.2; t <= 0.8; t += 0.15) g.fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 4);
    }
  }

  /** Номер или замок, звёзды и буквы уровня — не меняются, пока открыта карта. */
  private drawNodeContent(i: number, letters: string[]): void {
    const { x, y } = this.nodes[i];
    const unlocked = isUnlocked(i, progress.stars);
    const hit = this.add.zone(x, y, NODE_SIZE, NODE_SIZE).setInteractive({ useHandCursor: unlocked });
    hit.on('pointerdown', () => (i === this.selected ? this.play() : this.select(i)));

    if (unlocked) this.add.text(x, y, String(i + 1), textStyle(34, { fontStyle: '900' })).setOrigin(0.5).setDepth(4);
    else this.add.image(x, y, 'lock_yellow').setScale(0.7).setDepth(4);

    const stars = progress.stars[i] ?? 0;
    for (let s = 0; s < 3; s++) {
      const star = this.add.image(x + (s - 1) * 22, y + NODE_SIZE / 2 + 16, 'star').setScale(0.36).setDepth(4);
      if (s >= stars) star.setTint(0x8a8aa0).setAlpha(0.45);
    }
    this.add
      .text(x, y + NODE_SIZE / 2 + 42, letters.length === 8 ? 'все' : letters.map((c) => c.toUpperCase()).join(' '), textStyle(16))
      .setOrigin(0.5)
      .setDepth(4)
      .setAlpha(unlocked ? 1 : 0.6);
  }

  private renderNodes(): void {
    const g = this.nodeGfx.clear();
    LEVELS.forEach((level, i) => {
      const { x, y } = this.nodes[i];
      const unlocked = isUnlocked(i, progress.stars);
      const half = NODE_SIZE / 2;
      g.fillStyle(unlocked ? level.theme.color : LOCKED_COLOR, 1).fillRoundedRect(x - half, y - half, NODE_SIZE, NODE_SIZE, 16);
      g.fillStyle(0xffffff, 0.25).fillRoundedRect(x - half + 6, y - half + 5, NODE_SIZE - 12, 12, 6); // блик
      const isSel = i === this.selected;
      g.lineStyle(isSel ? 6 : 4, isSel ? 0xffffff : INK_HEX, 1).strokeRoundedRect(x - half, y - half, NODE_SIZE, NODE_SIZE, 16);
    });
  }

  private refreshInfo(): void {
    const level = LEVELS[this.selected];
    const letters = level.letters.map((c) => c.toUpperCase()).join(' ');
    this.info.setText([
      `Уровень ${this.selected + 1}  ·  ${level.theme.name}  ·  ${letters}`,
      'Пробел — играть   ·   ← → — выбрать уровень',
    ]);
    const b = this.info.getBounds();
    drawPanel(this.infoPanel.clear(), b.x - 24, b.y - 12, b.width + 48, b.height + 24, 0.8);
  }
}
