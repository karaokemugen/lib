import logger from '../utils/logger';
import {basename} from 'path';
import {asyncReadDirFilter} from '../utils/files';
import {resolvedPathSeries, resolvedPathKaras, resolvedPathTags} from '../utils/config';
import {getDataFromKaraFile, verifyKaraData, writeKara, parseKara} from '../dao/karafile';
import {tagTypes} from '../utils/constants';
import {Kara, KaraFileV4} from '../types/kara';
import parallel from 'async-await-parallel';
import {getDataFromSeriesFile} from '../dao/seriesfile';
import {copyFromData, refreshAll, db, saveSetting} from '../dao/database';
import Bar from '../utils/bar';
import {emit} from '../utils/pubsub';
import { Series } from '../types/series';
import { getDataFromTagFile } from '../dao/tagfile';
import { Tag } from '../types/tag';

type SeriesMap = Map<string, string[]>
// Tag map : one tag, an array of KID, tagtype
type TagMap = Map<string, string[][]>

interface SeriesInsertData {
	data: Series[],
	map: any
}

interface TagInsertData {
	data: Tag[],
	map: any
}

let error = false;
let generating = false;
let bar: any;
let progress = false;

async function emptyDatabase() {
	await db().query(`
	BEGIN;
	TRUNCATE kara_tag CASCADE;
	TRUNCATE kara_serie CASCADE;
	TRUNCATE tag CASCADE;
	TRUNCATE tag_lang
	TRUNCATE serie CASCADE;
	TRUNCATE serie_lang RESTART IDENTITY CASCADE;
	TRUNCATE kara CASCADE;
	TRUNCATE repo CASCADE;
	COMMIT;
	`);
}

export async function extractAllKaraFiles(): Promise<string[]> {
	let karaFiles = [];
	for (const resolvedPath of resolvedPathKaras()) {
		karaFiles = karaFiles.concat(await asyncReadDirFilter(resolvedPath, '.kara.json'));
	}
	return karaFiles;
}

export async function extractAllSeriesFiles(): Promise<string[]> {
	let seriesFiles = [];
	for (const resolvedPath of resolvedPathSeries()) {
		seriesFiles = seriesFiles.concat(await asyncReadDirFilter(resolvedPath, '.series.json'));
	}
	return seriesFiles;
}

export async function extractAllTagFiles(): Promise<string[]> {
	let tagFiles = [];
	for (const resolvedPath of resolvedPathTags()) {
		tagFiles = tagFiles.concat(await asyncReadDirFilter(resolvedPath, '.tag.json'));
	}
	return tagFiles;
}

export async function readAllSeries(seriesFiles: string[]): Promise<SeriesInsertData> {
	const seriesPromises = [];
	const seriesMap = new Map();
	for (const seriesFile of seriesFiles) {
		seriesPromises.push(() => processSerieFile(seriesFile, seriesMap));
	}
	const seriesData = await parallel(seriesPromises, 32);
	return { data: seriesData, map: seriesMap };
}

export async function readAllTags(tagFiles: string[]): Promise<TagInsertData> {
	const tagPromises = [];
	const tagMap = new Map();
	for (const tagFile of tagFiles) {
		tagPromises.push(() => processTagFile(tagFile, tagMap));
	}
	const tagsData = await parallel(tagPromises, 32);
	return { data: tagsData, map: tagMap };
}

async function processSerieFile(seriesFile: string, map: Map<string, string[]>): Promise<Series> {
	const data = await getDataFromSeriesFile(seriesFile);
	data.seriefile = basename(seriesFile);
	map.set(data.sid, []);
	if (progress) bar.incr();
	return data;
}

async function processTagFile(tagFile: string, map: TagMap): Promise<Tag> {
	const data = await getDataFromTagFile(tagFile);
	data.tagfile = basename(tagFile);
	map.set(data.tid, [[]]);
	if (progress) bar.incr();
	return data;
}

export async function readAllKaras(karafiles: string[], seriesMap: SeriesMap, tagMap: TagMap): Promise<Kara[]> {
	const karaPromises = [];
	for (const karafile of karafiles) {
		karaPromises.push(() => readAndCompleteKarafile(karafile, seriesMap, tagMap));
	}
	const karas = await parallel(karaPromises, 32);
	if (karas.some((kara: Kara) => kara.error)) error = true;
	return karas.filter((kara: Kara) => !kara.error);
}

