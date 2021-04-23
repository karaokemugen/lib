import {BinaryToTextEncoding,createHash} from 'crypto';
import fileType from 'file-type';
import { constants as FSConstants, createWriteStream, PathLike, promises as fs } from 'fs';
import { mkdirp, move } from 'fs-extra';
import deburr from 'lodash.deburr';
import {relative, resolve} from 'path';
import sanitizeFilename from 'sanitize-filename';
import { Stream } from 'stream';
import { blockDevices } from 'systeminformation';

import { getState } from '../../utils/state';
import { RepositoryType } from '../types/repo';
import { resolvedPathRepos } from './config';
import {imageFileRegexp,mediaFileRegexp} from './constants';
import logger from './logger';
import Task from './taskManager';

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
		'∀': 'A',
		'∬': 'Fortissimo',
		'ǒ' : 'o',
		'ǎ' : 'a',
		'ǔ' : 'u',
		'ǐ' : 'i',
		'ё' : 'e'
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
		.replace(/[△:/☆★†↑½♪＊*∞♥❤♡⇄♬]/g, ' ')
		.replace(/…/g,'...')
		.replace(/\+/g,' Plus ')
		.replace(/＋/g, ' Plus ')
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

export function detectSubFileFormat(sub: string): 'ass' | 'toyunda' | 'ultrastar' | 'unknown' | 'karafun' | 'kar' {
	const data = sub.split('\n');
	if (sub.substring(0, 4) === 'MThd') return 'kar';
	if (sub.substring(0, 3) === 'KFN' || sub.includes('[General]')) return 'karafun';
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

export async function asyncExists(file: PathLike, write = false): Promise<boolean> {
	try {
		await fs.access(file, write ? FSConstants.W_OK:FSConstants.F_OK);
		return true;
	} catch (err) {
		return false;
	}
}

export function isImageFile(fileName: string) {
	return new RegExp(imageFileRegexp).test(fileName);
}

export function isMediaFile(fileName: string) {
	return new RegExp(mediaFileRegexp).test(fileName);
}

export function checksum(str: string, algorithm = 'md5', encoding: BinaryToTextEncoding = 'hex') {
	return createHash(algorithm)
		.update(str, 'utf8')
		.digest(encoding);
}

/** Function used to verify if a required file exists. It throws an exception if not. */
export async function asyncRequired(file: string) {
	if (!await asyncExists(file)) throw `File "${file}" does not exist`;
}

export async function asyncCheckOrMkdir(dir: string) {
	try {
		const resolvedDir = resolve(dir);
		if (!await asyncExists(resolvedDir)) await mkdirp(resolvedDir);
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
export async function extractAllFiles(dir: RepositoryType, repo?: string): Promise<string[]> {
	let files = [];
	const path = resolvedPathRepos(dir, repo);
	let ext = '';
	if (dir === 'Karaokes') ext = '.kara.json';
	if (dir === 'Tags') ext = '.tag.json';
	for (const resolvedPath of path) {
		logger.debug(`ExtractAllFiles from folder ${resolvedPath}`, {service: 'Files'});
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
	const dirListing = await fs.readdir(dir);
	return dirListing
		.filter((file: string) => file.endsWith(ext || '') && !file.startsWith('.'))
		.map((file: string) => resolve(dir, file));
}

export function writeStreamToFile(stream: Stream, filePath: string) {
	return new Promise<void>((resolve, reject) => {
		stream.pipe(createWriteStream(filePath));
		stream.on('end', () => resolve());
		stream.on('error', (err: string) => reject(err));
	});
}

export async function browseFs(dir: string, onlyMedias: boolean) {
	const directory = await fs.readdir(dir, {encoding: 'utf8', withFileTypes: true});
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

export function asyncMove(path1: string, path2: string, options?: any) {
	if (path1 === path2) return;
	return move(path1, path2, options || {});
}

export async function asyncMoveAll(dir1: string, dir2: string, task?: Task) {
	const files = await fs.readdir(dir1);
	for (const file of files) {
		logger.info(`Moving ${file}`, {service: 'Files'});
		if (task) task.update({
			subtext: file
		});
		await asyncMove(resolve(dir1, file), resolve(dir2, file), {overwrite: true});
		if (task) task.incr();
	}
}

export function relativePath(from: string, to: string): string {
	if (to.startsWith('/')) return to;
	return relative(from, to);
}
