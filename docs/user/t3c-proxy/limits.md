---
product: t3c-proxy
title: Accepted limits
order: 3
relationships:
  references: [proxy]
---

# Accepted limits

The sender name is part of the message text, so that the server does not need a change.
These results follow from that design, and they are accepted.

- A generated thread title can name the sender, because the byline is in the text.
- The sender's browser shows the message with no byline until the server's copy replaces
  it.
- A message with a leading `/` has no sender name. This includes a normal message that
  starts with a file path.
- Answers and approvals show no sender, because `runtime-request.respond` has no byline.
- The direct route and T3 Connect have no byline.
- A byline with a name that is not configured stays as text in a queue edit. If such a name
  starts with a configured name, the remainder of the name stays too.
- For a message with only images, the agent receives the image and the byline and not the
  placeholder sentence, and the model can answer without using the image.
- In the web client, a message with only files shows each file as a link above the byline,
  and not as a card. The web client shows a card only for a message with no words.
- If an upstream release changes the placeholder of a message with only images, the match
  fails until the proxy changes too. People then see the placeholder with a byline, and the
  message is not lost.
- An upgrade to a protocol other than WebSocket closes. Stock T3 Code has none.
- A new upstream command that carries text passes with no byline and no warning. Evaluate
  each upstream release before you adopt it.
- Mobile clients are not proven through a person's hostname, because upstream does not
  distribute them. By code reading only, they send the same placeholder for a message with
  only images.
