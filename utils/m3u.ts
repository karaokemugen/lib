import { writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import dayjs from 'dayjs';
import { M3uMedia, M3uPlaylist } from 'm3u-parser-generator';

import { DBPL } from '../../types/database/playlist.js';
import { DBPLC } from '../types/database/playlist.js';
import { sanitizeFile } from './files.js';

export function M3uFromPlaylist(playlistInfo: DBPL, content: DBPLC[],
	useSongNameAsFileName = false) {
	const m3uPlaylist = new M3uPlaylist();
	m3uPlaylist.title = playlistInfo.name;
	m3uPlaylist.medias = content.map(c => {
		if (useSongNameAsFileName) {
			const destBaseFile = sanitizeFile(c.songname);
			return new M3uMedia(`${destBaseFile}${extname(c.mediafile)}`);
		}
		return new M3uMedia(c.mediafile);
	});
	return m3uPlaylist.getM3uString();
}
export async function generateM3uFileFromPlaylist(
	playlistInfo: DBPL,
	content: DBPLC[],
	directory: string,
	useSongNameAsFileName = false
) {
	const m3uPlaylistContent = M3uFromPlaylist(playlistInfo, content, useSongNameAsFileName);
	const dateFormatted = dayjs(new Date()).format('YYYY-MM-DD_HH-mm-ss');
	const m3uFileName = `${dateFormatted}_${playlistInfo?.name}.m3u`;
	await writeFile(join(directory, m3uFileName), m3uPlaylistContent, {
		encoding: 'utf-8',
	});
}
