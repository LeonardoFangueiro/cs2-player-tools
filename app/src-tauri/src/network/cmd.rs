/// Hidden command execution — prevents console windows from flashing on Windows.
use std::process::Command;

/// Create a Command that won't show a console window on Windows.
pub fn hidden(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
