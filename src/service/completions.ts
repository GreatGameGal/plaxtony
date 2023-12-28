import * as gt from "../compiler/types";
import {
    SyntaxKind,
    Symbol,
    Node,
    FunctionDeclaration,
    NamedDeclaration,
} from "../compiler/types";
import { TypeChecker } from "../compiler/checker";
import { AbstractProvider } from "./provider";
import { tokenToString } from "../compiler/scanner";
import { findAncestor, isKeywordKind } from "../compiler/utils";
import {
    findPrecedingToken,
    fuzzysearch,
    getLineAndCharacterOfPosition,
} from "./utils";
import { Printer } from "../compiler/printer";
import * as lsp from "vscode-languageserver";
import { getDocumentationOfSymbol } from "./s2meta";
import * as trig from "../sc2mod/trigger";

function isInComment(sourceFile: gt.SourceFile, pos: number) {
    const comment = sourceFile.commentsLineMap.get(
        getLineAndCharacterOfPosition(sourceFile, pos).line,
    );
    return comment && pos >= comment.pos;
}

export const enum CompletionFunctionExpand {
    None,
    Parenthesis,
    ArgumentsNull,
    ArgumentsDefault,
}

export interface CompletionConfig {
    functionExpand: CompletionFunctionExpand;
}

const enum CompletionItemDataFlags {
    CanExpand = 1 << 1,
    CanAppendSemicolon = 1 << 2,
}

interface CompletionItemData {
    flags?: CompletionItemDataFlags;
    parentSymbol?: string;
    elementType?: "gamelink";
    gameType?: string;
}

export class CompletionsProvider extends AbstractProvider {
    private printer: Printer = new Printer();
    public config: CompletionConfig;

    constructor() {
        super();
        this.config = <CompletionConfig>{
            functionExpand: CompletionFunctionExpand.None,
        };
    }

    public expandFunctionArguments(decl: gt.FunctionDeclaration): string[] {
        let args: string[] = [];
        let funcElement: trig.FunctionDef;

        if (
            this.store.s2metadata &&
            this.config.functionExpand ===
                CompletionFunctionExpand.ArgumentsDefault
        ) {
            funcElement = <trig.FunctionDef>(
                this.store.s2metadata.findElementByName(decl.name.name)
            );
        }

        function isStringLikeParam(param: trig.Param) {
            switch (param.valueType) {
                case "gamelink":
                case "string":
                    return true;

                default:
                    return false;
            }
        }

        for (const [key, param] of decl.parameters.entries()) {
            let paramElement: trig.Param;
            if (funcElement) {
                const index =
                    key - (funcElement.flags & trig.ElementFlag.Event ? 1 : 0);
                if (index >= 0) {
                    const paramDef = funcElement.getParameters()[index];
                    if (paramDef.default) {
                        paramElement = paramDef.default.resolve();
                    }
                }
            }

            if (!paramElement) {
                if (
                    param.type.kind === gt.SyntaxKind.IntKeyword ||
                    param.type.kind === gt.SyntaxKind.ByteKeyword
                ) {
                    args.push("0");
                } else if (param.type.kind === gt.SyntaxKind.FixedKeyword) {
                    args.push("0.0");
                } else if (param.type.kind === gt.SyntaxKind.StringKeyword) {
                    args.push('""');
                } else if (param.type.kind === gt.SyntaxKind.BoolKeyword) {
                    args.push("false");
                } else {
                    args.push("null");
                }
            } else {
                if (paramElement.value) {
                    if (isStringLikeParam(paramElement)) {
                        args.push(`"${paramElement.value}"`);
                    } else {
                        args.push(paramElement.value);
                    }
                } else if (paramElement.preset) {
                    const presetVal = paramElement.preset.resolve();
                    if (presetVal.value) {
                        args.push(presetVal.value);
                    } else {
                        const presetDef =
                            this.store.s2metadata.findPresetDef(presetVal);
                        if (presetDef) {
                            args.push(
                                this.store.s2metadata.getNameOfPresetValue(
                                    presetDef,
                                    presetVal,
                                ),
                            );
                        } else {
                            args.push(
                                this.store.s2metadata.getElementSymbolName(
                                    presetVal,
                                ),
                            );
                        }
                    }
                } else if (paramElement.valueElement) {
                    args.push(
                        this.store.s2metadata.getElementSymbolName(
                            paramElement.valueElement
                                .resolve()
                                .values[0].resolve(),
                        ),
                    );
                } else if (paramElement.functionCall) {
                    const fcallDef = paramElement.functionCall
                        .resolve()
                        .functionDef.resolve();
                    const fcallSymbol = this.store.resolveGlobalSymbol(
                        this.store.s2metadata.getElementSymbolName(fcallDef),
                    );
                    args.push(
                        this.store.s2metadata.getElementSymbolName(fcallDef) +
                            "(" +
                            this.expandFunctionArguments(
                                <gt.FunctionDeclaration>(
                                    fcallSymbol.declarations[0]
                                ),
                            ).join(", ") +
                            ")",
                    );
                } else {
                    args.push("null");
                }
            }
        }
        return args;
    }

