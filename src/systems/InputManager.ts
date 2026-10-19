import Phaser from 'phaser';
export type Control = 'left' | 'right' | 'jump' | 'attack' | 'shield';
export class InputManager {
  private readonly held: Record<Control, boolean> = {
    left: false,
    right: false,
    jump: false,
    attack: false,
    shield: false,
  };
  private readonly keyboard: Record<Control, Phaser.Input.Keyboard.Key[]>;
  private jumpPressed = false;
  private attackPressed = false;
  private shieldPressed = false;
  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    const keys = (...names: string[]): Phaser.Input.Keyboard.Key[] => keyboard ? names.map((name) => keyboard.addKey(name)) : [];
    this.keyboard = {
      left: keys('A', 'LEFT'),
      right: keys('D', 'RIGHT'),
      jump: keys('W', 'SPACE', 'UP'),
      attack: keys('J'),
      shield: keys('K'),
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
    this.shieldPressed = false;
  }
  update(): void {
    if (this.keyboard.jump.some((key) => Phaser.Input.Keyboard.JustDown(key)))
      this.jumpPressed = true;
    if (this.keyboard.attack.some((key) => Phaser.Input.Keyboard.JustDown(key)))
      this.attackPressed = true;
    if (this.keyboard.shield.some((key) => Phaser.Input.Keyboard.JustDown(key)))
      this.shieldPressed = true;
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
  consumeShield(): boolean {
    const pressed = this.shieldPressed;
    this.shieldPressed = false;
    return pressed;
  }
  private setVirtual(control: Control, down: boolean): void {
    const pressed = down && !this.held[control];
    this.held[control] = down;
    if (pressed && control === 'jump') this.jumpPressed = true;
    if (pressed && control === 'attack') this.attackPressed = true;
    if (pressed && control === 'shield') this.shieldPressed = true;
  }
  private destroy(): void {
    this.scene.game.events.off('virtual-control', this.setVirtual, this);
    this.scene.game.events.off('blur', this.reset, this);
  }
}
