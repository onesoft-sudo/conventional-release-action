import { getExecOutput } from "@actions/exec";
import axios from "axios";
import { unlink, writeFile } from "fs/promises";
import { ClassifiedCommits } from "./VersionManager";

class ChangeLogGenerator implements AsyncDisposable {
    private static readonly OSN_COMMONS_GENCHANGELOG_DL_URL =
        "https://svn.onesoftnet.eu.org/svn/osn-commons/trunk/git/genchangelog";

    private static readonly COMMIT_CLASSIFICATION: Record<
        keyof ClassifiedCommits,
        string
    > = {
        breakingChanges: "Breaking Changes",
        features: "New Features",
        fixes: "Bug Fixes",
        others: "Others",
    };

    private setupDone = false;

    public async setup() {
        const response = await axios.get(
            ChangeLogGenerator.OSN_COMMONS_GENCHANGELOG_DL_URL,
        );
        const genChangeLogScript = response.data;

        await writeFile("/tmp/genchangelog", genChangeLogScript, {
            mode: 0o755,
        });

        this.setupDone = true;
    }

    public async generateChangeLog(
        file: string,
        format: "markdown" | "plain" = "plain",
    ) {
        const { stdout } = await getExecOutput(process.argv0, [
            "/tmp/genchangelog",
            "-f",
            format,
        ]);

        await writeFile(file, stdout);
    }

    public async createReleaseNotes(
        classifiedCommits: ClassifiedCommits,
        githubUsername: string,
        githubRepo: string,
        skipCommitsRegex?: RegExp,
    ) {
        let notes = "";

        for (const key in classifiedCommits) {
            const commits = classifiedCommits[key as keyof ClassifiedCommits];

            if (commits.length === 0) {
                continue;
            }

            let headerAdded = false;

            for (const commit of commits) {
                if (skipCommitsRegex && skipCommitsRegex.test(commit.message)) {
                    continue;
                }

                const newLinePosition = commit.message.indexOf("\n");
                const head =
                    newLinePosition === -1
                        ? commit.message
                        : commit.message.slice(0, newLinePosition);
                const typeWithSubject = head.match(
                    /([A-Za-z0-9-_]+(\(.+?\))?)\!?:/,
                );

                if (!typeWithSubject) {
                    continue;
                }

                if (!headerAdded) {
                    notes += `### ${ChangeLogGenerator.COMMIT_CLASSIFICATION[key as keyof typeof classifiedCommits]}\n`;
                    headerAdded = true;
                }

                notes += `* [[\`${commit.shortId}\`](https://github.com/${githubUsername}/${githubRepo}/commit/${commit.id})] **${typeWithSubject[0]}** ${head.replace(/([A-Za-z0-9-_]+(\(.+?\))?)\!?:/, "").trim()}\n`;
            }

            if (headerAdded) {
                notes += "\n";
            }
        }

        return notes;
    }

    public async [Symbol.asyncDispose]() {
        if (!this.setupDone) {
            return;
        }

        return void (await unlink("/tmp/genchangelog").catch(() => {}));
    }
}

export default ChangeLogGenerator;
