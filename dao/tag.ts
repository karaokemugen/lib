import { profile } from "../utils/logger";
import { db } from "./database";

export async function refreshTags() {
	profile('RefreshTags');
	await db().query('REFRESH MATERIALIZED VIEW all_tags');
	profile('RefreshTags');
}

export async function refreshKaraTags() {
	profile('RefreshKaraTags');
	await Promise.all([
		db().query('REFRESH MATERIALIZED VIEW authors'),
		db().query('REFRESH MATERIALIZED VIEW creators'),
		db().query('REFRESH MATERIALIZED VIEW groups'),
		db().query('REFRESH MATERIALIZED VIEW languages'),
		db().query('REFRESH MATERIALIZED VIEW singers'),
		db().query('REFRESH MATERIALIZED VIEW misc'),
		db().query('REFRESH MATERIALIZED VIEW songtypes'),
		db().query('REFRESH MATERIALIZED VIEW songwriters'),
		db().query('REFRESH MATERIALIZED VIEW families'),
		db().query('REFRESH MATERIALIZED VIEW origins'),
		db().query('REFRESH MATERIALIZED VIEW genres'),
		db().query('REFRESH MATERIALIZED VIEW platforms'),
		db().query('REFRESH MATERIALIZED VIEW all_kara_tag')
	]);
	profile('RefreshKaraTags');
}
