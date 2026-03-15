# Building CS2 Player Tools

## Prerequisites (Windows)
- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) (v22+)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with C++ workload

## Build
```bash
cd app
npm install
npm run tauri build
```

## Output
- MSI installer: `app/src-tauri/target/release/bundle/msi/CS2 Player Tools_0.1.0_x64_en-US.msi`
- NSIS installer: `app/src-tauri/target/release/bundle/nsis/CS2 Player Tools_0.1.0_x64-setup.exe`

## Development
```bash
cd app
npm run tauri dev
```

## GitHub Actions
Push a tag `v*` to trigger automated Windows build, or use "Run workflow" in the Actions tab.
