import {listen} from 'socket.io';
import { Server } from 'http';

let ws: any;

export function emitWS(type: string, data?: any) {
	//logger.debug( '[WS] Sending message '+type+' : '+JSON.stringify(data));
	if (ws) ws.sockets.emit(type, data);
}

export function initWS(server: Server) {
	ws = listen(server);
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