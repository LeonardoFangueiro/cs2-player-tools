fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = tauri_build::WindowsAttributes::new();
        res = res.app_manifest(include_str!("windows-manifest.xml"));
        tauri_build::Builder::default()
            .windows_attributes(res)
            .run();
    }
    #[cfg(not(target_os = "windows"))]
    {
        tauri_build::build();
    }
}
