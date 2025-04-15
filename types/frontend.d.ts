export interface APIMessageType<T = any> {
	code: string;
	data: T;
}

export type WSCmdDefinition<Body extends object, Response> = {
	value: string;
	bodyType: Body;
	responseType: Response;
};

export type ExtractBodyType<T> = T extends WSCmdDefinition<infer B, any> ? B : never;
export type ExtractResponseType<T> = T extends WSCmdDefinition<any, infer R> ? R : never;

export type HttpMessage<T = undefined> = { code: number, message: APIMessageType<T> };
