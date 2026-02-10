export interface StateMachine<T extends string> {
  states: readonly T[];
  transitions: Record<T, T[]>;
  initial: T;
}

export class StateMachineError extends Error {
  constructor(
    public from: string,
    public to: string,
    message: string
  ) {
    super(message);
    this.name = 'StateMachineError';
  }
}

export function transition<T extends string>(
  sm: StateMachine<T>,
  from: T,
  to: T
): { from: T; to: T; timestamp: string } {
  if (!sm.states.includes(from)) {
    throw new StateMachineError(from, to, `Invalid source state: ${from}`);
  }
  if (!sm.states.includes(to)) {
    throw new StateMachineError(from, to, `Invalid target state: ${to}`);
  }

  const allowedNextStates = sm.transitions[from] || [];
  if (!allowedNextStates.includes(to)) {
    throw new StateMachineError(
      from,
      to,
      `Invalid transition from ${from} to ${to}`
    );
  }

  return {
    from,
    to,
    timestamp: new Date().toISOString(),
  };
}
