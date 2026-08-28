/**
 * The only human-supervised live case. It can use paid model and asset
 * providers, so it must be started explicitly with `npm run test:live`.
 */
export const livePlatformerTestCase = {
  id: 'fixed-phaser-platformer-live',
  name: 'FixedPhaserPlatformerLive',
  prompt: `Create a small, original Phaser 3 2D side-scrolling platform-jumping game using the fixed platformer template.

Keep the scope suitable for one human-supervised live acceptance run:

- Create one short level with left/right movement, jumping, solid platforms, one simple hazard, and a clearly visible finish goal.
- Use only original neutral shapes, colors, and names. Do not use copyrighted characters, franchises, logos, or imitations of an existing commercial game.
- Keep the existing Phaser engine, platformer archetype, Web target, dependency manifest, and lockfile unchanged.
- Run the project build and available tests, fix any errors, and leave a browser-ready dist/index.html.

The reviewer will separately open the Web preview and manually verify movement, jumping, hazard recovery, and reaching the goal.
`,
};

export const defaultTestCase = livePlatformerTestCase;

export const allTestCases = {
  default: defaultTestCase,
};
