/**
 * 这个文件是直接从remote-invoke的test文件夹下复制过来的
 */

import { ConnectionSocket, RemoteInvoke } from "remote-invoke";
import { BaseSocket, ReadyState } from 'binary-ws';

/**
 * 使用binary-ws简单实现的通信接口
 */
export class BinaryWS_socket implements ConnectionSocket {

    ri: RemoteInvoke;
    onMessage: (header: string, body: Buffer) => void;
    onOpen: () => void;
    onClose: () => void;

    get connected() {
        return this._socket.readyState === ReadyState.OPEN;
    }

    constructor(private readonly _socket: BaseSocket) {
        this._socket.once('open', () => this.onOpen && this.onOpen());
        this._socket.once('close', () => this.onClose && this.onClose());
        this._socket.on('message', (header, body) => {
            //console.log('[binary-ws] [收到]', header);  //测试使用

            this.onMessage && this.onMessage(header, body);
        });
    }

    send(header: string, body: Buffer): Promise<void> {
        //console.log('[binary-ws] [发送]', header);  //测试使用

        const result = this._socket.send(header, body);
        const timer = setTimeout(() => {
            this._socket.cancel(result.messageID)
        }, RemoteInvoke.timeout);

        return result
            .then(() => clearTimeout(timer))
            .catch(err => {
                clearTimeout(timer);
                throw err;
            });
    }
}