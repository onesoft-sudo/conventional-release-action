import core from "@actions/core";
import github from "@actions/github";
import { execSync } from "child_process";

async function run() {
    console.log(JSON.stringify(github, null, 2));
    console.log(core.getInput("after"));
    console.log(core.getInput("before"));
    const commits = JSON.parse(
        "[" +
            execSync(
                `git log --pretty=format:'{"sha":"%H","message":"%s"},' ${""}`,
            )
                .toString()
                .slice(0, -1) +
            "]",
    );

    if (commits.length > 0) {
        const firstCommit = commits[0];
        const lastCommit = commits[commits.length - 1];

        for (const commit of commits) {
            console.log(`Commit: ${commit.sha} - ${commit.message}`);
        }
    } else {
        console.log("No commits found.");
    }
}

run()
    .then()
    .catch((error) => core.setFailed(error));