    private buildFromSymbolDecl(symbol: Symbol): lsp.CompletionItem {
        const node = <NamedDeclaration>symbol.declarations[0];

        if (node.name === undefined) {
            return;
        }

        const item = <lsp.CompletionItem>{
            label: node.name.name,
        };

        switch (node.kind) {
            case SyntaxKind.StructDeclaration:
                item.kind = lsp.CompletionItemKind.Class;
                break;
            case SyntaxKind.FunctionDeclaration:
                item.kind = lsp.CompletionItemKind.Function;
                break;
            case SyntaxKind.VariableDeclaration:
            case SyntaxKind.ParameterDeclaration:
                item.kind = lsp.CompletionItemKind.Variable;
                break;
            case SyntaxKind.PropertyDeclaration:
                item.kind = lsp.CompletionItemKind.Property;
                break;
            case SyntaxKind.TypedefDeclaration:
                item.kind = lsp.CompletionItemKind.Interface;
                break;
            default:
                item.kind = lsp.CompletionItemKind.Text;
                break;
        }

        return item;
    }

    private buildFromSymbolMembers(
        parentSymbol: Symbol,
        query?: string,
    ): lsp.CompletionItem[] {
        const completions = <lsp.CompletionItem[]>[];

        for (const symbol of parentSymbol.members.values()) {
            if (!query || fuzzysearch(query, symbol.escapedName)) {
                const item = this.buildFromSymbolDecl(symbol);
                item.data = {
                    parentSymbol: parentSymbol.escapedName,
                };
                if (item) {
                    completions.push(item);
                }
            }
        }

        return completions;
    }

    private provideTriggerHandlers(): lsp.CompletionItem[] {
        let completions = <lsp.CompletionItem[]>[];

        for (const document of this.store.documents.values()) {
            for (const [, symbol] of document.symbol.members) {
                if (
                    symbol.declarations[0].kind !==
                    gt.SyntaxKind.FunctionDeclaration
                )
                    continue;
                const funcDecl = <gt.FunctionDeclaration>symbol.declarations[0];
                if (funcDecl.type.kind !== gt.SyntaxKind.BoolKeyword) continue;
                if (funcDecl.parameters.length !== 2) continue;
                if (
                    funcDecl.parameters[0].type.kind !==
                    gt.SyntaxKind.BoolKeyword
                )
                    continue;
                if (
                    funcDecl.parameters[1].type.kind !==
                    gt.SyntaxKind.BoolKeyword
                )
                    continue;

                const item = this.buildFromSymbolDecl(symbol);
                completions.push(item);
            }
        }

        return completions;
    }

    private provideGameLinks(gameType: string) {
        const links = this.store.s2metadata.getGameLinkItem(gameType);
        let completions = <lsp.CompletionItem[]>[];
        for (const item of links) {
            completions.push({
                label: item.id,
                data: {
                    elementType: "gamelink",
                    gameType: gameType,
                },
                kind: lsp.CompletionItemKind.Value,
            });
        }
        return completions;
    }

    private provideIncludes(query: string): lsp.CompletionList {
        const completions = new Map<string, lsp.CompletionItem>();

        for (const [relativeName, qsMap] of this.store.qualifiedDocuments) {
            if (query && !relativeName.startsWith(query.toLowerCase()))
                continue;

            const qsFiles = Array.from(qsMap.values()).filter((v) => v.s2meta);
            if (!qsFiles.length) continue;

            const itemPart = qsFiles[0].s2meta.docName
                .substr(query.length)
                .split("/");
            let cpItem = completions.get(itemPart[0]);

            if (!cpItem) {
                cpItem = lsp.CompletionItem.create(itemPart[0]);
                cpItem.documentation = "";

                if (itemPart.length > 1) {
                    cpItem.kind = lsp.CompletionItemKind.Folder;
                } else {
                    cpItem.kind = lsp.CompletionItemKind.File;
                    cpItem.detail = qsFiles
                        .filter((v) => v.s2meta.file.archive)
                        .map((v) => `${v.s2meta.file.archive.name}`)
                        .join(" | ");
                    cpItem.documentation = qsFiles
                        .map((v) => {
                            return (
                                (v.s2meta.file.archive
                                    ? `${v.s2meta.file.archive.name}/`
                                    : "") + `${v.s2meta.file.relativePath}`
                            );
                        })
                        .join("\n");
                }

                completions.set(cpItem.label, cpItem);
            }

            if (cpItem.kind === lsp.CompletionItemKind.Folder) {
                const nDocs = qsFiles
                    .filter((v) => v.s2meta.file.archive)
                    .map((v) => `${v.s2meta.file.archive.name}`);
                if (nDocs.length) {
                    cpItem.documentation = Array.from(
                        new Set(
                            cpItem.documentation
                                .toString()
                                .split("\n")
                                .concat(nDocs),
                        ),
                    ).join("\n");
                }
            }
        }
        return {
            items: Array.from(completions.values()),
            isIncomplete: false,
        };
    }

