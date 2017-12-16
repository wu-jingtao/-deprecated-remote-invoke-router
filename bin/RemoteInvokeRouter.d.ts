/// <reference types="node" />
import * as http from 'http';
import * as https from 'https';
import { Server } from 'binary-ws';
import { BaseSocketConfig } from 'binary-ws/bin/BaseSocket/interfaces/BaseSocketConfig';
import { ServerSocket } from 'binary-ws/bin/server/classes/ServerSocket';
import { ConnectedSocket } from './ConnectedSocket';
export declare abstract class RemoteInvokeRouter extends Server {
    /**
     * 与路由器连接的接口
     * key 接口连接的模块名称
     */
    readonly connectedSockets: Map<string, ConnectedSocket>;
    /**
     * 是否打印收到和发出的消息头部
     */
    printMessage: boolean;
    constructor(server: http.Server | https.Server, configs: BaseSocketConfig);
    /**
     * 每当有一个新的连接被创建，该方法就会被触发。返回false表示拒绝连接，返回string表示接受连接。此字符串代表该接口所连接模块的名称
     * @param socket websocket
     * @param req 客户端向路由器建立连接时发送的get请求
     */
    abstract onConnection(socket: ServerSocket, req: http.IncomingMessage): false | string;
    /**
     * 为某连接添加可调用方法白名单
     * @param moduleName 模块名称
     * @param invokableModuleName 可调用的模块名称
     * @param namespace 允许其访问的命名空间
     */
    addInvokingWhiteList(moduleName: string, invokableModuleName: string, namespace: string): void;
    /**
     * 为某连接删除可调用方法白名单
     * @param moduleName 模块名称
     * @param notInvokableModuleName 不允许调用的模块名称
     * @param namespace 不允许其访问的命名空间
     */
    removeInvokingWhiteList(moduleName: string, notInvokableModuleName: string, namespace: string): void;
    /**
     * 为某连接添加可接收广播白名单
     * @param moduleName 模块名称
     * @param receivableModuleName 可接收广播的模块名
     * @param namespace 可接收的广播命名空间
     */
    addReceivingWhiteList(moduleName: string, receivableModuleName: string, namespace: string): void;
    /**
     * 为某连接删除可接收广播白名单
     * @param moduleName 模块名称
     * @param notReceivableModuleName 不可接收广播的模块名
     * @param namespace 不可接收的广播命名空间
     */
    removeReceivingWhiteList(moduleName: string, notReceivableModuleName: string, namespace: string): void;
}
