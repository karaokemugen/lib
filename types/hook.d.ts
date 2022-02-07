import { TagAndType } from './tag';

export interface HookFile {
	header: {
		description: string;
		version: number;
	};
	hook: Hook;
}

export interface Hook {
	name: string;
	repository: string;
	conditions: HookConditions;
	actions: HookActions;
	error?: boolean;
}

interface HookActions {
	addTag?: TagAndType[];
	addTitleAlias?: any;
}

interface HookConditions {
	tagPresence?: string[];
	duration?: string;
	year?: string;
	tagNumber?: any;
	mediaFileRegexp?: string;
	titlesContain?: any;
}
