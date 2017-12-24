import { EventSpace } from 'eventspace/bin/classes/EventSpace';

import { RemoteInvokeRouter } from "./RemoteInvokeRouter";
import { ConnectedModule } from "./ConnectedModule";
import { EventLevel } from 'eventspace/bin/classes/EventLevel';

/**
 * 广播消息转发中心
 */
export class BroadcastExchangeCenter {

    private readonly _broadcastReceiverList = new EventSpace(); //其他模块申请要接收的广播列表。[broadcastSender, path, ConnectedModule.sendData]

    constructor(private readonly _router: RemoteInvokeRouter) { }

    /**
     * 申请要接收的广播
     * @param cm 申请接收广播的模块
     * @param broadcastSender 要接收哪个模块发出的广播
     * @param pathArray 被JSON.parse()后的path
     */
    receive(cm: ConnectedModule, broadcastSender: string, pathArray: string[], path: string) {
        const en = [broadcastSender, ...pathArray];

        if (!this._broadcastReceiverList.has(en)) {     //有新的广播path被注册
            const module = this._router.connectedModules.get(broadcastSender);
            if (module) module.openBroadcastPath(path); //通知模块打开特定路径上的广播
        }

        this._broadcastReceiverList.receive(en, cm.sendData);
    }

    cancel(cm: ConnectedModule, broadcastSender: string, pathArray: string[], path: string) {
        const en = [broadcastSender, ...pathArray];

        if (this._broadcastReceiverList.has(en)) {              //确保该路径上注册的有
            this._broadcastReceiverList.cancel(en, cm.sendData);//删除特定模块的发送函数
            if (!this._broadcastReceiverList.has(en)) {         //如果删光了该path上的所有接收者
                const module = this._router.connectedModules.get(broadcastSender);
                if (module) module.closeBroadcastPath(path);    //通知模块关闭广播
            }
        }
    }

    /**
     * 向其他模块转发广播
     * @param broadcastSender 广播的发送者
     * @param pathArray 路径
     * @param data 要转发的消息
     */
    exchange(broadcastSender: string, pathArray: string[], data: [string, Buffer]) {
        this._broadcastReceiverList.triggerAncestors([broadcastSender, ...pathArray], data);
    }

    /**
     * 打开某个模块所有被其他模块监听的广播
     */
    openReceivedPath(cm: ConnectedModule) {
        const forEachLevel = (path: string, level: EventLevel, levelName: string) => {
            path = path === '' ? levelName : path + '.' + levelName;

            if (level.receivers.size > 0) cm.openBroadcastPath(path);

            level.children.forEach((level, levelName) => forEachLevel(path, level, levelName));
        };

        this._broadcastReceiverList._eventLevel.getChildLevel([cm.moduleName], true)
            .children.forEach((level, levelName) => forEachLevel('', level, levelName));
    }
}