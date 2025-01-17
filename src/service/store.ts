import * as gt from "../compiler/types.js";
import { SourceFile } from "../compiler/types.js";
import { Parser } from "../compiler/parser.js";
import { S2WorkspaceMetadata } from "./s2meta.js";
import { bindSourceFile, unbindSourceFile } from "../compiler/binder.js";
import {
    SC2Archive,
    SC2Workspace,
    openArchiveWorkspace,
    S2QualifiedFile,
} from "../sc2mod/archive.js";
import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as path from "path";
import * as fs from "fs";
import glob from "fast-glob";
import { URI } from "vscode-uri";
import { TypeChecker } from "../compiler/checker.js";
import { DataCatalogConfig, MetadataConfig } from "./server.js";

export function createTextDocument(uri: string, text: string) {
    return TextDocument.create(uri, "galaxy", 0, text);
}

export function createTextDocumentFromFs(filepath: string) {
    filepath = path.resolve(filepath);
    return createTextDocument(
        URI.file(filepath).toString(),
        fs.readFileSync(filepath, "utf8"),
    );
}

export async function readDocumentFile(fsPath: string) {
    return createTextDocument(
        URI.file(fsPath).toString(),
        fs.readFileSync(fsPath, "utf8"),
    );
}

export function createTextDocumentFromUri(uri: string) {
    return createTextDocument(
        uri,
        fs.readFileSync(URI.parse(uri).fsPath, "utf8"),
    );
}

export function* openSourceFilesInLocation(...srcFolders: string[]) {
    const workspaceFolders = srcFolders.map((folder) => {
        return {
            folder,
            galaxyFiles: glob.globSync("**/*.galaxy", {
                cwd: folder,
                absolute: true,
                caseSensitiveMatch: false,
                onlyFiles: true,
                objectMode: false,
            }),
        };
    });

    for (const wsFolder of workspaceFolders) {
        for (const wsFile of wsFolder.galaxyFiles) {
            yield readDocumentFile(wsFile);
        }
    }
}

export class IndexedDocument {
    textDocument: TextDocument;
    sourceNode: SourceFile;
}

export interface S2WorkspaceChangeEvent {
    src: string;
    workspace: SC2Workspace;
}

export class WorkspaceWatcher {
    public readonly folders: string[];
    protected _onDidOpen = new lsp.Emitter<
        lsp.TextDocumentChangeEvent<TextDocument>
    >();

    constructor(...folders: string[]) {
        this.folders = folders;
    }

    public get onDidOpen(): lsp.Event<
        lsp.TextDocumentChangeEvent<TextDocument>
    > {
        return this._onDidOpen.event;
    }
}

export class S2WorkspaceWatcher extends WorkspaceWatcher {
    protected _onDidOpenS2Workspace: lsp.Emitter<S2WorkspaceChangeEvent>;
    protected modSources: string[] = [];

    constructor(workspacePath: string, modSources: string[]) {
        super(workspacePath);
        this.modSources = modSources;
        this._onDidOpenS2Workspace = new lsp.Emitter<S2WorkspaceChangeEvent>();
    }

    public get onDidOpenS2Archive(): lsp.Event<S2WorkspaceChangeEvent> {
        return this._onDidOpenS2Workspace.event;
    }

    public async watch() {
        const rootArchive = new SC2Archive(
            path.basename(this.folders[0]),
            this.folders[0],
        );
        const workspace = await openArchiveWorkspace(
            rootArchive,
            this.modSources,
        );

        for (const modArchive of workspace.dependencies) {
            for (const extSrc of await modArchive.findFiles("**/*.galaxy")) {
                this._onDidOpen.fire({
                    document: createTextDocumentFromFs(
                        path.join(modArchive.directory, extSrc),
                    ),
                });
            }
        }
        for (const extSrc of await rootArchive.findFiles("**/*.galaxy")) {
            this._onDidOpen.fire({
                document: createTextDocumentFromFs(
                    path.join(rootArchive.directory, extSrc),
                ),
            });
        }

        this._onDidOpenS2Workspace.fire({
            src: this.folders[0],
            workspace: workspace,
        });
    }
}

export interface IStoreSymbols {
    resolveGlobalSymbol(name: string): gt.Symbol | undefined;
}

export interface SourceFileS2Meta {
    file: S2QualifiedFile;
    docName: string;
}

export interface QualifiedSourceFile extends SourceFile {
    s2meta?: SourceFileS2Meta;
}

export class Store implements IStoreSymbols {
    protected parser: Parser;
    public rootPath?: string;
    public documents = new Map<string, QualifiedSourceFile>();
    public readonly qualifiedDocuments = new Map<
        string,
        Map<string, QualifiedSourceFile>
    >();
    public openDocuments = new Set<string>();
    public s2workspace: SC2Workspace;
    public s2metadata: S2WorkspaceMetadata;

