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
		db().query('REFRESH MATERIALIZED VIEW author'),
		db().query('REFRESH MATERIALIZED VIEW creator'),
		db().query('REFRESH MATERIALIZED VIEW group_tags'),
		db().query('REFRESH MATERIALIZED VIEW language'),
		db().query('REFRESH MATERIALIZED VIEW singer'),
		db().query('REFRESH MATERIALIZED VIEW misc'),
		db().query('REFRESH MATERIALIZED VIEW songtype'),
		db().query('REFRESH MATERIALIZED VIEW songwriter')
	]);
	profile('RefreshKaraTags');
}
