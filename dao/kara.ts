import logger, { profile } from '../utils/logger';
import { databaseReady, db, newDBTask } from './database';
import { sqlCreateKaraIndexes, sqlRefreshKaraTable, sqlUpdateKaraSearchVector } from './sql/kara';

export async function refreshKarasTask() {
	profile('refreshKaras');
	logger.debug('Refreshing karas table', {service: 'DB'});
	await db().query(`DROP TABLE IF EXISTS all_karas_new;
	CREATE TABLE all_karas_new AS ${sqlRefreshKaraTable([], [])};
	DROP TABLE IF EXISTS all_karas;
	ALTER TABLE all_karas_new RENAME TO all_karas;
	`);
	// Re-creating indexes is done asynchronously
	db().query(sqlCreateKaraIndexes);
	profile('refreshKaras');
}

export async function refreshKarasInsert(kid: string) {
	await db().query(`INSERT INTO all_karas
	${sqlRefreshKaraTable([` AND k.pk_kid = '${kid}'`], [])}
	ON CONFLICT DO NOTHING`);
}

export async function refreshKarasDelete(kids: string[]) {
	const kidList = JSON.stringify(kids).replace('[','(').replace(']',')').replace(/"/g, '\'');
	await db().query(`DELETE FROM all_karas WHERE pk_kid IN ${kidList};`);
}

export async function refreshKarasUpdate(kid: string) {
	await db().query(`DELETE FROM all_karas WHERE pk_kid = '${kid}';
	INSERT INTO all_karas
		${sqlRefreshKaraTable([` AND k.pk_kid = '${kid}'`], [])}
		;
	`);
}

export async function refreshKarasUpdateByTag(tid: string) {
	await db().query(`DELETE FROM all_karas WHERE ARRAY_TO_STRING(tid,' ') LIKE '%${tid}%';
	INSERT INTO all_karas
		${sqlRefreshKaraTable([' AND ktall.fk_kid = k.pk_kid'], ['LEFT JOIN kara_tag ktall ON ktall.fk_kid = k.pk_kid'])}
		;
	`);
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

export async function updateKaraSearchVector(kid?: string) {
	return db().query(sqlUpdateKaraSearchVector(kid));
}
