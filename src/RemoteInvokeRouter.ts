import * as http from 'http';
import * as https from 'https';
import { Server, ServerSocket } from 'binary-ws';
import { BaseSocketConfig } from 'binary-ws/bin/BaseSocket/interfaces/BaseSocketConfig';
import { MessageType } from 'remote-invoke';
import EventSpace from 'eventspace';
import log from 'log-formatter';

import { ConnectedModule } from './ConnectedModule';
import { ErrorType } from './ErrorType';

export abstract class RemoteInvokeRouter extends Server {

    //#region 属性与构造

    /**
     * 与路由器连接的模块    
     * key：模块名称
     */
    readonly connectedModules: Map<string, ConnectedModule> = new Map();

    /**
     * 广播消息转发中心
     */
    readonly broadcastExchangeCenter = new EventSpace();

    /**
     * 是否触发receivedMessage事件
     */
    emitReceivedMessage = false;

    /**
     * 是否触发sentMessage事件
     */
    emitSentMessage = false;

    /**
     * 是否触发exchangeError事件
     */
    emitExchangeError = false;

    /**
     * 是否打印收到和发出的消息头部（用于调试）。需要将emitReceivedMessage或emitSentMessage设置为true才生效
     */
    printMessageHeader = false;

    /**
     * 是否将发生的Exchange错误打印到控制台（用于调试）。需要将emitExchangeError设置为true才生效
     */
    printExchangeError = false;

    constructor(server: http.Server | https.Server, configs: BaseSocketConfig) {
        super(server, configs);

        this.on("connection", async (socket, req) => {
            const result = await this.onConnection(socket, req);

            if (result === false)
                socket.close();
            else {
                let module = this.connectedModules.get(result);
                if (module) { //不允许一个模块重复连接
                    socket.close();
                    this._emitExchangeError(ErrorType.duplicateConnection, module);
                } else {
                    module = new ConnectedModule(this, socket, result);
                    this.connectedModules.set(result, module);
                    this.emit('module_connected', module);
                    socket.once('close', () => {
                        this.connectedModules.delete(result);
                        this.emit('module_disconnected', module);
                    });
                }
            }
        });

        this.on("receivedMessage", (header, body, module) => {
            if (this.printMessageHeader) {
                const result = {
                    type: MessageType[header[0]],
                    sender: header[1],
                    receiver: header[2],
                    path: header[3]
                };

                log
                    .location
                    .location.green.bold.round
                    .text
                    .content.green('remote-invoke-router', '接收到', module.moduleName, JSON.stringify(result, undefined, 4));
            }
        });

        this.on("sentMessage", (header, body, module) => {
            if (this.printMessageHeader) {
                const result = {
                    type: MessageType[header[0]],
                    sender: header[1],
                    receiver: header[2],
                    path: header[3]
                };

                log
                    .location
                    .location.cyan.bold.round
                    .text
                    .content.cyan('remote-invoke-router', '发送到', module.moduleName, JSON.stringify(result, undefined, 4));
            }
        });

        this.on("exchangeError", (type, module) => {
            if (this.printExchangeError) {
                let message;

                switch (type) {
                    case ErrorType.duplicateConnection:
                        message = `模块"${module.moduleName}"重复与路由器建立连接`;
                        break;
                    case ErrorType.senderNameNotCorrect:
                        message = `模块"${module.moduleName}"发出的消息中，发送者的名称与实际模块名称不匹配`;
                        break;
                    case ErrorType.exceedPathMaxLength:
                        message = `模块"${module.moduleName}"发出的消息中，path超过了规定的长度`;
                        break;
                    case ErrorType.messageFormatError:
                        message = `模块"${module.moduleName}"发来的消息格式有问题`;
                        break;
                    case ErrorType.messageTypeError:
                        message = `模块"${module.moduleName}"发来了未知类型的消息`;
                        break;
                }

                log.warn
                    .location.white
                    .location.bold
                    .content.yellow('remote-invoke-router', module.moduleName, message);
            }
        });
    }

    //#endregion

    /**
     * 每当有一个新的连接被创建，该方法就会被触发。返回false表示拒绝连接，返回string表示接受连接。此字符串代表该接口所连接模块的名称
     * @param socket websocket
     * @param req 客户端向路由器建立连接时发送的get请求
     */
    abstract onConnection(socket: ServerSocket, req: http.IncomingMessage): Promise<false | string>;

    //#region 增减白名单

