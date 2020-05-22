import {createWriteStream, exists, readFile, readdir, rename, unlink, stat, writeFile, Stats, Dirent} from 'fs';
import {remove, mkdirp, copy, move} from 'fs-extra';
import {promisify} from 'util';
import {relative, resolve} from 'path';
import {mediaFileRegexp, imageFileRegexp} from './constants';
import fileType from 'file-type';
import {createHash, HexBase64Latin1Encoding} from 'crypto';
import sanitizeFilename from 'sanitize-filename';
import deburr from 'lodash.deburr';
import { getState } from '../../utils/state';
import { Stream } from 'stream';
import { MediaInfo } from '../types/kara';
import { getMediaInfo } from './ffmpeg';
import { blockDevices } from 'systeminformation';
import { resolvedPathRepos } from './config';
import logger from './logger';
import { DirType } from '../types/files';

/** Not using copy() here but read/write file to circumveit a pkg bug */
export async function asyncCopyAlt(source: string, destination: string) {
	return await asyncWriteFile(destination, await asyncReadFile(source));
}

export function sanitizeFile(file: string): string {
	const replaceMap = {
		'·': '.',
		'・': '.',
		'Λ': 'A',
		'Я': 'R',
		'³': '3',
		'²': '2',
		'°': '0',
		'θ': '0',
		'Ø': '0',
		'○': 'O',
		'×': 'x',
		'Φ': 'O',
		'±': '+',
		'∀': 'A'
	};
	const replaceRegExp = new RegExp('[' + Object.keys(replaceMap).join('') + ']', 'ig');
	// Romanizing japanese characters by their romanization
	// Also making some obvious replacements of things we often find in japanese names.
	file = file.replace(/ô/g,'ou')
		.replace(/Ô/g,'Ou')
		.replace(/û/g,'uu')
		.replace(/µ's/g,'Mu\'s')
		.replace(/®/g,'(R)')
		.replace(/∆/g,'Delta')
		.replace(/Ω/g,'O')
		.replace(/;/g,' ')
		.replace(/\[/g,' ')
		.replace(/\]/g,' ')
		.replace(/[△:\/☆★†↑½♪＊*∞♥❤♡⇄♬]/g, ' ')
		.replace(/…/g,'...')
		.replace(/\+/g,' Plus ')
		.replace(/\＋/g, ' Plus ')
		.replace(/\?\?/g,' question_mark 2')
		.replace(/\?/g,' question_mark ')
		.replace(/^\./g,'')
		.replace(/♭/g,' Flat ')
		.replace(/%/g, ' percent ')
		.replace(replaceRegExp, input => {
			return replaceMap[input];
		})
	;
	// Remove all diacritics and other non-ascii characters we might have left
	// Also, remove useless spaces.
	file = deburr(file)
		.replace(/[^\x00-\xFF]/g, ' ' )
		.replace(/ [ ]+/g,' ')
	;
	// One last go using sanitizeFilename just in case.
	file = sanitizeFilename(file);
	file = file.trim();
	return file;
}

export async function detectSubFileFormat(sub: string): Promise<'ass' | 'toyunda' | 'ultrastar' | 'unknown' | 'karafun' | 'kar'> {
	const data = sub.split('\n');
	if (sub.substring(0, 4) === 'MThd') return 'kar';
	if (sub.substring(0, 3) === 'KFN') return 'karafun';
	if (data[0].includes('toyunda')) return 'toyunda';
	if (sub.includes('#TITLE:')) return 'ultrastar';
	if (data[0].includes('[Script Info]')) return 'ass';
	return 'unknown';
}

export async function detectFileType(file: string): Promise<string> {
	const detected = await fileType.fromFile(file);
	if (!detected) throw `Unable to detect filetype of ${file}`;
	return detected.ext;
}

const passThroughFunction = (fn: any, args: any) => {
	if(!Array.isArray(args)) args = [args];
	return promisify(fn)(...args);
};

export const asyncExists = (file: string) => passThroughFunction(exists, file);
export const asyncReadFile = (...args: any) => passThroughFunction(readFile, args);
export const asyncReadDir = (...args: any) => passThroughFunction(readdir, args);
export const asyncMkdirp = (...args: any) => passThroughFunction(mkdirp, args);
export const asyncRemove = (...args: any) => passThroughFunction(remove, args);
export const asyncRename = (...args: any) => passThroughFunction(rename, args);
export const asyncUnlink = (...args: any) => passThroughFunction(unlink, args);
export const asyncCopy = (...args: any) => passThroughFunction(copy, args);
export async function asyncStat(...args: any): Promise<Stats> {
	return passThroughFunction(stat, args);
}
export const asyncWriteFile = (...args: any) => passThroughFunction(writeFile, args);
export const asyncMoveFile = (...args: any) => passThroughFunction(move, args);


