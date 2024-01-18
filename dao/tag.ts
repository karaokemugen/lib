import { pg as yesql } from 'yesql';

import { DBTag } from '../types/database/tag.d.js';
import { Tag, TagAndType, TagTypeNum } from '../types/tag.js';
import { getConfig } from '../utils/config.js';
import { tagTypes } from '../utils/constants.js';
import logger, { profile } from '../utils/logger.js';
import { isNumber } from '../utils/validators.js';
import { databaseReady, db, newDBTask } from './database.js';
import {
	sqlCreateTagsIndexes,
	sqlDeleteTagsByKara,
	sqlInsertKaraTags,
	sqlRefreshAllTags,
	sqlUpdateTagSearchVector,
} from './sql/tag.js';

const service = 'DB';

// Remove this when Tags and DBTags are only one. When #1269 is done
export function convertToDBTag(tag: Tag): DBTag {
	const newTypes: TagTypeNum[] = [];
	for (const type of tag.types) {
		if (isNumber(type)) {
			newTypes.push(+type as TagTypeNum);
		} else {
			newTypes.push(tagTypes[type]);
		}
	}
	return {
		...tag,
		types: newTypes,
		karacount: {0: 0},
		count: 0,
		aliases: tag.aliases || [],
		short: tag.short || '',
		i18n: tag.i18n || {},
		tagfile: tag.tagfile || '',
		repository: tag.repository || '',
		noLiveDownload: tag.noLiveDownload || false,
	};
}

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
		CREATE TABLE all_tags_new AS ${sqlRefreshAllTags(collectionClauses)};`);
		await db().query(`ALTER TABLE all_tags RENAME TO all_tags_old;
		ALTER TABLE all_tags_new RENAME TO all_tags;
		`);		db().query('DROP TABLE IF EXISTS all_tags;');
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
		logger.debug(`Adding kara ${kid} and tag ${tag.tid} type ${tag.type}`, { service });
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
