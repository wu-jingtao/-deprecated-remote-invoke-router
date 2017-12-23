import { ConnectedModule } from './ConnectedModule';
import { RemoteInvokeRouter } from "./RemoteInvokeRouter";

/**
 * 调用交换中心
 */
export class InvokeExchangeCenter {

    constructor(private readonly _router: RemoteInvokeRouter) { }

    /**
     * 转发invoke_request消息
     * @param cm 发送该消息的模块
     * @param header 被JSON.parse()后的消息头部
     * @param data 要转发的数据，第一个是消息头部，第二个是消息body
     */
    exchange_invoke_request(cm: ConnectedModule, header: any[], data: [string, Buffer]) {
        if (header[1] === cm.moduleName) {
            const receiver = this._router.connectedModules.get(header[2]);
            if (receiver) {
                if (header[3].length <= this._router.pathMaxLength) {  //检查path长度
                    if (cm.invokableWhiteList.has([receiver.moduleName, header[3].split('/')[0]])) {    //判断是否有权访问目标模块的方法
                        receiver.sendData(data);
                    } else
                        cm.addErrorNumber(new Error(`没有权限调用模块"${header[2]}"的"${header[3]}"`));
                } else
                    cm.addErrorNumber(new Error(`消息中path的长度超过了规定的个${this._router.pathMaxLength}字符`));
            } else
                cm.addErrorNumber(new Error(`被调用模块"${header[2]}"不存在`));
        } else
            cm.addErrorNumber(new Error('消息中发送者的名称与模块名称不匹配'));
    }

    /**
     * 转发除invoke_request外的其他类型的调用消息
     */
    exchange_other_invoke(cm: ConnectedModule, header: any[], data: [string, Buffer]) {
        if (header[1] === cm.moduleName) {
            const receiver = this._router.connectedModules.get(header[2]);
            if (receiver) {
                if (cm.invokableWhiteList.has([receiver.moduleName]) || receiver.invokableWhiteList.has([cm.moduleName])) {
                    receiver.sendData(data);
                } else
                    cm.addErrorNumber(new Error(`没有权限向模块"${header[2]}"转发除invoke_request外的其他类型的调用消息`));
            } else
                cm.addErrorNumber(new Error(`目标模块"${header[2]}"不存在`));
        } else
            cm.addErrorNumber(new Error('消息中发送者的名称与模块名称不匹配'));
    }
}