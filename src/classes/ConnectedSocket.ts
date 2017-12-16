import { BaseSocket } from "binary-ws/bin/BaseSocket/classes/BaseSocket";
import { RemoteInvokeRouter } from "./RemoteInvokeRouter";
import { EventSpace } from "eventspace/bin/classes/EventSpace";
import { MessageType } from 'remote-invoke';

/**
 * 与路由器建立上连接的接口
 */
export class ConnectedSocket {

    /**
     * errorNumber 错误清零计时器
     */
    private _timer: NodeJS.Timer;

    /**
     * 在转发该接口消息的过程中发生了多少次错误。
     * 默认，在10分钟内如果errorNumber超过了100条则断开连接，过了10分钟没有超过则清0。
     */
    private _errorNumber: number = 0;

    /**
     * 路由器
     */
    private readonly _router: RemoteInvokeRouter;

    /**
     * 所连接的接口
     */
    private readonly _socket: BaseSocket;

    /**
     * 连接对应的模块名称    
     */
    private readonly _moduleName: string;

    /**
     * 该模块可调用其他模块的白名单列表。      
     * [其他模块的名称,命名空间]    
     */
    private readonly _invokableWhiteList = new EventSpace();

    /**
     * 该模块可以接收的广播白名单     
     * [其他模块的名称,命名空间]    
     */
    private readonly _receivableBroadcastWhiteList = new EventSpace();

    /**
     * 要接收该模块广播的其他模块名称列表     
     * key是path，value是要监听该广播的模块名
     */
    private readonly _broadcastReceiverList = new EventSpace();

    /**
     * 该模块现在正在接收的广播列表
     * [其他模块的名称,path字符串]
     */
    private readonly _broadcastReceivingList = new EventSpace();

    /**
     * 该模块想要接收但现在还没有权限接收的广播列表
     * [其他模块的名称,path字符串]
     */
    private readonly _broadcastNotReceivingList = new EventSpace();

    /**
     * 保存关于当前接口的broadcast_open_finish与broadcast_close_finish响应超时计时器
     * key:_broadcastOpenCloseIndex
     */
    private readonly _broadcastOpenCloseTimer = new Map();

    /**
     * 发送broadcast_open和broadcast_close所需的messageID
     */
    private _broadcastOpenCloseIndex: number = 0;

    /**
     * 路由需要接收该模块发来的哪些广播
     * key是path，value是要监听该广播的模块名
     */
    private readonly _routerNeedReceiveList = new EventSpace();

    constructor(router: RemoteInvokeRouter, socket: BaseSocket, moduleName: string) {
        this._router = router;
        this._socket = socket;
        this._moduleName = moduleName;

        socket.once('close', () => {
            clearTimeout(this._timer);
            this._router.connectedSockets.delete(this._moduleName);
            this._broadcastOpenCloseTimer.forEach(value => clearTimeout(value));   //清除所有计时器
        });

        socket.on("message", (title, data) => {
            try {
                const header = JSON.parse(title);

                switch (header[0]) {
                    case MessageType.invoke_request: {
                        if (header[1] === this._moduleName) {   //验证发送者的名称是否正确
                            const receiver = this._router.connectedSockets.get(header[2]);
                            if (receiver) { //验证被调用模块是否存在
                                if (header[3].length <= 256) {  //检查path长度
                                    if (this._invokableWhiteList.has([receiver._moduleName, header[3].split('/')[0]])) {    //判断是否有权访问目标模块的方法
                                        receiver.sendData(title, data);
                                        return;
                                    }
                                }
                            }
                        }

                        break;
                    }
                    case MessageType.invoke_response:
                    case MessageType.invoke_finish:
                    case MessageType.invoke_failed:
                    case MessageType.invoke_file_request:
                    case MessageType.invoke_file_response:
                    case MessageType.invoke_file_failed:
                    case MessageType.invoke_file_finish: {
                        if (header[1] === this._moduleName) {
                            const receiver = this._router.connectedSockets.get(header[2]);
                            if (receiver) {
                                if (this._invokableWhiteList.has([receiver._moduleName]) || receiver._invokableWhiteList.has([this._moduleName])) {
                                    receiver.sendData(title, data);
                                    return;
                                }
                            }
                        }
                    }
                    case MessageType.broadcast: {
                        if (header[1] === this._moduleName) {
                            if (header[3].length <= 256) {
                                const path = header[3].split('.');
                                if (this._routerNeedReceiveList.hasAncestors(path)) {   //判断路由器是否需要转发该广播
                                    const en = [this._moduleName, ...path];

                                    this._router.connectedSockets.forEach(socket => {
                                        if (socket._broadcastReceivedList.hasAncestors(path)) {
                                            socket.sendData(title, data);
                                        }
                                    });

                                    return;
                                }
                            }
                        }
                    }
                    case MessageType.broadcast_open: {

                    }
                    case MessageType.broadcast_open_finish: {

                    }
                    case MessageType.broadcast_close: {

                    }
                    case MessageType.broadcast_close_finish: {

                    }
                }

                //上面的switch分支中，如果执行成功就直接return了，剩下的都是错误情况
                this.addErrorNumber();
            } catch {
                this.addErrorNumber();
            }
        });
    }

    /**
     * 错误计数器 + 1
     */
    addErrorNumber() {
        this._errorNumber++;

        if (this._errorNumber === 1)
            this._timer = setTimeout(() => { this._errorNumber = 0 }, 10 * 60 * 1000);
        else if (this._errorNumber > 100)
            this._socket.close();
    }

    /**
     * 向该接口发送数据
     */
    sendData(header: string, data: Buffer) {
        this._socket.send(header, data).catch(() => { });
    }

    /**
     * 断开连接
     */
    close() {
        this._socket.close();
    }

    /**
     * 为该模块添加可调用白名单
     */
    addInvokableWhiteList(moduleName: string, namespace: string) {
        this._invokableWhiteList.receive([moduleName, namespace], true as any);
    }

    /**
     * 删除某项可调用白名单
     */
    removeInvokableWhiteList(moduleName: string, namespace: string) {
        this._invokableWhiteList.cancel([moduleName, namespace]);
    }

    /**
     * 添加可接收广播白名单
     */
    addReceivableBroadcastWhiteList(moduleName: string, namespace: string) {
        const en = [moduleName, namespace];
        this._receivableBroadcastWhiteList.receive(en, true as any);

        if (this._broadcastNotReceivedList.hasDescendants(en)) {   //判断之前是否申请注册过
            const src = this._broadcastNotReceivedList._eventLevel.getChildLevel(en, true);
            const dest = this._broadcastReceivedList._eventLevel.getChildLevel(en, true);

            (dest.receivers as any) = src.receivers;    //将之前注册过但不可接收的广播移动到可接收列表中
            (dest.children as any) = src.children;

            (src.receivers as any) = new Set();
            (src.children as any) = new Map();
        }
    }

    /**
     * 删除某项可接收广播白名单
     */
    removeReceivableBroadcastWhiteList(moduleName: string, namespace: string) {
        const en = [moduleName, namespace];
        this._receivableBroadcastWhiteList.cancel(en);

        if (this._broadcastReceivedList.hasDescendants(en)) {
            const src = this._broadcastReceivedList._eventLevel.getChildLevel(en, true);
            const dest = this._broadcastNotReceivedList._eventLevel.getChildLevel(en, true);

            (dest.receivers as any) = src.receivers;
            (dest.children as any) = src.children;

            (src.receivers as any) = new Set();
            (src.children as any) = new Map();
        }
    }
}