export interface DBList {
	infos: {
		count: number;
		from: number;
		to: number;
	};
}

export interface Filter {
	sql: any[];
	params: {
		username?: string;
	};
}
