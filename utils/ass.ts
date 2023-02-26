import { readFile, writeFile } from 'node:fs/promises';

import { parse as assCompilerParser } from 'ass-compiler';
import assParser from 'ass-parser';
import assStringify from 'ass-stringify';

import { ASSLine, AssParserSection, AssParserSectionBody } from '../types/ass';
import { DBKara } from '../types/database/kara';

/** Parse ASS data and return lyrics */
export function ASSToLyrics(ass: string): ASSLine[] {
	const script = assCompilerParser(ass);
	script.events.dialogue.sort((a, b) => (a.Start > b.Start ? 1 : -1));
	return script.events.dialogue.map(dialogue => {
		return {
			start: dialogue.Start,
			end: dialogue.End,
			text: dialogue.Text.combined,
			fullText: dialogue.Text.parsed,
		};
	});
}

/** Parse ASS data, clean up unused lines while preserving comments, insert kara info and turn content back into a string */
export function ASSContentCleanup(assText: string, setProperties?: {title: string, author: string}, overwrite = false) {
	const result = {
		assContentString: assText,
		// Gather information about the ASS data
		checks: {
			playResIsZero: false,
			hasUnusedStyles: false,
		}
	};

	// Parse ASS and blocks
	let parsedASS: AssParserSection[] = assParser(assText, {comments: true});

	// Add kara info to header
	const scriptInfoSection = getASSParserSection(parsedASS, 'Script Info');
	if (scriptInfoSection) {
		// Remove aegisub comments
		scriptInfoSection.body = scriptInfoSection.body.filter(line => 
			!('type' in line) || // Allow non-comments
			(line.type === 'comment' && !line.value.includes('http://www.aegisub.') && !line.value.includes('Script generated by Aegisub')));// Filter out only aegisub comments
		
		// Reset PlayRes
		result.checks.playResIsZero = Number(getASSParserBodyValue(scriptInfoSection.body, 'PlayResX') || 0) === 0 && 
			Number(getASSParserBodyValue(scriptInfoSection.body, 'PlayResY') || 0) === 0;
		if (result.checks.playResIsZero) { // Disabled for compability with karas that need a PlayRes
			scriptInfoSection.body = setASSParserBodyValue(scriptInfoSection.body, 'PlayResX', '0');
			scriptInfoSection.body = setASSParserBodyValue(scriptInfoSection.body, 'PlayResY', '0');
		}

		// Set kara title and author if not set
		const currentTitle = getASSParserBodyValue(scriptInfoSection.body, 'Title') || "";
		if (overwrite || !currentTitle.toString().trim() || ['New subtitles', 'karaoke', 'Default Aegisub file'].includes(currentTitle.toString()))
			scriptInfoSection.body = setASSParserBodyValue(scriptInfoSection.body, 'Title', setProperties.title);
		const currentAuthor = getASSParserBodyValue(scriptInfoSection.body, 'Original Timing');
		if (overwrite || !currentAuthor)
			scriptInfoSection.body = setASSParserBodyValue(scriptInfoSection.body, 'Original Timing', setProperties.author);
		
		parsedASS = setASSParserSection(parsedASS, 'Script Info', scriptInfoSection);
	}

	// Cleanup unused styles
	const scriptEvents = getASSParserSection(parsedASS, 'Events');
	const scriptStyles = getASSParserSection(parsedASS, 'V4+ Styles');
	if (scriptEvents) {
		const usedStyles = scriptEvents?.body?.filter(line => 
			('key' in line && (['Dialogue', 'Comment'].includes(line.key)) && line.value.Style)) // Find all Comment and Dialogue lines that have styles
			.map(line => line.value.Style) || [];

		if (scriptStyles && usedStyles.length > 0) {
			const cleanedupStyles = cleanupUnusedStyles(scriptStyles.body, usedStyles);
			scriptStyles.body = cleanedupStyles.body;
			result.checks.hasUnusedStyles = cleanedupStyles.unusedStyles.length > 0;
			parsedASS = setASSParserSection(parsedASS, 'V4+ Styles', scriptStyles);
		}
	}

	// Remove aegisub garbage block
	parsedASS = removeASSParserSection(parsedASS, 'Aegisub Project Garbage');
	
	// Processing finished, convert back to string
	result.assContentString = assStringify(parsedASS);

	// Currently the ass-parser library doesn't support fonts. Workaround to not break the font section
	const scriptFonts = getASSParserSection(parsedASS, 'Fonts');
	if (scriptFonts) {
		// Copy over 1:1 the fonts section from the original file, since ass-parser breaks the format
		const fontsSectionOriginal = getASSSectionRaw(assText, 'Fonts');
		result.assContentString = setASSSectionRaw(result.assContentString, 'Fonts', fontsSectionOriginal);
	}

	return result;
}

