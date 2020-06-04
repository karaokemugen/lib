import {resolve} from 'path';

import { Series, SeriesFile } from '../types/series';
import {asyncWriteFile,sanitizeFile} from '../utils/files';

const header = {
	version: 3,
	description: 'Karaoke Mugen Series File'
};

export async function writeSeriesFile(series: Series, destDir: string) {
	const seriesFile = resolve(destDir, `${sanitizeFile(series.name)}.series.json`);
	const seriesData = formatSeriesFile(series);
	await asyncWriteFile(seriesFile, JSON.stringify(seriesData, null, 2), {encoding: 'utf8'});
}

export function formatSeriesFile(series: any): SeriesFile {
	const seriesData = {
		header: header,
		series: series
	};
	//Remove useless data
	if ((series.aliases?.length === 0) || series.aliases === null) delete seriesData.series.aliases;
	delete seriesData.series.short;
	seriesData.series.sid = seriesData.series.tid;
	delete seriesData.series.types;
	delete seriesData.series.tid;
	delete seriesData.series.tagfile;
	delete seriesData.series.karacount;
	return seriesData;
}