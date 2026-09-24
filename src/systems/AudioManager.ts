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
    return {
      ...DEFAULT_AUDIO_SETTINGS,
      ...JSON.parse(localStorage.getItem(REGISTRY.AUDIO) ?? '{}'),
    } as AudioSettings;
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
  constructor(private readonly scene: Phaser.Scene) {
    this.settings = loadAudioSettings();
    scene.registry.set(REGISTRY.AUDIO, this.settings);
    scene.game.events.once('blur', () => this.music?.pause());
    scene.game.events.on('focus', () => {
      if (this.settings.music && this.music?.isPaused) this.music.resume();
    });
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
    if (!this.settings.music || this.music?.key === key || !this.scene.cache.audio.exists(key))
      return;
    this.music?.stop();
    this.music = this.scene.sound.add(key, { loop: true, volume: this.settings.musicVolume });
    this.music.play();
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
