import "mocha";
import * as path from "path";
import * as fs from "fs";
import { assert } from "chai";
import {
    findSC2ArchiveDirectories,
    SC2Archive,
    SC2Workspace,
    openArchiveWorkspace,
    resolveArchiveDependencyList,
} from "../src/sc2mod/archive.js";
import * as trig from "../src/sc2mod/trigger.js";
import * as cat from "../src/sc2mod/datacatalog.js";
import * as loc from "../src/sc2mod/localization.js";
import * as dtypes from "../src/sc2mod/dtypes.js";

const resourcesPath = path.join("tests", "fixtures", "sc2-data-trigger");

describe("SC2Mod", () => {
    describe("General", () => {
        it("should find SC2 archives within directory", async () => {
            const archives = await findSC2ArchiveDirectories(resourcesPath);
            const modArchives = await findSC2ArchiveDirectories(
                path.join(resourcesPath, "mods"),
            );
            assert.isAtLeast(archives.length, 22);
            assert.isAtLeast(modArchives.length, 15);
            assert.include(
                archives,
                path.resolve(path.join(resourcesPath, "mods", "core.sc2mod")),
            );
        });

        it("should find SC2 all galaxy files", async () => {
            const core = new SC2Archive(
                "core/sc2.mod",
                path.join(resourcesPath, "mods", "core.sc2mod"),
            );
            const gf = await core.findFiles("**/*.galaxy");
            assert.isAbove(gf.length, 124);
        });

        it("find sc2map", async () => {
            const stuff = await findSC2ArchiveDirectories(
                path.join("tests", "fixtures"),
            );
            assert.isNotEmpty(stuff);
            assert.isTrue(stuff.pop().toLowerCase().endsWith(".sc2map"));
        });
    });

    context("Archive", () => {
        // let s2archive: SC2Archive;

        // before(async () => {
        //     s2archive = new SC2Archive('mods/core.sc2mod', path.resolve(path.join(resourcesPath, 'mods', 'core.sc2mod')));
        // });

        it("dependency list", async () => {
            const s2archive = new SC2Archive(
                "mods/core.sc2mod",
                path.resolve(path.join(resourcesPath, "mods", "core.sc2mod")),
            );
            const list = await s2archive.getDependencyList();
            assert.equal(list.length, 0);
        });

        it("campaign dependency list", async () => {
            const s2archive = new SC2Archive(
                "campaigns/voidstory.sc2campaign",
                path.resolve(
                    path.join(
                        resourcesPath,
                        "campaigns",
                        "voidstory.sc2campaign",
                    ),
                ),
            );
            const result = await resolveArchiveDependencyList(s2archive, [
                resourcesPath,
            ]);
            assert.equal(result.list.length, 7);
            assert.equal(result.list[0].name, "mods/core.sc2mod");
            assert.equal(result.list[1].name, "mods/liberty.sc2mod");
            assert.equal(result.list[2].name, "campaigns/liberty.sc2campaign");
            assert.equal(result.list[3].name, "mods/swarm.sc2mod");
            assert.equal(result.list[4].name, "campaigns/swarm.sc2campaign");
            assert.equal(result.list[5].name, "mods/void.sc2mod");
            assert.equal(result.list[6].name, "campaigns/void.sc2campaign");
        });

        it("void mod dependency list", async () => {
            const s2archive = new SC2Archive(
                "mods/void.sc2mod",
                path.resolve(path.join(resourcesPath, "mods", "void.sc2mod")),
            );
            const result = await resolveArchiveDependencyList(s2archive, [
                resourcesPath,
            ]);
            assert.equal(result.list.length, 3);
            assert.equal(result.list[0].name, "mods/core.sc2mod");
            assert.equal(result.list[1].name, "mods/liberty.sc2mod");
            assert.equal(result.list[2].name, "mods/swarm.sc2mod");
        });
    });

    context("Workspace", () => {
        let s2work: SC2Workspace;
        const sources = [path.resolve(path.join(resourcesPath))];
        const dir = path.resolve(
            path.join("tests", "fixtures", "sc2-map.SC2Map"),
        );
        const rootArchive = new SC2Archive(path.basename(dir), dir);

        before(async () => {
            s2work = await openArchiveWorkspace(rootArchive, sources);
        });

        it("resolvePath", async () => {
            let s2qFile = s2work.resolvePath(
                path.join(rootArchive.directory, "MapScript.galaxy"),
            );
            assert.isDefined(s2qFile);
            assert.equal(s2qFile.relativePath, "MapScript.galaxy");
            assert.isUndefined(s2qFile.namespace);

            s2qFile = s2work.resolvePath(
                path.join(
                    rootArchive.directory,
                    "Base.SC2Data",
                    "GameData",
                    "UnitData.xml",
                ),
            );
            assert.isDefined(s2qFile);
            assert.equal(s2qFile.relativePath, "GameData/UnitData.xml");
            assert.isDefined(s2qFile.namespace);
            assert.equal(s2qFile.namespace.name, "base");
            assert.equal(s2qFile.namespace.type, "sc2data");
        });

        it("load triggers", async () => {
            await s2work.trigComponent.load();
            const trigStore = s2work.trigComponent.getStore();
            assert.equal(trigStore.getLibraries().size, 3);
            assert.isTrue(trigStore.getLibraries().has("Ntve"));
            assert.isTrue(trigStore.getLibraries().has("Lbty"));
        });

        it("load localization", async () => {
            await s2work.locComponent.load();
            assert.equal(
                s2work.locComponent.triggers.elementName("Library/Name/Ntve"),
                "Built-In",
            );
        });

        it("localization text for trigger elements", async () => {
            await s2work.trigComponent.load();
            await s2work.locComponent.load();
            const el = <trig.FunctionDef>(
                s2work.trigComponent
                    .getStore()
                    .findElementById("BF1FA304", trig.FunctionDef)
            );
            assert.equal(
                s2work.locComponent.triggers.elementName("Name", el),
                "Action1",
            );
        });
    });

    describe("TriggerLib", () => {
        const trigStore = new trig.TriggerStore();
        let ntveLib: trig.Library;

        before(async () => {
            const reader = new trig.XMLReader(trigStore);
            ntveLib = await reader.loadLibrary(
                fs.readFileSync(
                    path.join(
                        resourcesPath,
                        "mods",
                        "core.sc2mod/base.sc2data/TriggerLibs/NativeLib.TriggerLib",
                    ),
                    "utf8",
                ),
            );
        });

        it("should find native elements by name", () => {
            const el = ntveLib.findElementByName("UnitGetHeight");
            assert.isDefined(el);
        });

        it("should find non native elements by its full prefixed name", () => {
            // const el = ntveLib.findElementByName('libNtve_gf_DifficultyValueInt');
            const el = ntveLib.findElementByName("DifficultyValueInt");
            assert.isDefined(el);
        });

        it("element IDs should scoped per type", () => {
            assert.notEqual(
                <any>ntveLib.findElementById("00000102", trig.ParamDef),
                <any>ntveLib.findElementById("00000102", trig.Param),
            );
        }),
            context("FunctionDef", () => {
                let el: trig.FunctionDef;
                let params: trig.ParamDef[];

                before(() => {
                    el = ntveLib.findElementByName(
                        "UnitCreate",
                    ) as trig.FunctionDef;
                    assert.isDefined(el);
                    params = el.getParameters();
                    assert.isDefined(params);
                });

                it("should fetch returnType", () => {
                    assert.equal(el.returnType.type, "unitgroup");
                });

                it("should fetch parameters names", () => {
                    assert.lengthOf(params, 6);
                    assert.equal(params[0].name, "count");
                    assert.equal(params[1].name, "type");
                    assert.equal(params[2].name, "flags");
                    assert.equal(params[3].name, "player");
                    assert.equal(params[4].name, "pos");
                    assert.equal(params[5].name, "angle");
                });

                context("parameters type", () => {
                    it("should fetch primitive", () => {
                        assert.equal(params[0].type.type, "int");
                    });

                    it("should fetch gamelink", () => {
                        assert.equal(params[1].type.type, "gamelink");
                        assert.equal(params[1].type.gameType, "Unit");
                    });

                    it("should fetch preset", () => {
                        assert.equal(params[2].type.type, "preset");
                        const preset = params[2].type.typeElement.resolve();
                        assert.isDefined(preset);
                        assert.lengthOf(preset.values, 2);
                        assert.equal(
                            preset.values[0].resolve().value,
                            "c_unitCreateConstruct",
                        );
                        assert.equal(
                            preset.values[1].resolve().value,
                            "c_unitCreateIgnorePlacement",
                        );
                    });
                });
            });

        it("find PresetValue by str", () => {
            const presetValue = ntveLib.findPresetValueByStr("c_unitCountAll");
            assert.isDefined(presetValue);
            assert.equal(presetValue.name, "All");
        });

        it("find Preset by PresetValue", () => {
            const presetValue = ntveLib.findPresetValueByStr("c_unitCountAll");
            assert.isDefined(presetValue);
            const preset = ntveLib.findPresetByValue(presetValue);
            assert.isDefined(preset);
            assert.equal(preset.name, "UnitCountType");
        });
    });

    describe("Catalog", () => {
        it("store", async () => {
            const archive = new SC2Archive(
                "sc2-map.SC2Map",
                path.resolve("tests/fixtures/sc2-map.SC2Map"),
            );
            const cstore = new cat.CatalogStore();
            const tdoc = await SC2Workspace.documentFromFile(
                archive,
                "Base.SC2Data/GameData/UnitData.xml",
            );
            cstore.update(tdoc, archive);
            assert.equal(cstore.docCount, 1);
        });

        it("component", async () => {
            let workspace: SC2Workspace;
            const sources = [path.resolve(resourcesPath)];
            const dir = path.resolve(
                path.join("tests", "fixtures", "sc2-map.SC2Map"),
            );
            const rootArchive = new SC2Archive(path.basename(dir), dir);
            workspace = await openArchiveWorkspace(rootArchive, sources);
            await workspace.catalogComponent.load();
            assert.isAtLeast(
                workspace.catalogComponent.getStore().docCount,
                99,
            );
            let results: cat.CatalogDeclaration[] = [];
            for (const chunks of workspace.catalogComponent
                .getStore()
                .findEntry(dtypes.S2DataCatalogDomain.GameUI)) {
                results = results.concat(Array.from(chunks));
            }
            assert.deepEqual(
                results.map((x) => [
                    workspace.resolvePath(x.uri).archiveRelpath,
                    x.ctype,
                    x.id,
                ]),
                [
                    [
                        "base.sc2data/GameData/GameUIData.xml",
                        "GameUI",
                        "CoreDflt",
                    ],
                    ["base.sc2data/GameData/SC2Data.xml", "GameUI", "Dflt"],
                    ["base.sc2data/GameData/GameUIData.xml", "GameUI", "Dflt"],
                ],
            );
        });
    });

    describe("Localization", () => {
        const enus = new loc.LocalizationFile();

        before(() => {
            enus.readFromFile(
                path.join(
                    resourcesPath,
                    "mods",
                    "core.sc2mod/enus.sc2data/LocalizedData/TriggerStrings.txt",
                ),
            );
        });

        it("should read all entries", () => {
            assert.isAtLeast(enus.size, 18000);
        });

        it("should provide actual values", () => {
            assert.equal(enus.get("Category/Name/lib_Ntve_00000001"), "Melee");
            assert.equal(
                enus.get("Category/Name/lib_Ntve_00000003"),
                "Comparisons",
            );
            assert.isUndefined(enus.get("43bpo24b23"));
        });
    });
});
