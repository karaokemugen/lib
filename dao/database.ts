import deburr from 'lodash.deburr';
import logger, { profile } from '../utils/logger';
import {getConfig} from '../utils/config';
import {from as copyFrom} from 'pg-copy-streams';
import {Settings, Query, WhereClause, DatabaseTask} from '../types/database';
import {Pool} from 'pg';
import {refreshYears, refreshKaras} from './kara';
import {refreshTags, refreshKaraTags} from './tag';
import { ModeParam } from '../types/kara';
import Queue from 'better-queue';
import pCancelable from 'p-cancelable';
import {on, emit} from '../utils/pubsub';

const sql = require('./sql/database');

let q: any;

initQueue();

export function newDBTask(input: DatabaseTask) {
	q.push(input);
}

export async function databaseReady() {
	return new Promise(resolve => {
		on('databaseQueueDrained', () => {
			resolve();
		}).setMaxListeners(30);
	});
}

function databaseTask(input: DatabaseTask, done: any) {
	logger.debug(`[DB] Processing task : ${input.name}`);
	if (!input.args) input.args = [];
	const p = new pCancelable((resolve, reject, onCancel) => {
		onCancel.shouldReject = false;
		input.func(...input.args)
			.then(() => resolve())
			.catch((err: Error) => reject(err));
	});
	Promise.all([p])
		.then(() => done())
		.catch((err: Error) => {
			console.log(input);
			done(err);
		});
	return {
		cancel: p.cancel()
	};
}

function initQueue() {
	q = new Queue(databaseTask, {
		id: 'name',
		cancelIfRunning: true
	});
	q.on('task_failed', (taskId: string, err: any) => {
		logger.error(`[DB] Task ${taskId} failed : ${err}`);
	});
	q.on('drain', () => {
		emit('databaseQueueDrained');
	});
}



let debug = false;
/** This function takes a search filter (list of words), cleans and maps them for use in SQL queries "LIKE". */
export function paramWords(filter: string): {} {
	let params = {};
	const words = deburr(filter)
		.toLowerCase()
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
async function queryPatched(...args: any[]) {
	const sql = `[SQL] ${JSON.stringify(args).replace(/\\n/g,'\n').replace(/\\t/g,'   ')}`;
	if (debug) logger.debug(sql);
	try {
		const res = await database.query_orig(...args);
		return res;
	} catch(err) {
		if (!debug) logger.error(sql);
		logger.error(`[DB] Query error: ${err}`);
		throw (`Query ${err}`);
	}
}

/** Returns a query-type object with added WHERE clauses for words you're searching for */
export function buildClauses(words: string, playlist?: boolean): WhereClause {
	const params = paramWords(words);
	let sql = [];
	for (const word of Object.keys(params)) {
		let queryString = `ak.tags_aliases_searchable LIKE :${word} OR
		ak.tags_i18n_searchable LIKE :${word} OR
		ak.tags_searchable LIKE :${word} OR
		lower(unaccent(ak.title)) LIKE :${word}`;

		if (playlist) queryString = `${queryString} OR lower(unaccent(pc.nickname)) LIKE :${word}`;
		sql.push(queryString);
	}
	return {
		sql: sql,
		params: params
	};
}

/** Fake query function used as a decoy when closing DB. */
async function query() {
	return {rows: [{}]};
}

/** Fake connect function used as a decoy when closing DB. */
async function connect() {
	return;
}

/** Closes database object */
export async function closeDB() {
	if (database?.end) await database.end();
	database = {
		query: query,
		connect: connect
	};
}

export async function copyFromData(table: string, data: string[][]) {
	let client: any;
	try {
		client = await database.connect();
	} catch(err) {
		logger.error(`[CopyFrom] Error connecting to database: ${err}`);
	}
	let stream: any;
	try {
		stream = client.query(copyFrom(`COPY ${table} FROM STDIN DELIMITER '|' NULL ''`));
	} catch(err) {
		logger.error(`[CopyFrom] Error creating stream: ${err}`);
	}
	const copyData = data.map(d => d.join('|')).join('\n');
	stream.write(copyData);
	stream.end();
	return new Promise((resolve, reject) => {
		stream.on('finish', () => {
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
		//we're going to monkey-patch the query function.
		client.query_orig = client.query;
		client.query = queryPatched;
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
	try {
		database = new Pool(dbConfig);
		database.on('error', errorFunction);
		if (opts.log) debug = true;
		// Let's monkeypatch the query function
		database.query_orig = database.query;
		database.query = queryPatched;
		//Test connection
		const client = await database.connect();
		await client.release();
	} catch(err) {
		logger.error(`[DB] Connection to database server failed : ${err}`);
		logger.error('[DB] Make sure your database settings are correct and the correct user/database/passwords are set. Check https://lab.shelter.moe/karaokemugen/karaokemugen-app#database-setup for more information on how to setup your PostgreSQL database');
		throw err;
	}
}

export async function getInstanceID(): Promise<string> {
	const settings = await getSettings();
	return settings.instanceID;
}

export async function setInstanceID(id: string) {
	return await saveSetting('instanceID', id);
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

export function buildTypeClauses(mode: ModeParam, value: any): string {
	if (mode === 'search') {
		let search = '';
		const criterias = value.split('!');
		for (const c of criterias) {
			// Splitting only after the first ":"
			let [type, values] = c.split(/:(.+)/);
			if (type === 'r') {
				search = `${search} AND repository = '${values}'`;
			} else if (type === 't') {
    			values = values.split(',').map((v: string) => v);
    			search = `${search} AND ak.tid ?& ARRAY ${JSON.stringify(values).replace(/\"/g,'\'')}`;
			} else if (type === 'y') search = `${search} AND year IN (${values})`;
		}
		return search;
	}
	if (mode === 'kid') return ` AND kid = '${value}'`;
	return '';
}

export async function refreshAll() {
	profile('Refresh');
	refreshKaraTags();
	refreshKaras();
	refreshYears();
	refreshTags();
	await databaseReady();

	profile('Refresh');
}

export async function vacuum() {
	profile('VacuumAnalyze');
	await db().query('VACUUM ANALYZE');
	profile('VacuumAnalyze');
}