import { ParsedTag } from 'ass-compiler/types/tags.js';

export interface ASSEvent {
	tags: { [K in keyof ParsedTag]: ParsedTag[K] }[];
	text: string;
	drawing: string[][];
}

export interface ASSLine {
	start: number;
	end: number;
	text: string;
	fullText?: ASSEvent[];
}

export type AssParserSection = {
	section: string;
	body: AssParserSectionBody;
};
export type AssParserSectionBody = Array<
		{ key: 'Format'; value: string[] } // Format definitions
		| { key: string; value: string | any } // Key values
		| { key: 'Style' | 'Comment' | 'Dialogue'; value: {[key: string]: string} }
		| { type: 'comment' | string; value: string } // Comments
>;
