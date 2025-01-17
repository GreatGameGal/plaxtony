import "mocha";
import * as fs from "fs";
import * as path from "path";
import { assert } from "chai";
import * as tc from "../src/compiler/checker.js";
import { TypeChecker } from "../src/compiler/checker.js";
import {
    mockupStore,
    mockupTextDocument,
    mockupStoreFromDirectory,
} from "./helpers.js";
import {
    getPositionOfLineAndCharacter,
    findPrecedingToken,
    getTokenAtPosition,
} from "../src/service/utils.js";
import * as gt from "./../src/compiler/types.js";
import { unbindSourceFile } from "../src/compiler/binder.js";
import { URI } from "vscode-uri";

function getSymbolAt(
    checker: TypeChecker,
    sourceFile: gt.SourceFile,
    line: number,
    character: number,
): gt.Symbol | undefined {
    const token = getTokenAtPosition(
        getPositionOfLineAndCharacter(sourceFile, line, character),
        sourceFile,
    );
    return checker.getSymbolAtLocation(token);
}

function getNodeTypeAt(
    checker: TypeChecker,
    sourceFile: gt.SourceFile,
    line: number,
    character: number,
): gt.Type | undefined {
    const token = findPrecedingToken(
        getPositionOfLineAndCharacter(sourceFile, line, character),
        sourceFile,
    );
    return checker.getTypeOfNode(token);
}

