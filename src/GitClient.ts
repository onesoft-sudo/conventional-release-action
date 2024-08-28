import { spawn } from "child_process";

type SetupOptions = {
    name: string;
    email: string;
    gpgKey?: string;
};

type ExecOptions = {
    args: string[];
    exitCodeCheck?: boolean;
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

    private async logCommand(command: string, args: string[]) {
        console.log(`[exec]: ${command} ${args.join(" ")}`);
    }

    private async exec({ args, exitCodeCheck = true }: ExecOptions) {
        this.logCommand(this.gitPath, args);

        const process = spawn(this.gitPath, args, {
            stdio: "pipe",
        });

        let output = "";
        let error = "";

        process.stdout.on("data", (data) => {
            output += data.toString();
        });

        process.stderr.on("data", (data) => {
            error += data.toString();
        });

        return new Promise<string>((resolve, reject) => {
            process.on("exit", (code) => {
                if (exitCodeCheck && code !== null && code !== 0) {
                    console.log(
                        "Failed to execute git command (Exit code " +
                            code +
                            "): ",
                    );
                    console.error(error);

                    reject(
                        new Error(`Failed to execute git command: ${error}`),
                    );
                    return;
                }

                resolve(output.trim());
            });

            process.on("error", reject);
        });
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
            (await this.exec({
                args: ["config", "user.name"],
                exitCodeCheck: false,
            }).catch(() => "")) || undefined;
        this.oldGitOptions.email =
            (await this.exec({
                args: ["config", "user.email"],
                exitCodeCheck: false,
            }).catch(() => "")) || undefined;
        this.oldGitOptions.gpgKeyId =
            (await this.exec({
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
        const process = spawn("gpg", ["--import"], {
            stdio: "pipe",
        });

        process.stdin.write(key);
        process.stdin.end();

        let keyId: string | undefined;

        await new Promise<void>((resolve, reject) => {
            process.stdout.on("data", (data) => {
                const match = data.toString().match(/^gpg: key ([0-9A-F]+):/);

                if (match) {
                    keyId = match[1];
                    resolve();
                }
            });

            process.on("exit", resolve);
            process.on("error", reject);
        });

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
