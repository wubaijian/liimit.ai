/**
 * @license
 * Copyright 2025 OpenGame Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createModelRouter } from './assetModelRouter.js';
import { MissingProviderConfigError } from './providerConfig.js';

const PROVIDER_ENV_KEYS = [
  'OPENGAME_IMAGE_PROVIDER',
  'OPENGAME_IMAGE_API_KEY',
  'OPENGAME_IMAGE_BASE_URL',
  'OPENGAME_IMAGE_MODEL',
  'OPENGAME_VIDEO_PROVIDER',
  'OPENGAME_VIDEO_API_KEY',
  'OPENGAME_VIDEO_BASE_URL',
  'OPENGAME_VIDEO_MODEL',
  'OPENGAME_AUDIO_PROVIDER',
  'OPENGAME_AUDIO_API_KEY',
  'OPENGAME_AUDIO_BASE_URL',
  'OPENGAME_AUDIO_MODEL',
  'IMAGE_MODEL_API_KEY',
  'IMAGE_MODEL_BASE_URL',
  'IMAGE_MODEL_NAME',
  'VIDEO_MODEL_API_KEY',
  'VIDEO_MODEL_BASE_URL',
  'VIDEO_MODEL_NAME',
  'AUDIO_MODEL_API_KEY',
  'AUDIO_MODEL_BASE_URL',
  'AUDIO_MODEL_NAME',
  'CHAT_MODEL_NAME',
  'DASHSCOPE_API_KEY',
] as const;

describe('createModelRouter modality requirements', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
  });

  it('constructs an audio-only router without resolving image credentials', async () => {
    const router = createModelRouter({
      requiredModality: 'audio',
      providers: {
        audio: {
          provider: 'elevenlabs',
          apiKey: 'audio-only-key',
        },
      },
    });

    expect(router.imageConfig).toBeUndefined();
    expect(router.videoConfig).toBeUndefined();
    expect(router.audioConfig).toMatchObject({
      provider: 'elevenlabs',
      apiKey: 'audio-only-key',
    });
    await expect(router.generateImage('unused')).rejects.toThrow(
      /image generation is not configured/i,
    );
  });

  it('keeps image configuration mandatory in the default visual mode', () => {
    expect(() =>
      createModelRouter({
        providers: {
          audio: {
            provider: 'elevenlabs',
            apiKey: 'audio-only-key',
          },
        },
      }),
    ).toThrow(MissingProviderConfigError);
  });

  it('does not let a legacy model hint inject visual providers in audio mode', () => {
    const router = createModelRouter({
      requiredModality: 'audio',
      modelType: 'tongyi',
      providers: {
        audio: {
          provider: 'elevenlabs',
          apiKey: 'audio-only-key',
        },
      },
    });

    expect(router.imageConfig).toBeUndefined();
    expect(router.videoConfig).toBeUndefined();
    expect(router.audioConfig?.provider).toBe('elevenlabs');
  });
});
