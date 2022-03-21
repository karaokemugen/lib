import { watch } from 'chokidar';

import { getTag } from '../../services/tag';
import { Hook } from '../types/hook';
import { KaraFileV4 } from '../types/kara';
import { Tag } from '../types/tag';
import { resolvedPathRepos } from '../utils/config';
import { getTagTypeName, tagTypes } from '../utils/constants';
import { listAllFiles } from '../utils/files';
import logger from '../utils/logger';
import { regexFromString } from '../utils/objectHelpers';
import { readAllHooks } from './hookfile';

const service = 'Hooks';

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
	logger.info('Refreshed hooks', { service });
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
	logger.info('Starting watching hooks folder', { service });
}

export async function stopWatchingHooks() {
	logger.info('Closing watch on hooks folder', { service });
	if (watcher) await watcher.close();
}

function testCondition(condition: string, value: number): boolean {
	if (condition.startsWith('<')) {
		return value < +condition.replace(/</, '');
	}
	if (condition.startsWith('>')) {
		return value > +condition.replace(/>/, '');
	}
	if (condition.startsWith('<=')) {
		return value <= +condition.replace(/<=/, '');
	}
	if (condition.startsWith('>=')) {
		return value >= +condition.replace(/>=/, '');
	}
	if (condition.includes('-')) {
		const [low, high] = condition.split('-');
		return value >= +low && value <= +high;
	}
	// Should not happen but you never know.
	return false;
}

/** Read all hooks and apply them accordingly */
export async function applyKaraHooks(kara: KaraFileV4): Promise<Tag[]> {
	const addedTags: Tag[] = [];
	for (const hook of hooks.filter(h => h.repository === kara.data.repository)) {
		// First check if conditions are met.
		let conditionsMet = false;
		if (hook.conditions.duration) {
			conditionsMet = testCondition(
				hook.conditions.duration,
				kara.medias[0].duration
			);
		}
		if (hook.conditions.year) {
			conditionsMet = testCondition(hook.conditions.year, kara.data.year);
		}
		if (hook.conditions.mediaFileRegexp) {
			const regexp = regexFromString(hook.conditions.mediaFileRegexp);
			if (regexp instanceof RegExp) {
				conditionsMet = regexp.test(kara.medias[0].filename);
			}
		}
		if (hook.conditions.tagPresence) {
			for (const tid of hook.conditions.tagPresence) {
				if (conditionsMet) break;
				for (const type of Object.keys(tagTypes)) {
					if (conditionsMet) break;
					if (kara.data.tags[type] && kara.data.tags[type].includes(tid)) {
						conditionsMet = true;
					}
				}
			}
		}
		if (hook.conditions.tagNumber) {
			for (const type of Object.keys(hook.conditions.tagNumber)) {
				if (isNaN(hook.conditions.tagNumber[type])) break;
				if (
					kara.data.tags[type] &&
					kara.data.tags[type].length > hook.conditions.tagNumber[type]
				) {
					conditionsMet = true;
					break;
				}
			}
		}
		if (hook.conditions.titlesContain) {
			for (const lang of Object.keys(hook.conditions.titlesContain)) {
				if (!Array.isArray(hook.conditions.titlesContain[lang])) break;
				for (const search of hook.conditions.titlesContain[lang]) {
					if (kara.data.titles[lang]?.includes(search)) {
						conditionsMet = true;
						break;
					}
				}
			}
		}
		// Finished testing conditions.
		if (conditionsMet) {
			logger.info(`Applying hook "${hook.name}" to karaoke data`, {
				service,
			});
			if (hook.actions.addTitleAlias) {
				for (const lang of Object.keys(hook.actions.addTitleAlias)) {
					let newTitle: string = kara.data.titles[lang];
					for (const element of hook.actions.addTitleAlias[lang]) {
						newTitle = newTitle.replace(
							(element as { search: string; replace: string }).search,
							(element as { search: string; replace: string }).replace
						);
					}
					const words = kara.data.titles[lang].split(' ');
					const newWords = newTitle.split(' ');

					for (const newWord of newWords) {
						if (!words.includes(newWord)) {
							if (!Array.isArray(kara.data.titles_aliases)) {
								kara.data.titles_aliases = [];
							}
							kara.data.titles_aliases = kara.data.titles_aliases.filter(a => !a.includes(newWord));
							if (!kara.data.titles_aliases.includes(newWord) && newWord !== '') {
								kara.data.titles_aliases.push(newWord);
							}
						}
					}
				}
			}
			if (hook.actions.addTag) {
				for (const addTag of hook.actions.addTag) {
					const tag = await getTag(addTag.tid);
					if (!tag) {
						logger.warn(
							`Unable to find tag ${addTag.tid} in database, skipping`,
							{ service }
						);
						continue;
					}
					addedTags.push(tag);
					const type = getTagTypeName(addTag.type);
					if (kara.data.tags[type]) {
						if (!kara.data.tags[type].includes(addTag.tid))
							kara.data.tags[type].push(tag.tid);
					} else {
						kara.data.tags[type] = [tag.tid];
					}
				}
			}
		}
	}
	return addedTags;
}
