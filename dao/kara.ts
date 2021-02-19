import logger, { profile } from '../utils/logger';
import { databaseReady, db, newDBTask } from './database';
import { sqlUpdateKaraSearchVector } from './sql/kara';

export async function refreshKarasTask() {
	profile('refreshKaras');
	logger.debug('Refreshing karas view', {service: 'DB'});
	await db().query('REFRESH MATERIALIZED VIEW CONCURRENTLY all_karas');
	profile('refreshKaras');
}

export async function refreshKaras() {
	newDBTask({func: refreshKarasTask, name: 'refreshKaras'});
	await databaseReady();
}

export async function refreshYearsTask() {
	profile('refreshYears');
	logger.debug('Refreshing years view', {service: 'DB'});
	await db().query('REFRESH MATERIALIZED VIEW CONCURRENTLY all_years');
	profile('refreshYears');
}

export async function refreshYears() {
	newDBTask({func: refreshYearsTask, name: 'refreshYears'});
	await databaseReady();
}

export async function updateKaraSearchVector() {
	return db().query(sqlUpdateKaraSearchVector);
}
