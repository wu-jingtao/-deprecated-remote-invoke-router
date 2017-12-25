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
        /**
         * 向该接口发送数据
         * @param data 消息数据，第一个是消息头部，第二个是消息body
         */
        this._sendData = (data) => {
            this._socket.send(data[0], data[1]).catch(() => { });
            this._router._emitSentMessage(data[0], data[1], this);
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
                                    if (this._invokableWhiteList.get([receiver.moduleName, header[3].split('/')[0]]).data) {
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
                                if (this._invokableWhiteList.get([receiver.moduleName]).forEachDescendants(layer => layer.data)
                                    || receiver._invokableWhiteList.get([this.moduleName]).forEachDescendants(layer => layer.data)) {
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
                                    layer.triggerAncestors([header, title, data]);
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
                                        this._router.broadcastExchangeCenter.get(path).on(this._sendData);
                                    else
                                        this._router.broadcastExchangeCenter.get(path).off(this._sendData);
                                });
                                if (this._receivableWhiteList.get([path[0], path[1]]).data)
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
            msg.path = layer.fullName.slice(2).join('.');
            const result = msg.pack();
            let fallNumber = 0; //记录请求打开失败多少次了
            this._broadcastOpenTimer.set(msg.messageID, setInterval(() => {
                this._sendData(result);
                if (fallNumber++ >= 3)
                    this.close();
            }, remote_invoke_1.RemoteInvoke.timeout));
        };
        this._broadcastExchangeLayer.watch('descendantsAddListener', (listener, layer) => {
            if (layer.listenerCount === 1)
                send_bom(layer);
        });
        this._broadcastExchangeLayer.watch('descendantsRemoveListener', (listener, layer) => {
            if (layer.listenerCount === 0) {
                const msg = new MessageData_1.BroadcastCloseMessage();
                msg.broadcastSender = this.moduleName;
                msg.path = layer.fullName.slice(2).join('.');
                this._sendData(msg.pack());
            }
        });
        this._broadcastExchangeLayer.forEachDescendants(layer => {
            if (layer.listenerCount > 0)
                send_bom(layer);
        });
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
        layer.triggerDescendants(true); //通知可以去broadcastExchangeCenter中注册监听器了
    }
    /**
     * 删除某项可接收广播白名单
     */
    removeReceivableWhiteList(moduleName, namespace) {
        const layer = this._receivableWhiteList.get([moduleName, namespace]);
        layer.data = undefined;
        layer.triggerDescendants(false); //通知去broadcastExchangeCenter中删除监听器
    }
}
exports.ConnectedModule = ConnectedModule;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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a0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLHFDQUFxQztJQUN6RSxDQUFDO0lBRUQ7O09BRUc7SUFDSCx5QkFBeUIsQ0FBQyxVQUFrQixFQUFFLFNBQWlCO1FBQzNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNyRSxLQUFLLENBQUMsSUFBSSxHQUFHLFNBQVMsQ0FBQztRQUN2QixLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxrQ0FBa0M7SUFDdkUsQ0FBQztDQUdKO0FBN1JELDBDQTZSQyIsImZpbGUiOiJDb25uZWN0ZWRNb2R1bGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNZXNzYWdlVHlwZSwgUmVtb3RlSW52b2tlIH0gZnJvbSBcInJlbW90ZS1pbnZva2VcIjtcclxuaW1wb3J0IHsgQmFzZVNvY2tldCB9IGZyb20gXCJiaW5hcnktd3MvYmluL0Jhc2VTb2NrZXQvY2xhc3Nlcy9CYXNlU29ja2V0XCI7XHJcbmltcG9ydCBsb2cgZnJvbSAnbG9nLWZvcm1hdHRlcic7XHJcbmltcG9ydCBFdmVudFNwYWNlIGZyb20gXCJldmVudHNwYWNlXCI7XHJcbmltcG9ydCB7IEJyb2FkY2FzdE9wZW5NZXNzYWdlLCBJbnZva2VGYWlsZWRNZXNzYWdlLCBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UsIEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlIH0gZnJvbSBcInJlbW90ZS1pbnZva2UvYmluL2NsYXNzZXMvTWVzc2FnZURhdGFcIjtcclxuXHJcbmltcG9ydCB7IFJlbW90ZUludm9rZVJvdXRlciB9IGZyb20gXCIuL1JlbW90ZUludm9rZVJvdXRlclwiO1xyXG5pbXBvcnQgeyBFcnJvclR5cGUgfSBmcm9tICcuL0Vycm9yVHlwZSc7XHJcblxyXG4vKipcclxuICog5LiO6Lev55Sx5Zmo6L+e5o6l5LiK55qE5qih5Z2XICAgICAgXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgQ29ubmVjdGVkTW9kdWxlIHtcclxuXHJcbiAgICAvLyNyZWdpb24g5bGe5oCnXHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfcm91dGVyOiBSZW1vdGVJbnZva2VSb3V0ZXI7ICAgLy/ot6/nlLHlmahcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX3NvY2tldDogQmFzZVNvY2tldDsgICAgICAgICAgIC8v5omA6L+e5o6l55qE5o6l5Y+jXHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfYnJvYWRjYXN0T3BlblRpbWVyOiBNYXA8bnVtYmVyLCBOb2RlSlMuVGltZXI+ID0gbmV3IE1hcCgpOyAgICAvL+S/neWtmOWFs+S6juW9k+WJjeaOpeWPo+eahGJyb2FkY2FzdF9vcGVuX2ZpbmlzaOeahOWTjeW6lOi2heaXtuiuoeaXtuWZqOOAgmtleTpfYnJvYWRjYXN0T3BlbkNsb3NlSW5kZXhcclxuICAgIHByaXZhdGUgX2Jyb2FkY2FzdE9wZW5JbmRleDogbnVtYmVyID0gMDsgICAgICAgIC8v5Y+R6YCBYnJvYWRjYXN0X29wZW7miYDpnIDnmoRtZXNzYWdlSURcclxuXHJcbiAgICAvKipcclxuICAgICAqIOivpeaooeWdl+WPr+iwg+eUqOWFtuS7luaooeWdl+eahOeZveWQjeWNleWIl+ihqOOAgiAgICAgIFxyXG4gICAgICogW+WFtuS7luaooeWdl+eahOWQjeensCzlkb3lkI3nqbrpl7RdICAgIFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9pbnZva2FibGVXaGl0ZUxpc3QgPSBuZXcgRXZlbnRTcGFjZSgpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6K+l5qih5Z2X5Y+v5Lul5o6l5pS255qE5bm/5pKt55m95ZCN5Y2VICAgICBcclxuICAgICAqIFvlhbbku5bmqKHlnZfnmoTlkI3np7AscGF0aF0gLT4gKGFkZE9yRGVsZXRlKSA9PiB7IOagueaNrmFkZE9yRGVsZXRl5Yik5pat5piv5ZCRYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXLkuK3liKDpmaTov5jmmK/mt7vliqDnm5HlkKzlmaggfSAgICBcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfcmVjZWl2YWJsZVdoaXRlTGlzdCA9IG5ldyBFdmVudFNwYWNlKCk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDor6XmqKHlnZflnKjlub/mkq3kuqTmjaLkuK3lv4PkuK3miYDlnKjnmoTlsYJcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfYnJvYWRjYXN0RXhjaGFuZ2VMYXllcjogRXZlbnRTcGFjZTxhbnk+O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6L+e5o6l5a+55bqU55qE5qih5Z2X5ZCN56ewICAgIFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBtb2R1bGVOYW1lOiBzdHJpbmc7XHJcblxyXG4gICAgLy8jZW5kcmVnaW9uXHJcblxyXG4gICAgY29uc3RydWN0b3Iocm91dGVyOiBSZW1vdGVJbnZva2VSb3V0ZXIsIHNvY2tldDogQmFzZVNvY2tldCwgbW9kdWxlTmFtZTogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5fcm91dGVyID0gcm91dGVyO1xyXG4gICAgICAgIHRoaXMuX3NvY2tldCA9IHNvY2tldDtcclxuICAgICAgICB0aGlzLm1vZHVsZU5hbWUgPSBtb2R1bGVOYW1lO1xyXG4gICAgICAgIHRoaXMuX2Jyb2FkY2FzdEV4Y2hhbmdlTGF5ZXIgPSB0aGlzLl9yb3V0ZXIuYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXIuZ2V0KFt0aGlzLm1vZHVsZU5hbWVdKTtcclxuXHJcbiAgICAgICAgdGhpcy5fc29ja2V0Lm9uY2UoXCJjbG9zZVwiLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5mb3JFYWNoKHZhbHVlID0+IGNsZWFySW50ZXJ2YWwodmFsdWUpKTsgICAvL+a4hemZpOaJgOacieiuoeaXtuWZqFxyXG4gICAgICAgICAgICB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LnRyaWdnZXJEZXNjZW5kYW50cyhmYWxzZSk7ICAgIC8v5Y+W5raI5omA5pyJ5bm/5pKt55uR5ZCs5ZmoXHJcbiAgICAgICAgICAgIHRoaXMuX3JlY2VpdmFibGVXaGl0ZUxpc3QuY2hpbGRyZW4uY2xlYXIoKTtcclxuICAgICAgICAgICAgdGhpcy5fYnJvYWRjYXN0RXhjaGFuZ2VMYXllci53YXRjaE9mZignZGVzY2VuZGFudHNBZGRMaXN0ZW5lcicpO1xyXG4gICAgICAgICAgICB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyLndhdGNoT2ZmKCdkZXNjZW5kYW50c1JlbW92ZUxpc3RlbmVyJyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuX3NvY2tldC5vbihcIm1lc3NhZ2VcIiwgKHRpdGxlLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoZWFkZXIgPSBKU09OLnBhcnNlKHRpdGxlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdFJlY2VpdmVkTWVzc2FnZShoZWFkZXIsIGRhdGEsIHRoaXMpO1xyXG5cclxuICAgICAgICAgICAgICAgIHN3aXRjaCAoaGVhZGVyWzBdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfcmVxdWVzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyWzFdID09PSB0aGlzLm1vZHVsZU5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlY2VpdmVyID0gdGhpcy5fcm91dGVyLmNvbm5lY3RlZE1vZHVsZXMuZ2V0KGhlYWRlclsyXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVjZWl2ZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyWzNdLmxlbmd0aCA8PSBSZW1vdGVJbnZva2UucGF0aE1heExlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5faW52b2thYmxlV2hpdGVMaXN0LmdldChbcmVjZWl2ZXIubW9kdWxlTmFtZSwgaGVhZGVyWzNdLnNwbGl0KCcvJylbMF1dKS5kYXRhKSB7ICAgIC8v5Yik5pat5piv5ZCm5pyJ5p2D6K6/6Zeu55uu5qCH5qih5Z2X55qE5pa55rOVXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWNlaXZlci5fc2VuZERhdGEoW3RpdGxlLCBkYXRhXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgSW52b2tlRmFpbGVkTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnNlbmRlciA9IGhlYWRlclsyXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5yZWNlaXZlciA9IGhlYWRlclsxXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5yZXF1ZXN0TWVzc2FnZUlEID0gaGVhZGVyWzRdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLmVycm9yID0gYHJvdXRlcu+8muayoeacieadg+mZkOiwg+eUqOaooeWdl1wiJHtoZWFkZXJbMl19XCLnmoRcIiR7aGVhZGVyWzNdfVwiYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKG1zZy5wYWNrKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuZXhjZWVkUGF0aE1heExlbmd0aCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgSW52b2tlRmFpbGVkTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5zZW5kZXIgPSBoZWFkZXJbMl07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnJlY2VpdmVyID0gaGVhZGVyWzFdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5yZXF1ZXN0TWVzc2FnZUlEID0gaGVhZGVyWzRdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5lcnJvciA9IGByb3V0ZXLvvJrml6Dms5Xov57mjqXliLDmqKHlnZdcIiR7aGVhZGVyWzJdfVwiYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kRGF0YShtc2cucGFjaygpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdEV4Y2hhbmdlRXJyb3IoRXJyb3JUeXBlLnNlbmRlck5hbWVOb3RDb3JyZWN0LCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlOlxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaDpcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0OlxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2U6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2g6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlclsxXSA9PT0gdGhpcy5tb2R1bGVOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWNlaXZlciA9IHRoaXMuX3JvdXRlci5jb25uZWN0ZWRNb2R1bGVzLmdldChoZWFkZXJbMl0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlY2VpdmVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX2ludm9rYWJsZVdoaXRlTGlzdC5nZXQoW3JlY2VpdmVyLm1vZHVsZU5hbWVdKS5mb3JFYWNoRGVzY2VuZGFudHMobGF5ZXIgPT4gbGF5ZXIuZGF0YSBhcyBhbnkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHx8IHJlY2VpdmVyLl9pbnZva2FibGVXaGl0ZUxpc3QuZ2V0KFt0aGlzLm1vZHVsZU5hbWVdKS5mb3JFYWNoRGVzY2VuZGFudHMobGF5ZXIgPT4gbGF5ZXIuZGF0YSBhcyBhbnkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY2VpdmVyLl9zZW5kRGF0YShbIHRpdGxlLCBkYXRhXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuc2VuZGVyTmFtZU5vdENvcnJlY3QsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3Q6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlclsxXSA9PT0gdGhpcy5tb2R1bGVOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyWzNdLmxlbmd0aCA8PSBSZW1vdGVJbnZva2UucGF0aE1heExlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxheWVyID0gdGhpcy5fYnJvYWRjYXN0RXhjaGFuZ2VMYXllci5nZXQoaGVhZGVyWzNdLnNwbGl0KCcuJykpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXllci5oYXNBbmNlc3RvcnMoKSkgeyAgICAvL+aYr+WQpuacieS6uuazqOWGjOivpeW5v+aSrVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXllci50cmlnZ2VyQW5jZXN0b3JzKFtoZWFkZXIsIHRpdGxlLCBkYXRhXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHsgICAgLy/msqHmnInkurrms6jlhozov4flsLHpgJrnn6Xku6XlkI7kuI3opoHlho3lj5HkuoZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbXNnID0gbmV3IEJyb2FkY2FzdENsb3NlTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtc2cuYnJvYWRjYXN0U2VuZGVyID0gaGVhZGVyWzFdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtc2cuaW5jbHVkZUFuY2VzdG9yID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnBhdGggPSBoZWFkZXJbM107XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKG1zZy5wYWNrKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuZXhjZWVkUGF0aE1heExlbmd0aCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5zZW5kZXJOYW1lTm90Q29ycmVjdCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGRhdGEudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChib2R5WzJdLmxlbmd0aCA8PSBSZW1vdGVJbnZva2UucGF0aE1heExlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IFtib2R5WzFdLCAuLi5ib2R5WzJdLnNwbGl0KCcuJyldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgd2xfbGF5ZXIgPSB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmdldChwYXRoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXdsX2xheWVyLmhhcygpKSB7ICAgLy/noa7kv53kuI3lnKjnmb3lkI3ljZXkuK3ph43lpI3ms6jlhoxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsaXN0ZW5lciA9IHdsX2xheWVyLm9uKChhZGRPckRlbGV0ZTogYm9vbGVhbikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWRkT3JEZWxldGUpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXIuZ2V0KHBhdGgpLm9uKHRoaXMuX3NlbmREYXRhKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLmJyb2FkY2FzdEV4Y2hhbmdlQ2VudGVyLmdldChwYXRoKS5vZmYodGhpcy5fc2VuZERhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fcmVjZWl2YWJsZVdoaXRlTGlzdC5nZXQoW3BhdGhbMF0sIHBhdGhbMV1dKS5kYXRhKSAvL+WmguaenOivpei3r+W+hOWMheWQq+WcqOeZveWQjeWNleS4re+8jOWwseeri+WNs+WOu+azqOWGjFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcih0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UoKTsgIC8v6YCa55+l5qih5Z2X5rOo5YaM5oiQ5YqfXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtc2cubWVzc2FnZUlEID0gYm9keVswXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKG1zZy5wYWNrKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuZXhjZWVkUGF0aE1heExlbmd0aCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2dJRCA9IE51bWJlci5wYXJzZUludChkYXRhLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0aW1lciA9IHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5nZXQobXNnSUQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5kZWxldGUobXNnSUQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGRhdGEudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChib2R5WzFdLmxlbmd0aCA8PSBSZW1vdGVJbnZva2UucGF0aE1heExlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IFtib2R5WzBdLCAuLi5ib2R5WzFdLnNwbGl0KCcuJyldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgd2xfbGF5ZXIgPSB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmdldChwYXRoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYm9keVsyXSkgeyAgLy/mmK/lkKbov57lkIzniLbnuqfkuIDotbfmuIXnkIZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3bF9sYXllci50cmlnZ2VyQW5jZXN0b3JzKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3bF9sYXllci5vZmZBbmNlc3RvcnMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2xfbGF5ZXIudHJpZ2dlcihmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2xfbGF5ZXIub2ZmKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5leGNlZWRQYXRoTWF4TGVuZ3RoLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUubWVzc2FnZVR5cGVFcnJvciwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5tZXNzYWdlRm9ybWF0RXJyb3IsIHRoaXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNlbmRfYm9tID0gKGxheWVyOiBFdmVudFNwYWNlPGFueT4pID0+IHsgIC8v5ZCR5qih5Z2X5Y+R6YCB5omT5byA5bm/5pKt6K+35rGCXHJcbiAgICAgICAgICAgIGNvbnN0IG1zZyA9IG5ldyBCcm9hZGNhc3RPcGVuTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICBtc2cuYnJvYWRjYXN0U2VuZGVyID0gdGhpcy5tb2R1bGVOYW1lO1xyXG4gICAgICAgICAgICBtc2cubWVzc2FnZUlEID0gdGhpcy5fYnJvYWRjYXN0T3BlbkluZGV4Kys7XHJcbiAgICAgICAgICAgIG1zZy5wYXRoID0gbGF5ZXIuZnVsbE5hbWUuc2xpY2UoMikuam9pbignLicpO1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBtc2cucGFjaygpO1xyXG5cclxuICAgICAgICAgICAgbGV0IGZhbGxOdW1iZXIgPSAwOyAvL+iusOW9leivt+axguaJk+W8gOWksei0peWkmuWwkeasoeS6hlxyXG5cclxuICAgICAgICAgICAgdGhpcy5fYnJvYWRjYXN0T3BlblRpbWVyLnNldChtc2cubWVzc2FnZUlELCBzZXRJbnRlcnZhbCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9zZW5kRGF0YShyZXN1bHQpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGZhbGxOdW1iZXIrKyA+PSAzKSB0aGlzLmNsb3NlKCk7XHJcbiAgICAgICAgICAgIH0sIFJlbW90ZUludm9rZS50aW1lb3V0KSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5fYnJvYWRjYXN0RXhjaGFuZ2VMYXllci53YXRjaCgnZGVzY2VuZGFudHNBZGRMaXN0ZW5lcicsIChsaXN0ZW5lciwgbGF5ZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKGxheWVyLmxpc3RlbmVyQ291bnQgPT09IDEpICAgLy/or7TmmI7pnIDopoHmiZPlvIDmlrDnmoTlub/mkq1wYXRoXHJcbiAgICAgICAgICAgICAgICBzZW5kX2JvbShsYXllcik7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuX2Jyb2FkY2FzdEV4Y2hhbmdlTGF5ZXIud2F0Y2goJ2Rlc2NlbmRhbnRzUmVtb3ZlTGlzdGVuZXInLCAobGlzdGVuZXIsIGxheWVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChsYXllci5saXN0ZW5lckNvdW50ID09PSAwKSB7IC8v6K+05piO6ZyA6KaB5YWz6Zet5p+Q5Liq5bm/5pKtcGF0aFxyXG4gICAgICAgICAgICAgICAgY29uc3QgbXNnID0gbmV3IEJyb2FkY2FzdENsb3NlTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICAgICAgbXNnLmJyb2FkY2FzdFNlbmRlciA9IHRoaXMubW9kdWxlTmFtZTtcclxuICAgICAgICAgICAgICAgIG1zZy5wYXRoID0gbGF5ZXIuZnVsbE5hbWUuc2xpY2UoMikuam9pbignLicpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fc2VuZERhdGEobXNnLnBhY2soKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5fYnJvYWRjYXN0RXhjaGFuZ2VMYXllci5mb3JFYWNoRGVzY2VuZGFudHMobGF5ZXIgPT4geyAgLy/mo4Dmn6XmnInlk6rkupvlub/mkq3lt7Looqvms6jlhozkuoZcclxuICAgICAgICAgICAgaWYgKGxheWVyLmxpc3RlbmVyQ291bnQgPiAwKVxyXG4gICAgICAgICAgICAgICAgc2VuZF9ib20obGF5ZXIpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5ZCR6K+l5o6l5Y+j5Y+R6YCB5pWw5o2uXHJcbiAgICAgKiBAcGFyYW0gZGF0YSDmtojmga/mlbDmja7vvIznrKzkuIDkuKrmmK/mtojmga/lpLTpg6jvvIznrKzkuozkuKrmmK/mtojmga9ib2R5XHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgX3NlbmREYXRhID0gKGRhdGE6IFtzdHJpbmcsIEJ1ZmZlcl0pID0+IHtcclxuICAgICAgICB0aGlzLl9zb2NrZXQuc2VuZChkYXRhWzBdLCBkYXRhWzFdKS5jYXRjaCgoKSA9PiB7IH0pO1xyXG4gICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdFNlbnRNZXNzYWdlKGRhdGFbMF0sIGRhdGFbMV0sIHRoaXMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5pat5byA6L+e5o6lXHJcbiAgICAgKi9cclxuICAgIGNsb3NlKCkge1xyXG4gICAgICAgIHRoaXMuX3NvY2tldC5jbG9zZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vI3JlZ2lvbiDlop7lh4/nmb3lkI3ljZVcclxuXHJcbiAgICAvKipcclxuICAgICAqIOa3u+WKoOWPr+iwg+eUqOeZveWQjeWNlVxyXG4gICAgICovXHJcbiAgICBhZGRJbnZva2FibGVXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZykge1xyXG4gICAgICAgIGlmIChtb2R1bGVOYW1lID09PSB0aGlzLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5qih5Z2X77yaJHttb2R1bGVOYW1lfeOAguiHquW3seS4jeWPr+S7peiwg+eUqOiHquW3seeahOaWueazlWApO1xyXG5cclxuICAgICAgICB0aGlzLl9pbnZva2FibGVXaGl0ZUxpc3QuZ2V0KFttb2R1bGVOYW1lLCBuYW1lc3BhY2VdKS5kYXRhID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIoOmZpOWPr+iwg+eUqOeZveWQjeWNlVxyXG4gICAgICovXHJcbiAgICByZW1vdmVJbnZva2FibGVXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuX2ludm9rYWJsZVdoaXRlTGlzdC5nZXQoW21vZHVsZU5hbWUsIG5hbWVzcGFjZV0pLmRhdGEgPSB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmt7vliqDlj6/mjqXmlLblub/mkq3nmb3lkI3ljZVcclxuICAgICAqL1xyXG4gICAgYWRkUmVjZWl2YWJsZVdoaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKG1vZHVsZU5hbWUgPT09IHRoaXMubW9kdWxlTmFtZSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmqKHlnZfvvJoke21vZHVsZU5hbWV944CC6Ieq5bex5LiN5Y+v5Lul55uR5ZCs6Ieq5bex55qE5bm/5pKtYCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGxheWVyID0gdGhpcy5fcmVjZWl2YWJsZVdoaXRlTGlzdC5nZXQoW21vZHVsZU5hbWUsIG5hbWVzcGFjZV0pO1xyXG4gICAgICAgIGxheWVyLmRhdGEgPSB0cnVlO1xyXG4gICAgICAgIGxheWVyLnRyaWdnZXJEZXNjZW5kYW50cyh0cnVlKTsgLy/pgJrnn6Xlj6/ku6Xljrticm9hZGNhc3RFeGNoYW5nZUNlbnRlcuS4reazqOWGjOebkeWQrOWZqOS6hlxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Yig6Zmk5p+Q6aG55Y+v5o6l5pS25bm/5pKt55m95ZCN5Y2VXHJcbiAgICAgKi9cclxuICAgIHJlbW92ZVJlY2VpdmFibGVXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IGxheWVyID0gdGhpcy5fcmVjZWl2YWJsZVdoaXRlTGlzdC5nZXQoW21vZHVsZU5hbWUsIG5hbWVzcGFjZV0pO1xyXG4gICAgICAgIGxheWVyLmRhdGEgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgbGF5ZXIudHJpZ2dlckRlc2NlbmRhbnRzKGZhbHNlKTsgLy/pgJrnn6Xljrticm9hZGNhc3RFeGNoYW5nZUNlbnRlcuS4reWIoOmZpOebkeWQrOWZqFxyXG4gICAgfVxyXG5cclxuICAgIC8vI2VuZHJlZ2lvblxyXG59Il19
