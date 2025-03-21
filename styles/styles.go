package styles

import "github.com/charmbracelet/lipgloss"

var (
	BaseBlue   = lipgloss.Color("#00f5ff")
	BaseYellow = lipgloss.Color("#fcf75f")
	BaseGreen  = lipgloss.Color("#a0f077")
	BaseRed    = lipgloss.Color("#ff4d4d")

	ErrorStyle = lipgloss.NewStyle().
			Foreground(BaseRed)

	SuccessStyle = lipgloss.NewStyle().
			Foreground(BaseGreen)

	HighlightStyle = lipgloss.NewStyle().
			Foreground(BaseBlue)

	SuccessBox = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(BaseYellow).
			Padding(1, 3).
			Margin(1, 0)

	TitleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFFDF5")).
			Background(lipgloss.Color("#25A065")).
			Padding(0, 1)

	VerificationBox = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(BaseBlue).
			Padding(2, 4).
			Margin(1, 0).
			Align(lipgloss.Center)

	CodeBox = lipgloss.NewStyle().
		Border(lipgloss.ThickBorder()).
		BorderForeground(BaseYellow).
		Padding(0, 1).
		Margin(1, 0).
		Bold(true)

	FinePrint = lipgloss.NewStyle().
			Foreground(lipgloss.Color("240")).
			Italic(true).
			MarginTop(1)

	SuccessIcon = lipgloss.NewStyle().
			Foreground(BaseGreen).
			Bold(true)
)
