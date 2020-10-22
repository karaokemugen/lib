import {parse as assParser} from 'ass-compiler';

import {ASSLine} from '../types/ass';

/** Parse ASS data and return lyrics */
export function ASSToLyrics(ass: string): ASSLine[] {
	const script = assParser(ass);
	script.events.dialogue.sort((a, b) => (a.Start > b.Start) ? 1 : -1 );
	return script.events.dialogue.map(dialogue => {
		return {start: dialogue.Start, end: dialogue.End, text: dialogue.Text.combined};
	});
}

