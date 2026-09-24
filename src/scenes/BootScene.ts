import Phaser from 'phaser';
import { REGISTRY, SCENE } from '../config/constants';
import { loadAudioSettings } from '../systems/AudioManager';
import type { CharacterId } from '../types/game';
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.BOOT);
  }
  create(): void {
    // The story opens with Yier selected, matching the start-screen reference.
    const character: CharacterId = 'yier';
    this.registry.set(REGISTRY.CHARACTER, character);
    this.registry.set(REGISTRY.AUDIO, loadAudioSettings());
    this.scene.start(SCENE.PRELOAD);
  }
}
