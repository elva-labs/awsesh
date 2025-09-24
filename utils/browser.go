package utils

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

func isWSL() bool {
	if runtime.GOOS != "linux" {
		return false
	}

	// Check /proc/version for WSL
	if data, err := os.ReadFile("/proc/version"); err == nil {
		return strings.Contains(strings.ToLower(string(data)), "wsl")
	}

	return false
}

func OpenBrowser(url string) error {
	var cmd *exec.Cmd
	var err error

	switch runtime.GOOS {
	case "linux":
		if isWSL() {
			// Use Windows default browser via cmd.exe start
			return exec.Command("cmd.exe", "/c", "start", url).Start()
		}

		// Regular Linux
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
