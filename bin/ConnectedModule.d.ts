import { BaseSocket } from "binary-ws/bin/BaseSocket/classes/BaseSocket";
import { RemoteInvokeRouter } from "./RemoteInvokeRouter";
/**
 * 与路由器连接上的模块
 */
export declare class ConnectedModule {
    private readonly _router;
    private readonly _socket;
    private readonly _broadcastOpenTimer;
    private _broadcastOpenIndex;
    /**
     * 该模块可调用其他模块的白名单列表。
     * [其他模块的名称,命名空间]
     */
    private readonly _invokableWhiteList;
    /**
     * 该模块可以接收的广播白名单
     * [其他模块的名称,path] -> (addOrDelete) => { 根据addOrDelete判断是向broadcastExchangeCenter中删除还是添加监听器 }
     */
    private readonly _receivableWhiteList;
    /**
     * 该模块在广播交换中心中所在的层
     */
    private readonly _broadcastExchangeLayer;
    /**
     * 连接对应的模块名称
     */
    readonly moduleName: string;
    constructor(router: RemoteInvokeRouter, socket: BaseSocket, moduleName: string);
    /**
     * 向该接口发送数据
     * @param data 消息数据，第一个是消息头部，第二个是消息body
     */
    private _sendData(data);
    /**
     * 专门用于发送广播。主要是用于避免重复发送
     */
    private _sendBroadcastData;
    /**
     * 断开连接
     */
    close(): void;
    /**
     * 添加可调用白名单
     */
    addInvokableWhiteList(moduleName: string, namespace: string): void;
    /**
     * 删除可调用白名单
     */
    removeInvokableWhiteList(moduleName: string, namespace: string): void;
    /**
     * 添加可接收广播白名单
     */
    addReceivableWhiteList(moduleName: string, namespace: string): void;
    /**
     * 删除某项可接收广播白名单
     */
    removeReceivableWhiteList(moduleName: string, namespace: string): void;
}
