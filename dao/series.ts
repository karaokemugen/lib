import logger, { profile } from "../utils/logger";
import { db, newDBTask, databaseReady } from "./database";

async function refreshSeriesTask() {
	profile('refreshSeries');
	logger.debug('[DB] Refreshing series view');
	await db().query('REFRESH MATERIALIZED VIEW all_series');
	profile('refreshSeries');
}

export async function refreshSeries() {
	newDBTask({func: refreshSeriesTask, name: 'refreshSeries'});
	await databaseReady();
}

async function refreshSeriesi18nTask() {
	profile('refreshSeriesi18n');
	logger.debug('[DB] Refreshing series i18n view');
	await db().query('REFRESH MATERIALIZED VIEW all_series_i18n');
	profile('refreshSeriesi18n');
}

export async function refreshSeriesi18n() {
	newDBTask({func: refreshSeriesi18nTask, name: 'refreshSeries'});
	await databaseReady();
}

async function refreshKaraSeriesTask() {
	profile('refreshKaraSeries');
	logger.debug('[DB] Refreshing kara->series view');
	await db().query('REFRESH MATERIALIZED VIEW all_kara_series');
	profile('refreshKaraSeries');
}

export async function refreshKaraSeries() {
	newDBTask({func: refreshKaraSeriesTask, name: 'refreshKaraSeries'});
	await databaseReady();
}

async function refreshKaraSeriesLangTask() {
	profile('refreshKaraSeriesLang');
	logger.debug('[DB] Refreshing kara->series->lang view');
	await db().query('REFRESH MATERIALIZED VIEW all_kara_serie_langs');
	profile('refreshKaraSeriesLang');
}

export async function refreshKaraSeriesLang() {
	newDBTask({func: refreshKaraSeriesLangTask, name: 'refreshKaraSeriesLang'});
	await databaseReady();
}
