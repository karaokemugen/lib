import { ParsedTag } from 'ass-compiler/types/tags';

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
