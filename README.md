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
        uses: onesoft-sudo/conventional-release-action@v1

      - name: Create Release
        uses: ncipollo/release-action@v2
        if: ${{ steps.automatic_versioning.outputs.version != '' }}
        with:
          tag: ${{ steps.automatic_versioning.outputs.version }}
          draft: false
          prerelease: false
```

## Inputs

Todo.

## License

Copyright (C) 2024 OSN and the contributors.<br />

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.<br />
This is free software: you are free to change and redistribute it. There is NO WARRANTY, to the extent permitted by law.

## Acknowledgements

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
