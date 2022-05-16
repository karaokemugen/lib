import { promise as fastq } from 'fastq';
import { deburr } from 'lodash';
import {
	Client,
	Pool,
	PoolConfig,
	QueryConfig,
	QueryResult,
	QueryResultRow,
} from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { setTimeout as sleep } from 'timers/promises';

import { DatabaseTask, Query, Settings, WhereClause } from '../types/database';
import { OrderParam } from '../types/kara';
import { getConfig } from '../utils/config';
import { uuidPlusTypeRegexp, uuidRegexp } from '../utils/constants';
import logger, { profile } from '../utils/logger';
import { emit, once } from '../utils/pubsub';
import {
	refreshKaras,
	refreshParentsSearchVector,
	updateKaraSearchVector,
} from './kara';
import { selectSettings, upsertSetting } from './sql/database';
import { refreshTags, updateTagSearchVector } from './tag';

const service = 'DB';

let debug = false;
const q = fastq(databaseTask, 1);
let databaseBusy = false;

initQueue();

export function newDBTask(input: DatabaseTask) {
	databaseBusy = true;
	q.push(input);
}

/* Opened DB is exposed to be used by DAO objects. */

let database: PoolPatched;

export function db() {
	return database;
}

export function getDBStatus() {
	return databaseBusy;
}

/** We're patching the node-postgres Pool to add debug logs and connection status */
class PoolPatched extends Pool {
	connected: boolean;

	constructor(config: PoolConfig) {
		super(config);
		this.on('connect', () => {
			this.connected = true;
		});
		this.on('error', err => {
			logger.error('A PG client has crashed', { service, obj: err });
		});
	}

	end(): Promise<void> {
		this.connected = false;
		return super.end();
	}

	async query<R extends QueryResultRow = any, I extends any[] = any[]>(
		queryTextOrConfig: string | QueryConfig<I>,
		values?: I
	): Promise<QueryResult<R>> {
		let valuesStr = '';
		let queryStr = '';
		if (typeof queryTextOrConfig === 'string') {
			if (values) valuesStr = `\nValues: ${values.toString()}`;
			queryStr = queryTextOrConfig;
		} else {
			valuesStr = `\nValues: ${queryTextOrConfig.values.toString()}`;
			queryStr = queryTextOrConfig.text;
		}

		if (debug)
			logger.debug(`Query: ${queryStr}${valuesStr}`, { service });
		try {
			return await super.query(queryTextOrConfig, values);
		} catch (err) {
			if (!debug)
				logger.error(`Query: ${queryStr}${valuesStr}`, { service });
			logger.error('Query error', { service, obj: err });
			logger.error('1st try, second attempt...', { service });
			try {
				// Waiting between 0 and 1 sec before retrying
				await sleep(Math.floor(Math.random() * Math.floor(1000)));
				return await super.query(queryTextOrConfig, values);
			} catch (err2) {
				logger.error('Second attempt failed', { service, obj: err2 });
				if (err2.message === 'Cannot use a pool after calling end on the pool')
					return { rows: [{}] } as any;
				throw Error(`Query error: ${err2}`);
			}
		}
	}
}

export function databaseReady() {
	return new Promise<void>(resolve => {
		once('databaseQueueDrained', () => {
			resolve();
		}).setMaxListeners(30);
	});
}

async function databaseTask(input: DatabaseTask) {
	if (!input.args) input.args = [];
	await input.func();
}

function initQueue() {
	q.error((err, task: DatabaseTask) => {
		if (err)
			logger.error(`Task ${task.name} failed`, { service, obj: err });
	});
	q.drain = () => {
		databaseBusy = false;
		emit('databaseQueueDrained');
	};
}

/** This function takes a search filter (list of words), cleans and maps them for use in SQL queries "LIKE". */
export function paramWords(filter: string) {
	const params: string[] = [];
	let words = deburr(filter)
		.toLowerCase()
		.replace(/[']/g, "''")
		.replace(/\\/g, '')
		.match(/-?("[^"]+"|[^" ]+)/gm);
	if (words === null) words = [''];
	words = words.filter((s: string) => s !== '');
	for (let i of words) {
		let negate = false;
		if (/^-\S/.test(i)) {
			i = i.substring(1);
			negate = true;
		}
		if (/^"\S/.test(i)) {
			// Split words and add the following by (<->) marker
			const arr = i
				.substring(1, i.length - 1)
				.split(' ')
				.map(x => `'${x}':*`);
			i = `(${arr.join(' <-> ')})`;
		} else {
			i = `'${i}':*`;
		}
		params.push(`${negate ? '!' : ''}${i}`);
	}
	return params;
}

/** Returns a query-type object with added WHERE clauses for words you're searching for */
export function buildClauses(
	words: string,
	playlist?: boolean,
	parentsOnly?: boolean
): WhereClause {
	const sql = [
		`(ak.search_vector${parentsOnly ? '_parents' : ''} @@ query${
			playlist ? ' OR lower(unaccent(pc.nickname)) @@ query' : ''
		})`,
	];
	return {
		sql,
		params: { tsquery: paramWords(words).join(' & ') },
		additionalFrom: [
			", to_tsquery('public.unaccent_conf', :tsquery) as query",
			// relevance ? ', ts_rank_cd(ak.search_vector, query) as relevance':undefined
		],
	};
}

/** Fake query function used as a decoy when closing DB. */
function query() {
	return { rows: [] };
}

/** Fake connect function used as a decoy when closing DB. */
function connect() {}

/** Closes database object */
export async function closeDB() {
	if (database?.end) await database.end();
	database = {
		query,
		connect,
		connected: false,
	} as unknown as PoolPatched;
}

