import fs from 'fs';
import parallel from 'p-map';
import { basename, resolve } from 'path';

import { getState } from '../../utils/state.js';
import { copyFromData, databaseReady, db, getDBStatus, refreshAll, saveSetting } from '../dao/database.js';
import { validateHooks } from '../dao/hook.js';
import { getDataFromKaraFile, writeKara } from '../dao/karafile.js';
import { getDataFromTagFile } from '../dao/tagfile.js';
import { ErrorKara, KaraFileV4 } from '../types/kara.js';
import { Tag } from '../types/tag.js';
import { resolvedPath } from '../utils/config.js';
import { tagTypes } from '../utils/constants.js';
import { listAllFiles } from '../utils/files.js';
import logger, { profile } from '../utils/logger.js';
import { removeControlCharsInObject } from '../utils/objectHelpers.js';
import Task from '../utils/taskManager.js';
import { emitWS } from '../utils/ws.js';
import { checkKaraMetadata, checkKaraParents, createKarasMap } from './karaValidation.js';
import { getRepoManifest } from './repo.js';

const service = 'Generation';

// Tag map : one tag, an array of KID, tagtype
type TagMap = Map<string, string[][]>;

interface Maps {
	tags: TagMap;
	karas: KaraFileV4[];
	tagData: Tag[];
}

let error = false;

export interface GenerationOptions {
	validateOnly?: boolean;
}

export async function generateDatabase(
	opts: GenerationOptions = {
		validateOnly: false,
	}
) {
	try {
		error = false;
		opts.validateOnly
			? logger.info('Starting data files validation', { service })
			: logger.info('Starting database generation', { service });
		profile('ProcessFiles');
		const [karaFiles, tagFiles] = await Promise.all([listAllFiles('Karaokes'), listAllFiles('Tags')]);
		const allFiles = karaFiles.length + tagFiles.length;
		logger.debug(`Number of karas found : ${karaFiles.length}`, {
			service,
		});
		const task = new Task({
			text: 'GENERATING',
			subtext: 'GENERATING_READING',
			value: 0,
			total: allFiles + 3,
		});
		logger.info('Reading all data from files...', { service });
		let tags = [];
		let karas = [];
		if (tagFiles.length > 0) tags = await readAllTags(tagFiles, task).then(t => checkDuplicateTIDs(t));
		if (karaFiles.length > 0) karas = await readAllKaras(karaFiles, opts.validateOnly, task).then(k => checkDuplicateKIDs(k));

		logger.debug(`Number of karas read : ${karas.length}`, { service });

		try {
			checkKaraMetadata(karas);
			karas = checkKaraParents(createKarasMap(karas));
		} catch(err) {
			if (getState().opt.strict) throw err;
		}

		const maps = buildDataMaps(karas, tags, task);

		if (getState().opt.strict && !validateHooks(tags)) error = true;

		if (error)
			throw 'Error during generation. Find out why in the messages above.';

		if (opts.validateOnly) {
			logger.info('Validation done', { service });
			return true;
		}

		// Preparing data to insert
		profile('ProcessFiles');
		logger.info('Data files processed, creating database', { service });
		task.update({
			subtext: 'GENERATING_DATABASE',
			value: 0,
			total: 9,
		});
		const sqlInsertKaras = prepareAllKarasInsertData(maps.karas);
		task.incr();

		const sqlInsertTags = prepareAllTagsInsertData(maps.tags, maps.tagData);
		task.incr();

		const sqlInsertKarasParents = prepareAllKarasParentsInsertData(maps.karas);

		const sqlInsertKarasTags = prepareAllKarasTagInsertData(maps.tags);
		task.incr();

		if (getDBStatus()) await databaseReady();
		await emptyDatabase();

		task.incr();
		// Inserting data in a transaction

		profile('CopyKara');
		if (sqlInsertKaras.length > 0) await copyFromData('kara', sqlInsertKaras);
		if (sqlInsertTags.length > 0) await copyFromData('tag', sqlInsertTags);
		profile('CopyKara');
		task.incr();

		profile('CopyKaraTag');
		if (sqlInsertKarasTags.length > 0) await copyFromData('kara_tag', sqlInsertKarasTags);
		profile('CopyKaraTag');
		task.incr();

		profile('CopyKaraFamily');
		if (sqlInsertKarasParents.length > 0) await copyFromData('kara_relation', sqlInsertKarasParents);
		profile('CopyKaraFamily');
		task.incr();

		await refreshAll();
		task.incr();

		await saveSetting('lastGeneration', new Date().toString());
		task.incr();
		task.end();
		emitWS('statsRefresh');
		if (error) throw 'Error during generation. Find out why in the messages above.';
		logger.info('Database generation completed successfully!', {
			service
		});
	} catch (err) {
		if (err.where) logger.error(`Error in sql copy : ${err.where}`, { service });
		if (err.detail) logger.error(`Error in sql copy : ${err.detail}`, { service });
		logger.error('Generation error', { service, obj: err });
		throw err;
	}
}

