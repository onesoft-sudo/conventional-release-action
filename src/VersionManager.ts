import * as semver from "semver";
import type { Commit } from "./GitClient";

export type ClassifiedCommits = Record<
    "features" | "fixes" | "others" | "breakingChanges",
    Array<
        Commit & {
            prerelease: boolean;
            type: string;
        }
    >
>;

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
        "ci",
        "build",
        "revert",
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

        const classifiedCommits: ClassifiedCommits = {
            features: [],
            fixes: [],
            others: [],
            breakingChanges: [],
        };

        for (const commit of this.commits) {
            const newlineIndex = commit.message.indexOf("\n");
            const head = commit.message.slice(
                0,
                newlineIndex === -1 ? undefined : newlineIndex,
            );
            const body =
                newlineIndex === -1
                    ? ""
                    : commit.message.slice(newlineIndex + 1);
            let [type] = head.split(":");
            let increased = false;
            let major = false;
            let majorIncreased = false,
                minorIncreased = false,
                patchIncreased = false,
                prereleaseIncreased = false;

            const forcePrerelease =
                /\[(v\:)?(alpha|beta|rc|prerelease)\]/gi.test(commit.message);

            if (type.endsWith("!") || body.includes("BREAKING CHANGE:")) {
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
                if (!majorIncreased) {
                    parsed.inc(forcePrerelease ? "premajor" : "major");
                    majorIncreased = true;
                }

                classifiedCommits.breakingChanges.push({
                    ...commit,
                    prerelease: forcePrerelease,
                    type,
                });

                increased = true;
            } else {
                if (type === "feat") {
                    if (!minorIncreased && !majorIncreased) {
                        parsed.inc(forcePrerelease ? "preminor" : "minor");
                        minorIncreased = true;
                    }

                    classifiedCommits.features.push({
                        ...commit,
                        prerelease: forcePrerelease,
                        type,
                    });

                    increased = true;
                }

                if (type === "fix") {
                    if (!patchIncreased && !minorIncreased && !majorIncreased) {
                        parsed.inc(forcePrerelease ? "prepatch" : "patch");
                        patchIncreased = true;
                    }

                    classifiedCommits.fixes.push({
                        ...commit,
                        prerelease: forcePrerelease,
                        type,
                    });

                    increased = true;
                }
            }

            if (forcePrerelease && !increased) {
                if (!prereleaseIncreased) {
                    parsed.inc("prerelease");
                    prereleaseIncreased = true;
                }

                classifiedCommits.others.push({
                    ...commit,
                    prerelease: true,
                    type,
                });

                increased = true;
            }

            const date = new Date();
            const numdate = `${date.getFullYear()}${date.getMonth().toString().padStart(2, "0")}${date
                .getDate()
                .toString()
                .padStart(2, "0")}${date
                .getHours()
                .toString()
                .padStart(
                    2,
                    "0",
                )}${date.getMinutes().toString().padStart(2, "0")}${date
                .getSeconds()
                .toString()
                .padStart(2, "0")}`;
            const unixtime = Math.floor(date.getTime() / 1000).toString();

            if (versionSuffix) {
                if (!increased) {
                    if (!prereleaseIncreased) {
                        parsed.inc("prerelease");
                        prereleaseIncreased = true;
                    }

                    classifiedCommits.others.push({
                        ...commit,
                        prerelease: true,
                        type,
                    });

                    increased = true;
                }

                suffix = versionSuffix[1]
                    .replaceAll("{id}", this.commits[0].shortId)
                    .replaceAll("{sha}", this.commits[0].id)
                    .replaceAll("{numdate}", numdate)
                    .replaceAll("{unixtime}", unixtime)
                    .split(".");
            }

            if (buildMetadata) {
                if (!increased) {
                    if (!prereleaseIncreased) {
                        parsed.inc("prerelease");
                        prereleaseIncreased = true;
                    }

                    classifiedCommits.others.push({
                        ...commit,
                        prerelease: true,
                        type,
                    });

                    increased = true;
                }

                const format = buildMetadata[1];

                build = format
                    .replaceAll("{id}", this.commits[0].shortId)
                    .replaceAll("{sha}", this.commits[0].id)
                    .replaceAll("{numdate}", numdate)
                    .replaceAll("{unixtime}", unixtime)
                    .split(".");
            }

            if (!increased) {
                classifiedCommits.others.push({
                    ...commit,
                    prerelease: false,
                    type,
                });
            }
        }

        const updatedVersion =
            parsed.toString() +
            (suffix?.length ? `${suffix.join(".")}` : "") +
            (build?.length ? `+${build.join(".")}` : "");

        return { updatedVersion, classifiedCommits };
    }
}

export default VersionManager;
