import {
    SourceFile,
    NamedDeclaration,
    Node,
    SyntaxKind,
} from "../compiler/types.js";
import { forEachChild } from "../compiler/utils.js";
import { fuzzysearch } from "./utils.js";
import { AbstractProvider } from "./provider.js";

function collectDeclarations(sourceFile: SourceFile): NamedDeclaration[] {
    let declarations: NamedDeclaration[] = [];

    function registerDeclaration(node: NamedDeclaration) {
        declarations.push(node);
    }

    function visitNode(node: Node) {
        if (
            node.kind === SyntaxKind.VariableDeclaration ||
            node.kind === SyntaxKind.FunctionDeclaration ||
            node.kind === SyntaxKind.StructDeclaration
        ) {
            registerDeclaration(<NamedDeclaration>node);
        }

        if (node.kind === SyntaxKind.SourceFile) {
            forEachChild(node, (child) => visitNode(child));
        }
    }

    visitNode(sourceFile);

    return declarations;
}

export class NavigationProvider extends AbstractProvider {
    public getDocumentSymbols(uri: string): NamedDeclaration[] {
        const sourceFile = this.store.documents.get(uri);
        if (!sourceFile) return [];
        return collectDeclarations(sourceFile);
    }

    public getWorkspaceSymbols(query?: string): NamedDeclaration[] {
        let declarations: NamedDeclaration[] = [];

        outer: for (const document of this.store.documents.values()) {
            for (const decl of collectDeclarations(document)) {
                if (!query || fuzzysearch(query, decl.name.name)) {
                    declarations.push(decl);
                    if (declarations.length >= 1000) {
                        break outer;
                    }
                }
            }
        }

        return declarations;
    }
}
