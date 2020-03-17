import logger, { profile } from '../utils/logger';
import { db } from './database';

export async function refreshTags() {
	profile('RefreshTags');
	logger.debug('[DB] Refreshing tags view');
	await db().query('REFRESH MATERIALIZED VIEW all_tags');
	profile('RefreshTags');
}

export async function refreshTagViews() {
	profile('RefreshTagViews');
	logger.debug('[DB] Refreshing tag types views');
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
	`);
	profile('RefreshTagViews');
}

export async function refreshAllKaraTags() {
	profile('RefreshAllKaraTags');
	logger.debug('[DB] Refreshing kara<->tag view');
	await db().query('REFRESH MATERIALIZED VIEW all_kara_tag');
	profile('RefreshAllKaraTags');
}

export async function refreshKaraTags() {
	profile('RefreshKaraTags');
	await refreshTagViews();
	await refreshAllKaraTags();
	profile('RefreshKaraTags');
}
