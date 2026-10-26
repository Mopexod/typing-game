import Phaser from 'phaser';
import { keyByChar, looksLikeWrongLayout, HOME_ROW } from '../homeRow';
import { heroRunAnim, heroTexture, type HeroColor } from '../heroes';
import { LEVELS, starsFor, type Level } from '../levels';
import { music } from '../music';
import { DEFAULT_SPEED_LEVEL, getSpeedLevel, progress, saveProgress } from '../progress';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  GROUND_Y,
  INK_HEX,
  createCoinCounter,
  createTopBar,
  createWorld,
  drawPanel,
  playMusic,
  sfx,
  textStyle,
  type TopBar,
  type WorldLayers,
} from '../ui';

// Числа подобраны на глаз — меняйте и пробуйте.
const PLAYER_X = 200;
const PLAYER_W = 40; // хитбокс героя, картинка чуть шире
const PLAYER_H = 56;
const HERO_SCALE = 0.625; // кадр 128×128 → 80×80
const OBST_W = 56;
const OBST_H = 56;
const COIN_LIFT = 36; // насколько монетка висит над ящиком
const GRAVITY = 1800;
const MIN_JUMP_V = 520;
const JUMP_MARGIN = 1.6; // запас по времени над препятствием
const SPEED_LEVEL_STEP = 25; // px/с на уровень: 1 → 155, 4 → 230, 10 → 380
const SPEED_LEVEL_BASE = 130;
const STREAK_SPEED_BONUS = 0.01; // +1% скорости за каждое верное нажатие подряд
const MAX_STREAK_BONUS = 30;
const STREAK_CHEER_EVERY = 5;
const STUMBLE_SPEED_MUL = 0.45;
const SPEED_RECOVERY_PER_SEC = 0.4;
const GAP_SECONDS: [number, number] = [1.1, 1.7]; // интервал между препятствиями
const REACTION_SECONDS = 0.45; // минимум между приземлением и следующим препятствием
const CLOUDS_PARALLAX = 0.08;
const HILLS_PARALLAX = 0.25;
const PROGRESS_BAR_X = 210; // левее кнопок звука и скорости
const PROGRESS_BAR_W = 180;
const KEY_CAP_W = 54;
const KEY_CAP_H = 42;
const KEYBOARD_Y = 510;
const CHEERS = ['Супер!', 'Отлично!', 'Здорово!', 'Ух ты!', 'Молодец!'];

type State = 'ready' | 'run' | 'over';

interface Obstacle {
  crate: Phaser.Physics.Arcade.Sprite;
  body: Phaser.Physics.Arcade.Body;
  label: Phaser.GameObjects.Text;
  coin: Phaser.GameObjects.Image | null; // null — монетку уже забрали или потеряли
  ch: string;
  armed: boolean; // верная буква уже нажата — герой прыгнет сам в лучший момент
  jumped: boolean;
  hit: boolean;
}

interface KeyStat {
  ok: number;
  err: number;
}

export class RunScene extends Phaser.Scene {
  private state: State = 'ready';
  private levelIndex = 0;
  private level!: Level;
  private heroColor: HeroColor = 'green';

  private player!: Phaser.GameObjects.Rectangle; // невидимый физический хитбокс
  private playerBody!: Phaser.Physics.Arcade.Body;
  private hero!: Phaser.GameObjects.Sprite; // то, что видит игрок
  private obstacleGroup!: Phaser.Physics.Arcade.Group;
  private obstacles: Obstacle[] = [];
  private flag: Phaser.GameObjects.Sprite | null = null;
  private decor: Phaser.GameObjects.Image[] = [];
  private world!: WorldLayers;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkle!: Phaser.GameObjects.Particles.ParticleEmitter;

  private coinIcon!: Phaser.GameObjects.Image;
  private coinsText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private debug!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private panel!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Text;
  private resultStars: Phaser.GameObjects.Image[] = [];
  private keyboard!: Phaser.GameObjects.Graphics;
  private keyCapX = new Map<string, number>();
  private topBar!: TopBar;

