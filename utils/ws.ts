import { Server } from 'http';
import {listen, Namespace} from 'socket.io';
import Transport from 'winston-transport';

let ws: SocketIO.Server;

export function emitWS(type: string, data?: any) {
	//logger.debug( '[WS] Sending message '+type+' : '+JSON.stringify(data));
	if (ws) ws.sockets.emit(type, data);
}

export function initWS(server: Server) {
	ws = listen(server);
}


export class WSTransport extends Transport {
	constructor(opts: any) {
		super(opts);
		this.nsp = ws.of(`/${opts.namespace}`);
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