import "mocha";
import { assert } from "chai";
import * as path from "path";
import {
    SC2Archive,
    SC2Workspace,
    openArchiveWorkspace,
} from "../src/sc2mod/archive";
import * as trig from "../src/sc2mod/trigger";
import { S2WorkspaceMetadata } from "../src/service/s2meta";

const resourcesPath = path.join("tests", "fixtures");

describe("SC2Metadata", function () {
    let s2work: SC2Workspace;
    let s2meta: S2WorkspaceMetadata;

    before(async () => {
        const sources = [
            path.resolve(path.join(resourcesPath, "sc2-data-trigger")),
        ];
        const dir = path.resolve(
            path.join("tests", "fixtures", "sc2-map.SC2Map"),
        );
        const rootArchive = new SC2Archive(path.basename(dir), dir);
        s2work = await openArchiveWorkspace(rootArchive, sources);
        s2meta = new S2WorkspaceMetadata(
            s2work,
            {
                loadLevel: "Default",
                localization: "enUS",
            },
            {
                enabled: true,
            },
        );
        await s2meta.build();
    });

    it("find elements by name", () => {
        assert.isDefined(
            s2meta.findElementByName(
                "libLbty_gf_OrderWorkerstoGatherNearbyResources",
            ),
        );
        assert.isDefined(s2meta.findElementByName("gf_Action1"));
        assert.isDefined(s2meta.findElementByName("gf_action_custom_name"));
        assert.isDefined(s2meta.findElementByName("c_unitCountAll"));
        assert.isDefined(
            s2meta.findElementByName(
                "libNtve_ge_FlyerHelperDisplay_c_flyerDisplaySelected",
            ),
        );
    });

    it("preset constants", () => {
        const ntveLib = s2work.trigComponent
            .getStore()
            .getLibraries()
            .get("Ntve");

        const flyerHelper = ntveLib.findElementById("25B4E1EC", trig.Preset);
        assert.deepEqual(s2meta.getConstantNamesOfPreset(flyerHelper), [
            "libNtve_ge_FlyerHelperDisplay_c_flyerDisplayNone",
            "libNtve_ge_FlyerHelperDisplay_c_flyerDisplaySelected",
            "libNtve_ge_FlyerHelperDisplay_c_flyerDisplayAll",
        ]);

        const unitDamageChangeOption = ntveLib.findElementById(
            "6387FB6F",
            trig.Preset,
        );
        assert.deepEqual(
            s2meta.getConstantNamesOfPreset(unitDamageChangeOption),
            [
                "libNtve_ge_UnitDamageChangeOption_Full",
                "libNtve_ge_UnitDamageChangeOption_No",
                "libNtve_ge_UnitDamageChangeOption_Minimal",
                "libNtve_ge_UnitDamageChangeOption_Mega",
                "libNtve_ge_UnitDamageChangeOption_Mega2",
            ],
        );
    });

    it("find preset", () => {
        const presetValue = s2meta.findElementByName("c_unitCountAll");
        assert.isDefined(s2meta.findPresetDef(presetValue));
    });

    it("documentation", () => {
        assert.equal(
            s2meta.getSymbolDoc("c_unitCountAll"),
            "**Any** - Unit Count Type",
        );
        assert.equal(
            s2meta.getSymbolDoc("UnitCreate"),
            "**Create Units Facing Angle** (Create `count|Number` `type|Unit` for player `player` at `pos` facing `angle` degrees (`flags`))\n\nCreates units facing a specified angle.  Use the *Last Created Unit* and *Last Created Units* functions to refer to the created units.",
        );
    });

    it("documentation function args", () => {
        const args = s2meta.getFunctionArgumentsDoc("UnitCreate");
        assert.equal(args.length, 6);
        assert.equal(args[0], "**Count** - `int`");
        assert.equal(args[1], "**Type** - `gamelink<Unit>`");
        assert.equal(args[2], "**Flags** - Unit Create Flags");
    });

    it("gamelinks", () => {
        assert.equal(
            s2meta.getGameLinkItem("Unit", "AberrationACGluescreenDummy").size,
            2,
        );
    });
});
