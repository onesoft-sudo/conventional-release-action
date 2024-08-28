# Conventional Release Action

A GitHub Action to automate the conventional release workflow.

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
      - uses: actions/checkout@v4

      - uses: onesoft-sudo/conventional-release-action@v1
        id: automatic_versioning

      - uses: ncipollo/release-action@v2
        if: ${{ steps.automatic_versioning.outputs.version != '' }}
        with:
          tag: ${{ steps.automatic_versioning.outputs.version }}
          draft: false
          prerelease: false
```

## Inputs

Todo.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.<br />
This is free software: you are free to change and redistribute it. There is NO WARRANTY, to the extent permitted by law.

## Acknowledgements

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
