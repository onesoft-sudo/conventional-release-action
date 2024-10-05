# Conventional Release Action

A GitHub Action to automate the conventional release workflow.

## Features

- Automatically determines the version based on the commit messages.
- Supports the [Conventional Commits](https://www.conventionalcommits.org/) specification.
- Supports the [Semantic Versioning](https://semver.org/) specification.
- Allows you to manually specify version types, build metadata, pre-release and even custom identifiers.
- Can automate the generation of ChangeLog files using [OSN Commons](https://github.com/onesoft-sudo/commons).
- Can be used to automate the creation of GitHub releases.

## Basic Usage

```yaml
name: Release

on:
  push:
    branches:
      - main

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Conventional Release Action
        id: automatic_versioning
        uses: onesoft-sudo/conventional-release-action@latest

      - name: Create Release
        uses: ncipollo/release-action@v2
        if: ${{ steps.automatic_versioning.outputs.tag != '' }}
        with:
          tag: ${{ steps.automatic_versioning.outputs.tag }}
          body: ${{ steps.automatic_versioning.outputs.release_notes }}
```

## Inputs

- `allowed-commit-types` - A comma-separated list of commit types that are allowed.
- `version-json-file` - The path to the JSON file that contains the version information.
- `version-manager-module` - The path to a commonjs module that exports a function to manage the version.
- `json-tab-width` - The number of spaces to use for indentation in the JSON file.
- `create-tag` - Whether to create a tag for the new version.
- `create-commit` - Whether to create a commit for the new version.
- `create-tag-prefix` - The prefix to use for the tag.
- `commit-message-format` - The format to use for the commit message.
- `git-path` - The path to the git executable.
- `git-user-name` - The name to use for the git user.
- `git-user-email` - The email to use for the git user.
- `git-gpg-key` - The GPG key (ASCII) to use for signing the commit.
- `git-sign-off` - Whether to sign off the commit.
- `git-push` - Whether to push the commit and tag.
- `git-push-remote` - The remote to push the commit and tag to.
- `git-push-remote-url` - The URL of the remote to push the commit and tag to.
- `git-push-branch` - The branch to push the commit and tag to.
- `metadata-file` - The path to the file that contains the metadata.
- `changelog-file` - The path to the file where the generated changelog will be written.
- `changelog-format` - The format to use for the changelog. Can be 'markdown' or 'plain'.
- `add-release-notes` - Whether to add release notes to the changelog.

> [!NOTE]
> All inputs are optional.

## Outputs

- `tag` - The tag for the new version.
- `release_notes` - The release notes for the new version.
- `version` - The new version.

> [!NOTE]  
> All of these outputs will be empty if no new version is created.

## Contributors

- [Ar Rakin](https://github.com/virtual-designer) [Maintainer]

## License

Copyright (C) 2024 OSN and the contributors.<br />

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.<br />
This is free software: you are free to change and redistribute it. There is NO WARRANTY, to the extent permitted by law.

## Acknowledgements

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
