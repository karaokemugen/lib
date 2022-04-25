import { pg as yesql } from 'yesql';

import { TagAndType } from '../types/tag';
import { getConfig } from '../utils/config';
import logger, { profile } from '../utils/logger';
import { databaseReady, db, newDBTask } from './database';
import {
	sqlCreateTagsIndexes,
	sqlDeleteTagsByKara,
	sqlInsertKaraTags,
	sqlRefreshAllTags,
	sqlUpdateTagSearchVector,
} from './sql/tag';

const service = 'DB';

async function refreshTagsTask() {
	profile('refreshTags');
	logger.debug('Refreshing tags table', { service });
	try {
		const collectionClauses = [];
		const conf = getConfig();
		const collections = conf.Karaoke?.Collections;
		if (collections) {
			for (const tid of Object.keys(collections)) {
				if (collections[tid] === true) collectionClauses.push(`kt.fk_tid = '${tid}'`);
			}
		}
		if (!collections || collectionClauses.length === 0) {
			// No collection in config, we're fetching all songs.
			collectionClauses.push('1 = 1');
		}
		await db().query(`DROP TABLE IF EXISTS all_tags_new;
		CREATE TABLE all_tags_new AS ${sqlRefreshAllTags(collectionClauses)};
		DROP TABLE IF EXISTS all_tags;
		ALTER TABLE all_tags_new RENAME TO all_tags;
		`);
		// Re-creating indexes is done asynchronously
		db().query(sqlCreateTagsIndexes);
	} catch (err) {
		// Not fatal.
		logger.error('Failed to refresh tags', {service, obj: err});
	} finally {
		profile('refreshTags');
	}
}

export async function refreshTags() {
	newDBTask({ func: refreshTagsTask, name: 'refreshTags' });
	await databaseReady();
}

export async function updateKaraTags(kid: string, tags: TagAndType[]) {
	await db().query(sqlDeleteTagsByKara, [kid]);
	for (const tag of tags) {
		await db().query(
			yesql(sqlInsertKaraTags)({
				kid,
				tid: tag.tid,
				type: tag.type,
			})
		);
	}
}

export async function updateTagSearchVector() {
	return db().query(sqlUpdateTagSearchVector);
}
