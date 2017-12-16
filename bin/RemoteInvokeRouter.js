"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const binary_ws_1 = require("binary-ws");
const ConnectedSocket_1 = require("./ConnectedSocket");
class RemoteInvokeRouter extends binary_ws_1.Server {
    constructor(server, configs) {
        super(server, configs);
        /**
         * 与路由器连接的接口
         * key 接口连接的模块名称
         */
        this.connectedSockets = new Map();
        /**
         * 是否打印收到和发出的消息头部
         */
        this.printMessage = false;
        this.on("connection", (socket, req) => {
            const result = this.onConnection(socket, req);
            if (result === false) {
                socket.close();
            }
            else {
                if (this.connectedSockets.has(result))
                    socket.close(); //不允许一个模块重复连接
                else
                    this.connectedSockets.set(result, new ConnectedSocket_1.ConnectedSocket(this, socket, result));
            }
        });
    }
    /**
     * 为某连接添加可调用方法白名单
     * @param moduleName 模块名称
     * @param invokableModuleName 可调用的模块名称
     * @param namespace 允许其访问的命名空间
     */
    addInvokingWhiteList(moduleName, invokableModuleName, namespace) {
        const module = this.connectedSockets.get(moduleName);
        if (module)
            module.addInvokableWhiteList(invokableModuleName, namespace);
    }
    /**
     * 为某连接删除可调用方法白名单
     * @param moduleName 模块名称
     * @param notInvokableModuleName 不允许调用的模块名称
     * @param namespace 不允许其访问的命名空间
     */
    removeInvokingWhiteList(moduleName, notInvokableModuleName, namespace) {
        const module = this.connectedSockets.get(moduleName);
        if (module)
            module.removeInvokableWhiteList(notInvokableModuleName, namespace);
    }
    /**
     * 为某连接添加可接收广播白名单
     * @param moduleName 模块名称
     * @param receivableModuleName 可接收广播的模块名
     * @param namespace 可接收的广播命名空间
     */
    addReceivingWhiteList(moduleName, receivableModuleName, namespace) {
        const module = this.connectedSockets.get(moduleName);
        if (module)
            module.addReceivableBroadcastWhiteList(receivableModuleName, namespace);
    }
    /**
     * 为某连接删除可接收广播白名单
     * @param moduleName 模块名称
     * @param notReceivableModuleName 不可接收广播的模块名
     * @param namespace 不可接收的广播命名空间
     */
    removeReceivingWhiteList(moduleName, notReceivableModuleName, namespace) {
        const module = this.connectedSockets.get(moduleName);
        if (module)
            module.removeReceivableBroadcastWhiteList(notReceivableModuleName, namespace);
    }
}
exports.RemoteInvokeRouter = RemoteInvokeRouter;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlJlbW90ZUludm9rZVJvdXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLHlDQUFtQztBQUtuQyx1REFBb0Q7QUFFcEQsd0JBQXlDLFNBQVEsa0JBQU07SUFhbkQsWUFBWSxNQUFrQyxFQUFFLE9BQXlCO1FBQ3JFLEtBQUssQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFaM0I7OztXQUdHO1FBQ00scUJBQWdCLEdBQWlDLElBQUksR0FBRyxFQUFFLENBQUM7UUFFcEU7O1dBRUc7UUFDSCxpQkFBWSxHQUFHLEtBQUssQ0FBQztRQUtqQixJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksRUFBRSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsRUFBRTtZQUNsQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM5QyxFQUFFLENBQUMsQ0FBQyxNQUFNLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDbkIsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ25CLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUNsQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxhQUFhO2dCQUNqQyxJQUFJO29CQUNBLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLElBQUksaUNBQWUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDckYsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQVNEOzs7OztPQUtHO0lBQ0gsb0JBQW9CLENBQUMsVUFBa0IsRUFBRSxtQkFBMkIsRUFBRSxTQUFpQjtRQUNuRixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3JELEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUFDLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBQyxtQkFBbUIsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUM3RSxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSCx1QkFBdUIsQ0FBQyxVQUFrQixFQUFFLHNCQUE4QixFQUFFLFNBQWlCO1FBQ3pGLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDckQsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQUMsTUFBTSxDQUFDLHdCQUF3QixDQUFDLHNCQUFzQixFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILHFCQUFxQixDQUFDLFVBQWtCLEVBQUUsb0JBQTRCLEVBQUUsU0FBaUI7UUFDckYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNyRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFBQyxNQUFNLENBQUMsK0JBQStCLENBQUMsb0JBQW9CLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDeEYsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsd0JBQXdCLENBQUMsVUFBa0IsRUFBRSx1QkFBK0IsRUFBRSxTQUFpQjtRQUMzRixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3JELEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUFDLE1BQU0sQ0FBQyxrQ0FBa0MsQ0FBQyx1QkFBdUIsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUM5RixDQUFDO0NBQ0o7QUEvRUQsZ0RBK0VDIiwiZmlsZSI6IlJlbW90ZUludm9rZVJvdXRlci5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XHJcbmltcG9ydCAqIGFzIGh0dHBzIGZyb20gJ2h0dHBzJztcclxuaW1wb3J0IHsgU2VydmVyIH0gZnJvbSAnYmluYXJ5LXdzJztcclxuaW1wb3J0IHsgRXZlbnRTcGFjZSB9IGZyb20gJ2V2ZW50c3BhY2UnO1xyXG5pbXBvcnQgeyBCYXNlU29ja2V0Q29uZmlnIH0gZnJvbSAnYmluYXJ5LXdzL2Jpbi9CYXNlU29ja2V0L2ludGVyZmFjZXMvQmFzZVNvY2tldENvbmZpZyc7XHJcbmltcG9ydCB7IFNlcnZlclNvY2tldCB9IGZyb20gJ2JpbmFyeS13cy9iaW4vc2VydmVyL2NsYXNzZXMvU2VydmVyU29ja2V0JztcclxuXHJcbmltcG9ydCB7IENvbm5lY3RlZFNvY2tldCB9IGZyb20gJy4vQ29ubmVjdGVkU29ja2V0JztcclxuXHJcbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBSZW1vdGVJbnZva2VSb3V0ZXIgZXh0ZW5kcyBTZXJ2ZXIge1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5LiO6Lev55Sx5Zmo6L+e5o6l55qE5o6l5Y+jICAgIFxyXG4gICAgICoga2V5IOaOpeWPo+i/nuaOpeeahOaooeWdl+WQjeensFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBjb25uZWN0ZWRTb2NrZXRzOiBNYXA8c3RyaW5nLCBDb25uZWN0ZWRTb2NrZXQ+ID0gbmV3IE1hcCgpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm5omT5Y2w5pS25Yiw5ZKM5Y+R5Ye655qE5raI5oGv5aS06YOoXHJcbiAgICAgKi9cclxuICAgIHByaW50TWVzc2FnZSA9IGZhbHNlO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHNlcnZlcjogaHR0cC5TZXJ2ZXIgfCBodHRwcy5TZXJ2ZXIsIGNvbmZpZ3M6IEJhc2VTb2NrZXRDb25maWcpIHtcclxuICAgICAgICBzdXBlcihzZXJ2ZXIsIGNvbmZpZ3MpO1xyXG5cclxuICAgICAgICB0aGlzLm9uKFwiY29ubmVjdGlvblwiLCAoc29ja2V0LCByZXEpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5vbkNvbm5lY3Rpb24oc29ja2V0LCByZXEpO1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0ID09PSBmYWxzZSkge1xyXG4gICAgICAgICAgICAgICAgc29ja2V0LmNsb3NlKCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jb25uZWN0ZWRTb2NrZXRzLmhhcyhyZXN1bHQpKVxyXG4gICAgICAgICAgICAgICAgICAgIHNvY2tldC5jbG9zZSgpOyAvL+S4jeWFgeiuuOS4gOS4quaooeWdl+mHjeWkjei/nuaOpVxyXG4gICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdGVkU29ja2V0cy5zZXQocmVzdWx0LCBuZXcgQ29ubmVjdGVkU29ja2V0KHRoaXMsIHNvY2tldCwgcmVzdWx0KSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOavj+W9k+acieS4gOS4quaWsOeahOi/nuaOpeiiq+WIm+W7uu+8jOivpeaWueazleWwseS8muiiq+inpuWPkeOAgui/lOWbnmZhbHNl6KGo56S65ouS57ud6L+e5o6l77yM6L+U5Zuec3RyaW5n6KGo56S65o6l5Y+X6L+e5o6l44CC5q2k5a2X56ym5Liy5Luj6KGo6K+l5o6l5Y+j5omA6L+e5o6l5qih5Z2X55qE5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gc29ja2V0IHdlYnNvY2tldFxyXG4gICAgICogQHBhcmFtIHJlcSDlrqLmiLfnq6/lkJHot6/nlLHlmajlu7rnq4vov57mjqXml7blj5HpgIHnmoRnZXTor7fmsYJcclxuICAgICAqL1xyXG4gICAgYWJzdHJhY3Qgb25Db25uZWN0aW9uKHNvY2tldDogU2VydmVyU29ja2V0LCByZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlKTogZmFsc2UgfCBzdHJpbmc7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuLrmn5Dov57mjqXmt7vliqDlj6/osIPnlKjmlrnms5Xnmb3lkI3ljZVcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIGludm9rYWJsZU1vZHVsZU5hbWUg5Y+v6LCD55So55qE5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gbmFtZXNwYWNlIOWFgeiuuOWFtuiuv+mXrueahOWRveWQjeepuumXtFxyXG4gICAgICovXHJcbiAgICBhZGRJbnZva2luZ1doaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIGludm9rYWJsZU1vZHVsZU5hbWU6IHN0cmluZywgbmFtZXNwYWNlOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBtb2R1bGUgPSB0aGlzLmNvbm5lY3RlZFNvY2tldHMuZ2V0KG1vZHVsZU5hbWUpO1xyXG4gICAgICAgIGlmIChtb2R1bGUpIG1vZHVsZS5hZGRJbnZva2FibGVXaGl0ZUxpc3QoaW52b2thYmxlTW9kdWxlTmFtZSwgbmFtZXNwYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOS4uuafkOi/nuaOpeWIoOmZpOWPr+iwg+eUqOaWueazleeZveWQjeWNlVxyXG4gICAgICogQHBhcmFtIG1vZHVsZU5hbWUg5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gbm90SW52b2thYmxlTW9kdWxlTmFtZSDkuI3lhYHorrjosIPnlKjnmoTmqKHlnZflkI3np7BcclxuICAgICAqIEBwYXJhbSBuYW1lc3BhY2Ug5LiN5YWB6K645YW26K6/6Zeu55qE5ZG95ZCN56m66Ze0XHJcbiAgICAgKi9cclxuICAgIHJlbW92ZUludm9raW5nV2hpdGVMaXN0KG1vZHVsZU5hbWU6IHN0cmluZywgbm90SW52b2thYmxlTW9kdWxlTmFtZTogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IG1vZHVsZSA9IHRoaXMuY29ubmVjdGVkU29ja2V0cy5nZXQobW9kdWxlTmFtZSk7XHJcbiAgICAgICAgaWYgKG1vZHVsZSkgbW9kdWxlLnJlbW92ZUludm9rYWJsZVdoaXRlTGlzdChub3RJbnZva2FibGVNb2R1bGVOYW1lLCBuYW1lc3BhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Li65p+Q6L+e5o6l5re75Yqg5Y+v5o6l5pS25bm/5pKt55m95ZCN5Y2VXHJcbiAgICAgKiBAcGFyYW0gbW9kdWxlTmFtZSDmqKHlnZflkI3np7BcclxuICAgICAqIEBwYXJhbSByZWNlaXZhYmxlTW9kdWxlTmFtZSDlj6/mjqXmlLblub/mkq3nmoTmqKHlnZflkI1cclxuICAgICAqIEBwYXJhbSBuYW1lc3BhY2Ug5Y+v5o6l5pS255qE5bm/5pKt5ZG95ZCN56m66Ze0XHJcbiAgICAgKi9cclxuICAgIGFkZFJlY2VpdmluZ1doaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIHJlY2VpdmFibGVNb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgbW9kdWxlID0gdGhpcy5jb25uZWN0ZWRTb2NrZXRzLmdldChtb2R1bGVOYW1lKTtcclxuICAgICAgICBpZiAobW9kdWxlKSBtb2R1bGUuYWRkUmVjZWl2YWJsZUJyb2FkY2FzdFdoaXRlTGlzdChyZWNlaXZhYmxlTW9kdWxlTmFtZSwgbmFtZXNwYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOS4uuafkOi/nuaOpeWIoOmZpOWPr+aOpeaUtuW5v+aSreeZveWQjeWNlVxyXG4gICAgICogQHBhcmFtIG1vZHVsZU5hbWUg5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gbm90UmVjZWl2YWJsZU1vZHVsZU5hbWUg5LiN5Y+v5o6l5pS25bm/5pKt55qE5qih5Z2X5ZCNXHJcbiAgICAgKiBAcGFyYW0gbmFtZXNwYWNlIOS4jeWPr+aOpeaUtueahOW5v+aSreWRveWQjeepuumXtFxyXG4gICAgICovXHJcbiAgICByZW1vdmVSZWNlaXZpbmdXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCBub3RSZWNlaXZhYmxlTW9kdWxlTmFtZTogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IG1vZHVsZSA9IHRoaXMuY29ubmVjdGVkU29ja2V0cy5nZXQobW9kdWxlTmFtZSk7XHJcbiAgICAgICAgaWYgKG1vZHVsZSkgbW9kdWxlLnJlbW92ZVJlY2VpdmFibGVCcm9hZGNhc3RXaGl0ZUxpc3Qobm90UmVjZWl2YWJsZU1vZHVsZU5hbWUsIG5hbWVzcGFjZSk7XHJcbiAgICB9XHJcbn0iXX0=