async function emptyDatabase() {
	await db().query(`
	BEGIN;
	TRUNCATE tag CASCADE;
	TRUNCATE kara CASCADE;
	COMMIT;
	`);
}

export async function readAllTags(tagFiles: string[], task: Task): Promise<Tag[]> {
	if (tagFiles.length === 0) return [];
	const mapper = async (tag: string) => {
		return processTagFile(tag, task);
	};
	const tags = await parallel(tagFiles, mapper, {
		stopOnError: false,
		concurrency: 32,
	});
	if (tags.some((tag: Tag) => tag.error) && getState().opt.strict) {
		error = true;
	}
	return tags.filter((tag: Tag) => !tag.error);
}

async function processTagFile(tagFile: string, task: Task): Promise<Tag> {
	try {
		const data = await getDataFromTagFile(tagFile);
		data.tagfile = basename(tagFile);
		return data;
	} catch (err) {
		logger.warn(`Tag file ${tagFile} is invalid/incomplete`, {
			service,
			obj: err,
		});
		return {
			error: true,
			name: tagFile,
			tagfile: tagFile,
			tid: '',
			types: [],
		};
	} finally {
		task.incr();
	}
}

function isKaraOK(kara: KaraFileV4 | ErrorKara): kara is KaraFileV4 {
	return !kara.meta.error;
}

export async function readAllKaras(karafiles: string[], isValidate: boolean, task?: Task): Promise<KaraFileV4[]> {
	if (karafiles.length === 0) return [];
	const mapper = async (karafile: string) => {
		return readAndCompleteKarafile(karafile, isValidate, task);
	};
	const karas = await parallel(karafiles, mapper, {
		stopOnError: false,
		concurrency: 32,
	});
	if (karas.some(kara => kara.meta.error) && getState().opt.strict) {
		error = true;
	}
	return karas.filter<KaraFileV4>(isKaraOK);
}

async function readAndCompleteKarafile(
	karafile: string,
	isValidate: boolean,
	task: Task
): Promise<KaraFileV4 | ErrorKara> {
	let karaData: KaraFileV4 | ErrorKara;
	try {
		karaData = await getDataFromKaraFile(
			karafile,
			{
				media: true,
				lyrics: false,
			},
			isValidate
		);
	} catch (err) {
		logger.warn(`Kara file ${karafile} is invalid/incomplete`, {
			service,
			obj: err,
		});
		karaData = {
			meta: {
				error: true,
				karaFile: karafile,
				isKaraModified: false,
				downloadStatus: 'MISSING',
			},
		};
	}
	if (karaData.meta.isKaraModified && isValidate) {
		// Non-fatal if it fails
		await writeKara(karafile, karaData as KaraFileV4).catch(() => {});
	}
	if (task) task.incr();
	return karaData;
}

