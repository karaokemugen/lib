import { DBStats } from "../../../types/database/database.js";
import { RepositoryManifestV2 } from "../repo.js";

export interface KMServer {
	domain: string;
	sid: string;
	last_seen: Date;
	flag_banned?: boolean;
	stats: DBStats;
	manifest: RepositoryManifestV2;
}

export interface KMServerFull extends KMServer {
	online: boolean;
}