import logger, { profile } from "../utils/logger";
import { db } from "./database";

export async function refreshSeries() {
	profile('RefreshSeries');
	logger.debug('[DB] Refreshing series view');
	await db().query('REFRESH MATERIALIZED VIEW all_series');
	profile('RefreshSeries');
}

export async function refreshSeriesi18n() {
	profile('RefreshSeriesi18n');
	logger.debug('[DB] Refreshing i18n series view');
	await db().query('REFRESH MATERIALIZED VIEW series_i18n');
	profile('RefreshSeriesi18n');
}

export async function refreshKaraSeries() {
	profile('RefreshKaraSeries');
	logger.debug('[DB] Refreshing karas<->series view');
	await db().query('REFRESH MATERIALIZED VIEW all_kara_series');
	profile('RefreshKaraSeries');
}

export async function refreshKaraSeriesLang() {
	profile('RefreshKaraSeriesLang');
	logger.debug('[DB] Refreshing karas<->series<->i18n view');
	await db().query('REFRESH MATERIALIZED VIEW all_kara_serie_langs');
	profile('RefreshKaraSeriesLang');
}
