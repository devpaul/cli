const { registerSuite } = intern.getInterface('object');
const { assert } = intern.getPlugin('chai');

import { stub, SinonStub } from 'sinon';
import { getYargsStub, GroupDef, getGroupMap } from '../support/testHelper';
import MockModule from '../support/MockModule';
import sinon = require('sinon');
const groupDef: GroupDef = [
	{
		groupName: 'group1',
		commands: [{ commandName: 'command1' }]
	},
	{
		groupName: 'group2',
		commands: [{ commandName: 'command1' }, { commandName: 'command2' }]
	}
];

let sandbox: any;
let mockModule: MockModule;
let groupMap: any;
let yargsStub: {
	[index: string]: SinonStub;
};
let consoleErrorStub: SinonStub;
let consoleLogStub: SinonStub;
let processExitStub: SinonStub;
const errorMessage = 'test error message';
let registerCommands: any;

registerSuite('registerCommands', {
	beforeEach() {
		sandbox = sinon.sandbox.create();
		mockModule = new MockModule('../../src/registerCommands', require);
		mockModule.dependencies(['./configurationHelper']);
		mockModule.dependencies(['./help']);
		mockModule.dependencies(['./commands/validate']);

		registerCommands = mockModule.getModuleUnderTest().default;
		yargsStub = getYargsStub();
		groupMap = getGroupMap(groupDef);
		processExitStub = stub(process, 'exit');
	},

	afterEach() {
		sandbox.restore();
		processExitStub.restore();
		process.argv = [];
		mockModule.destroy();
	},

	tests: {
		'Should setup correct yargs arguments'() {
			const yargsArgs = ['demand', 'help', 'strict', 'check', 'command'];
			registerCommands(yargsStub, new Map());
			yargsArgs.forEach((arg) => {
				assert.isTrue(yargsStub[arg].calledOnce);
			});
		},
		'Should call strict for all commands'() {
			registerCommands(yargsStub, groupMap);
			assert.equal(yargsStub.strict.callCount, 6);
		},
		'Should call yargs.command once for each yargsCommandName passed and once for the default command'() {
			const { group } = groupMap.get('group1').get('command1');
			registerCommands(yargsStub, groupMap);
			assert.strictEqual(yargsStub.command.callCount, 6);
			assert.isTrue(yargsStub.command.getCall(0).calledWith(group, false), 'First call is for parent');
			assert.isTrue(yargsStub.command.getCall(1).calledWith('command1', false), 'Second call is sub-command');
		},
		'Should run the passed command when yargs called with group name and command'() {
			const { run } = groupMap.get('group1').get('command1');
			registerCommands(yargsStub, groupMap);
			yargsStub.command.secondCall.args[3]({});
			assert.isTrue(run.calledOnce);
		},
		'Should call into register method'() {
			registerCommands(yargsStub, groupMap);
			assert.isTrue(yargsStub.option.called);
		},
		help: {
			beforeEach() {
				registerCommands(yargsStub, groupMap);
				consoleLogStub = stub(console, 'log');
			},

			afterEach() {
				consoleLogStub.restore();
			},
			tests: {
				'main help called'() {
					const help = mockModule.getMock('./help').formatHelp;
					help.reset();
					yargsStub.command.lastCall.args[3]({ _: [], h: true });
					assert.isTrue(help.calledOnce);
				},
				'group help called'() {
					const help = mockModule.getMock('./help').formatHelp;
					help.reset();
					yargsStub.command.firstCall.args[3]({ _: ['group'], h: true });
					assert.isTrue(help.calledOnce);
				},
				'command help called'() {
					const help = mockModule.getMock('./help').formatHelp;
					help.reset();
					yargsStub.command.secondCall.args[3]({ _: ['group', 'command'], h: true });
					assert.isTrue(help.calledOnce);
				}
			}
		},
		'command arguments': {
			'pass dojo rc config as run arguments and expand to all aliases'() {
				groupMap = getGroupMap(groupDef, (compositeKey: string) => {
					return (func: Function) => {
						func('foo', { alias: ['f', 'fo'] });
						return compositeKey;
					};
				});
				const { run } = groupMap.get('group1').get('command1');
				const registerCommands = mockModule.getModuleUnderTest().default;
				const configurationHelper = mockModule.getMock('./configurationHelper');
				configurationHelper.default = {
					sandbox() {
						return {
							get() {
								return { f: 'bar' };
							}
						};
					}
				};
				registerCommands(yargsStub, groupMap);
				yargsStub.command.secondCall.args[3]({ f: undefined });
				assert.isTrue(run.calledOnce);
				assert.deepEqual(run.firstCall.args[1], { foo: 'bar', f: 'bar', fo: 'bar' });
			},
			'command line args should override dojo rc config'() {
				process.argv = ['-foo'];
				const { run } = groupMap.get('group1').get('command1');
				const registerCommands = mockModule.getModuleUnderTest().default;
				const configurationHelper = mockModule.getMock('./configurationHelper');
				configurationHelper.default = {
					sandbox() {
						return {
							get() {
								return { foo: 'bar' };
							}
						};
					}
				};
				registerCommands(yargsStub, groupMap);
				yargsStub.command.secondCall.args[3]({ foo: 'foo' });
				assert.isTrue(run.calledOnce);
				assert.deepEqual(run.firstCall.args[1], { foo: 'foo' });
			},
			'default command line args should not override dojo rc config'() {
				groupMap = getGroupMap(groupDef, (compositeKey: string) => {
					return (func: Function) => {
						func('foo', { alias: ['f', 'fo'] });
						return compositeKey;
					};
				});
				const { run } = groupMap.get('group1').get('command1');
				const registerCommands = mockModule.getModuleUnderTest().default;
				const configurationHelper = mockModule.getMock('./configurationHelper');
				configurationHelper.default = {
					sandbox() {
						return {
							get() {
								return { foo: 'bar' };
							}
						};
					}
				};
				registerCommands(yargsStub, groupMap);
				yargsStub.command.secondCall.args[3]({ foo: 'foo', fo: 'foo', f: 'foo' });
				assert.isTrue(run.calledOnce);
				assert.deepEqual(run.firstCall.args[1], { foo: 'bar', fo: 'bar', f: 'bar' });
			},
			'command line options aliases should override dojo rc config'() {
				process.argv = ['-f'];
				yargsStub = getYargsStub();
				groupMap = getGroupMap(groupDef, (compositeKey: string) => {
					return (func: Function) => {
						func('foo', { alias: ['f'] });
						return compositeKey;
					};
				});
				const { run } = groupMap.get('group1').get('command1');
				const registerCommands = mockModule.getModuleUnderTest().default;
				const configurationHelper = mockModule.getMock('./configurationHelper');
				configurationHelper.default = {
					sandbox() {
						return {
							get() {
								return { foo: 'bar' };
							}
						};
					}
				};
				registerCommands(yargsStub, groupMap);
				yargsStub.command.secondCall.args[3]({ f: 'foo', foo: 'foo' });
				assert.isTrue(run.calledOnce);
				assert.deepEqual(run.firstCall.args[1], { foo: 'foo', f: 'foo' });
			},
			'should use rc config value for option aliases'() {
				yargsStub = getYargsStub({ foo: ['f'], f: ['foo'] });
				groupMap = getGroupMap(groupDef, (compositeKey: string) => {
					return (func: Function) => {
						func('foo', { alias: 'f' });
						return compositeKey;
					};
				});
				const { run } = groupMap.get('group1').get('command1');
				const registerCommands = mockModule.getModuleUnderTest().default;
				const configurationHelper = mockModule.getMock('./configurationHelper');
				configurationHelper.default = {
					sandbox() {
						return {
							get() {
								return { foo: 'bar' };
							}
						};
					}
				};
				registerCommands(yargsStub, groupMap);
				yargsStub.command.secondCall.args[3]({ f: 'foo', foo: 'foo' });
				assert.isTrue(run.calledOnce);
				assert.deepEqual(run.firstCall.args[1], { foo: 'bar', f: 'bar' });
			},
			'should use default command line arguments when not provided in config'() {
				yargsStub = getYargsStub({ foo: ['f'], f: ['foo'] });
				const { run } = groupMap.get('group1').get('command1');
				const registerCommands = mockModule.getModuleUnderTest().default;
				const configurationHelper = mockModule.getMock('./configurationHelper');
				configurationHelper.default = {
					sandbox() {
						return {
							get() {
								return {};
							}
						};
					}
				};
				registerCommands(yargsStub, groupMap);
				yargsStub.command.secondCall.args[3]({ f: 'foo', foo: 'foo' });
				assert.isTrue(run.calledOnce);
				assert.deepEqual(run.firstCall.args[1], { foo: 'foo', f: 'foo' });
			}
		},
		'default command': {
			beforeEach() {
				groupMap = getGroupMap(groupDef);
				registerCommands(yargsStub, groupMap);
				consoleErrorStub = stub(console, 'error');
			},

			afterEach() {
				consoleErrorStub.restore();
			},

			tests: {
				'Should register the default command'() {
					const { register } = groupMap.get('group1').get('command1');
					assert.isTrue(register.calledTwice);
				},
				async 'Should run default command when yargs called with only group name'() {
					const { run } = groupMap.get('group1').get('command1');
					await yargsStub.command.firstCall.args[3]({ _: ['group'] });
					assert.isTrue(run.calledOnce);
				},
				async 'Should not run default command when yargs called with group name and command'() {
					const { run } = groupMap.get('group1').get('command1');
					await yargsStub.command.firstCall.args[3]({ _: ['group', 'command'] });
					assert.isFalse(run.calledOnce);
				},
				async 'Should run validateable command when yargs called'() {
					const command = groupMap.get('group1').get('command1');
					command.validate = sinon.stub().resolves(true);
					await yargsStub.command.firstCall.args[3]({ _: ['group'] });
					assert.isTrue(command.validate.calledOnce);
					assert.isTrue(command.run.calledOnce);
				},
				async 'Should not run validateable command when yargs called with failing command'() {
					const command = groupMap.get('group1').get('command1');
					command.validate = sinon.stub().resolves(false);
					await yargsStub.command.firstCall.args[3]({ _: ['group'] });
					assert.isTrue(command.validate.calledOnce);
					assert.isFalse(command.run.called);
				},
				async 'Should run a command that failed to validate when using --force'() {
					const command = groupMap.get('group1').get('command1');
					command.validate = sinon.stub().resolves(false);
					await yargsStub.command.firstCall.args[3]({ _: ['group'], force: true });
					assert.isTrue(command.validate.calledOnce);
					assert.isTrue(command.run.called);
				}
			}
		},
		'validating command': {
			beforeEach() {
				groupMap = getGroupMap(groupDef);
				consoleErrorStub = stub(console, 'error');
			},

			afterEach() {
				consoleErrorStub.restore();
			},

			tests: {
				async 'Should run validateCommand and continue if valid'() {
					groupMap = getGroupMap(groupDef, () => () => {}, true);
					const command = groupMap.get('group1').get('command1');
					command.validate = sinon.stub().resolves(true);
					const registerCommands = mockModule.getModuleUnderTest().default;
					registerCommands(yargsStub, groupMap);
					await yargsStub.command.secondCall.args[3]({});
					assert.isTrue(command.validate.called, 'validate was not called');
					assert.isTrue(command.run.calledOnce, 'run wasnt called');
				},
				async 'Should run validateCommand stop if invalid'() {
					groupMap = getGroupMap(groupDef, () => () => {}, true);
					const command = groupMap.get('group1').get('command1');
					command.validate = sinon.stub().resolves(false);
					const registerCommands = mockModule.getModuleUnderTest().default;
					registerCommands(yargsStub, groupMap);
					await yargsStub.command.secondCall.args[3]({});
					assert.isTrue(command.validate.called, 'validate was not called');
					assert.isFalse(command.run.calledOnce, 'run was called when it shouldnt have been');
				},
				async 'Should run validateCommand and continue even if invalid when using --force'() {
					groupMap = getGroupMap(groupDef, () => () => {}, true);
					const command = groupMap.get('group1').get('command1');
					command.validate = sinon.stub().resolves(false);
					const registerCommands = mockModule.getModuleUnderTest().default;
					registerCommands(yargsStub, groupMap);
					await yargsStub.command.secondCall.args[3]({ force: true });
					assert.isTrue(command.validate.called, 'validate was not called');
					assert.isTrue(command.run.calledOnce, 'run wasnt called');
				}
			}
		},
		'handling errors': {
			beforeEach() {
				consoleErrorStub = stub(console, 'error');
			},

			afterEach() {
				consoleErrorStub.restore();
			},

			tests: {
				async 'Should show error message if the run command rejects'() {
					groupMap = getGroupMap([
						{
							groupName: 'group1',
							commands: [{ commandName: 'command1', fails: true }]
						}
					]);
					registerCommands(yargsStub, groupMap);
					await yargsStub.command.firstCall.args[3]({ _: ['group'] });
					assert.isTrue(consoleErrorStub.calledOnce);
					assert.isTrue(consoleErrorStub.firstCall.calledWithMatch(errorMessage));
					assert.isTrue(processExitStub.called);
				},
				async 'Should exit process with exitCode of 1 when no exitCode is returned'() {
					groupMap = getGroupMap([
						{
							groupName: 'group1',
							commands: [{ commandName: 'command1', fails: true }]
						}
					]);
					registerCommands(yargsStub, groupMap);
					await yargsStub.command.firstCall.args[3]({ _: ['group'] });
					assert.isTrue(processExitStub.calledOnce);
					assert.isTrue(processExitStub.calledWith(1));
				},
				async 'Should exit process with passed exit code'() {
					groupMap = getGroupMap([
						{
							groupName: 'group1',
							commands: [{ commandName: 'command1', fails: true, exitCode: 100 }]
						}
					]);
					registerCommands(yargsStub, groupMap);
					await yargsStub.command.firstCall.args[3]({ _: ['group'] });
					assert.isTrue(processExitStub.calledOnce);
					assert.isTrue(processExitStub.calledWith(100));
				}
			}
		}
	}
});
