import { watch } from 'chokidar';

import { Hook } from '../types/hook';
import { resolvedPathRepos } from '../utils/config';
import { extractAllFiles } from '../utils/files';
import logger from '../utils/logger';
import { readAllHooks } from './hookfile';

export let hooks: Hook[] = [];
let watcher: any;

/** Reads all hooks from all repositories (refresh) */
export async function refreshHooks() {
	const hookFiles = await extractAllFiles('Hooks');
	hooks = await readAllHooks(hookFiles);
	logger.info('Refreshed hooks', {service: 'Hooks'});
}

export async function initHooks() {
	// Let's watch for files in all enabled repositories
	const dirs = resolvedPathRepos('Hooks');
	watcher = watch(dirs, {
		ignored: /(^|[/\\])\../, // ignore dotfiles
		persistent: true
	});
	watcher.on('change', refreshHooks);
	watcher.on('add', refreshHooks);
	watcher.on('unlink', refreshHooks);
	logger.info('Starting watching hooks folder', {service: 'Hooks'});
}

export async function stopWatchingHooks() {
	await watcher.close();
	logger.info('Closing watch on hooks folder', {service: 'Hooks'});
}