import { getTag } from '../../services/tag.js';
import { DBTag } from '../types/database/tag.js';
import { Hook, HookResult } from '../types/hook.js';
import { KaraFileV4 } from '../types/kara.js';
import { Tag, TagTypeNum } from '../types/tag.js';
import { getTagTypeName, tagTypes } from '../utils/constants.js';
import { listAllFiles } from '../utils/files.js';
import logger from '../utils/logger.js';
import { regexFromString } from '../utils/objectHelpers.js';
import { readAllHooks } from './hookfile.js';

const service = 'Hooks';

export const hooks: Hook[] = [];

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

export function validateHooks(tags: Tag[]) {
	// For now we're taking a bunch of tagfiles. I'll certainly regret this the day someone will ask for hooks validation at runtime.
	logger.info('Validating hooks...', { service })
	const tagMap: Map<string, TagTypeNum[]> = new Map();
	for (const tag of tags) {
		tagMap.set(tag.tid, tag.types);
	}
	let errors = false;
	for (const hook of hooks) {
		if (hook.actions.addTag) {
			for (const tagAndType of hook.actions.addTag) {
				const tagTypes = tagMap.get(tagAndType.tid);
				if (!tagTypes) {
					logger.error(`Hook ${hook.name} in ${hook.repository} repository : Tag ${tagAndType.tid} does not exist`, { service });
					errors = true;
					continue;
				} 
				if (!tagTypes.includes(tagAndType.type)) {
					logger.error(`Hook ${hook.name} in ${hook.repository} repository : Tag ${tagAndType.tid} has an incorrect type (${tagAndType.type}). Types in DB for this tag : ${tagTypes.join(', ')}`, { service });
					errors = true;
				}
			}
		}
	}
	return !errors;
}

/** Read all hooks and apply them accordingly */
export async function applyKaraHooks(kara: KaraFileV4, fromAllRepositories = false): Promise<HookResult> {
	const addedTags: DBTag[] = [];
	const removedTags: DBTag[] = [];
	const filteredHooks = fromAllRepositories ? hooks : hooks.filter(h => h.repository === kara.data.repository);
	for (const hook of filteredHooks) {
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
						newTitle = newTitle.replaceAll(
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
					const tag = await getTag(addTag.tid).catch(() => {
						logger.warn(
							`Unable to find tag ${addTag.tid} in database, skipping`,
							{ service }
						);
					});
					if (!tag) continue;
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
			if (hook.actions.removeTag) {
				for (const removeTag of hook.actions.removeTag) {
					const tag = await getTag(removeTag.tid).catch(() => {
						logger.warn(
							`Unable to find tag ${removeTag.tid} in database, skipping`,
							{ service }
						);
					});
					if (!tag) continue;
					const type = getTagTypeName(removeTag.type);
					if (kara.data.tags[type]) {
						if (kara.data.tags[type].includes(removeTag.tid)) {
							removedTags.push(tag);
							kara.data.tags[type] = kara.data.tags[type].filter(t => t !== removeTag.tid);
						}
					}
				}
			}
		}
	}
	return {
		addedTags,
		removedTags
	};
}
