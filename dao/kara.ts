import logger, { profile } from '../utils/logger';
import { databaseReady, db, newDBTask } from './database';

async function refreshKarasTask() {
	profile('refreshKaras');
	logger.debug('[DB] Refreshing karas view');
	await db().query('REFRESH MATERIALIZED VIEW all_karas');
	profile('refreshKaras');
}

export async function refreshKaras() {
	newDBTask({func: refreshKarasTask, name: 'refreshKaras'});
	await databaseReady();
}

async function refreshYearsTask() {
	profile('refreshYears');
	logger.debug('[DB] Refreshing years view');
	await db().query('REFRESH MATERIALIZED VIEW all_years');
	profile('refreshYears');
}

export async function refreshYears() {
	newDBTask({func: refreshYearsTask, name: 'refreshYears'});
	await databaseReady();
}
