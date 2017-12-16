import { BaseSocket } from "binary-ws/bin/BaseSocket/classes/BaseSocket";
import { RemoteInvokeRouter } from "./RemoteInvokeRouter";
/**
 * 与路由器建立上连接的接口
 */
export declare class ConnectedSocket {
    /**
     * errorNumber 错误清零计时器
     */
    private _errorTimer;
    /**
     * 在转发该接口消息的过程中发生了多少次错误。
     * 默认，在10分钟内如果errorNumber超过了100条则断开连接，过了10分钟没有超过则清0。
     */
    private _errorNumber;
    /**
     * 路由器
     */
    private readonly _router;
    /**
     * 所连接的接口
     */
    private readonly _socket;
    /**
     * 连接对应的模块名称
     */
    private readonly _moduleName;
    /**
     * 该模块可调用其他模块的白名单列表。
     * [其他模块的名称,命名空间]
     */
    private readonly _invokableWhiteList;
    /**
     * 该模块可以接收的广播白名单
     * [其他模块的名称,命名空间]
     */
    private readonly _receivableBroadcastWhiteList;
    /**
     * 该模块现在正在接收的广播列表
     * [其他模块的名称,path字符串]
     */
    private readonly _broadcastReceivingList;
    /**
     * 该模块想要接收但现在还没有权限接收的广播列表
     * [其他模块的名称,path字符串]
     */
    private readonly _broadcastNotReceivingList;
    /**
     * 保存关于当前接口的broadcast_open_finish与broadcast_close_finish响应超时计时器
     * key:_broadcastOpenCloseIndex
     */
    private readonly _broadcastOpenCloseTimer;
    /**
     * 发送broadcast_open和broadcast_close所需的messageID
     */
    private _broadcastOpenCloseIndex;
    constructor(router: RemoteInvokeRouter, socket: BaseSocket, moduleName: string);
    /**
     * 错误计数器 + 1
     */
    private _addErrorNumber();
    /**
     * 向该接口发送数据
     */
    private _sendData(header, data);
    /**
     * 打印收到或发送的消息header
     * @param sendOrReceive 如果是发送则为true，如果是接收则为false
     * @param msg 要打印的内容
     */
    private _printMessage(sendOrReceive, header);
    private _sendBroadcastOpenMessage(path);
    private _sendBroadcastCloseMessage(path);
    /**
     * 断开连接
     */
    close(): void;
    /**
     * 为该模块添加可调用白名单
     */
    addInvokableWhiteList(moduleName: string, namespace: string): void;
    /**
     * 删除某项可调用白名单
     */
    removeInvokableWhiteList(moduleName: string, namespace: string): void;
    /**
     * 添加可接收广播白名单
     */
    addReceivableBroadcastWhiteList(moduleName: string, namespace: string): void;
    /**
     * 删除某项可接收广播白名单
     */
    removeReceivableBroadcastWhiteList(moduleName: string, namespace: string): void;
}
