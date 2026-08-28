# Quickstart

> 👏 Welcome to OpenGame!

This quickstart will have you generating a playable web game from a prompt in just a few minutes.

## Before you begin

Make sure you have:

- A **terminal** or command prompt open
- An empty folder where the generated game will live
- An OpenAI-compatible API key (or a local deployment of GameCoder-27B)
- [Node.js 20+](https://nodejs.org/en/download). Run `node -v` to check.

## Step 1: Install OpenGame

Install from source while we prepare the npm release:

```bash
git clone https://github.com/leigest519/OpenGame.git
cd OpenGame
npm install
npm run build
npm link
```

This exposes the `opengame` command globally on your `PATH`.

## Step 2: Configure authentication

Set up an OpenAI-compatible endpoint:

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_BASE_URL="https://api.openai.com/v1"   # optional
export OPENAI_MODEL="gpt-4o"                         # optional; swap in GameCoder-27B when running locally
```

You can also run `/auth` inside an interactive session to switch authentication methods.

## Step 3: Start your first session

```bash
mkdir snake-game && cd snake-game
opengame
```

You'll see the OpenGame welcome screen. Type `/help` for available commands.

## Build your first game

### Describe the game you want

Try a simple prompt:

```
Build a side-scrolling forest platformer with left/right controls, double jump, three patrolling enemies, and a goal flag.
```

OpenGame will:

1. Confirm the fixed Phaser 3 platformer architecture and plan the files, game loop, and state.
2. Scaffold the project using the built-in **platformer template**.
3. Write the code, install dependencies, and run the game in a sandboxed browser.
4. Use the **Debug Protocol** to catch errors, broken interactions, and missing assets — and fix them automatically.
5. Stop when the game is playable end-to-end.

When done, open the printed local URL (or `index.html`) in your browser to play.

### Iterate on it

Just keep talking to OpenGame:

```
add a power-up that doubles the snake's speed for 5 seconds
```

```
make the background a starfield instead of solid black
```

```
the snake passes through itself when going fast — fix that
```

OpenGame will edit the relevant files, re-run the game, and verify the change.

## Headless mode

For scripts and CI, skip the interactive UI:

```bash
opengame -p "Build a memory-matching card game with 16 cards and a 60-second timer."
```

## Essential commands

| Command     | What it does                                       | Example            |
| ----------- | -------------------------------------------------- | ------------------ |
| `opengame`  | Start OpenGame (interactive)                       | `opengame`         |
| `/auth`     | Change authentication method                       | `/auth`            |
| `/help`     | Display help information for available commands    | `/help` or `/?`    |
| `/compress` | Replace chat history with a summary to save tokens | `/compress`        |
| `/clear`    | Clear terminal screen content                      | `/clear`           |
| `/theme`    | Change OpenGame visual theme                       | `/theme`           |
| `/language` | View or change language settings                   | `/language`        |
| `/quit`     | Exit OpenGame                                      | `/quit` or `/exit` |

See the [commands reference](./features/commands) for the full list.

## Pro tips for game prompts

**Be specific about gameplay**

- Instead of: "make a platformer"
- Try: "Build a single-screen platformer with arrow-key controls, double jump, 3 enemies that patrol left-right, and a goal flag at the top-right."

**Stay inside the fixed product mode**

- Use Phaser 3 with a side view, gravity, left/right movement, and jumping.
- Describe the theme, enemies, abilities, art style, and level goals you want.
- Requests for another engine, 3D, top-down, tower-defense, grid, or UI-only games are outside the current product mode.

**Iterate one thing at a time**

- Make the core loop work first, then add polish (sound, particles, menus).

## Getting help

- **In OpenGame**: type `/help` or ask "how do I..."
- **Documentation**: you're here! Browse other guides.
- **Community**: open an issue or discussion at [github.com/leigest519/OpenGame](https://github.com/leigest519/OpenGame).