async function readAndCompleteKarafile(karafile: string, seriesMap: SeriesMap, tagMap: TagMap): Promise<Kara> {
	let karaData: Kara = {}
	const karaFileData: KaraFileV4 = await parseKara(karafile);
	try {
		verifyKaraData(karaFileData);
		karaData = await getDataFromKaraFile(karafile, karaFileData);
	} catch (err) {
		logger.warn(`[Gen] Kara file ${karafile} is invalid/incomplete : ${err}`);
		karaData.error = true;
		return karaData;
	}
	for (const tagType of Object.keys(tagTypes)) {
		if (karaData[tagType].length > 0) {
			for (const tid of karaData[tagType])	 {
				const tagData = tagMap.get(tid);
				if (tagData) {
					tagData.push([karaData.kid, tagTypes[tagType]]);
					tagMap.set(tid, tagData)
				} else {
					karaData.error = true;
					logger.error(`[Gen] Tag ${tid} was not found in your tag.json files (Kara file : ${karafile})`);
				}
			}
		} else {
			karaData[tagType] = ['00000000-0000-0000-0000-000000000000']
		}
	}
	if (karaData.sids.length > 0) {
		for (const sid of karaData.sids) {
			const seriesData = seriesMap.get(sid);
			if (seriesData) {
				seriesData.push(karaData.kid);
				seriesMap.set(sid, seriesData);
			} else {
				karaData.error = true;
				logger.error(`[Gen] Series ${sid} was not found in your series.json files (Kara file : ${karafile})`);
			}
		}
	}
	await writeKara(karafile, karaData);
	if (progress) bar.incr();
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
		kara.dateadded.toISOString(),
		kara.datemodif.toISOString(),
		kara.repo
	];
}

function prepareAllKarasInsertData(karas: Kara[]): any[] {
	return karas.map(kara => prepareKaraInsertData(kara));
}

function checkDuplicateKIDs(karas: Kara[]) {
	let searchKaras = [];
	let errors = [];
	for (const kara of karas) {
		// Find out if our kara exists in our list, if not push it.
		const search = searchKaras.find(k => {
			return k.kid === kara.kid;
		});
		if (search) {
			// One KID is duplicated, we're going to throw an error.
			errors.push({
				kid: kara.kid,
				kara1: kara.karafile,
				kara2: search.karafile
			});
		}
		searchKaras.push({ kid: kara.kid, karafile: kara.karafile });
	}
	if (errors.length > 0) throw `One or several KIDs are duplicated in your database : ${JSON.stringify(errors,null,2)}. Please fix this by removing the duplicated karaoke(s) and retry generating your database.`;
}

function checkDuplicateSIDs(series: Series[]) {
	let searchSeries = [];
	let errors = [];
	for (const serie of series) {
		// Find out if our kara exists in our list, if not push it.
		const search = searchSeries.find(s => {
			return s.sid === serie.sid;
		});
		if (search) {
			// One SID is duplicated, we're going to throw an error.
			errors.push({
				sid: serie.sid,
				serie1: serie.seriefile,
				serie2: search.seriefile
			});
		}
		searchSeries.push({ sid: serie.sid, karafile: serie.seriefile });
	}
	if (errors.length > 0) throw `One or several SIDs are duplicated in your database : ${JSON.stringify(errors,null,2)}. Please fix this by removing the duplicated serie(s) and retry generating your database.`;
}

function checkDuplicateTIDs(tags: Tag[]) {
	let searchTags = [];
	let errors = [];
	for (const tag of tags) {
		// Find out if our kara exists in our list, if not push it.
		const search = searchTags.find(t => {
			return t.tid === tag.tid;
		});
		if (search) {
			// One TID is duplicated, we're going to throw an error.
			errors.push({
				tid: tag.tid,
				tag1: tag.tagfile,
				tag2: search.tagfile
			});
		}
		searchTags.push({ tid: tag.tid, tagfile: tag.tagfile });
	}
	if (errors.length > 0) throw `One or several TIDs are duplicated in your database : ${JSON.stringify(errors,null,2)}. Please fix this by removing the duplicated tag(s) and retry generating your database.`;
}