function getASSParserSection(sections: AssParserSection[], key: string) {
	const keyIndex = sections.findIndex(s => s.section === key);
	return keyIndex >= 0 ? sections[keyIndex] : null;
}

function setASSParserSection(sections: AssParserSection[], key: string, section: AssParserSection) {
	const keyIndex = sections.findIndex(s => s.section === key);
	if (keyIndex >= 0) {
		sections[keyIndex] = section;
	} else {
		sections.push(section);
	}
	return sections;
}

function removeASSParserSection(sections: AssParserSection[], key: string) {
	const keyIndex = sections.findIndex(s => s.section === key);
	if (keyIndex >= 0) {
		sections.splice(keyIndex, 1);
	}
	return sections;
}

function getASSParserBodyValue(body: AssParserSectionBody, key: string) {
	// Searches and sets a value or creates the key/value pair if not existent
	const keyIndex = body.findIndex(l => ('key' in l) && l.key === key);
	return keyIndex >= 0 ? body[keyIndex].value : null;
}

function setASSParserBodyValue(body: AssParserSectionBody, key: string, value: string) {
	// Searches and sets a value or creates the key/value pair if not existent
	const keyIndex = body.findIndex(l => ('key' in l) && l.key === key);
	if (keyIndex >= 0) {
		body[keyIndex].value = value;
	} else {
		body.push({key, value});
	}
	return body;
}

// Get and set ASS sections without library
const splitASSSections = (assText: string) => assText.split(/(?:\n)(?=^\[)/gm).map(section => section.trim());
const joinASSSections = (assSections: string[]) => `${assSections.join('\n\n')}\n`;

export function getASSSectionRaw(assText: string, key: string): string {
	const blocks = splitASSSections(assText);
	const index = blocks.findIndex(block => block.startsWith(`[${key}]`));
	return index >= 0 ? blocks[index] : '';
}

export function setASSSectionRaw(assText: string, key: string, section: string, indexIfNotExistent?: number): string {
	const blocks = splitASSSections(assText);
	const index = blocks.findIndex(block => block.startsWith(`[${key}]`));
	if (index >= 0) {
		blocks[index] = section;
	} else {
		const insertAtIndex = indexIfNotExistent >= 0 ? indexIfNotExistent : blocks.length - 1;
		blocks.splice(insertAtIndex, 0, section);
	}
	return joinASSSections(blocks);
}

function cleanupUnusedStyles(body: AssParserSectionBody, usedStylesNames: Array<string>) {
	// Check each line if it's a style and if it's used
	const styleLines = body.map(line => ({...line, isStyle: ('key' in line) && line.key === 'Style', isUsedStyle: usedStylesNames.includes(line.value?.Name)}));
	const unusedStyles = Array.from(new Set([...styleLines.filter(line => line.isStyle && !line.isUsedStyle)])); // For statistics
	if (usedStylesNames.length > 0)
		return {unusedStyles, body: styleLines.filter(line => !line.isStyle || line.isUsedStyle)};
	return { unusedStyles, body };
}

export async function ASSFileCleanup(assFilePath: string, kara: DBKara) {
	const assFileContent: string = await readFile(assFilePath, { encoding: 'utf8' });
	const newAssFileContent = ASSContentCleanup(assFileContent, {
		title: kara.titles[kara.titles_default_language || Object.keys(kara.titles)[0]],
		author: kara.authors.map(a => a.name).join(', '),
	});
	if (newAssFileContent.assContentString?.length > 10) // MAKE SURE to not write an empty file
		await writeFile(assFilePath, newAssFileContent.assContentString);
}
