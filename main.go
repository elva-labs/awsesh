package main

import (
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Model states
const (
	stateSelectSSO = iota
	stateSelectAccount
	stateSessionSuccess
	stateAddSSO
	stateEditSSO
)

// Styling
var (
	basePink   = lipgloss.Color("#fea7e5")
	baseBlue   = lipgloss.Color("#00f5ff")
	baseYellow = lipgloss.Color("#fcf75f")
	baseGreen  = lipgloss.Color("#a0f077")
	baseRed    = lipgloss.Color("#ff4d4d")

	errorStyle = lipgloss.NewStyle().
			Foreground(baseRed)

	successStyle = lipgloss.NewStyle().
			Foreground(baseGreen)

	highlightStyle = lipgloss.NewStyle().
			Foreground(baseBlue)

	successBox = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(baseYellow).
			Padding(1, 3).
			Margin(1, 0)

	titleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFFDF5")).
			Background(lipgloss.Color("#25A065")).
			Padding(0, 1)

	inputStyle = lipgloss.NewStyle().
			BorderStyle(lipgloss.NormalBorder()).
			BorderForeground(lipgloss.Color("240")).
			PaddingLeft(1)
)

// Main app model
type model struct {
	state       int
	ssoProfiles []SSOProfile
	selectedSSO *SSOProfile
	accounts    []AWSAccount
	selectedAcc *AWSAccount
	ssoList     list.Model
	accountList list.Model
	spinner     spinner.Model
	width       int
	height      int

	// Form for adding/editing SSO profile
	inputs       []textinput.Model
	formError    string
	formSuccess  string
	focusIndex   int
	editingIndex int // Index of the profile being edited
}

// SSOProfile represents an AWS SSO configuration
type SSOProfile struct {
	Name            string
	StartURL        string
	Region          string
	AccountsLoading bool
}

// AWSAccount represents an AWS account accessible via SSO
type AWSAccount struct {
	Name         string
	AccountID    string
	Roles        []string
	SelectedRole string
}

// Items to display in list
type item struct {
	title       string
	description string
}

func (i item) Title() string       { return i.title }
func (i item) Description() string { return i.description }
func (i item) FilterValue() string { return i.title }

// Initialize form inputs
func initialInputs() []textinput.Model {
	inputs := make([]textinput.Model, 3)

	var t textinput.Model

	// Alias input
	t = textinput.New()
	t.Placeholder = "My Company SSO"
	t.Focus()
	t.CharLimit = 50
	t.Width = 40
	t.Prompt = "› "
	t.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	inputs[0] = t

	// Portal URL input
	t = textinput.New()
	t.Placeholder = "https://company.awsapps.com/start"
	t.CharLimit = 100
	t.Width = 40
	t.Prompt = "› "
	t.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	inputs[1] = t

	// Region input
	t = textinput.New()
	t.Placeholder = "us-east-1"
	t.CharLimit = 20
	t.Width = 40
	t.Prompt = "› "
	t.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	inputs[2] = t

	return inputs
}

// Initialize the application
func initialModel() model {
	// Mock data for SSO profiles
	ssoProfiles := []SSOProfile{
		{Name: "Company Dev", StartURL: "https://company-dev.awsapps.com/start", Region: "us-east-1"},
		{Name: "Company Prod", StartURL: "https://company-prod.awsapps.com/start", Region: "us-west-2"},
		{Name: "Personal", StartURL: "https://personal.awsapps.com/start", Region: "eu-west-1"},
	}

	// Create delegate for styling list items
	delegate := list.NewDefaultDelegate()

	// Create SSO list
	ssoItems := make([]list.Item, len(ssoProfiles))
	for i, profile := range ssoProfiles {
		ssoItems[i] = item{title: profile.Name, description: fmt.Sprintf("Region: %s", profile.Region)}
	}

	ssoList := list.New(ssoItems, delegate, 0, 0)
	ssoList.Title = "Select AWS SSO Profile"
	ssoList.AdditionalShortHelpKeys = func() []key.Binding {
		return []key.Binding{
			key.NewBinding(
				key.WithKeys("a"),
				key.WithHelp("a", "add new"),
			),
			key.NewBinding(
				key.WithKeys("e"),
				key.WithHelp("e", "edit"),
			),
			key.NewBinding(
				key.WithKeys("d"),
				key.WithHelp("d", "delete"),
			),
		}
	}

	// Empty account list (will be populated later)
	accountList := list.New([]list.Item{}, delegate, 0, 0)
	accountList.Title = "Select AWS Account"

	// Create spinner for loading states
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	return model{
		state:        stateSelectSSO,
		ssoProfiles:  ssoProfiles,
		ssoList:      ssoList,
		accountList:  accountList,
		spinner:      s,
		inputs:       initialInputs(),
		focusIndex:   0,
		editingIndex: -1,
	}
}

func (m model) Init() tea.Cmd {
	return m.spinner.Tick
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

		m.ssoList.SetWidth(msg.Width)
		m.ssoList.SetHeight(msg.Height - 4)

		m.accountList.SetWidth(msg.Width)
		m.accountList.SetHeight(msg.Height - 4)

	case tea.KeyMsg:
		// Global keybindings
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q":
			if m.state != stateAddSSO && m.state != stateEditSSO {
				return m, tea.Quit
			}
		case "esc":
			switch m.state {
			case stateSelectAccount:
				m.state = stateSelectSSO
				return m, nil
			case stateSessionSuccess:
				m.state = stateSelectAccount
				return m, nil
			case stateAddSSO, stateEditSSO:
				// Reset form
				m.inputs = initialInputs()
				m.focusIndex = 0
				m.formError = ""
				m.formSuccess = ""
				m.editingIndex = -1
				m.state = stateSelectSSO
				return m, nil
			}
		}

		// State-specific logic
		switch m.state {
		case stateSelectSSO:
			switch msg.String() {
			case "a":
				// Switch to add SSO form
				m.state = stateAddSSO
				m.formError = ""
				m.formSuccess = ""
				m.inputs = initialInputs()
				m.focusIndex = 0
				return m, nil

			case "e":
				// Edit selected SSO
				if i, ok := m.ssoList.SelectedItem().(item); ok {
					for idx, profile := range m.ssoProfiles {
						if profile.Name == i.Title() {
							// Initialize form with existing values
							m.editingIndex = idx
							m.state = stateEditSSO
							m.formError = ""
							m.formSuccess = ""
							m.inputs = initialInputs()

							// Set values from selected profile
							m.inputs[0].SetValue(profile.Name)
							m.inputs[1].SetValue(profile.StartURL)
							m.inputs[2].SetValue(profile.Region)

							m.focusIndex = 0
							return m, nil
						}
					}
				}

			case "d":
				// Delete selected SSO
				if i, ok := m.ssoList.SelectedItem().(item); ok {
					for idx, profile := range m.ssoProfiles {
						if profile.Name == i.Title() {
							// Remove the profile
							m.ssoProfiles = slices.Delete(m.ssoProfiles, idx, idx+1)

							// Update the list
							ssoItems := make([]list.Item, len(m.ssoProfiles))
							for i, profile := range m.ssoProfiles {
								ssoItems[i] = item{
									title:       profile.Name,
									description: fmt.Sprintf("Region: %s", profile.Region),
								}
							}
							m.ssoList.SetItems(ssoItems)

							return m, nil
						}
					}
				}

			case "enter":
				i, ok := m.ssoList.SelectedItem().(item)
				if ok {
					for _, profile := range m.ssoProfiles {
						if profile.Name == i.Title() {
							m.selectedSSO = &profile
							break
						}
					}

					// Mock loading accounts
					m.state = stateSelectAccount

					// Mock accounts based on the selected SSO
					m.accounts = []AWSAccount{
						{
							Name:      "Marketing Website",
							AccountID: "123456789012",
							Roles:     []string{"Developer", "ReadOnly"},
						},
						{
							Name:      "Data Analytics",
							AccountID: "234567890123",
							Roles:     []string{"Admin", "DataScientist", "ReadOnly"},
						},
						{
							Name:      "Infrastructure",
							AccountID: "345678901234",
							Roles:     []string{"DevOps", "SecurityAudit"},
						},
					}

					// Create account list items
					accountItems := make([]list.Item, len(m.accounts))
					for i, acc := range m.accounts {
						accountItems[i] = item{
							title:       acc.Name,
							description: fmt.Sprintf("Account ID: %s, Roles: %s", acc.AccountID, strings.Join(acc.Roles, ", ")),
						}
					}

					// Update account list title with breadcrumb
					m.accountList.Title = fmt.Sprintf("Select AWS Account for %s", m.selectedSSO.Name)
					m.accountList.SetItems(accountItems)
					return m, nil
				}
			}

		case stateSelectAccount:
			if msg.String() == "enter" {
				i, ok := m.accountList.SelectedItem().(item)
				if ok {
					for idx, acc := range m.accounts {
						if acc.Name == i.Title() {
							// For simplicity, we'll just select the first role
							m.accounts[idx].SelectedRole = m.accounts[idx].Roles[0]
							m.selectedAcc = &m.accounts[idx]
							break
						}
					}

					// In a real app, we'd use AWS SDK to get credentials here
					m.state = stateSessionSuccess
					return m, nil
				}
			}

		case stateAddSSO, stateEditSSO:
			switch msg.String() {
			case "tab", "shift+tab", "enter", "up", "down":
				// Handle input navigation
				if msg.String() == "enter" && m.focusIndex == len(m.inputs) {
					// Submit form
					if m.state == stateAddSSO {
						return m.handleAddFormSubmission()
					} else {
						return m.handleEditFormSubmission()
					}
				}

				// Cycle through inputs
				if msg.String() == "up" || msg.String() == "shift+tab" {
					m.focusIndex--
				} else {
					m.focusIndex++
				}

				if m.focusIndex > len(m.inputs) {
					m.focusIndex = 0
				} else if m.focusIndex < 0 {
					m.focusIndex = len(m.inputs)
				}

				// Update focus states
				for i := range m.inputs {
					if i == m.focusIndex {
						// Set focused state
						cmds = append(cmds, m.inputs[i].Focus())
					} else {
						// Remove focused state
						m.inputs[i].Blur()
					}
				}

				return m, tea.Batch(cmds...)
			}
		}
	}

	// Handle updates for the individual components based on state
	switch m.state {
	case stateSelectSSO:
		var cmd tea.Cmd
		m.ssoList, cmd = m.ssoList.Update(msg)
		cmds = append(cmds, cmd)

	case stateSelectAccount:
		var cmd tea.Cmd
		m.accountList, cmd = m.accountList.Update(msg)
		cmds = append(cmds, cmd)

	case stateSessionSuccess:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		cmds = append(cmds, cmd)

	case stateAddSSO, stateEditSSO:
		// Handle text input updates
		for i := range m.inputs {
			if i == m.focusIndex {
				var cmd tea.Cmd
				m.inputs[i], cmd = m.inputs[i].Update(msg)
				cmds = append(cmds, cmd)
			}
		}
	}

	return m, tea.Batch(cmds...)
}

