; CS2 Player Tools — NSIS Installer Hooks
; Kill WireGuard processes before install to prevent file-in-use errors

!macro CUSTOM_PRE_INSTALL
  ; Kill any running WireGuard processes from our app
  nsExec::ExecToLog 'taskkill /F /IM "wireguard.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "wg.exe" /T'
  ; Stop our app if running
  nsExec::ExecToLog 'taskkill /F /IM "CS2 Player Tools.exe" /T'
  ; Small delay for processes to fully exit
  Sleep 1000
!macroend