    /**
     * 为某连接添加可调用白名单
     * @param moduleName 模块名称
     * @param invokableModuleName 可调用的模块名称
     * @param namespace 允许其访问的命名空间
     */
    addInvokableWhiteList(moduleName: string, invokableModuleName: string, namespace: string) {
        const module = this.connectedModules.get(moduleName);
        if (module) module.addInvokableWhiteList(invokableModuleName, namespace);
    }

    /**
     * 为某连接删除可调用白名单
     * @param moduleName 模块名称
     * @param notInvokableModuleName 不允许调用的模块名称
     * @param namespace 不允许其访问的命名空间
     */
    removeInvokableWhiteList(moduleName: string, notInvokableModuleName: string, namespace: string) {
        const module = this.connectedModules.get(moduleName);
        if (module) module.removeInvokableWhiteList(notInvokableModuleName, namespace);
    }

    /**
     * 为某连接添加可接收广播白名单
     * @param moduleName 模块名称
     * @param receivableModuleName 可接收广播的模块名
     * @param namespace 可接收的广播命名空间
     */
    addReceivableWhiteList(moduleName: string, receivableModuleName: string, namespace: string) {
        const module = this.connectedModules.get(moduleName);
        if (module) module.addReceivableWhiteList(receivableModuleName, namespace);
    }

    /**
     * 为某连接删除可接收广播白名单
     * @param moduleName 模块名称
     * @param notReceivableModuleName 不可接收广播的模块名
     * @param namespace 不可接收的广播命名空间
     */
    removeReceivableWhiteList(moduleName: string, notReceivableModuleName: string, namespace: string) {
        const module = this.connectedModules.get(moduleName);
        if (module) module.removeReceivableWhiteList(notReceivableModuleName, namespace);
    }

    //#endregion

    //#region 事件

    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'listening', listener: () => void): this;
    on(event: 'close', listener: (err: Error) => void): this;
    on(event: 'connection', listener: (socket: ServerSocket, req: http.IncomingMessage) => void): this;
    /**
     * 当有模块真正与路由器建立上连接后触发
     */
    on(event: 'module_connected', listener: (module: ConnectedModule) => void): this;
    /**
     * 当有模块与路由器断开连接后触发
     */
    on(event: 'module_disconnected', listener: (module: ConnectedModule) => void): this;
    /**
     * 当接收到模块传来的消息后触发，通过这个可以做一些流量计数方面的工作
     */
    on(event: 'receivedMessage', listener: (header: any[], body: Buffer, module: ConnectedModule) => void): this;
    /**
     * 当向模块发出消息后触发
     */
    on(event: 'sentMessage', listener: (header: any[], body: Buffer, module: ConnectedModule) => void): this;
    /**
     * 当某个模块的行为不符合规范时触发，通过这个可以做一些模块错误计数
     */
    on(event: 'exchangeError', listener: (type: ErrorType, module: ConnectedModule) => void): this;
    on(event: any, listener: any) {
        super.on(event, listener);
        return this;
    }

    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'listening', listener: () => void): this;
    once(event: 'close', listener: (err: Error) => void): this;
    once(event: 'connection', listener: (socket: ServerSocket, req: http.IncomingMessage) => void): this;
    once(event: 'module_connected', listener: (module: ConnectedModule) => void): this;
    once(event: 'module_disconnected', listener: (module: ConnectedModule) => void): this;
    once(event: 'receivedMessage', listener: (header: any[], body: Buffer, module: ConnectedModule) => void): this;
    once(event: 'sentMessage', listener: (header: any[], body: Buffer, module: ConnectedModule) => void): this;
    once(event: 'exchangeError', listener: (type: ErrorType, module: ConnectedModule) => void): this;
    once(event: any, listener: any) {
        super.once(event, listener);
        return this;
    }

    /**
     * 触发receivedMessage事件
     */
    _emitReceivedMessage(header: any[], body: Buffer, module: ConnectedModule) {
        if (this.emitReceivedMessage)
            this.emit('receivedMessage', header, body, module);
    }

    /**
     * 触发sentMessage事件
     */
    _emitSentMessage(header: string, body: Buffer, module: ConnectedModule) {
        if (this.emitSentMessage)
            this.emit('sentMessage', JSON.parse(header), body, module);
    }

    /**
     * 触发exchangeError事件
     */
    _emitExchangeError(type: ErrorType, module: ConnectedModule) {
        if (this.emitExchangeError)
            this.emit('exchangeError', type, module);
    }

    //#endregion
}