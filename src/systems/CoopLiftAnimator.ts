import type { Player } from '../entities/Player';
import type { PlayerId } from '../types/commands';
import type { CooperationState, PlayerCooperationController } from './PlayerCooperationController';

const animationFor: Partial<Record<CooperationState, string>> = {
  LIFT_READY: 'lift-ready',
  CARRYING: 'lift-carrying',
  RIDING: 'lift-riding',
  BOOST_JUMP: 'lift-boost-jump',
  LIFT_CANCEL: 'lift-cancel',
};

/** Presentation-only mapping from semantic cooperation states to animation keys. */
export class CoopLiftAnimator {
  private readonly ids: PlayerId[];
  constructor(
    private readonly players: Record<PlayerId, Player>,
    private readonly cooperation: PlayerCooperationController,
  ) {
    this.ids = Object.keys(players) as PlayerId[];
  }

  update(): void {
    for (const id of this.ids)
      this.players[id].setActionAnimation(animationFor[this.cooperation.stateOf(id)] ?? null);
  }

  reset(): void {
    for (const id of this.ids) this.players[id].clearActionAnimation();
  }
}
