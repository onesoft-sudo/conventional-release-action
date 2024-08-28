import * as core from "@actions/core";
import * as github from "@actions/github";
import { readFile, writeFile } from "fs/promises";
import GitClient from "./GitClient";
import VersionManager, { Commit } from "./VersionManager";

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
    const createTag = core.getInput("create-tag") === "true";
    const tagPrefix = core.getInput("tag-prefix") || "v";
    const createCommit = core.getInput("create-commit") === "true";
    const commitMessageFormat =
        core.getInput("commit-message-format") ||
        "chore(release): v%s [skip ci]";
    const gitPath = core.getInput("git-path") || "/usr/bin/git";
    const gitUserName = core.getInput("git-user-name");
    const gitUserEmail = core.getInput("git-user-email");
    const gitGPPKey = core.getInput("git-gpg-key");
    const gitSignOff = core.getInput("git-sign-off") === "true";
    const gitPush = core.getInput("git-push") === "true";
    const gitPushRemote = core.getInput("git-push-remote") || "origin";
    const gitPushBranch = core.getInput("git-push-branch") || undefined;

    console.log(`Using git: ${gitPath}`);

    const commits: Commit[] = github.context.payload.commits.map(
        (commit: Commit) => ({
            message: commit.message,
            id: commit.id,
        }),
    );

    if (commits.length === 0) {
        core.info("No new commits found.");
        return;
    }

    core.info("New commits found:");

    for (const commit of commits) {
        core.info(`- ${commit.id}: ${commit.message}`);
    }

    await using gitClient = new GitClient("/usr/bin/git");
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

    if (updatedVersion === currentVersion) {
        core.info("No new version was generated.");
        core.setOutput("version", "");
        return;
    }

    core.info(`Updated version: ${updatedVersion}`);
    await updateVersion(versionManager, updatedVersion);
    core.setOutput("version", updatedVersion);

    await gitClient.setup({
        name: gitUserName,
        email: gitUserEmail,
        gpgKey: gitGPPKey || undefined,
    });

    if (createCommit) {
        await gitClient.add(versionJsonFile);
        await gitClient.commit(
            commitMessageFormat.replaceAll("%s", updatedVersion),
            gitSignOff,
        );
    }

    if (createTag) {
        await gitClient.tag(`${tagPrefix}${updatedVersion}`);
        core.setOutput("tag", `${tagPrefix}${updatedVersion}`);
    } else {
        core.setOutput("tag", "");
    }

    if (gitPush) {
        const pushArgs = [
            gitPushRemote,
            gitPushBranch ?? "HEAD",
            createTag ? `refs/tags/${tagPrefix}${updatedVersion}` : undefined,
        ];

        await gitClient.push(
            ...(pushArgs.filter(Boolean) as [string, string, string]),
        );
    }
}

run()
    .then()
    .catch((error) => core.setFailed(error));
