import { vi } from 'vitest';

// Vitest's jsdom environment provides browser globals such as Image. Keep
// only the small compatibility shim needed by Phaser's headless tests, so a
// normal game project does not need a native Canvas build during npm ci.
globalThis.scrollTo ||= () => {};

// Use fake timers to step Phaser's main loop deterministically in tests
vi.useFakeTimers();
