import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { mountProgressNotice } from './systems/ProgressNotice';
import { mountReleaseSupport } from './systems/ReleaseSupport';
import type { HudState } from './types/game';
import { REGISTRY, SCENE } from './config/constants';
import './style.css';
const disposeNotice = mountProgressNotice();
const game = new Phaser.Game(gameConfig);
let keyboardEnabled = true;
const disposeSupport = mountReleaseSupport(__BUILD_INFO__, () => game.scene.isActive(SCENE.GAME)
  ? (game.registry.get('hud') as HudState | undefined) ?? {}
  : { character: game.registry.get(REGISTRY.CHARACTER) }, () => {
  game.events.emit('blur');
  if (game.input.keyboard) { keyboardEnabled = game.input.keyboard.enabled; game.input.keyboard.enabled = false; }
}, () => {
  if (game.input.keyboard) game.input.keyboard.enabled = keyboardEnabled;
});
import.meta.hot?.dispose(() => { disposeNotice(); disposeSupport(); game.destroy(true); });