    public constructor(opts: { parser?: Parser } = {}) {
        this.parser = opts.parser ? opts.parser : new Parser();
    }

    public clear() {
        for (const key of this.documents.keys()) {
            if (this.openDocuments.has(key)) continue;
            this.removeDocument(key);
        }
        this.s2workspace = void 0;
        this.s2metadata = void 0;
    }

    protected removeQualifiedDocument(qsFile: QualifiedSourceFile) {
        const qDocMap = this.qualifiedDocuments.get(
            qsFile.s2meta.docName.toLowerCase(),
        );
        if (qDocMap) {
            qDocMap.delete(qsFile.fileName);
            if (!qDocMap.size) {
                this.qualifiedDocuments.delete(
                    qsFile.s2meta.docName.toLowerCase(),
                );
            }
        }
    }

    protected requalifyFile(qsFile: QualifiedSourceFile) {
        if (qsFile.s2meta) {
            this.removeQualifiedDocument(qsFile);
        }

        const fsPath = URI.parse(qsFile.fileName).fsPath;
        let s2file: S2QualifiedFile;
        if (this.s2workspace) {
            s2file = this.s2workspace.resolvePath(fsPath);
        } else if (this.rootPath) {
            const commonBase = fsPath
                .toLowerCase()
                .startsWith(this.rootPath.toLowerCase() + path.sep);
            if (commonBase) {
                const relativePath = fsPath
                    .substring(this.rootPath.length + 1)
                    .toLowerCase();
                s2file = {
                    fsPath: fsPath,
                    relativePath: relativePath,
                    archiveRelpath: relativePath,
                    priority: 0,
                };
            }
        }

        if (s2file) {
            qsFile.s2meta = {
                file: s2file,
                docName: s2file.relativePath.replace(/\.galaxy$/, ""),
            };

            let qDocMap = this.qualifiedDocuments.get(
                qsFile.s2meta.docName.toLowerCase(),
            );
            if (!qDocMap) {
                qDocMap = new Map();
                this.qualifiedDocuments.set(
                    qsFile.s2meta.docName.toLowerCase(),
                    qDocMap,
                );
            }

            if (qDocMap.size > 1) {
                const tmpDocs = Array.from(qDocMap).sort(
                    (a, b) =>
                        a[1].s2meta.file.priority - b[1].s2meta.file.priority,
                );
                qDocMap.clear();
                for (const [k, v] of tmpDocs) {
                    qDocMap.set(k, v);
                }
            }

            qDocMap.set(qsFile.fileName, qsFile);
        } else {
            qsFile.s2meta = void 0;
        }
    }

    public removeDocument(documentUri: string) {
        const currSorceFile = this.documents.get(documentUri);
        if (!currSorceFile) return;
        unbindSourceFile(currSorceFile, this);
        if (currSorceFile.s2meta) {
            this.removeQualifiedDocument(currSorceFile);
        }
        this.documents.delete(documentUri);
    }

    public updateDocument(document: TextDocument, check = false) {
        if (this.documents.has(document.uri)) {
            const currSorceFile = this.documents.get(document.uri);
            if (
                document.getText().length === currSorceFile.text.length &&
                document.getText().valueOf() === currSorceFile.text.valueOf()
            ) {
                return;
            }

            this.removeDocument(document.uri);
        }

        const sourceFile = this.parser.parseFile(
            document.uri,
            document.getText(),
        );
        this.documents.set(document.uri, sourceFile);
        this.requalifyFile(sourceFile);

        if (check) {
            const checker = new TypeChecker(this);
            sourceFile.additionalSyntacticDiagnostics = checker.checkSourceFile(
                sourceFile,
                true,
            );
        } else {
            bindSourceFile(sourceFile, this);
        }
    }

    public async updateS2Workspace(workspace: SC2Workspace) {
        this.s2workspace = workspace;

        this.qualifiedDocuments.clear();
        for (const qsFile of this.documents.values()) {
            this.requalifyFile(qsFile);
        }
    }

    public async rebuildS2Metadata(
        metadataCfg: MetadataConfig = {
            loadLevel: "Default",
            localization: "enUS",
        },
        dataCatalogConfig: DataCatalogConfig = {
            enabled: true,
        },
    ) {
        this.s2metadata = new S2WorkspaceMetadata(
            this.s2workspace,
            metadataCfg,
            dataCatalogConfig,
        );
        await this.s2metadata.build();
    }

    public isUriInWorkspace(documentUri: string) {
        const qsFile = this.documents.get(documentUri);
        if (qsFile && qsFile.s2meta) return true;

        const fsPath = URI.parse(documentUri).fsPath;
        const s2file = this.s2workspace.resolvePath(fsPath);
        if (s2file) return true;

        return false;
    }

    public resolveGlobalSymbol(name: string): gt.Symbol | undefined {
        for (const doc of this.documents.values()) {
            if (doc.symbol.members.has(name)) {
                return doc.symbol.members.get(name);
            }
        }
    }
}
