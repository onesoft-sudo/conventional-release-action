import { readFile, writeFile } from "fs/promises";
import * as semver from "semver";
import * as core from "@actions/core";

export type Commit = {
    message: string;
    id: string;
};

class VersionManager {
    private allowedCommitTypes = [
        "feat",
        "fix",
        "chore",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
    ];

    private commits: Commit[] = [];

    public setAllowedCommitTypes(allowedCommitTypes: string[]): this {
        this.allowedCommitTypes = allowedCommitTypes;
        return this;
    }

    public setCommits(commits: Commit[]): this {
        this.commits = commits;
        return this;
    }

    public async bump(lastVersion: string) {
        const parsed = semver.parse(lastVersion, { loose: true });
        let build: string[] = [];
        let suffix: string[] = [];

        if (!parsed) {
            throw new Error(`Failed to parse version "${lastVersion}".`);
        }

        parsed.build = [];

        for (const commit of this.commits.toReversed()) {
            const newlineIndex = commit.message.indexOf("\n");
            const head = commit.message.slice(
                0,
                newlineIndex === -1 ? undefined : newlineIndex,
            );
            let [type] = head.split(":");
            let increased = false;
            let major = false;
            const forcePrerelease =
                /\[(v\:)?(alpha|beta|rc|prerelease)\]/gi.test(commit.message);

            if (type.endsWith("!")) {
                type = type.slice(0, -1);
                major = true;
            }

            type = type.trim();
            type = type.includes("(") ? type.slice(0, type.indexOf("(")) : type;
            type = type.toLowerCase();

            if (!this.allowedCommitTypes.includes(type)) {
                continue;
            }

            const buildMetadata = commit.message.match(
                /\nBuild-metadata: (.*)/i,
            );
            const versionSuffix = commit.message.match(
                /\nVersion-suffix: (.*)/i,
            );

            if (major) {
                parsed.inc(forcePrerelease ? "premajor" : "major");
                increased = true;
            } else {
                if (type === "feat") {
                    parsed.inc(forcePrerelease ? "preminor" : "minor");
                    increased = true;
                }

                if (type === "fix") {
                    parsed.inc(forcePrerelease ? "prepatch" : "patch");
                    increased = true;
                }
            }

            if (forcePrerelease && !increased) {
                parsed.inc("prerelease");
                increased = true;
            }

            if (versionSuffix) {
                if (!increased) {
                    parsed.inc("prerelease");
                    increased = true;
                }

                suffix = versionSuffix[1].split(".");
            }

            if (buildMetadata) {
                if (!increased) {
                    parsed.inc("prerelease");
                    increased = true;
                }

                build = buildMetadata[1].split(".");
            }
        }

        const newVersion =
            parsed.toString() +
            (suffix?.length ? `${suffix.join(".")}` : "") +
            (build?.length ? `+${build.join(".")}` : "");

        return newVersion;
    }
}

export default VersionManager;