  private airSpeed: number | null = null; // скорость мира замирает на время прыжка
  private wasOnGround = true;
  private hurtUntil = 0;
  private elapsed = 0;
  private speedMul = 1;
  private streak = 0;
  private distSinceSpawn = 0;
  private nextGap = 0;
  private spawned = 0;
  private correct = 0;
  private errors = 0;
  private coins = 0;
  private keyStats = new Map<string, KeyStat>();
  private lastChars: string[] = [];

  constructor() {
    super('run');
  }

  init(data: { level?: number }): void {
    this.levelIndex = Phaser.Math.Clamp(data.level ?? 0, 0, LEVELS.length - 1);
    this.level = LEVELS[this.levelIndex];
    this.heroColor = progress.hero;
    this.state = 'ready';
    this.obstacles = [];
    this.flag = null;
    this.decor = [];
    this.resultStars = [];
    this.keyCapX = new Map();
    this.resetRound();
  }

  create(): void {
    this.physics.world.gravity.y = GRAVITY;
    const { theme } = this.level;

    this.world = createWorld(this, theme.bg, theme.ground);
    for (let i = 0; i < 5; i++) this.addDecor(Phaser.Math.Between(0, GAME_WIDTH));

    const ground = this.add.rectangle(GAME_WIDTH / 2, GROUND_Y + 30, GAME_WIDTH, 60).setVisible(false);
    this.physics.add.existing(ground, true);

    this.player = this.add.rectangle(PLAYER_X, GROUND_Y - PLAYER_H / 2, PLAYER_W, PLAYER_H).setVisible(false);
    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.physics.add.collider(this.player, ground);

    this.hero = this.add
      .sprite(PLAYER_X, GROUND_Y, heroTexture(this.heroColor, 'idle'))
      .setOrigin(0.5, 1)
      .setScale(HERO_SCALE)
      .setDepth(5);

    this.obstacleGroup = this.physics.add.group({ allowGravity: false, immovable: true });
    this.physics.add.overlap(this.player, this.obstacleGroup, (_p, c) => {
      const obs = (c as Phaser.Physics.Arcade.Sprite).getData('obs') as Obstacle;
      this.onCrash(obs);
    });

    this.createEffects();
    this.createHud();
    playMusic(this, 'run', theme.transpose);
    this.drawKeyboard();
    this.showStartScreen();

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
  }

  update(_time: number, delta: number): void {
    this.syncHero();
    if (this.state !== 'run') return;
    const dt = delta / 1000;
    this.elapsed += dt;

    const onGround = this.isOnGround();
    if (onGround) this.airSpeed = null;
    if (onGround && !this.wasOnGround) this.onLand();
    this.wasOnGround = onGround;
    this.speedMul = Math.min(1, this.speedMul + SPEED_RECOVERY_PER_SEC * dt);
    const speed = this.airSpeed ?? this.currentSpeed();
    const { dStar } = this.jumpWindow(speed);

    for (const obs of this.obstacles) {
      obs.body.setVelocityX(-speed);
      // Позиция тела уже обновлена физикой в этом кадре, а у картинки — ещё нет: берём от тела.
      obs.label.setPosition(obs.body.center.x, obs.body.center.y);
      if (obs.coin) {
        const bob = Math.sin((this.elapsed + obs.body.x / 200) * 5) * 4;
        obs.coin.setPosition(obs.body.center.x, obs.body.y - COIN_LIFT + bob);
        if (obs.jumped && !obs.hit && obs.body.center.x <= this.playerBody.center.x) this.collectCoin(obs);
      }
      if (obs.armed && !obs.jumped && !obs.hit && onGround && this.distanceTo(obs) <= dStar) {
        this.jump();
        obs.jumped = true;
      }
    }

    // Убрать ушедшие за экран препятствия.
    this.obstacles = this.obstacles.filter((obs) => {
      if (obs.body.right < -10) {
        this.destroyObstacle(obs);
        return false;
      }
      return true;
    });

    this.scrollWorld(speed * dt);

    this.distSinceSpawn += speed * dt;
    if (this.distSinceSpawn >= this.nextGap) {
      if (this.spawned < this.level.crates) this.spawnObstacle(speed);
      else if (!this.flag) this.spawnFlag();
    }

    this.hero.anims.timeScale = speed / (SPEED_LEVEL_BASE + DEFAULT_SPEED_LEVEL * SPEED_LEVEL_STEP);
    this.refreshHud(speed);

    if (this.flag && this.flag.x <= this.playerBody.right && onGround) this.finishLevel();
  }

