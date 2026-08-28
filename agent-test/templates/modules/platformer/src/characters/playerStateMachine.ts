export abstract class PlayerStateMachine<State extends string> {
  private currentState?: State;

  goto(nextState: State): void {
    if (nextState === this.currentState) return;
    this.invokeStateHandler('exit', this.currentState);
    this.currentState = nextState;
    this.invokeStateHandler('enter', nextState);
  }

  update(_time: number, _delta: number): void {
    this.invokeStateHandler('update', this.currentState);
  }

  private invokeStateHandler(
    phase: 'enter' | 'update' | 'exit',
    state?: State,
  ): void {
    if (!state) return;
    const handler = (this as unknown as Record<string, unknown>)[
      `${phase}_${state}`
    ];
    if (typeof handler === 'function') handler.call(this);
  }
}
