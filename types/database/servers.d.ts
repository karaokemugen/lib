import { DBStats } from "../../../types/database/database.js";
import { RepositoryManifest } from "../repo.js";

export interface KMServer {
	domain: string;
	sid: string;
	last_seen: Date;
	flag_banned?: boolean;
}

export interface KMServerFull extends KMServer {
	online: boolean;
	stats?: DBStats;
	info?: RepositoryManifest;
}