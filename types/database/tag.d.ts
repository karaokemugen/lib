import { Tag } from '../tag';

export interface DBTag extends Tag {
	karacount?: Record<string, number>;
	count?: number;
}
