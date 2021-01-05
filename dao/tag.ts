import logger, { profile } from '../utils/logger';
import { databaseReady,db, newDBTask } from './database';

async function refreshTagsTask() {
	profile('refreshTags');
	logger.debug('Refreshing tags view', {service: 'DB'});
	await db().query('REFRESH MATERIALIZED VIEW all_tags');
	profile('refreshTags');
}

export async function refreshTags() {
	newDBTask({func: refreshTagsTask, name: 'refreshTags'});
	await databaseReady();
}

async function refreshTagViewsTask() {
	profile('refreshTagsView');
	logger.debug('Refreshing tags types view', {service: 'DB'});
	await db().query(`
	REFRESH MATERIALIZED VIEW authors;
	REFRESH MATERIALIZED VIEW creators;
	REFRESH MATERIALIZED VIEW groups;
	REFRESH MATERIALIZED VIEW languages;
	REFRESH MATERIALIZED VIEW singers;
	REFRESH MATERIALIZED VIEW misc;
	REFRESH MATERIALIZED VIEW songtypes;
	REFRESH MATERIALIZED VIEW songwriters;
	REFRESH MATERIALIZED VIEW families;
	REFRESH MATERIALIZED VIEW origins;
	REFRESH MATERIALIZED VIEW genres;
	REFRESH MATERIALIZED VIEW platforms;
	REFRESH MATERIALIZED VIEW series;
	REFRESH MATERIALIZED VIEW versions;
	`);
	profile('refreshTagsView');
}

export async function refreshTagViews() {
	newDBTask({func: refreshTagViewsTask, name: 'refreshTagsView'});
	await databaseReady();
}

async function refreshAllKaraTagsTask() {
	profile('refreshKaraTags');
	logger.debug('Refreshing kara->tags view', {service: 'DB'});
	await db().query('REFRESH MATERIALIZED VIEW all_kara_tag');
	profile('refreshTags');
}

export async function refreshAllKaraTags() {
	newDBTask({func: refreshAllKaraTagsTask, name: 'refreshKaraTags'});
	await databaseReady();
}

export async function refreshKaraTags() {
	profile('RefreshKaraTags');
	refreshTagViews();
	refreshAllKaraTags();
	await databaseReady();
	profile('RefreshKaraTags');
}
