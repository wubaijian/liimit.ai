# Quickstart: 正式化演示界面验证

## 1. Automated checks

```bash
npm test --workspace=@gameagent/desktop -- polishedDemoUi.test.tsx v3UiPreview.test.tsx platformer-mode-contract.test.ts
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run build --workspace=@gameagent/desktop
npm run smoke:playable --workspace=@gameagent/desktop
git diff --check
```

## 2. Home and creation dialog

1. Start liimit.ai and return to the home screen.
2. Confirm the main copy explains choosing a game type and no longer leads with development status.
3. Open the creation dialog and switch between Phaser platformer and Godot maze.
4. Confirm both cards read like normal product choices and each visible screen has at most one understated `演示模式` label for the Godot path.
5. Confirm the real Phaser submit path still uses the existing project-creation flow.

## 3. Maze workspace

1. Enter the Godot maze workbench.
2. Confirm the header, level tools, object tools, canvas and inspector have no permanent development-warning blocks.
3. Open Save, Web Play, Validation, AI and Export.
4. Confirm panel titles and button labels do not contain `预览`, `尚未接入`, `计划状态` or `（预览）`.
5. Confirm static AI and validation content is marked only with a small `示例数据` label.

## 4. Result-action boundary

1. Click a save, playtest, validation, AI-confirmation or export result action.
2. Confirm exactly one compact contextual notice appears.
3. Click another result action and confirm the new notice replaces the previous one.
4. Return to liimit.ai and confirm project count, selected Phaser project and files did not change.

## 5. Responsive review

- At the minimum desktop window size, verify the back button, top operations and contextual notice remain reachable.
- At a wide desktop size, verify the three-column editor remains aligned and the demo marker is visually secondary.
