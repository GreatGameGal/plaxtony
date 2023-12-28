import * as gt from "../compiler/types.js";
import { TypeChecker } from "../compiler/checker.js";
import { AbstractProvider } from "./provider.js";
import {
    getAdjacentIdentfier,
    getLineAndCharacterOfPosition,
    getPositionOfLineAndCharacter,
} from "./utils.js";
import { Printer } from "../compiler/printer.js";
import { getDocumentationOfSymbol } from "./s2meta.js";
import * as lsp from "vscode-languageserver";

export class HoverProvider extends AbstractProvider {
    private printer = new Printer();

    public getHoverAt(params: lsp.TextDocumentPositionParams): lsp.Hover {
        const sourceFile = this.store.documents.get(params.textDocument.uri);
        if (!sourceFile) return;
        const position = getPositionOfLineAndCharacter(
            sourceFile,
            params.position.line,
            params.position.character,
        );
        const currentToken = getAdjacentIdentfier(position, sourceFile);

        if (
            !currentToken ||
            (<gt.Node>currentToken).kind !== gt.SyntaxKind.Identifier
        ) {
            return null;
        }

        const checker = new TypeChecker(this.store);
        const symbol = checker.getSymbolAtLocation(currentToken);

        if (!symbol) {
            return null;
        }

        const content: string[] = [];

        let decl = symbol.declarations[0];
        if (decl.kind === gt.SyntaxKind.FunctionDeclaration) {
            decl = Object.assign({}, decl, { body: null });
        }

        let code = this.printer.printNode(decl).trim();
        // strip ;
        if (code.substr(code.length - 1, 1) === ";") {
            code = code.substr(0, code.length - 1);
        }
        content.push("```galaxy\n" + code + "\n```");

        // if (symbol.flags & gt.SymbolFlags.FunctionParameter) {
        //     content.push('parameter of `' + symbol.parent.escapedName + '`');
        // }
        // else if (symbol.flags & gt.SymbolFlags.Variable) {
        //     const isConstant = (<gt.VariableDeclaration>decl).modifiers.find((modifier) => {
        //         return modifier.kind === gt.SyntaxKind.ConstKeyword;
        //     })
        //     let scope: string = 'global';
        //     if (symbol.flags & gt.SymbolFlags.LocalVariable) {
        //         scope = 'local';
        //     }
        //     content.push('' + scope + ' ' + (isConstant ? 'constant' : 'variable') + '');
        // }
        if (symbol.flags & gt.SymbolFlags.Property) {
            content.push("property of `" + symbol.parent.escapedName + "`");
        }

        const docs = getDocumentationOfSymbol(this.store, symbol);
        if (docs) {
            content.push(docs);
        }

        return <lsp.Hover>{
            contents: content,
            range: {
                start: getLineAndCharacterOfPosition(
                    sourceFile,
                    currentToken.pos,
                ),
                end: getLineAndCharacterOfPosition(
                    sourceFile,
                    currentToken.end,
                ),
            },
        };
    }
}