func (m *model) handleAddFormSubmission() (tea.Model, tea.Cmd) {
	// Get values from inputs
	alias := strings.TrimSpace(m.inputs[0].Value())
	portalURL := strings.TrimSpace(m.inputs[1].Value())
	region := strings.TrimSpace(m.inputs[2].Value())

	// Validate inputs
	if alias == "" {
		m.formError = "Alias cannot be empty"
		return m, nil
	}

	if portalURL == "" {
		m.formError = "Portal URL cannot be empty"
		return m, nil
	}

	if !strings.HasPrefix(portalURL, "https://") || !strings.Contains(portalURL, ".awsapps.com/start") {
		m.formError = "Portal URL should be in format: https://company.awsapps.com/start"
		return m, nil
	}

	if region == "" {
		m.formError = "Region cannot be empty"
		return m, nil
	}

	// Check for duplicate alias
	for _, profile := range m.ssoProfiles {
		if profile.Name == alias {
			m.formError = "An SSO profile with this alias already exists"
			return m, nil
		}
	}

	// Create new SSO profile
	newProfile := SSOProfile{
		Name:     alias,
		StartURL: portalURL,
		Region:   region,
	}

	// Add to profiles
	m.ssoProfiles = append(m.ssoProfiles, newProfile)

	// Update SSO list
	m.updateSSOList()

	// Show success message
	m.formSuccess = "SSO profile added successfully!"
	m.formError = ""

	// Reset form
	m.inputs = initialInputs()
	m.focusIndex = 0

	return m, nil
}

