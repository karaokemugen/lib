import { pg as yesql } from 'yesql';

import { DBTag } from '../types/database/tag.d.js';
import { Tag, TagAndType } from '../types/tag.js';
import { getConfig } from '../utils/config.js';
import { getTagTypeName } from '../utils/constants.js';
import logger, { profile } from '../utils/logger.js';
import { databaseReady, db, newDBTask } from './database.js';
import {
	sqlCreateTagsIndexes,
	sqlDeleteTagsByKara,
	sqlInsertKaraTags,
	sqlRefreshAllTags,
	sqlUpdateTagSearchVector,
} from './sql/tag.js';

const service = 'DB';

export function convertToDBTag(tag: Tag): DBTag {
	return {
		...tag,
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
		DROP TABLE IF EXISTS all_tags_old;
		CREATE TABLE all_tags_new AS ${sqlRefreshAllTags(collectionClauses)};`);
		await db().query(`ALTER TABLE all_tags RENAME TO all_tags_old;
		ALTER TABLE all_tags_new RENAME TO all_tags;
		`);
		cleanupOldTagTables();
	} catch (err) {
		// Not fatal.
		logger.error('Failed to refresh tags', {service, obj: err});
	} finally {
		profile('refreshTags');
	}
}

async function cleanupOldTagTables() {
	await db().query('DROP TABLE IF EXISTS all_tags_old;');
	await db().query(sqlCreateTagsIndexes);
}

export async function refreshTags() {
	newDBTask({ func: refreshTagsTask, name: 'refreshTags' });
	await databaseReady();
}

export async function updateKaraTags(kid: string, tags: TagAndType[], songname?: string) {
	await db().query(sqlDeleteTagsByKara, [kid]);
	for (const tag of tags) {
		logger.debug(`Adding kara ${kid} and tag ${tag.tid} type ${tag.type}`, { service });
		try {
			await db().query(
				yesql(sqlInsertKaraTags)({
					kid,
					tid: tag.tid,
					type: tag.type,
				})
			);
		} catch (err) {
			// Not fatal - the song will just have an unlinked tag and it won't show up. 
			logger.warn(`Error integrating song "${songname}" (${kid}) has an unknown tag : ${tag.tid} type ${getTagTypeName(tag.type)}`);
		}
	}
}

export async function updateTagSearchVector() {
	return db().query(sqlUpdateTagSearchVector);
}
