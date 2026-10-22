export type PlayerId = 'p1' | 'p2';
export interface MovementCommand {
  moveX: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
}
export interface PlayerCommand extends MovementCommand {
  jumpReleased: boolean;
  interactPressed: boolean;
  interactHeld: boolean;
  interactReleased: boolean;
  skillPressed: boolean;
  skillHeld: boolean;
  skillReleased: boolean;
}
export const emptyCommand = (): PlayerCommand => ({
  moveX: 0, jumpPressed: false, jumpHeld: false, jumpReleased: false,
  interactPressed: false, interactHeld: false, interactReleased: false,
  skillPressed: false, skillHeld: false, skillReleased: false,
});
