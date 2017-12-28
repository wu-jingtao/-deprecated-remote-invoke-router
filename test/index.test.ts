import * as http from 'http';
import expect = require('expect.js');
import { RemoteInvoke } from 'remote-invoke';
import { BinaryWS_socket } from './BinaryWS_socket';
import { ServerSocket } from 'binary-ws/bin/server/classes/ServerSocket';

import { ErrorType } from './../src/ErrorType';
import { TestRouter } from './TestRouter';
import { ConnectedModule } from '../src/index';

let router: TestRouter;
let module_1: RemoteInvoke;
let module_2: RemoteInvoke;
let module_3: RemoteInvoke;

before(function (done) {
    const server = http.createServer();
    server.listen(8080);

    router = new TestRouter(server, { url: 'ws://localhost:8080' });
    router.on('module_connected', () => {
        if (router.connectedModules.size === 3) done();
    });

    module_1 = new RemoteInvoke(new BinaryWS_socket(new ServerSocket({ url: 'ws://localhost:8080', headers: { name: 'm1' } })), 'm1');
    module_2 = new RemoteInvoke(new BinaryWS_socket(new ServerSocket({ url: 'ws://localhost:8080', headers: { name: 'm2' } })), 'm2');
    module_3 = new RemoteInvoke(new BinaryWS_socket(new ServerSocket({ url: 'ws://localhost:8080', headers: { name: 'm3' } })), 'm3');

    router.emitReceivedMessage = true;
    router.emitSentMessage = true;
    router.emitExchangeError = true;

    router.printMessageHeader = false;
    router.printExchangeError = false;

    module_1.printMessage = false;
    module_2.printMessage = false;
    module_3.printMessage = false;
});

it('测试模块重复连接', function (done) {
    new RemoteInvoke(new BinaryWS_socket(new ServerSocket({ url: 'ws://localhost:8080', headers: { name: 'm1' } })), 'm1');
    router.once('exchangeError', (type, module) => {
        expect(type).to.be(ErrorType.duplicateConnection);
        expect(module.moduleName).to.be('m1');
        done();
    });
});

describe('测试调用', function () {

    it('测试调用的模块不存在', function (done) {
        module_1.invoke('test', 'a', { data: '123' })
            .then(() => done('不可能执行到这'))
            .catch(err => { expect(err.message).to.be('router：无法连接到模块"test"'); done() });
    });

    it('测试调用的模块没有权限', function (done) {
        module_1.invoke('m2', 'a/b', { data: '123' })
            .then(() => done('不可能执行到这'))
            .catch(err => { expect(err.message).to.be('router：没有权限调用模块"m2"的"a/b"'); done() });
    });

    it('测试调用白名单', function (done) {
        const testObj = { a: '1', b: 2, c: true, d: null, e: [1.1, 2.2, 3.3] }; //测试数据
        const testBuffer = Buffer.alloc(512 * 1023 * 4);
        for (let index = 0; index < testBuffer.length; index++) {
            testBuffer[index] = index % 2 === 0 ? 0 : 1;
        }

        router.addInvokableWhiteList('m1', 'm2', 'a');
        const m3 = router.connectedModules.get('m3') as ConnectedModule;

        module_2.export('a/1', async (data) => {    //原封不动地传递回去
            const files: { name: string, file: Buffer }[] = [];

            for (const item of data.files) {
                files.push({ name: item.name, file: await item.getFile() });
            }

            return { data: data.data, files };
        });

        Promise.resolve()
            .then(() => module_1.invoke('m2', 'a/1', { data: testObj, files: [{ name: '1', file: testBuffer }] }))
            .then(result => {
                expect(result.data).to.be.eql(testObj);
                expect(result.files[0].name).to.be('1');
                expect(testBuffer.equals(result.files[0].data)).to.be.ok();
            })
            .catch(() => { throw new Error('不可能执行到这') })

            .then(() => module_1.invoke('m2', 'a/b', { data: '123' }))
            .then(() => { throw new Error('不可能执行到这') })
            .catch(err => { expect(err.message).to.be('调用的方法不存在') })   //这个错误是由remote-invoke返回的

            .then(() => module_1.invoke('m2', 'b/1', { data: '123' }))
            .then(() => { throw new Error('不可能执行到这') })
            .catch(err => { expect(err.message).to.be('router：没有权限调用模块"m2"的"b/1"') })

            .then(() => module_3.invoke('m2', 'a/1', { data: '123' }))
            .then(() => { throw new Error('不可能执行到这') })
            .catch(err => { expect(err.message).to.be('router：没有权限调用模块"m2"的"a/1"') })

            .then(() => {
                m3.superUser = true;    //改为超级用户
                return module_3.invoke('m2', 'a/1', { data: testObj, files: [{ name: '1', file: testBuffer }] });
            })
            .then(result => {
                expect(result.data).to.be.eql(testObj);
                expect(result.files[0].name).to.be('1');
                expect(testBuffer.equals(result.files[0].data)).to.be.ok();

                m3.superUser = false;
                done();
            })
            .catch(() => { throw new Error('不可能执行到这') })
    });
});

