// ---
// relationships:
//   implements: mcp
//   references: profiles
// ---
import {
  ProfileManager,
  T3Client,
  T3ConnectionError,
  T3InterruptedError,
  T3PreconditionError,
  type ResolvedProfile,
  type T3ClientOptions,
} from "@wyrd-company/t3code-lib";

export interface ConnectionOptions {
  readonly profile?: string;
  readonly server?: string;
  readonly credentialsFile?: string;
}
export interface ClientProvider {
  get(signal?: AbortSignal): Promise<T3Client>;
  close(): Promise<void>;
}
type Profiles = Pick<ProfileManager, "resolve" | "resolveProfile">;
type ClientFactory = (options: T3ClientOptions) => T3Client | Promise<T3Client>;

/** A stdio connection owns one lazy upstream client and its pending initialization. */
export class SharedClient implements ClientProvider {
  readonly #options: ConnectionOptions;
  readonly #profiles: Profiles;
  readonly #create: ClientFactory;
  #pending: Promise<T3Client> | undefined;
  #closing: Promise<void> | undefined;
  #closed = false;

  constructor(
    options: ConnectionOptions = {},
    profiles: Profiles = new ProfileManager(),
    create: ClientFactory = T3Client.create,
  ) {
    if (
      options.profile !== undefined &&
      (options.server !== undefined || options.credentialsFile !== undefined)
    ) {
      throw new T3PreconditionError("Choose a named profile or direct connection overrides.");
    }
    if (Object.values(options).some((value) => value !== undefined && !value.trim())) {
      throw new T3PreconditionError("Connection selections cannot be blank.");
    }
    this.#options = options;
    this.#profiles = profiles;
    this.#create = create;
  }

  get(signal?: AbortSignal): Promise<T3Client> {
    if (this.#closed)
      return Promise.reject(new T3ConnectionError("closed", "The MCP connection is closed."));
    if (signal?.aborted) return Promise.reject(new T3InterruptedError("Operation interrupted."));
    if (!this.#pending) {
      const pending = this.#initialize();
      this.#pending = pending;
      void pending.catch(() => {
        if (this.#pending === pending) this.#pending = undefined;
      });
    }
    return waitForClient(this.#pending, signal);
  }

  async #initialize(): Promise<T3Client> {
    const options = this.#options;
    const resolved: ResolvedProfile =
      options.profile === undefined
        ? await this.#profiles.resolve({
            ...(options.server === undefined ? {} : { server: options.server }),
            ...(options.credentialsFile === undefined
              ? {}
              : { credentialsFile: options.credentialsFile }),
          })
        : await this.#profiles.resolveProfile(options.profile);
    const client = await this.#create({ ...resolved, clientLabel: "t3code-mcp" });
    if (this.#closed) {
      await client.close();
      throw new T3InterruptedError("The MCP connection closed during initialization.");
    }
    return client;
  }

  close(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#closed = true;
    this.#closing = (async () => {
      const client = await this.#pending?.catch(() => undefined);
      await client?.close();
    })();
    return this.#closing;
  }
}

function waitForClient(pending: Promise<T3Client>, signal?: AbortSignal): Promise<T3Client> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new T3InterruptedError("Operation interrupted."));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void pending.then(
      (client) => {
        signal.removeEventListener("abort", abort);
        resolve(client);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
