import deburr from 'lodash.deburr';
import logger, { profile } from '../utils/logger';
import {where as whereLangs} from 'langs';
import {getConfig} from '../utils/config';
import {getState} from '../../utils/state';
import {from as copyFrom} from 'pg-copy-streams';
import {Settings, Query, LangClause, WhereClause} from '../types/database';
import {Pool} from 'pg';
import {refreshYears, refreshKaras} from './kara';
import {refreshTags, refreshKaraTags} from './tag';
import {refreshKaraSeriesLang, refreshSeries, refreshKaraSeries} from './series';

const sql = require('./sql/database');

/** This function takes a search filter (list of words), cleans and maps them for use in SQL queries "LIKE". */
export function paramWords(filter: string): {} {
	let params = {};
	const words = deburr(filter)
		.toLowerCase()
		.replace('\'', ' ')
		.replace(',', ' ')
		.match(/("[^"]*"|[^" ]+)/gm)
		.filter((s: string) => !('' === s))
		.map((word: string) => `%${word}%`);
	for (const i in words) {
		// Let's remove "" around at the beginning and end of words
		params[`word${i}`] = `${words[i]}`.replace(/\"/g,'');
	}
	return params;
}

/** Replaces query() of database object to log queries */
async function queryLog(...args: any[]) {
	logger.debug(`[SQL] ${JSON.stringify(args).replace(/\\n/g,'\n').replace(/\\t/g,'   ')}`);
	return database.query_orig(...args);
}

/** Returns a query-type object with added WHERE clauses for words you're searching for */
export function buildClauses(words: string, playlist?: boolean): WhereClause {
	const params = paramWords(words);
	let sql = [];
	for (const word of Object.keys(params)) {
		let queryString = `lower(unaccent(ak.tag_aliases::varchar)) LIKE :${word} OR
		lower(unaccent(ak.tag_names)) LIKE :${word} OR
		lower(unaccent(ak.tags::varchar)) LIKE :${word} OR
		lower(unaccent(ak.title)) LIKE :${word} OR
		lower(unaccent(ak.serie)) LIKE :${word} OR
		lower(unaccent(ak.serie_altname::varchar)) LIKE :${word} OR
		lower(unaccent(ak.serie_names)) LIKE :${word}`;

		if (playlist) queryString = `${queryString} OR lower(unaccent(pc.nickname)) LIKE :${word}`;
		sql.push(queryString);
	}
	return {
		sql: sql,
		params: params
	};
}

/** Returns a lang object with main and fallback ISO639-2B languages depending on user making the query */
export function langSelector(lang: string, userMode?: number, userLangs?: LangClause, series?: boolean): LangClause {
	const conf = getConfig();
	const state = getState();
	const userLocale = whereLangs('1',lang || state.EngineDefaultLocale);
	const engineLocale = whereLangs('1',state.EngineDefaultLocale);
	//Fallback to english for cases other than 0 (original name)
	let mode = +conf.Frontend.SeriesLanguageMode;
	if (userMode > -1) mode = userMode;
	switch(mode) {
	case 0: return {main: null, fallback: null};
	default:
	case 1:
		if (!series) return {main: 'SUBSTRING(ak.languages_sortable, 0, 4)', fallback: '\'eng\''};
		return {main: null, fallback: null};
	case 2: return {main: `'${engineLocale['2B']}'`, fallback: '\'eng\''};
	case 3: return {main: `'${userLocale['2B']}'`, fallback: '\'eng\''};
	case 4: return {main: `'${userLangs.main}'`, fallback: `'${userLangs.fallback}'`};
	}
}

/** Fake query function used as a decoy when closing DB. */
async function query() {
	return {rows: [{}]};
}

/** Closes database object */
export async function closeDB() {
	await database.end();
	database = { query: query};
}

export async function copyFromData(table: string, data: string[][]) {
	const client = await database.connect();
	let stream = client.query(copyFrom(`COPY ${table} FROM STDIN DELIMITER '|' NULL ''`));
	const copyData = data.map(d => d.join('|')).join('\n');
	stream.write(copyData);
	stream.end();
	return new Promise((resolve, reject) => {
		stream.on('end', () => {
			client.release();
			resolve();
		});
		stream.on('error', (err: any) => {
			client.release();
			reject(err);
		});
	});
}

export async function transaction(queries: Query[]) {
	const client = await database.connect();
	try {
		await client.query('BEGIN');
		for (const query of queries) {
			if (query.params) {
				for (const param of query.params) {
					await client.query(query.sql, param);
				}
			} else {
				await client.query(query.sql);
			}
		}
		await client.query('COMMIT');
	} catch (err) {
		logger.error(`[DB] Transaction error : ${err}`);
		await client.query('ROLLBACK');
		throw err;
	} finally {
		await client.release();
	}
}

/* Opened DB is exposed to be used by DAO objects. */

export let database: any;

export function db() {
	return database;
}

export async function connectDB(opts = {superuser: false, db: null, log: false}, errorFunction: Function) {
	const conf = getConfig();
	const dbConfig = {
		host: conf.Database.prod.host,
		user: conf.Database.prod.user,
		port: conf.Database.prod.port,
		password: conf.Database.prod.password,
		database: conf.Database.prod.database
	};
	if (opts.superuser) {
		dbConfig.user = conf.Database.prod.superuser;
		dbConfig.password = conf.Database.prod.superuserPassword;
		dbConfig.database = opts.db;
	}
	database = new Pool(dbConfig);
	if (opts.log) {
		//If SQL logs are enabled, we're going to monkey-patch the query function.
		database.query_orig = database.query;
		database.query = queryLog;
	}
	try {
		await database.connect();
		database.on('error', errorFunction);
	} catch(err) {
		logger.error(`[DB] Connection to database server failed : ${err}`);
		throw err;
	}
}


export async function getSettings(): Promise<Settings> {
	const res = await db().query(sql.selectSettings);
	const settings = {};
	// Return an object with option: value.
	res.rows.forEach((e: any) => settings[e.option] = e.value);
	return settings;
}

export async function saveSetting(setting: string, value: string) {
	return await db().query(sql.upsertSetting, [setting, value]);
}

export function buildTypeClauses(mode: string, value: any): string {
	if (mode === 'search') {
		let search = '';
		const criterias = value.split('!');
		for (const c of criterias) {
			// Splitting only after the first ":"
			let [type, values] = c.split(/:(.+)/);
			if (type === 's' || type === 't') {
    			values = values.split(',').map((v: string) => v);
    			search = `${search} AND ${type}id ?& ARRAY ${JSON.stringify(values).replace(/\"/g,'\'')}`;
			}
			if (type === 'y') search = `${search} AND year IN (${values})`;
		}
		return search;
	}
	if (mode === 'kid') return ` AND kid = '${value}'`;
	return '';
}

export async function refreshAll() {
	profile('Refresh');
	await refreshKaraSeries();
	await refreshKaraTags();
	await refreshKaras();
	await refreshKaraSeriesLang();
	await refreshSeries();
	await refreshYears();
	await refreshTags();
	profile('Refresh');
}

export async function vacuum() {
	profile('VacuumAnalyze');
	await db().query('VACUUM ANALYZE');
	profile('VacuumAnalyze');
}