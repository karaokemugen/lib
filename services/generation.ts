import logger, { profile } from '../utils/logger';
import {basename} from 'path';
import {extractAllFiles} from '../utils/files';
import {getDataFromKaraFile, verifyKaraData, writeKara, parseKara} from '../dao/karafile';
import {tagTypes} from '../utils/constants';
import {Kara, KaraFileV4} from '../types/kara';
import parallel from 'async-await-parallel';
import {getDataFromSeriesFile} from '../dao/seriesfile';
import {copyFromData, refreshAll, db, saveSetting} from '../dao/database';
import Bar from '../utils/bar';
import Task from '../utils/taskManager';
import {emit} from '../utils/pubsub';
import { Series } from '../types/series';
import { getDataFromTagFile } from '../dao/tagfile';
import { Tag } from '../types/tag';
import { getState } from '../../utils/state';
import { emitWS } from '../utils/ws';

type SeriesMap = Map<string, string[]>
// Tag map : one tag, an array of KID, tagtype
type TagMap = Map<string, string[][]>

interface Maps {
	series: SeriesMap,
	tags: TagMap
}

let error = false;
let generating = false;
let bar: Bar;
let task: Task;
let progress = false;
let karaModified = false;

async function emptyDatabase() {
	await db().query(`
	BEGIN;
	TRUNCATE kara_tag CASCADE;
	TRUNCATE kara_serie CASCADE;
	TRUNCATE tag CASCADE;
	TRUNCATE serie CASCADE;
	TRUNCATE serie_lang RESTART IDENTITY CASCADE;
	TRUNCATE kara CASCADE;
	COMMIT;
	`);
}

export async function readAllSeries(seriesFiles: string[]): Promise<Series[]> {
	const seriesPromises = [];
	for (const seriesFile of seriesFiles) {
		seriesPromises.push(() => processSerieFile(seriesFile));
	}
	const seriesData = await parallel(seriesPromises, 32);
	return seriesData;
}

export async function readAllTags(tagFiles: string[]): Promise<Tag[]> {
	const tagPromises = [];
	for (const tagFile of tagFiles) {
		tagPromises.push(() => processTagFile(tagFile));
	}
	const tags = await parallel(tagPromises, 32);
	if (tags.some((tag: Tag) => tag.error)) {
		error = true;
	}
	return tags.filter((tag: Tag) => !tag.error);
}

async function processSerieFile(seriesFile: string): Promise<Series> {
	const data = await getDataFromSeriesFile(seriesFile);
	data.seriefile = basename(seriesFile);
	if (progress) bar.incr();
	task.incr();
	return data;
}

async function processTagFile(tagFile: string): Promise<Tag> {
	const data = await getDataFromTagFile(tagFile);
	data.tagfile = basename(tagFile);
	if (progress) bar.incr();
	task.incr();
	return data;
}

export async function readAllKaras(karafiles: string[]): Promise<Kara[]> {
	const karaPromises = [];
	for (const karafile of karafiles) {
		karaPromises.push(() => readAndCompleteKarafile(karafile));
	}
	const karas = await parallel(karaPromises, 32);
	if (karas.some((kara: Kara) => kara.error)) error = true;
	return karas.filter((kara: Kara) => !kara.error);
}

