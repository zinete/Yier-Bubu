import { COOP_HELP } from '../config/coopControls';
import type { AudioSettings } from './AudioManager';
import './coop.css';
export type CoopPhase = 'ready' | 'playing' | 'paused' | 'won';
export interface CoopOverlayState { phase: CoopPhase; ready: boolean[]; status: string; hint: string; players: string[] }
const text = (node: HTMLElement, value: string): void => { if (node.textContent !== value) node.textContent = value; };
export class CoopOverlay {
  readonly root = document.createElement('section');
  private panel = document.createElement('div');
  private title = document.createElement('h1');
  private cards = document.createElement('div');
  private readyLabels: HTMLElement[] = [];
  private status = document.createElement('p');
  private hint = document.createElement('p');
  private playerStatus = document.createElement('div');
  private buttons = document.createElement('nav');
  private resume: HTMLButtonElement;
  private replay: HTMLButtonElement;
  private settings = document.createElement('fieldset');
  private settingsButtons: HTMLButtonElement[] = [];
  private previous?: CoopPhase;
  constructor(parent: HTMLElement, images: string[], actions: { pause: () => void; restart: () => void; home: () => void;
    getAudio: () => AudioSettings; setAudio: (settings: AudioSettings) => void; effects: () => void; feedback: () => void }) {
    this.root.className = 'coop-overlay'; this.root.tabIndex = -1;
    this.panel.className = 'coop-panel';
    this.cards.className = 'coop-cards';
    this.status.setAttribute('aria-live', 'polite');
    this.status.className = 'coop-status'; this.hint.className = 'coop-hint';
    this.playerStatus.className = 'coop-player-status';
    for (const [index, id] of (['p1', 'p2'] as const).entries()) {
      const card = document.createElement('article'), avatar = document.createElement('img');
      avatar.src = images[index]; avatar.alt = index ? '布布' : '一二';
      const heading = document.createElement('h2'); heading.textContent = `${index ? 'P2 · 布布' : 'P1 · 一二'}`;
      const help = document.createElement('p'); help.textContent = COOP_HELP[id];
      const ready = document.createElement('strong'); this.readyLabels.push(ready);
      card.append(avatar, heading, help, ready); this.cards.append(card);
    }
    const button = (label: string, action: () => void): HTMLButtonElement => {
      const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
      node.addEventListener('click', action); this.buttons.append(node); return node;
    };
    this.resume = button('暂停 · Esc', actions.pause);
    this.replay = button('重新挑战', actions.restart);
    button('返回菜单', actions.home);
    this.settingsButtons = [button('画面与特效', actions.effects), button('试玩反馈', actions.feedback)];
    this.settings.className = 'coop-audio'; this.settings.hidden = true;
    const legend = document.createElement('legend'); legend.textContent = '声音设置'; this.settings.append(legend);
    for (const [key, labelText, volume] of [['sound', '音效', 'soundVolume'], ['music', '音乐', 'musicVolume']] as const) {
      const row = document.createElement('div'), label = document.createElement('label'), toggle = document.createElement('input'), range = document.createElement('input');
      row.className = 'coop-audio-row';
      toggle.type = 'checkbox'; toggle.dataset.audio = key;
      range.type = 'range'; range.min = '0'; range.max = '1'; range.step = '.05'; range.dataset.audio = volume; range.setAttribute('aria-label', `${labelText}音量`);
      toggle.addEventListener('change', () => actions.setAudio({ ...actions.getAudio(), [key]: toggle.checked }));
      range.addEventListener('input', () => actions.setAudio({ ...actions.getAudio(), [volume]: Number(range.value) }));
      label.append(toggle, document.createTextNode(labelText)); row.append(label, range); this.settings.append(row);
    }
    this.refreshAudio = () => {
      const audio = actions.getAudio();
      this.settings.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
        const value = audio[input.dataset.audio as keyof AudioSettings];
        if (input.type === 'checkbox') input.checked = Boolean(value); else input.value = String(value);
      });
    };
    this.panel.append(this.title, this.cards, this.playerStatus, this.status, this.hint, this.settings, this.buttons);
    this.root.append(this.panel); parent.append(this.root); this.root.focus({ preventScroll: true });
  }
  private refreshAudio: () => void;
  render(state: CoopOverlayState): void {
    this.root.dataset.phase = state.phase;
    text(this.title, state.phase === 'ready' ? '同机双人 · 一起出发' : state.phase === 'won' ? '两只熊，一起到家！' : state.phase === 'paused' ? '冒险暂停了' : '同行小径 · 双人教学');
    this.cards.hidden = state.phase !== 'ready';
    this.playerStatus.hidden = state.phase === 'ready';
    this.readyLabels.forEach((label, i) => text(label, state.ready[i] ? '已准备 ✓' : i ? '按 Enter 准备' : '按 E 准备'));
    text(this.playerStatus, state.players.join('　｜　'));
    text(this.status, state.status); text(this.hint, state.hint);
    this.resume.hidden = state.phase === 'ready' || state.phase === 'won';
    text(this.resume, state.phase === 'paused' ? '继续冒险 · Esc' : '暂停 · Esc');
    this.replay.hidden = state.phase === 'ready' || state.phase === 'playing';
    this.settings.hidden = state.phase !== 'paused';
    this.settingsButtons.forEach((button) => { button.hidden = state.phase === 'playing'; });
    if (this.previous !== state.phase) {
      this.previous = state.phase;
      if (state.phase === 'paused') this.refreshAudio();
      // Clear focused buttons when returning to play, so Enter belongs to P2.
      if (state.phase === 'playing') this.root.focus({ preventScroll: true });
    }
  }
  destroy(): void { this.root.remove(); }
}
