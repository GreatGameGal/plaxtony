import { Store } from "../src/service/store.js";
import { createProvider } from "../src/service/provider.js";
import { DiagnosticsProvider } from "../src/service/diagnostics.js";
import { NavigationProvider } from "../src/service/navigation.js";
import {
    CompletionsProvider,
    CompletionFunctionExpand,
} from "../src/service/completions.js";
import { SignaturesProvider } from "../src/service/signatures.js";
import { HoverProvider } from "../src/service/hover.js";
import { ReferencesProvider } from "../src/service/references.js";
import {
    getPositionOfLineAndCharacter,
    findPrecedingToken,
} from "../src/service/utils.js";
import * as gt from "../src/compiler/types.js";
import {
    mockupSourceFile,
    mockupTextDocument,
    mockupStore,
    mockupStoreFromDirectory,
} from "./helpers.js";
import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { assert } from "chai";
import * as path from "path";
import "mocha";

describe("Service", () => {
    describe("Utils", () => {
        const sourceFile = mockupSourceFile(
            path.join("service", "navigation", "declarations.galaxy"),
        );

        it("getPositionOfLineAndCharacter", () => {
            assert.equal(getPositionOfLineAndCharacter(sourceFile, 0, 0), 0);
            assert.equal(getPositionOfLineAndCharacter(sourceFile, 0, 20), 20);
            assert.equal(getPositionOfLineAndCharacter(sourceFile, 1, 0), 21);
            assert.equal(getPositionOfLineAndCharacter(sourceFile, 6, 20), 91);
        });

        it("findPrecedingToken", () => {
            assert.equal(
                (<gt.Identifier>findPrecedingToken(16, sourceFile)).name,
                "decl_struct",
            );
            assert.equal(
                findPrecedingToken(1, sourceFile).kind,
                gt.SyntaxKind.StructKeyword,
            );
            assert.equal(
                findPrecedingToken(20, sourceFile).kind,
                gt.SyntaxKind.OpenBraceToken,
            );
            assert.equal(findPrecedingToken(0, sourceFile), undefined);
        });

        it('findPrecedingToken "incomplete_if_identifier"', () => {
            const sourceFile = mockupSourceFile(
                path.join(
                    "type_checker",
                    "find",
                    "incomplete_if_identifier.galaxy",
                ),
            );
            const t = findPrecedingToken(
                getPositionOfLineAndCharacter(sourceFile, 2, 25),
                sourceFile,
            );
            assert.equal(
                t.kind,
                gt.SyntaxKind.Identifier,
                `not expected ${t.kindName}`,
            );
            assert.equal((<gt.Identifier>t).name, "UserDataGetFixed");
        });
    });

    describe("Diagnostics", () => {
        const store = new Store();

        it("should report about parse errors", () => {
            const diagnosticsProvider = createProvider(
                DiagnosticsProvider,
                store,
            );
            const document = mockupTextDocument(
                path.join("service", "diagnostics_parse_error.galaxy"),
            );
            store.updateDocument(document);
            diagnosticsProvider.subscribe(document.uri);
            const diagnostics = diagnosticsProvider.provideDiagnostics(
                document.uri,
            );
            assert.isAtLeast(diagnostics.length, 1);
            assert.equal(
                diagnostics[0].message,
                "Expected SemicolonToken, found CloseBraceToken",
            );
        });
    });

    describe("Navigation", () => {
        const fixturesPath = "tests/fixtures/service/navigation";

        it("should provide symbols navigation per document", () => {
            const store = new Store();
            const navigation = createProvider(NavigationProvider, store);
            const document = mockupTextDocument(
                "service",
                "navigation",
                "declarations.galaxy",
            );
            store.updateDocument(document);
            const symbolDeclarations = navigation.getDocumentSymbols(
                document.uri,
            );
            assert.lengthOf(symbolDeclarations, 4);
            assert.equal(symbolDeclarations[0].name.name, "decl_struct");
            assert.equal(symbolDeclarations[1].name.name, "decl_var_string");
            assert.equal(
                symbolDeclarations[2].name.name,
                "decl_var_const_static_string",
            );
            assert.equal(symbolDeclarations[3].name.name, "main");
        });

        it("should provide symbols navigation per workspace", async () => {
            const store = await mockupStoreFromDirectory(fixturesPath);
            const navigation = createProvider(NavigationProvider, store);
            const symbolDeclarations = navigation.getWorkspaceSymbols();
            assert.lengthOf(symbolDeclarations, 7);
        });
    });

    describe("Completions", () => {
        const document = mockupTextDocument(
            "service",
            "navigation",
            "funcs.galaxy",
        );
        const documentStruct = mockupTextDocument(
            "service",
            "completion",
            "struct.galaxy",
        );
        const documentCompletions = mockupTextDocument(
            "service",
            "completion",
            "completion.galaxy",
        );
        const documentTrigger = mockupTextDocument(
            "service",
            "completion",
            "trigger.galaxy",
        );
        const store = mockupStore(
            document,
            mockupTextDocument("service", "navigation", "declarations.galaxy"),
            documentStruct,
            documentCompletions,
            documentTrigger,
        );
        const completionsProvider = createProvider(CompletionsProvider, store);
        completionsProvider.config.functionExpand =
            CompletionFunctionExpand.ArgumentsNull;

        function getCompletionsAt(
            doc: TextDocument,
            line: number,
            char: number,
        ) {
            return completionsProvider.getCompletionsAt(
                doc.uri,
                getPositionOfLineAndCharacter(
                    store.documents.get(doc.uri),
                    line,
                    char,
                ),
            );
        }

        it("should provide globaly declared symbols", () => {
            const completions = completionsProvider.getCompletionsAt(
                document.uri,
                0,
            );
            assert.isAbove(completions.items.length, 0);
            assert.isDefined(
                completions.items.find((item) => {
                    return item.label === "decl_var_string";
                }),
            );
        });

        it("should provide localy declared symbols", () => {
            const completions = completionsProvider.getCompletionsAt(
                document.uri,
                51,
            );
            assert.isAbove(completions.items.length, 0);
            assert.isDefined(
                completions.items.find((item) => {
                    return item.label === "local";
                }),
            );
        });

        it("should provide struct scoped symbols", () => {
            let completionsList: lsp.CompletionList;

            completionsList = getCompletionsAt(documentStruct, 14, 9);
            assert.lengthOf(completionsList.items, 3);
            completionsList = getCompletionsAt(documentStruct, 14, 10);
            assert.lengthOf(completionsList.items, 3);

            completionsList = getCompletionsAt(documentStruct, 15, 13);
            assert.lengthOf(completionsList.items, 1);
            completionsList = getCompletionsAt(documentStruct, 15, 14);
            assert.lengthOf(completionsList.items, 1);
            completionsList = getCompletionsAt(documentStruct, 15, 12);
            assert.lengthOf(completionsList.items, 3);

            completionsList = getCompletionsAt(documentStruct, 16, 21);
            assert.lengthOf(completionsList.items, 1);
            assert.equal(completionsList.items[0].label, "submember");
            assert.equal(
                completionsList.items[0].kind,
                lsp.CompletionItemKind.Property,
            );
            assert.equal(
                completionsProvider.resolveCompletion(completionsList.items[0])
                    .detail,
                "string submember;",
            );

            completionsList = getCompletionsAt(documentStruct, 17, 18);
            assert.notEqual(completionsList.items.length, 1);
        });

        it("string", () => {
            const completions = getCompletionsAt(documentCompletions, 2, 12);
            assert.equal(completions.items.length, 0);
        });

        it("filter suggestions basing on preceding indentifier", () => {
            const completions = getCompletionsAt(documentCompletions, 3, 9);
            assert.equal(completions.items.length, 2);
        });

        it("expand functions", () => {
            const completions = getCompletionsAt(documentCompletions, 3, 9);
            assert.equal(
                completionsProvider.resolveCompletion(completions.items[0])
                    .insertText,
                "completion_test(${1:0});$0",
            );
        });

        it("trigger handle function definitions", () => {
            let completions = getCompletionsAt(documentTrigger, 24, 19);
            assert.equal(completions.items.length, 2);
            assert.equal(completions.items[0].label, "on_t1");
            assert.isTrue(
                completionsProvider.resolveCompletion(completions.items[0])
                    .insertText === undefined,
            );

            completions = getCompletionsAt(documentTrigger, 25, 22);
            assert.equal(completions.items.length, 0);

            completions = getCompletionsAt(documentTrigger, 26, 19);
            assert.equal(completions.items.length, 2);
        });
    });

    describe("Signatures", () => {
        const document = mockupTextDocument("service", "call.galaxy");
        const docSignature = mockupTextDocument(
            "service",
            "signature",
            "signature.galaxy",
        );
        const docFnref = mockupTextDocument(
            "service",
            "signature",
            "funcref.galaxy",
        );
        const store = mockupStore(
            document,
            mockupTextDocument("service", "navigation", "funcs.galaxy"),
            docSignature,
            docFnref,
        );
        const srcFnref = store.documents.get(docFnref.uri);
        const signaturesProvider = createProvider(SignaturesProvider, store);
        let signature: lsp.SignatureHelp;

        it("should provide signature help for global functions", () => {
            assert.lengthOf(
                signaturesProvider.getSignatureAt(document.uri, 28).signatures,
                1,
            );
        });

        it("should identify active parameter", () => {
            assert.equal(
                signaturesProvider.getSignatureAt(document.uri, 29)
                    .activeParameter,
                0,
                "no whitespace 1",
            );
            assert.equal(
                signaturesProvider.getSignatureAt(document.uri, 30)
                    .activeParameter,
                1,
                "no whitespace 2",
            );

            assert.equal(
                signaturesProvider.getSignatureAt(document.uri, 49)
                    .activeParameter,
                0,
                "no whitespace 0 - sec",
            );
            assert.equal(
                signaturesProvider.getSignatureAt(document.uri, 50)
                    .activeParameter,
                1,
                "right after comma token, before whitespace",
            );
            assert.equal(
                signaturesProvider.getSignatureAt(document.uri, 51)
                    .activeParameter,
                1,
                "after whitespace and comma",
            );

            assert.equal(
                signaturesProvider.getSignatureAt(document.uri, 71)
                    .activeParameter,
                1,
                "after comma empty param",
            );
        });

        it("should properly identify bounds in nested calls", () => {
            signature = signaturesProvider.getSignatureAt(
                docSignature.uri,
                115,
            );
            assert.lengthOf(signature.signatures, 1);
            assert.equal(
                signature.signatures[0].label,
                "string name_me(int id)",
            );

            signature = signaturesProvider.getSignatureAt(
                docSignature.uri,
                116,
            );
            assert.lengthOf(signature.signatures, 1);
            assert.equal(signature.signatures[0].label, "int randomize()");

            signature = signaturesProvider.getSignatureAt(
                docSignature.uri,
                117,
            );
            assert.lengthOf(signature.signatures, 1);
            assert.equal(
                signature.signatures[0].label,
                "string name_me(int id)",
            );
        });

        context("should provide signature help when cursor at: ", () => {
            it('end of binary expr, before ")"', () => {
                assert.lengthOf(
                    signaturesProvider.getSignatureAt(docSignature.uri, 137)
                        .signatures,
                    1,
                );
            });
            it('begining of prefix expr, after "("', () => {
                assert.lengthOf(
                    signaturesProvider.getSignatureAt(docSignature.uri, 152)
                        .signatures,
                    1,
                );
            });
            it('whitespace, inbetween "(" and ")"', () => {
                assert.lengthOf(
                    signaturesProvider.getSignatureAt(docSignature.uri, 172)
                        .signatures,
                    1,
                );
                assert.lengthOf(
                    signaturesProvider.getSignatureAt(docSignature.uri, 171)
                        .signatures,
                    1,
                );
            });
            it('whitespace, inbetween "," and prefixed expr of numeric literal', () => {
                assert.lengthOf(
                    signaturesProvider.getSignatureAt(docSignature.uri, 189)
                        .signatures,
                    1,
                );
            });
            it("prefixed expr of numeric literal, inbetween operand and literal", () => {
                assert.lengthOf(
                    signaturesProvider.getSignatureAt(docSignature.uri, 195)
                        .signatures,
                    1,
                );
            });
        });

        it("funcref", () => {
            signature = signaturesProvider.getSignatureAt(
                docFnref.uri,
                getPositionOfLineAndCharacter(srcFnref, 13, 9),
            );
            assert.isDefined(signature);
            assert.equal(
                signature.signatures[0].label,
                "void fprototype(int a, string b)",
            );
        });

        it("funcref in struct", () => {
            signature = signaturesProvider.getSignatureAt(
                docFnref.uri,
                getPositionOfLineAndCharacter(srcFnref, 14, 16),
            );
            assert.isDefined(signature);
        });

        it("funcref in structref", () => {
            signature = signaturesProvider.getSignatureAt(
                docFnref.uri,
                getPositionOfLineAndCharacter(srcFnref, 15, 16),
            );
            assert.isDefined(signature);
        });
    });

    describe("Hover", () => {
        const hoverDoc = mockupTextDocument("service", "hover", "hover.galaxy");
        const store = mockupStore(hoverDoc);

        const hoverProvider = createProvider(HoverProvider, store);

        it("parameter", () => {
            const info = hoverProvider.getHoverAt({
                textDocument: hoverDoc,
                position: { line: 8, character: 4 },
            });
            assert.isDefined(info);
            const contents = <string[]>info.contents;
            assert.isAtLeast(contents.length, 1);
            assert.equal(contents[0], "```galaxy\nint a\n```");
            // assert.isAtLeast(contents.length, 2)
            // assert.equal(contents[1], 'parameter of *print_num*');
        });

        it("local var", () => {
            const info = hoverProvider.getHoverAt({
                textDocument: hoverDoc,
                position: { line: 9, character: 4 },
            });
            assert.isDefined(info);
            const contents = <string[]>info.contents;
            assert.isAtLeast(contents.length, 1);
            assert.equal(contents[0], "```galaxy\nstring b\n```");
            // assert.isAtLeast(contents.length, 2)
            // assert.equal(contents[1], 'local variable');
        });

        it("global constant", () => {
            const info = hoverProvider.getHoverAt({
                textDocument: hoverDoc,
                position: { line: 17, character: 14 },
            });
            assert.isDefined(info);
            const contents = <string[]>info.contents;
            assert.isAtLeast(contents.length, 1);
            assert.equal(contents[0], "```galaxy\nconst int c_test = 0\n```");
            // assert.isAtLeast(contents.length, 2)
            // assert.equal(contents[1], 'global constant');
        });

        it("function", () => {
            const info = hoverProvider.getHoverAt({
                textDocument: hoverDoc,
                position: { line: 17, character: 4 },
            });
            assert.isDefined(info);
            const contents = <string[]>info.contents;
            assert.isAtLeast(contents.length, 1);
            assert.equal(contents[0], "```galaxy\nvoid print_num(int a)\n```");
        });

        it("struct property", () => {
            const info = hoverProvider.getHoverAt({
                textDocument: hoverDoc,
                position: { line: 18, character: 9 },
            });
            assert.isDefined(info);
            const contents = <string[]>info.contents;
            assert.isAtLeast(contents.length, 1);
            assert.equal(contents[0], "```galaxy\nint a\n```");
            assert.isAtLeast(contents.length, 2);
            assert.equal(contents[1], "property of `info_t`");
        });

        it("struct", () => {
            const info = hoverProvider.getHoverAt({
                textDocument: hoverDoc,
                position: { line: 0, character: 7 },
            });
            assert.isDefined(info);
            const contents = <string[]>info.contents;
            assert.isAtLeast(contents.length, 1);
            assert.equal(
                contents[0],
                "```galaxy\nstruct info_t {\n\tint a;\n}\n```",
            );
        });
    });

    describe("References", () => {
        const refsDoc = mockupTextDocument(
            "service",
            "definition",
            "refs.galaxy",
        );
        const headerDoc = mockupTextDocument(
            "service",
            "definition",
            "header.galaxy",
        );
        const store = mockupStore(headerDoc, refsDoc);

        const referenceProvider = createProvider(ReferencesProvider, store);

        it("local variable", () => {
            const result = referenceProvider.onReferences({
                textDocument: refsDoc,
                position: { line: 9, character: 9 },
                context: null,
            });
            assert.isDefined(result);
            assert.equal(result.length, 2);
            assert.equal(result[0].range.start.line, 9);
            assert.equal(result[1].range.start.line, 14);
        });

        it("struct property", () => {
            const result = referenceProvider.onReferences({
                textDocument: refsDoc,
                position: { line: 16, character: 10 },
                context: null,
            });
            assert.isDefined(result);
            assert.equal(result.length, 2);
            assert.equal(result[0].uri, headerDoc.uri);
            assert.equal(result[0].range.start.line, 6);
            assert.equal(result[1].range.start.line, 16);
        });
    });
});
