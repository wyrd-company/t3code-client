# The published base image, with the scope of the package at a local test registry,
# because a scenario tests the package from this checkout. Other packages come from npm.
ARG BASE_IMAGE=ghcr.io/wyrd-company/devcontainers/base:noble
FROM ${BASE_IMAGE}
ARG REGISTRY
RUN printf '@wyrd-company:registry=%s\n' "${REGISTRY}" >/root/.npmrc