export const isImageFile = (fileName: string) => new RegExp(imageFileRegexp).test(fileName);
export const isMediaFile = (fileName: string) => new RegExp(mediaFileRegexp).test(fileName);

const filterValidFiles = (files: string[]) => files.filter(file => !file.startsWith('.') && isMediaFile(file));
export const filterMedias = (files: string[]) => filterValidFiles(files);
export const filterImages = (files: string[]) => filterValidFiles(files);

export const checksum = (str: string, algorithm = 'md5', encoding: HexBase64Latin1Encoding = 'hex') => createHash(algorithm)
	.update(str, 'utf8')
	.digest(encoding);

/** Function used to verify if a required file exists. It throws an exception if not. */
export async function asyncRequired(file: string) {
	if (!await asyncExists(file)) throw `File "${file}" does not exist`;
}

export async function asyncCheckOrMkdir(dir: string) {
	try {
		const resolvedDir = resolve(dir);
		if (!await asyncExists(resolvedDir)) await asyncMkdirp(resolvedDir);
	} catch(err) {
		throw `${dir} is unreachable. Check if drive is connected or permissions to that directory are correct : ${err}`;
	}
}

/**
 * Searching file in a list of folders. If the file is found, we return its complete path with resolve.
 */
export async function resolveFileInDirs(filename: string, dirs: string[]): Promise<string[]> {
	const filesFound = [];
	for (const dir of dirs) {
		const resolved = resolve(getState().dataPath, dir, filename);
		if (await asyncExists(resolved)) filesFound.push(resolved);
	}
	if (filesFound.length === 0) throw Error(`File "${filename}" not found in any listed directory: ${dirs.join(', ')}`);
	return filesFound;
}

// Extract all files of a specified folder
export async function extractAllFiles(dir: DirType, repo?: string): Promise<string[]> {
	let files = [];
	const path = resolvedPathRepos(dir, repo);
	let ext = '';
	if (dir === 'Karas') ext = '.kara.json';
	if (dir === 'Tags') ext = '.tag.json';
	if (dir === 'Series') ext = '.series.json';
	if (dir === 'Lyrics') ext = '.ass';
	for (const resolvedPath of path) {
		logger.debug(`[Files] ExtractAllFiles from folder ${resolvedPath}`);
		const localFiles = await asyncReadDirFilter(resolvedPath, ext || '');
		files = files.concat(localFiles.map((f: string) => resolve(resolvedPath, f)));
	}
	return files;
}

/** Replacing extension in filename */
export function replaceExt(filename: string, newExt: string): string {
	return filename.replace(/\.[^.]+$/, newExt);
}

export async function asyncReadDirFilter(dir: string, ext: string) {
	const dirListing = await asyncReadDir(dir);
	return dirListing.filter((file: string) => file.endsWith(ext || '') && !file.startsWith('.')).map((file: string) => resolve(dir, file));
}

export function writeStreamToFile(stream: Stream, filePath: string) {
	return new Promise((resolve, reject) => {
		stream.pipe(createWriteStream(filePath));
		stream.on('end', () => resolve());
		stream.on('error', (err: string) => reject(err));
	});
}

export async function extractMediaFiles(dir: string): Promise<MediaInfo[]> {
	const dirListing = await asyncReadDir(dir);
	const medias: MediaInfo[] = [];
	for (const file of dirListing) {
		if (isMediaFile(file)) medias.push(await getMediaInfo(resolve(dir, file)));
	}
	return medias;
}

export async function browseFs(dir: string, onlyMedias: boolean) {
	const directory: Dirent[] = await asyncReadDir(dir, {encoding: 'utf8', withFileTypes: true});
	let list = directory.map(e => {
		return {
			name: e.name,
			isDirectory: e.isDirectory()
		};
	});
	if (onlyMedias) list = list.filter(f => isMediaFile(f.name));
	const drives = getState().os === 'win32'
		? await blockDevices()
		: null;
	return {
		contents: list,
		drives: drives,
		fullPath: resolve(dir)
	};
}

export async function asyncMove(path1: string, path2: string, options: any) {
	if (path1 === path2) return;
	return await asyncMoveFile(path1, path2, options);
}

export async function asyncMoveAll(dir1: string, dir2: string) {
	const files = await asyncReadDir(dir1);
	for (const file of files) {
		logger.info(`[Files] Moving ${file}...`);
		await asyncMove(resolve(dir1, file), resolve(dir2, file), {overwrite: true});
	}
}

export function relativePath(from: string, to: string): string {
	if (to.startsWith('/')) return to;
	return relative(from, to);
}