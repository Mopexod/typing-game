// Фоновая музыка без файлов: ноты играются синтезатором WebAudio в духе 8-битных приставок.
// Мелодии записаны восьмыми долями: нота («E5», «C#4»), «-» — тянуть предыдущую, «.» — пауза.
// Черта «|» отделяет такты и нужна только для чтения.

export type SongKey = 'map' | 'run';

interface Song {
  bpm: number;
  lead: string;
  leadWave: OscillatorType;
  bass: string;
  drums: boolean;
}

const SONGS: Record<SongKey, Song> = {
  // Спокойная мелодия для карты и магазина: C – Am – F – G.
  map: {
    bpm: 100,
    leadWave: 'triangle',
    lead: `G4 - E5 - D5 - C5 - | A4 - C5 - E5 - - - | F4 - A4 - C5 - D5 - | B4 - D5 - G5 - - -
           G4 - E5 - D5 - C5 - | A4 - C5 - E5 - D5 C5 | F4 - A4 - C5 - A4 - | G4 - - - - - . .`,
    bass: `C3 - - - G2 - - - | A2 - - - E2 - - - | F2 - - - C3 - - - | G2 - - - D3 - - -
           C3 - - - G2 - - - | A2 - - - E2 - - - | F2 - - - C3 - - - | G2 - - - G2 - . .`,
    drums: false,
  },
  // Бодрая мелодия для забега: C – G – Am – F | F – G – C – G.
  run: {
    bpm: 132,
    leadWave: 'square',
    lead: `E5 - G5 - C6 - G5 - | D5 - G5 - B5 - A5 G5 | C5 - E5 - A5 - G5 E5 | F5 - A5 - C6 - - -
           A5 - G5 F5 E5 - F5 - | G5 - - D5 G5 - A5 B5 | C6 - G5 - E5 - G5 - | D5 - E5 - D5 - - -`,
    bass: `C3 C4 C3 C4 C3 C4 C3 C4 | G2 G3 G2 G3 G2 G3 G2 G3 | A2 A3 A2 A3 A2 A3 A2 A3 | F2 F3 F2 F3 F2 F3 F2 F3
           F2 F3 F2 F3 F2 F3 F2 F3 | G2 G3 G2 G3 G2 G3 G2 G3 | C3 C4 C3 C4 C3 C4 C3 C4 | G2 G3 G2 G3 G2 G3 B2 B3`,
    drums: true,
  },
};

const MUSIC_VOLUME = 0.5;
const LEAD_GAIN = 0.07;
const BASS_GAIN = 0.16;
const LOOKAHEAD_SEC = 0.15; // на сколько вперёд расписывать ноты
const TICK_MS = 30;

interface NoteEvent {
  step: number;
  midi: number;
  steps: number; // длительность в восьмых
}

interface ParsedSong {
  song: Song;
  lead: NoteEvent[];
  bass: NoteEvent[];
  length: number; // восьмых в куплете
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function parseLine(text: string): { events: NoteEvent[]; length: number } {
  const tokens = text.split(/\s+/).filter((t) => t && t !== '|');
  const events: NoteEvent[] = [];
  tokens.forEach((tok, step) => {
    if (tok === '-') {
      const last = events[events.length - 1];
      if (last && last.step + last.steps === step) last.steps++;
      return;
    }
    if (tok === '.') return;
    const m = /^([A-G])(#?)(\d)$/.exec(tok);
    if (!m) throw new Error(`Не понимаю ноту «${tok}»`);
    const midi = 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]] + (m[2] ? 1 : 0);
    events.push({ step, midi, steps: 1 });
  });
  return { events, length: tokens.length };
}

function parseSong(song: Song): ParsedSong {
  const lead = parseLine(song.lead);
  const bass = parseLine(song.bass);
  return { song, lead: lead.events, bass: bass.events, length: Math.max(lead.length, bass.length) };
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class MusicPlayer {
  private ctx: BaseAudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private current: ParsedSong | null = null;
  private currentKey: string | null = null;
  private transpose = 0;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private muted = false;

  /** Подключить к аудиоконтексту (у игры он свой, его и берём). */
  attach(ctx: BaseAudioContext): void {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : MUSIC_VOLUME;
    this.out.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(muted ? 0 : MUSIC_VOLUME, this.ctx.currentTime, 0.05);
  }

  /** Включить песню; та же песня в той же тональности продолжает играть без перезапуска. */
  play(key: SongKey, transpose = 0): void {
    if (!this.ctx) return;
    const id = `${key}:${transpose}`;
    if (this.currentKey === id && this.timer) return;
    this.stop();
    this.current = parseSong(SONGS[key]);
    this.currentKey = id;
    this.transpose = transpose;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.currentKey = null;
  }

  /** Расписать ноты, которые должны прозвучать в ближайшие LOOKAHEAD_SEC секунд. */
  schedule(until?: number): void {
    const ctx = this.ctx;
    const song = this.current;
    if (!ctx || !song) return;
    const stepDur = 60 / song.song.bpm / 2;
    const horizon = until ?? ctx.currentTime + LOOKAHEAD_SEC;
    // Вкладка долго была неактивна — не играть пропущенное разом, а продолжить с текущего момента.
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < horizon) {
      const s = this.step % song.length;
      for (const e of song.lead) if (e.step === s) this.tone(song.song.leadWave, e, stepDur, LEAD_GAIN);
      for (const e of song.bass) if (e.step === s) this.tone('triangle', e, stepDur, BASS_GAIN);
      if (song.song.drums) this.drums(s, this.nextTime);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private tone(wave: OscillatorType, e: NoteEvent, stepDur: number, peak: number): void {
    const ctx = this.ctx!;
    const t = this.nextTime;
    const dur = e.steps * stepDur;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = midiToFreq(e.midi + this.transpose);
    // Короткая атака, спад до 60% и мягкое затухание в конце ноты — без щелчков.
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.01);
    gain.gain.linearRampToValueAtTime(peak * 0.6, t + 0.08);
    gain.gain.setValueAtTime(peak * 0.6, t + dur - 0.04);
    gain.gain.linearRampToValueAtTime(0, t + dur - 0.005);
    osc.connect(gain).connect(this.out!);
    osc.start(t);
    osc.stop(t + dur);
  }

  /** Бочка на 1 и 3, малый на 2 и 4, хэт на каждую слабую восьмую. */
  private drums(step: number, t: number): void {
    const beat = step % 8;
    if (beat === 0 || beat === 4) this.kick(t);
    if (beat === 2 || beat === 6) this.hit(t, 'bandpass', 1800, 0.12, 0.09);
    if (beat % 2 === 1) this.hit(t, 'highpass', 7000, 0.03, 0.04);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  private hit(t: number, type: BiquadFilterType, freq: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.out!);
    src.start(t);
    src.stop(t + dur + 0.01);
  }
}

/** Одна музыка на всю игру: сцены переключают песни, а не создают свои проигрыватели. */
export const music = new MusicPlayer();
