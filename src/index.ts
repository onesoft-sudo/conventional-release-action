import * as core from "@actions/core";
import * as github from "@actions/github";
import { execSync } from "child_process";
import VersionManager, { Commit } from "./VersionManager";
import { readFile, writeFile } from "fs/promises";
import * as crypto from "crypto";

type VersionManagerModule = {
    resolver?: (versionManager: VersionManager) => string | Promise<string>;
    updater?: (
        versionManager: VersionManager,
        version: string,
    ) => void | Promise<void>;
};

async function run() {
    const allowedCommitTypes = core
        .getInput("allowed-commit-types")
        .split(",")
        .filter(Boolean);
    const versionJsonFile =
        core.getInput("version-json-file") || "package.json";
    const versionManagerModulePath = core.getInput("version-manager-module");
    const jsonTabWidth = parseInt(core.getInput("json-tab-width") || "4");

    const { after, before } = github.context.payload;
    const boundary = `${crypto.randomBytes(16).toString("hex")}`;
    const output = execSync(
        `git log --pretty=format:'%H %B${boundary}' ${before}..${after}`,
    ).toString();

    core.debug(`Output: ${output}`);

    const commits: Commit[] = [];

    for (const commit of output.split(boundary)) {
        if (!commit.trim()) {
            continue;
        }

        const space = commit.indexOf(" ");

        if (space === -1) {
            core.error("Failed to parse commit: " + commit);
            continue;
        }

        const sha = commit.slice(0, space);
        const message = commit.slice(space + 1).trim();

        if (!sha || !message) {
            core.error("Failed to parse commit: " + commit);
            continue;
        }

        commits.push({ sha, message });
    }

    if (commits.length === 0) {
        core.info("No new commits found.");
        return;
    }

    core.info("New commits found:");

    for (const commit of commits) {
        core.info(`- ${commit.sha}: ${commit.message}`);
    }

    const versionManager = new VersionManager();

    if (allowedCommitTypes.length > 0) {
        versionManager.setAllowedCommitTypes(allowedCommitTypes);
    }

    versionManager.setCommits(commits);

    const versionManagerModule: VersionManagerModule = versionManagerModulePath
        ? await import(versionManagerModulePath)
        : null;

    const getLastVersion =
        versionManagerModule?.resolver ??
        (async () => {
            const packageJson = JSON.parse(
                await readFile(versionJsonFile, "utf-8"),
            );

            if (!packageJson.version) {
                throw new Error(
                    `Version file "${versionJsonFile}" does not contain a version field.`,
                );
            }

            return packageJson.version as string;
        });

    const updateVersion =
        versionManagerModule?.updater ??
        (async (_versionManager, version) => {
            const packageJson = JSON.parse(
                await readFile(versionJsonFile, "utf-8"),
            );

            packageJson.version = version;

            await writeFile(
                versionJsonFile,
                JSON.stringify(packageJson, null, jsonTabWidth) + "\n",
            );
        });

    const currentVersion = await getLastVersion(versionManager);
    core.info(`Current version: ${currentVersion}`);

    const updatedVersion = await versionManager.bump(currentVersion);

    core.info(`Updated version: ${updatedVersion}`);
    await updateVersion(versionManager, updatedVersion);
}

run()
    .then()
    .catch((error) => core.setFailed(error));
