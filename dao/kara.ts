import { DBKaraFamily } from '../types/database/kara.js';
import { getConfig } from '../utils/config.js';
import { tagTypes } from '../utils/constants.js';
import logger, { profile } from '../utils/logger.js';
import Task from '../utils/taskManager.js';
import { databaseReady, db, newDBTask } from './database.js';
import {
	sqlCreateKaraIndexes,
	sqlRefreshKaraTable,
	sqlRefreshSortableTable,
	sqlSelectKaraFamily,
	sqlUpdateKaraParentsSearchVector,
	sqlUpdateKaraSearchVector,
} from './sql/kara.js';

const service = 'DB';

export async function selectKaraFamily(kids: string[]): Promise<DBKaraFamily[]> {
	const res = await db().query(sqlSelectKaraFamily, [kids]);
	return res.rows;
}

function computeSortableClauses(kids?: string[]) {
	const conf = getConfig().Frontend.Library.KaraLineSort;
	const selectClauses = [];
	const joinClauses = [];
	const whereClauses = [];
	for (const e of conf) {
		if (typeof e === 'string' && Object.keys(tagTypes).includes(e)) {
			// Simple sortable by a specific string
			selectClauses.push(`string_agg(DISTINCT lower(unaccent(t${e}.name)), ', ' ORDER BY lower(unaccent(t${e}.name))) AS ${e}`);
			joinClauses.push(`LEFT JOIN kara_tag kt${e} on k.pk_kid = kt${e}.fk_kid and kt${e}.type = ${tagTypes[e]}`);
			joinClauses.push(`LEFT JOIN tag t${e} on kt${e}.fk_tid = t${e}.pk_tid`);
		} else if (Array.isArray(e)) {
			// Now the fun part
			// These are groups of tags, the sort needs to happen on as a COALESCE of all tagtypes involved.
			const groupName = e.join('_');
			let i = 1;
			const coalesce = [];
			for (const type of e) {
				joinClauses.push(`LEFT JOIN kara_tag kt${i}${type} on k.pk_kid = kt${i}${type}.fk_kid and kt${i}${type}.type = ${tagTypes[type]}`)
				joinClauses.push(`LEFT JOIN tag t${i}${type} on kt${i}${type}.fk_tid = t${i}${type}.pk_tid`);
				coalesce.push(`\tstring_agg(DISTINCT lower(unaccent(t${i}${type}.name)), ', ' ORDER BY lower(unaccent(t${i}${type}.name)))`);
				i += 1;
			}
			selectClauses.push(`COALESCE (\n${coalesce.join(',\n')}) AS ${groupName}`);
		}
	}
	if (kids) {
		whereClauses.push(`k.pk_kid = ANY($1)`)
	}
	return {
		selectClauses,
		joinClauses,
		whereClauses
	}
}

async function createAllKaras() {
	await db().query(`DROP TABLE IF EXISTS all_karas_new;
		DROP TABLE IF EXISTS all_karas_old;
		CREATE TABLE all_karas_new AS ${sqlRefreshKaraTable([])};`);
}

async function createAllSortables() {

	const sortableClauses = computeSortableClauses();
	await db().query(`DROP TABLE IF EXISTS all_karas_sortable_new;
	DROP TABLE IF EXISTS all_karas_sortable_old;
	CREATE TABLE all_karas_sortable_new AS ${sqlRefreshSortableTable(sortableClauses.selectClauses, sortableClauses.joinClauses, sortableClauses.whereClauses)}
	`);
}

async function renameAllKaras() {
	await db().query(`ALTER TABLE all_karas RENAME TO all_karas_old;
		ALTER TABLE all_karas_new RENAME TO all_karas;
		`);
}

async function renameAllSortables() {
	await db().query(`ALTER TABLE IF EXISTS all_karas_sortable RENAME TO all_karas_sortable_old;
		ALTER TABLE IF EXISTS all_karas_sortable_new RENAME TO all_karas_sortable;
		`);
}

async function createSortablesIndexes() {
	const promises = [];
	const conf = getConfig().Frontend.Library.KaraLineSort;
	for (const e of conf) {
		if (typeof e === 'string' && Object.keys(tagTypes).includes(e)) {
			promises.push(db().query(`CREATE INDEX IF NOT EXISTS idx_${e}_sortable ON all_karas_sortable(${e});`))
		}
	}
	await Promise.all(promises);
}

export async function refreshKarasTask() {
	profile('refreshKaras');
	logger.debug('Refreshing karas table', { service });
	await Promise.all([
		createAllKaras(),
		createAllSortables()
	]);
	logger.debug('Refreshing karas table, renaming', { service });
	await Promise.all([
		renameAllKaras(),
		renameAllSortables()
	])
	logger.debug('Refreshing karas table, done.', { service });
	cleanupOldKaraTables();
	cleanupOldSortableTables().then(() => createSortablesIndexes());
	profile('refreshKaras');
}

/** This one is called only when we refresh sortables, like when changing sortable options */
export async function refreshSortablesTask() {
	const task = new Task({
		text: 'UPDATING_LIBRARY_SORT'
	});
	profile('refreshSortables');
	try {
		logger.debug('Refreshing sortables table', { service });
		await createAllSortables();
		logger.debug('Refreshing sortables table, renaming', { service });
		await renameAllSortables();
		logger.debug('Refreshing sortables table, done.', { service });
		cleanupOldSortableTables().then(() => createSortablesIndexes());
	} catch(err) {
		throw err
	} finally {
		profile('refreshKaras');
		task.end();
	}
}

async function cleanupOldKaraTables() {
	await db().query('DROP TABLE IF EXISTS all_karas_old');
	await db().query(sqlCreateKaraIndexes);
}

async function cleanupOldSortableTables() {
	await db().query('DROP TABLE IF EXISTS all_karas_sortable_old');
	await db().query(sqlCreateKaraIndexes);
}

export async function refreshKarasInsert(kids: string[]) {
	await db().query(
		`INSERT INTO all_karas
	${sqlRefreshKaraTable(['k.pk_kid = ANY ($1)'])}
	ON CONFLICT DO NOTHING`,
		[kids]
	);
}

export async function refreshSortablesUpdate(kids: string[]) {
	const sortableClauses = computeSortableClauses(kids);
	if (kids) {
		await db().query(`DELETE FROM all_karas_sortable WHERE fk_kid = ANY ($1)`, [kids]);
	} else {
		await db().query(`TRUNCATE all_karas_sortable`);
	}
	await db().query(
		`INSERT INTO all_karas_sortable
	${sqlRefreshSortableTable(sortableClauses.selectClauses, sortableClauses.joinClauses, sortableClauses.whereClauses)}
	ON CONFLICT DO NOTHING`,
		kids ? [kids] : undefined
	);
}

export async function refreshKarasDelete(kids: string[]) {
	await db().query('DELETE FROM all_karas WHERE pk_kid = ANY ($1);', [kids]);
}

export async function refreshSortablesDelete(kids: string[]) {
	await db().query('DELETE FROM all_karas_sortable WHERE fk_kid = ANY ($1);', [kids]);
}

export async function refreshKarasUpdate(kids: string[]) {
	await refreshKarasDelete(kids);
	await Promise.all([
		refreshSortablesUpdate(kids),
		refreshKarasInsert(kids)
	]);
}

export async function refreshKaras() {
	newDBTask({ func: refreshKarasTask, name: 'refreshKaras' });
	await databaseReady();
}

/** Called only when sort options have changed */
export async function refreshSortables() {
	newDBTask({ func: refreshSortablesTask, name: 'refreshKaras' });
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
