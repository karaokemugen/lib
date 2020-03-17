import logger, { profile } from '../utils/logger';
import { db } from './database';

export async function refreshKaras() {
	profile('RefreshKaras');
	logger.debug('[DB] Refreshing karas view');
	await db().query('REFRESH MATERIALIZED VIEW all_karas');
	profile('RefreshKaras');
}

export async function refreshYears() {
	profile('RefreshYears');
	logger.debug('[DB] Refreshing years view');
	await db().query('REFRESH MATERIALIZED VIEW all_years');
	profile('RefreshYears');
}
