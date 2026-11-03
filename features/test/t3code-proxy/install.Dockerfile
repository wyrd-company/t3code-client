# One Feature install on the test base image, with Node.js and an optional stand-in for
# the Ansible Feature's `ansible-setup` oneshot.
ARG TEST_BASE
FROM node:24-bookworm-slim AS node

FROM ${TEST_BASE}
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

ARG FIXTURE=absent
COPY test/t3code-proxy/ansible-setup-fixture.sh /tmp/ansible-setup-fixture.sh
RUN if [ "${FIXTURE}" = present ]; then sh /tmp/ansible-setup-fixture.sh; fi \
    && rm -f /tmp/ansible-setup-fixture.sh

COPY src/t3code-proxy /tmp/feature
RUN VERSION=latest CONFIGPATH=/etc/t3code-proxy/config.yml SERVICEUSER=automatic \
    _REMOTE_USER=vscode /tmp/feature/install.sh \
    && rm -rf /tmp/feature
