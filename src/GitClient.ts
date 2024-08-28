import { exec, getExecOutput } from "@actions/exec";
import * as crypto from "crypto";

type SetupOptions = {
    name: string;
    email: string;
    gpgKey?: string;
};

type ExecOptions = {
    args: string[];
    exitCodeCheck?: boolean;
};

export type Commit = {
    message: string;
    id: string;
};

class GitClient implements AsyncDisposable {
    private readonly gitPath: string;
    private readonly oldGitOptions: {
        name?: string;
        email?: string;
        gpgKeyId?: string;
    } = {};

    public constructor(gitPath: string) {
        this.gitPath = gitPath;
    }

    private async exec({ args, exitCodeCheck = true }: ExecOptions) {
        const code = await exec(this.gitPath, args, {
            ignoreReturnCode: !exitCodeCheck,
        });

        if (exitCodeCheck && code !== 0) {
            throw new Error(`Failed to execute git command.`);
        }
    }

    private async execWithOutput({ args, exitCodeCheck = true }: ExecOptions) {
        const { stdout, exitCode } = await getExecOutput(this.gitPath, args, {
            ignoreReturnCode: !exitCodeCheck,
        });

        if (exitCodeCheck && exitCode !== 0) {
            throw new Error(`Failed to execute git command.`);
        }

        return stdout;
    }

    public async pull(remote: string, branch: string) {
        await this.exec({ args: ["pull", remote, branch] });
    }

    public async getFirstCommit() {
        const output = await this.execWithOutput({
            args: ["rev-list", "--max-parents=0", "HEAD"],
        });

        return output.trim();
    }

    public async getCommits(start?: string, end?: string) {
        const boundary = crypto.randomBytes(64).toString("hex");
        const output = (
            await this.execWithOutput({
                args: [
                    "log",
                    "--no-decorate",
                    "--no-color",
                    `--pretty=format:%H %B\n${boundary}`,
                    start && `${start}${end ? `..${end}` : ""}`,
                ].filter(Boolean) as string[],
            })
        ).trim();
        const commits: Commit[] = [];

        for (let i = 0; i < output.length; i++) {
            let sha = "";

            while (output[i] !== " " && i < output.length) {
                sha += output[i];
                i++;
            }

            i++;

            let message = "";

            while (i < output.length) {
                if (
                    output[i] === "\n" &&
                    output.slice(i + 1, i + boundary.length + 1) === boundary
                ) {
                    i += boundary.length;
                    break;
                }

                message += output[i];
                i++;
            }

            commits.push({
                id: sha.trim(),
                message: message.trim(),
            });
        }

        return commits;
    }

    public async add(...files: string[]) {
        await this.exec({ args: ["add", ...files] });
    }

    public async commit(message: string, signOff: boolean) {
        await this.exec({
            args: ["commit", `-${signOff ? "s" : ""}m`, message],
        });
    }

    public async tag(tag: string) {
        await this.exec({ args: ["tag", "-a", tag, "-m", `Tag ${tag}`] });
    }

    public async push(remote: string, ...refs: string[]) {
        await this.exec({ args: ["push", remote, ...refs] });
    }

    public async setup({ name, email, gpgKey }: SetupOptions) {
        this.oldGitOptions.name =
            (await this.execWithOutput({
                args: ["config", "user.name"],
                exitCodeCheck: false,
            }).catch(() => "")) || undefined;
        this.oldGitOptions.email =
            (await this.execWithOutput({
                args: ["config", "user.email"],
                exitCodeCheck: false,
            }).catch(() => "")) || undefined;
        this.oldGitOptions.gpgKeyId =
            (await this.execWithOutput({
                args: ["config", "user.signingkey"],
                exitCodeCheck: false,
            }).catch(() => "")) || undefined;

        await this.exec({ args: ["config", "user.name", name] });
        await this.exec({ args: ["config", "user.email", email] });

        if (gpgKey) {
            const keyId = await this.importGPGKey(gpgKey);
            await this.exec({ args: ["config", "user.signingkey", keyId] });
            await this.exec({ args: ["config", "commit.gpgSign", "true"] });
        }
    }

    private async teardown() {
        if (this.oldGitOptions.name) {
            await this.exec({
                args: ["config", "user.name", this.oldGitOptions.name],
                exitCodeCheck: false,
            }).catch(console.error);
        } else {
            await this.exec({
                args: ["config", "--unset", "user.name"],
                exitCodeCheck: false,
            }).catch(console.error);
        }

        if (this.oldGitOptions.email) {
            await this.exec({
                args: ["config", "user.email", this.oldGitOptions.email],
                exitCodeCheck: false,
            }).catch(console.error);
        } else {
            await this.exec({
                args: ["config", "--unset", "user.email"],
                exitCodeCheck: false,
            }).catch(console.error);
        }

        if (this.oldGitOptions.gpgKeyId) {
            await this.exec({
                args: [
                    "config",
                    "user.signingkey",
                    this.oldGitOptions.gpgKeyId,
                ],
                exitCodeCheck: false,
            }).catch(console.error);
        } else {
            await this.exec({
                args: ["config", "--unset", "user.signingkey"],
                exitCodeCheck: false,
            }).catch(console.error);
        }
    }

    private async importGPGKey(key: string) {
        let keyId: string | undefined;

        const { stdout, stderr } = await getExecOutput("gpg", ["--import"], {
            input: Buffer.from(key, "utf-8"),
        });

        for (const data of `${stdout}\n${stderr}`.split(/\r?\n/g)) {
            const match = data.match(/^gpg: key ([0-9A-F]+):/);

            if (match) {
                keyId = match[1];
            }
        }

        if (!keyId) {
            throw new Error("Failed to import GPG key.");
        }

        return keyId;
    }

    public async [Symbol.asyncDispose]() {
        await this.teardown();
    }
}

export default GitClient;