function prepareKaraInsertData(kara: KaraFileV4): any[] {
	kara = removeControlCharsInObject(kara);
	Object.keys(kara.data.titles).forEach(k => {
		kara.data.titles[k] = kara.data.titles[k].replaceAll('\\', '\\\\');
		kara.data.titles[k] = kara.data.titles[k].replaceAll('"', '\\"');
	});
	if (kara.data.titles_aliases)
		kara.data.titles_aliases.forEach((d, i) => {
			kara.data.titles_aliases[i] = d.replaceAll('\\', '\\\\');
			kara.data.titles_aliases[i] = d.replaceAll('"', '\\"');
		});
	kara.medias[0].lyrics = kara.medias[0].lyrics?.map( l => {
		// I think other fields are automatically free of bothersome characters
		l.version = l.version.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
		return l;
	}) ?? [];
	return [
		kara.data.kid,
		kara.data.year || null,
		kara.data.songorder || null,
		kara.medias[0].filename,
		basename(kara.meta.karaFile),
		kara.medias[0].duration,
		kara.medias[0].filesize,
		kara.data.created_at,
		kara.data.modified_at,
		kara.data.repository,
		null, // tsvector
		kara.medias[0].loudnorm,
		kara.meta.downloadStatus,
		kara.data.comment?.replaceAll('\\', '').replaceAll('"', '\\"'),
		kara.data.ignoreHooks || false,
		JSON.stringify(kara.data.titles || null),
		JSON.stringify(kara.data.titles_aliases || []),
		kara.data.titles_default_language || 'eng',
		kara.data.from_display_type || null,
		kara.data.songname || null,
		JSON.stringify(kara.medias[0].lyrics),
	];
}

function prepareAllKarasInsertData(karas: KaraFileV4[]): any[] {
	return karas.map(kara => prepareKaraInsertData(kara));
}

function checkDuplicateKIDs(karas: KaraFileV4[]): KaraFileV4[] {
	const searchKaras = new Map();
	const errors = [];
	for (const kara of karas) {
		// Find out if our kara exists in our list, if not push it.
		const dupKara = searchKaras.get(kara.data.kid);
		if (dupKara) {
			// One KID is duplicated, we're going to throw an error.
			errors.push({
				kid: kara.data.kid,
				kara1: kara.meta.karaFile,
				kara2: dupKara.meta.karaFile,
			});
		} else {
			searchKaras.set(kara.data.kid, kara);
		}
	}
	if (errors.length > 0) {
		const err = `One or several karaokes are duplicated in your database : ${JSON.stringify(
			errors
		)}.`;
		logger.debug(err, { service });
		logger.warn(
			`Found ${errors.length} duplicated karaokes in your repositories`,
			{ service }
		);
		if (getState().opt.strict) throw err;
	}

	return [...searchKaras.values()];
}

function checkDuplicateTIDs(tags: Tag[]): Tag[] {
	const searchTags = new Map();
	const errors = [];
	for (const tag of tags) {
		// Find out if our kara exists in our list, if not push it.
		const dupTag = searchTags.get(tag.tid);
		if (dupTag) {
			// One TID is duplicated, we're going to throw an error.
			errors.push({
				tid: tag.tid,
				tag1: tag.tagfile,
				tag2: dupTag.tagfile,
			});
		} else {
			searchTags.set(tag.tid, tag);
		}
	}
	if (errors.length > 0) {
		const file = resolve(resolvedPath('Logs'), 'duplicateTags.json');
		fs.writeFileSync(file, JSON.stringify(errors, null, 2), 'utf-8');
		logger.warn(`Found ${errors.length} duplicated tags in your repositories. Check duplicates-<reponame>.json in the logs directory`, {
			service,
		});
		if (getState().opt.strict) throw `Duplicated TIDs found`;
	}
	return [...searchTags.values()];
}

function prepareAllTagsInsertData(mapTags: TagMap, tagsData: Tag[]): string[][] {
	const data = [];
	for (const tag of mapTags) {
		const tagData = tagsData.find(e => e.tid === tag[0]);
		data.push(prepareTagInsertData(tagData));
	}
	return data;
}

