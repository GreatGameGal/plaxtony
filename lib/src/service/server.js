"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const lsp = require("vscode-languageserver");
const util = require("util");
const path = require("path");
const fs = require("fs");
const utils_1 = require("../compiler/utils");
const store_1 = require("./store");
const utils_2 = require("./utils");
const provider_1 = require("./provider");
const diagnostics_1 = require("./diagnostics");
const navigation_1 = require("./navigation");
const completions_1 = require("./completions");
const signatures_1 = require("./signatures");
const definitions_1 = require("./definitions");
const hover_1 = require("./hover");
const references_1 = require("./references");
const rename_1 = require("./rename");
const archive_1 = require("../sc2mod/archive");
const timers_1 = require("timers");
const vscode_uri_1 = require("vscode-uri");
function getNodeRange(node) {
    return {
        start: { line: node.line, character: node.char },
        end: { line: node.line, character: node.char }
    };
}
function translateNodeKind(node) {
    switch (node.kind) {
        case 139 /* VariableDeclaration */:
            const variable = node;
            const isConstant = variable.modifiers.some((value) => {
                return value.kind === 53 /* ConstKeyword */;
            });
            return isConstant ? lsp.SymbolKind.Constant : lsp.SymbolKind.Variable;
        case 140 /* FunctionDeclaration */:
            return lsp.SymbolKind.Function;
        case 138 /* StructDeclaration */:
            return lsp.SymbolKind.Class;
        default:
            return lsp.SymbolKind.Field;
    }
}
function translateDeclaratons(origDeclarations) {
    const symbols = [];
    let kind;
    for (let node of origDeclarations) {
        const sourceFile = utils_1.findAncestor(node, (element) => {
            return element.kind === 126 /* SourceFile */;
        });
        symbols.push({
            kind: translateNodeKind(node),
            name: node.name.name,
            location: {
                uri: sourceFile.fileName,
                range: getNodeRange(node)
            },
        });
    }
    return symbols;
}
var formatElapsed = function (start, end) {
    const diff = process.hrtime(start);
    var elapsed = diff[1] / 1000000; // divide by a million to get nano to milli
    let out = '';
    if (diff[0] > 0) {
        out += diff[0] + "s ";
    }
    out += elapsed.toFixed(3) + "ms";
    return out;
};
let reqDepth = 0;
function wrapRequest(showArg = false, argFormatter, msg) {
    return function (target, propertyKey, descriptor) {
        const method = descriptor.value;
        descriptor.value = function (...args) {
            return __awaiter(this, arguments, void 0, function* () {
                const server = this;
                server.connection.console.info('>'.repeat(++reqDepth) + ' ' + (msg ? msg : propertyKey));
                if (showArg) {
                    server.connection.console.log(util.inspect(args[0], true, 1, false));
                }
                else if (argFormatter) {
                    server.connection.console.log(util.inspect(argFormatter(args[0])));
                }
                var start = process.hrtime();
                let ret;
                try {
                    ret = method.bind(this)(...arguments);
                    if (ret instanceof Promise) {
                        ret = yield ret;
                    }
                }
                catch (e) {
                    ret = null;
                    server.connection.console.error('[' + e.name + '] ' + e.message + '\n' + e.stack);
                }
                server.connection.console.info('='.repeat(reqDepth--) + ' ' + `${formatElapsed(start, process.hrtime())}`);
                return ret;
            });
        };
    };
}
function mapFromObject(stuff) {
    const m = new Map();
    Object.keys(stuff).forEach((key) => {
        m.set(key, stuff[key]);
    });
    return m;
}
const fileChangeTypeNames = {
    [lsp.FileChangeType.Created]: 'Created',
    [lsp.FileChangeType.Changed]: 'Changed',
    [lsp.FileChangeType.Deleted]: 'Deleted',
};
;
;
class Server {
    constructor() {
        this.store = new store_1.Store();
        this.documents = new lsp.TextDocuments();
        this.indexing = false;
        this.ready = false;
        this.documentUpdateRequests = new Map();
    }
    createProvider(cls) {
        return provider_1.createProvider(cls, this.store, this.connection.console);
    }
    createConnection(connection) {
        this.connection = connection ? connection : lsp.createConnection();
        this.diagnosticsProvider = this.createProvider(diagnostics_1.DiagnosticsProvider);
        this.navigationProvider = this.createProvider(navigation_1.NavigationProvider);
        this.completionsProvider = this.createProvider(completions_1.CompletionsProvider);
        this.signaturesProvider = this.createProvider(signatures_1.SignaturesProvider);
        this.definitionsProvider = this.createProvider(definitions_1.DefinitionProvider);
        this.hoverProvider = this.createProvider(hover_1.HoverProvider);
        this.referenceProvider = this.createProvider(references_1.ReferencesProvider);
        this.renameProvider = this.createProvider(rename_1.RenameProvider);
        this.renameProvider.referencesProvider = this.referenceProvider;
        this.documents.listen(this.connection);
        this.documents.onDidChangeContent(this.onDidChangeContent.bind(this));
        this.documents.onDidOpen(this.onDidOpen.bind(this));
        this.documents.onDidClose(this.onDidClose.bind(this));
        this.documents.onDidSave(this.onDidSave.bind(this));
        this.connection.onDidChangeWatchedFiles(this.onDidChangeWatchedFiles.bind(this));
        this.connection.onInitialize(this.onInitialize.bind(this));
        this.connection.onInitialized(this.onInitialized.bind(this));
        this.connection.onDidChangeConfiguration(this.onDidChangeConfiguration.bind(this));
        this.connection.onCompletion(this.onCompletion.bind(this));
        this.connection.onCompletionResolve(this.onCompletionResolve.bind(this));
        this.connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));
        this.connection.onWorkspaceSymbol(this.onWorkspaceSymbol.bind(this));
        this.connection.onSignatureHelp(this.onSignatureHelp.bind(this));
        this.connection.onDefinition(this.onDefinition.bind(this));
        this.connection.onHover(this.onHover.bind(this));
        this.connection.onReferences(this.onReferences.bind(this));
        this.connection.onRenameRequest(this.onRenameRequest.bind(this));
        this.connection.onPrepareRename(this.onPrepareRename.bind(this));
        this.connection.onRequest('document/checkRecursively', this.onDiagnoseDocumentRecursively.bind(this));
        return this.connection;
    }
    log(msg, ...params) {
        this.connection.console.log(msg);
        if (params.length) {
            this.connection.console.log(util.inspect(params));
        }
    }
    showErrorMessage(msg) {
        this.log(`[ERROR MSG]\n${msg}`);
        this.connection.window.showErrorMessage(msg);
    }
    flushDocument(documentUri, isDirty = true) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.ready) {
                this.log('Busy indexing..');
                return false;
            }
            const req = this.documentUpdateRequests.get(documentUri);
            if (!req)
                return;
            if (req.promise) {
                yield req.promise;
            }
            else {
                timers_1.clearTimeout(req.timer);
                req.isDirty = isDirty;
                yield this.onUpdateContent(documentUri, req);
            }
        });
    }
    reindex(rootPath, modSources) {
        return __awaiter(this, void 0, void 0, function* () {
            let archivePath;
            let workspace;
            this.indexing = true;
            this.connection.sendNotification("indexStart");
            this.store.rootPath = rootPath;
            if (this.config.archivePath) {
                if (path.isAbsolute(this.config.archivePath)) {
                    archivePath = this.config.archivePath;
                }
                else if (rootPath) {
                    archivePath = path.join(rootPath, this.config.archivePath);
                }
                if (!fs.existsSync(archivePath)) {
                    this.showErrorMessage(`Specified archivePath '${this.config.archivePath}' resolved to '${archivePath}', but it doesn't exist.`);
                    archivePath = null;
                }
                else if (!archive_1.isSC2Archive(archivePath)) {
                    this.showErrorMessage(`Specified archivePath '${archivePath}', doesn't appear to be valid archive.`);
                    archivePath = null;
                }
            }
            if (!archivePath && rootPath) {
                archivePath = yield store_1.findWorkspaceArchive(rootPath);
            }
            if (archivePath) {
                const wsArchive = new archive_1.SC2Archive(path.basename(archivePath), archivePath);
                this.workspaceWatcher = new store_1.WorkspaceWatcher(archivePath);
                this.log(`SC2 archive for this workspace set to: ${archivePath}`);
                this.connection.sendNotification('indexProgress', `Resolving dependencies of [${wsArchive.name}]`);
                const depList = yield archive_1.resolveArchiveDependencyList(wsArchive, modSources, mapFromObject(this.config.s2mod.overrides));
                for (const [name, src] of mapFromObject(this.config.s2mod.extra)) {
                    if (!fs.existsSync(src)) {
                        this.showErrorMessage(`Extra archive [${name}] '${src}' doesn't exist. Skipping.`);
                        continue;
                    }
                    depList.list.push({
                        name: name,
                        src: src
                    });
                }
                if (depList.unresolvedNames.length > 0) {
                    this.showErrorMessage(`Some SC2 archives couldn't be found [${depList.unresolvedNames.map((s) => `'${s}'`).join(', ')}]. By a result certain intellisense capabilities might not function properly.`);
                }
                workspace = new archive_1.SC2Workspace(wsArchive, depList.list.map((item) => new archive_1.SC2Archive(item.name, item.src)));
                this.log('Resolved archives:\n' + workspace.allArchives.map(item => {
                    return `${item.name} => ${item.directory}`;
                }).join('\n'));
            }
            else if (rootPath) {
                this.log(`SC2 workspace set to project root`);
                this.workspaceWatcher = new store_1.WorkspaceWatcher(rootPath);
            }
            if (!workspace) {
                workspace = new archive_1.SC2Workspace(null, [new archive_1.SC2Archive('mods/core.sc2mod', archive_1.resolveArchiveDirectory('mods/core.sc2mod', modSources))]);
            }
            this.connection.sendNotification('indexProgress', 'Indexing trigger libraries and data catalogs..');
            yield this.store.updateS2Workspace(workspace, this.config.localization);
            this.connection.sendNotification('indexProgress', `Indexing Galaxy files..`);
            for (const modArchive of workspace.dependencies) {
                for (const extSrc of yield modArchive.findFiles('**/*.galaxy')) {
                    // this.connection.sendNotification('indexProgress', `Indexing: ${extSrc}`);
                    this.onDidFindInWorkspace({ document: store_1.createTextDocumentFromFs(path.join(modArchive.directory, extSrc)) });
                }
            }
            if (this.workspaceWatcher) {
                this.workspaceWatcher.onDidOpen((ev) => {
                    const extSrc = vscode_uri_1.default.parse(ev.document.uri).fsPath.substr(this.workspaceWatcher.workspacePath.length);
                    // this.connection.sendNotification('indexProgress', `Indexing: ${extSrc}`);
                    this.onDidFindInWorkspace(ev);
                });
                // workspace.onDidOpenS2Archive(this.onDidFindS2Workspace.bind(this));
                yield this.workspaceWatcher.watch();
            }
            this.connection.sendNotification('indexProgress', 'Finalizing..');
            for (const documentUri of this.documentUpdateRequests.keys()) {
                yield this.flushDocument(documentUri);
            }
            this.indexing = false;
            this.ready = true;
            this.connection.sendNotification("indexEnd");
        });
    }
    onInitialize(params) {
        return __awaiter(this, void 0, void 0, function* () {
            this.initParams = params;
            return {
                capabilities: {
                    textDocumentSync: {
                        change: this.documents.syncKind,
                        openClose: true,
                    },
                    documentSymbolProvider: true,
                    workspaceSymbolProvider: true,
                    completionProvider: {
                        triggerCharacters: ['.'],
                        resolveProvider: true,
                    },
                    signatureHelpProvider: {
                        triggerCharacters: ['(', ','],
                    },
                    definitionProvider: true,
                    hoverProvider: true,
                    referencesProvider: true,
                    renameProvider: {
                        prepareProvider: true,
                    },
                }
            };
        });
    }
    onInitialized(params) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    onDidChangeConfiguration(ev) {
        return __awaiter(this, void 0, void 0, function* () {
            this.log(util.inspect(ev.settings.sc2galaxy));
            this.config = ev.settings.sc2galaxy;
            switch (this.config.completion.functionExpand) {
                case "None":
                    this.completionsProvider.config.functionExpand = 0 /* None */;
                    break;
                case "Parenthesis":
                    this.completionsProvider.config.functionExpand = 1 /* Parenthesis */;
                    break;
                case "ArgumentsNull":
                    this.completionsProvider.config.functionExpand = 2 /* ArgumentsNull */;
                    break;
                case "ArgumentsDefault":
                    this.completionsProvider.config.functionExpand = 3 /* ArgumentsDefault */;
                    break;
            }
            this.referenceProvider.config = this.config.references;
            if (!this.indexing) {
                this.reindex(this.initParams.rootPath, this.initParams.initializationOptions.sources);
            }
        });
    }
    onDidChangeContent(ev) {
        return __awaiter(this, void 0, void 0, function* () {
            let req = this.documentUpdateRequests.get(ev.document.uri);
            if (req) {
                if (req.promise) {
                    yield req.promise;
                }
                else {
                    if (req.timer) {
                        timers_1.clearTimeout(req.timer);
                    }
                    this.documentUpdateRequests.delete(ev.document.uri);
                }
                req = null;
            }
            if (!req) {
                req = {
                    content: ev.document.getText(),
                    timer: null,
                    promise: null,
                    isDirty: true,
                    version: ev.document.version,
                };
            }
            if (!this.indexing && this.ready) {
                req.timer = timers_1.setTimeout(this.onUpdateContent.bind(this, ev.document.uri, req), this.config.documentUpdateDelay);
            }
            this.documentUpdateRequests.set(ev.document.uri, req);
        });
    }
    onUpdateContent(documentUri, req) {
        return __awaiter(this, void 0, void 0, function* () {
            req.promise = new Promise((resolve) => {
                this.store.updateDocument({
                    uri: documentUri,
                    getText: () => {
                        return req.content;
                    }
                });
                timers_1.setTimeout(this.onDiagnostics.bind(this, documentUri, req), req.isDirty ? this.config.documentDiagnosticsDelay : 1);
                this.documentUpdateRequests.delete(documentUri);
                resolve(true);
            });
            yield req.promise;
        });
    }
    onDiagnostics(documentUri, req) {
        if (this.documentUpdateRequests.has(documentUri))
            return;
        if (this.documents.keys().indexOf(documentUri) === -1)
            return;
        if (this.documents.get(documentUri).version > req.version)
            return;
        this.diagnosticsProvider.checkFile(documentUri);
        this.connection.sendDiagnostics({
            uri: documentUri,
            diagnostics: this.diagnosticsProvider.provideDiagnostics(documentUri),
        });
    }
    onDidOpen(ev) {
        this.store.openDocuments.set(ev.document.uri, true);
    }
    onDidClose(ev) {
        this.store.openDocuments.delete(ev.document.uri);
        if (!this.store.isUriInWorkspace(ev.document.uri)) {
            this.store.removeDocument(ev.document.uri);
            this.log('removed from store');
        }
        this.connection.sendDiagnostics({
            uri: ev.document.uri,
            diagnostics: [],
        });
    }
    onDidSave(ev) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.flushDocument(ev.document.uri, true);
        });
    }
    onDidChangeWatchedFiles(ev) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const x of ev.changes) {
                if (vscode_uri_1.default.parse(x.uri).fsPath.match(/sc2map\.(temp|orig)/gi))
                    continue;
                if (!this.store.isUriInWorkspace(x.uri))
                    continue;
                this.log(`${fileChangeTypeNames[x.type]} ${x.uri}`);
                switch (x.type) {
                    case lsp.FileChangeType.Created:
                    case lsp.FileChangeType.Changed:
                        {
                            if (!this.store.openDocuments.has(x.uri)) {
                                this.onDidFindInWorkspace({ document: store_1.createTextDocumentFromUri(x.uri) });
                            }
                            break;
                        }
                    case lsp.FileChangeType.Deleted:
                        {
                            this.store.removeDocument(x.uri);
                            break;
                        }
                }
            }
        });
    }
    onDidFindInWorkspace(ev) {
        this.store.updateDocument(ev.document);
    }
    // @wrapRequest('Indexing workspace ', true, true)
    // private async onDidFindS2Workspace(ev: S2WorkspaceChangeEvent) {
    //     this.log('Updating archives');
    //     await this.store.updateS2Workspace(ev.workspace);
    //     this.log('Archives: ' + util.inspect(ev.workspace.allArchives, false, 1));
    // }
    onCompletion(params) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.store.documents.has(params.textDocument.uri))
                return null;
            yield this.flushDocument(params.textDocument.uri);
            let context = null;
            try {
                if (this.initParams.capabilities.textDocument.completion.contextSupport) {
                    context = params.context;
                }
            }
            catch (e) { }
            return this.completionsProvider.getCompletionsAt(params.textDocument.uri, utils_2.getPositionOfLineAndCharacter(this.store.documents.get(params.textDocument.uri), params.position.line, params.position.character), context);
        });
    }
    onCompletionResolve(params) {
        return this.completionsProvider.resolveCompletion(params);
    }
    onDocumentSymbol(params) {
        if (!this.ready)
            return null;
        return translateDeclaratons(this.navigationProvider.getDocumentSymbols(params.textDocument.uri));
    }
    onWorkspaceSymbol(params) {
        if (!this.ready)
            return null;
        return translateDeclaratons(this.navigationProvider.getWorkspaceSymbols(params.query));
    }
    onSignatureHelp(params) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.store.documents.has(params.textDocument.uri))
                return null;
            yield this.flushDocument(params.textDocument.uri);
            return this.signaturesProvider.getSignatureAt(params.textDocument.uri, utils_2.getPositionOfLineAndCharacter(this.store.documents.get(params.textDocument.uri), params.position.line, params.position.character));
        });
    }
    onDefinition(params) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.store.documents.has(params.textDocument.uri))
                return null;
            yield this.flushDocument(params.textDocument.uri);
            return this.definitionsProvider.getDefinitionAt(params.textDocument.uri, utils_2.getPositionOfLineAndCharacter(this.store.documents.get(params.textDocument.uri), params.position.line, params.position.character));
        });
    }
    onHover(params) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.flushDocument(params.textDocument.uri);
            return this.hoverProvider.getHoverAt(params);
        });
    }
    onReferences(params) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.flushDocument(params.textDocument.uri);
            return this.referenceProvider.onReferences(params);
        });
    }
    onRenameRequest(params) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.flushDocument(params.textDocument.uri);
            return this.renameProvider.onRenameRequest(params);
        });
    }
    onPrepareRename(params) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.flushDocument(params.textDocument.uri);
            const r = this.renameProvider.onPrepareRename(params);
            if (r && r.range) {
                timers_1.setTimeout(() => {
                    this.onRenamePrefetch(params);
                }, 5);
            }
            return r;
        });
    }
    onRenamePrefetch(params) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.flushDocument(params.textDocument.uri);
            return this.renameProvider.prefetchLocations();
        });
    }
    onDiagnoseDocumentRecursively(params) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.flushDocument(params.uri);
            const dg = this.diagnosticsProvider.checkFileRecursively(params.uri);
            for (const item of dg.diagnostics) {
                this.connection.sendDiagnostics(item);
            }
            return dg.success;
        });
    }
}
__decorate([
    wrapRequest()
], Server.prototype, "reindex", null);
__decorate([
    wrapRequest()
], Server.prototype, "onInitialize", null);
__decorate([
    wrapRequest()
], Server.prototype, "onInitialized", null);
__decorate([
    wrapRequest()
], Server.prototype, "onDidChangeConfiguration", null);
__decorate([
    wrapRequest()
], Server.prototype, "onDidChangeContent", null);
__decorate([
    wrapRequest()
], Server.prototype, "onUpdateContent", null);
__decorate([
    wrapRequest()
], Server.prototype, "onDiagnostics", null);
__decorate([
    wrapRequest(false, (payload) => { return { document: payload.document.uri }; })
], Server.prototype, "onDidOpen", null);
__decorate([
    wrapRequest(false, (payload) => { return { document: payload.document.uri }; })
], Server.prototype, "onDidClose", null);
__decorate([
    wrapRequest(false, (payload) => { return { document: payload.document.uri }; })
], Server.prototype, "onDidSave", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onDidChangeWatchedFiles", null);
__decorate([
    wrapRequest(false, (payload) => { return { document: payload.document.uri }; })
], Server.prototype, "onDidFindInWorkspace", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onCompletion", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onCompletionResolve", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onDocumentSymbol", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onWorkspaceSymbol", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onSignatureHelp", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onDefinition", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onHover", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onReferences", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onRenameRequest", null);
__decorate([
    wrapRequest(true)
], Server.prototype, "onPrepareRename", null);
__decorate([
    wrapRequest()
], Server.prototype, "onRenamePrefetch", null);
__decorate([
    wrapRequest()
], Server.prototype, "onDiagnoseDocumentRecursively", null);
exports.Server = Server;
function createServer() {
    return (new Server()).createConnection();
}
exports.createServer = createServer;
//# sourceMappingURL=server.js.map