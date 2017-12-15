import * as http from 'http';
import * as https from 'https';
import { Server } from 'binary-ws';
import { EventSpace } from 'eventspace';
import { BaseSocketConfig } from 'binary-ws/bin/BaseSocket/interfaces/BaseSocketConfig';
import { ServerSocket } from 'binary-ws/bin/server/classes/ServerSocket';

import { ConnectedSocket } from './ConnectedSocket';

export abstract class RemoteInvokeRouter extends Server {

    private readonly _es = new EventSpace();    //用于消息派发

    private readonly _sockets: Map<string, ConnectedSocket> = new Map();    //key 接口连接的模块名称

    constructor(server: http.Server | https.Server, configs: BaseSocketConfig) {
        super(server, configs);

        this.on("connection", (socket, req) => {
            const result = this.onConnection(socket, req);
            if (result === false) {
                socket.close();
            } else {
                if (this._sockets.has(result)) {
                    socket.close(); //不允许一个模块重复连接
                } else {
                    this._sockets.set(result, new ConnectedSocket(socket, result));
                }
            }
        });
    }

    /**
     * 每当有一个新的连接被创建，该方法就会被触发。返回false表示拒绝连接，返回string表示接受连接。此字符串代表该接口所连接模块的名称
     * @param socket websocket
     * @param req 客户端向路由器建立连接时发送的get请求
     */
    abstract onConnection(socket: ServerSocket, req: http.IncomingMessage): false | string;

    /**
     * 为某模块连接添加白名单
     * @param srcModuleName 要添加的模块名称
     * @param destModuleName 目标模块名称
     * @param namespace 允许其访问的path命名空间
     */
    addInvokingWhiteList(srcModuleName: string, destModuleName: string, namespace: string) {
        const src = this._sockets.get(srcModuleName);
        if (src) {
            let dest = src.invokingWhiteList.get(destModuleName);
            if (dest) {
                dest.add(namespace);
            } else {
                dest = new Set();
                dest.add(namespace);
                src.invokingWhiteList.set(destModuleName, dest);
            }
        }
    }

    /**
     * 为某模块连接删除白名单
     * @param srcModuleName 要添加的模块名称
     * @param destModuleName 目标模块名称
     * @param namespace path命名空间
     */
    removeInvokingWhiteList(srcModuleName: string, destModuleName: string, namespace: string) {
        const src = this._sockets.get(srcModuleName);
        if (src) {
            const dest = src.invokingWhiteList.get(destModuleName);
            if (dest) {
                dest.delete(namespace);
            }
        }
    }
}