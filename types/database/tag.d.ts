import { Tag } from '../tag.js';

export interface DBTag extends Tag {
	karacount?: Record<string, number>;
	count?: number;
}
