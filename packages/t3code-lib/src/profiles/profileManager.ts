// ---
// relationships:
//   implements: profiles
// ---
import { T3Client, type T3ClientOptions } from "../client.ts";
import type { ExchangePairingTokenOptions } from "../auth/authClient.ts";
import {
  fileCredentialStore,
  memoryCredentialStore,
  type CredentialStore,
} from "../auth/credentialStore.ts";
import { T3ConnectionError, T3Error, T3NotFoundError, T3PreconditionError } from "../errors.ts";
import { environmentValue } from "./environment.ts";
import {
  configDirectory,
  credentialPath,
  loadConfig,
  prepareCredentials,
  profileNamed,
  saveConfig,
  serverUrl,
  type Profile,
} from "./profileConfig.ts";

/** Select a backend for a profile. Only AuthClient reads or writes the returned store. */
export type CredentialSource = (
  profile: Profile,
  defaultCredentialPath: string,
) => CredentialStore | Promise<CredentialStore>;

/** Profile storage and auth transport options; explicit T3Client stores remain independent. */
export interface ProfileManagerOptions {
  readonly configDir?: string;
  readonly credentialSource?: CredentialSource;
  readonly clientOptions?: Omit<T3ClientOptions, "baseUrl" | "credentials" | "accessToken">;
}

/** Flag inputs outrank the corresponding environment inputs. */
export interface ProfileResolveOptions {
  readonly server?: string;
  readonly credentialsFile?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/** Connection inputs for T3Client.create; resolving never reads credential contents. */
export interface ResolvedProfile {
  readonly baseUrl: string;
  readonly credentials: CredentialStore;
  readonly profile?: Profile;
  readonly sources: {
    readonly server: "flag" | "environment" | "profile";
    readonly credentials: "file" | "environment" | "profile" | "none";
  };
}

/** Named server configuration shared by command-line and MCP consumers. */
export class ProfileManager {
  readonly configDir: string;
  readonly #source: CredentialSource;
  readonly #clientOptions: ProfileManagerOptions["clientOptions"];

  constructor(options: ProfileManagerOptions = {}) {
    this.configDir = options.configDir ?? configDirectory();
    this.#source = options.credentialSource ?? ((_profile, path) => fileCredentialStore(path));
    this.#clientOptions = options.clientOptions;
  }

  /** List configured servers without loading their credentials. */
  async list(): Promise<Profile[]> {
    const config = await loadConfig(this.configDir);
    return Object.entries(config.servers).map(([name, server]) => ({ name, url: server.url }));
  }

  /** Return the current profile, or undefined before one is selected. */
  async getCurrent(): Promise<Profile | undefined> {
    const config = await loadConfig(this.configDir);
    return config.current === undefined ? undefined : profileNamed(config, config.current);
  }

  /**
   * Resolve one exact named profile without applying flag or environment overrides.
   * @throws {T3NotFoundError} The named profile does not exist.
   */
  async resolveProfile(name: string): Promise<ResolvedProfile> {
    const profile = (await this.list()).find((candidate) => candidate.name === name);
    if (profile === undefined) {
      throw new T3NotFoundError("The selected profile does not exist.", {
        status: 404,
        method: "LOCAL",
        path: "profile",
        body: undefined,
        reason: "profile_not_found",
      });
    }
    return {
      baseUrl: profile.url,
      credentials: await this.#store(profile),
      profile,
      sources: { server: "profile", credentials: "profile" },
    };
  }

  /** Resolve flags, environment and current profile into connection options. */
  async resolve(options: ProfileResolveOptions = {}): Promise<ResolvedProfile> {
    const env = options.env ?? process.env;
    const environmentServer = environmentValue(env, "T3_SERVER_URL");
    const explicit = options.server ?? environmentServer;
    const config = await loadConfig(this.configDir);
    const current = config.current === undefined ? undefined : profileNamed(config, config.current);
    const baseUrl = explicit === undefined ? current?.url : serverUrl(explicit);
    if (baseUrl === undefined)
      throw new T3PreconditionError("Select a server or pair a profile first.");
    const profile =
      explicit === undefined
        ? current
        : Object.entries(config.servers)
            .map(([name, server]) => ({ name, url: server.url }))
            .find((candidate) => serverUrl(candidate.url) === baseUrl);
    const path = options.credentialsFile;
    const token = environmentValue(env, "T3_TOKEN");
    const credentials =
      path !== undefined
        ? fileCredentialStore(path)
        : token !== undefined
          ? memoryCredentialStore({ accessToken: token })
          : profile === undefined
            ? memoryCredentialStore()
            : await this.#store(profile);
    return {
      baseUrl,
      credentials,
      ...(profile === undefined ? {} : { profile }),
      sources: {
        server:
          options.server !== undefined
            ? "flag"
            : environmentServer !== undefined
              ? "environment"
              : "profile",
        credentials:
          path !== undefined
            ? "file"
            : token !== undefined
              ? "environment"
              : profile !== undefined
                ? "profile"
                : "none",
      },
    };
  }

  /** Exchange a pairing token, then register its profile; first success selects current. */
  async pair(
    profile: Profile,
    pairingToken: string,
    options?: ExchangePairingTokenOptions,
  ): Promise<Profile> {
    return this.#register(profile, async (client) => {
      await client.auth.exchangePairingToken(pairingToken, options);
    });
  }

  /** Validate an issued session token, then register its profile. */
  async setAccessToken(profile: Profile, token: string): Promise<Profile> {
    return this.#register(profile, async (client) => {
      await client.auth.setAccessToken(token);
    });
  }

  /** Select an existing profile without changing its credentials. */
  async switch(name: string): Promise<void> {
    const config = await loadConfig(this.configDir);
    profileNamed(config, name);
    config.current = name;
    await saveConfig(this.configDir, config);
  }

  /** Remove a profile and clear its local credential; does not revoke the server session. */
  async logout(name?: string): Promise<void> {
    const config = await loadConfig(this.configDir);
    const selected = name ?? config.current;
    if (selected === undefined) throw new T3PreconditionError("No current profile is selected.");
    const profile = profileNamed(config, selected);
    const client = this.#client(profile, await this.#store(profile));
    try {
      await client.auth.clearCredentials();
    } finally {
      await client.close();
    }
    delete config.servers[selected];
    if (config.current === selected) delete config.current;
    await saveConfig(this.configDir, config);
  }

  async #register(
    input: Profile,
    authenticate: (client: T3Client) => Promise<void>,
  ): Promise<Profile> {
    if (input.name.length === 0) throw new T3PreconditionError("Profile name must not be empty.");
    const profile = { name: input.name, url: serverUrl(input.url) };
    const config = await loadConfig(this.configDir);
    await prepareCredentials(this.configDir);
    const client = this.#client(profile, await this.#store(profile));
    try {
      await authenticate(client);
    } finally {
      await client.close();
    }
    Object.defineProperty(config.servers, profile.name, {
      value: { url: profile.url },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    config.current ??= profile.name;
    await saveConfig(this.configDir, config);
    return profile;
  }

  #client(profile: Profile, credentials: CredentialStore): T3Client {
    return T3Client.create({ ...this.#clientOptions, baseUrl: profile.url, credentials });
  }

  async #store(profile: Profile): Promise<CredentialStore> {
    try {
      return await this.#source(profile, credentialPath(this.configDir, profile.name));
    } catch (cause) {
      if (cause instanceof T3Error) throw cause;
      throw new T3ConnectionError("open_failed", "Could not select the profile credential store.");
    }
  }
}
