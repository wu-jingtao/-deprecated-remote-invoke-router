"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const binary_ws_1 = require("binary-ws");
const remote_invoke_1 = require("remote-invoke");
const eventspace_1 = require("eventspace");
const log_formatter_1 = require("log-formatter");
const ConnectedModule_1 = require("./ConnectedModule");
const ErrorType_1 = require("./ErrorType");
class RemoteInvokeRouter extends binary_ws_1.Server {
    constructor(server, configs) {
        super(server, configs);
        //#region 属性与构造
        /**
         * 与路由器连接的模块
         * key：模块名称
         */
        this.connectedModules = new Map();
        /**
         * 广播消息转发中心
         */
        this.broadcastExchangeCenter = new eventspace_1.default();
        /**
         * 是否触发receivedMessage事件
         */
        this.emitReceivedMessage = false;
        /**
         * 是否触发sentMessage事件
         */
        this.emitSentMessage = false;
        /**
         * 是否触发exchangeError事件
         */
        this.emitExchangeError = false;
        /**
         * 是否打印收到和发出的消息头部（用于调试）。需要将emitReceivedMessage或emitSentMessage设置为true才生效
         */
        this.printMessageHeader = false;
        /**
         * 是否将发生的Exchange错误打印到控制台（用于调试）。需要将emitExchangeError设置为true才生效
         */
        this.printExchangeError = false;
        this.on("connection", async (socket, req) => {
            const result = await this.onConnection(socket, req);
            if (result === false)
                socket.close();
            else {
                let module = this.connectedModules.get(result);
                if (module) {
                    socket.close();
                    this._emitExchangeError(ErrorType_1.ErrorType.duplicateConnection, module);
                }
                else {
                    module = new ConnectedModule_1.ConnectedModule(this, socket, result);
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
                    type: remote_invoke_1.MessageType[header[0]],
                    sender: header[1],
                    receiver: header[2],
                    path: header[3]
                };
                log_formatter_1.default
                    .location
                    .text.green.bold.round
                    .location.bold
                    .content.green('remote-invoke-router', '接收到', module.moduleName, JSON.stringify(result, undefined, 4));
            }
        });
        this.on("sentMessage", (header, body, module) => {
            if (this.printMessageHeader) {
                const result = {
                    type: remote_invoke_1.MessageType[header[0]],
                    sender: header[1],
                    receiver: header[2],
                    path: header[3]
                };
                log_formatter_1.default
                    .location
                    .text.cyan.bold.round
                    .location.bold
                    .content.cyan('remote-invoke-router', '发送到', module.moduleName, JSON.stringify(result, undefined, 4));
            }
        });
        this.on("exchangeError", (type, module) => {
            if (this.printExchangeError) {
                let message;
                switch (type) {
                    case ErrorType_1.ErrorType.duplicateConnection:
                        message = `模块"${module.moduleName}"重复与路由器建立连接`;
                        break;
                    case ErrorType_1.ErrorType.senderNameNotCorrect:
                        message = `模块"${module.moduleName}"发出的消息中，发送者的名称与实际模块名称不匹配`;
                        break;
                    case ErrorType_1.ErrorType.exceedPathMaxLength:
                        message = `模块"${module.moduleName}"发出的消息中，path超过了规定的长度`;
                        break;
                    case ErrorType_1.ErrorType.messageFormatError:
                        message = `模块"${module.moduleName}"发来的消息格式有问题`;
                        break;
                    case ErrorType_1.ErrorType.messageTypeError:
                        message = `模块"${module.moduleName}"发来了未知类型的消息`;
                        break;
                }
                log_formatter_1.default.warn
                    .location.white
                    .location.bold
                    .content.yellow('remote-invoke-router', module.moduleName, message);
            }
        });
    }
    //#region 增减白名单
    /**
     * 为某连接添加可调用白名单
     * @param moduleName 模块名称
     * @param invokableModuleName 可调用的模块名称
     * @param namespace 允许其访问的命名空间
     */
    addInvokableWhiteList(moduleName, invokableModuleName, namespace) {
        const module = this.connectedModules.get(moduleName);
        if (module)
            module.addInvokableWhiteList(invokableModuleName, namespace);
    }
    /**
     * 为某连接删除可调用白名单
     * @param moduleName 模块名称
     * @param notInvokableModuleName 不允许调用的模块名称
     * @param namespace 不允许其访问的命名空间
     */
    removeInvokableWhiteList(moduleName, notInvokableModuleName, namespace) {
        const module = this.connectedModules.get(moduleName);
        if (module)
            module.removeInvokableWhiteList(notInvokableModuleName, namespace);
    }
    /**
     * 为某连接添加可接收广播白名单
     * @param moduleName 模块名称
     * @param receivableModuleName 可接收广播的模块名
     * @param namespace 可接收的广播命名空间
     */
    addReceivableWhiteList(moduleName, receivableModuleName, namespace) {
        const module = this.connectedModules.get(moduleName);
        if (module)
            module.addReceivableWhiteList(receivableModuleName, namespace);
    }
    /**
     * 为某连接删除可接收广播白名单
     * @param moduleName 模块名称
     * @param notReceivableModuleName 不可接收广播的模块名
     * @param namespace 不可接收的广播命名空间
     */
    removeReceivableWhiteList(moduleName, notReceivableModuleName, namespace) {
        const module = this.connectedModules.get(moduleName);
        if (module)
            module.removeReceivableWhiteList(notReceivableModuleName, namespace);
    }
    on(event, listener) {
        super.on(event, listener);
        return this;
    }
    once(event, listener) {
        super.once(event, listener);
        return this;
    }
    /**
     * 触发receivedMessage事件
     */
    _emitReceivedMessage(header, body, module) {
        if (this.emitReceivedMessage)
            this.emit('receivedMessage', header, body, module);
    }
    /**
     * 触发sentMessage事件
     */
    _emitSentMessage(header, body, module) {
        if (this.emitSentMessage)
            this.emit('sentMessage', JSON.parse(header), body, module);
    }
    /**
     * 触发exchangeError事件
     */
    _emitExchangeError(type, module) {
        if (this.emitExchangeError)
            this.emit('exchangeError', type, module);
    }
}
exports.RemoteInvokeRouter = RemoteInvokeRouter;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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RSxRQUFRLENBQUMsQ0FBQztRQUM1QixNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFFRDs7T0FFRztJQUNILG9CQUFvQixDQUFDLE1BQWEsRUFBRSxJQUFZLEVBQUUsTUFBdUI7UUFDckUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDO1lBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxnQkFBZ0IsQ0FBQyxNQUFjLEVBQUUsSUFBWSxFQUFFLE1BQXVCO1FBQ2xFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUM7WUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVEOztPQUVHO0lBQ0gsa0JBQWtCLENBQUMsSUFBZSxFQUFFLE1BQXVCO1FBQ3ZELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztZQUN2QixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDakQsQ0FBQztDQUdKO0FBaFFELGdEQWdRQyIsImZpbGUiOiJSZW1vdGVJbnZva2VSb3V0ZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xyXG5pbXBvcnQgKiBhcyBodHRwcyBmcm9tICdodHRwcyc7XHJcbmltcG9ydCB7IFNlcnZlciwgU2VydmVyU29ja2V0IH0gZnJvbSAnYmluYXJ5LXdzJztcclxuaW1wb3J0IHsgQmFzZVNvY2tldENvbmZpZyB9IGZyb20gJ2JpbmFyeS13cy9iaW4vQmFzZVNvY2tldC9pbnRlcmZhY2VzL0Jhc2VTb2NrZXRDb25maWcnO1xyXG5pbXBvcnQgeyBNZXNzYWdlVHlwZSB9IGZyb20gJ3JlbW90ZS1pbnZva2UnO1xyXG5pbXBvcnQgRXZlbnRTcGFjZSBmcm9tICdldmVudHNwYWNlJztcclxuaW1wb3J0IGxvZyBmcm9tICdsb2ctZm9ybWF0dGVyJztcclxuXHJcbmltcG9ydCB7IENvbm5lY3RlZE1vZHVsZSB9IGZyb20gJy4vQ29ubmVjdGVkTW9kdWxlJztcclxuaW1wb3J0IHsgRXJyb3JUeXBlIH0gZnJvbSAnLi9FcnJvclR5cGUnO1xyXG5cclxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFJlbW90ZUludm9rZVJvdXRlciBleHRlbmRzIFNlcnZlciB7XHJcblxyXG4gICAgLy8jcmVnaW9uIOWxnuaAp+S4juaehOmAoFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5LiO6Lev55Sx5Zmo6L+e5o6l55qE5qih5Z2XICAgIFxyXG4gICAgICoga2V577ya5qih5Z2X5ZCN56ewXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IGNvbm5lY3RlZE1vZHVsZXM6IE1hcDxzdHJpbmcsIENvbm5lY3RlZE1vZHVsZT4gPSBuZXcgTWFwKCk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlub/mkq3mtojmga/ovazlj5HkuK3lv4NcclxuICAgICAqL1xyXG4gICAgcmVhZG9ubHkgYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXIgPSBuZXcgRXZlbnRTcGFjZSgpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm6Kem5Y+RcmVjZWl2ZWRNZXNzYWdl5LqL5Lu2XHJcbiAgICAgKi9cclxuICAgIGVtaXRSZWNlaXZlZE1lc3NhZ2UgPSBmYWxzZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuinpuWPkXNlbnRNZXNzYWdl5LqL5Lu2XHJcbiAgICAgKi9cclxuICAgIGVtaXRTZW50TWVzc2FnZSA9IGZhbHNlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm6Kem5Y+RZXhjaGFuZ2VFcnJvcuS6i+S7tlxyXG4gICAgICovXHJcbiAgICBlbWl0RXhjaGFuZ2VFcnJvciA9IGZhbHNlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm5omT5Y2w5pS25Yiw5ZKM5Y+R5Ye655qE5raI5oGv5aS06YOo77yI55So5LqO6LCD6K+V77yJ44CC6ZyA6KaB5bCGZW1pdFJlY2VpdmVkTWVzc2FnZeaIlmVtaXRTZW50TWVzc2FnZeiuvue9ruS4unRydWXmiY3nlJ/mlYhcclxuICAgICAqL1xyXG4gICAgcHJpbnRNZXNzYWdlSGVhZGVyID0gZmFsc2U7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmmK/lkKblsIblj5HnlJ/nmoRFeGNoYW5nZemUmeivr+aJk+WNsOWIsOaOp+WItuWPsO+8iOeUqOS6juiwg+ivle+8ieOAgumcgOimgeWwhmVtaXRFeGNoYW5nZUVycm9y6K6+572u5Li6dHJ1ZeaJjeeUn+aViFxyXG4gICAgICovXHJcbiAgICBwcmludEV4Y2hhbmdlRXJyb3IgPSBmYWxzZTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihzZXJ2ZXI6IGh0dHAuU2VydmVyIHwgaHR0cHMuU2VydmVyLCBjb25maWdzOiBCYXNlU29ja2V0Q29uZmlnKSB7XHJcbiAgICAgICAgc3VwZXIoc2VydmVyLCBjb25maWdzKTtcclxuXHJcbiAgICAgICAgdGhpcy5vbihcImNvbm5lY3Rpb25cIiwgYXN5bmMgKHNvY2tldCwgcmVxKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub25Db25uZWN0aW9uKHNvY2tldCwgcmVxKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQgPT09IGZhbHNlKVxyXG4gICAgICAgICAgICAgICAgc29ja2V0LmNsb3NlKCk7XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbGV0IG1vZHVsZSA9IHRoaXMuY29ubmVjdGVkTW9kdWxlcy5nZXQocmVzdWx0KTtcclxuICAgICAgICAgICAgICAgIGlmIChtb2R1bGUpIHsgLy/kuI3lhYHorrjkuIDkuKrmqKHlnZfph43lpI3ov57mjqVcclxuICAgICAgICAgICAgICAgICAgICBzb2NrZXQuY2xvc2UoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuZHVwbGljYXRlQ29ubmVjdGlvbiwgbW9kdWxlKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbW9kdWxlID0gbmV3IENvbm5lY3RlZE1vZHVsZSh0aGlzLCBzb2NrZXQsIHJlc3VsdCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0ZWRNb2R1bGVzLnNldChyZXN1bHQsIG1vZHVsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdtb2R1bGVfY29ubmVjdGVkJywgbW9kdWxlKTtcclxuICAgICAgICAgICAgICAgICAgICBzb2NrZXQub25jZSgnY2xvc2UnLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdGVkTW9kdWxlcy5kZWxldGUocmVzdWx0KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdtb2R1bGVfZGlzY29ubmVjdGVkJywgbW9kdWxlKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uKFwicmVjZWl2ZWRNZXNzYWdlXCIsIChoZWFkZXIsIGJvZHksIG1vZHVsZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wcmludE1lc3NhZ2VIZWFkZXIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBNZXNzYWdlVHlwZVtoZWFkZXJbMF1dLFxyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRlcjogaGVhZGVyWzFdLFxyXG4gICAgICAgICAgICAgICAgICAgIHJlY2VpdmVyOiBoZWFkZXJbMl0sXHJcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogaGVhZGVyWzNdXHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIGxvZ1xyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIC50ZXh0LmdyZWVuLmJvbGQucm91bmRcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uYm9sZFxyXG4gICAgICAgICAgICAgICAgICAgIC5jb250ZW50LmdyZWVuKCdyZW1vdGUtaW52b2tlLXJvdXRlcicsICfmjqXmlLbliLAnLCBtb2R1bGUubW9kdWxlTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0LCB1bmRlZmluZWQsIDQpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uKFwic2VudE1lc3NhZ2VcIiwgKGhlYWRlciwgYm9keSwgbW9kdWxlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnByaW50TWVzc2FnZUhlYWRlcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IE1lc3NhZ2VUeXBlW2hlYWRlclswXV0sXHJcbiAgICAgICAgICAgICAgICAgICAgc2VuZGVyOiBoZWFkZXJbMV0sXHJcbiAgICAgICAgICAgICAgICAgICAgcmVjZWl2ZXI6IGhlYWRlclsyXSxcclxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBoZWFkZXJbM11cclxuICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgbG9nXHJcbiAgICAgICAgICAgICAgICAgICAgLmxvY2F0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgLnRleHQuY3lhbi5ib2xkLnJvdW5kXHJcbiAgICAgICAgICAgICAgICAgICAgLmxvY2F0aW9uLmJvbGRcclxuICAgICAgICAgICAgICAgICAgICAuY29udGVudC5jeWFuKCdyZW1vdGUtaW52b2tlLXJvdXRlcicsICflj5HpgIHliLAnLCBtb2R1bGUubW9kdWxlTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0LCB1bmRlZmluZWQsIDQpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uKFwiZXhjaGFuZ2VFcnJvclwiLCAodHlwZSwgbW9kdWxlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnByaW50RXhjaGFuZ2VFcnJvcikge1xyXG4gICAgICAgICAgICAgICAgbGV0IG1lc3NhZ2U7XHJcblxyXG4gICAgICAgICAgICAgICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBFcnJvclR5cGUuZHVwbGljYXRlQ29ubmVjdGlvbjpcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGDmqKHlnZdcIiR7bW9kdWxlLm1vZHVsZU5hbWV9XCLph43lpI3kuI7ot6/nlLHlmajlu7rnq4vov57mjqVgO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIEVycm9yVHlwZS5zZW5kZXJOYW1lTm90Q29ycmVjdDpcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGDmqKHlnZdcIiR7bW9kdWxlLm1vZHVsZU5hbWV9XCLlj5Hlh7rnmoTmtojmga/kuK3vvIzlj5HpgIHogIXnmoTlkI3np7DkuI7lrp7pmYXmqKHlnZflkI3np7DkuI3ljLnphY1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIEVycm9yVHlwZS5leGNlZWRQYXRoTWF4TGVuZ3RoOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlID0gYOaooeWdl1wiJHttb2R1bGUubW9kdWxlTmFtZX1cIuWPkeWHuueahOa2iOaBr+S4re+8jHBhdGjotoXov4fkuobop4TlrprnmoTplb/luqZgO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIEVycm9yVHlwZS5tZXNzYWdlRm9ybWF0RXJyb3I6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBg5qih5Z2XXCIke21vZHVsZS5tb2R1bGVOYW1lfVwi5Y+R5p2l55qE5raI5oGv5qC85byP5pyJ6Zeu6aKYYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBFcnJvclR5cGUubWVzc2FnZVR5cGVFcnJvcjpcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGDmqKHlnZdcIiR7bW9kdWxlLm1vZHVsZU5hbWV9XCLlj5HmnaXkuobmnKrnn6XnsbvlnovnmoTmtojmga9gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBsb2cud2FyblxyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvbi53aGl0ZVxyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvbi5ib2xkXHJcbiAgICAgICAgICAgICAgICAgICAgLmNvbnRlbnQueWVsbG93KCdyZW1vdGUtaW52b2tlLXJvdXRlcicsIG1vZHVsZS5tb2R1bGVOYW1lLCBtZXNzYWdlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vI2VuZHJlZ2lvblxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5q+P5b2T5pyJ5LiA5Liq5paw55qE6L+e5o6l6KKr5Yib5bu677yM6K+l5pa55rOV5bCx5Lya6KKr6Kem5Y+R44CC6L+U5ZueZmFsc2XooajnpLrmi5Lnu53ov57mjqXvvIzov5Tlm55zdHJpbmfooajnpLrmjqXlj5fov57mjqXjgILmraTlrZfnrKbkuLLku6Pooajor6XmjqXlj6PmiYDov57mjqXmqKHlnZfnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSBzb2NrZXQgd2Vic29ja2V0XHJcbiAgICAgKiBAcGFyYW0gcmVxIOWuouaIt+err+WQkei3r+eUseWZqOW7uueri+i/nuaOpeaXtuWPkemAgeeahGdldOivt+axglxyXG4gICAgICovXHJcbiAgICBhYnN0cmFjdCBvbkNvbm5lY3Rpb24oc29ja2V0OiBTZXJ2ZXJTb2NrZXQsIHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpOiBQcm9taXNlPGZhbHNlIHwgc3RyaW5nPjtcclxuXHJcbiAgICAvLyNyZWdpb24g5aKe5YeP55m95ZCN5Y2VXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuLrmn5Dov57mjqXmt7vliqDlj6/osIPnlKjnmb3lkI3ljZVcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIGludm9rYWJsZU1vZHVsZU5hbWUg5Y+v6LCD55So55qE5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gbmFtZXNwYWNlIOWFgeiuuOWFtuiuv+mXrueahOWRveWQjeepuumXtFxyXG4gICAgICovXHJcbiAgICBhZGRJbnZva2FibGVXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCBpbnZva2FibGVNb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgbW9kdWxlID0gdGhpcy5jb25uZWN0ZWRNb2R1bGVzLmdldChtb2R1bGVOYW1lKTtcclxuICAgICAgICBpZiAobW9kdWxlKSBtb2R1bGUuYWRkSW52b2thYmxlV2hpdGVMaXN0KGludm9rYWJsZU1vZHVsZU5hbWUsIG5hbWVzcGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuLrmn5Dov57mjqXliKDpmaTlj6/osIPnlKjnmb3lkI3ljZVcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIG5vdEludm9rYWJsZU1vZHVsZU5hbWUg5LiN5YWB6K646LCD55So55qE5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gbmFtZXNwYWNlIOS4jeWFgeiuuOWFtuiuv+mXrueahOWRveWQjeepuumXtFxyXG4gICAgICovXHJcbiAgICByZW1vdmVJbnZva2FibGVXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCBub3RJbnZva2FibGVNb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgbW9kdWxlID0gdGhpcy5jb25uZWN0ZWRNb2R1bGVzLmdldChtb2R1bGVOYW1lKTtcclxuICAgICAgICBpZiAobW9kdWxlKSBtb2R1bGUucmVtb3ZlSW52b2thYmxlV2hpdGVMaXN0KG5vdEludm9rYWJsZU1vZHVsZU5hbWUsIG5hbWVzcGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuLrmn5Dov57mjqXmt7vliqDlj6/mjqXmlLblub/mkq3nmb3lkI3ljZVcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIHJlY2VpdmFibGVNb2R1bGVOYW1lIOWPr+aOpeaUtuW5v+aSreeahOaooeWdl+WQjVxyXG4gICAgICogQHBhcmFtIG5hbWVzcGFjZSDlj6/mjqXmlLbnmoTlub/mkq3lkb3lkI3nqbrpl7RcclxuICAgICAqL1xyXG4gICAgYWRkUmVjZWl2YWJsZVdoaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIHJlY2VpdmFibGVNb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgbW9kdWxlID0gdGhpcy5jb25uZWN0ZWRNb2R1bGVzLmdldChtb2R1bGVOYW1lKTtcclxuICAgICAgICBpZiAobW9kdWxlKSBtb2R1bGUuYWRkUmVjZWl2YWJsZVdoaXRlTGlzdChyZWNlaXZhYmxlTW9kdWxlTmFtZSwgbmFtZXNwYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOS4uuafkOi/nuaOpeWIoOmZpOWPr+aOpeaUtuW5v+aSreeZveWQjeWNlVxyXG4gICAgICogQHBhcmFtIG1vZHVsZU5hbWUg5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gbm90UmVjZWl2YWJsZU1vZHVsZU5hbWUg5LiN5Y+v5o6l5pS25bm/5pKt55qE5qih5Z2X5ZCNXHJcbiAgICAgKiBAcGFyYW0gbmFtZXNwYWNlIOS4jeWPr+aOpeaUtueahOW5v+aSreWRveWQjeepuumXtFxyXG4gICAgICovXHJcbiAgICByZW1vdmVSZWNlaXZhYmxlV2hpdGVMaXN0KG1vZHVsZU5hbWU6IHN0cmluZywgbm90UmVjZWl2YWJsZU1vZHVsZU5hbWU6IHN0cmluZywgbmFtZXNwYWNlOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBtb2R1bGUgPSB0aGlzLmNvbm5lY3RlZE1vZHVsZXMuZ2V0KG1vZHVsZU5hbWUpO1xyXG4gICAgICAgIGlmIChtb2R1bGUpIG1vZHVsZS5yZW1vdmVSZWNlaXZhYmxlV2hpdGVMaXN0KG5vdFJlY2VpdmFibGVNb2R1bGVOYW1lLCBuYW1lc3BhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vI2VuZHJlZ2lvblxyXG5cclxuICAgIC8vI3JlZ2lvbiDkuovku7ZcclxuXHJcbiAgICBvbihldmVudDogJ2Vycm9yJywgbGlzdGVuZXI6IChlcnI6IEVycm9yKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uKGV2ZW50OiAnbGlzdGVuaW5nJywgbGlzdGVuZXI6ICgpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb24oZXZlbnQ6ICdjbG9zZScsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbihldmVudDogJ2Nvbm5lY3Rpb24nLCBsaXN0ZW5lcjogKHNvY2tldDogU2VydmVyU29ja2V0LCByZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlKSA9PiB2b2lkKTogdGhpcztcclxuICAgIC8qKlxyXG4gICAgICog5b2T5pyJ5qih5Z2X55yf5q2j5LiO6Lev55Sx5Zmo5bu656uL5LiK6L+e5o6l5ZCO6Kem5Y+RXHJcbiAgICAgKi9cclxuICAgIG9uKGV2ZW50OiAnbW9kdWxlX2Nvbm5lY3RlZCcsIGxpc3RlbmVyOiAobW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPmnInmqKHlnZfkuI7ot6/nlLHlmajmlq3lvIDov57mjqXlkI7op6blj5FcclxuICAgICAqL1xyXG4gICAgb24oZXZlbnQ6ICdtb2R1bGVfZGlzY29ubmVjdGVkJywgbGlzdGVuZXI6IChtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICAvKipcclxuICAgICAqIOW9k+aOpeaUtuWIsOaooeWdl+S8oOadpeeahOa2iOaBr+WQjuinpuWPke+8jOmAmui/h+i/meS4quWPr+S7peWBmuS4gOS6m+a1gemHj+iuoeaVsOaWuemdoueahOW3peS9nFxyXG4gICAgICovXHJcbiAgICBvbihldmVudDogJ3JlY2VpdmVkTWVzc2FnZScsIGxpc3RlbmVyOiAoaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICAvKipcclxuICAgICAqIOW9k+WQkeaooeWdl+WPkeWHuua2iOaBr+WQjuinpuWPkVxyXG4gICAgICovXHJcbiAgICBvbihldmVudDogJ3NlbnRNZXNzYWdlJywgbGlzdGVuZXI6IChoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIsIG1vZHVsZTogQ29ubmVjdGVkTW9kdWxlKSA9PiB2b2lkKTogdGhpcztcclxuICAgIC8qKlxyXG4gICAgICog5b2T5p+Q5Liq5qih5Z2X55qE6KGM5Li65LiN56ym5ZCI6KeE6IyD5pe26Kem5Y+R77yM6YCa6L+H6L+Z5Liq5Y+v5Lul5YGa5LiA5Lqb5qih5Z2X6ZSZ6K+v6K6h5pWwXHJcbiAgICAgKi9cclxuICAgIG9uKGV2ZW50OiAnZXhjaGFuZ2VFcnJvcicsIGxpc3RlbmVyOiAodHlwZTogRXJyb3JUeXBlLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbihldmVudDogYW55LCBsaXN0ZW5lcjogYW55KSB7XHJcbiAgICAgICAgc3VwZXIub24oZXZlbnQsIGxpc3RlbmVyKTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBvbmNlKGV2ZW50OiAnZXJyb3InLCBsaXN0ZW5lcjogKGVycjogRXJyb3IpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb25jZShldmVudDogJ2xpc3RlbmluZycsIGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdjbG9zZScsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAnY29ubmVjdGlvbicsIGxpc3RlbmVyOiAoc29ja2V0OiBTZXJ2ZXJTb2NrZXQsIHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb25jZShldmVudDogJ21vZHVsZV9jb25uZWN0ZWQnLCBsaXN0ZW5lcjogKG1vZHVsZTogQ29ubmVjdGVkTW9kdWxlKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdtb2R1bGVfZGlzY29ubmVjdGVkJywgbGlzdGVuZXI6IChtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAncmVjZWl2ZWRNZXNzYWdlJywgbGlzdGVuZXI6IChoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIsIG1vZHVsZTogQ29ubmVjdGVkTW9kdWxlKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdzZW50TWVzc2FnZScsIGxpc3RlbmVyOiAoaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAnZXhjaGFuZ2VFcnJvcicsIGxpc3RlbmVyOiAodHlwZTogRXJyb3JUeXBlLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiBhbnksIGxpc3RlbmVyOiBhbnkpIHtcclxuICAgICAgICBzdXBlci5vbmNlKGV2ZW50LCBsaXN0ZW5lcik7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDop6blj5FyZWNlaXZlZE1lc3NhZ2Xkuovku7ZcclxuICAgICAqL1xyXG4gICAgX2VtaXRSZWNlaXZlZE1lc3NhZ2UoaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkge1xyXG4gICAgICAgIGlmICh0aGlzLmVtaXRSZWNlaXZlZE1lc3NhZ2UpXHJcbiAgICAgICAgICAgIHRoaXMuZW1pdCgncmVjZWl2ZWRNZXNzYWdlJywgaGVhZGVyLCBib2R5LCBtb2R1bGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6Kem5Y+Rc2VudE1lc3NhZ2Xkuovku7ZcclxuICAgICAqL1xyXG4gICAgX2VtaXRTZW50TWVzc2FnZShoZWFkZXI6IHN0cmluZywgYm9keTogQnVmZmVyLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkge1xyXG4gICAgICAgIGlmICh0aGlzLmVtaXRTZW50TWVzc2FnZSlcclxuICAgICAgICAgICAgdGhpcy5lbWl0KCdzZW50TWVzc2FnZScsIEpTT04ucGFyc2UoaGVhZGVyKSwgYm9keSwgbW9kdWxlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOinpuWPkWV4Y2hhbmdlRXJyb3Lkuovku7ZcclxuICAgICAqL1xyXG4gICAgX2VtaXRFeGNoYW5nZUVycm9yKHR5cGU6IEVycm9yVHlwZSwgbW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpIHtcclxuICAgICAgICBpZiAodGhpcy5lbWl0RXhjaGFuZ2VFcnJvcilcclxuICAgICAgICAgICAgdGhpcy5lbWl0KCdleGNoYW5nZUVycm9yJywgdHlwZSwgbW9kdWxlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyNlbmRyZWdpb25cclxufSJdfQ==
