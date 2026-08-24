import { positionX, supportedFiles } from "../utils/constants.ts";

export type RecursivePartial<T> = {
	[P in keyof T]?: T[P] extends (infer U)[]
		? RecursivePartial<U>[]
		:  
		T[P] extends object
		? RecursivePartial<T[P]>
		: T[P];
};

export type PositionX = typeof positionX[number];
export type PositionY = typeof positionY[number];

export type SupportedFileType = keyof typeof supportedFiles;
