import { profile } from "../utils/logger";
import { db } from "./database";

export async function refreshKaras() {
	profile('RefreshKaras');
	await db().query('REFRESH MATERIALIZED VIEW all_karas');
	profile('RefreshKaras');
}

export async function refreshYears() {
	profile('RefreshYears');
	await db().query('REFRESH MATERIALIZED VIEW all_years');
	profile('RefreshYears');
}