/** Using COPY FROM to insert batch data into the database quickly */
export async function copyFromData(table: string, data: string[][]) {
	const conf = getConfig();
	const dbConfig = {
		host: conf.System.Database.host,
		user: conf.System.Database.username,
		port: conf.System.Database.port,
		password: conf.System.Database.password,
		database: conf.System.Database.database,
	};
	const client = new Client(dbConfig);
	try {
		await client.connect();
	} catch (err) {
		logger.error('Error connecting to database (copyFrom)', {
			service,
			obj: err,
		});
	}
	let stream: any;
	try {
		stream = client.query(copyFrom(`COPY ${table} FROM STDIN NULL ''`));
	} catch (err) {
		logger.error('Error creating stream', { service, obj: err });
	}
	const copyData = data.map(d => d.join('\t')).join('\n');
	if (!stream.write) {
		logger.error('Stream not created properly for some reason', { service });
		throw Error('stream is not writable!?');
	}
	stream.write(copyData);
	stream.end();
	return new Promise<void>((resolve, reject) => {
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
	let results = [];
	const sql = `[SQL] ${JSON.stringify(querySQLParam.sql)
		.replace(/\\n/g, '\n')
		.replace(/\\t/g, '   ')}`;
	const values = `[SQL] Values: ${JSON.stringify(querySQLParam.params)}`;
	if (debug) logger.debug(sql);
	if (debug) logger.debug(values);
	try {
		// we're going to monkey-patch the query function.
		await client.query('BEGIN');
		if (querySQLParam.params) {
			for (const param of querySQLParam.params) {
				const res = await client.query(querySQLParam.sql, param);
				results = results.concat(res.rows);
			}
		} else {
			const res = await client.query(querySQLParam.sql);
			results = results.concat(res.rows);
		}
		await client.query('COMMIT');
		return results;
	} catch (err) {
		if (!debug) {
			logger.error(sql);
			logger.error(values);
		}
		logger.error('Transaction error', { service, obj: err });
		await client.query('ROLLBACK');
		throw err;
	} finally {
		if (client) client.release();
	}
}

export async function connectDB(
	errorFunction: any,
	opts = { superuser: false, db: null, log: false }
) {
	const conf = getConfig();
	const dbConfig = {
		host: conf.System.Database.host,
		user: conf.System.Database.username,
		port: conf.System.Database.port,
		password: conf.System.Database.password,
		database: conf.System.Database.database,
	};
	if (opts.superuser) {
		dbConfig.user = conf.System.Database.superuser;
		dbConfig.password = conf.System.Database.superuserPassword;
		dbConfig.database = opts.db;
	}
	try {
		database = new PoolPatched(dbConfig);
		database.on('error', errorFunction);
		if (opts.log) debug = true;
		// Test connection
		const client = await database.connect();
		client.release();
	} catch (err) {
		logger.error('Connection to database server failed', {
			service,
			obj: err,
		});
		logger.error(
			'Make sure your database settings are correct and the correct user/database/passwords are set. Check the database setup section in the README for more information on how to setup your PostgreSQL database',
			{ service }
		);
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
	const res = await db().query(selectSettings);
	const settings = {};
	// Return an object with option: value.
	res.rows.forEach((e: any) => (settings[e.option] = e.value));
	return settings;
}

export function saveSetting(setting: string, value: string | null) {
	return db().query(upsertSetting, [setting, value]);
}

/** Build WHERE clauses depending on the q: argument of a karaoke query */
export function buildTypeClauses(value: any, order: OrderParam): WhereClause {
	const sql = [];
	const params: { repo?: string; kids?: string[] } = {};
	const criterias: string[] = value.split('!');
	for (const c of criterias) {
		// Splitting only after the first ":"
		const [type, values] = c.split(/:(.+)/);
		// Validating values
		// Technically searching tags called null or undefined is possible. You never know. Repositories or years however, shouldn't be.
		if (type === 'r') {
			sql.push('k.repository = :repo');
			params.repo = values;
		} else if (type === 'k') {
			const kids = values.split(',').filter(kid => uuidRegexp.test(kid));
			sql.push('k.pk_kid = ANY (:kids)');
			params.kids = kids;
		} else if (type === 'seid') {
			if (!uuidRegexp.test(values)) {
				throw new Error('Invalid seid syntax');
			}
			let searchField = '';
			if (order === 'sessionPlayed') {
				searchField = 'p.fk_seid';
			} else if (order === 'sessionRequested') {
				searchField = 'rq.fk_seid';
			} else {
				throw new Error('Invalid order for seid');
			}
			sql.push(`${searchField} = '${values}'`);
		} else if (type === 't') {
			const tags = values
				.split(',')
				.filter(tid => uuidPlusTypeRegexp.test(tid));
			sql.push(`ak.tid @> ARRAY ${JSON.stringify(tags).replaceAll('"', "'")}`);
		} else if (type === 'y' && +values > 0) {
			sql.push(`ak.year IN (${values})`);
		} else if (
			type === 'm' &&
			['MISSING', 'DOWNLOADING', 'DOWNLOADED'].includes(values)
		) {
			sql.push(`ak.download_status = '${values}'`);
		}
	}
	return {
		sql,
		params,
		additionalFrom: [],
	};
}

export async function refreshAll() {
	profile('Refresh');
	await Promise.all([updateKaraSearchVector(), updateTagSearchVector()]);
	refreshKaras();
	refreshTags();
	refreshParentsSearchVector();
	await databaseReady();
	profile('Refresh');
}

export async function vacuum() {
	profile('VacuumAnalyze');
	await db().query('VACUUM ANALYZE');
	profile('VacuumAnalyze');
}
