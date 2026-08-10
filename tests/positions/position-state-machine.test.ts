import { describe, it, expect } from 'vitest';
import { PositionStateMachine } from '../../src/execution/position-state-machine.ts';

describe('PositionStateMachine Unit Tests', () => {
  it('debe iniciar en estado IDLE', () => {
    const sm = new PositionStateMachine();
    expect(sm.getState()).toBe('IDLE');
  });

  it('debe permitir transiciones válidas IDLE -> OPENING -> OPEN -> CLOSING -> CLOSED', () => {
    const sm = new PositionStateMachine();
    
    expect(sm.canTransitionTo('OPENING')).toBe(true);
    sm.transitionTo('OPENING');
    expect(sm.getState()).toBe('OPENING');

    expect(sm.canTransitionTo('OPEN')).toBe(true);
    sm.transitionTo('OPEN');
    expect(sm.getState()).toBe('OPEN');

    expect(sm.canTransitionTo('CLOSING')).toBe(true);
    sm.transitionTo('CLOSING');
    expect(sm.getState()).toBe('CLOSING');

    expect(sm.canTransitionTo('CLOSED')).toBe(true);
    sm.transitionTo('CLOSED');
    expect(sm.getState()).toBe('CLOSED');
  });

  it('debe rechazar transiciones inválidas (ej. IDLE -> CLOSED)', () => {
    const sm = new PositionStateMachine();
    expect(sm.canTransitionTo('CLOSED')).toBe(false);
    expect(() => sm.transitionTo('CLOSED')).toThrow('Transición de estado inválida');
  });
});
