import parallel from 'p-map';
import { basename } from 'path';

import { getState } from '../../utils/state';
import {
	copyFromData,
	databaseReady,
	db,
	getDBStatus,
	refreshAll,
	saveSetting,
} from '../dao/database';
import {
	getDataFromKaraFile,
	parseKara,
	verifyKaraData,
	writeKara,
} from '../dao/karafile';
import { getDataFromTagFile } from '../dao/tagfile';
import { Kara, KaraFileV4 } from '../types/kara';
import { Tag } from '../types/tag';
import { tagTypes } from '../utils/constants';
import { listAllFiles } from '../utils/files';
import logger, { profile } from '../utils/logger';
import Task from '../utils/taskManager';
import { emitWS } from '../utils/ws';

// Tag map : one tag, an array of KID, tagtype
type TagMap = Map<string, string[][]>;

interface Maps {
	tags: TagMap;
	karas: Kara[];
	tagData: Tag[];
}

let error = false;

export interface GenerationOptions {
	validateOnly?: boolean;
}

export async function generateDatabase(opts: GenerationOptions = {
	validateOnly: false
}) {
	try {
		error = false;
		opts.validateOnly
			? logger.info('Starting data files validation', { service: 'Gen' })
			: logger.info('Starting database generation', { service: 'Gen' });
		profile('ProcessFiles');
		const [karaFiles, tagFiles] = await Promise.all([
			listAllFiles('Karaokes'),
			listAllFiles('Tags'),
		]);
		const allFiles = karaFiles.length + tagFiles.length;
		logger.debug(`Number of karas found : ${karaFiles.length}`, {
			service: 'Gen',
		});
		if (karaFiles.length === 0 && !opts.validateOnly) {
			// Returning early if no kara is found
			logger.warn('No kara files found, ending generation', { service: 'Gen' });
			if (getDBStatus()) await databaseReady();
			await emptyDatabase();
			await refreshAll();
			return;
		}

		const task = new Task({
			text: 'GENERATING',
			subtext: 'GENERATING_READING',
			value: 0,
			total: allFiles + 3,
		});
		logger.info('Reading all data from files...', { service: 'Gen' });
		let tags = await readAllTags(tagFiles, task);
		let karas = await readAllKaras(karaFiles, opts.validateOnly, task);

		logger.debug(`Number of karas read : ${karas.length}`, { service: 'Gen' });

		tags = checkDuplicateTIDs(tags);
		karas = checkDuplicateKIDsAndParents(karas);

		const maps = buildDataMaps(karas, tags, task);

		if (error)
			throw 'Error during generation. Find out why in the messages above.';

		if (opts.validateOnly) {
			logger.info('Validation done', { service: 'Gen' });
			return true;
		}

		// Preparing data to insert
		profile('ProcessFiles');
		logger.info('Data files processed, creating database', { service: 'Gen' });
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
		await copyFromData('kara', sqlInsertKaras);
		if (sqlInsertTags.length > 0) await copyFromData('tag', sqlInsertTags);
		profile('CopyKara');
		task.incr();

		profile('CopyKaraTag');
		if (sqlInsertKarasTags.length > 0)
			await copyFromData('kara_tag', sqlInsertKarasTags);
		profile('CopyKaraTag');
		task.incr();

		profile('CopyKaraFamily');
		if (sqlInsertKarasParents.length > 0)
			await copyFromData('kara_relation', sqlInsertKarasParents);
		profile('CopyKaraFamily');
		task.incr();

		await refreshAll();
		task.incr();

		await saveSetting('lastGeneration', new Date().toString());
		task.incr();
		task.end();
		emitWS('statsRefresh');
		if (error)
			throw 'Error during generation. Find out why in the messages above.';
		logger.info('Database generation completed successfully!', {
			service: 'Gen',
		});
		return;
	} catch (err) {
		logger.error('Generation error', { service: 'Gen', obj: err });
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

export async function readAllTags(
	tagFiles: string[],
	task: Task
): Promise<Tag[]> {
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
			service: 'Gen',
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

export async function readAllKaras(
	karafiles: string[],
	isValidate: boolean,
	task: Task
): Promise<Kara[]> {
	if (karafiles.length === 0) return [];
	const mapper = async (karafile: string) => {
		return readAndCompleteKarafile(karafile, isValidate, task);
	};
	const karas = await parallel(karafiles, mapper, {
		stopOnError: false,
		concurrency: 32,
	});
	if (karas.some((kara: Kara) => kara.error) && getState().opt.strict)
		error = true;
	return karas.filter((kara: Kara) => !kara.error);
}

async function readAndCompleteKarafile(
	karafile: string,
	isValidate: boolean,
	task: Task
): Promise<Kara> {
	let karaData: Kara = {};
	try {
		const karaFileData: KaraFileV4 = await parseKara(karafile);
		verifyKaraData(karaFileData);
		karaData = await getDataFromKaraFile(karafile, karaFileData, {
			media: true,
			lyrics: false,
		}, isValidate);
	} catch (err) {
		logger.warn(`Kara file ${karafile} is invalid/incomplete`, {
			service: 'Gen',
			obj: err,
		});
		karaData.error = true;
		return karaData;
	}
	if (karaData.isKaraModified && isValidate) {
		// Non-fatal if it fails
		await writeKara(karafile, karaData).catch(() => {});
	}
	task.incr();
	return karaData;
}

function prepareKaraInsertData(kara: Kara): any[] {
	Object.keys(kara.titles).forEach(k => {
		kara.titles[k] = kara.titles[k].replace(/"/g, '\\"');
	});
	return [
		kara.kid,
		kara.year || null,
		kara.songorder || null,
		kara.mediafile,
		kara.subfile,
		basename(kara.karafile),
		kara.duration,
		kara.mediasize,
		kara.gain,
		kara.created_at.toISOString(),
		kara.modified_at.toISOString(),
		kara.repository,
		null, // tsvector
		kara.loudnorm,
		kara.download_status,
		kara.comment,
		kara.ignoreHooks || false,
		JSON.stringify(kara.titles || null),
		JSON.stringify(kara.titles_aliases || []),
		kara.titles_default_language,
	];
}

function prepareAllKarasInsertData(karas: Kara[]): any[] {
	return karas.map(kara => prepareKaraInsertData(kara));
}

function checkDuplicateKIDsAndParents(karas: Kara[]): Kara[] {
	const searchKaras = new Map();
	const errors = [];
	for (const kara of karas) {
		// Find out if our kara exists in our list, if not push it.
		const dupKara = searchKaras.get(kara.kid);
		if (dupKara) {
			// One KID is duplicated, we're going to throw an error.
			errors.push({
				kid: kara.kid,
				kara1: kara.karafile,
				kara2: dupKara.karafile,
			});
		} else {
			searchKaras.set(kara.kid, kara);
		}
	}
	if (errors.length > 0) {
		const err = `One or several karaokes are duplicated in your database : ${JSON.stringify(
			errors
		)}.`;
		logger.debug(err, { service: 'Gen' });
		logger.warn(
			`Found ${errors.length} duplicated karaokes in your repositories`,
			{ service: 'Gen' }
		);
		if (getState().opt.strict) throw err;
	}

	// Test if all parents exist.
	const parentErrors = [];
	for (const kara of karas) {
		if (kara.parents) {
			for (const parent of kara.parents) {
				if (!searchKaras.has(parent)) {
					parentErrors.push({
						childName: kara.karafile,
						parent,
					});
					// Remove parent from kara
					kara.parents = kara.parents.filter(p => p !== parent);
					searchKaras.set(kara.kid, kara);
				}
			}
		}
	}
	if (parentErrors.length > 0) {
		const err = `One or several karaokes have missing parents : ${JSON.stringify(
			parentErrors
		)}.`;
		logger.debug(err, { service: 'Gen' });
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
		const err = `One or several TIDs are duplicated in your database : ${JSON.stringify(
			errors
		)}.`;
		logger.debug('', { service: 'Gen', obj: err });
		logger.warn(`Found ${errors.length} duplicated tags in your repositories`, {
			service: 'Gen',
		});
		if (getState().opt.strict) throw err;
	}
	return [...searchTags.values()];
}

function prepareAllTagsInsertData(
	mapTags: TagMap,
	tagsData: Tag[]
): string[][] {
	const data = [];
	for (const tag of mapTags) {
		const tagData = tagsData.find(e => e.tid === tag[0]);
		data.push(prepareTagInsertData(tagData));
	}
	return data;
}

function prepareTagInsertData(data: Tag): any[] {
	if (data.aliases)
		data.aliases.forEach((d, i) => {
			data.aliases[i] = d.replaceAll('"', '\\"');
		});
	Object.keys(data.i18n).forEach(k => {
		data.i18n[k] = data.i18n[k].replaceAll('"', '\\"');
	});
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
	];
}

function prepareAllKarasParentsInsertData(karas: Kara[]) {
	const data = [];
	const karasWithParents = karas.filter(k => k.parents);
	for (const kara of karasWithParents) {
		for (const parent of kara.parents) {
			data.push([parent, kara.kid]);
		}
	}
	return data;
}

function prepareAllKarasTagInsertData(mapTags: TagMap): string[][] {
	const data = [];
	for (const tag of mapTags) {
		for (const kidType of tag[1]) {
			data.push([kidType[0], tag[0], kidType[1]]);
		}
	}
	return data;
}

function buildDataMaps(karas: Kara[], tags: Tag[], task: Task): Maps {
	const tagMap = new Map();
	tags.forEach(t => {
		tagMap.set(t.tid, []);
	});
	const disabledKaras = [];
	task.incr();
	for (const kara of karas) {
		for (const tagType of Object.keys(tagTypes)) {
			if (kara[tagType]?.length > 0) {
				for (const tag of kara[tagType]) {
					const tagData = tagMap.get(tag.tid);
					if (tagData) {
						tagData.push([kara.kid, tagTypes[tagType]]);
						tagMap.set(tag.tid, tagData);
					} else {
						kara.error = true;
						disabledKaras.push(kara.kid);
						tags = tags.filter(t => t.tid !== tag.tid);
						tagMap.delete(tag.tid);
						logger.error(
							`Tag ${tag.tid} was not found in your tag.json files (Kara file "${kara.karafile}" will not be used for generation)`,
							{ service: 'Gen' }
						);
					}
				}
			}
		}
	}
	task.incr();
	if (karas.some(kara => kara.error) && getState().opt.strict) error = true;
	karas = karas.filter(kara => !kara.error);
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
