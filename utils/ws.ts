import { Server } from 'http';
import SocketIO, { Namespace, Server as SocketServer,Socket } from 'socket.io';
import Transport from 'winston-transport';

import { APIData } from '../types/api';

let ws: SocketIOApp;

export function emitWS(type: string, data?: any) {
	if (ws) ws.emit(type, data);
}

export function initWS(server: Server) {
	ws = new SocketIOApp(server);
	return ws;
}

interface SocketController {
	(socket: Socket, data: APIData): Promise<any>
}

export class SocketIOApp {
	ws: SocketServer
	routes: Record<string, SocketController[]>
	disconnectHandlers: SocketController[]

	constructor(server: Server) {
		this.ws = new SocketIO(server);
		this.routes = {};
		this.disconnectHandlers = [];
		this.ws.use((socket, next) => {
			this.connectionHandler(socket);
			next();
		});
	}

	private connectionHandler(socket: Socket) {
		this.disconnectHandlers.forEach(fn => {
			socket.on('disconnect', fn);
		});
		socket.use(async (packet, next) => {
			if (Array.isArray(this.routes[packet[0]])) {
				const middlewares = this.routes[packet[0]];
				// Dispatch through middlewares
				let i = 0;
				for (const fn of middlewares) {
					if (i === (middlewares.length - 1)) {
						// Last function, ack with his result
						packet[2](await fn(socket, packet[1]));
					} else {
						// If not, just call it
						try {
							await fn(socket, packet[1]);
						} catch (err) {
							// Middlewares can throw errors, in which cases we must stop code execution and send error back to user
							packet[2](err);
						}
					}
					i++;
				}
			}
			next();
		});
	}

	route(name: string, ...handlers: SocketController[]) {
		this.routes[name] = handlers;
	}

	emit(type: string, data: any) {
		this.ws.sockets.emit(type, data);
	}

	onDisconnect(fn: SocketController) {
		this.disconnectHandlers.push(fn);
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