function prepareTagInsertData(data: Tag): any[] {
	data = removeControlCharsInObject(data);
	if (data.aliases)
		data.aliases.forEach((d, i) => {
			data.aliases[i] = d.replaceAll('"', '\\"');
		});
	if (data.i18n) {
		Object.keys(data.i18n).forEach(k => {
			data.i18n[k] = data.i18n[k].replaceAll('"', '\\"');
		});
	} else {
		data.i18n = {};
	}
	if (data.description) {
		Object.keys(data.description).forEach(k => {
			data.description[k] = data.description[k].replaceAll('"', '\\"');
		});
	} else {
		data.description = {};
	}
	return [
		data.name,
		JSON.stringify(data.i18n || null),
		data.tid,
		data.short || null,
		JSON.stringify(data.aliases || []),
		// PostgreSQL uses {} for arrays, yes.
		JSON.stringify(data.types).replace('[', '{').replace(']', '}'),
		data.tagfile,
		data.repository,
		data.noLiveDownload?.toString() || 'false',
		data.priority?.toString() || '10',
		null, // tsvector
		data.karafile_tag,
		JSON.stringify(data.description || null),
		JSON.stringify(data.external_database_ids) || null,
	];
}

function prepareAllKarasParentsInsertData(karas: KaraFileV4[]) {
	const data = [];
	const karasWithParents = karas.filter(k => k.data.parents);
	for (const kara of karasWithParents) {
		for (const parent of kara.data.parents) {
			data.push([parent, kara.data.kid]);
		}
	}
	return data;
}

function prepareAllKarasTagInsertData(mapTags: TagMap): string[][] {
	const data = [];
	for (const tag of mapTags) {
		for (const kidType of tag[1]) {
			// KID, TID, type
			data.push([kidType[0], tag[0], kidType[1]]);
		}
	}
	return data;
}

function buildDataMaps(karas: KaraFileV4[], tags: Tag[], task: Task): Maps {
	const tagMap = new Map();
	tags.forEach(t => {
		tagMap.set(t.tid, []);
	});
	const disabledKaras = [];
	task.incr();
	for (const kara of karas) {
		// SKip song if it has no tags
		if (!kara.data.tags) continue;
		for (const tagType of Object.keys(tagTypes)) {
			if (kara.data.tags[tagType]?.length > 0) {
				for (const tid of kara.data.tags[tagType]) {
					const tagData = tagMap.get(tid);
					if (tagData) {
						tagData.push([kara.data.kid, tagTypes[tagType]]);
						tagMap.set(tid, tagData);
					} else {
						const manifest = getRepoManifest(kara.data.repository);
						if (manifest?.rules?.karaFile?.allowMissingTags) {
							kara.data.tags[tagType] = kara.data.tags[tagType].filter(t => t !== tid);
							logger.error(
								`Tag ${tid} (type ${tagType}) was not found in your tag.json files (Kara file "${kara.meta.karaFile}" (${kara.data.songname}) will not feature this tag)`,
								{ service }
							);
						} else {
							kara.meta.error = true;
							disabledKaras.push(kara.data.kid);
							logger.error(
								`Tag ${tid} (type ${tagType}) was not found in your tag.json files (Kara file "${kara.meta.karaFile}" (${kara.data.songname}) will be removed from generation)`,
								{ service }
							);
						}
						tags = tags.filter(t => t.tid !== tid);
						tagMap.delete(tid);
					}
				}
			}
		}
	}
	task.incr();
	if (karas.some(kara => kara.meta.error) && getState().opt.strict) error = true;
	karas = karas.filter(kara => !kara.meta.error);
	// Also remove disabled karaokes from the tagMap.
	// Checking through all tags to identify the songs we removed because one of their other tags was missing.
	// @Aeden's lucky that this only takes about 36ms for one missing tag on an old laptop or else I'd have deleted that code already.
	for (const kid of disabledKaras) {
		for (const [tag, karasList] of tagMap) {
			const newKaras = karasList.filter((k: any) => k[0] !== kid);
			if (newKaras.length !== karasList.length) tagMap.set(tag, newKaras);
		}
	}
	return {
		tags: tagMap,
		tagData: tags,
		karas,
	};
}
