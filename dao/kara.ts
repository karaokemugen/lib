import logger, { profile } from '../utils/logger';
import { databaseReady, db, newDBTask } from './database';
import {
	sqlCreateKaraIndexes,
	sqlRefreshKaraTable,
	sqlUpdateKaraParentsSearchVector,
	sqlUpdateKaraSearchVector,
} from './sql/kara';

const service = 'DB';

export async function refreshKarasTask() {
	profile('refreshKaras');
	logger.debug('Refreshing karas table', { service });
	await db().query(`DROP TABLE IF EXISTS all_karas_new;
	CREATE TABLE all_karas_new AS ${sqlRefreshKaraTable([], [])};
	DROP TABLE IF EXISTS all_karas;
	ALTER TABLE all_karas_new RENAME TO all_karas;
	`);
	// Re-creating indexes is done asynchronously
	db().query(sqlCreateKaraIndexes);
	profile('refreshKaras');
}

export async function refreshKarasInsert(kids: string[]) {
	await db().query(
		`INSERT INTO all_karas
	${sqlRefreshKaraTable(['AND k.pk_kid = ANY ($1)'], [])}
	ON CONFLICT DO NOTHING`,
		[kids]
	);
}

export async function refreshKarasDelete(kids: string[]) {
	await db().query('DELETE FROM all_karas WHERE pk_kid = ANY ($1);', [kids]);
}

export async function refreshKarasUpdate(kids: string[]) {
	await refreshKarasDelete(kids);
	await refreshKarasInsert(kids);
}

export async function refreshKaras() {
	newDBTask({ func: refreshKarasTask, name: 'refreshKaras' });
	await databaseReady();
}

export async function refreshYearsTask() {
	profile('refreshYears');
	logger.debug('Refreshing years view', { service });
	await db().query('REFRESH MATERIALIZED VIEW CONCURRENTLY all_years');
	profile('refreshYears');
}

export async function refreshYears() {
	newDBTask({ func: refreshYearsTask, name: 'refreshYears' });
	await databaseReady();
}

export async function refreshParentsSearchVector() {
	newDBTask({
		func: refreshParentSearchVectorTask,
		name: 'refreshParentsSearchVector',
	});
	await databaseReady();
}

export async function refreshParentSearchVectorTask(kids?: string[]) {
	profile('refreshParentSearchVector');
	logger.debug('Refreshing parent search vector', { service });
	if (kids) {
		// Kids can exist but be empty. In this case there's nothing to update.
		if (kids.length === 0) return;
		await db().query(sqlUpdateKaraParentsSearchVector(true), [kids]);
	} else {
		await db().query(sqlUpdateKaraParentsSearchVector(false));
	}
	profile('refreshParentSearchVector');
}

export async function updateKaraSearchVector(kids?: string[]) {
	if (kids) {
		await db().query(sqlUpdateKaraSearchVector(true), [kids]);
	} else {
		await db().query(sqlUpdateKaraSearchVector(false));
	}
}