describe("Checker", () => {
    describe("Resolve", () => {
        const store = mockupStore();
        const checker = new TypeChecker(store);

        context("typedef", () => {
            let type: gt.Type;
            let sourceFile: gt.SourceFile;

            before(() => {
                const document = mockupTextDocument(
                    "type_checker",
                    "typedef.galaxy",
                );
                store.updateDocument(document);
                sourceFile = store.documents.get(document.uri);
            });

            it("scalar", () => {
                type = getNodeTypeAt(checker, sourceFile, 11, 5);
                assert.isOk(type.flags & gt.TypeFlags.Typedef);
                type = getNodeTypeAt(checker, sourceFile, 11, 12);
                assert.isOk(type.flags & gt.TypeFlags.Complex);
            });

            it("struct", () => {
                type = getNodeTypeAt(checker, sourceFile, 12, 6);
                assert.isOk(type.flags & gt.TypeFlags.Typedef);
                type = getNodeTypeAt(checker, sourceFile, 12, 13);
                assert.isOk(type.flags & gt.TypeFlags.Struct);
            });

            it("struct deep", () => {
                type = getNodeTypeAt(checker, sourceFile, 13, 6);
                assert.isOk(type.flags & gt.TypeFlags.Typedef);
                type = getNodeTypeAt(checker, sourceFile, 13, 18);
                assert.isOk(type.flags & gt.TypeFlags.Struct);
                assert.equal((<gt.StructType>type).symbol.escapedName, "obj_t");
            });

            it("struct deep property", () => {
                type = getNodeTypeAt(checker, sourceFile, 15, 15);
                assert.isOk(type.flags & gt.TypeFlags.Integer);
            });

            it("funcref", () => {
                type = getNodeTypeAt(checker, sourceFile, 29, 6);
                assert.isOk(type instanceof tc.ReferenceType);
                assert.isOk(
                    (<tc.ReferenceType>type).kind &
                        gt.SyntaxKind.FuncrefKeyword,
                );
                assert.isOk(
                    (<tc.FunctionType>(<tc.ReferenceType>type).declaredType)
                        .symbol.escapedName,
                    "fprototype",
                );
            });

            it("code validation", () => {
                const diag = checker.checkSourceFile(sourceFile);
                assert.equal(diag.length, 0);
            });
        });

        context("arrayref", () => {
            let type: gt.Type;
            let sourceFile: gt.SourceFile;

            before(() => {
                const document = mockupTextDocument(
                    "type_checker",
                    "arrayref.galaxy",
                );
                store.updateDocument(document);
                sourceFile = store.documents.get(document.uri);
            });

            it("ref []", () => {
                type = getNodeTypeAt(checker, sourceFile, 7, 5);
                assert.isOk(type instanceof tc.ReferenceType);
                assert.isOk(
                    (<tc.ReferenceType>type).kind &
                        gt.SyntaxKind.ArrayrefKeyword,
                );
                assert.isOk(
                    (<tc.ReferenceType>type).declaredType.flags &
                        gt.TypeFlags.Array,
                );
                assert.isOk(
                    (<tc.ArrayType>(<tc.ReferenceType>type).declaredType)
                        .elementType.flags & gt.TypeFlags.String,
                );
            });

            it("ref [][]", () => {
                type = getNodeTypeAt(checker, sourceFile, 8, 5);
                assert.isOk(type instanceof tc.ReferenceType);
                assert.isOk(
                    (<tc.ReferenceType>type).kind &
                        gt.SyntaxKind.ArrayrefKeyword,
                );
                assert.isOk(
                    (<tc.ReferenceType>type).declaredType.flags &
                        gt.TypeFlags.Array,
                );
                assert.isOk(
                    (<tc.ArrayType>(<tc.ReferenceType>type).declaredType)
                        .elementType.flags & gt.TypeFlags.Array,
                );
            });

            it("typedef decl of [][]", () => {
                type = getNodeTypeAt(checker, sourceFile, 13, 2);
                assert.isOk(type.flags & gt.TypeFlags.Typedef);
                assert.isOk(
                    (<gt.TypedefType>type).referencedType.flags &
                        gt.TypeFlags.Array,
                );
                assert.isOk(
                    (<gt.ArrayType>(<gt.MappedType>type).referencedType)
                        .elementType.flags & gt.TypeFlags.Array,
                );
            });

            it("typedef var of [][]", () => {
                type = getNodeTypeAt(checker, sourceFile, 13, 11);
                assert.isOk(type.flags & gt.TypeFlags.Array);
            });
        });

        it("struct property", () => {
            let type: gt.Type;

            const document = mockupTextDocument(
                "type_checker",
                "struct.galaxy",
            );
            store.updateDocument(document);
            const sourceFile = store.documents.get(document.uri);

            type = getNodeTypeAt(checker, sourceFile, 19, 21);
            assert.isAbove(type.flags & gt.TypeFlags.String, 0, ".");

            type = getNodeTypeAt(checker, sourceFile, 20, 28);
            assert.isAbove(type.flags & gt.TypeFlags.Integer, 0, "..");

            type = getNodeTypeAt(checker, sourceFile, 22, 27);
            assert.isAbove(type.flags & gt.TypeFlags.String, 0, "[].");

            type = getNodeTypeAt(checker, sourceFile, 23, 37);
            assert.isAbove(type.flags & gt.TypeFlags.Complex, 0, "[].[].");
            assert.equal(
                (<gt.ComplexType>type).kind,
                gt.SyntaxKind.UnitKeyword,
            );
        });

        it("structref property", () => {
            let type: gt.Type;

            const document = mockupTextDocument("type_checker", "ref.galaxy");
            store.updateDocument(document);
            const sourceFile = store.documents.get(document.uri);

            type = getNodeTypeAt(checker, sourceFile, 9, 12);
            assert.isAbove(type.flags & gt.TypeFlags.Integer, 0);
        });

        it("funcref array", () => {
            let type: gt.Type;

            const document = mockupTextDocument(
                "type_checker",
                "funcref_arr.galaxy",
            );
            store.updateDocument(document);
            const sourceFile = store.documents.get(document.uri);

            type = getNodeTypeAt(checker, sourceFile, 2, 31);
            assert.isAbove(type.flags & gt.TypeFlags.Array, 0);
            assert.isAbove(
                (<gt.ArrayType>type).elementType.flags & gt.TypeFlags.Reference,
                0,
            );
        });
    });

    describe("Static", () => {
        const documentStatic1 = mockupTextDocument(
            "type_checker",
            "static_conflict1.galaxy",
        );
        const documentStatic2 = mockupTextDocument(
            "type_checker",
            "static_conflict2.galaxy",
        );
        const store = mockupStore(documentStatic1, documentStatic2);
        const sourceFileStatic1 = store.documents.get(documentStatic1.uri);
        const sourceFileStatic2 = store.documents.get(documentStatic2.uri);
        const checker = new TypeChecker(store);

        it("name non-conflict", () => {
            let dg: gt.Diagnostic[];
            dg = checker.checkSourceFile(sourceFileStatic1, true);
            assert.equal(dg.length, 0, dg.join("\n"));
            dg = checker.checkSourceFile(sourceFileStatic2, true);
            assert.equal(dg.length, 0, dg.join("\n"));
        });
    });

    describe("Resolve symbol", () => {
        const documentStruct = mockupTextDocument(
            "type_checker",
            "struct.galaxy",
        );
        const documentRef = mockupTextDocument("type_checker", "ref.galaxy");
        const store = mockupStore(documentStruct, documentRef);
        const sourceFileStruct = store.documents.get(documentStruct.uri);
        const sourceFileRef = store.documents.get(documentRef.uri);
        const checker = new TypeChecker(store);

        it("variable", () => {
            let symbol: gt.Symbol;

            symbol = getSymbolAt(checker, sourceFileStruct, 14, 0);
            assert.isDefined(symbol);
        });

        it("[]variable", () => {
            let symbol: gt.Symbol;

            symbol = getSymbolAt(checker, sourceFileStruct, 15, 0);
            assert.isDefined(symbol);
        });

        it("structref", () => {
            let symbol: gt.Symbol;

            symbol = getSymbolAt(checker, sourceFileRef, 9, 11);
            assert.isDefined(symbol);

            symbol = getSymbolAt(checker, sourceFileRef, 10, 11);
            assert.isDefined(symbol);
        });
    });

    describe("Type", () => {
        function validateDocument(src: string) {
            const doc = mockupTextDocument("type_checker", "diagnostics", src);
            const store = mockupStore(doc);
            const checker = new TypeChecker(store);
            const sourceFile = store.documents.get(doc.uri);

            return checker.checkSourceFile(sourceFile);
        }

        it("string", () => {
            const diagnostics = validateDocument("string.galaxy");
            assert.equal(diagnostics.length, 0);
        });

        it("complex", () => {
            const diagnostics = validateDocument("complex.galaxy");
            assert.equal(diagnostics.length, 0);
        });

        it("loop", () => {
            const diagnostics = validateDocument("loop.galaxy");
            assert.equal(diagnostics.length, 2);
            assert.equal(
                diagnostics[0].messageText,
                "break statement used outside of loop boundaries",
            );
            assert.equal(
                diagnostics[1].messageText,
                "continue statement used outside of loop boundaries",
            );
        });

        it("func_call", () => {
            const diagnostics = validateDocument("func_call.galaxy");
            assert.equal(diagnostics.length, 3);
            assert.equal(
                diagnostics[0].messageText,
                "Type 'string' is not assignable to type 'integer'",
            );
            assert.equal(
                diagnostics[1].messageText,
                "Type 'integer' is not assignable to type 'string'",
            );
            assert.equal(
                diagnostics[2].messageText,
                "Type 'null' is not assignable to type 'integer'",
            );
        });

        it("struct", () => {
            const diagnostics = validateDocument("struct.galaxy");
            assert.equal(diagnostics.length, 5);
            assert.equal(
                diagnostics[0].messageText,
                "Can only pass basic types",
            );
            assert.equal(
                diagnostics[1].messageText,
                "Type 'struct1_t' is not assignable to type 'struct1_t'",
            );
            assert.equal(
                diagnostics[2].messageText,
                "Type 'struct2_t' is not assignable to type 'struct1_t'",
            );
            assert.equal(
                diagnostics[3].messageText,
                "Type 'struct1_t' is not assignable to type 'struct1_t'",
            );
            assert.equal(
                diagnostics[4].messageText,
                "Type 'struct2_t' is not assignable to type 'structref<struct1_t>'",
            );
        });

        it("funcref", () => {
            const diagnostics = validateDocument("funcref.galaxy");
            assert.equal(diagnostics.length, 3);
            assert.equal(
                diagnostics[0].messageText,
                "Type 'fn_prototype_c' is not assignable to type 'funcref<fn_prototype_t>'",
            );
            assert.equal(
                diagnostics[1].messageText,
                "Expected 1 arguments, got 2",
            );
            assert.equal(
                diagnostics[2].messageText,
                "Type 'void' is not assignable to type 'integer'",
            );
        });

        it("array", () => {
            const diagnostics = validateDocument("array.galaxy");
            assert.isAtLeast(diagnostics.length, 1);
            assert.equal(
                diagnostics[0].messageText,
                "Index access on non-array type",
            );
        });

        it("typedef", () => {
            const diagnostics = validateDocument("../typedef.galaxy");
            assert.equal(diagnostics.length, 0);
        });

        it("arrayref", () => {
            const diagnostics = validateDocument("../arrayref.galaxy");
            assert.equal(diagnostics.length, 0);
        });
    });

    describe("Diagnostics", () => {
        function checkFile(filename: string) {
            const document = mockupTextDocument("type_checker", filename);
            const store = mockupStore(document);
            const sourceFile = store.documents.get(document.uri);
            const checker = new TypeChecker(store);

            unbindSourceFile(sourceFile, store);
            const diagnostics = checker.checkSourceFile(sourceFile, true);

            const expectedDiags = new Map<number, gt.Diagnostic>();
            for (const [cLine, cInfo] of sourceFile.commentsLineMap) {
                const m = sourceFile.text
                    .substring(cInfo.pos, cInfo.end)
                    .trim()
                    .match(/^\/\/ \^ERR\:?\s?(.*)$/);
                if (m) {
                    const dg = diagnostics.find((v) => v.line === cLine - 1);
                    assert.isDefined(
                        dg,
                        `(expected) ${cLine}: ${m[1] || "ERR"}`,
                    );
                    expectedDiags.set(cLine - 1, dg);
                }
            }

            if (diagnostics.length > 0 && expectedDiags.size > 0) {
                for (const dg of diagnostics) {
                    assert.isTrue(
                        expectedDiags.has(dg.line),
                        `(unexpected) ${dg.line + 1}: ${dg.messageText}`,
                    );
                }
            }

            return diagnostics;
        }

        describe("Error", () => {
            for (let filename of fs.readdirSync(
                path.resolve("tests/fixtures/type_checker/error"),
            )) {
                it(filename, () => {
                    assert.isAtLeast(
                        checkFile(path.join("error", filename)).length,
                        1,
                    );
                });
            }
        });

        describe("Pass", () => {
            for (let filename of fs.readdirSync(
                path.resolve("tests/fixtures/type_checker/pass"),
            )) {
                it(filename, () => {
                    const dg = checkFile(path.join("pass", filename));
                    assert.equal(dg.length, 0, "Unexpected diagnostics");
                });
            }
        });
    });

    describe("Diagnostics Recursive", () => {
        const drFixturesDir =
            "tests/fixtures/type_checker/diagnostics_recursive";
        for (let nsName of fs.readdirSync(path.resolve(drFixturesDir))) {
            for (let nsCurrentFilename of fs.readdirSync(
                path.resolve(drFixturesDir, nsName),
            )) {
                const matchedTestFile = nsCurrentFilename.match(
                    /^(([\w]+)_(pass|fail))\.galaxy$/,
                );
                if (!matchedTestFile) continue;

                it(`${nsName}/${matchedTestFile[1]}`, async () => {
                    const store = await mockupStoreFromDirectory(
                        path.resolve(drFixturesDir, nsName),
                    );
                    const checker = new TypeChecker(store);
                    const sourceFile = store.documents.get(
                        URI.file(
                            path.resolve(
                                drFixturesDir,
                                nsName,
                                nsCurrentFilename,
                            ),
                        ).toString(),
                    );

                    const result =
                        checker.checkSourceFileRecursively(sourceFile);
                    switch (matchedTestFile[3]) {
                        case "pass": {
                            assert.isTrue(
                                result.success,
                                Array.from(result.diagnostics.values())
                                    .flat()
                                    .map((item) => item.toString())
                                    .join("\n"),
                            );
                            break;
                        }
                        case "fail": {
                            assert.isFalse(result.success);
                            break;
                        }
                        default: {
                            throw new Error();
                        }
                    }
                });
            }
        }
    });
});
