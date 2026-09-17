/**
 * Asset Model Router
 *
 * Routes image / video / audio asset-generation calls to the appropriate
 * provider implementation. Each modality is configured INDEPENDENTLY via
 * `resolveProviderConfig`, so users can freely mix providers (e.g.
 * Tongyi for image, Doubao for video, OpenAI-compat for audio).
 *
 * The router used to read a single `IMAGE_MODEL_API_KEY` and apply it to
 * every modality; that's been replaced with explicit per-modality
 * resolution.  See `providerConfig.ts` for the env-var matrix and the
 * settings.json schema.
 */

import { createImageService, type IImageService } from './assetImageService.js';
import {
  createVideoService,
  type IVideoService,
  FrameExtractionService,
} from './assetVideoService.js';
import {
  createAudioService,
  type IAudioService,
  type DirectAudioResult,
  AudioRenderService,
} from './assetAudioService.js';
import type {
  ImageModelConfig,
  VideoModelConfig,
  AudioModelConfig,
  AudioRequest,
} from '../tools/generate-assets-types.js';
import {
  resolveProviderConfig,
  type OpenGameProvidersSettings,
  type ProviderName,
  type ResolvedProviderConfig,
} from './providerConfig.js';

// ============== Per-provider model defaults ==============
//
// These are only used as the *editing* / *secondary* model name for
// providers that need a separate model id for image-edit vs. image-gen.
// The PRIMARY model name comes from `resolveProviderConfig` so users can
// override it via env or settings.

const IMAGE_EDIT_DEFAULTS: Partial<Record<ProviderName, string | undefined>> = {
  tongyi: 'wanx2.1-imageedit',
  doubao: 'doubao-seedream-4-0-250828',
  'openai-compat': undefined, // falls back to the same gen model
};

const VIDEO_T2V_DEFAULTS: Partial<Record<ProviderName, string | undefined>> = {
  tongyi: 'wan2.5-t2v-preview',
  doubao: 'doubao-seedance-1-0-pro-250528',
  'openai-compat': undefined,
};

// ============== Model Router ==============

export class ModelRouter {
  private imageService: IImageService;
  private videoService: IVideoService;
  private audioService: IAudioService;
  private frameExtractionService: FrameExtractionService;
  private audioRenderService: AudioRenderService;

  /** Resolved configuration that produced this router. Useful for logging. */
  readonly imageConfig: ResolvedProviderConfig | undefined;
  readonly videoConfig: ResolvedProviderConfig | undefined;
  readonly audioConfig: ResolvedProviderConfig | undefined;

  constructor(options: {
    imageConfig?: ResolvedProviderConfig;
    videoConfig?: ResolvedProviderConfig;
    audioConfig?: ResolvedProviderConfig;
  }) {
    this.imageConfig = options.imageConfig;
    this.videoConfig = options.videoConfig;
    this.audioConfig = options.audioConfig;

    if (this.imageConfig) {
      const imageModelConfig: ImageModelConfig = {
        apiKey: this.imageConfig.apiKey,
        baseUrl: this.imageConfig.baseUrl,
        modelType: this.imageConfig.provider,
        modelNameGeneration: this.imageConfig.model,
        modelNameEditing:
          IMAGE_EDIT_DEFAULTS[this.imageConfig.provider] ??
          this.imageConfig.model,
      };
      this.imageService = createImageService(imageModelConfig);
    } else {
      this.imageService = createDisabledImageService();
    }

    if (this.videoConfig) {
      const videoModelConfig: VideoModelConfig = {
        apiKey: this.videoConfig.apiKey,
        baseUrl: this.videoConfig.baseUrl,
        modelType: this.videoConfig.provider,
        modelNameVideo: this.videoConfig.model,
        modelNameVideoText:
          VIDEO_T2V_DEFAULTS[this.videoConfig.provider] ??
          this.videoConfig.model,
      };
      this.videoService = createVideoService(videoModelConfig);
    } else {
      this.videoService = createDisabledVideoService();
    }

    if (this.audioConfig) {
      const audioModelConfig: AudioModelConfig = {
        apiKey: this.audioConfig.apiKey,
        baseUrl: this.audioConfig.baseUrl,
        modelType: this.audioConfig.provider,
        modelNameChat: this.audioConfig.model,
      };
      this.audioService = createAudioService(audioModelConfig);
    } else {
      this.audioService = createDisabledAudioService();
    }

    this.frameExtractionService = new FrameExtractionService();
    this.audioRenderService = new AudioRenderService();
  }

