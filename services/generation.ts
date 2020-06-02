import logger, { profile } from '../utils/logger';
import {basename} from 'path';
import {extractAllFiles} from '../utils/files';
import {getDataFromKaraFile, verifyKaraData, writeKara, parseKara} from '../dao/karafile';
import {tagTypes} from '../utils/constants';
import {Kara, KaraFileV4} from '../types/kara';
import parallel from 'async-await-parallel';
import {copyFromData, refreshAll, db, saveSetting} from '../dao/database';
import Bar from '../utils/bar';
import Task from '../utils/taskManager';
import {emit} from '../utils/pubsub';
import { getDataFromTagFile } from '../dao/tagfile';
import { Tag } from '../types/tag';
import { getState } from '../../utils/state';
import { emitWS } from '../utils/ws';

// Tag map : one tag, an array of KID, tagtype
type TagMap = Map<string, string[][]>

interface Maps {
	tags: TagMap
}

let error = false;
let bar: Bar;
let progress = false;

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
		if (!data) throw false;
		data.tagfile = basename(tagFile);
		return data;
	} catch(err) {
		return {
			error: true,
			name: tagFile,
			tagfile: tagFile,
			tid: '',
			types: []
		}
	} finally {
		if (progress) bar.incr();
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
		logger.warn(`[Gen] Kara file ${karafile} is invalid/incomplete : ${err}`);
		karaData.error = true;
		return karaData;
	}
	if (karaData.isKaraModified && isValidate) {
		await writeKara(karafile, karaData);
	}
	if (progress) bar.incr();
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
	let searchKaras = new Map();
	let errors = [];
	for (const kara of karas) {
		// Find out if our kara exists in our list, if not push it.
		const dupKara = searchKaras.get(kara.kid);
		if (dupKara) {
			// One TID is duplicated, we're going to throw an error.
			errors.push({
				kid: kara.kid,
				kara1: kara.karafile,
				kara2: dupKara.karafile
			});
		} else {
			searchKaras.set(kara.kid, kara);
		}
	};
	if (errors.length > 0) {
		const err = `One or several karaokes are duplicated in your database : ${JSON.stringify(errors)}. Please fix this by removing the duplicated karaokes(s) and retry generating your database.`;
		logger.debug(`[Gen] ${err}`);
		logger.warn(`[Gen] Found ${errors.length} duplicated karaokes in your repositories`);
		if (getState().opt.strict) throw err;
	}
	return Array.from(searchKaras.values());
}

function checkDuplicateTIDs(tags: Tag[]): Tag[] {
	let searchTags = new Map();
	let errors = [];
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
	};
	if (errors.length > 0) {
		const err = `One or several TIDs are duplicated in your database : ${JSON.stringify(errors)}. Please fix this by removing the duplicated tags(s) and retry generating your database.`;
		logger.debug(`[Gen] ${err}`);
		logger.warn(`[Gen] Found ${errors.length} duplicated tags in your repositories`);
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
		data.modified_at
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
		if (progress) bar.incr();
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
						logger.error(`[Gen] Tag ${tag.tid} was not found in your tag.json files (Kara file "${kara.karafile}" will not be used for generation)`);
					}
				}
			}
		}
		if (progress) bar.incr();
	});
	task.incr();
	if (karas.some((kara: Kara) => kara.error) && getState().opt.strict) error = true;
	karas = karas.filter((kara: Kara) => !kara.error);
	return {
		tags: tagMap,
	};
}

export interface GenerationOptions {
	validateOnly?: boolean,
	progressBar?: boolean
}

export async function generateDatabase(opts: GenerationOptions) {
	try {
		emit('databaseBusy',true);
		error = false;
		progress = opts.progressBar;
		opts.validateOnly
			? logger.info('[Gen] Starting data files validation')
			: logger.info('[Gen] Starting database generation');
		profile('ProcessFiles');
		const [karaFiles, tagFiles] = await Promise.all([
			extractAllFiles('Karas'),
			extractAllFiles('Tags'),
		]);
		const allFiles = karaFiles.length + tagFiles.length;
		logger.debug(`[Gen] Number of karas found : ${karaFiles.length}`);
		if (karaFiles.length === 0) {
			// Returning early if no kara is found
			logger.warn('[Gen] No kara files found, ending generation');
			await emptyDatabase();
			await refreshAll();
			return;
		}

		if (progress) bar = new Bar({
			message: 'Reading data         ',
		}, allFiles);
		const task = new Task({
			text: 'GENERATING',
			subtext: 'GENERATING_READING',
			value: 0,
			total: allFiles + 3
		});
		let tags = await readAllTags(tagFiles, task);
		let karas = await readAllKaras(karaFiles, opts.validateOnly, task);

		logger.debug(`[Gen] Number of karas read : ${karas.length}`);

		try {
			tags = checkDuplicateTIDs(tags);
			karas = checkDuplicateKIDs(karas);
		} catch(err) {
			if (getState().opt.strict) {
				throw err;
			} else {
				logger.warn('[Gen] Strict mode is disabled -- duplicates are ignored.');
			}
		}
		if (progress) bar.stop();

		const maps = buildDataMaps(karas, tags, task);

		if (error) throw 'Error during generation. Find out why in the messages above.';

		if (opts.validateOnly) {
			logger.info('[Gen] Validation done');
			return true;
		}

		// Preparing data to insert
		profile('ProcessFiles');
		logger.info('[Gen] Data files processed, creating database');
		if (progress) bar = new Bar({
			message: 'Generating database  '
		}, 12);
		task.update({
			subtext: 'GENERATING_DATABASE',
			value: 0,
			total: 8
		})
		const sqlInsertKaras = prepareAllKarasInsertData(karas);
		if (progress) bar.incr();
		task.incr();

		const sqlInsertTags = prepareAllTagsInsertData(maps.tags, tags);
		if (progress) bar.incr();
		task.incr();

		const sqlInsertKarasTags = prepareAllKarasTagInsertData(maps.tags);
		if (progress) bar.incr();
		task.incr();

		await emptyDatabase();

		if (progress) bar.incr();
		task.incr();
		// Inserting data in a transaction

		profile('Copy1');
		await copyFromData('kara', sqlInsertKaras);
		if (sqlInsertTags.length > 0) await copyFromData('tag', sqlInsertTags);
		profile('Copy1');
		if (progress) bar.incr();
		task.incr();

		profile('Copy2');
		if (sqlInsertKarasTags.length > 0) await copyFromData('kara_tag', sqlInsertKarasTags);
		profile('Copy2');
		if (progress) bar.incr();
		task.incr();

		await refreshAll();
		if (progress) bar.incr();
		task.incr();

		await saveSetting('lastGeneration', new Date().toString());
		if (progress) {
			bar.incr();
			bar.stop();
		}
		task.incr();
		task.end();
		emitWS('statsRefresh');
		if (error) throw 'Error during generation. Find out why in the messages above.';
		logger.info('[Gen] Database generation completed successfully!');
		return;
	} catch (err) {
		logger.error(`[Gen] Generation error: ${err}`);
		throw err;
	} finally {
		emit('databaseBusy',false);
	}
}

