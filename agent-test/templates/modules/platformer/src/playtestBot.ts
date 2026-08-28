export interface PlaytestBotObject {
  type:
    | 'player-spawn'
    | 'platform'
    | 'moving-platform'
    | 'spike'
    | 'slime'
    | 'bee'
    | 'coin'
    | 'checkpoint'
    | 'goal'
    | 'pit';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlaytestBotInput {
  playerX: number;
  feetY: number;
  goalX: number;
  onGround: boolean;
  now: number;
  lastJumpAt: number;
  objects: readonly PlaytestBotObject[];
}

export interface PlaytestBotDecision {
  direction: -1 | 1;
  action: 'move-left' | 'move-right' | 'jump';
  jump: boolean;
}

export function decideBasicPlaytestAction(
  input: PlaytestBotInput,
): PlaytestBotDecision {
  const direction = input.goalX < input.playerX ? -1 : 1;
  const moveAction = direction < 0 ? 'move-left' : 'move-right';
  if (!input.onGround || input.now - input.lastJumpAt < 450) {
    return { direction, action: moveAction, jump: false };
  }

  const obstacleAhead = input.objects.some((object) => {
    if (
      object.type !== 'spike' &&
      object.type !== 'slime' &&
      object.type !== 'bee' &&
      object.type !== 'platform' &&
      object.type !== 'moving-platform' &&
      object.type !== 'goal' &&
      object.type !== 'pit'
    ) {
      return false;
    }
    const leadingX = direction > 0 ? object.x : object.x + object.width;
    const distance = (leadingX - input.playerX) * direction;
    if (distance < 12 || distance > 150) return false;
    if (
      object.type === 'spike' ||
      object.type === 'slime' ||
      object.type === 'bee'
    ) {
      return (
        object.y < input.feetY + 16 &&
        object.y + object.height > input.feetY - 96
      );
    }
    if (object.type === 'goal') {
      return object.y + object.height < input.feetY - 48;
    }
    if (object.type === 'pit') {
      return object.y >= input.feetY - 24;
    }
    return object.y < input.feetY - 8 && input.feetY - object.y <= 190;
  });
  if (obstacleAhead) return { direction, action: 'jump', jump: true };

  const support = input.objects.find(
    (object) =>
      (object.type === 'platform' || object.type === 'moving-platform') &&
      input.playerX >= object.x - 4 &&
      input.playerX <= object.x + object.width + 4 &&
      Math.abs(object.y - input.feetY) <= 20,
  );
  if (!support) return { direction, action: moveAction, jump: false };
  const edgeDistance =
    direction > 0
      ? support.x + support.width - input.playerX
      : input.playerX - support.x;
  const jump = edgeDistance >= 0 && edgeDistance <= 100;
  return { direction, action: jump ? 'jump' : moveAction, jump };
}
