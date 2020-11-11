import { EventEmitter } from 'events';
import { IncomingHttpHeaders, Server} from 'http';
import { Namespace, Server as SocketServer, Socket } from 'socket.io';
import Transport from 'winston-transport';

import { APIData } from '../types/api';

let ws: SocketIOApp;

export function emitWS(type: string, data?: any) {
	if (ws) ws.message(type, data);
}

export function initWS(server: Server) {
	ws = new SocketIOApp(server);
	return ws;
}

interface SocketController {
	(socket: Socket, data: APIData): Promise<any>
}

export class SocketIOApp extends EventEmitter {
	ws: SocketServer
	routes: Record<string, SocketController[]>

	constructor(server: Server) {
		super();
		this.ws = new SocketServer(server);
		this.routes = {};
		this.ws.use((socket, next) => {
			this.connectionHandler(socket);
			next();
		});
	}

	private async routeRequest(command: string, data: any, socket: Socket) {
		if (Array.isArray(this.routes[command])) {
			const middlewares = this.routes[command];
			// Dispatch through middlewares
			let i = 0;
			for (const fn of middlewares) {
				if (i === (middlewares.length - 1)) {
					// Last function, ack with his result
					try {
						return {err: false, data: await fn(socket, data)};
					} catch (err) {
						return {err: true, data: err};
					}
				} else {
					// If not, just call it
					try {
						await fn(socket, data);
					} catch (err) {
						// Middlewares can throw errors, in which cases we must stop code execution and send error back to user
						return {err: true, data: err};
					}
				}
				i++;
			}
		} else {
			return {err: true, data: {code: 404, message: {code: 'UNKNOWN_COMMAND'}}};
		}
	}

	private connectionHandler(socket: Socket) {
		socket.on('disconnect', () => {
			this.emit('disconnect', socket);
		});
		this.emit('connect', socket);
		socket.onAny(async (event: string, data: any, ack: (data: any) => void) => {
			ack(await this.routeRequest(event, data, socket));
		});
	}

	async emulate(cmd: string, payload: APIData, headers: IncomingHttpHeaders) {
		const socket = {
			handshake: {
				headers
			}
		} as unknown as Socket;
		return this.routeRequest(cmd, payload, socket);
	}

	route(name: string, ...handlers: SocketController[]) {
		this.routes[name] = handlers;
	}

	message(type: string, data: any) {
		this.ws.sockets.emit(type, data);
	}
}

export class WSTransport extends Transport {
	constructor(opts: any) {
		super(opts);
		this.nsp = ws.ws.of(`/${opts.namespace}`);
	}

	nsp: Namespace

	log(info: any, callback: any) {
		if (this.nsp) this.nsp.emit('log', info);
		callback();
	}
}

/* Code to emit websockets in rooms. It could be used to instanciate KM Frontends.

export function emitWSRoom(room: string, type: string, data: any) {
	getWS().sockets.in(room).emit(type, data);
}

getWS().sockets.on('connection', function(socket: any) {
	socket.on('room', (room: string) => {
		socket.join(room);
	});
});

*/
