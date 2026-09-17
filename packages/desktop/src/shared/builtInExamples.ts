import type { ProjectRecord } from './types.js';

export const FIRE_MOUNTAIN_BUILT_IN_EXAMPLE = Object.freeze({
  id: 'fire-mountain-escape',
  starterTemplateId: 'fire-mountain-escape',
  name: '火山逃生',
  folderName: '火山逃生',
  label: '正式内置示例',
  description: '三关原创火山横版游戏，包含二段跳、移动平台和岩浆巨兽追逐。',
  prompt:
    '打开“火山逃生”正式内置示例：保留三关固定流程、原创北极熊主角、岩浆史莱姆、火山蜜蜂、晶石、检查点、二段跳、移动平台和第三关岩浆巨兽追逐。',
});

export const ZERO_FACTORY_BUILT_IN_EXAMPLE = Object.freeze({
  id: 'zero-factory-escape',
  starterTemplateId: 'zero-factory-escape',
  name: '零号工厂逃生',
  folderName: '零号工厂逃生',
  label: '正式内置示例',
  description: '三关机械工厂横版游戏，通过门卡、开关和激光门寻找出口。',
  prompt:
    '打开“零号工厂逃生”正式内置示例：保留三关固定流程、门卡开门、双开关机关、激光障碍、移动机械平台和巡逻机器人。',
});

export const BUILT_IN_PLATFORMER_EXAMPLES = [
  FIRE_MOUNTAIN_BUILT_IN_EXAMPLE,
  ZERO_FACTORY_BUILT_IN_EXAMPLE,
] as const;

export type BuiltInExampleId =
  (typeof BUILT_IN_PLATFORMER_EXAMPLES)[number]['id'];

export function getBuiltInExample(id: BuiltInExampleId) {
  return BUILT_IN_PLATFORMER_EXAMPLES.find((example) => example.id === id)!;
}

export function findBuiltInExampleProject(
  id: BuiltInExampleId,
  projects: ProjectRecord[],
  workspace: string,
): ProjectRecord | undefined {
  const example = getBuiltInExample(id);
  const normalizePath = (value: string) =>
    value.normalize('NFC').replace(/\\/g, '/').replace(/\/+$/g, '');
  const expectedPath = `${normalizePath(workspace)}/${example.folderName}`;
  return projects.find(
    (project) => normalizePath(project.path) === expectedPath,
  );
}

export function findFireMountainExampleProject(
  projects: ProjectRecord[],
  workspace: string,
): ProjectRecord | undefined {
  return findBuiltInExampleProject(
    FIRE_MOUNTAIN_BUILT_IN_EXAMPLE.id,
    projects,
    workspace,
  );
}

export function findZeroFactoryExampleProject(
  projects: ProjectRecord[],
  workspace: string,
): ProjectRecord | undefined {
  return findBuiltInExampleProject(
    ZERO_FACTORY_BUILT_IN_EXAMPLE.id,
    projects,
    workspace,
  );
}
