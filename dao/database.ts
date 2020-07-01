import Queue from 'better-queue';
import deburr from 'lodash.deburr';
import pCancelable from 'p-cancelable';
import {Client,Pool} from 'pg';
import {from as copyFrom} from 'pg-copy-streams';
import {promisify} from 'util';

import {DatabaseTask,Query, Settings, WhereClause} from '../types/database';
import { ModeParam } from '../types/kara';
import {getConfig} from '../utils/config';
import logger, { profile } from '../utils/logger';
import {emit,on} from '../utils/pubsub';
import {refreshKaras,refreshYears} from './kara';
import {refreshKaraTags,refreshTags} from './tag';

const sleep = promisify(setTimeout);

const sql = require('./sql/database');

let q: any;

initQueue();

export function newDBTask(input: DatabaseTask) {
	q.push(input);
}

export function databaseReady() {
	return new Promise(resolve => {
		on('databaseQueueDrained', () => {
			resolve();
		}).setMaxListeners(30);
	});
}

function databaseTask(input: DatabaseTask, done: any) {
	logger.debug('Processing task', {service: 'DB', obj: input.name});
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
	q.on('task_finish', (taskId: string) => {
		logger.debug(`Task ${taskId} finished`, {service: 'DB'});
	});
	q.on('task_failed', (taskId: string, err: any) => {
		logger.error(`Task ${taskId} failed`, {service: 'DB', obj: err});
	});
	q.on('drain', () => {
		emit('databaseQueueDrained');
	});
}



let debug = false;
/** This function takes a search filter (list of words), cleans and maps them for use in SQL queries "LIKE". */
export function paramWords(filter: string) {
	const params = {};
	const words = deburr(filter)
		.toLowerCase()
		.replace(',', ' ')
		.match(/("[^"]*"|[^" ]+)/gm)
		.filter((s: string) => !('' === s))
		.map((word: string) => `%${word}%`);
	for (const i in words) {
		// Let's remove "" around at the beginning and end of words
		params[`word${i}`] = `${words[i]}`.replace(/"/g,'');
	}
	return params;
}

/** Replaces query() of database object to log queries */
async function queryPatched(...args: any[]) {
	if (debug) logger.debug('', {service: 'DB', obj: args});
	try {
		return await database.query_orig(...args);
	} catch(err) {
		if (!debug) logger.error('', {service: 'DB', obj: args});
		logger.error('Query error', {service: 'DB', obj: err});
		logger.error('1st try, second attempt...', {service: 'DB'});
		try {
			// Waiting betwen 0 and 1 sec before retrying
			await sleep(Math.floor(Math.random() * Math.floor(1000)));
			return await database.query_orig(...args);
		} catch(err) {
			logger.error('Second attempt failed', {service: 'DB', obj: err});
			throw Error(`Query ${err}`);
		}
	}
}

/** Returns a query-type object with added WHERE clauses for words you're searching for */
export function buildClauses(words: string, playlist?: boolean): WhereClause {
	const params = paramWords(words);
	const sql = [];
	for (const word of Object.keys(params)) {
		let queryString = `ak.tags_aliases_searchable LIKE :${word} OR
		ak.tags_i18n_searchable LIKE :${word} OR
		ak.tags_searchable LIKE :${word} OR
		lower(unaccent(ak.title)) LIKE :${word} OR
		lower(unaccent(ak.repository)) LIKE :${word}`;

		if (playlist) queryString = `${queryString} OR lower(unaccent(pc.nickname)) LIKE :${word}`;
		sql.push(queryString);
	}
	return {
		sql: sql,
		params: params
	};
}

/** Fake query function used as a decoy when closing DB. */
function query() {
	return {rows: [{}]};
}

/** Fake connect function used as a decoy when closing DB. */
function connect() {
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
	const conf = getConfig().Database.prod;
	const client = new Client(conf);
	try {
		await client.connect();
	} catch(err) {
		logger.error('Error connecting to database', {service: 'CopyFrom', obj: err});
	}
	let stream: any;
	try {
		stream = client.query(copyFrom(`COPY ${table} FROM STDIN DELIMITER '|' NULL ''`));
	} catch(err) {
		logger.error('Error creating stream', {service: 'CopyFrom', obj: err});
	}
	const copyData = data.map(d => d.join('|')).join('\n');
	if (!stream.write) {
		logger.error('Stream not created properly for some reason', {service: 'CopyFrom'});
		throw Error('stream is not writable!?');
	}
	stream.write(copyData);
	stream.end();
	return new Promise((resolve, reject) => {
		stream.on('finish', () => {
			client.end();
			resolve();
		});
		stream.on('error', (err: any) => {
			client.end();
			reject(err);
		});
	});
}

export async function transaction(querySQLParam: Query) {
	const client = await database.connect();
	const sql = `[SQL] ${JSON.stringify(querySQLParam.sql).replace(/\\n/g,'\n').replace(/\\t/g,'   ')}`;
	if (debug) logger.debug(sql);
	try {
		//we're going to monkey-patch the query function.
		await client.query('BEGIN');
		if (querySQLParam.params) {
			for (const param of querySQLParam.params) {
				await client.query(querySQLParam.sql, param);
			}
		} else {
			await client.query(querySQLParam.sql);
		}
		await client.query('COMMIT');
	} catch (err) {
		if (!debug) logger.error(sql);
		logger.error('Transaction error', {service: 'DB', obj: err});
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

export async function connectDB(errorFunction: any, opts = {superuser: false, db: null, log: false}) {
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
		logger.error('Connection to database server failed', {service: 'DB', obj: err});
		logger.error('Make sure your database settings are correct and the correct user/database/passwords are set. Check https://lab.shelter.moe/karaokemugen/karaokemugen-app#database-setup for more information on how to setup your PostgreSQL database', {service: 'DB'});
		throw err;
	}
}

export async function getInstanceID(): Promise<string> {
	const settings = await getSettings();
	return settings.instanceID;
}

export function setInstanceID(id: string) {
	return saveSetting('instanceID', id);
}

export async function getSettings(): Promise<Settings> {
	const res = await db().query(sql.selectSettings);
	const settings = {};
	// Return an object with option: value.
	res.rows.forEach((e: any) => settings[e.option] = e.value);
	return settings;
}

export function saveSetting(setting: string, value: string) {
	return db().query(sql.upsertSetting, [setting, value]);
}

export function buildTypeClauses(mode: ModeParam, value: any): string {
	if (mode === 'search') {
		let search = '';
		const criterias = value.split('!');
		for (const c of criterias) {
			// Splitting only after the first ":"
			const type = c.split(/:(.+)/)[0];
			let values = c.split(/:(.+)/)[1];
			if (type === 'r') {
				search = `${search} AND repository = '${values}'`;
			} else if (type === 't') {
				values = values.split(',').map((v: string) => v);
				search = `${search} AND ak.tid ?& ARRAY ${JSON.stringify(values).replace(/"/g,'\'')}`;
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
