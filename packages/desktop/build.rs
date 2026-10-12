fn main() {
    #[cfg(windows)]
    {
        let manifest_dir = std::path::PathBuf::from(
            std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"),
        );
        let out = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
        let icon = manifest_dir.join("assets").join("AppIcon.ico");
        std::fs::copy(&icon, out.join("AppIcon.ico")).expect("copy icon");

        let version = std::env::var("AWSESH_RELEASE_VERSION")
            .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_string());
        let base = version.split('-').next().unwrap_or(version.as_str());
        let numeric = windows_version(base);
        let resource = out.join("resources.rc");
        std::fs::write(
            &resource,
            format!(
                r#"1 ICON "AppIcon.ico"
1 VERSIONINFO
FILEVERSION {numeric}
PRODUCTVERSION {numeric}
FILEOS 0x40004
FILETYPE 0x1
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "040904b0"
    BEGIN
      VALUE "CompanyName", "Elva Labs"
      VALUE "FileDescription", "Sesh"
      VALUE "FileVersion", "{base}"
      VALUE "InternalName", "sesh"
      VALUE "OriginalFilename", "sesh.exe"
      VALUE "ProductName", "Sesh"
      VALUE "ProductVersion", "{base}"
      VALUE "AWSESHReleaseVersion", "{version}"
    END
  END
  BLOCK "VarFileInfo"
  BEGIN
    VALUE "Translation", 0x409, 1200
  END
END
"#
            ),
        )
        .expect("write resource file");
        println!("cargo:rerun-if-env-changed=AWSESH_RELEASE_VERSION");
        println!("cargo:rerun-if-changed={}", icon.display());
        embed_resource::compile(&resource, embed_resource::NONE)
            .manifest_optional()
            .expect("compile Windows resources");
    }
}

#[cfg(windows)]
fn windows_version(base: &str) -> String {
    let segments: Vec<&str> = base.split('.').collect();
    if segments.len() != 3 {
        panic!("Version {base} is not MAJOR.MINOR.PATCH");
    }
    let mut numbers = [0u16; 3];
    for (index, segment) in segments.iter().enumerate() {
        numbers[index] = segment
            .parse::<u16>()
            .unwrap_or_else(|_| panic!("Version {base} has a component outside 0 to 65535"));
    }
    format!("{},{},{},0", numbers[0], numbers[1], numbers[2])
}
