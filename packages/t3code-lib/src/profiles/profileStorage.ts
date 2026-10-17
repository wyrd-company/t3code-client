// ---
// relationships:
//   implements: profiles
// ---
import type { CredentialStore } from "../auth/credentialStore.ts";
import { T3ConnectionError, T3Error, T3StorageError } from "../errors.ts";

/** Preserve decode/auth errors; classify backend I/O independently of transport. */
export function profileStore(store: CredentialStore, path: string): CredentialStore {
  async function local<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (cause) {
      if (cause instanceof T3Error && !(cause instanceof T3ConnectionError)) throw cause;
      throw new T3StorageError(`Could not access profile credentials at ${path}.`, { cause });
    }
  }
  return {
    load: () => local(() => store.load()),
    save: (value) => local(() => store.save(value)),
    clear: () => local(() => store.clear()),
  };
}
