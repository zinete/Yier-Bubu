import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { mountProgressNotice } from './systems/ProgressNotice';
import { mountReleaseSupport } from './systems/ReleaseSupport';
import { mountEffectPanel } from './systems/EffectPanel';
import type { HudState } from './types/game';
import { REGISTRY, SCENE } from './config/constants';
export function bootGame(): () => void {
  const disposeNotice = mountProgressNotice();
  const game = new Phaser.Game(gameConfig);
  let keyboardEnabled = true;
  const pauseForPanel = () => {
    game.events.emit('blur');
    if (game.input.keyboard) { keyboardEnabled = game.input.keyboard.enabled; game.input.keyboard.enabled = false; }
  };
  const closePanel = () => { if (game.input.keyboard) game.input.keyboard.enabled = keyboardEnabled; };
  const disposeSupport = mountReleaseSupport(__BUILD_INFO__, () => game.scene.isActive(SCENE.GAME)
    ? (game.registry.get('hud') as HudState | undefined) ?? {}
    : { character: game.registry.get(REGISTRY.CHARACTER) }, pauseForPanel, closePanel);
  const disposeEffects = mountEffectPanel(pauseForPanel, closePanel);
  return () => { disposeNotice(); disposeSupport(); disposeEffects(); game.destroy(true); };
}
