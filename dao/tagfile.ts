import {uuidRegexp, tagTypes} from '../utils/constants';
import { Tag, TagFile } from '../types/tag';
import { resolveFileInDirs, asyncReadFile, sanitizeFile, asyncWriteFile, asyncUnlink } from '../utils/files';
import { resolvedPathTags, resolvedPathKaras } from '../utils/config';
import { testJSON, initValidators, check } from '../utils/validators';
import { resolve, basename } from 'path';
import { KaraList } from '../types/kara';
import logger from '../utils/logger';
import { parseKara } from './karafile';

const header = {
	version: 1,
	description: 'Karaoke Mugen Tag File'
}

const tagConstraintsV1 = {
	name: {presence: {allowEmpty: false}},
	aliases: {arrayValidator: true},
	tid: {presence: true, format: uuidRegexp},
	i18n: {i18nValidator: true},
	types: {tagTypeValidator: true}
};

export async function readTagFile(tagFile: string) {
	let file: string;
	try {
		file = await resolveFileInDirs(tagFile, resolvedPathTags());
	} catch(err) {
		throw `No series file found (${tagFile})`;
	}
	return await getDataFromTagFile(file);
}

export async function getDataFromTagFile(file: string): Promise<Tag> {
	const tagFileData = await asyncReadFile(file, 'utf-8');
	if (!testJSON(tagFileData)) throw `Syntax error in file ${file}`;
	const tagData = JSON.parse(tagFileData);
	if (header.version > +tagData.header.version) throw `Tag file is too old (version found: ${tagData.header.version}, expected version: ${header.version})`;
	const validationErrors = tagDataValidationErrors(tagData.tag);
	if (validationErrors) {
		throw `Tag data is not valid for ${file} : ${JSON.stringify(validationErrors)}`;
	}
	tagData.tag.tagfile = basename(file);
	return tagData.tag;
}

export function tagDataValidationErrors(tagData: Tag): {} {
	initValidators();
	return check(tagData, tagConstraintsV1);
}

export async function writeTagFile(tag: Tag, destDir: string) {
	const tagFile = resolve(destDir, `${sanitizeFile(tag.name)}.${tag.tid.substring(0, 7)}.tag.json`);
	const tagData = formatTagFile(tag);
	await asyncWriteFile(tagFile, JSON.stringify(tagData, null, 2), {encoding: 'utf8'});
}

export function formatTagFile(tag: Tag): TagFile {
	const tagData = {
		header: header,
		tag: tag
	};
	//Remove useless data
	if ((tag.aliases && tag.aliases.length === 0) || tag.aliases === null) delete tagData.tag.aliases;
	delete tagData.tag.tagfile;
	return tagData;
}

export async function removeTagFile(name: string, tid: string) {
	try {
		const filename = await resolveFileInDirs(`${sanitizeFile(name)}.${tid.substring(0, 7)}.tag.json`, resolvedPathTags());
		await asyncUnlink(filename);
	} catch(err) {
		throw `Could not remove tag file ${name} : ${err}`;
	}
}

export async function removeTagInKaras(tid: string, karas: KaraList) {
	logger.info(`[Kara] Removing tag ${tid} in kara files`);
	const karasWithTag = karas.content.filter((k: any) => {
		if (k.tid && k.tid.includes(tid)) return k.karafile;
	})
	if (karasWithTag.length > 0) logger.info(`[Kara] Removing in ${karasWithTag.length} files`);
	for (const karaWithTag of karasWithTag) {
		logger.info(`[Kara] Removing in ${karaWithTag.karafile}...`);
		const karaPath = await resolveFileInDirs(karaWithTag.karafile, resolvedPathKaras());
		const kara = await parseKara(karaPath);
		for (const type of Object.keys(tagTypes)) {
			if (kara.data.tags[type]) kara.data.tags[type] = kara.data.tags[type].filter((t: string) => t !== tid)
		}
		kara.data.modified_at = new Date().toString();
		await asyncWriteFile(karaPath, JSON.stringify(kara, null, 2));
	}
}