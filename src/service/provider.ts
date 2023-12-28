import { Store } from "./store.js";

export abstract class AbstractProvider {
    protected store: Store;

    public init(store: Store) {
        this.store = store;
    }
}

export function createProvider<T extends AbstractProvider>(
    cls: new () => T,
    store: Store,
): T {
    const provider = new cls();
    provider.init(store);
    return provider;
}
