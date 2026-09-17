// Real OS Trash test with an isolated temporary folder; never opens user state.
const { app, shell } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
app.whenReady().then(async () => {
  const { ProjectRemovalService } = await import(pathToFileURL(path.join(__dirname, '../dist/main/projectRemovalService.js')).href);
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'liimit-removal-smoke-')));
  const project = { id: 'temporary-removal-smoke', name: '仅用于删除测试', path: path.join(root, path.basename(root)), status: 'draft' };
  let removed = false;
  try {
    await fs.mkdir(path.join(project.path, '.gameagent'), { recursive: true });
    await fs.writeFile(path.join(project.path, '.gameagent/project.json'), JSON.stringify(project));
    await fs.writeFile(path.join(project.path, 'README.txt'), 'liimit.ai temporary deletion test. No user game files.');
    const service = new ProjectRemovalService({ getProject: () => project, getProjects: () => [project], isBusy: () => false, confirm: async () => true, trash: target => shell.trashItem(target), removeRecord: async () => { removed = true; }, stopPreview: async () => {}, protectedPaths: [root] });
    await service.remove({ projectId: project.id, mode: 'trash' });
    const exists = await fs.lstat(project.path).then(() => true, () => false);
    if (!removed || exists) throw new Error('Trash integration failed');
    console.log('PASS: real OS Trash moved only temporary fixture: ' + path.basename(project.path));
    await fs.rmdir(root);
    app.exit(0);
  } catch (error) {
    console.error(error); app.exit(1);
  }
});