async function readAndCompleteKarafile(karafile: string): Promise<Kara> {
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
	if (karaData.isKaraModified) {
		await writeKara(karafile, karaData);
		karaModified = true;
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
		kara.order || null,
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
	let searchKaras = [];
	let errors = [];
	for (const kara of karas) {
		// Find out if our kara exists in our list, if not push it.
		const search = searchKaras.find(k => k.kid === kara.kid);
		if (search) {
			// One KID is duplicated, we're going to throw an error.
			errors.push({
				kid: kara.kid,
				kara1: kara.karafile,
				kara2: search.karafile
			});
			// Remove that kid from the main list
			karas = karas.filter((kara, i, self) => i === self.findIndex(k => (k.kid === kara.kid)));
		} else {
			searchKaras.push({ kid: kara.kid, karafile: kara.karafile });
		}
	}
	if (errors.length > 0) {
		const err = `One or several KIDs are duplicated in your database : ${JSON.stringify(errors)}. Please fix this by removing the duplicated karaoke(s) and retry generating your database.`;
		logger.warn(`[Gen] Found ${errors.length} duplicated karas in your repositories`);
		logger.debug(`[Gen] ${err}`);
		if (getState().opt.strict) throw err;
	}
	return karas;
}

function checkDuplicateSIDs(series: Series[]): Series[] {
	let searchSeries = [];
	let errors = [];
	for (const serie of series) {
		// Find out if our kara exists in our list, if not push it.
		const search = searchSeries.find(s => s.sid === serie.sid);
		if (search) {
			// One SID is duplicated, we're going to throw an error.
			errors.push({
				sid: serie.sid,
				serie1: serie.seriefile,
				serie2: search.seriefile
			});
			// Remove that sid from the main list
			series = series.filter((series, i, self) => i === self.findIndex(s => (s.sid === series.sid)));
		}
		searchSeries.push({ sid: serie.sid, seriefile: serie.seriefile });
	}
	if (errors.length > 0) {
		const err = `One or several SIDs are duplicated in your database : ${JSON.stringify(errors)}. Please fix this by removing the duplicated serie(s) and retry generating your database.`;
		logger.debug(`[Gen] ${err}`);
		logger.warn(`[Gen] Found ${errors.length} duplicated series in your repositories`);
		if (getState().opt.strict) throw err;
	}
	return series;
}

function checkDuplicateTIDs(tags: Tag[]): Tag[] {
	let searchTags = [];
	let errors = [];
	for (const tag of tags) {
		// Find out if our kara exists in our list, if not push it.
		const search = searchTags.find(t => t.tid === tag.tid);
		if (search) {
			// One TID is duplicated, we're going to throw an error.
			errors.push({
				tid: tag.tid,
				tag1: tag.tagfile,
				tag2: search.tagfile
			});
			// Remove that tid from the main list
			tags = tags.filter((tag, i, self) => i === self.findIndex(t => (t.tid === tag.tid)));
		}
		searchTags.push({ tid: tag.tid, tagfile: tag.tagfile });
	}
	if (errors.length > 0) {
		const err = `One or several TIDs are duplicated in your database : ${JSON.stringify(errors)}. Please fix this by removing the duplicated tags(s) and retry generating your database.`;
		logger.debug(`[Gen] ${err}`);
		logger.warn(`[Gen] Found ${errors.length} duplicated tags in your repositories`);
		if (getState().opt.strict) throw err;
	}
	return tags;
}


function prepareSerieInsertData(data: Series): string[] {

	if (data.aliases) data.aliases.forEach((d,i) => {
		data.aliases[i] = d.replace(/"/g,'\\"');
	});
	return [
		data.sid,
		data.name,
		JSON.stringify(data.aliases || []),
		data.seriefile,
		data.repository
	];
}

function prepareAllSeriesInsertData(mapSeries: SeriesMap, seriesData: Series[]): string[][] {
	const data = [];
	for (const serie of mapSeries) {
		const serieData = seriesData.find(e => e.sid === serie[0]);
		data.push(prepareSerieInsertData(serieData));
	}
	return data;
}

/**
 * Warning : we iterate on keys and not on map entries to get the right order and thus the same indexes as the function prepareAllSeriesInsertData. This is the historical way of doing it and should be improved sometimes.
 */
function prepareAllKarasSeriesInsertData(mapSeries: any): string[][] {
	const data = [];
	for (const serie of mapSeries) {
		for (const kid of serie[1]) {
			data.push([
				serie[0],
				kid
			]);
		}
	}
	return data;
}

function prepareAltSeriesInsertData(seriesData: Series[]): string[][] {
	const i18nData = [];
	let index = 0;
	for (const serie of seriesData) {
		if (serie.i18n) {
			for (const lang of Object.keys(serie.i18n)) {
				index++;
				i18nData.push([
					index,
					serie.sid,
					lang,
					serie.i18n[lang]
				]);
			}
		}
	}
	return i18nData;
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
		data.repository
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

function buildDataMaps(karas: Kara[], series: Series[], tags: Tag[]): Maps {
	const tagMap = new Map();
	const seriesMap = new Map();
	tags.forEach(t => {
		tagMap.set(t.tid, []);
		if (progress) bar.incr();
	});
	task.incr();
	series.forEach(s => {
		seriesMap.set(s.sid, []);
		if (progress) bar.incr();
	});
	task.incr();
	karas.forEach(kara => {
		for (const tagType of Object.keys(tagTypes)) {
			if (kara[tagType] && kara[tagType].length > 0) {
				for (const tag of kara[tagType])	 {
					const tagData = tagMap.get(tag.tid);
					if (tagData) {
						tagData.push([kara.kid, tagTypes[tagType]]);
						tagMap.set(tag.tid, tagData);
					} else {
						kara.error = true;
						logger.error(`[Gen] Tag ${tag.tid} was not found in your tag.json files (Kara file : ${kara.karafile})`);
					}
				}
			}
		}
		if (kara.sids.length > 0) {
			for (const sid of kara.sids) {
				const seriesData = seriesMap.get(sid);
				if (seriesData) {
					seriesData.push(kara.kid);
					seriesMap.set(sid, seriesData);
				} else {
					kara.error = true;
					logger.error(`[Gen] Series ${sid} was not found in your series.json files (Kara file : ${kara.karafile})`);
				}
			}
		}
		if (progress) bar.incr();
	});
	task.incr();
	if (karas.some((kara: Kara) => kara.error)) error = true;
	return {
		tags: tagMap,
		series: seriesMap
	};
}

export async function generateDatabase(validateOnly: boolean = false, progressBar?: boolean): Promise<boolean> {
	try {
		emit('databaseBusy',true);
		if (generating) throw 'A database generation is already in progress';
		generating = true;
		error = false;
		progress = progressBar;
		logger.info('[Gen] Starting database generation');
		profile('ProcessFiles');
		const [karaFiles, seriesFiles, tagFiles] = await Promise.all([
			extractAllFiles('Karas'),
			extractAllFiles('Series'),
			extractAllFiles('Tags'),
		]);
		const allFiles = karaFiles.length + seriesFiles.length + tagFiles.length;
		logger.debug(`[Gen] Number of karas found : ${karaFiles.length}`);
		if (karaFiles.length === 0) {
			// Returning early if no kara is found
			logger.warn('[Gen] No kara files found, ending generation');
			await emptyDatabase();
			await refreshAll();
			return;
		}
		if (tagFiles.length === 0) throw 'No tag files found';
		if (seriesFiles.length === 0) throw 'No series files found';

		if (progress) bar = new Bar({
			message: 'Reading data         ',
		}, allFiles);
		task = new Task({
			text: 'GENERATING',
			subtext: 'GENERATING_READING',
			value: 0,
			total: allFiles + 3
		});
		let tags = await readAllTags(tagFiles);
		let karas = await readAllKaras(karaFiles);
		let series = await readAllSeries(seriesFiles);

		logger.debug(`[Gen] Number of karas read : ${karas.length}`);

		try {
			series = checkDuplicateSIDs(series);
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

		const maps = buildDataMaps(karas, series, tags);

		if (error) throw 'Error during generation. Find out why in the messages above.';

		if (validateOnly) return true;

		// Preparing data to insert
		profile('ProcessFiles');
		logger.info('[Gen] Data files processed, creating database');
		if (progress) bar = new Bar({
			message: 'Generating database  '
		}, 12);
		task.update({
			subtext: 'GENERATING_DATABASE',
			value: 0,
			total: 12
		})
		const sqlInsertKaras = prepareAllKarasInsertData(karas);
		if (progress) bar.incr();
		task.incr();

		const sqlInsertSeries = prepareAllSeriesInsertData(maps.series, series);
		if (progress) bar.incr();
		task.incr();

		const sqlInsertKarasSeries = prepareAllKarasSeriesInsertData(maps.series);
		if (progress) bar.incr();
		task.incr();

		const sqlSeriesi18nData = prepareAltSeriesInsertData(series);
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
		await copyFromData('serie', sqlInsertSeries);
		await copyFromData('tag', sqlInsertTags);
		profile('Copy1');
		if (progress) bar.incr();
		task.incr();

		profile('Copy2');
		await copyFromData('serie_lang', sqlSeriesi18nData);
		await copyFromData('kara_tag', sqlInsertKarasTags);
		await copyFromData('kara_serie', sqlInsertKarasSeries);
		profile('Copy2');
		if (progress) bar.incr();
		task.incr();

		// Resetting pk_id_series to its max value. COPY FROM does not do this for us so we do it here
		await db().query('SELECT SETVAL(\'serie_lang_pk_id_serie_lang_seq\',(SELECT MAX(pk_id_serie_lang) FROM serie_lang))');
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
		return karaModified;
	} catch (err) {
		logger.error(`[Gen] Generation error: ${err}`);
		throw err;
	} finally {
		emit('databaseBusy',false);
		generating = false;
	}
}