function prepareSerieInsertData(data: Series): string[] {

	if (data.aliases) data.aliases.forEach((d,i) => {
		data.aliases[i] = d.replace(/"/g,'\\"');
	});
	return [
		data.sid,
		data.name,
		JSON.stringify(data.aliases || []),
		data.seriefile
	];
}

function prepareAllSeriesInsertData(mapSeries: any, seriesData: Series[]): string[][] {
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

async function prepareAltSeriesInsertData(seriesData: Series[]): Promise<string[][]> {
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

	return [
		data.name,
		JSON.stringify(data.i18n || {}),
		data.tid,
		data.short || null,
		JSON.stringify(data.aliases || []),
		JSON.stringify(data.types.map(type => tagTypes[type])),
		data.tagfile
	];
}


function prepareAllKarasTagInsertData(mapTags: TagMap): string[][] {
	const data = [];
	for (const tag of mapTags) {
		for (const kidType of tag[1]) {
			data.push([
				tag[0],
				kidType[0],
				kidType[1]
			]);
		}
	}
	return data;
}

export async function generateDatabase(validateOnly: boolean = false, progressBar?: boolean) {
	try {
		emit('databaseBusy',true);
		if (generating) throw 'A database generation is already in progress';
		generating = true;
		error = false;
		progress = progressBar;
		logger.info('[Gen] Starting database generation');
		const karaFiles = await extractAllKaraFiles();
		const seriesFiles = await extractAllSeriesFiles();
		const tagFiles = await extractAllTagFiles();
		logger.debug(`[Gen] Number of karas found : ${karaFiles.length}`);
		if (karaFiles.length === 0) {
			// Returning early if no kara is found
			logger.warn('[Gen] No kara files found, ending generation');
			await emptyDatabase();
			await refreshAll();
			return;
		}
		if (tagFiles.length === 0) throw 'No tag files found';
		if (progress) bar = new Bar({
			message: 'Reading tag data     ',
			event: 'generationProgress'
		}, tagFiles.length);
		const tags = await readAllTags(tagFiles);
		checkDuplicateTIDs(tags.data);
		if (progress) bar.stop();

		if (seriesFiles.length === 0) throw 'No series files found';
		if (progress) bar = new Bar({
			message: 'Reading series data  ',
			event: 'generationProgress'
		}, seriesFiles.length);
		const series = await readAllSeries(seriesFiles);
		checkDuplicateSIDs(series.data);
		if (progress) bar.stop();

		if (progress) bar = new Bar({
			message: 'Reading kara data    ',
			event: 'generationProgress'
		}, karaFiles.length + 1);
		const karas = await readAllKaras(karaFiles, series.map, tags.map);
		logger.debug(`[Gen] Number of karas read : ${karas.length}`);
		// Check if we don't have two identical KIDs
		checkDuplicateKIDs(karas);
		if (progress) bar.incr();
		if (progress) bar.stop();
		if (error) throw 'Error during generation. Find out why in the messages above.';
		if (validateOnly) {
			return true;
		}
		// Preparing data to insert
		logger.info('[Gen] Data files processed, creating database');
		if (progress) bar = new Bar({
			message: 'Generating database  ',
			event: 'generationProgress'
		}, 13);
		const sqlInsertKaras = prepareAllKarasInsertData(karas);
		if (progress) bar.incr();
		const sqlInsertSeries = prepareAllSeriesInsertData(series.map, series.data);
		if (progress) bar.incr();
		const sqlInsertKarasSeries = prepareAllKarasSeriesInsertData(series.map);
		if (progress) bar.incr();
		const sqlSeriesi18nData = await prepareAltSeriesInsertData(series.data);
		if (progress) bar.incr();
		if (progress) bar.incr();
		const sqlInsertTags = prepareAllTagsInsertData(tags.map, tags.data);
		if (progress) bar.incr();
		const sqlInsertKarasTags = prepareAllKarasTagInsertData(tags.map);
		if (progress) bar.incr();
		await emptyDatabase();
		if (progress) bar.incr();
		// Inserting data in a transaction
		await Promise.all([
			copyFromData('kara', sqlInsertKaras),
			copyFromData('serie', sqlInsertSeries),
			copyFromData('tag', sqlInsertTags)
		]);
		if (progress) bar.incr();
		await Promise.all([
			copyFromData('serie_lang', sqlSeriesi18nData),
			copyFromData('kara_tag', sqlInsertKarasTags),
			copyFromData('kara_serie', sqlInsertKarasSeries)
		]);
		if (progress) bar.incr();
		// Adding the kara.moe repository. For now it's the only one available, we'll add everything to manage multiple repos later.
		await db().query('INSERT INTO repo VALUES(\'kara.moe\')');
		if (progress) bar.incr();
		// Setting the pk_id_tag sequence to allow further edits during runtime
		await db().query('SELECT SETVAL(\'tag_pk_id_tag_seq\',(SELECT MAX(pk_id_tag) FROM tag))');
		await db().query('SELECT SETVAL(\'serie_lang_pk_id_serie_lang_seq\',(SELECT MAX(pk_id_serie_lang) FROM serie_lang))');
		if (progress) bar.incr();
		await refreshAll();
		if (progress) bar.incr();
		await db().query('VACUUM ANALYZE;');
		if (progress) bar.incr();
		await saveSetting('lastGeneration', new Date().toString());
		if (progress) bar.incr();
		if (progress) bar.stop();
		if (error) throw 'Error during generation. Find out why in the messages above.';
	} catch (err) {
		logger.error(`[Gen] Generation error: ${err}`);
		throw err;
	} finally {
		emit('databaseBusy',false);
		generating = false;
	}
}

