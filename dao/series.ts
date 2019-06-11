import { profile } from "../utils/logger";
import { db } from "./database";

export async function refreshSeries() {
	profile('RefreshSeries');
	await db().query('REFRESH MATERIALIZED VIEW all_series');
	profile('RefreshSeries');
}

export async function refreshKaraSeries() {
	profile('RefreshSeriesi18n');
	await db().query('REFRESH MATERIALIZED VIEW series_i18n');
	profile('RefreshSeriesi18n');
	profile('RefreshKaraSeries');
	await db().query('REFRESH MATERIALIZED VIEW all_kara_series');
	profile('RefreshKaraSeries');
}

export async function refreshKaraSeriesLang() {
	profile('RefreshKaraSeriesLang');
	await db().query('REFRESH MATERIALIZED VIEW all_kara_serie_langs');
	profile('RefreshKaraSeriesLang');
}