  // ============== Image Operations ==============

  async generateImage(
    prompt: string,
    size: string = '1024*1024',
  ): Promise<string> {
    console.log(
      `[ModelRouter] Routing image generation to ${this.imageConfig?.provider ?? 'disabled'}`,
    );
    return this.imageService.generateImage(prompt, size);
  }

  async editImage(
    referenceImageUrl: string,
    prompt: string,
    previousFrameUrl?: string | null,
  ): Promise<string> {
    console.log(
      `[ModelRouter] Routing image editing to ${this.imageConfig?.provider ?? 'disabled'}`,
    );
    return this.imageService.editImage(
      referenceImageUrl,
      prompt,
      previousFrameUrl,
    );
  }

  // ============== Video Operations ==============

  async generateVideo(
    baseImageUrl: string,
    prompt: string,
    resolution: string = '480P',
  ): Promise<{ videoUrl: string; taskId: string }> {
    console.log(
      `[ModelRouter] Routing video generation to ${this.videoConfig?.provider ?? 'disabled'}`,
    );
    return this.videoService.generateVideo(baseImageUrl, prompt, resolution);
  }

  async generateVideoFromText(
    prompt: string,
    resolution: string = '720P',
  ): Promise<{ videoUrl: string; taskId: string }> {
    console.log(
      `[ModelRouter] Routing text-to-video generation to ${this.videoConfig?.provider ?? 'disabled'}`,
    );
    return this.videoService.generateVideoFromText(prompt, resolution);
  }

  // ============== Audio Operations ==============

  async generateABC(request: AudioRequest): Promise<string> {
    console.log(
      `[ModelRouter] Routing ABC generation to ${this.audioConfig?.provider ?? 'disabled'}`,
    );
    if (!this.audioService.generateABC) {
      throw new Error(
        `${this.audioConfig?.provider ?? 'Selected'} audio provider generates audio directly and does not support ABC notation.`,
      );
    }
    return this.audioService.generateABC(request);
  }

  async generateDirectAudio(
    request: AudioRequest,
  ): Promise<DirectAudioResult | null> {
    if (!this.audioService.generateAudio) return null;
    console.log(
      `[ModelRouter] Routing direct audio generation to ${this.audioConfig?.provider ?? 'disabled'}`,
    );
    return this.audioService.generateAudio(request);
  }

  async generateAudioFromABC(
    abcNotation: string,
    type: 'sfx' | 'bgm' = 'bgm',
    durationSeconds: number = 5,
  ): Promise<Buffer> {
    console.log(`[ModelRouter] Converting ABC notation to WAV (${type})...`);
    return this.audioRenderService.generateFromABC(
      abcNotation,
      type,
      durationSeconds,
    );
  }

  async isSymusicAvailable(): Promise<boolean> {
    return this.audioRenderService.isSymusicAvailable();
  }

  async generatePlaceholderAudio(
    durationSeconds: number = 1,
    type: 'sfx' | 'bgm' = 'sfx',
  ): Promise<Buffer> {
    console.log(
      `[ModelRouter] Generating local ${type} audio (${durationSeconds}s)`,
    );
    return this.audioRenderService.generateGameAudio(durationSeconds, type);
  }

  // ============== Getters ==============

  /**
   * Backwards-compatible alias. Returns the IMAGE provider name, since
   * almost all callers used `getModelType()` to log what they were
   * routing image calls to.
   */
  getModelType(): string {
    return this.imageConfig?.provider ?? 'disabled';
  }

  getImageService(): IImageService {
    return this.imageService;
  }

  getVideoService(): IVideoService {
    return this.videoService;
  }

  getAudioService(): IAudioService {
    return this.audioService;
  }
}

// ============== Disabled-modality stubs ==============
//
// When a construction mode does not configure a particular provider, we hand
// the asset tool a router so its other code paths keep working. These
// stubs throw the same MissingProviderConfigError-style message the
// resolver would have raised, but only when the disabled modality is
// actually used.

function createDisabledImageService(): IImageService {
  const fail = (): never => {
    throw new Error(
      'OpenGame image generation is not configured. Set OPENGAME_IMAGE_PROVIDER, ' +
        'OPENGAME_IMAGE_API_KEY (and OPENGAME_IMAGE_MODEL for openai-compat), or add ' +
        '"openGame.providers.image" to your settings.json. ' +
        'See docs/users/configuration/api-keys.md.',
    );
  };
  return {
    generateImage: () => fail(),
    editImage: () => fail(),
  };
}

