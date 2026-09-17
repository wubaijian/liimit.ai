import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AgentEvent,
  ApplyAudioPreviewInput,
  AppSettings,
  AudioPreviewProgress,
  CreateProjectInput,
  DependencyActionInput,
  DependencyOutput,
  GameAgentAPI,
  ImportSkillInput,
  GenerateAudioPreviewInput,
  InstallGitHubSkillInput,
  RestoreProjectAudioInput,
  McpServerDefinition,
  ProjectRecord,
  ProviderConnectionInput,
  StartAgentInput,
} from '../shared/types.js';
import type { LevelDocument } from '../shared/levelDocument.js';
import type { PlayerAbilities } from '../shared/levelCampaign.js';
import type { GameInfo } from '../shared/gameInfo.js';

const api: GameAgentAPI = {
  removeProject: (input) => ipcRenderer.invoke('project:remove', input),
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  chooseDirectory: () => ipcRenderer.invoke('dialog:choose-directory'),
  createProject: (input: CreateProjectInput) =>
    ipcRenderer.invoke('project:create', input),
  retryStarterPreparation: (projectId: string) =>
    ipcRenderer.invoke('project:retry-starter-preparation', projectId),
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke('settings:save', settings),
  testProviderConnection: (input: ProviderConnectionInput) =>
    ipcRenderer.invoke('settings:test-provider', input),
  generateAudioPreview: (input: GenerateAudioPreviewInput) =>
    ipcRenderer.invoke('settings:generate-audio-preview', input),
  cancelAudioPreviewGeneration: () =>
    ipcRenderer.invoke('settings:cancel-audio-preview'),
  onAudioPreviewProgress: (
    callback: (progress: AudioPreviewProgress) => void,
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      progress: AudioPreviewProgress,
    ) => callback(progress);
    ipcRenderer.on('settings:audio-preview-progress', listener);
    return () =>
      ipcRenderer.removeListener('settings:audio-preview-progress', listener);
  },
  applyAudioPreview: (input: ApplyAudioPreviewInput) =>
    ipcRenderer.invoke('project:apply-audio-preview', input),
  loadProjectAudioOverrides: (projectId: string) =>
    ipcRenderer.invoke('project:audio-overrides', projectId),
  restoreProjectAudio: (input: RestoreProjectAudioInput) =>
    ipcRenderer.invoke('project:restore-audio', input),
  loadApiUsage: () => ipcRenderer.invoke('settings:api-usage'),
  loadApiCosts: (projectId) => ipcRenderer.invoke('settings:api-costs', projectId),
  saveApiCostSettings: (settings) => ipcRenderer.invoke('settings:save-api-costs', settings),
  inspectDependencies: () =>
    ipcRenderer.invoke('settings:inspect-dependencies'),
  runDependencyAction: (input: DependencyActionInput) =>
    ipcRenderer.invoke('settings:run-dependency-action', input),
  startAgent: (input: StartAgentInput) =>
    ipcRenderer.invoke('agent:start', input),
  decideProposal: (
    input: import('../shared/modificationProposal.js').ProposalDecisionInput,
  ) => ipcRenderer.invoke('agent:proposal-decision', input),
  stopAgent: (projectId: string) => ipcRenderer.invoke('agent:stop', projectId),
  loadAgentHistory: (projectId: string) =>
    ipcRenderer.invoke('agent:history', projectId),
  listFiles: (projectId: string) =>
    ipcRenderer.invoke('project:list-files', projectId),
  readFile: (projectId: string, filePath: string) =>
    ipcRenderer.invoke('project:read-file', projectId, filePath),
  loadLevel: (projectId: string) =>
    ipcRenderer.invoke('project:read-level', projectId),
  saveLevel: (projectId: string, level: LevelDocument) =>
    ipcRenderer.invoke('project:save-level', projectId, level),
  loadLevelCampaign: (projectId: string) =>
    ipcRenderer.invoke('project:read-level-campaign', projectId),
  saveCampaignLevel: (
    projectId: string,
    levelId: string,
    level: LevelDocument,
  ) =>
    ipcRenderer.invoke(
      'project:save-campaign-level',
      projectId,
      levelId,
      level,
    ),
  addLevel: (projectId: string, sourceLevelId?: string) =>
    ipcRenderer.invoke('project:add-level', projectId, sourceLevelId),
  saveLevelAbilities: (
    projectId: string,
    levelId: string,
    abilities: PlayerAbilities,
  ) =>
    ipcRenderer.invoke(
      'project:save-level-abilities',
      projectId,
      levelId,
      abilities,
    ),
  loadGameInfo: (projectId: string) =>
    ipcRenderer.invoke('project:read-game-info', projectId),
  saveGameInfo: (projectId: string, gameInfo: GameInfo) =>
    ipcRenderer.invoke('project:save-game-info', projectId, gameInfo),
  startPreview: (projectId: string) =>
    ipcRenderer.invoke('project:start-preview', projectId),
  revealProject: (projectId: string) =>
    ipcRenderer.invoke('project:reveal', projectId),
  loadExtensions: (projectId?: string) =>
    ipcRenderer.invoke('extensions:load', projectId),
  saveMcpServers: (servers: McpServerDefinition[]) =>
    ipcRenderer.invoke('extensions:save-mcp', servers),
  importSkill: (input: ImportSkillInput) =>
    ipcRenderer.invoke('extensions:import-skill', input),
  installGitHubSkill: (input: InstallGitHubSkillInput) =>
    ipcRenderer.invoke('extensions:install-github-skill', input),
  removeSkill: (projectId: string | undefined, skillId: string) =>
    ipcRenderer.invoke('extensions:remove-skill', projectId, skillId),
  revealSkill: (projectId: string | undefined, skillId: string) =>
    ipcRenderer.invoke('extensions:reveal-skill', projectId, skillId),
  revealSkillDirectory: (level, projectId?: string) =>
    ipcRenderer.invoke('extensions:reveal-skill-directory', level, projectId),
  openGitHubUrl: (url: string) =>
    ipcRenderer.invoke('extensions:open-github-url', url),
  onAgentEvent: (callback: (event: AgentEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentEvent) =>
      callback(payload);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
  onProjectUpdated: (callback: (project: ProjectRecord) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: ProjectRecord,
    ) => callback(payload);
    ipcRenderer.on('project:updated', listener);
    return () => ipcRenderer.removeListener('project:updated', listener);
  },
  onDependencyOutput: (callback: (output: DependencyOutput) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: DependencyOutput,
    ) => callback(payload);
    ipcRenderer.on('settings:dependency-output', listener);
    return () =>
      ipcRenderer.removeListener('settings:dependency-output', listener);
  },
};

contextBridge.exposeInMainWorld('gameAgent', api);
