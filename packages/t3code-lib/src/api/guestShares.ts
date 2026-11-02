// ---
// relationships:
//   implements: library
// ---
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { GuestMessageId, MessageId, ThreadId } from "../schemas/common.ts";
import type { GuestShareCreateResult } from "../schemas/orchestration/guestShare.ts";
import type { CommandDispatcher } from "./dispatch.ts";

/**
 * Guest links to a thread: one unauthenticated browser watches the thread over
 * T3 Connect and proposes messages that the owner sends or dismisses. The thread
 * record's `guestShare` holds the share, and a shell row's
 * `pendingGuestMessageCount` counts the waiting messages. The server setting
 * `guestSharingEnabled` is off by default. Off, `create` rejects with `disabled`
 * and existing links pause.
 */
export class GuestSharesApi {
  readonly rpc: RpcClient<RpcMethods>;
  readonly dispatcher: CommandDispatcher;

  constructor(rpc: RpcClient<RpcMethods>, dispatcher: CommandDispatcher) {
    this.rpc = rpc;
    this.dispatcher = dispatcher;
  }

  /**
   * Open a 24 hour guest link. It replaces the thread's earlier link. The `url`
   * holds the guest's credential, so treat it as a secret. A refusal rejects with
   * a `T3RpcError` whose `GuestShareCreateError` record has a `reason`, such as
   * `disabled` or `connect_unavailable`. Needs `access:write`.
   */
  create(threadId: ThreadId, signal?: AbortSignal): Promise<GuestShareCreateResult> {
    return this.rpc.call("guestShare.create", { threadId }, signal);
  }

  /** Revoke the thread's link. Resolves when the thread has no link. */
  async close(threadId: ThreadId, signal?: AbortSignal): Promise<void> {
    await this.dispatcher.dispatch(
      { type: "thread.guest-share.close", commandId: this.dispatcher.newCommandId(), threadId },
      signal,
    );
  }

  /**
   * Send a pending guest message to the agent, after any active run. The server
   * uses the guest's text and files, and names the guest in the text that the
   * agent reads. Returns the id of the new user message. A message that is not
   * pending rejects.
   */
  async sendMessage(
    threadId: ThreadId,
    guestMessageId: GuestMessageId,
    signal?: AbortSignal,
  ): Promise<MessageId> {
    const messageId = this.dispatcher.newMessageId();
    await this.dispatcher.dispatch(
      {
        type: "message.dispatch",
        createdBy: "user",
        creationSource: "web",
        commandId: this.dispatcher.newCommandId(),
        threadId,
        messageId,
        guestMessageId,
        text: "",
        attachments: [],
        dispatchMode: { type: "queue_after_active" },
      },
      signal,
    );
    return messageId;
  }

  /** Dismiss a pending guest message. A message that is not pending rejects. */
  async dismissMessage(
    threadId: ThreadId,
    guestMessageId: GuestMessageId,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.dispatcher.dispatch(
      {
        type: "thread.guest-message.dismiss",
        commandId: this.dispatcher.newCommandId(),
        threadId,
        guestMessageId,
      },
      signal,
    );
  }
}