func (m *model) handleEditFormSubmission() (tea.Model, tea.Cmd) {
	// Get values from inputs
	alias := strings.TrimSpace(m.inputs[0].Value())
	portalURL := strings.TrimSpace(m.inputs[1].Value())
	region := strings.TrimSpace(m.inputs[2].Value())

	// Validate inputs
	if alias == "" {
		m.formError = "Alias cannot be empty"
		return m, nil
	}

	if portalURL == "" {
		m.formError = "Portal URL cannot be empty"
		return m, nil
	}

	if !strings.HasPrefix(portalURL, "https://") || !strings.Contains(portalURL, ".awsapps.com/start") {
		m.formError = "Portal URL should be in format: https://company.awsapps.com/start"
		return m, nil
	}

	if region == "" {
		m.formError = "Region cannot be empty"
		return m, nil
	}

	// Check for duplicate alias
	for idx, profile := range m.ssoProfiles {
		if profile.Name == alias && idx != m.editingIndex {
			m.formError = "An SSO profile with this alias already exists"
			return m, nil
		}
	}

	// Update the profile
	m.ssoProfiles[m.editingIndex] = SSOProfile{
		Name:     alias,
		StartURL: portalURL,
		Region:   region,
	}

	// Update SSO list
	m.updateSSOList()

	// Show success message
	m.formSuccess = "SSO profile updated successfully!"
	m.formError = ""

	return m, nil
}

