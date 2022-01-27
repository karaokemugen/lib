import { pg as yesql } from 'yesql';

import logger, { profile } from '../utils/logger';
import { databaseReady, db, newDBTask } from './database';
import {
	sqlUpdateTagSearchVector,
	sqlInsertKaraTags,
	sqlDeleteTagsByKara,
} from './sql/tag';
import { TagAndType } from '../types/tag';

async function refreshTagsTask() {
	profile('refreshTags');
	logger.debug('Refreshing tags view', { service: 'DB' });
	await db().query('REFRESH MATERIALIZED VIEW CONCURRENTLY all_tags');
	profile('refreshTags');
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
				kid: kid,
				tid: tag.tid,
				type: tag.type,
			})
		);
	}
}

export async function updateTagSearchVector() {
	return db().query(sqlUpdateTagSearchVector);
}
