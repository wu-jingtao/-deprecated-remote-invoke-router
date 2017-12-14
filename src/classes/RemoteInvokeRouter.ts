import { Server } from 'binary-ws';
import { EventEmitter } from 'events';

export abstract class RemoteInvokeRouter extends EventEmitter {

    private readonly _bws: Server;

    constructor(bws: Server) {
        super();
        
        this._bws = bws;
        this._bws.on('connection', socket => {

        });
    }
}