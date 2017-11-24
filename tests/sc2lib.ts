import 'mocha';
import * as path from 'path';
import * as fs from 'fs';
import { assert } from 'chai';
import { findSC2ArchiveDirectories, SC2Archive, SC2Workspace, openArchiveWorkspace } from '../src/sc2mod/archive';
import * as trig from '../src/sc2mod/trigger';
import * as loc from '../src/sc2mod/localization';

const resourcesPath = path.join('tests', 'fixtures', 'sc2-data-trigger');

describe('SC2Mod', () => {
    describe('General', () => {
        let archives: string[];
        let archives2: string[];

        before(async () => {
            archives = await findSC2ArchiveDirectories(resourcesPath);
            archives2 = await findSC2ArchiveDirectories(path.join(resourcesPath, 'mods'));
        });

        it('should find SC2 archives within directory', () => {
            assert.lengthOf(archives, 20);
            assert.lengthOf(archives2, 13);
            assert.include(archives, path.resolve(path.join(resourcesPath, 'mods', 'core.sc2mod')));
        })

        it('should find SC2 all galaxy files', async () => {
            const core = new SC2Archive('core/sc2.mod', path.join(resourcesPath, 'mods', 'core.sc2mod'));
            const gf = await core.findFiles('*.galaxy');
            assert.lengthOf(gf, 121);
        });
    });

    context('Archive', () => {
        let s2archive: SC2Archive;

        before(async () => {
            s2archive = new SC2Archive('mods/core.sc2mod', path.resolve(path.join(resourcesPath, 'mods', 'core.sc2mod')));
        });

        it('dependency list', async () => {
            const list = await s2archive.getDependencyList();
            assert.equal(list.length, 0);
        });
    });

    context('Workspace', () => {
        let s2work: SC2Workspace;

        before(async () => {
            const sources = [
                path.resolve(path.join(resourcesPath)),
            ];
            const dir = path.resolve(path.join('tests', 'fixtures', 'sc2-map.SC2Map'));
            const rootArchive = new SC2Archive(path.basename(dir), dir);
            s2work = await openArchiveWorkspace(rootArchive, sources);
        });

        it('load triggers', async () => {
            await s2work.trigComponent.load();
            const trigStore = s2work.trigComponent.getStore();
            assert.equal(trigStore.getLibraries().size, 3);
            assert.isTrue(trigStore.getLibraries().has('Ntve'));
            assert.isTrue(trigStore.getLibraries().has('Lbty'));
        });

        it('load localization', async () => {
            await s2work.locComponent.load();
            assert.equal(s2work.locComponent.triggers.text('Library/Name/Ntve'), 'Built-In');
        });

        it('localization text for trigger elements', async () => {
            await s2work.trigComponent.load();
            await s2work.locComponent.load();
            const el = <trig.FunctionDef>s2work.trigComponent.getStore().findElementById('BF1FA304', trig.FunctionDef)
            assert.equal(s2work.locComponent.triggers.text('Name', el), 'Action1');
        });
    });

    describe('TriggerLib', () => {
        const trigStore = new trig.TriggerStore();
        let ntveLib: trig.Library;

        before(async () => {
            const reader = new trig.XMLReader(trigStore);
            ntveLib = await reader.loadLibrary(fs.readFileSync(path.join(resourcesPath, 'mods', 'core.sc2mod/base.sc2data/TriggerLibs/NativeLib.TriggerLib'), 'utf8'));
        });


        it('should find native elements by name', () => {
            const el = ntveLib.findElementByName('UnitGetHeight');
            assert.isDefined(el)
        });

        it('should find non native elements by its full prefixed name', () => {
            // const el = ntveLib.findElementByName('libNtve_gf_DifficultyValueInt');
            const el = ntveLib.findElementByName('DifficultyValueInt');
            assert.isDefined(el)
        });

        it('element IDs should scoped per type', () => {
            assert.notEqual(<any>(ntveLib.findElementById('00000102', trig.ParamDef)), <any>(ntveLib.findElementById('00000102', trig.Param)))
        }),

        context('FunctionDef', () => {
            let el: trig.FunctionDef;
            let params: trig.ParamDef[];

            before(() => {
                el = ntveLib.findElementByName('UnitCreate') as trig.FunctionDef;
                assert.isDefined(el)
                params = el.getParameters();
                assert.isDefined(params)
            });

            it('should fetch returnType', () => {
                assert.equal(el.returnType, 'unitgroup');
            });

            it('should fetch parameters names', () => {
                assert.lengthOf(params, 6);
                assert.equal(params[0].name, 'count');
                assert.equal(params[1].name, 'type');
                assert.equal(params[2].name, 'flags');
                assert.equal(params[3].name, 'player');
                assert.equal(params[4].name, 'pos');
                assert.equal(params[5].name, 'angle');
            });

            context('parameters type', () => {
                it('should fetch primitive', () => {
                    assert.equal(params[0].type.type, 'int');
                })

                it('should fetch gamelink', () => {
                    assert.equal(params[1].type.type, 'gamelink');
                    assert.equal(params[1].type.gameType, 'Unit');
                })

                it('should fetch preset', () => {
                    assert.equal(params[2].type.type, 'preset');
                    const preset = params[2].type.typeElement.resolve();
                    assert.isDefined(preset);
                    assert.lengthOf(preset.values, 2);
                    assert.equal(preset.values[0].resolve().value, 'c_unitCreateConstruct');
                    assert.equal(preset.values[1].resolve().value, 'c_unitCreateIgnorePlacement');
                })
            });
        });

        it('find PresetValue by str', () => {
            const presetValue = ntveLib.findPresetValueByStr('c_unitCountAll');
            assert.isDefined(presetValue);
            assert.equal(presetValue.name, 'All');
        });

        it('find Preset by PresetValue', () => {
            const presetValue = ntveLib.findPresetValueByStr('c_unitCountAll');
            assert.isDefined(presetValue);
            const preset = ntveLib.findPresetByValue(presetValue);
            assert.isDefined(preset);
            assert.equal(preset.name, 'UnitCountType');
        });
    });

    describe('Localization', () => {
        const enus = new loc.LocalizationFile();

        before(() => {
            enus.readFromFile(path.join(resourcesPath, 'mods', 'core.sc2mod/enus.sc2data/LocalizedData/TriggerStrings.txt'));
        });

        it('should read all entries', () => {
            assert.equal(enus.size, 18669);
        })

        it('should provide actual values', () => {
            assert.equal(enus.get('Category/Name/lib_Ntve_00000001'), 'Melee');
            assert.equal(enus.get('Category/Name/lib_Ntve_00000003'), 'Comparisons');
            assert.isUndefined(enus.get('43bpo24b23'));
        })
    });
});
