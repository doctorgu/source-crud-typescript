# source-crud-typescript

Source manager (e.g., delete property by name searching all directory)

## install

```bash
npm install source-crud-typescript --save-dev
```

## delete by yaml config file

1. create `config.yaml` file in current directory

```yaml
root-dir:
  C:\source\your-project
patterns:
  - '^.+\.(ts|tsx|svelte|js|jsx)$'
exclude-patterns:
  - '[\\\/]rollup\..+\.js$'
  - '[\\\/](node_modules|public|dist|build)[\\\/]'
properties:
  - "'apiKey'"
  - "'auth'"
  - apiKey
  - auth
```

1. run `npx source-crud-typescript delete-properties --config config.yaml`
