import Phaser from 'phaser';
import { REGISTRY } from '../config/constants';
export interface AudioSettings {
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
}
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  sound: true,
  music: true,
  soundVolume: 0.6,
  musicVolume: 0.35,
};

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(REGISTRY.AUDIO) ?? '{}');
    const volume = (value: unknown, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) ? Phaser.Math.Clamp(value, 0, 1) : fallback;
    return {
      sound: typeof raw?.sound === 'boolean' ? raw.sound : true,
      music: typeof raw?.music === 'boolean' ? raw.music : true,
      soundVolume: volume(raw?.soundVolume, 0.6), musicVolume: volume(raw?.musicVolume, 0.35),
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(REGISTRY.AUDIO, JSON.stringify(settings));
  } catch {
    // The game remains playable when storage is unavailable.
  }
}
export class AudioManager {
  private settings: AudioSettings;
  private music?: Phaser.Sound.BaseSound;
  private musicPaused = false;
  constructor(private readonly scene: Phaser.Scene) {
    this.settings = loadAudioSettings();
    scene.registry.set(REGISTRY.AUDIO, this.settings);
    scene.game.events.on('blur', this.onBlur, this);
    scene.game.events.on('focus', this.onFocus, this);
    scene.registry.events.on('changedata', this.onSettings, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.game.events.off('blur', this.onBlur, this);
      scene.game.events.off('focus', this.onFocus, this);
      scene.registry.events.off('changedata', this.onSettings, this);
      this.music?.destroy();
    });
  }
  private onSettings(_parent: Phaser.Data.DataManager, key: string, value: AudioSettings): void {
    if (key !== REGISTRY.AUDIO) return;
    this.settings = value;
    if (!value.music) this.music?.pause();
    else if (!this.musicPaused && this.music?.isPaused) this.music.resume();
    if (this.music && 'setVolume' in this.music)
      (this.music as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).setVolume(value.musicVolume);
  }
  private onBlur(): void { this.music?.pause(); }
  private onFocus(): void {
    if (!this.musicPaused && this.settings.music && this.music?.isPaused) this.music.resume();
  }
  setMusicPaused(paused: boolean): void {
    this.musicPaused = paused;
    if (paused) this.music?.pause();
    else this.onFocus();
  }
  unlock(): void {
    if (this.scene.sound.locked) void this.scene.sound.unlock();
  }
  play(key: string): void {
    this.unlock();
    if (this.settings.sound && this.scene.cache.audio.exists(key))
      this.scene.sound.play(key, { volume: this.settings.soundVolume });
  }
  playMusic(key: string): void {
    if (this.music?.key === key || !this.scene.cache.audio.exists(key))
      return;
    this.music?.stop();
    this.music = this.scene.sound.add(key, { loop: true, volume: this.settings.musicVolume });
    this.music.play();
    if (!this.settings.music) this.music.pause();
  }
  toggleSound(): AudioSettings {
    this.settings.sound = !this.settings.sound;
    this.save();
    return this.settings;
  }
  private save(): void {
    try {
      localStorage.setItem(REGISTRY.AUDIO, JSON.stringify(this.settings));
    } catch {
      /* localStorage 不可用时继续游戏 */
    }
    this.scene.registry.set(REGISTRY.AUDIO, this.settings);
  }
}
