import { DBKaraFamily } from '../types/database/kara.js';
import logger, { profile } from '../utils/logger.js';
import { databaseReady, db, newDBTask } from './database.js';
import {
	sqlCreateKaraIndexes,
	sqlRefreshKaraTable,
	sqlSelectKaraFamily,
	sqlUpdateKaraParentsSearchVector,
	sqlUpdateKaraSearchVector,
} from './sql/kara.js';

const service = 'DB';

export async function selectKaraFamily(kids: string[]): Promise<DBKaraFamily[]> {
	const res = await db().query(sqlSelectKaraFamily, [kids]);
	return res.rows;
}

export async function refreshKarasTask() {
	profile('refreshKaras');
	logger.debug('Refreshing karas table', { service });
	await db().query(`DROP TABLE IF EXISTS all_karas_new;
	DROP TABLE IF EXISTS all_karas_old;
	CREATE TABLE all_karas_new AS ${sqlRefreshKaraTable([], [])};`);
	logger.debug('Refreshing karas table, renaming', { service });
	await db().query(`ALTER TABLE all_karas RENAME TO all_karas_old;
	ALTER TABLE all_karas_new RENAME TO all_karas;
	`);
	logger.debug('Refreshing karas table, done.', { service });
	cleanupOldKaraTables();
	profile('refreshKaras');
}

async function cleanupOldKaraTables() {
	await db().query('DROP TABLE IF EXISTS all_karas_old');
	await db().query(sqlCreateKaraIndexes);
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
	if (kids && kids.length > 0) {
		await db().query(sqlUpdateKaraParentsSearchVector(true), [kids]);
	} else {
		await db().query(sqlUpdateKaraParentsSearchVector(false));
	}
	profile('refreshParentSearchVector');
}

export async function updateKaraSearchVector(kids?: string[]) {
	if (kids && kids.length > 0) {
		await db().query(sqlUpdateKaraSearchVector(true), [kids]);
	} else {
		await db().query(sqlUpdateKaraSearchVector(false));
	}
}
