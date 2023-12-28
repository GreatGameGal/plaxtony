import * as path from "path";
import { assert } from "chai";
import { URI } from "vscode-uri";
import { Store } from "../src/service/store";
import { mockupStoreFromS2Workspace } from "./helpers";

describe("Store", () => {
    context("S2Workspace", async () => {
        let store: Store;

        before(async () => {
            store = await mockupStoreFromS2Workspace(
                path.join("tests", "fixtures", "sc2-map.SC2Map"),
                [path.join("tests", "fixtures", "sc2-data-trigger")],
            );
        });

        it("docs", () => {
            store.documents.get(
                URI.file(
                    path.resolve(
                        path.join(
                            "tests",
                            "fixtures",
                            "sc2-map.SC2Map",
                            "MapScript.galaxy",
                        ),
                    ),
                ).toString(),
            );
            const metadata = store.s2metadata;
            assert.isDefined(metadata.getSymbolDoc("UnitGetOwner"));
        });
    });
});
