package styles

import "github.com/charmbracelet/lipgloss"

var (
	// Colors
	Primary   = lipgloss.Color("#7D56F4") // Purple
	Secondary = lipgloss.Color("#00F5FF") // Cyan
	Success   = lipgloss.Color("#00E680") // Green
	Warning   = lipgloss.Color("#FFB800") // Yellow
	Error     = lipgloss.Color("#FF4D4D") // Red
	Muted     = lipgloss.Color("#6B7280") // Gray
	Text      = lipgloss.Color("#E5E7EB") // Light Gray

	// Layout constants
	MinWidth  = 80
	MinHeight = 24
	Padding   = 1

	// Base styles
	BaseStyle = lipgloss.NewStyle().
			Foreground(Text)

	// Title styles
	TitleStyle = lipgloss.NewStyle().
			Foreground(Text).
			Background(Primary).
			Padding(0, 1).
			Bold(true)

	// Text styles
	TextStyle = lipgloss.NewStyle().
			Foreground(Text)

	MutedStyle = lipgloss.NewStyle().
			Foreground(Muted)

	// Status styles
	SuccessStyle = lipgloss.NewStyle().
			Foreground(Success)

	ErrorStyle = lipgloss.NewStyle().
			Foreground(Error)

	WarningStyle = lipgloss.NewStyle().
			Foreground(Warning)

	// Box styles
	BoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(Primary).
			Padding(1, 2).
			Margin(1, 0)

	SuccessBox = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(Success).
			Padding(1, 2).
			Margin(1, 0)

	ErrorBox = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(Error).
			Padding(1, 2).
			Margin(1, 0)

	// Code box style
	CodeBox = lipgloss.NewStyle().
		Border(lipgloss.ThickBorder()).
		BorderForeground(Secondary).
		Padding(0, 1).
		Margin(0, 0).
		Bold(true)

	// Help text style
	HelpStyle = lipgloss.NewStyle().
			Foreground(Muted).
			Italic(true).
			MarginTop(1)

	// List styles
	ListStyle = lipgloss.NewStyle().
			Padding(1, 2)

	// Form styles
	FormStyle = lipgloss.NewStyle().
			Padding(1, 2).
			Margin(1, 0)

	InputStyle = lipgloss.NewStyle().
			Foreground(Text).
			Padding(0, 1)

	FocusedInputStyle = lipgloss.NewStyle().
				Foreground(Primary).
				Padding(0, 1)

	// Button styles
	ButtonStyle = lipgloss.NewStyle().
			Foreground(Text).
			Padding(0, 1).
			Margin(1, 0)

	FocusedButtonStyle = lipgloss.NewStyle().
				Foreground(Primary).
				Padding(0, 1).
				Margin(1, 0)

	// Spinner style
	SpinnerStyle = lipgloss.NewStyle().
			Foreground(Primary)

	// Verification box style
	VerificationBox = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(Secondary).
			Padding(1, 2).
			Margin(1, 0).
			Align(lipgloss.Center)

	// Full page content style
	FullPageStyle = lipgloss.NewStyle().
			Padding(2, 4)
)
