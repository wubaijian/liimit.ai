import { describe, expect, it, vi } from 'vitest';
import { PlayerStateMachine } from '../characters/playerStateMachine';

class TestStateMachine extends PlayerStateMachine<'idle' | 'moving'> {
  readonly enterIdle = vi.fn();
  readonly updateIdle = vi.fn();
  readonly exitIdle = vi.fn();
  readonly enterMoving = vi.fn();

  enter_idle(): void {
    this.enterIdle();
  }

  update_idle(): void {
    this.updateIdle();
  }

  exit_idle(): void {
    this.exitIdle();
  }

  enter_moving(): void {
    this.enterMoving();
  }
}

describe('角色状态切换器', () => {
  it('进入状态后调用对应的进入动作', () => {
    const machine = new TestStateMachine();

    machine.goto('idle');

    expect(machine.enterIdle).toHaveBeenCalledOnce();
  });

  it('每次更新时只调用当前状态的更新动作', () => {
    const machine = new TestStateMachine();
    machine.goto('idle');

    machine.update(100, 16);

    expect(machine.updateIdle).toHaveBeenCalledOnce();
  });

  it('切换状态时先退出旧状态再进入新状态', () => {
    const machine = new TestStateMachine();
    machine.goto('idle');

    machine.goto('moving');

    expect(machine.exitIdle).toHaveBeenCalledOnce();
    expect(machine.enterMoving).toHaveBeenCalledOnce();
    expect(machine.exitIdle.mock.invocationCallOrder[0]).toBeLessThan(
      machine.enterMoving.mock.invocationCallOrder[0],
    );
  });
});
