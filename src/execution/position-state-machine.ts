/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PositionState =
  | 'IDLE'
  | 'OPENING'
  | 'OPEN'
  | 'CLOSING'
  | 'CLOSED'
  | 'OPENING_FAILED'
  | 'CLOSING_FAILED'
  | 'RECONCILIATION_REQUIRED';

export class PositionStateMachine {
  private currentState: PositionState = 'IDLE';
  private readonly allowedTransitions: Record<PositionState, PositionState[]> = {
    IDLE: ['OPENING'],
    OPENING: ['OPEN', 'OPENING_FAILED'],
    OPEN: ['CLOSING', 'RECONCILIATION_REQUIRED'],
    CLOSING: ['CLOSED', 'CLOSING_FAILED'],
    CLOSED: ['IDLE', 'OPENING'],
    OPENING_FAILED: ['IDLE', 'RECONCILIATION_REQUIRED'],
    CLOSING_FAILED: ['OPEN', 'RECONCILIATION_REQUIRED'],
    RECONCILIATION_REQUIRED: ['IDLE', 'CLOSED', 'OPEN']
  };

  constructor(initialState: PositionState = 'IDLE') {
    this.currentState = initialState;
  }

  public getState(): PositionState {
    return this.currentState;
  }

  public canTransitionTo(nextState: PositionState): boolean {
    const validNextStates = this.allowedTransitions[this.currentState] || [];
    return validNextStates.includes(nextState);
  }

  public transitionTo(nextState: PositionState, reason?: string): void {
    if (!this.canTransitionTo(nextState)) {
      throw new Error(
        `[PositionStateMachine] Transición de estado inválida: '${this.currentState}' -> '${nextState}'. Razón: ${reason || 'N/A'}`
      );
    }
    console.log(`[PositionStateMachine] Transición de estado: ${this.currentState} -> ${nextState} (${reason || 'Normal'})`);
    this.currentState = nextState;
  }
}
