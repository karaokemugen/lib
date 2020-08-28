import parallel from 'async-await-parallel';
import {basename} from 'path';

import { getState } from '../../utils/state';
import {copyFromData, db, refreshAll, saveSetting} from '../dao/database';
import {getDataFromKaraFile, parseKara,verifyKaraData, writeKara} from '../dao/karafile';
import { getDataFromTagFile } from '../dao/tagfile';
import {Kara, KaraFileV4} from '../types/kara';
import { Tag } from '../types/tag';
import {tagTypes} from '../utils/constants';
import {extractAllFiles} from '../utils/files';
import logger, { profile } from '../utils/logger';
import Task from '../utils/taskManager';
import { emitWS } from '../utils/ws';

// Tag map : one tag, an array of KID, tagtype
type TagMap = Map<string, string[][]>

interface Maps {
	tags: TagMap
}

let error = false;

export interface GenerationOptions {
	validateOnly?: boolean,
}

export async function generateDatabase(opts: GenerationOptions) {
	try {
		error = false;
		opts.validateOnly
			? logger.info('Starting data files validation', {service: 'Gen'})
			: logger.info('Starting database generation', {service: 'Gen'});
		profile('ProcessFiles');
		const [karaFiles, tagFiles] = await Promise.all([
			extractAllFiles('Karas'),
			extractAllFiles('Tags'),
		]);
		const allFiles = karaFiles.length + tagFiles.length;
		logger.debug(`Number of karas found : ${karaFiles.length}`, {service: 'Gen'});
		if (karaFiles.length === 0) {
			// Returning early if no kara is found
			logger.warn('No kara files found, ending generation', {service: 'Gen'});
			await emptyDatabase();
			await refreshAll();
			return;
		}

		const task = new Task({
			text: 'GENERATING',
			subtext: 'GENERATING_READING',
			value: 0,
			total: allFiles + 3
		});
		let tags = await readAllTags(tagFiles, task);
		let karas = await readAllKaras(karaFiles, opts.validateOnly, task);

		logger.debug(`Number of karas read : ${karas.length}`, {service: 'Gen'});

		try {
			tags = checkDuplicateTIDs(tags);
			karas = checkDuplicateKIDs(karas);
		} catch(err) {
			if (getState().opt.strict) {
				throw err;
			} else {
				logger.warn('Strict mode is disabled -- duplicates are ignored.', {service: 'Gen'});
			}
		}

		const maps = buildDataMaps(karas, tags, task);

		if (error) throw 'Error during generation. Find out why in the messages above.';

		if (opts.validateOnly) {
			logger.info('Validation done', {service: 'Gen'});
			return true;
		}

		// Preparing data to insert
		profile('ProcessFiles');
		logger.info('Data files processed, creating database', {service: 'Gen'});
		task.update({
			subtext: 'GENERATING_DATABASE',
			value: 0,
			total: 8
		});
		const sqlInsertKaras = prepareAllKarasInsertData(karas);
		task.incr();

		const sqlInsertTags = prepareAllTagsInsertData(maps.tags, tags);
		task.incr();

		const sqlInsertKarasTags = prepareAllKarasTagInsertData(maps.tags);
		task.incr();

		await emptyDatabase();

		task.incr();
		// Inserting data in a transaction

		profile('Copy1');
		await copyFromData('kara', sqlInsertKaras);
		if (sqlInsertTags.length > 0) await copyFromData('tag', sqlInsertTags);
		profile('Copy1');
		task.incr();

		profile('Copy2');
		if (sqlInsertKarasTags.length > 0) await copyFromData('kara_tag', sqlInsertKarasTags);
		profile('Copy2');
		task.incr();

		await refreshAll();
		task.incr();

		await saveSetting('lastGeneration', new Date().toString());
		task.incr();
		task.end();
		emitWS('statsRefresh');
		if (error) throw 'Error during generation. Find out why in the messages above.';
		logger.info('Database generation completed successfully!', {service: 'Gen'});
		return;
	} catch (err) {
		logger.error('Generation error', {service: 'Gen', obj: err});
		throw err;
	}
}

async function emptyDatabase() {
	await db().query(`
	BEGIN;
	TRUNCATE kara_tag CASCADE;
	TRUNCATE tag CASCADE;
	TRUNCATE kara CASCADE;
	COMMIT;
	`);
}

export async function readAllTags(tagFiles: string[], task: Task): Promise<Tag[]> {
	if (tagFiles.length === 0) return [];
	const tagPromises = [];
	for (const tagFile of tagFiles) {
		tagPromises.push(() => processTagFile(tagFile, task));
	}
	const tags = await parallel(tagPromises, 32);
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
	} catch(err) {
		logger.warn(`Tag file ${tagFile} is invalid/incomplete`, {service: 'Gen', obj: err});
		return {
			error: true,
			name: tagFile,
			tagfile: tagFile,
			tid: '',
			types: []
		};
	} finally {
		task.incr();
	}
}

