import { getExecOutput } from "@actions/exec";
import axios from "axios";
import { unlink, writeFile } from "fs/promises";

class ChangeLogGenerator implements AsyncDisposable {
    private static readonly OSN_COMMONS_GENCHANGELOG_DL_URL =
        "https://svn.onesoftnet.eu.org/svn/osn-commons/trunk/git/genchangelog";

    public async setup() {
        const response = await axios.get(
            ChangeLogGenerator.OSN_COMMONS_GENCHANGELOG_DL_URL,
        );
        const genChangeLogScript = response.data;

        await writeFile("/tmp/genchangelog", genChangeLogScript, {
            mode: 0o755,
        });
    }

    public async generateChangeLog(
        file: string,
        format: "markdown" | "plain" = "plain",
    ) {
        const { stdout } = await getExecOutput(
            process.argv0,
            ["/tmp/genchangelog", "-f", format],
            {
                silent: true,
            },
        );

        await writeFile(file, stdout);
    }

    public async [Symbol.asyncDispose]() {
        return void (await unlink("/tmp/genchangelog"));
    }
}

export default ChangeLogGenerator;