function createDisabledVideoService(): IVideoService {
  const fail = (): never => {
    throw new Error(
      'OpenGame video generation is not configured. Set OPENGAME_VIDEO_PROVIDER, ' +
        'OPENGAME_VIDEO_API_KEY (and OPENGAME_VIDEO_MODEL for openai-compat), or add ' +
        '"openGame.providers.video" to your settings.json. ' +
        'See docs/users/configuration/api-keys.md.',
    );
  };
  return {
    generateVideo: () => fail(),
    generateVideoFromText: () => fail(),
  };
}

function createDisabledAudioService(): IAudioService {
  const fail = (): never => {
    throw new Error(
      'OpenGame audio generation is not configured. Set OPENGAME_AUDIO_PROVIDER and ' +
        'OPENGAME_AUDIO_API_KEY, or add "openGame.providers.audio" to your settings.json. ' +
        'See docs/users/configuration/api-keys.md.',
    );
  };
  return {
    generateABC: () => fail(),
  };
}

// ============== Factory Function ==============

/**
 * Build a ModelRouter from environment + (optional) settings.json. Visual
 * mode is the backwards-compatible default: IMAGE is mandatory while VIDEO
 * and AUDIO are optional. Audio mode resolves AUDIO as its only required
 * provider and installs disabled image/video services, so a pure audio request
 * never depends on visual credentials.
 *
 * The legacy `modelType` option remains a provider hint for backward
 * compatibility with the original `model_type` parameter. In audio mode the
 * hint is deliberately restricted to audio so it cannot create unrelated
 * image/video requirements.
 */
export type ModelRouterRequiredModality = 'visual' | 'audio';

export function createModelRouter(
  options: {
    modelType?: 'tongyi' | 'doubao' | 'openai-compat';
    providers?: OpenGameProvidersSettings;
    requiredModality?: ModelRouterRequiredModality;
  } = {},
): ModelRouter {
  const { providers, modelType, requiredModality = 'visual' } = options;

  // If the caller passed a legacy `modelType`, fold it into the providers
  // hint for any required modality that doesn't already have an explicit
  // provider. Audio mode intentionally avoids injecting an unrelated image
  // or video provider from this legacy option.
  const merged: OpenGameProvidersSettings = providers ? { ...providers } : {};
  if (modelType) {
    const hintedModalities =
      requiredModality === 'audio'
        ? (['audio'] as const)
        : (['image', 'video', 'audio'] as const);
    for (const m of hintedModalities) {
      const existing = merged[m] ?? {};
      merged[m] = { ...existing, provider: existing.provider ?? modelType };
    }
  }

  if (requiredModality === 'audio') {
    const audioConfig = resolveProviderConfig('audio', merged);
    return new ModelRouter({ audioConfig });
  }

  const imageConfig = resolveProviderConfig('image', merged);

  // Video and audio are best-effort: if unconfigured, we let the user run
  // image-only flows. We use a try/catch rather than tryResolveProviderConfig
  // so a misconfiguration (e.g. provider set but key missing) still surfaces.
  let videoConfig: ResolvedProviderConfig | undefined;
  try {
    videoConfig = resolveProviderConfig('video', merged);
  } catch (error) {
    // Fall back to the image config ONLY when the user explicitly opted in
    // via legacy IMAGE_MODEL_API_KEY (i.e. when no per-modality video
    // settings exist at all). Otherwise leave it disabled and let the
    // stub raise on first use.
    if (
      !merged.video?.provider &&
      !process.env['OPENGAME_VIDEO_PROVIDER'] &&
      !process.env['OPENGAME_VIDEO_API_KEY']
    ) {
      videoConfig = undefined;
    } else {
      throw error;
    }
  }

  let audioConfig: ResolvedProviderConfig | undefined;
  try {
    audioConfig = resolveProviderConfig('audio', merged);
  } catch (error) {
    if (
      !merged.audio?.provider &&
      !process.env['OPENGAME_AUDIO_PROVIDER'] &&
      !process.env['OPENGAME_AUDIO_API_KEY']
    ) {
      audioConfig = undefined;
    } else {
      throw error;
    }
  }

  return new ModelRouter({ imageConfig, videoConfig, audioConfig });
}