export async function readAllKaras(karafiles: string[], isValidate: boolean, task: Task): Promise<Kara[]> {
	const karaPromises = [];
	if (karafiles.length === 0) return [];
	for (const karafile of karafiles) {
		karaPromises.push(() => readAndCompleteKarafile(karafile, isValidate, task));
	}
	const karas = await parallel(karaPromises, 32);
	if (karas.some((kara: Kara) => kara.error) && getState().opt.strict) error = true;
	return karas.filter((kara: Kara) => !kara.error);
}

async function readAndCompleteKarafile(karafile: string, isValidate: boolean, task: Task): Promise<Kara> {
	let karaData: Kara = {};
	const karaFileData: KaraFileV4 = await parseKara(karafile);
	try {
		verifyKaraData(karaFileData);
		karaData = await getDataFromKaraFile(karafile, karaFileData);
	} catch (err) {
		logger.warn(`Kara file ${karafile} is invalid/incomplete`, {service: 'Gen', obj: err});
		karaData.error = true;
		return karaData;
	}
	if (karaData.isKaraModified && isValidate) {
		await writeKara(karafile, karaData);
	}
	task.incr();
	return karaData;
}


function prepareKaraInsertData(kara: Kara): any[] {
	return [
		kara.kid,
		kara.title,
		kara.year || null,
		kara.songorder || null,
		kara.mediafile,
		kara.subfile,
		basename(kara.karafile),
		kara.mediaduration,
		kara.mediasize,
		kara.mediagain,
		kara.created_at.toISOString(),
		kara.modified_at.toISOString(),
		kara.repository,
		kara.subchecksum
	];
}

function prepareAllKarasInsertData(karas: Kara[]): any[] {
	return karas.map(kara => prepareKaraInsertData(kara));
}

function checkDuplicateKIDs(karas: Kara[]): Kara[] {
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
				kara2: dupKara.karafile
			});
		} else {
			searchKaras.set(kara.kid, kara);
		}
	}
	if (errors.length > 0) {
		const err = `One or several karaokes are duplicated in your database : ${JSON.stringify(errors)}.`;
		logger.debug('', {service: 'Gen', obj: err});
		logger.warn(`Found ${errors.length} duplicated karaokes in your repositories`, {service: 'Gen'});
		if (getState().opt.strict) throw err;
	}
	return Array.from(searchKaras.values());
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
				tag2: dupTag.tagfile
			});
		} else {
			searchTags.set(tag.tid, tag);
		}
	}
	if (errors.length > 0) {
		const err = `One or several TIDs are duplicated in your database : ${JSON.stringify(errors)}.`;
		logger.debug('', {service: 'Gen', obj: err});
		logger.warn(`Found ${errors.length} duplicated tags in your repositories`, {service: 'Gen'});
		if (getState().opt.strict) throw err;
	}
	return Array.from(searchTags.values());
}

function prepareAllTagsInsertData(mapTags: TagMap, tagsData: Tag[]): string[][] {
	const data = [];
	for (const tag of mapTags) {
		const tagData = tagsData.find(e => e.tid === tag[0]);
		data.push(prepareTagInsertData(tagData));
	}
	return data;
}

function prepareTagInsertData(data: Tag): string[] {

	if (data.aliases) data.aliases.forEach((d,i) => {
		data.aliases[i] = d.replace(/"/g,'\\"');
	});
	Object.keys(data.i18n).forEach((k) => {
		data.i18n[k] = data.i18n[k].replace(/"/g,'\\"');
	});
	return [
		data.name,
		JSON.stringify(data.i18n || null),
		data.tid,
		data.short || null,
		JSON.stringify(data.aliases || []),
		// PostgreSQL uses {} for arrays, yes.
		JSON.stringify(data.types).replace('[','{').replace(']','}'),
		data.tagfile,
		data.repository,
		data.modified_at,
		data.problematic?.toString() || 'false',
		data.noLiveDownload?.toString() || 'false'
	];
}


function prepareAllKarasTagInsertData(mapTags: TagMap): string[][] {
	const data = [];
	for (const tag of mapTags) {
		for (const kidType of tag[1]) {
			data.push([
				kidType[0],
				tag[0],
				kidType[1]
			]);
		}
	}
	return data;
}

function buildDataMaps(karas: Kara[], tags: Tag[], task: Task): Maps {
	const tagMap = new Map();
	tags.forEach(t => {
		tagMap.set(t.tid, []);
	});
	task.incr();
	karas.forEach(kara => {
		for (const tagType of Object.keys(tagTypes)) {
			if (kara[tagType]?.length > 0) {
				for (const tag of kara[tagType])	 {
					const tagData = tagMap.get(tag.tid);
					if (tagData) {
						tagData.push([kara.kid, tagTypes[tagType]]);
						tagMap.set(tag.tid, tagData);
					} else {
						kara.error = true;
						logger.error(`Tag ${tag.tid} was not found in your tag.json files (Kara file "${kara.karafile}" will not be used for generation)`, {service: 'Gen'});
					}
				}
			}
		}
	});
	task.incr();
	if (karas.some(kara => kara.error) && getState().opt.strict) error = true;
	karas = karas.filter(kara => !kara.error);
	return {
		tags: tagMap,
	};
}