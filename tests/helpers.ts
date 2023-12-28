import { SourceFile } from "./../src/compiler/types.js";
import { Parser } from "../src/compiler/parser.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
    Store,
    S2WorkspaceWatcher,
    createTextDocumentFromFs,
    openSourceFilesInLocation,
} from "../src/service/store.js";
import { SC2Workspace } from "../src/sc2mod/archive.js";
import * as path from "path";
import * as util from "util";

const fixturesPath = "tests/fixtures";

export function fixtureFilePath(...filepath: string[]) {
    return path.join(fixturesPath, ...filepath);
}

export function mockupTextDocument(...filepath: string[]) {
    return createTextDocumentFromFs(fixtureFilePath(...filepath));
}

export function mockupSourceFile(...filepath: string[]): SourceFile {
    const parser = new Parser();
    const completeFilePath = fixtureFilePath(...filepath);
    const document = createTextDocumentFromFs(completeFilePath);
    return parser.parseFile(
        path.basename(completeFilePath),
        document.getText(),
    );
}

export function mockupStoreDocument(
    ...filepath: string[]
): [Store, SourceFile] {
    const store = new Store();
    const document = createTextDocumentFromFs(fixtureFilePath(...filepath));
    store.updateDocument(document);
    return [store, store.documents.get(document.uri)];
}

export function mockupStore(...documents: TextDocument[]) {
    const store = new Store();
    for (const doc of documents) {
        store.updateDocument(doc);
    }
    return store;
}

export async function mockupStoreFromDirectory(directory: string) {
    const store = new Store();
    store.rootPath = directory;
    for await (const doc of openSourceFilesInLocation(directory)) {
        store.updateDocument(doc);
    }
    return store;
}

export async function mockupStoreFromS2Workspace(
    directory: string,
    modSources: string[],
) {
    const store = new Store();
    const ws = new S2WorkspaceWatcher(directory, modSources);
    const workspaces: SC2Workspace[] = [];
    ws.onDidOpen((ev) => {
        store.updateDocument(ev.document);
    });
    ws.onDidOpenS2Archive((ev) => {
        workspaces.push(ev.workspace);
    });
    await ws.watch();
    for (const ws of workspaces) {
        await store.updateS2Workspace(ws);
        await store.rebuildS2Metadata();
    }
    return store;
}

export function mapStoreFilesByBasename(store: Store) {
    const m = new Map<string, SourceFile>();
    for (const [fullname, sourceFile] of store.documents.entries()) {
        m.set(path.basename(fullname), sourceFile);
    }
    return m;
}

export function dump(d: any) {
    return util.inspect(d, {
        colors: true,
        depth: 3,
        compact: true,
        maxArrayLength: 500,
        breakLength: 140,
    });
}