it('测试广播', function (done) {
    //注意运行过程中传递的消息
    this.timeout(20 * 10000);

    const result1: any[] = [];
    const result3: any[] = [];
    let index = 0;

    module_1.receive('m2', 'a.1', (data) => { result1.push(data) });
    module_1.receive('m2', 'a.1.2', (data) => { result1.push(data) });
    module_1.receive('m2', 'b.1', (data) => { result1.push(data) });
    module_1.receive('m2', 'b.1.2', (data) => { result1.push(data) });

    module_3.receive('m2', 'a.1', (data) => { result3.push(data) });
    module_3.receive('m2', 'a.1.2', (data) => { result3.push(data) });
    module_3.receive('m2', 'b.1', (data) => { result3.push(data) });
    module_3.receive('m2', 'b.1.2', (data) => { result3.push(data) });

    setTimeout(() => {
        module_2.broadcast('a', index++);//0
        module_2.broadcast('a.1', index++);
        module_2.broadcast('a.1.2', index++);
        module_2.broadcast('a.1.2.3', index++);
        module_2.broadcast('b', index++);//4
        module_2.broadcast('b.1', index++);
        module_2.broadcast('b.1.2', index++);
        module_2.broadcast('b.1.2.3', index++);

        setTimeout(() => {
            const m1 = router.connectedModules.get('m1') as ConnectedModule;
            const m3 = router.connectedModules.get('m3') as ConnectedModule;
            router.addReceivableWhiteList('m1', 'm2', 'a');
            m3.superUser = true;

            setTimeout(() => {
                module_2.broadcast('a', index++);//8
                module_2.broadcast('a.1', index++);
                module_2.broadcast('a.1.2', index++);
                module_2.broadcast('a.1.2.3', index++);
                module_2.broadcast('b', index++);//12
                module_2.broadcast('b.1', index++);
                module_2.broadcast('b.1.2', index++);
                module_2.broadcast('b.1.2.3', index++);

                setTimeout(() => {
                    m1.superUser = true;
                    router.removeReceivableWhiteList('m1', 'm2', 'a');
                    router.addReceivableWhiteList('m3', 'm2', 'a');
                    m3.superUser = false;

                    setTimeout(() => {
                        module_2.broadcast('a', index++);//16
                        module_2.broadcast('a.1', index++);
                        module_2.broadcast('a.1.2', index++);
                        module_2.broadcast('a.1.2.3', index++);
                        module_2.broadcast('b', index++);//20
                        module_2.broadcast('b.1', index++);
                        module_2.broadcast('b.1.2', index++);
                        module_2.broadcast('b.1.2.3', index++);

                        setTimeout(() => {
                            expect(result1).to.be.eql([
                                9, 10, 10, 11, 11,
                                17, 18, 18, 19, 19,
                                21, 22, 22, 23, 23
                            ]);
                            expect(result3).to.be.eql([
                                9, 10, 10, 11, 11,
                                13, 14, 14, 15, 15,
                                17, 18, 18, 19, 19
                            ]);

                            m1.superUser = false;
                            m3.superUser = false;

                            done();
                        }, 2000);
                    }, 2000);
                }, 2000);
            }, 2000);
        }, 2000);
    }, 2000);
});