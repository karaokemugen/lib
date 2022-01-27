import { watch } from 'chokidar';

import { Hook } from '../types/hook';
import { resolvedPathRepos } from '../utils/config';
import { listAllFiles } from '../utils/files';
import logger from '../utils/logger';
import { readAllHooks } from './hookfile';

export const hooks: Hook[] = [];
let watcher: any;

/** Reads all hooks from all repositories (refresh) */
export async function refreshHooks() {
	const hookFiles = await listAllFiles('Hooks');
	const readHooks = await readAllHooks(hookFiles);
	hooks.length = 0;
	for (const hook of readHooks) {
		hooks.push(hook);
	}
	logger.info('Refreshed hooks', { service: 'Hooks' });
}

export async function initHooks() {
	// Let's watch for files in all enabled repositories
	refreshHooks();
	const dirs = resolvedPathRepos('Hooks');
	watcher = watch(dirs, {
		ignored: /(^|[/\\])\../, // ignore dotfiles
		persistent: true,
	});
	watcher.on('ready', () => {
		watcher.on('change', refreshHooks);
		watcher.on('add', refreshHooks);
		watcher.on('unlink', refreshHooks);
	});
	logger.info('Starting watching hooks folder', { service: 'Hooks' });
}

export async function stopWatchingHooks() {
	logger.info('Closing watch on hooks folder', { service: 'Hooks' });
	if (watcher) await watcher.close();
}
