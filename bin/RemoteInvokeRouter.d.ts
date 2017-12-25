/// <reference types="node" />
import * as http from 'http';
import * as https from 'https';
import { Server, ServerSocket } from 'binary-ws';
import { BaseSocketConfig } from 'binary-ws/bin/BaseSocket/interfaces/BaseSocketConfig';
import EventSpace from 'eventspace';
import { ConnectedModule } from './ConnectedModule';
import { ErrorType } from './ErrorType';
export declare abstract class RemoteInvokeRouter extends Server {
    /**
     * 与路由器连接的模块
     * key：模块名称
     */
    readonly connectedModules: Map<string, ConnectedModule>;
    /**
     * 广播消息转发中心
     */
    readonly broadcastExchangeCenter: EventSpace<{}>;
    /**
     * 是否触发receivedMessage事件
     */
    emitReceivedMessage: boolean;
    /**
     * 是否触发sentMessage事件
     */
    emitSentMessage: boolean;
    /**
     * 是否触发exchangeError事件
     */
    emitExchangeError: boolean;
    /**
     * 是否打印收到和发出的消息头部（用于调试）。需要将emitReceivedMessage或emitSentMessage设置为true才生效
     */
    printMessageHeader: boolean;
    /**
     * 是否将发生的错误打印到控制台（用于调试）。需要将emitExchangeError设置为true才生效
     */
    printError: boolean;
    constructor(server: http.Server | https.Server, configs: BaseSocketConfig);
    /**
     * 每当有一个新的连接被创建，该方法就会被触发。返回false表示拒绝连接，返回string表示接受连接。此字符串代表该接口所连接模块的名称
     * @param socket websocket
     * @param req 客户端向路由器建立连接时发送的get请求
     */
    abstract onConnection(socket: ServerSocket, req: http.IncomingMessage): Promise<false | string>;
    /**
     * 为某连接添加可调用白名单
     * @param moduleName 模块名称
     * @param invokableModuleName 可调用的模块名称
     * @param namespace 允许其访问的命名空间
     */
    addInvokableWhiteList(moduleName: string, invokableModuleName: string, namespace: string): void;
    /**
     * 为某连接删除可调用白名单
     * @param moduleName 模块名称
     * @param notInvokableModuleName 不允许调用的模块名称
     * @param namespace 不允许其访问的命名空间
     */
    removeInvokableWhiteList(moduleName: string, notInvokableModuleName: string, namespace: string): void;
    /**
     * 为某连接添加可接收广播白名单
     * @param moduleName 模块名称
     * @param receivableModuleName 可接收广播的模块名
     * @param namespace 可接收的广播命名空间
     */
    addReceivableWhiteList(moduleName: string, receivableModuleName: string, namespace: string): void;
    /**
     * 为某连接删除可接收广播白名单
     * @param moduleName 模块名称
     * @param notReceivableModuleName 不可接收广播的模块名
     * @param namespace 不可接收的广播命名空间
     */
    removeReceivableWhiteList(moduleName: string, notReceivableModuleName: string, namespace: string): void;
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
    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'listening', listener: () => void): this;
    once(event: 'close', listener: (err: Error) => void): this;
    once(event: 'connection', listener: (socket: ServerSocket, req: http.IncomingMessage) => void): this;
    once(event: 'module_connected', listener: (module: ConnectedModule) => void): this;
    once(event: 'module_disconnected', listener: (module: ConnectedModule) => void): this;
    once(event: 'receivedMessage', listener: (header: any[], body: Buffer, module: ConnectedModule) => void): this;
    once(event: 'sentMessage', listener: (header: any[], body: Buffer, module: ConnectedModule) => void): this;
    once(event: 'exchangeError', listener: (type: ErrorType, module: ConnectedModule) => void): this;
    /**
     * 触发receivedMessage事件
     */
    _emitReceivedMessage(header: any[], body: Buffer, module: ConnectedModule): void;
    /**
     * 触发sentMessage事件
     */
    _emitSentMessage(header: string, body: Buffer, module: ConnectedModule): void;
    /**
     * 触发exchangeError事件
     */
    _emitExchangeError(type: ErrorType, module: ConnectedModule): void;
}
