import { COOP_KEYS, COOP_PAUSE_KEY } from '../config/coopControls';
import { emptyCommand, type PlayerCommand, type PlayerId } from '../types/commands';

const codes = new Set<string>([COOP_PAUSE_KEY, ...Object.values(COOP_KEYS).flatMap(Object.values)]);
export function editableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
}
export class CoopKeyboard {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private blocked = new Set<string>();
  private disposed = false;
  constructor(
    private host: Window,
    private ownsFocus: () => boolean,
    private acceptsCommands: () => boolean,
    private pause: () => void,
    private loseFocus: () => void,
  ) {
    host.addEventListener('keydown', this.onDown);
    host.addEventListener('keyup', this.onUp);
    host.addEventListener('blur', this.onBlur);
    host.addEventListener('focusin', this.onFocus);
    host.document.addEventListener('visibilitychange', this.onVisibility);
  }
  private onDown = (event: KeyboardEvent): void => {
    if (!codes.has(event.code) || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    if (!this.ownsFocus() || editableTarget(event.target)) return;
    if (event.code !== COOP_PAUSE_KEY && !this.acceptsCommands()) return;
    event.preventDefault();
    if (event.repeat || this.held.has(event.code)) return;
    // A fresh physical press also recovers a key whose keyup happened outside
    // the window. Held-key repeats after pause remain ignored above.
    this.blocked.delete(event.code);
    this.held.add(event.code);
    if (event.code === COOP_PAUSE_KEY) { this.pause(); return; }
    this.pressed.add(event.code);
  };
  private onUp = (event: KeyboardEvent): void => {
    if (this.held.delete(event.code)) this.released.add(event.code);
    this.blocked.delete(event.code);
  };
  private onBlur = (): void => { this.reset(); this.loseFocus(); };
  private onFocus = (): void => { if (!this.ownsFocus()) this.onBlur(); };
  private onVisibility = (): void => { if (this.host.document.hidden) this.onBlur(); };
  read(id: PlayerId): PlayerCommand {
    const keys = COOP_KEYS[id], command = emptyCommand();
    command.moveX = Number(this.held.has(keys.right)) - Number(this.held.has(keys.left));
    for (const action of ['jump', 'interact', 'skill'] as const) {
      command[`${action}Held`] = this.held.has(keys[action]);
      command[`${action}Pressed`] = this.pressed.delete(keys[action]);
      command[`${action}Released`] = this.released.delete(keys[action]);
    }
    return command;
  }
  reset(id?: PlayerId): void {
    for (const code of id ? Object.values(COOP_KEYS[id]) : codes) {
      if (this.held.has(code)) this.blocked.add(code);
      this.held.delete(code); this.pressed.delete(code); this.released.delete(code);
    }
  }
  get allReleased(): boolean { return this.held.size === 0 && this.blocked.size === 0; }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.reset();
    this.host.removeEventListener('keydown', this.onDown);
    this.host.removeEventListener('keyup', this.onUp);
    this.host.removeEventListener('blur', this.onBlur);
    this.host.removeEventListener('focusin', this.onFocus);
    this.host.document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
