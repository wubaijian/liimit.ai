# Agent Test — Quick Start Guide

This guide helps you set up and run the Game Coding Agent test environment, covering dependency installation, core library builds, environment configuration, and integration testing.

## Prerequisites

- **Node.js**: v20.0.0 or higher
- **API Keys for explicit live testing only**: An OpenRouter API key, plus any reasoning or asset-provider keys required by the live workflow

## 1. Build Core

This project uses a monorepo structure. `agent-test` depends on `packages/core`. After any changes to tool code in `packages/core`, you **must** rebuild before testing.

From the project root directory:

```bash
# Install all dependencies
npm install

# Build the Core package (required)
npm run build --workspace=@opengame/opengame-core
```

## 2. Live Test Configuration

The default `npm test` command is an offline TypeScript check and does not need
API keys. Only configure the following when you intentionally plan to run the
human-supervised `npm run test:live` command. API keys should never be hardcoded.
Create a `.env` file in the `agent-test/` directory:

The current live runner is intentionally narrow: its main request uses the
hard-coded OpenRouter base URL and the hard-coded model
`anthropic/claude-opus-4.6`. Supplying a different OpenAI-compatible base URL or
model in `.env` does not switch the main Agent without changing
`agent-test/scripts/test.ts`.

```bash
cd agent-test
touch .env
```

Edit `.env` with the following:

```bash
# --- OpenRouter / LLM Provider ---
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxxxxxx

# --- Reasoning Model (used by GenerateGDD; game type is fixed) ---
REASONING_MODEL_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
REASONING_MODEL_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
REASONING_MODEL_NAME=qwen-max

# --- Image Generation Model (used by GenerateAssets) ---
IMAGE_MODEL_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
IMAGE_MODEL_BASE_URL=https://dashscope-intl.aliyuncs.com
IMAGE_MODEL_NAME_GENERATION=z-image-turbo
IMAGE_MODEL_NAME_EDITING=wan2.5-i2i-preview

# --- (Optional) Custom bin directory for tools like ffmpeg ---
# CUSTOM_BIN_DIR=/path/to/your/bin
```

## 3. Running Tests

The two commands have deliberately different safety and cost boundaries:

```bash
cd agent-test

# Default: type-check only. It does not execute scripts/test.ts or call a model.
npm run test

# Explicit live test: launches the Agent and can incur model/asset-provider fees.
npm run test:live
```

`test:live` uses one neutral, original fixed-product case:

| Name      | Game Type              | Description                                                       |
| --------- | ---------------------- | ----------------------------------------------------------------- |
| `default` | Phaser 3 2D Platformer | One short original level for separate human movement/jump/goal QA |

The live runner invokes `anthropic/claude-opus-4.6` through OpenRouter and may
also invoke the reasoning or asset providers configured above. Run it only with
valid test credentials, an approved budget, and a person watching the output.
Before running it, complete the Core build in Section 1 so newly registered tools
are available.

`test:live` is a standalone SDK/Agent observation harness. It does **not** call
the Desktop fixed-project provisioner, controlled final build, HTML/JavaScript
HTTP probe, or in-app preview. An SDK `success` result therefore does not mean
the Desktop completion gate passed. Review the generated files separately and
perform the movement, jump, hazard-recovery, goal, and browser-console checks
manually.

## 4. Development Workflow

When modifying tool code:

1. **Edit**: Modify `.ts` files in `packages/core/src/tools/`.
2. **Rebuild**: Run `npm run build --workspace=@opengame/opengame-core` from the project root.
3. **Offline check**: Run `npm test` in `agent-test/` to type-check the harness without calling any provider.
4. **Optional live observation**: Run `npm run test:live` only when a paid, human-supervised Agent run is explicitly intended; validate the Desktop completion gate separately.

## 5. Project Structure

```
agent-test/
├── scripts/
│   └── test.ts              # Test runner (SDK integration)
├── test-cases/
│   └── game-test.ts         # The single explicit live-test prompt
├── prompts/
│   ├── default.md            # Default system prompt
│   └── custom.md             # Custom system prompt template
├── docs/
│   ├── debug_protocol.md     # Debug & verification checklist
│   ├── asset_protocol.md     # Asset generation protocol
│   └── ...                   # Module-specific design docs
├── templates/
│   ├── core/                 # Base Phaser game template
│   └── modules/              # Fixed game archetype module
│       └── platformer/
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 6. Troubleshooting

**Error: 401 Unauthorized**

- Verify that `.env` exists in the `agent-test/` directory.
- Check that your API keys are valid and the base URLs match your provider's region.

**Tool not invoked by the agent**

- Ensure the tool is registered in `packages/core/src/config/config.ts`.
- Ensure you ran `npm run build` to update the compiled output.
- Check that the test case prompt is specific enough to trigger the tool.

**ffmpeg / external tool not found**

- Set `CUSTOM_BIN_DIR` in your `.env` to the directory containing the binary (e.g., a conda environment's `bin/` folder).
