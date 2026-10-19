import Phaser from 'phaser';
export type Control = 'left' | 'right' | 'jump' | 'attack';
export class InputManager {
  private readonly held: Record<Control, boolean> = {
    left: false,
    right: false,
    jump: false,
    attack: false,
  };
  private readonly keyboard: Record<Control, Phaser.Input.Keyboard.Key[]>;
  private jumpPressed = false;
  private attackPressed = false;
  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    const keys = (...names: string[]): Phaser.Input.Keyboard.Key[] => keyboard ? names.map((name) => keyboard.addKey(name)) : [];
    this.keyboard = {
      left: keys('A', 'LEFT'),
      right: keys('D', 'RIGHT'),
      jump: keys('W', 'SPACE', 'UP'),
      attack: keys('J'),
    };
    scene.game.events.on('virtual-control', this.setVirtual, this);
    scene.game.events.on('blur', this.reset, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }
  reset(): void {
    for (const control of Object.keys(this.held) as Control[]) {
      this.held[control] = false;
      this.keyboard[control].forEach((key) => key.reset());
    }
    this.jumpPressed = false;
    this.attackPressed = false;
  }
  update(): void {
    if (this.keyboard.jump.some((key) => Phaser.Input.Keyboard.JustDown(key)))
      this.jumpPressed = true;
    if (this.keyboard.attack.some((key) => Phaser.Input.Keyboard.JustDown(key)))
      this.attackPressed = true;
  }
  down(control: 'left' | 'right' | 'jump'): boolean {
    return this.held[control] || this.keyboard[control].some((key) => key.isDown);
  }
  consumeJump(): boolean {
    const pressed = this.jumpPressed;
    this.jumpPressed = false;
    return pressed;
  }
  consumeAttack(): boolean {
    const pressed = this.attackPressed;
    this.attackPressed = false;
    return pressed;
  }
  private setVirtual(control: Control, down: boolean): void {
    this.held[control] = down;
    if (down && control === 'jump') this.jumpPressed = true;
    if (down && control === 'attack') this.attackPressed = true;
  }
  private destroy(): void {
    this.scene.game.events.off('virtual-control', this.setVirtual, this);
    this.scene.game.events.off('blur', this.reset, this);
  }
}
