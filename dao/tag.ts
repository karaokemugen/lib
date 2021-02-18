import logger, { profile } from '../utils/logger';
import { databaseReady,db, newDBTask } from './database';
import { sqlUpdateTagSearchVector } from './sql/tag';

async function refreshTagsTask() {
	profile('refreshTags');
	logger.debug('Refreshing tags view', {service: 'DB'});
	await db().query('REFRESH MATERIALIZED VIEW CONCURRENTLY all_tags');
	profile('refreshTags');
}

export async function refreshTags() {
	await updateTagSearchVector();
	newDBTask({func: refreshTagsTask, name: 'refreshTags'});
	await databaseReady();
}

export async function updateTagSearchVector() {
	return db().query(sqlUpdateTagSearchVector);
}

