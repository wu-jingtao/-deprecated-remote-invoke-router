"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const remote_invoke_1 = require("remote-invoke");
const eventspace_1 = require("eventspace");
const MessageData_1 = require("remote-invoke/bin/classes/MessageData");
const ErrorType_1 = require("./ErrorType");
/**
 * 与路由器连接上的模块
 */
class ConnectedModule {
    //#endregion
    constructor(router, socket, moduleName) {
        this._broadcastOpenTimer = new Map(); //保存关于当前接口的broadcast_open_finish的响应超时计时器。key:_broadcastOpenCloseIndex
        this._broadcastOpenIndex = 0; //发送broadcast_open所需的messageID
        /**
         * 该模块可调用其他模块的白名单列表。
         * [其他模块的名称,命名空间]
         */
        this._invokableWhiteList = new eventspace_1.default();
        /**
         * 该模块可以接收的广播白名单
         * [其他模块的名称,path] -> (addOrDelete) => { 根据addOrDelete判断是向broadcastExchangeCenter中删除还是添加监听器 }
         */
        this._receivableWhiteList = new eventspace_1.default();
        this._superUser = false;
        /**
         * 专门用于发送广播。主要是用于避免重复发送
         */
        this._sendBroadcastData = (data) => {
            if (!data[2].has(this)) {
                data[2].add(this);
                this._sendData(data);
            }
        };
        this._router = router;
        this._socket = socket;
        this.moduleName = moduleName;
        this._broadcastExchangeLayer = this._router.broadcastExchangeCenter.get([this.moduleName]);
        this._socket.once("close", () => {
            this._broadcastOpenTimer.forEach(value => clearInterval(value)); //清除所有计时器
            this._receivableWhiteList.triggerDescendants(false); //取消所有广播监听器
            this._receivableWhiteList.children.clear();
            this._broadcastExchangeLayer.watchOff('descendantsAddListener');
            this._broadcastExchangeLayer.watchOff('descendantsRemoveListener');
        });
        this._socket.on("message", (title, data) => {
            try {
                const header = JSON.parse(title);
                this._router._emitReceivedMessage(header, data, this);
                switch (header[0]) {
                    case remote_invoke_1.MessageType.invoke_request: {
                        if (header[1] === this.moduleName) {
                            const receiver = this._router.connectedModules.get(header[2]);
                            if (receiver) {
                                if (header[3].length <= remote_invoke_1.RemoteInvoke.pathMaxLength) {
                                    if (this._superUser || this._invokableWhiteList.get([receiver.moduleName, header[3].split('/')[0]]).data) {
                                        receiver._sendData([title, data]);
                                    }
                                    else {
                                        const msg = new MessageData_1.InvokeFailedMessage();
                                        msg.sender = header[2];
                                        msg.receiver = header[1];
                                        msg.requestMessageID = header[4];
                                        msg.error = `router：没有权限调用模块"${header[2]}"的"${header[3]}"`;
                                        this._sendData(msg.pack());
                                    }
                                }
                                else {
                                    this._router._emitExchangeError(ErrorType_1.ErrorType.exceedPathMaxLength, this);
                                }
                            }
                            else {
                                const msg = new MessageData_1.InvokeFailedMessage();
                                msg.sender = header[2];
                                msg.receiver = header[1];
                                msg.requestMessageID = header[4];
                                msg.error = `router：无法连接到模块"${header[2]}"`;
                                this._sendData(msg.pack());
                            }
                        }
                        else {
                            this._router._emitExchangeError(ErrorType_1.ErrorType.senderNameNotCorrect, this);
                        }
                        break;
                    }
                    case remote_invoke_1.MessageType.invoke_response:
                    case remote_invoke_1.MessageType.invoke_finish:
                    case remote_invoke_1.MessageType.invoke_failed:
                    case remote_invoke_1.MessageType.invoke_file_request:
                    case remote_invoke_1.MessageType.invoke_file_response:
                    case remote_invoke_1.MessageType.invoke_file_failed:
                    case remote_invoke_1.MessageType.invoke_file_finish: {
                        if (header[1] === this.moduleName) {
                            const receiver = this._router.connectedModules.get(header[2]);
                            if (receiver) {
                                if (this._superUser ||
                                    receiver._superUser ||
                                    this._invokableWhiteList.get([receiver.moduleName]).forEachDescendants(layer => layer.data) ||
                                    receiver._invokableWhiteList.get([this.moduleName]).forEachDescendants(layer => layer.data)) {
                                    receiver._sendData([title, data]);
                                }
                            }
                        }
                        else {
                            this._router._emitExchangeError(ErrorType_1.ErrorType.senderNameNotCorrect, this);
                        }
                        break;
                    }
                    case remote_invoke_1.MessageType.broadcast: {
                        if (header[1] === this.moduleName) {
                            if (header[3].length <= remote_invoke_1.RemoteInvoke.pathMaxLength) {
                                const layer = this._broadcastExchangeLayer.get(header[3].split('.'));
                                if (layer.hasAncestors()) {
                                    layer.triggerAncestors([title, data, new Set()]);
                                }
                                else {
                                    const msg = new MessageData_1.BroadcastCloseMessage();
                                    msg.broadcastSender = header[1];
                                    msg.includeAncestor = true;
                                    msg.path = header[3];
                                    this._sendData(msg.pack());
                                }
                            }
                            else {
                                this._router._emitExchangeError(ErrorType_1.ErrorType.exceedPathMaxLength, this);
                            }
                        }
                        else {
                            this._router._emitExchangeError(ErrorType_1.ErrorType.senderNameNotCorrect, this);
                        }
                        break;
                    }
                    case remote_invoke_1.MessageType.broadcast_open: {
                        const body = JSON.parse(data.toString());
                        if (body[2].length <= remote_invoke_1.RemoteInvoke.pathMaxLength) {
                            const path = [body[1], ...body[2].split('.')];
                            const wl_layer = this._receivableWhiteList.get(path);
                            if (!wl_layer.has()) {
                                const listener = wl_layer.on((addOrDelete) => {
                                    if (addOrDelete)
                                        this._router.broadcastExchangeCenter.get(path).on(this._sendBroadcastData);
                                    else
                                        this._router.broadcastExchangeCenter.get(path).off(this._sendBroadcastData);
                                });
                                if (this._superUser || this._receivableWhiteList.get(path.slice(0, 2)).data)
                                    listener(true);
                            }
                            const msg = new MessageData_1.BroadcastOpenFinishMessage(); //通知模块注册成功
                            msg.messageID = body[0];
                            this._sendData(msg.pack());
                        }
                        else {
                            this._router._emitExchangeError(ErrorType_1.ErrorType.exceedPathMaxLength, this);
                        }
                        break;
                    }
                    case remote_invoke_1.MessageType.broadcast_open_finish: {
                        const msgID = Number.parseInt(data.toString());
                        const timer = this._broadcastOpenTimer.get(msgID);
                        clearInterval(timer);
                        this._broadcastOpenTimer.delete(msgID);
                        break;
                    }
                    case remote_invoke_1.MessageType.broadcast_close: {
                        const body = JSON.parse(data.toString());
                        if (body[1].length <= remote_invoke_1.RemoteInvoke.pathMaxLength) {
                            const path = [body[0], ...body[1].split('.')];
                            const wl_layer = this._receivableWhiteList.get(path);
                            if (body[2]) {
                                wl_layer.triggerAncestors(false);
                                wl_layer.offAncestors();
                            }
                            else {
                                wl_layer.trigger(false);
                                wl_layer.off();
                            }
                        }
                        else {
                            this._router._emitExchangeError(ErrorType_1.ErrorType.exceedPathMaxLength, this);
                        }
                        break;
                    }
                    default: {
                        this._router._emitExchangeError(ErrorType_1.ErrorType.messageTypeError, this);
                        break;
                    }
                }
            }
            catch (_a) {
                this._router._emitExchangeError(ErrorType_1.ErrorType.messageFormatError, this);
            }
        });
        const send_bom = (layer) => {
            const msg = new MessageData_1.BroadcastOpenMessage();
            msg.broadcastSender = this.moduleName;
            msg.messageID = this._broadcastOpenIndex++;
            msg.path = layer.fullName.slice(1).join('.');
            const result = msg.pack();
            let fallNumber = 0; //记录请求打开失败多少次了
            const send = () => {
                this._sendData(result);
                if (fallNumber++ >= 3)
                    this.close();
            };
            this._broadcastOpenTimer.set(msg.messageID, setInterval(send, remote_invoke_1.RemoteInvoke.timeout));
            send();
        };
        this._broadcastExchangeLayer.watch('descendantsAddListener', (listener, layer) => {
            if (layer.listenerCount === 1)
                send_bom(layer);
        });
        this._broadcastExchangeLayer.watch('descendantsRemoveListener', (listener, layer) => {
            if (layer.listenerCount === 0) {
                const msg = new MessageData_1.BroadcastCloseMessage();
                msg.broadcastSender = this.moduleName;
                msg.path = layer.fullName.slice(1).join('.');
                this._sendData(msg.pack());
            }
        });
        this._broadcastExchangeLayer.forEachDescendants(layer => {
            if (layer.listenerCount > 0)
                send_bom(layer);
        });
    }
    /**
     * 该模块是否作为超级用户，可调用或接收任何模块的方法与广播
     */
    get superUser() {
        return this._superUser;
    }
    set superUser(v) {
        if (this._superUser = v) {
            this._receivableWhiteList.triggerDescendants(true);
        }
        else {
            this._receivableWhiteList.children.forEach(module_layer => {
                module_layer.children.forEach(namespace_layer => {
                    namespace_layer.triggerDescendants(namespace_layer.data);
                });
            });
        }
    }
    /**
     * 向该接口发送数据
     * @param data 消息数据，第一个是消息头部，第二个是消息body
     */
    _sendData(data) {
        this._socket.send(data[0], data[1]).catch(() => { });
        this._router._emitSentMessage(data[0], data[1], this);
    }
    /**
     * 断开连接
     */
    close() {
        this._socket.close();
    }
    //#region 增减白名单
    /**
     * 添加可调用白名单
     */
    addInvokableWhiteList(moduleName, namespace) {
        if (moduleName === this.moduleName)
            throw new Error(`模块：${moduleName}。自己不可以调用自己的方法`);
        this._invokableWhiteList.get([moduleName, namespace]).data = true;
    }
    /**
     * 删除可调用白名单
     */
    removeInvokableWhiteList(moduleName, namespace) {
        this._invokableWhiteList.get([moduleName, namespace]).data = undefined;
    }
    /**
     * 添加可接收广播白名单
     */
    addReceivableWhiteList(moduleName, namespace) {
        if (moduleName === this.moduleName)
            throw new Error(`模块：${moduleName}。自己不可以监听自己的广播`);
        const layer = this._receivableWhiteList.get([moduleName, namespace]);
        layer.data = true;
        if (!this._superUser)
            layer.triggerDescendants(true); //通知可以去broadcastExchangeCenter中注册监听器了
    }
    /**
     * 删除某项可接收广播白名单
     */
    removeReceivableWhiteList(moduleName, namespace) {
        const layer = this._receivableWhiteList.get([moduleName, namespace]);
        layer.data = undefined;
        if (!this._superUser)
            layer.triggerDescendants(false); //通知去broadcastExchangeCenter中删除监听器
    }
}
exports.ConnectedModule = ConnectedModule;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLHFDQUFxQztJQUMvRixDQUFDO0lBRUQ7O09BRUc7SUFDSCx5QkFBeUIsQ0FBQyxVQUFrQixFQUFFLFNBQWlCO1FBQzNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNyRSxLQUFLLENBQUMsSUFBSSxHQUFHLFNBQVMsQ0FBQztRQUN2QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7WUFBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxrQ0FBa0M7SUFDN0YsQ0FBQztDQUdKO0FBaFVELDBDQWdVQyIsImZpbGUiOiJDb25uZWN0ZWRNb2R1bGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNZXNzYWdlVHlwZSwgUmVtb3RlSW52b2tlIH0gZnJvbSBcInJlbW90ZS1pbnZva2VcIjtcclxuaW1wb3J0IHsgQmFzZVNvY2tldCB9IGZyb20gXCJiaW5hcnktd3MvYmluL0Jhc2VTb2NrZXQvY2xhc3Nlcy9CYXNlU29ja2V0XCI7XHJcbmltcG9ydCBFdmVudFNwYWNlIGZyb20gXCJldmVudHNwYWNlXCI7XHJcbmltcG9ydCB7IEJyb2FkY2FzdE9wZW5NZXNzYWdlLCBJbnZva2VGYWlsZWRNZXNzYWdlLCBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UsIEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlIH0gZnJvbSBcInJlbW90ZS1pbnZva2UvYmluL2NsYXNzZXMvTWVzc2FnZURhdGFcIjtcclxuXHJcbmltcG9ydCB7IFJlbW90ZUludm9rZVJvdXRlciB9IGZyb20gXCIuL1JlbW90ZUludm9rZVJvdXRlclwiO1xyXG5pbXBvcnQgeyBFcnJvclR5cGUgfSBmcm9tICcuL0Vycm9yVHlwZSc7XHJcblxyXG4vKipcclxuICog5LiO6Lev55Sx5Zmo6L+e5o6l5LiK55qE5qih5Z2XICAgICAgXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgQ29ubmVjdGVkTW9kdWxlIHtcclxuXHJcbiAgICAvLyNyZWdpb24g5bGe5oCnXHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfcm91dGVyOiBSZW1vdGVJbnZva2VSb3V0ZXI7ICAgLy/ot6/nlLHlmahcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX3NvY2tldDogQmFzZVNvY2tldDsgICAgICAgICAgIC8v5omA6L+e5o6l55qE5o6l5Y+jXHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfYnJvYWRjYXN0T3BlblRpbWVyOiBNYXA8bnVtYmVyLCBOb2RlSlMuVGltZXI+ID0gbmV3IE1hcCgpOyAgICAvL+S/neWtmOWFs+S6juW9k+WJjeaOpeWPo+eahGJyb2FkY2FzdF9vcGVuX2ZpbmlzaOeahOWTjeW6lOi2heaXtuiuoeaXtuWZqOOAgmtleTpfYnJvYWRjYXN0T3BlbkNsb3NlSW5kZXhcclxuICAgIHByaXZhdGUgX2Jyb2FkY2FzdE9wZW5JbmRleDogbnVtYmVyID0gMDsgICAgICAgIC8v5Y+R6YCBYnJvYWRjYXN0X29wZW7miYDpnIDnmoRtZXNzYWdlSURcclxuXHJcbiAgICAvKipcclxuICAgICAqIOivpeaooeWdl+WPr+iwg+eUqOWFtuS7luaooeWdl+eahOeZveWQjeWNleWIl+ihqOOAgiAgICAgIFxyXG4gICAgICogW+WFtuS7luaooeWdl+eahOWQjeensCzlkb3lkI3nqbrpl7RdICAgIFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9pbnZva2FibGVXaGl0ZUxpc3QgPSBuZXcgRXZlbnRTcGFjZSgpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6K+l5qih5Z2X5Y+v5Lul5o6l5pS255qE5bm/5pKt55m95ZCN5Y2VICAgICBcclxuICAgICAqIFvlhbbku5bmqKHlnZfnmoTlkI3np7AscGF0aF0gLT4gKGFkZE9yRGVsZXRlKSA9PiB7IOagueaNrmFkZE9yRGVsZXRl5Yik5pat5piv5ZCRYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXLkuK3liKDpmaTov5jmmK/mt7vliqDnm5HlkKzlmaggfSAgICBcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfcmVjZWl2YWJsZVdoaXRlTGlzdCA9IG5ldyBFdmVudFNwYWNlKCk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDor6XmqKHlnZflnKjlub/mkq3kuqTmjaLkuK3lv4PkuK3miYDlnKjnmoTlsYJcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfYnJvYWRjYXN0RXhjaGFuZ2VMYXllcjogRXZlbnRTcGFjZTxhbnk+O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6L+e5o6l5a+55bqU55qE5qih5Z2X5ZCN56ewICAgIFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBtb2R1bGVOYW1lOiBzdHJpbmc7XHJcblxyXG4gICAgcHJpdmF0ZSBfc3VwZXJVc2VyOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAvKipcclxuICAgICAqIOivpeaooeWdl+aYr+WQpuS9nOS4uui2hee6p+eUqOaIt++8jOWPr+iwg+eUqOaIluaOpeaUtuS7u+S9leaooeWdl+eahOaWueazleS4juW5v+aSrVxyXG4gICAgICovXHJcbiAgICBnZXQgc3VwZXJVc2VyKCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLl9zdXBlclVzZXI7XHJcbiAgICB9XHJcbiAgICBzZXQgc3VwZXJVc2VyKHY6IGJvb2xlYW4pIHtcclxuICAgICAgICBpZiAodGhpcy5fc3VwZXJVc2VyID0gdikge1xyXG4gICAgICAgICAgICB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LnRyaWdnZXJEZXNjZW5kYW50cyh0cnVlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmNoaWxkcmVuLmZvckVhY2gobW9kdWxlX2xheWVyID0+IHtcclxuICAgICAgICAgICAgICAgIG1vZHVsZV9sYXllci5jaGlsZHJlbi5mb3JFYWNoKG5hbWVzcGFjZV9sYXllciA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmFtZXNwYWNlX2xheWVyLnRyaWdnZXJEZXNjZW5kYW50cyhuYW1lc3BhY2VfbGF5ZXIuZGF0YSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vI2VuZHJlZ2lvblxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHJvdXRlcjogUmVtb3RlSW52b2tlUm91dGVyLCBzb2NrZXQ6IEJhc2VTb2NrZXQsIG1vZHVsZU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuX3JvdXRlciA9IHJvdXRlcjtcclxuICAgICAgICB0aGlzLl9zb2NrZXQgPSBzb2NrZXQ7XHJcbiAgICAgICAgdGhpcy5tb2R1bGVOYW1lID0gbW9kdWxlTmFtZTtcclxuICAgICAgICB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyID0gdGhpcy5fcm91dGVyLmJyb2FkY2FzdEV4Y2hhbmdlQ2VudGVyLmdldChbdGhpcy5tb2R1bGVOYW1lXSk7XHJcblxyXG4gICAgICAgIHRoaXMuX3NvY2tldC5vbmNlKFwiY2xvc2VcIiwgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLl9icm9hZGNhc3RPcGVuVGltZXIuZm9yRWFjaCh2YWx1ZSA9PiBjbGVhckludGVydmFsKHZhbHVlKSk7ICAgLy/muIXpmaTmiYDmnInorqHml7blmahcclxuICAgICAgICAgICAgdGhpcy5fcmVjZWl2YWJsZVdoaXRlTGlzdC50cmlnZ2VyRGVzY2VuZGFudHMoZmFsc2UpOyAgICAvL+WPlua2iOaJgOacieW5v+aSreebkeWQrOWZqFxyXG4gICAgICAgICAgICB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmNoaWxkcmVuLmNsZWFyKCk7XHJcbiAgICAgICAgICAgIHRoaXMuX2Jyb2FkY2FzdEV4Y2hhbmdlTGF5ZXIud2F0Y2hPZmYoJ2Rlc2NlbmRhbnRzQWRkTGlzdGVuZXInKTtcclxuICAgICAgICAgICAgdGhpcy5fYnJvYWRjYXN0RXhjaGFuZ2VMYXllci53YXRjaE9mZignZGVzY2VuZGFudHNSZW1vdmVMaXN0ZW5lcicpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLl9zb2NrZXQub24oXCJtZXNzYWdlXCIsICh0aXRsZSwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaGVhZGVyID0gSlNPTi5wYXJzZSh0aXRsZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRSZWNlaXZlZE1lc3NhZ2UoaGVhZGVyLCBkYXRhLCB0aGlzKTtcclxuXHJcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGhlYWRlclswXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3JlcXVlc3Q6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlclsxXSA9PT0gdGhpcy5tb2R1bGVOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWNlaXZlciA9IHRoaXMuX3JvdXRlci5jb25uZWN0ZWRNb2R1bGVzLmdldChoZWFkZXJbMl0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlY2VpdmVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlclszXS5sZW5ndGggPD0gUmVtb3RlSW52b2tlLnBhdGhNYXhMZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX3N1cGVyVXNlciB8fCB0aGlzLl9pbnZva2FibGVXaGl0ZUxpc3QuZ2V0KFtyZWNlaXZlci5tb2R1bGVOYW1lLCBoZWFkZXJbM10uc3BsaXQoJy8nKVswXV0pLmRhdGEpIHsgICAgLy/liKTmlq3mmK/lkKbmnInmnYPorr/pl67nm67moIfmqKHlnZfnmoTmlrnms5VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY2VpdmVyLl9zZW5kRGF0YShbdGl0bGUsIGRhdGFdKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IG5ldyBJbnZva2VGYWlsZWRNZXNzYWdlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtc2cuc2VuZGVyID0gaGVhZGVyWzJdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnJlY2VpdmVyID0gaGVhZGVyWzFdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnJlcXVlc3RNZXNzYWdlSUQgPSBoZWFkZXJbNF07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtc2cuZXJyb3IgPSBgcm91dGVy77ya5rKh5pyJ5p2D6ZmQ6LCD55So5qih5Z2XXCIke2hlYWRlclsyXX1cIueahFwiJHtoZWFkZXJbM119XCJgO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZERhdGEobXNnLnBhY2soKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5leGNlZWRQYXRoTWF4TGVuZ3RoLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IG5ldyBJbnZva2VGYWlsZWRNZXNzYWdlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnNlbmRlciA9IGhlYWRlclsyXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtc2cucmVjZWl2ZXIgPSBoZWFkZXJbMV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnJlcXVlc3RNZXNzYWdlSUQgPSBoZWFkZXJbNF07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLmVycm9yID0gYHJvdXRlcu+8muaXoOazlei/nuaOpeWIsOaooeWdl1wiJHtoZWFkZXJbMl19XCJgO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKG1zZy5wYWNrKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuc2VuZGVyTmFtZU5vdENvcnJlY3QsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfcmVzcG9uc2U6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmluaXNoOlxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZhaWxlZDpcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX3JlcXVlc3Q6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXNwb25zZTpcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZhaWxlZDpcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9maWxlX2ZpbmlzaDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyWzFdID09PSB0aGlzLm1vZHVsZU5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlY2VpdmVyID0gdGhpcy5fcm91dGVyLmNvbm5lY3RlZE1vZHVsZXMuZ2V0KGhlYWRlclsyXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVjZWl2ZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fc3VwZXJVc2VyIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY2VpdmVyLl9zdXBlclVzZXIgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5faW52b2thYmxlV2hpdGVMaXN0LmdldChbcmVjZWl2ZXIubW9kdWxlTmFtZV0pLmZvckVhY2hEZXNjZW5kYW50cyhsYXllciA9PiBsYXllci5kYXRhIGFzIGFueSkgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjZWl2ZXIuX2ludm9rYWJsZVdoaXRlTGlzdC5nZXQoW3RoaXMubW9kdWxlTmFtZV0pLmZvckVhY2hEZXNjZW5kYW50cyhsYXllciA9PiBsYXllci5kYXRhIGFzIGFueSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjZWl2ZXIuX3NlbmREYXRhKFt0aXRsZSwgZGF0YV0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdEV4Y2hhbmdlRXJyb3IoRXJyb3JUeXBlLnNlbmRlck5hbWVOb3RDb3JyZWN0LCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0OiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoZWFkZXJbMV0gPT09IHRoaXMubW9kdWxlTmFtZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlclszXS5sZW5ndGggPD0gUmVtb3RlSW52b2tlLnBhdGhNYXhMZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXllciA9IHRoaXMuX2Jyb2FkY2FzdEV4Y2hhbmdlTGF5ZXIuZ2V0KGhlYWRlclszXS5zcGxpdCgnLicpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobGF5ZXIuaGFzQW5jZXN0b3JzKCkpIHsgICAgLy/mmK/lkKbmnInkurrms6jlhozor6Xlub/mkq1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGF5ZXIudHJpZ2dlckFuY2VzdG9ycyhbdGl0bGUsIGRhdGEsIG5ldyBTZXQoKV0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7ICAgIC8v5rKh5pyJ5Lq65rOo5YaM6L+H5bCx6YCa55+l5Lul5ZCO5LiN6KaB5YaN5Y+R5LqGXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IG5ldyBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLmJyb2FkY2FzdFNlbmRlciA9IGhlYWRlclsxXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLmluY2x1ZGVBbmNlc3RvciA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5wYXRoID0gaGVhZGVyWzNdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kRGF0YShtc2cucGFjaygpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdEV4Y2hhbmdlRXJyb3IoRXJyb3JUeXBlLmV4Y2VlZFBhdGhNYXhMZW5ndGgsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuc2VuZGVyTmFtZU5vdENvcnJlY3QsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3Rfb3Blbjoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShkYXRhLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYm9keVsyXS5sZW5ndGggPD0gUmVtb3RlSW52b2tlLnBhdGhNYXhMZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhdGggPSBbYm9keVsxXSwgLi4uYm9keVsyXS5zcGxpdCgnLicpXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHdsX2xheWVyID0gdGhpcy5fcmVjZWl2YWJsZVdoaXRlTGlzdC5nZXQocGF0aCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF3bF9sYXllci5oYXMoKSkgeyAgIC8v56Gu5L+d5LiN5Zyo55m95ZCN5Y2V5Lit6YeN5aSN5rOo5YaMXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGlzdGVuZXIgPSB3bF9sYXllci5vbigoYWRkT3JEZWxldGU6IGJvb2xlYW4pID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFkZE9yRGVsZXRlKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLmJyb2FkY2FzdEV4Y2hhbmdlQ2VudGVyLmdldChwYXRoKS5vbih0aGlzLl9zZW5kQnJvYWRjYXN0RGF0YSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5icm9hZGNhc3RFeGNoYW5nZUNlbnRlci5nZXQocGF0aCkub2ZmKHRoaXMuX3NlbmRCcm9hZGNhc3REYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX3N1cGVyVXNlciB8fCB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmdldChwYXRoLnNsaWNlKDAsIDIpKS5kYXRhKSAvL+WmguaenOivpei3r+W+hOWMheWQq+WcqOeZveWQjeWNleS4re+8jOWwseeri+WNs+WOu+azqOWGjFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcih0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UoKTsgIC8v6YCa55+l5qih5Z2X5rOo5YaM5oiQ5YqfXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtc2cubWVzc2FnZUlEID0gYm9keVswXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKG1zZy5wYWNrKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuZXhjZWVkUGF0aE1heExlbmd0aCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2dJRCA9IE51bWJlci5wYXJzZUludChkYXRhLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0aW1lciA9IHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5nZXQobXNnSUQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5kZWxldGUobXNnSUQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGRhdGEudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChib2R5WzFdLmxlbmd0aCA8PSBSZW1vdGVJbnZva2UucGF0aE1heExlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IFtib2R5WzBdLCAuLi5ib2R5WzFdLnNwbGl0KCcuJyldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgd2xfbGF5ZXIgPSB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmdldChwYXRoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYm9keVsyXSkgeyAgLy/mmK/lkKbov57lkIzniLbnuqfkuIDotbfmuIXnkIZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3bF9sYXllci50cmlnZ2VyQW5jZXN0b3JzKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3bF9sYXllci5vZmZBbmNlc3RvcnMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2xfbGF5ZXIudHJpZ2dlcihmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2xfbGF5ZXIub2ZmKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5leGNlZWRQYXRoTWF4TGVuZ3RoLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUubWVzc2FnZVR5cGVFcnJvciwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5tZXNzYWdlRm9ybWF0RXJyb3IsIHRoaXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNlbmRfYm9tID0gKGxheWVyOiBFdmVudFNwYWNlPGFueT4pID0+IHsgIC8v5ZCR5qih5Z2X5Y+R6YCB5omT5byA5bm/5pKt6K+35rGCXHJcbiAgICAgICAgICAgIGNvbnN0IG1zZyA9IG5ldyBCcm9hZGNhc3RPcGVuTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICBtc2cuYnJvYWRjYXN0U2VuZGVyID0gdGhpcy5tb2R1bGVOYW1lO1xyXG4gICAgICAgICAgICBtc2cubWVzc2FnZUlEID0gdGhpcy5fYnJvYWRjYXN0T3BlbkluZGV4Kys7XHJcbiAgICAgICAgICAgIG1zZy5wYXRoID0gbGF5ZXIuZnVsbE5hbWUuc2xpY2UoMSkuam9pbignLicpO1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBtc2cucGFjaygpO1xyXG5cclxuICAgICAgICAgICAgbGV0IGZhbGxOdW1iZXIgPSAwOyAvL+iusOW9leivt+axguaJk+W8gOWksei0peWkmuWwkeasoeS6hlxyXG5cclxuICAgICAgICAgICAgY29uc3Qgc2VuZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKHJlc3VsdCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZmFsbE51bWJlcisrID49IDMpIHRoaXMuY2xvc2UoKTtcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5zZXQobXNnLm1lc3NhZ2VJRCwgc2V0SW50ZXJ2YWwoc2VuZCwgUmVtb3RlSW52b2tlLnRpbWVvdXQpKTtcclxuXHJcbiAgICAgICAgICAgIHNlbmQoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyLndhdGNoKCdkZXNjZW5kYW50c0FkZExpc3RlbmVyJywgKGxpc3RlbmVyLCBsYXllcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAobGF5ZXIubGlzdGVuZXJDb3VudCA9PT0gMSkgICAvL+ivtOaYjumcgOimgeaJk+W8gOaWsOeahOW5v+aSrXBhdGhcclxuICAgICAgICAgICAgICAgIHNlbmRfYm9tKGxheWVyKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5fYnJvYWRjYXN0RXhjaGFuZ2VMYXllci53YXRjaCgnZGVzY2VuZGFudHNSZW1vdmVMaXN0ZW5lcicsIChsaXN0ZW5lciwgbGF5ZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKGxheWVyLmxpc3RlbmVyQ291bnQgPT09IDApIHsgLy/or7TmmI7pnIDopoHlhbPpl63mn5DkuKrlub/mkq1wYXRoXHJcbiAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBtc2cuYnJvYWRjYXN0U2VuZGVyID0gdGhpcy5tb2R1bGVOYW1lO1xyXG4gICAgICAgICAgICAgICAgbXNnLnBhdGggPSBsYXllci5mdWxsTmFtZS5zbGljZSgxKS5qb2luKCcuJyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9zZW5kRGF0YShtc2cucGFjaygpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyLmZvckVhY2hEZXNjZW5kYW50cyhsYXllciA9PiB7ICAvL+ajgOafpeacieWTquS6m+W5v+aSreW3suiiq+azqOWGjOS6hlxyXG4gICAgICAgICAgICBpZiAobGF5ZXIubGlzdGVuZXJDb3VudCA+IDApXHJcbiAgICAgICAgICAgICAgICBzZW5kX2JvbShsYXllcik7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlkJHor6XmjqXlj6Plj5HpgIHmlbDmja5cclxuICAgICAqIEBwYXJhbSBkYXRhIOa2iOaBr+aVsOaNru+8jOesrOS4gOS4quaYr+a2iOaBr+WktOmDqO+8jOesrOS6jOS4quaYr+a2iOaBr2JvZHlcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZERhdGEoZGF0YTogW3N0cmluZywgQnVmZmVyXSkge1xyXG4gICAgICAgIHRoaXMuX3NvY2tldC5zZW5kKGRhdGFbMF0sIGRhdGFbMV0pLmNhdGNoKCgpID0+IHsgfSk7XHJcbiAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0U2VudE1lc3NhZ2UoZGF0YVswXSwgZGF0YVsxXSwgdGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuJPpl6jnlKjkuo7lj5HpgIHlub/mkq3jgILkuLvopoHmmK/nlKjkuo7pgb/lhY3ph43lpI3lj5HpgIFcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZEJyb2FkY2FzdERhdGEgPSAoZGF0YTogW3N0cmluZywgQnVmZmVyLCBTZXQ8Q29ubmVjdGVkTW9kdWxlPl0pID0+IHtcclxuICAgICAgICBpZiAoIWRhdGFbMl0uaGFzKHRoaXMpKSB7ICAgLy/liKTmlq3mmK/lkKblt7Lnu4/lkJHor6XmqKHlnZfovazlj5Hov4fkuoZcclxuICAgICAgICAgICAgZGF0YVsyXS5hZGQodGhpcyk7XHJcbiAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKGRhdGEgYXMgYW55KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmlq3lvIDov57mjqVcclxuICAgICAqL1xyXG4gICAgY2xvc2UoKSB7XHJcbiAgICAgICAgdGhpcy5fc29ja2V0LmNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8jcmVnaW9uIOWinuWHj+eZveWQjeWNlVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5re75Yqg5Y+v6LCD55So55m95ZCN5Y2VXHJcbiAgICAgKi9cclxuICAgIGFkZEludm9rYWJsZVdoaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKG1vZHVsZU5hbWUgPT09IHRoaXMubW9kdWxlTmFtZSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmqKHlnZfvvJoke21vZHVsZU5hbWV944CC6Ieq5bex5LiN5Y+v5Lul6LCD55So6Ieq5bex55qE5pa55rOVYCk7XHJcblxyXG4gICAgICAgIHRoaXMuX2ludm9rYWJsZVdoaXRlTGlzdC5nZXQoW21vZHVsZU5hbWUsIG5hbWVzcGFjZV0pLmRhdGEgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Yig6Zmk5Y+v6LCD55So55m95ZCN5Y2VXHJcbiAgICAgKi9cclxuICAgIHJlbW92ZUludm9rYWJsZVdoaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5faW52b2thYmxlV2hpdGVMaXN0LmdldChbbW9kdWxlTmFtZSwgbmFtZXNwYWNlXSkuZGF0YSA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOa3u+WKoOWPr+aOpeaUtuW5v+aSreeZveWQjeWNlVxyXG4gICAgICovXHJcbiAgICBhZGRSZWNlaXZhYmxlV2hpdGVMaXN0KG1vZHVsZU5hbWU6IHN0cmluZywgbmFtZXNwYWNlOiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAobW9kdWxlTmFtZSA9PT0gdGhpcy5tb2R1bGVOYW1lKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaooeWdl++8miR7bW9kdWxlTmFtZX3jgILoh6rlt7HkuI3lj6/ku6Xnm5HlkKzoh6rlt7HnmoTlub/mkq1gKTtcclxuXHJcbiAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmdldChbbW9kdWxlTmFtZSwgbmFtZXNwYWNlXSk7XHJcbiAgICAgICAgbGF5ZXIuZGF0YSA9IHRydWU7XHJcbiAgICAgICAgaWYgKCF0aGlzLl9zdXBlclVzZXIpIGxheWVyLnRyaWdnZXJEZXNjZW5kYW50cyh0cnVlKTsgLy/pgJrnn6Xlj6/ku6Xljrticm9hZGNhc3RFeGNoYW5nZUNlbnRlcuS4reazqOWGjOebkeWQrOWZqOS6hlxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Yig6Zmk5p+Q6aG55Y+v5o6l5pS25bm/5pKt55m95ZCN5Y2VXHJcbiAgICAgKi9cclxuICAgIHJlbW92ZVJlY2VpdmFibGVXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IGxheWVyID0gdGhpcy5fcmVjZWl2YWJsZVdoaXRlTGlzdC5nZXQoW21vZHVsZU5hbWUsIG5hbWVzcGFjZV0pO1xyXG4gICAgICAgIGxheWVyLmRhdGEgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLl9zdXBlclVzZXIpIGxheWVyLnRyaWdnZXJEZXNjZW5kYW50cyhmYWxzZSk7IC8v6YCa55+l5Y67YnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXLkuK3liKDpmaTnm5HlkKzlmahcclxuICAgIH1cclxuXHJcbiAgICAvLyNlbmRyZWdpb25cclxufSJdfQ==
