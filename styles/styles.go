package styles

import "github.com/charmbracelet/lipgloss/v2"

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
	MinHeight = 18
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

	PrimaryStyle = lipgloss.NewStyle().
			Foreground(Primary)

	SecondaryStyle = lipgloss.NewStyle().
			Foreground(Secondary)

	// Base box style with common properties
	baseBox = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		Padding(1).
		Margin(0)

	// Box styles
	BoxStyle = baseBox.
			BorderForeground(Primary)

	SuccessBox = baseBox.
			BorderForeground(Success)

	ErrorBox = baseBox.
			BorderForeground(Error)

	// Code box style
	CodeBox = lipgloss.NewStyle().
		Border(lipgloss.ThickBorder()).
		BorderForeground(Secondary).
		Padding(0, 1).
		Margin(0).
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
	VerificationBox = baseBox.
			BorderForeground(Secondary).
			Align(lipgloss.Center).Margin(0)

	// Full page content style
	FullPageStyle = lipgloss.NewStyle().
			Padding(2, 4)
)