    public getCompletionsAt(
        uri: string,
        position: number,
        context?: lsp.CompletionContext,
    ): lsp.CompletionList {
        let completions = <lsp.CompletionItem[]>[];

        const sourceFile = this.store.documents.get(uri);
        if (!sourceFile) return;
        if (isInComment(sourceFile, position)) return;
        let currentToken = findPrecedingToken(position, sourceFile);

        // query
        let query: string = null;
        const processedSymbols = new Map<string, Symbol>();
        if (
            currentToken &&
            currentToken.pos <= position &&
            currentToken.end >= position
        ) {
            const offset = position - currentToken.pos;
            if (currentToken.kind === gt.SyntaxKind.Identifier) {
                query = (<gt.Identifier>currentToken).name.substr(0, offset);
            } else if (isKeywordKind(currentToken.kind)) {
                query = tokenToString(currentToken.kind).substr(0, offset);
            }
        }

        // trigger handlers
        if (
            currentToken &&
            currentToken.kind === gt.SyntaxKind.StringLiteral &&
            currentToken.parent.kind === gt.SyntaxKind.CallExpression
        ) {
            const callExpr = <gt.CallExpression>currentToken.parent;
            if (
                callExpr.expression.kind === gt.SyntaxKind.Identifier &&
                ["TriggerCreate", "TriggerFind"].find(
                    (x) => x === (<gt.Identifier>callExpr.expression).name,
                )
            ) {
                return {
                    items: this.provideTriggerHandlers(),
                    isIncomplete: false,
                };
            }
        }

        // include
        if (
            currentToken &&
            currentToken.kind === gt.SyntaxKind.StringLiteral &&
            currentToken.pos <= position &&
            currentToken.end >= position &&
            currentToken.parent.kind === gt.SyntaxKind.IncludeStatement
        ) {
            const offset = position - currentToken.pos;
            query = (<gt.StringLiteral>currentToken).text
                .substr(1, offset - 1)
                .replace(/(\/*)[^\/]+$/, "$1");

            if (
                (<gt.StringLiteral>currentToken).text.match(/[^"]$/) ||
                currentToken.end !== position
            ) {
                return this.provideIncludes(query);
            }
        }

        if (context && context.triggerCharacter === "/") return;

        // presets
        if (this.store.s2metadata) {
            const elementType =
                this.store.s2metadata.getElementTypeOfNode(currentToken);
            // TODO: support <any> gamelink
            if (
                elementType &&
                elementType.type === "gamelink" &&
                currentToken.kind === gt.SyntaxKind.StringLiteral &&
                elementType.gameType
            ) {
                return {
                    items: this.provideGameLinks(elementType.gameType),
                    isIncomplete: false,
                };
            }
            if (elementType && elementType.type === "preset") {
                const tPreset = elementType.typeElement.resolve();
                let matchingPresetCompletions = 0;
                let totalPresetCompletions = 0;

                switch (tPreset.baseType) {
                    default: {
                        for (const name of this.store.s2metadata.getConstantNamesOfPreset(
                            tPreset,
                        )) {
                            const symbol = this.store.resolveGlobalSymbol(name);
                            if (symbol) {
                                const citem = this.buildFromSymbolDecl(symbol);
                                if (!citem) continue;
                                citem.preselect = true;
                                citem.kind = lsp.CompletionItemKind.Enum;
                                citem.label = citem.label;
                                completions.push(citem);
                                processedSymbols.set(name, symbol);

                                totalPresetCompletions++;
                                if (!query || fuzzysearch(query, citem.label)) {
                                    matchingPresetCompletions++;
                                }
                            }
                        }
                        break;
                    }
                }

                if (
                    (context?.triggerKind ===
                        lsp.CompletionTriggerKind.Invoked &&
                        (!query ||
                            totalPresetCompletions ===
                                matchingPresetCompletions) &&
                        matchingPresetCompletions > 0) ||
                    (context?.triggerKind ===
                        lsp.CompletionTriggerKind.Invoked &&
                        ((query?.length ?? 0) < 2 ||
                            totalPresetCompletions ===
                                matchingPresetCompletions) &&
                        matchingPresetCompletions > 0)
                ) {
                    return {
                        items: completions,
                        isIncomplete: true,
                    };
                } else if (
                    context?.triggerKind ===
                        lsp.CompletionTriggerKind
                            .TriggerForIncompleteCompletions &&
                    query?.length === 1 &&
                    matchingPresetCompletions > 0
                ) {
                    return {
                        items: completions,
                        isIncomplete: false,
                    };
                }
            }
        }

        // exit early for str and num literals
        if (
            currentToken &&
            (currentToken.kind === gt.SyntaxKind.StringLiteral ||
                currentToken.kind === gt.SyntaxKind.NumericLiteral)
        ) {
            return {
                items: completions,
                isIncomplete: false,
            };
        }

        // properties
        if (currentToken) {
            if (
                (currentToken.kind === gt.SyntaxKind.DotToken ||
                    currentToken.kind === gt.SyntaxKind.Identifier) &&
                currentToken.parent.kind ===
                    gt.SyntaxKind.PropertyAccessExpression &&
                (<gt.PropertyAccessExpression>currentToken.parent)
                    .expression !== currentToken
            ) {
                const checker = new TypeChecker(this.store);
                currentToken = (<gt.PropertyAccessExpression>(
                    currentToken.parent
                )).expression;
                const type = checker.getTypeOfNode(currentToken, true);
                if (type.flags & gt.TypeFlags.Struct) {
                    return {
                        items: this.buildFromSymbolMembers(type.symbol),
                        isIncomplete: false,
                    };
                }
            }
        }

        // local variables
        if (currentToken) {
            const currentContext = <FunctionDeclaration>(
                findAncestor(currentToken, (element: Node): boolean => {
                    return element.kind === SyntaxKind.FunctionDeclaration;
                })
            );
            if (currentContext) {
                completions = completions.concat(
                    this.buildFromSymbolMembers(currentContext.symbol, query),
                );
            }
        }

        // can append semicolon
        let completionFlags: CompletionItemDataFlags =
            CompletionItemDataFlags.CanExpand;
        if (currentToken) {
            if (
                currentToken.kind === gt.SyntaxKind.Identifier &&
                position < currentToken.end
            ) {
                completionFlags &= ~CompletionItemDataFlags.CanExpand;
            }

            if (currentToken.parent) {
                switch (currentToken.parent.kind) {
                    case gt.SyntaxKind.ExpressionStatement: {
                        if (position >= currentToken.end) {
                            completionFlags |=
                                CompletionItemDataFlags.CanAppendSemicolon;
                        } else {
                            completionFlags |=
                                currentToken.parent.syntaxTokens.findIndex(
                                    (value) =>
                                        value.kind ===
                                        gt.SyntaxKind.SemicolonToken,
                                ) === -1
                                    ? CompletionItemDataFlags.CanAppendSemicolon
                                    : 0;
                        }
                        break;
                    }
                    case gt.SyntaxKind.Block:
                    case gt.SyntaxKind.SourceFile: {
                        if (position >= currentToken.end) {
                            completionFlags |=
                                CompletionItemDataFlags.CanAppendSemicolon;
                        }
                        break;
                    }
                    case gt.SyntaxKind.FunctionDeclaration: {
                        completionFlags &= ~CompletionItemDataFlags.CanExpand;
                        break;
                    }
                }
            }
        }

        let cpCount = 0;
        let isIncomplete = false;
        const cpLimit = 9000;
        outer: for (const document of this.store.documents.values()) {
            for (const [name, symbol] of document.symbol.members) {
                if (
                    symbol.flags & gt.SymbolFlags.Static &&
                    document.fileName !== uri
                )
                    continue;
                if (processedSymbols.has(name)) continue;
                if (!query || fuzzysearch(query, name)) {
                    processedSymbols.set(name, symbol);
                    const citem = this.buildFromSymbolDecl(symbol);
                    citem.data = <CompletionItemData>{
                        flags: completionFlags,
                    };
                    completions.push(citem);

                    if (++cpCount >= cpLimit) {
                        if (
                            context?.triggerKind !==
                            lsp.CompletionTriggerKind
                                .TriggerForIncompleteCompletions
                        ) {
                            isIncomplete = true;
                        }
                        break outer;
                    }
                }
            }
        }

        // keywords
        for (
            let i: number = gt.SyntaxKindMarker.FirstKeyword;
            i <= gt.SyntaxKindMarker.LastKeyword;
            i++
        ) {
            const name = tokenToString(<any>i);
            if (isIncomplete || !query || fuzzysearch(query, name)) {
                completions.push({
                    label: name,
                    kind: lsp.CompletionItemKind.Keyword,
                });
            }
        }

        return {
            items: completions,
            isIncomplete: isIncomplete,
        };
    }

    public resolveCompletion(
        completion: lsp.CompletionItem,
    ): lsp.CompletionItem {
        switch (completion.kind) {
            case lsp.CompletionItemKind.Folder:
            case lsp.CompletionItemKind.File: {
                return completion;
            }

            default: {
                break;
            }
        }

        let symbol: gt.Symbol;
        let parentSymbolName: string;
        const customData: CompletionItemData = completion.data || {};

        if (customData.elementType === "gamelink") {
            const localizedName =
                this.store.s2metadata.getGameLinkLocalizedName(
                    customData.gameType,
                    completion.label,
                    true,
                );
            completion.detail = "";
            if (localizedName) {
                completion.detail += `"${localizedName}"`;
            }

            const linkDeclarations = Array.from(
                this.store.s2metadata.getGameLinkItem(
                    customData.gameType,
                    completion.label,
                ),
            );
            if (linkDeclarations.length > 0) {
                const decl = linkDeclarations[0];
                completion.detail += ` [${decl.ctype}]`;

                completion.documentation = {
                    kind: lsp.MarkupKind.Markdown,
                    value: linkDeclarations
                        .map((x) => {
                            const details =
                                this.store.s2metadata.getGameLinkDetails(x);
                            if (!details) return "`unknown`";
                            return `\`${details.archive.name}\` :: ${details.relativePath}`;
                        })
                        .join("\\\n"),
                };
            }

            return completion;
        }

        if (customData.parentSymbol) {
            parentSymbolName = customData.parentSymbol;
        }
        for (const sourceFile of this.store.documents.values()) {
            if (parentSymbolName) {
                symbol = sourceFile.symbol.members.get(parentSymbolName);
                if (!symbol) continue;
            } else {
                symbol = sourceFile.symbol;
            }
            symbol = symbol.members.get(completion.label);
            if (symbol) break;
        }

        if (
            this.config.functionExpand !== CompletionFunctionExpand.None &&
            completion.kind === lsp.CompletionItemKind.Function &&
            customData.flags &&
            customData.flags & CompletionItemDataFlags.CanExpand
        ) {
            const decl = <gt.FunctionDeclaration>symbol.declarations[0];
            let funcArgs: string[] = [];

            // TODO: support funcrefs expansion
            if (
                decl.kind === gt.SyntaxKind.FunctionDeclaration &&
                this.config.functionExpand !==
                    CompletionFunctionExpand.Parenthesis
            ) {
                funcArgs = this.expandFunctionArguments(decl);
            }

            if (funcArgs) {
                completion.insertTextFormat = lsp.InsertTextFormat.Snippet;
                funcArgs = funcArgs.map((item, index) => {
                    return `\${${index + 1}:${item}}`;
                });
                completion.insertText =
                    completion.label + "(" + funcArgs.join(", ") + ")";
            } else {
                completion.insertTextFormat = lsp.InsertTextFormat.PlainText;
                completion.insertText = completion.label + "($1)";
            }

            if (
                customData.flags &&
                customData.flags & CompletionItemDataFlags.CanAppendSemicolon
            ) {
                completion.insertText += ";";
            }
            completion.insertText += "$0";
        }

        if (symbol) {
            completion.documentation = getDocumentationOfSymbol(
                this.store,
                symbol,
                false,
            );

            let node = symbol.declarations[0];

            switch (node.kind) {
                case SyntaxKind.FunctionDeclaration:
                    node = Object.create(node);
                    (<gt.FunctionDeclaration>node).body = null;
                // pass through
                case SyntaxKind.VariableDeclaration:
                case SyntaxKind.ParameterDeclaration:
                case SyntaxKind.PropertyDeclaration:
                case SyntaxKind.TypedefDeclaration:
                    completion.detail = this.printer.printNode(node);
                    break;
            }
        }

        if (completion.documentation) {
            completion.documentation = <lsp.MarkupContent>{
                kind: lsp.MarkupKind.Markdown,
                value: completion.documentation,
            };
        }

        return completion;
    }
}