  // ---------- ввод ----------

  private onKey(e: KeyboardEvent): void {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      this.topBar.changeSpeed(e.code === 'ArrowUp' ? 1 : -1);
      return;
    }
    if (e.code === 'Escape') {
      this.scene.start('map', { select: this.levelIndex });
      return;
    }

    if (this.state === 'ready') {
      if (e.code === 'Space') {
        e.preventDefault();
        this.startRound();
      }
      return;
    }
    if (this.state === 'over') {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        const next = this.levelIndex + 1;
        if (e.code === 'Enter') this.scene.restart({ level: this.levelIndex });
        else if (next < LEVELS.length) this.scene.restart({ level: next });
        else this.scene.start('map', { select: this.levelIndex });
      }
      return;
    }

    const key = e.key.toLowerCase();
    if (key.length !== 1) return; // Shift, Tab и прочие служебные клавиши
    e.preventDefault();

    const target = this.nextTarget();
    if (!target) return;

    if (key === target.ch) {
      target.armed = true;
      target.crate.setTexture('crate_ok');
      this.tweens.add({ targets: target.label, scale: { from: 1.4, to: 1 }, duration: 200, ease: 'Back.easeOut' });
      this.correct++;
      this.streak++;
      this.stat(target.ch).ok++;
      if (this.streak % STREAK_CHEER_EVERY === 0) this.cheer();
      // Нажали поздно — прыгаем сразу, без ожидания лучшего момента.
      const { dStar } = this.jumpWindow(this.currentSpeed());
      if (this.distanceTo(target) <= dStar && this.isOnGround()) {
        this.jump();
        target.jumped = true;
      }
    } else if (looksLikeWrongLayout(key)) {
      this.showToast('Похоже, включена английская раскладка — переключи на русскую');
    } else {
      this.errors++;
      this.stat(target.ch).err++;
      this.stumble();
      this.tweens.add({ targets: target.label, angle: 12, duration: 40, yoyo: true, repeat: 2 });
    }
    this.refreshHint();
  }

  /** Первое препятствие впереди, для которого ещё не нажата буква. */
  private nextTarget(): Obstacle | undefined {
    return this.obstacles.find((o) => !o.armed && !o.hit && o.body.right > this.playerBody.x);
  }

  // ---------- скорость ----------

  private baseSpeed(): number {
    return SPEED_LEVEL_BASE + getSpeedLevel() * SPEED_LEVEL_STEP;
  }

  private currentSpeed(): number {
    const bonus = 1 + Math.min(this.streak, MAX_STREAK_BONUS) * STREAK_SPEED_BONUS;
    return this.baseSpeed() * bonus * this.speedMul;
  }

  // ---------- прыжок ----------

  /** Расстояние от передней кромки героя до препятствия. */
  private distanceTo(obs: Obstacle): number {
    return obs.body.x - this.playerBody.right;
  }

  /**
   * Сила прыжка зависит от скорости: на медленной скорости герой прыгает выше и дольше,
   * чтобы успеть перелететь препятствие целиком.
   */
  private jumpVelocity(speed: number): number {
    const clear = OBST_H + 4;
    const needAir = ((PLAYER_W + OBST_W) / speed) * JUMP_MARGIN;
    const half = (GRAVITY * needAir) / 2;
    return Math.max(MIN_JUMP_V, Math.sqrt(half * half + 2 * GRAVITY * clear));
  }

  private airtime(speed: number): number {
    return (2 * this.jumpVelocity(speed)) / GRAVITY;
  }

  /**
   * На каком расстоянии до препятствия нужно оттолкнуться, чтобы перелететь его.
   * Высота прыжка h(t) = J·t − g·t²/2 должна быть выше препятствия всё время,
   * пока герой над ним.
   */
  private jumpWindow(speed: number): { dMin: number; dMax: number; dStar: number } {
    const jumpV = this.jumpVelocity(speed);
    const clear = OBST_H + 4;
    const disc = Math.sqrt(jumpV * jumpV - 2 * GRAVITY * clear);
    const tUp = (jumpV - disc) / GRAVITY;
    const tDown = (jumpV + disc) / GRAVITY;
    const dMin = tUp * speed;
    const dMax = tDown * speed - (PLAYER_W + OBST_W);
    const dStar = dMax > dMin ? (dMin + dMax) / 2 : dMin;
    return { dMin, dMax, dStar };
  }

  private isOnGround(): boolean {
    return this.playerBody.blocked.down || this.playerBody.touching.down;
  }

  private jump(): void {
    const speed = this.currentSpeed();
    this.airSpeed = speed;
    this.wasOnGround = false;
    this.playerBody.setVelocityY(-this.jumpVelocity(speed));
    this.dust.explode(8, this.playerBody.center.x, GROUND_Y);
    sfx(this, 'jump', 0.35);
    this.squash(0.85, 1.15);
  }

  private onLand(): void {
    this.dust.explode(6, this.playerBody.center.x, GROUND_Y);
    this.squash(1.15, 0.85);
  }

  /** Сплющить и вернуть картинку героя — на хитбокс это не влияет. */
  private squash(sx: number, sy: number): void {
    this.tweens.killTweensOf(this.hero);
    this.hero.setScale(HERO_SCALE * sx, HERO_SCALE * sy).setAngle(0);
    this.tweens.add({ targets: this.hero, scaleX: HERO_SCALE, scaleY: HERO_SCALE, duration: 200, ease: 'Quad.easeOut' });
  }

  private stumble(): void {
    this.streak = 0;
    this.speedMul = STUMBLE_SPEED_MUL;
    this.hurtUntil = this.time.now + 400;
    this.cameras.main.shake(100, 0.004);
    sfx(this, 'hurt', 0.45);
    this.tweens.killTweensOf(this.hero);
    this.hero.setScale(HERO_SCALE).setAngle(-15);
    this.tweens.add({ targets: this.hero, angle: 0, duration: 380, ease: 'Elastic.easeOut' });
  }

  private onCrash(obs: Obstacle): void {
    if (obs.hit) return;
    obs.hit = true;
    obs.body.enable = false;
    if (!obs.armed) {
      // Не успели нажать — это тоже ошибка по этой букве.
      this.errors++;
      this.stat(obs.ch).err++;
    }
    sfx(this, 'bump', 0.5);
    this.stumble();
    obs.crate.setTexture('crate_hit');
    this.tweens.add({ targets: [obs.crate, obs.label], alpha: 0, angle: 30, duration: 350 });
    if (obs.coin) {
      this.tweens.add({ targets: obs.coin, y: obs.coin.y - 30, alpha: 0, duration: 350 });
      obs.coin = null;
    }
    this.refreshHint();
  }

  // ---------- монетки и эффекты ----------

  private createEffects(): void {
    this.dust = this.add
      .particles(0, 0, 'dot', {
        speed: { min: 30, max: 110 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.8, end: 0 },
        tint: 0xf3e2c7,
        lifespan: 420,
        gravityY: 120,
        emitting: false,
      })
      .setDepth(4);
    this.sparkle = this.add
      .particles(0, 0, 'star', {
        speed: { min: 60, max: 160 },
        scale: { start: 0.35, end: 0 },
        rotate: { min: 0, max: 360 },
        lifespan: 500,
        emitting: false,
      })
      .setDepth(12);
  }

  private collectCoin(obs: Obstacle): void {
    const coin = obs.coin!;
    obs.coin = null;
    this.coins++;
    sfx(this, 'coin', 0.4);
    this.sparkle.explode(6, coin.x, coin.y);
    coin.setDepth(9);
    this.tweens.add({
      targets: coin,
      x: this.coinIcon.x,
      y: this.coinIcon.y,
      scale: 0.35,
      duration: 450,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        coin.destroy();
        this.coinsText.setText(String(this.coins));
        this.tweens.add({ targets: this.coinIcon, scale: { from: 0.8, to: 0.6 }, duration: 160 });
      },
    });
  }

  private cheer(): void {
    sfx(this, 'gem', 0.35);
    const text = this.add
      .text(this.hero.x, this.hero.y - 90, `${Phaser.Utils.Array.GetRandom(CHEERS)} ×${this.streak}`, textStyle(30, { color: '#ffe066' }))
      .setOrigin(0.5)
      .setDepth(9);
    this.tweens.add({
      targets: text,
      y: text.y - 50,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.6, to: 1.1 },
      duration: 900,
      onComplete: () => text.destroy(),
    });
  }

  // ---------- мир ----------

  private syncHero(): void {
    this.hero.setPosition(this.playerBody.center.x, this.playerBody.bottom);
    if (this.state !== 'run') {
      this.hero.anims.stop();
      this.hero.setTexture(heroTexture(this.heroColor, this.state === 'over' ? 'front' : 'idle'));
    } else if (this.time.now < this.hurtUntil) {
      this.hero.anims.stop();
      this.hero.setTexture(heroTexture(this.heroColor, 'hit'));
    } else if (!this.isOnGround()) {
      this.hero.anims.stop();
      this.hero.setTexture(heroTexture(this.heroColor, 'jump'));
    } else {
      this.hero.anims.play(heroRunAnim(this.heroColor), true);
    }
  }

  private scrollWorld(dx: number): void {
    this.world.clouds.tilePositionX += dx * CLOUDS_PARALLAX;
    this.world.hills.tilePositionX += dx * HILLS_PARALLAX;
    this.world.groundTop.tilePositionX += dx;
    this.world.groundFill.tilePositionX += dx;
    this.flag?.setX(this.flag.x - dx);
    for (const d of this.decor) {
      d.x -= dx;
      if (d.x < -40) {
        d.x = GAME_WIDTH + Phaser.Math.Between(40, 400);
        d.setTexture(Phaser.Math.RND.pick(this.level.theme.decor));
      }
    }
  }

  private addDecor(x: number): void {
    const img = this.add
      .image(x, GROUND_Y + 2, Phaser.Math.RND.pick(this.level.theme.decor))
      .setOrigin(0.5, 1)
      .setScale(0.8)
      .setDepth(1.5);
    this.decor.push(img);
  }

  private spawnObstacle(speed: number): void {
    this.distSinceSpawn = 0;
    this.spawned++;
    // Между препятствиями должно хватать времени приземлиться и среагировать.
    const minGap = Math.max(GAP_SECONDS[0], this.airtime(speed) + REACTION_SECONDS);
    const maxGap = minGap + (GAP_SECONDS[1] - GAP_SECONDS[0]);
    this.nextGap = speed * Phaser.Math.FloatBetween(minGap, maxGap);

    // Не больше двух одинаковых букв подряд.
    let ch: string;
    do {
      ch = Phaser.Utils.Array.GetRandom(this.level.letters);
    } while (this.lastChars.length === 2 && this.lastChars.every((c) => c === ch));
    this.lastChars = [...this.lastChars, ch].slice(-2);

    const x = GAME_WIDTH + OBST_W;
    const crate = this.obstacleGroup.create(x, GROUND_Y - OBST_H / 2, 'crate') as Phaser.Physics.Arcade.Sprite;
    crate.setDisplaySize(OBST_W, OBST_H).setDepth(3);
    const body = crate.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setVelocityX(-speed);

    const label = this.add
      .text(x, crate.y, ch.toUpperCase(), textStyle(34, { fontStyle: '900', strokeThickness: 7 }))
      .setOrigin(0.5)
      .setDepth(4);
    const coin = this.add
      .image(x, crate.y - OBST_H / 2 - COIN_LIFT, 'coin_gold')
      .setScale(0.8)
      .setDepth(3);

    const obs: Obstacle = { crate, body, label, coin, ch, armed: false, jumped: false, hit: false };
    crate.setData('obs', obs);
    this.obstacles.push(obs);
    this.refreshHint();
  }

  private spawnFlag(): void {
    this.flag = this.add
      .sprite(GAME_WIDTH + 40, GROUND_Y + 2, 'flag_green_a')
      .setOrigin(0.3, 1)
      .setDepth(2)
      .play('flag_wave');
  }

  private destroyObstacle(obs: Obstacle): void {
    obs.crate.destroy();
    obs.label.destroy();
    obs.coin?.destroy();
  }

  // ---------- уровень ----------

  private resetRound(): void {
    this.elapsed = 0;
    this.speedMul = 1;
    this.streak = 0;
    this.airSpeed = null;
    this.wasOnGround = true;
    this.hurtUntil = 0;
    this.distSinceSpawn = 0;
    this.nextGap = this.baseSpeed() * 1.2;
    this.spawned = 0;
    this.correct = 0;
    this.errors = 0;
    this.coins = 0;
    this.keyStats = new Map();
    this.lastChars = [];
  }

  private startRound(): void {
    this.hidePanel();
    sfx(this, 'select', 0.4);
    this.state = 'run';
    this.refreshHint();
  }

  private finishLevel(): void {
    this.state = 'over';
    this.hero.setAngle(0);
    for (const obs of this.obstacles) obs.body.setVelocityX(0);
    this.flag?.stop();
    music.stop(); // на финише — только праздничная мелодия
    sfx(this, 'finish', 0.6);
    this.sparkle.explode(16, this.hero.x, this.hero.y - 50);

    const total = this.correct + this.errors;
    const accuracy = total ? Math.round((this.correct / total) * 100) : 100;
    const stars = starsFor(accuracy);
    const best = progress.stars[this.levelIndex] ?? 0;
    progress.stars[this.levelIndex] = Math.max(best, stars);
    progress.coins += this.coins;
    saveProgress();

    const cpm = Math.round(this.correct / (this.elapsed / 60));
    const worst = [...this.keyStats.entries()]
      .filter(([, s]) => s.err > 0)
      .sort((a, b) => b[1].err - a[1].err)
      .slice(0, 3)
      .map(([ch, s]) => `${ch.toUpperCase()} ×${s.err}`)
      .join(',  ');
    const isLast = this.levelIndex === LEVELS.length - 1;

    this.showPanel(
      [
        isLast ? 'Весь основной ряд пройден!' : `Уровень ${this.levelIndex + 1} пройден!`,
        '', // место для звёзд
        '',
        `Монеток: +${this.coins}   (всего: ${progress.coins})`,
        `Точность: ${accuracy}%   ·   Знаков в минуту: ${cpm}`,
        worst ? `Чаще всего ошибки: ${worst}` : 'Ни одной ошибки — отлично!',
        '',
        isLast ? 'Пробел — на карту   ·   Enter — ещё раз' : 'Пробел — дальше   ·   Enter — ещё раз   ·   Esc — карта',
      ],
      70,
    );
    this.showResultStars(stars);
    this.hint.setText('');
    this.renderKeyboard(undefined);
  }

  private showResultStars(stars: number): void {
    const y = this.overlay.getBounds().y + 66;
    for (let i = 0; i < 3; i++) {
      const earned = i < stars;
      const star = this.add
        .image(GAME_WIDTH / 2 + (i - 1) * 64, y, 'star')
        .setDepth(12)
        .setScale(0)
        .setAlpha(earned ? 1 : 0.3);
      if (!earned) star.setTint(0x8a8aa0);
      this.tweens.add({
        targets: star,
        scale: 0.9,
        delay: 250 + i * 250,
        duration: 300,
        ease: 'Back.easeOut',
        onStart: () => {
          if (earned) sfx(this, 'gem', 0.3);
        },
      });
      this.resultStars.push(star);
    }
  }

  // ---------- интерфейс ----------

  private createHud(): void {
    ({ icon: this.coinIcon, text: this.coinsText } = createCoinCounter(this, 0));
    this.streakText = this.add.text(18, 62, '', textStyle(18)).setOrigin(0, 0.5).setDepth(7);
    this.progressBar = this.add.graphics().setDepth(7);
    this.progressText = this.add.text(PROGRESS_BAR_X - 12, 30, '', textStyle(20)).setOrigin(1, 0.5).setDepth(7);
    this.debug = this.add
      .text(16, GAME_HEIGHT - 4, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' })
      .setOrigin(0, 1)
      .setDepth(7)
      .setVisible(new URLSearchParams(location.search).has('debug'));
    this.topBar = createTopBar(this, () => {
      if (this.state === 'ready') this.showStartScreen();
    });

    this.hint = this.add
      .text(GAME_WIDTH / 2, GROUND_Y + 66, '', textStyle(20))
      .setOrigin(0.5, 0)
      .setDepth(7);
    this.toast = this.add
      .text(GAME_WIDTH / 2, 100, '', textStyle(22, { color: '#ffe066', backgroundColor: '#35354acc', padding: { x: 14, y: 8 } }))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(9);
    this.panel = this.add.graphics().setDepth(10);
    this.overlay = this.add
      .text(GAME_WIDTH / 2, 205, '', textStyle(22, { align: 'center', lineSpacing: 4, strokeThickness: 0 }))
      .setOrigin(0.5)
      .setDepth(11);
    this.drawProgress();
  }

  /** Полоска пути над головой: сколько ящиков уже позади. */
  private drawProgress(): void {
    const behind = this.spawned - this.obstacles.filter((o) => o.body.center.x > this.playerBody.center.x).length;
    const done = this.state === 'over' ? 1 : behind / this.level.crates;
    const x = PROGRESS_BAR_X;
    const g = this.progressBar.clear();
    g.fillStyle(INK_HEX, 0.85).fillRoundedRect(x, 20, PROGRESS_BAR_W, 20, 10);
    if (done > 0) g.fillStyle(0xffe066, 1).fillRoundedRect(x + 3, 23, Math.max(14, (PROGRESS_BAR_W - 6) * done), 14, 7);
    this.progressText.setText(`Ур. ${this.levelIndex + 1}`);
  }

  private showPanel(lines: string[], y = 205): void {
    this.overlay.setY(y).setOrigin(0.5, 0).setText(lines).setVisible(true);
    const b = this.overlay.getBounds();
    this.panel.clear().setVisible(true);
    drawPanel(this.panel, b.x - 28, b.y - 20, b.width + 56, b.height + 40);
  }

  private hidePanel(): void {
    this.overlay.setVisible(false);
    this.panel.setVisible(false);
  }

  private showStartScreen(): void {
    const { letters, newLetters, theme } = this.level;
    const lines = [`Уровень ${this.levelIndex + 1}  ·  ${theme.name}`, '', `Буквы: ${letters.map((c) => c.toUpperCase()).join(' ')}`];
    if (newLetters.length) {
      lines.push(
        `Новые: ${newLetters.map((c) => `${c.toUpperCase()} — ${keyByChar.get(c)!.finger}`).join(',  ')}`,
      );
    } else {
      lines.push('Повторяем выученные буквы');
    }
    lines.push('', 'Нажимай букву на ящике — герой перепрыгнет и возьмёт монетку.');
    lines.push('Можно нажимать заранее. Добеги до флажка!', '', 'Пробел — старт   ·   Esc — карта');
    this.showPanel(lines, 100);
  }

  private drawKeyboard(): void {
    const gap = 8;
    const extraGap = 40; // промежуток между руками
    const totalW = HOME_ROW.length * KEY_CAP_W + (HOME_ROW.length - 1) * gap + extraGap;
    let x = (GAME_WIDTH - totalW) / 2 + KEY_CAP_W / 2;
    this.keyboard = this.add.graphics().setDepth(6);
    HOME_ROW.forEach((k, i) => {
      if (i === 4) x += extraGap;
      this.keyCapX.set(k.ch, x);
      const inLevel = this.level.letters.includes(k.ch);
      this.add
        .text(x, KEYBOARD_Y, k.ch.toUpperCase(), textStyle(22))
        .setOrigin(0.5)
        .setDepth(7)
        .setAlpha(inLevel ? 1 : 0.35);
      x += KEY_CAP_W + gap;
    });
    this.renderKeyboard(undefined);
  }

  private renderKeyboard(highlight: string | undefined): void {
    const g = this.keyboard.clear();
    for (const [ch, x] of this.keyCapX) {
      const k = keyByChar.get(ch)!;
      const on = ch === highlight;
      const inLevel = this.level.letters.includes(ch);
      const isNew = this.level.newLetters.includes(ch);
      const y = on ? KEYBOARD_Y - 3 : KEYBOARD_Y; // подсвеченная клавиша чуть «приподнята»
      const left = x - KEY_CAP_W / 2;
      const top = y - KEY_CAP_H / 2;
      g.fillStyle(on ? k.color : INK_HEX, on ? 1 : inLevel ? 0.85 : 0.4).fillRoundedRect(left, top, KEY_CAP_W, KEY_CAP_H, 10);
      g.lineStyle(isNew && !on ? 4 : 3, on || isNew ? 0xffffff : k.color, inLevel ? 1 : 0.35);
      g.strokeRoundedRect(left, top, KEY_CAP_W, KEY_CAP_H, 10);
    }
  }

  private refreshHint(): void {
    const target = this.nextTarget();
    this.renderKeyboard(target?.ch);
    if (!target) {
      this.hint.setText('');
      return;
    }
    const k = keyByChar.get(target.ch)!;
    this.hint.setText(`Следующая: ${k.ch.toUpperCase()} — ${k.finger}`);
  }

  private refreshHud(speed: number): void {
    this.drawProgress();
    this.streakText.setText(this.streak > 0 ? `Серия: ${this.streak}` : '');

    if (!this.debug.visible) return;
    const { dMin, dMax, dStar } = this.jumpWindow(speed);
    const target = this.nextTarget();
    const d = target ? Math.round(this.distanceTo(target)) : '—';
    this.debug.setText(
      `[отладка] скорость ${Math.round(speed)} px/c · окно прыжка ${Math.round(dMin)}–${Math.round(dMax)} px` +
        ` (прыжок на ${Math.round(dStar)}) · до цели ${d} px`,
    );
  }

  private showToast(text: string): void {
    this.toast.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1600, duration: 400 });
  }

  private stat(ch: string): KeyStat {
    let s = this.keyStats.get(ch);
    if (!s) {
      s = { ok: 0, err: 0 };
      this.keyStats.set(ch, s);
    }
    return s;
  }
}
