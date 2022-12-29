import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import dayjs from 'dayjs';
import { M3uMedia, M3uPlaylist } from 'm3u-parser-generator';

import { DBPL, DBPLC } from '../types/database/playlist';

export function M3uFromPlaylist(playlistInfo: DBPL, content: DBPLC[]) {
	const m3uPlaylist = new M3uPlaylist();
	m3uPlaylist.title = playlistInfo.name;
	m3uPlaylist.medias = content.map(c => new M3uMedia(c.mediafile));
	return m3uPlaylist.getM3uString();
}
export async function generateM3uFileFromPlaylist(
	playlistInfo: DBPL,
	content: DBPLC[],
	directory: string
) {
	const m3uPlaylistContent = M3uFromPlaylist(playlistInfo, content);
	const dateFormatted = dayjs(new Date()).format('YYYY-MM-DD_HH-mm-ss');
	const m3uFileName = `${dateFormatted}_${playlistInfo?.name}.m3u`;
	await writeFile(join(directory, m3uFileName), m3uPlaylistContent, {
		encoding: 'utf-8',
	});
}
