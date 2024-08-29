import * as core from "@actions/core";
import * as github from "@actions/github";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import ChangeLogGenerator from "./ChangeLogGenerator";
import GitClient from "./GitClient";
import VersionManager from "./VersionManager";

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
    const metadataFile = core.getInput("metadata-file");
    const changelogFile = core.getInput("changelog-file") || undefined;
    const changelogFormat = core.getInput("changelog-format") || "plain";

    core.info(`Metadata file: ${metadataFile}`);

    let metadataFileJSON: {
        lastReadCommit: string;
    };

    await using gitClient = new GitClient(gitPath);
    const versionManager = new VersionManager();

    await gitClient.setup({
        name: gitUserName,
        email: gitUserEmail,
        gpgKey: gitGPPKey || undefined,
    });

    await gitClient.pull(gitPushRemote, gitPushBranch ?? "HEAD");

    if (!createCommit) {
        core.info("Creating commits is disabled.");

        metadataFileJSON = {
            lastReadCommit: github.context.payload.before,
        };
    } else if (!existsSync(metadataFile)) {
        if (createCommit) {
            core.info(
                "Metadata file not found, will be created after the first run.",
            );
        }

        metadataFileJSON = {
            lastReadCommit: (await gitClient.getFirstCommit()) || "",
        };
    } else {
        metadataFileJSON = JSON.parse(await readFile(metadataFile, "utf-8"));
    }

    const commits = await gitClient.getCommits(
        metadataFileJSON.lastReadCommit,
        github.context.payload.after,
    );

    if (commits.length === 0) {
        core.info("No new commits found.");
        return;
    }

    core.info("New commits found:");

    for (const commit of commits) {
        core.info(`- ${commit.id}: ${commit.message}`);
    }

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

    if (changelogFile) {
        if (
            changelogFormat &&
            !["markdown", "plain"].includes(changelogFormat)
        ) {
            throw new Error(
                `Invalid changelog format "${changelogFormat}". Must be either "markdown" or "plain".`,
            );
        }

        await using changeLogGenerator = new ChangeLogGenerator();
        await changeLogGenerator.setup();
        await changeLogGenerator.generateChangeLog(
            changelogFile,
            changelogFormat as "markdown" | "plain",
        );
    }

    if (createCommit) {
        metadataFileJSON.lastReadCommit = github.context.payload.after;

        await writeFile(
            metadataFile,
            JSON.stringify(metadataFileJSON, null, jsonTabWidth) + "\n",
        );

        if (changelogFile) {
            await gitClient.add(changelogFile);
        }

        await gitClient.add(metadataFile);
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