func (m *model) updateSSOList() {
	// Update SSO list items
	ssoItems := make([]list.Item, len(m.ssoProfiles))
	for i, profile := range m.ssoProfiles {
		ssoItems[i] = item{
			title:       profile.Name,
			description: fmt.Sprintf("Region: %s", profile.Region),
		}
	}
	m.ssoList.SetItems(ssoItems)
}

func (m model) View() string {
	var s string

	switch m.state {
	case stateSelectSSO:
		s = m.ssoList.View()

	case stateSelectAccount:
		s = lipgloss.JoinVertical(lipgloss.Left, m.accountList.View())

	case stateSessionSuccess:

		// Create more consistent session success view
		sessionContent := successBox.Render(
			fmt.Sprintf("%s Session activated!\n\n"+
				"Account: %s (%s)\n"+
				"Role: %s\n\n"+
				"AWS environment variables have been set.",
				m.spinner.View(),
				m.selectedAcc.Name,
				m.selectedAcc.AccountID,
				m.selectedAcc.SelectedRole))

		helpText := lipgloss.NewStyle().
			Foreground(lipgloss.Color("240")).
			Render("Press ESC to go back or q to quit")

		s = lipgloss.JoinVertical(lipgloss.Left,
			sessionContent,
			helpText,
		)

	case stateAddSSO, stateEditSSO:
		// Form view
		var formTitle string
		if m.state == stateAddSSO {
			formTitle = titleStyle.Render("Add New AWS SSO Profile")
		} else {
			formTitle = titleStyle.Render("Edit AWS SSO Profile")
		}

		// Form fields
		fields := []string{
			"Alias (friendly name):",
			"Portal URL:",
			"Default Region:",
		}

		var formContent strings.Builder

		// Add spacing
		formContent.WriteString("\n\n")

		// Render each form field
		for i, field := range fields {
			input := m.inputs[i].View()
			if i == m.focusIndex {
				formContent.WriteString(fmt.Sprintf("%s\n%s\n\n", highlightStyle.Render(field), input))
			} else {
				formContent.WriteString(fmt.Sprintf("%s\n%s\n\n", lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render(field), input))
			}
		}

		// Submit button
		button := "[ Submit ]"
		if m.focusIndex == len(m.inputs) {
			button = highlightStyle.Render("[ Submit ]")
		}
		formContent.WriteString("\n" + button + "\n\n")

		// Error or success message
		if m.formError != "" {
			formContent.WriteString("\n" + errorStyle.Render(m.formError) + "\n")
		}

		if m.formSuccess != "" {
			formContent.WriteString("\n" + successStyle.Render(m.formSuccess) + "\n")
		}

		// Help text
		formContent.WriteString("\n" + lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render("Press ESC to cancel") + "\n")

		// Combine all parts
		s = lipgloss.JoinVertical(lipgloss.Left, formTitle, formContent.String())
	}

	return s
}

func main() {
	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error running program: %v", err)
		os.Exit(1)
	}
}
