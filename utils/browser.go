package utils

import (
	"fmt"
	"os/exec"
	"runtime"
)

func OpenBrowser(url string) error {
	var cmd *exec.Cmd
	var err error

	switch runtime.GOOS {
	case "linux":
		for _, cmd := range []string{"xdg-open", "sensible-browser", "x-www-browser", "gnome-open", "kde-open"} {
			if _, err = exec.LookPath(cmd); err == nil {
				return exec.Command(cmd, url).Start()
			}
		}
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		return fmt.Errorf("unsupported platform")
	}

	return cmd.Start()
}
